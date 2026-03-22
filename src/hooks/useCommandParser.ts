import React from 'react';
import {
  Profile, Npc, Quest, LorebookEntry, MemoryEntry,
  EquipmentItem, ItemEntry, TimeState, Message,
} from '../types';

// ─── 依賴的 Store 切面 ────────────────────────────────────────────────────────
export interface CommandParserDeps {
  // 讀取
  timeState: TimeState;
  currentLocation: string;
  quests: Quest[];
  memories: MemoryEntry[];
  items: ItemEntry[];
  stickyCounters: Record<string, number>;
  cooldownCounters: Record<string, number>;
  messages: Message[];
  lorebookEntries: LorebookEntry[];
  // 寫入
  setTimeState: React.Dispatch<React.SetStateAction<TimeState>>;
  setProfile: React.Dispatch<React.SetStateAction<Profile>>;
  setCurrentLocation: React.Dispatch<React.SetStateAction<string>>;
  setQuests: React.Dispatch<React.SetStateAction<Quest[]>>;
  setMemories: React.Dispatch<React.SetStateAction<MemoryEntry[]>>;
  setEquipment: React.Dispatch<React.SetStateAction<EquipmentItem[]>>;
  setItems: React.Dispatch<React.SetStateAction<ItemEntry[]>>;
  setNpcs: React.Dispatch<React.SetStateAction<Npc[]>>;
  setLorebookEntries: React.Dispatch<React.SetStateAction<LorebookEntry[]>>;
  setQuickOptions: React.Dispatch<React.SetStateAction<string[]>>;
  setStickyCounters: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  setCooldownCounters: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  // UI 回呼
  showToast: (msg: string) => void;
  notifyCommandResult: (messages: string[]) => void;
  onNewQuest?: () => void;
  callAI: (prompt: string) => Promise<string>;
}

// ─── 回傳型別 ─────────────────────────────────────────────────────────────────
export interface ParseResult {
  narrative: string;
  newItems: string[];   // 本回合新增的道具名稱清單（供助理 GM 分類用）
}

export function useCommandParser(deps: CommandParserDeps) {
  const {
    timeState, currentLocation, quests, memories, items,
    stickyCounters, cooldownCounters, messages, lorebookEntries,
    setTimeState, setProfile, setCurrentLocation, setQuests,
    setMemories, setEquipment, setItems, setNpcs,
    setLorebookEntries, setQuickOptions,
    setStickyCounters, setCooldownCounters,
    showToast, notifyCommandResult, onNewQuest, callAI,
  } = deps;

  // ─── 記憶觸發判斷 ─────────────────────────────────────────────────────────
  const isMemoryTriggered = (mem: MemoryEntry, userInput: string, location: string): boolean => {
    if (!mem.isActive) return false;

    // 過期判斷
    if (mem.expiresAt) {
      const parts = mem.expiresAt.split('/');
      if (parts.length === 2) {
        const expMonth = parseInt(parts[0]);
        const expDay = parseInt(parts[1]);
        const currentTotalMins = timeState.month * 30 + timeState.day;
        const expTotalMins = expMonth * 30 + expDay;
        if (currentTotalMins > expTotalMins) return false;
      }
    }

    // sticky/cooldown 計數器
    if (cooldownCounters[mem.id] > 0) return false;
    if (stickyCounters[mem.id] > 0) return true;

    // 地點比對
    const locTags = mem.tags?.locations || [];
    if (locTags.length > 0 && !locTags.some(l => location.includes(l) || l.includes(location))) {
      return false;
    }

    // 關鍵字比對
    const kwTags = mem.tags?.keywords || [];
    const scanText = messages.slice(-(mem.trigger?.scanDepth ?? 5)).map(m => m.text).join(' ')
      + ' ' + userInput + ' ' + location;
    if (kwTags.length > 0 && !kwTags.some(k => scanText.toLowerCase().includes(k.toLowerCase()))) {
      return false;
    }

    // 確率
    const prob = mem.trigger?.probability ?? 100;
    return Math.random() * 100 < prob;
  };

  // ─── 記憶計數器更新 ───────────────────────────────────────────────────────
  const tickMemoryCounters = (triggeredIds: string[]) => {
    // 先計算哪些 id 的 sticky 歸零後需要進入 cooldown
    const newCooldowns: Record<string, number> = {};

    setStickyCounters(prev => {
      const next = { ...prev };
      triggeredIds.forEach(id => {
        const mem = memories.find(m => m.id === id);
        const sticky = mem?.trigger?.sticky ?? 0;
        if (sticky > 0) next[id] = sticky;
      });
      Object.keys(next).forEach(id => {
        if (!triggeredIds.includes(id) && next[id] > 0) {
          next[id] -= 1;
          if (next[id] === 0) {
            const mem = memories.find(m => m.id === id);
            const cd = mem?.trigger?.cooldown ?? 0;
            if (cd > 0) {
              newCooldowns[id] = cd;
            }
          }
        }
      });
      return Object.fromEntries(Object.entries(next).filter(([, v]) => v > 0));
    });
    setCooldownCounters(prev => {
      const next = { ...prev, ...newCooldowns };
      Object.keys(prev).forEach(id => {
        if (next[id] > 0 && !newCooldowns[id]) next[id] -= 1;
      });
      return Object.fromEntries(Object.entries(next).filter(([, v]) => v > 0));
    });
  };

  // ─── 道具使用（只扣數量，效果由 AI 敘事）────────────────────────────────
  const useItem = (itemName: string): boolean => {
    const item = items.find(i => i.name === itemName);
    if (!item) return false;
    setItems(prev =>
      prev
        .map(i => i.name === itemName ? { ...i, quantity: i.quantity - 1 } : i)
        .filter(i => i.quantity > 0)
    );
    showToast(`🎒 使用了 ${itemName}`);
    return true;
  };

  // ─── 關鍵字掃描（日記觸發用）────────────────────────────────────────────
  const scanKeywords = (keywords: string[]): boolean => {
    if (keywords.length === 0) return true;
    const recentText = messages.slice(-5).map(m => m.text).join(' ').toLowerCase();
    return keywords.some(k => recentText.includes(k.toLowerCase()));
  };

  // ─── NPC 記憶 AI 融合 ────────────────────────────────────────────────────
  const triggerNpcMemoryMerge = async (
    npcId: number,
    currentMemories: Array<{ id: string; text: string; isMerged?: boolean; [key: string]: unknown }>,
    npcName: string,
  ) => {
    const toMerge = currentMemories.filter(m => !m.isMerged);
    if (toMerge.length === 0) return;

    const mergePrompt = `你是一個 RPG 遊戲的記憶整理助理。
以下是 NPC「${npcName}」對玩家的記憶片段，請整合成一段簡潔的第一人稱摘要（100字以內）。
重要：保留道具名稱、重要台詞、關鍵事件，壓縮重複情緒。
只輸出摘要文字，不要任何前綴或說明。

記憶片段：
${toMerge.map(m => `- ${m.text}`).join('\n')}`;

    try {
      const mergedText = await callAI(mergePrompt);
      if (!mergedText) return;

      const mergedMemory = {
        id: `nmem_${Date.now()}_${Math.floor(Math.random() * 9999)}`,
        text: mergedText,
        createdAt: `${timeState.month}/${timeState.day}`,
        source: 'merged' as const,
        importance: 'normal' as const,
        isMerged: false,
        isNew: true,
        mergedFrom: toMerge.map(m => m.id),
      };

      setNpcs(prev => prev.map(npc => {
        if (npc.id !== npcId) return npc;
        const updatedMemories = npc.memories.map(m =>
          toMerge.some(tm => tm.id === m.id) ? { ...m, isMerged: true } : m
        );
        return { ...npc, memories: [...updatedMemories, mergedMemory] };
      }));

      showToast(`💫 ${npcName} 的記憶已自動整合`);
    } catch (e) {
      console.error('NPC memory merge failed:', e);
    }
  };

  // ─── 前端 COMMANDS 解析器 ──────────────────────────────────────────────────
  const parseAndExecuteCommands = (rawText: string): ParseResult => {
    const commandBlockRegex = /<<COMMANDS>>([\s\S]*?)(?:<<\/COMMANDS>>|<\/COMMANDS>>|<\/COMMANDS>|(?=\n\n)|(?=<<OPTIONS>>)|$)/gi;
    const optionsBlockRegex = /<<OPTIONS>>([\s\S]*?)(?:<<\/OPTIONS>>|<\/OPTIONS>>|<\/OPTIONS>|$)/gi;
    let narrative = rawText;
    let commandsFound = false;
    let optionsFound = false;

    // ── COMMANDS 區塊 ───────────────────────────────────────────────────────
    const allCommands: string[] = [];
    let match;
    while ((match = commandBlockRegex.exec(narrative)) !== null) {
      commandsFound = true;
      const lines = match[1].split('\n').map((l: string) => l.trim()).filter(Boolean);
      allCommands.push(...lines);
    }
    if (commandsFound) {
      narrative = narrative.replace(/<<COMMANDS>>[\s\S]*?(?:<<\/COMMANDS>>|<\/COMMANDS>>|<\/COMMANDS>|(?=\n\n)|(?=<<OPTIONS>>)|$)/gi, '').trim();
    }

    // ── OPTIONS 區塊 ────────────────────────────────────────────────────────
    const allOptions: string[] = [];
    let optMatch;
    while ((optMatch = optionsBlockRegex.exec(narrative)) !== null) {
      optionsFound = true;
      const lines = optMatch[1]
        .split('\n')
        .map((l: string) => l.replace(/^[\d.\-*\s]+/, '').trim())
        .filter(Boolean);
      allOptions.push(...lines);
    }
    if (optionsFound) {
      narrative = narrative.replace(/<<OPTIONS>>[\s\S]*?(?:<<\/OPTIONS>>|<\/OPTIONS>>|<\/OPTIONS>|$)/gi, '').trim();
      setQuickOptions(allOptions.length > 0 ? allOptions : ['觀察四周', '檢查自己', '大聲求助']);
    } else {
      setQuickOptions(['觀察四周', '檢查自己', '大聲求助']);
    }

    // ── Fallback：掃描散落在敘事中的裸指令（AI 未包在 <<COMMANDS>> 內的情況）──
    const bareCommandPattern = /^(HP:[+-]\d+|MP:[+-]\d+|GOLD:[+-]\d+|AFFINITY:.+:[+-]\d+|LOCATION:.+|TIME:\+\d+[hm]|ITEM_ADD:.+|ITEM_REMOVE:.+:\d+|ITEM_USE:.+|NPC_NEW:.+|NPC_HOME:.+:.+|NPC_LOCATION:.+:.+|NPC_THOUGHT:.+:.+|NPC_RELATIONSHIP:.+:.+|QUEST_ADD:.+|QUEST_GOAL_MET:.+|QUEST_COMPLETE:.+|MEMORY_ADD:.+|LOCATION_DISCOVER:.+)$/im;
    const narrativeLines = narrative.split('\n');
    const bareCommands: string[] = [];
    const cleanLines: string[] = [];
    for (const line of narrativeLines) {
      const trimmed = line.trim().replace(/^<<|>>$/g, '');
      if (bareCommandPattern.test(trimmed)) {
        bareCommands.push(trimmed);
      } else {
        cleanLines.push(line);
      }
    }
    if (bareCommands.length > 0) {
      allCommands.push(...bareCommands);
      narrative = cleanLines.join('\n').trim();
    }

    if (allCommands.length === 0) {
      return { narrative: narrative.replace(/```[a-z]*\s*```/gi, '').trim(), newItems: [] };
    }

    // ── 收集數值增量，最後一次性套用 ───────────────────────────────────────
    let hpDelta = 0;
    let mpDelta = 0;
    let goldDelta = 0;
    let timeDeltaMinutes = 0;
    const affinityUpdates: { name: string; delta: number }[] = [];
    const cmdResults: string[] = [];
    const newItemNames: string[] = [];  // 本回合新增的道具名稱

    for (const cmd of allCommands) {
      // HP / MP / GOLD
      const hpMatch = cmd.match(/^HP:([+-]\d+)$/i);
      if (hpMatch) { hpDelta += parseInt(hpMatch[1]); continue; }

      const mpMatch = cmd.match(/^MP:([+-]\d+)$/i);
      if (mpMatch) { mpDelta += parseInt(mpMatch[1]); continue; }

      const goldMatch = cmd.match(/^GOLD:([+-]\d+)$/i);
      if (goldMatch) { goldDelta += parseInt(goldMatch[1]); continue; }

      // AFFINITY
      const affinityMatch = cmd.match(/^AFFINITY:(.+):([+-]\d+)$/i);
      if (affinityMatch) {
        affinityUpdates.push({ name: affinityMatch[1].trim(), delta: parseInt(affinityMatch[2]) });
        continue;
      }

      // LOCATION
      const locationMatch = cmd.match(/^LOCATION:(.+)$/i);
      if (locationMatch) {
        const newLoc = locationMatch[1].trim();
        setCurrentLocation(newLoc);
        cmdResults.push(`📍 移動至 ${newLoc}`);
        continue;
      }

      // TIME（累加，最後一次性套用）
      const timeMatch = cmd.match(/^TIME:\+(\d+)(h|m)$/i);
      if (timeMatch) {
        const amount = parseInt(timeMatch[1]);
        const unit = timeMatch[2].toLowerCase();
        timeDeltaMinutes += unit === 'h' ? amount * 60 : amount;
        continue;
      }

      // ITEM_ADD：全部進道具欄（items），等助理 GM 分類後再移至裝備欄
      if (cmd.toUpperCase().startsWith('ITEM_ADD:')) {
        const rawParts = cmd.slice('ITEM_ADD:'.length).split(':');
        const itemName = rawParts[0]?.trim() || '';
        const qty = parseInt(rawParts[1] || '1') || 1;
        // 從第 2 個 part 開始全部合併為 description（移除 effect 解析）
        const desc = rawParts.slice(2).join(':').trim();

        if (itemName) {
          setItems(prev => {
            const exists = prev.find(i => i.name === itemName);
            if (exists) {
              return prev.map(i =>
                i.name === itemName
                  ? { ...i, quantity: i.quantity + qty, description: desc || i.description }
                  : i
              );
            }
            return [...prev, { id: Date.now() + Math.floor(Math.random() * 999), name: itemName, quantity: qty, description: desc }];
          });
          cmdResults.push(`🎒 獲得 ${itemName} x${qty}`);
          newItemNames.push(itemName);  // 記錄本回合新增的道具
        }
        continue;
      }

      // ITEM_REMOVE：先查道具欄，再查裝備欄
      const itemRemoveMatch = cmd.match(/^ITEM_REMOVE:(.+):(\d+)$/i);
      if (itemRemoveMatch) {
        const [, name, qty] = itemRemoveMatch;
        const trimName = name.trim();
        const removeQty = parseInt(qty);

        // 先檢查道具欄
        setItems(prev => {
          const exists = prev.find(i => i.name === trimName);
          if (!exists) return prev;
          return prev
            .map(i => i.name === trimName ? { ...i, quantity: i.quantity - removeQty } : i)
            .filter(i => i.quantity > 0);
        });
        // 再檢查裝備欄（裝備通常數量為 1，直接移除）
        setEquipment(prev => prev.filter(i => i.name !== trimName));
        continue;
      }

      // ITEM_USE：只扣數量，Toast 顯示名稱，AI 接劇情
      const itemUseMatch = cmd.match(/^ITEM_USE:(.+)$/i);
      if (itemUseMatch) {
        useItem(itemUseMatch[1].trim());
        continue;
      }

      // MEMORY_ADD
      const memAddMatch = cmd.match(/^MEMORY_ADD:(world|region|scene|npc):(.+)$/i);
      if (memAddMatch) {
        const [, rawType, rest] = memAddMatch;
        const parts = rest.split(':');
        const importancePat = /^(critical|normal|flavor)$/i;
        let importance = 'normal';
        let contentStart = 0;
        if (importancePat.test(parts[0])) {
          importance = parts[0].toLowerCase();
          contentStart = 1;
        }
        let optStart = parts.findIndex((p, i) => i > contentStart && p.includes('='));
        if (optStart === -1) optStart = parts.length;
        const contentStr = parts.slice(contentStart, optStart).join(':').trim();
        const optParts = parts.slice(optStart);
        const getOpt = (key: string) => {
          const found = optParts.find(p => p.toLowerCase().startsWith(key + '='));
          return found ? found.split('=')[1] : '';
        };
        const loc = getOpt('locations') || getOpt('location');
        const locations = loc
          ? loc.split(',').map(s => s.trim()).filter(Boolean)
          : (rawType === 'scene' || rawType === 'region') ? [currentLocation] : [];
        const npcTags = (getOpt('npcs') || getOpt('npc')).split(',').map(s => s.trim()).filter(Boolean);
        const factionTags = (getOpt('factions') || getOpt('faction')).split(',').map(s => s.trim()).filter(Boolean);
        const keywordTags = (getOpt('keywords') || getOpt('keyword')).split(',').map(s => s.trim()).filter(Boolean);
        const sticky = parseInt(getOpt('sticky') || '0');
        const expires = getOpt('expires') || undefined;
        const finalLocations = locations.length > 0 ? locations
          : (rawType === 'scene' || rawType === 'region') ? [currentLocation] : [];

        const newMem: MemoryEntry = {
          id: `mem_${Date.now()}_${Math.floor(Math.random() * 9999)}`,
          type: rawType.toLowerCase() as MemoryEntry['type'],
          importance: importance as MemoryEntry['importance'],
          content: contentStr,
          tags: { locations: finalLocations, npcs: npcTags, factions: factionTags, keywords: keywordTags },
          trigger: { scanDepth: 5, probability: 100, sticky, cooldown: 0 },
          isActive: true,
          source: 'ai_generated',
          createdAt: `帝國曆 ${timeState.year}年${timeState.month}月${timeState.day}日`,
          ...(expires ? { expiresAt: expires } : {}),
        };
        setMemories(prev => [...prev, newMem]);
        cmdResults.push(`📝 新增${rawType === 'world' ? '世界' : rawType === 'region' ? '區域' : rawType === 'scene' ? '場景' : 'NPC'}記憶`);
        continue;
      }

      // QUEST_ADD
      if (cmd.toUpperCase().startsWith('QUEST_ADD:')) {
        const parts = cmd.slice('QUEST_ADD:'.length).split(':');
        const title = parts[0]?.trim() || '';
        const giver = parts[1]?.trim() || '';
        const description = parts[2]?.trim() || '';
        const rewardGold = parseInt(parts[3] || '') || 0;
        const rewardItemsStr = parts[4]?.trim() || '';
        const deadlineDays = parseInt(parts[5] || '') || undefined;
        const rewardItems = rewardItemsStr ? rewardItemsStr.split(',').map(s => s.trim()).filter(Boolean) : [];
        if (title) {
          const createdAtTotalDays = timeState.year * 360 + (timeState.month - 1) * 30 + timeState.day;
          setQuests(prev => {
            if (prev.some(q => q.title === title)) return prev;
            return [...prev, {
              id: `quest_${Date.now()}_${Math.floor(Math.random() * 9999)}`,
              title, giver, description,
              reward: {
                ...(rewardGold > 0 ? { gold: rewardGold } : {}),
                ...(rewardItems.length > 0 ? { items: rewardItems } : {}),
              },
              ...(deadlineDays ? { deadline: deadlineDays } : {}),
              status: 'active' as const,
              isGoalMet: false,
              createdAt: `${timeState.month}/${timeState.day}`,
              createdAtTotalDays,
            }];
          });
          cmdResults.push(`📋 新任務：${title}`);
          onNewQuest?.();
        }
        continue;
      }

      // QUEST_GOAL_MET
      const questGoalMetMatch = cmd.match(/^QUEST_GOAL_MET:(.+)$/i);
      if (questGoalMetMatch) {
        const titleTrimmed = questGoalMetMatch[1].trim();
        const quest = quests.find(q => q.title === titleTrimmed && q.status === 'active' && !q.isGoalMet);
        if (quest) {
          setQuests(prev => prev.map(q =>
            q.title === titleTrimmed && q.status === 'active'
              ? { ...q, isGoalMet: true }
              : q
          ));
          cmdResults.push(`🎯 任務目標達成：${titleTrimmed}（請向委託人回報）`);
        }
        continue;
      }

      // QUEST_COMPLETE
      const questCompleteMatch = cmd.match(/^QUEST_COMPLETE:(.+)$/i);
      if (questCompleteMatch) {
        const titleTrimmed = questCompleteMatch[1].trim();
        const quest = quests.find(q => q.title === titleTrimmed && q.status === 'active');
        if (quest) {
          // 發放獎勵
          if (quest.reward?.gold && quest.reward.gold > 0) {
            goldDelta += quest.reward.gold;
          }
          if (quest.reward?.items && quest.reward.items.length > 0) {
            quest.reward.items.forEach(itemName => {
              setItems(prev => {
                const exists = prev.find(i => i.name === itemName);
                if (exists) return prev.map(i => i.name === itemName ? { ...i, quantity: i.quantity + 1 } : i);
                return [...prev, { id: Date.now() + Math.floor(Math.random() * 999), name: itemName, quantity: 1, description: '' }];
              });
              newItemNames.push(itemName);
            });
          }
          setQuests(prev => prev.map(q =>
            q.title === titleTrimmed && q.status === 'active'
              ? { ...q, status: 'completed' as const, completedAt: `${timeState.month}/${timeState.day}` }
              : q
          ));
          cmdResults.push(`✅ 任務完成：${titleTrimmed}`);
        }
        continue;
      }

      // NPC_THOUGHT
      const npcThoughtMatch = cmd.match(/^NPC_THOUGHT:(.+):(.+)$/i);
      if (npcThoughtMatch) {
        const [, name, text] = npcThoughtMatch;
        const THOUGHTS_LIMIT = 10;
        const MEMORIES_MERGE_THRESHOLD = 8;

        setNpcs(prev => prev.map(npc => {
          if (!(npc.name.includes(name.trim()) || name.trim().includes(npc.name))) return npc;

          const newThought = { text: text.trim(), createdAt: `${timeState.month}/${timeState.day}` };
          const updatedThoughts = [newThought, ...(npc.thoughts || [])];

          if (updatedThoughts.length < THOUGHTS_LIMIT) {
            return { ...npc, thoughts: updatedThoughts };
          }

          // thoughts 滿 10 則：串接寫入 memories，清空 thoughts
          const mergedText = [...updatedThoughts]
            .reverse()
            .map(t => `[${t.createdAt}] ${t.text}`)
            .join('；');

          const newMemory = {
            id: `nmem_${Date.now()}_${Math.floor(Math.random() * 9999)}`,
            text: mergedText,
            createdAt: `${timeState.month}/${timeState.day}`,
            source: 'pre_merge' as const,
            importance: 'normal' as const,
            isMerged: false,
            isNew: true,
          };

          const updatedMemories = [...(npc.memories || []), newMemory];
          const unmergedCount = updatedMemories.filter(m => !m.isMerged).length;
          if (unmergedCount > MEMORIES_MERGE_THRESHOLD) {
            triggerNpcMemoryMerge(npc.id, updatedMemories, npc.name);
          }

          return { ...npc, thoughts: [], memories: updatedMemories };
        }));
        continue;
      }

      // NPC_RELATIONSHIP
      const npcRelationMatch = cmd.match(/^NPC_RELATIONSHIP:(.+):(.+)$/i);
      if (npcRelationMatch) {
        const [, name, relation] = npcRelationMatch;
        setNpcs(prev => prev.map(npc =>
          (npc.name.includes(name.trim()) || name.trim().includes(npc.name))
            ? { ...npc, relationship: relation.trim() }
            : npc
        ));
        continue;
      }

      // NPC_NEW:姓名:種族:性別:年齡:職業:外貌:性格:背景故事（50字以內，選填）
      const npcNewMatch = cmd.match(/^NPC_NEW:([^:]+):([^:]+):([^:]+):([^:]+):([^:]+):([^:]+):([^:]+)(?::(.+))?$/i);
      if (npcNewMatch) {
        const [, npcName, race, gender, age, job, appearance, personality, backstory] = npcNewMatch.map(s => s?.trim());
        const newId = Date.now();
        setLorebookEntries(prev => {
          if (prev.some(e => e.title === npcName && e.category === 'NPC')) return prev;
          return [...prev, {
            id: newId, title: npcName, content: '', category: 'NPC', isActive: true,
            gender, race, age, backstory, job, appearance, personality, other: '',
            keywords: [npcName], selective: false, secondaryKeys: [], insertionOrder: 100,
            homeLocation: '', roamLocations: [],
          }];
        });
        setNpcs(prev => {
          if (prev.some(n => n.name === npcName)) return prev;
          return [...prev, {
            id: newId + 1, name: npcName, job, affection: 0, affectionLabel: '陌生人',
            appearance, personality, gender, race, age, backstory,
            category: 'NPC', isActive: true, isPinned: false, memories: [], thoughts: [],
            location: currentLocation, lastSeenLocation: currentLocation,
          }];
        });
        showToast(`📝 新增 NPC：${npcName}`);
        continue;
      }

      // NPC_HOME:姓名:地點
      const npcHomeMatch = cmd.match(/^NPC_HOME:([^:]+):(.+)$/i);
      if (npcHomeMatch) {
        const [, name, location] = npcHomeMatch.map(s => s.trim());
        setLorebookEntries(prev => prev.map(e =>
          (e.category === 'NPC' && (e.title.includes(name) || name.includes(e.title)) && !e.homeLocation)
            ? { ...e, homeLocation: location }
            : e
        ));
        continue;
      }

      // NPC_LOCATION:姓名:地點
      const npcLocationMatch = cmd.match(/^NPC_LOCATION:([^:]+):(.+)$/i);
      if (npcLocationMatch) {
        const [, name, location] = npcLocationMatch.map(s => s.trim());
        setLorebookEntries(prev => prev.map(e => {
          if (!(e.category === 'NPC' && (e.title.includes(name) || name.includes(e.title)))) return e;
          if (e.homeLocation === location) return e;
          const roam = [location, ...(e.roamLocations || []).filter(l => l !== location)].slice(0, 3);
          return { ...e, roamLocations: roam };
        }));
        setNpcs(prev => prev.map(npc =>
          (npc.name.includes(name) || name.includes(npc.name))
            ? { ...npc, location: location, lastSeenLocation: location }
            : npc
        ));
        continue;
      }

      // LOCATION_DISCOVER:地點名稱:x:y
      const locDiscoverMatch = cmd.match(/^LOCATION_DISCOVER:([^:]+):(-?\d+):(-?\d+)$/i);
      if (locDiscoverMatch) {
        const locName = locDiscoverMatch[1].trim();
        const mapX = parseInt(locDiscoverMatch[2], 10);
        const mapY = parseInt(locDiscoverMatch[3], 10);

        const inferLocationType = (name: string): 'town' | 'wilderness' | 'building' => {
          if (/館|店|坊|院|殿|堂|所|塔|屋|宅|公寓|廢墟|遺址|驛站|市集|詩社|花園/.test(name)) return 'building';
          if (/鎮|城|村|市|港|聚落|街/.test(name)) return 'town';
          return 'wilderness';
        };

        const existing = lorebookEntries.find(e =>
          e.category === '地點' && (e.title.includes(locName) || locName.includes(e.title))
        );
        if (existing) {
          setLorebookEntries(prev => prev.map(e =>
            e.category === '地點' && (e.title.includes(locName) || locName.includes(e.title))
              ? { ...e, mapStatus: 'known' as const }
              : e
          ));
        } else {
          setLorebookEntries(prev => [...prev, {
            id: Date.now(),
            title: locName,
            content: '',
            category: '地點',
            isActive: true,
            mapX,
            mapY,
            mapStatus: 'heard' as const,
            locationType: inferLocationType(locName),
            keywords: [locName],
            selective: false,
            secondaryKeys: [],
            insertionOrder: 100,
          }]);
        }
        cmdResults.push(`🗺️ 發現新地點：${locName}`);
        continue;
      }
    } // end for

    // ── 一次性套用數值 ──────────────────────────────────────────────────────
    if (timeDeltaMinutes > 0) {
      setTimeState(prev => {
        let totalMinutes = prev.hour * 60 + prev.minute + timeDeltaMinutes;
        let extraDays = Math.floor(totalMinutes / (24 * 60));
        totalMinutes = totalMinutes % (24 * 60);
        const newHour = Math.floor(totalMinutes / 60);
        const newMinute = totalMinutes % 60;

        let day = prev.day + extraDays;
        let month = prev.month;
        let year = prev.year;
        while (day > 30) { day -= 30; month++; }
        while (month > 12) { month -= 12; year++; }

        // 任務逾期判斷
        const newTotalDays = year * 360 + (month - 1) * 30 + day;
        setQuests(prevQ => prevQ.map(q => {
          if (q.status !== 'active' || !q.deadline) return q;
          const daysElapsed = newTotalDays - q.createdAtTotalDays;
          if (daysElapsed >= q.deadline) {
            cmdResults.push(`⏰ 任務逾期：${q.title}`);
            return { ...q, status: 'failed' as const };
          }
          return q;
        }));

        return { ...prev, hour: newHour, minute: newMinute, day, month, year };
      });
    }

    if (hpDelta !== 0 || mpDelta !== 0 || goldDelta !== 0) {
      setProfile(prev => {
        const newHp = Math.max(0, prev.hp + hpDelta);
        const newMp = Math.max(0, prev.mp + mpDelta);
        const newGold = Math.max(0, prev.gold + goldDelta);
        if (hpDelta !== 0) cmdResults.push(hpDelta > 0 ? `❤️ HP +${hpDelta}` : `💔 HP ${hpDelta}`);
        if (mpDelta !== 0) cmdResults.push(mpDelta > 0 ? `💙 MP +${mpDelta}` : `💙 MP ${mpDelta}`);
        if (goldDelta !== 0) cmdResults.push(goldDelta > 0 ? `🪙 +${goldDelta} G` : `🪙 ${goldDelta} G`);
        if (newHp === 0) cmdResults.push('💀 HP 歸零！');
        return { ...prev, hp: newHp, mp: newMp, gold: newGold };
      });
    }

    if (affinityUpdates.length > 0) {
      setNpcs(prev => prev.map(npc => {
        const update = affinityUpdates.find(u =>
          npc.name.includes(u.name) || u.name.includes(npc.name)
        );
        if (!update) return npc;
        const newAffinity = Math.max(-100, Math.min(100, npc.affection + update.delta));
        cmdResults.push(`${update.delta > 0 ? '💛' : '🖤'} ${npc.name} 好感度 ${update.delta > 0 ? '+' : ''}${update.delta}`);
        return { ...npc, affection: newAffinity };
      }));
    }

    if (cmdResults.length > 0) {
      notifyCommandResult(cmdResults);
    }

    return {
      narrative: narrative.replace(/```[a-z]*\s*```/gi, '').trim(),
      newItems: newItemNames,
    };
  };

  return {
    parseAndExecuteCommands,
    useItem,
    scanKeywords,
    isMemoryTriggered,
    tickMemoryCounters,
  };
}
