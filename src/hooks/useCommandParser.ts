import React from 'react';
import {
  Profile, Npc, Quest, LorebookEntry, MemoryEntry,
  InventoryItem, ConsumableItem, TimeState, WorldMap, Message,
} from '../types';

// ─── 依賴的 Store 切面 ────────────────────────────────────────────────────────
export interface CommandParserDeps {
  // 讀取
  timeState: TimeState;
  currentLocation: string;
  quests: Quest[];
  memories: MemoryEntry[];
  consumables: ConsumableItem[];
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
  setInventory: React.Dispatch<React.SetStateAction<InventoryItem[]>>;
  setConsumables: React.Dispatch<React.SetStateAction<ConsumableItem[]>>;
  setNpcs: React.Dispatch<React.SetStateAction<Npc[]>>;
  setLorebookEntries: React.Dispatch<React.SetStateAction<LorebookEntry[]>>;
  setWorldMap: React.Dispatch<React.SetStateAction<WorldMap>>;
  setQuickOptions: React.Dispatch<React.SetStateAction<string[]>>;
  setStickyCounters: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  setCooldownCounters: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  // UI 回呼
  showToast: (msg: string) => void;
  notifyCommandResult: (messages: string[]) => void;
  onNewQuest?: () => void;     // 新任務時開啟 QuestModal
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useCommandParser(deps: CommandParserDeps) {
  const {
    timeState, currentLocation, quests, memories, consumables,
    stickyCounters, cooldownCounters, messages, lorebookEntries,
    setTimeState, setProfile, setCurrentLocation, setQuests,
    setMemories, setInventory, setConsumables, setNpcs,
    setLorebookEntries, setWorldMap, setQuickOptions,
    setStickyCounters, setCooldownCounters,
    showToast, notifyCommandResult, onNewQuest,
  } = deps;

  // ─── 關鍵字掃描 ────────────────────────────────────────────────────────────
  const scanKeywords = (keywords: string[], scanDepth = 5, extraText = ''): boolean => {
    if (!keywords || keywords.length === 0) return true;
    const recentTexts = messages
      .slice(-scanDepth)
      .map(m => m.text.toLowerCase())
      .join(' ') + ' ' + extraText.toLowerCase();
    return keywords.some(kw => recentTexts.includes(kw.toLowerCase()));
  };

  // ─── 記憶觸發判斷 ──────────────────────────────────────────────────────────
  const isMemoryTriggered = (mem: MemoryEntry, userInput = '', currentLocation = ''): boolean => {
    if (!mem.isActive) return false;
    if ((cooldownCounters[mem.id] || 0) > 0) return false;
    if ((stickyCounters[mem.id] || 0) > 0) return true;
    const prob = mem.trigger?.probability ?? 100;
    if (prob < 100 && Math.random() * 100 > prob) return false;

    // 🌍 【世界記憶】：無條件觸發（後續再由 importance 截斷數量）
    if (mem.type === 'world') return true;

    // 🗺️🏠 【區域與場景記憶】：精確地點比對
    if (mem.type === 'region' || mem.type === 'scene') {
      const locs = mem.tags?.locations || [];
      // 只有當「當前地點」完全等於記憶標籤中的地點時才觸發
      if (locs.some(loc => loc === currentLocation)) {
        return true;
      }
      return false;
    }

    // 👤 【NPC 記憶】或其他情況：保留關鍵字比對
    const allKeywords = [
      ...(mem.tags?.npcs || []),
      ...(mem.tags?.factions || []),
      ...(mem.tags?.keywords || []),
    ];
    return scanKeywords(allKeywords, mem.trigger?.scanDepth ?? 5, userInput);
  };

  // ─── sticky / cooldown 計數器更新 ─────────────────────────────────────────
  const tickMemoryCounters = (triggeredIds: string[]): void => {
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
              setCooldownCounters(c => ({ ...c, [id]: cd }));
            }
            delete next[id];
          }
        }
      });
      return next;
    });
    setCooldownCounters(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(id => {
        if (next[id] > 0) next[id] -= 1;
        if (next[id] === 0) delete next[id];
      });
      return next;
    });
  };

  // ─── 消耗品 effect 套用 ────────────────────────────────────────────────────
  const applyItemEffect = (itemName: string): boolean => {
    const item = consumables.find(i => i.name === itemName);
    if (!item) return false;
    const effect = item.effect || {};

    // 先在 callback 外計算好 toast 文字，避免 setter 非同步執行導致 parts 尚未填入
    const parts: string[] = [];
    if (effect.hp != null && effect.hp !== 0) parts.push(`HP ${effect.hp > 0 ? '+' : ''}${effect.hp}`);
    if (effect.mp != null && effect.mp !== 0) parts.push(`MP ${effect.mp > 0 ? '+' : ''}${effect.mp}`);
    if (effect.gold != null && effect.gold !== 0) parts.push(`Gold ${effect.gold > 0 ? '+' : ''}${effect.gold}`);
    if (effect.status) parts.push(`狀態：${effect.status}`);

    setProfile(prev => {
      const next = { ...prev };
      if (effect.hp != null && effect.hp !== 0) next.hp = Math.max(0, prev.hp + effect.hp);
      if (effect.mp != null && effect.mp !== 0) next.mp = Math.max(0, prev.mp + effect.mp);
      if (effect.gold != null && effect.gold !== 0) next.gold = Math.max(0, prev.gold + effect.gold);
      if (effect.status) next.status = effect.status;
      return next;
    });

    setConsumables(prev =>
      prev
        .map(i => i.name === itemName ? { ...i, quantity: i.quantity - 1 } : i)
        .filter(i => i.quantity > 0)
    );

    const effectDesc = parts.length > 0 ? `：${parts.join('、')}` : '';
    showToast(`🧪 使用 ${itemName}${effectDesc}`);
    return true;
  };

  // ─── 前端 COMMANDS 解析器 ──────────────────────────────────────────────────
  const parseAndExecuteCommands = (rawText: string): string => {
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

    if (allCommands.length === 0) return narrative.replace(/```[a-z]*\s*```/gi, '').trim();

    // ── 收集數值增量，最後一次性套用 ───────────────────────────────────────
    let hpDelta = 0;
    let mpDelta = 0;
    let goldDelta = 0;
    let timeDeltaMinutes = 0;
    const affinityUpdates: { name: string; delta: number }[] = [];
    const toastQueue: string[] = [];

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
        toastQueue.push(`📍 移動至 ${newLoc}`);
        continue;
      }

      // TIME
      const timeMatch = cmd.match(/^TIME:\+(\d+)(h|m)$/i);
      if (timeMatch) {
        const amount = parseInt(timeMatch[1]);
        const unit = timeMatch[2].toLowerCase();
        timeDeltaMinutes += unit === 'h' ? amount * 60 : amount;
        continue;
      }

      // ITEM_ADD
      if (cmd.toUpperCase().startsWith('ITEM_ADD:')) {
        const rawParts = cmd.slice('ITEM_ADD:'.length).split(':');
        const itemName = rawParts[0]?.trim() || '';
        const qty = parseInt(rawParts[1] || '1') || 1;
        const EFFECT_KEYS = /^(hp|mp|gold|status)=/i;
        const descParts: string[] = [];
        const effectMap: Record<string, string> = {};
        for (let pi = 2; pi < rawParts.length; pi++) {
          if (EFFECT_KEYS.test(rawParts[pi])) {
            const eqIdx = rawParts[pi].indexOf('=');
            effectMap[rawParts[pi].slice(0, eqIdx).toLowerCase()] = rawParts[pi].slice(eqIdx + 1);
          } else {
            descParts.push(rawParts[pi]);
          }
        }
        const desc = descParts.join(':').trim();
        const hasEffect = Object.keys(effectMap).length > 0;
        const effect: ConsumableItem['effect'] = {};
        if (effectMap.hp) effect.hp = parseInt(effectMap.hp);
        if (effectMap.mp) effect.mp = parseInt(effectMap.mp);
        if (effectMap.gold) effect.gold = parseInt(effectMap.gold);
        if (effectMap.status) effect.status = effectMap.status;

        if (hasEffect) {
          setConsumables(prev => {
            const exists = prev.find(i => i.name === itemName);
            if (exists) return prev.map(i => i.name === itemName ? { ...i, quantity: i.quantity + qty } : i);
            return [...prev, { id: Date.now(), name: itemName, quantity: qty, description: desc, effect }];
          });
        } else {
          setInventory(prev => {
            const exists = prev.find(i => i.name === itemName);
            if (exists) return prev.map(i => i.name === itemName ? { ...i, quantity: i.quantity + qty } : i);
            return [...prev, { id: Date.now(), name: itemName, quantity: qty, description: desc }];
          });
        }
        toastQueue.push(`🎒 獲得 ${itemName} x${qty}`);
        continue;
      }

      // ITEM_REMOVE
      const itemRemoveMatch = cmd.match(/^ITEM_REMOVE:(.+):(\d+)$/i);
      if (itemRemoveMatch) {
        const [, name, qty] = itemRemoveMatch;
        setInventory(prev =>
          prev
            .map(i => i.name === name.trim() ? { ...i, quantity: i.quantity - parseInt(qty) } : i)
            .filter(i => i.quantity > 0)
        );
        continue;
      }

      // ITEM_USE
      const itemUseMatch = cmd.match(/^ITEM_USE:(.+)$/i);
      if (itemUseMatch) {
        applyItemEffect(itemUseMatch[1].trim());
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
        toastQueue.push(`📝 新增${rawType === 'world' ? '世界' : rawType === 'region' ? '區域' : rawType === 'scene' ? '場景' : 'NPC'}記憶`);
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
          toastQueue.push(`📋 新任務：${title}`);
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
          toastQueue.push(`🎯 任務目標達成：${titleTrimmed}（請向委託人回報）`);
        }
        continue;
      }

      // QUEST_COMPLETE
      const questCompleteMatch = cmd.match(/^QUEST_COMPLETE:(.+)$/i);
      if (questCompleteMatch) {
        const titleTrimmed = questCompleteMatch[1].trim();
        const quest = quests.find(q => q.title === titleTrimmed && q.status === 'active');
        if (quest) {
          if (quest.reward?.gold) goldDelta += quest.reward.gold;
          if (quest.reward?.items?.length) {
            quest.reward.items.forEach(item => {
              setInventory(prev => {
                const exists = prev.find(i => i.name === item);
                if (exists) return prev.map(i => i.name === item ? { ...i, quantity: i.quantity + 1 } : i);
                return [...prev, { id: Date.now() + Math.floor(Math.random() * 999), name: item, quantity: 1, description: '' }];
              });
            });
          }
          const rewardStr = quest.reward?.gold ? `，獲得 ${quest.reward.gold} 銅` : '';
          toastQueue.push(`✅ 任務完成：${titleTrimmed}${rewardStr}`);
          setQuests(prev => prev.map(q =>
            q.title === titleTrimmed && q.status === 'active'
              ? { ...q, status: 'completed' as const, completedAt: `${timeState.month}/${timeState.day}` }
              : q
          ));
        }
        continue;
      }

      // NPC_THOUGHT
      const npcThoughtMatch = cmd.match(/^NPC_THOUGHT:(.+):(.+)$/i);
      if (npcThoughtMatch) {
        const [, name, text] = npcThoughtMatch;
        setNpcs(prev => prev.map(npc => {
          if (npc.name.includes(name.trim()) || name.trim().includes(npc.name)) {
            const newThought = { text: text.trim(), createdAt: `${timeState.month}/${timeState.day}` };
            return { ...npc, thoughts: [newThought, ...(npc.thoughts || [])].slice(0, 5) };
          }
          return npc;
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

      // NPC_NEW:姓名:種族:職業:外貌:個性
      const npcNewMatch = cmd.match(/^NPC_NEW:([^:]+):([^:]+):([^:]+):([^:]+):(.+)$/i);
      if (npcNewMatch) {
        const [, npcName, race, job, appearance, personality] = npcNewMatch.map(s => s?.trim());
        const newId = Date.now();
        setLorebookEntries(prev => {
          if (prev.some(e => e.title === npcName && e.category === 'NPC')) return prev;
          return [...prev, {
            id: newId, title: npcName, content: '', category: 'NPC', isActive: true,
            job, appearance, personality, other: race,
            keywords: [npcName], selective: false, secondaryKeys: [], insertionOrder: 100,
            homeLocation: '', roamLocations: [],
          }];
        });
        setNpcs(prev => {
          if (prev.some(n => n.name === npcName)) return prev;
          return [...prev, {
            id: newId + 1, name: npcName, job, affection: 0, affectionLabel: '陌生人',
            appearance, personality, other: race,
            category: 'NPC', isActive: true, isPinned: false, memories: [], thoughts: [],
            location: currentLocation, lastSeenLocation: currentLocation
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

      // LOCATION_DISCOVER
      const locDiscoverMatch = cmd.match(/^LOCATION_DISCOVER:(.+)$/i);
      if (locDiscoverMatch) {
        const locName = locDiscoverMatch[1].trim();

        // 依地點名稱關鍵字推斷類型（建築優先，避免「月湖鎮酒館」誤判為 town）
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
            content: '旅途中發現的神秘地點，尚待探索。',
            category: '地點',
            isActive: true,
            mapStatus: 'discovered' as const,
            locationType: inferLocationType(locName),
            keywords: [locName],
            selective: false,
            secondaryKeys: [],
            insertionOrder: 100,
          }]);
        }
        toastQueue.push(`🗺️ 發現新地點：${locName}`);
        continue;
      }

    } // end for

    if (timeDeltaMinutes > 0) {
      const baseMinutes = timeState.hour * 60 + timeState.minute;
      const totalMinutes = baseMinutes + timeDeltaMinutes;
      const addedDays = Math.floor(totalMinutes / (24 * 60));
      const remainMinutes = totalMinutes % (24 * 60);

      // 處理日/月/年進位（每月 30 天，每年 12 月）
      let newDay = timeState.day + addedDays;
      let newMonth = timeState.month;
      let newYear = timeState.year;
      while (newDay > 30) { newDay -= 30; newMonth++; }
      while (newMonth > 12) { newMonth -= 12; newYear++; }

      setTimeState(prev => ({
        ...prev,
        hour: Math.floor(remainMinutes / 60),
        minute: remainMinutes % 60,
        day: newDay,
        month: newMonth,
        year: newYear,
      }));

      // 任務期限自動失敗
      if (addedDays > 0) {
        const newTotalDays = newYear * 360 + (newMonth - 1) * 30 + newDay;
        const failedTitles = quests
          .filter(q =>
            q.status === 'active' &&
            q.deadline != null &&
            q.createdAtTotalDays != null &&
            newTotalDays >= q.createdAtTotalDays + q.deadline
          )
          .map(q => q.title);

        failedTitles.forEach(title => toastQueue.push(`❌ 任務失敗：${title}`));
        if (failedTitles.length > 0) {
          setQuests(prev => prev.map(q =>
            failedTitles.includes(q.title) && q.status === 'active'
              ? { ...q, status: 'failed' as const }
              : q
          ));
        }
      }
    }

    // ── 一次性套用數值變化 ─────────────────────────────────────────────────
    if (hpDelta !== 0 || mpDelta !== 0 || goldDelta !== 0) {
      setProfile(prev => {
        const newHp = Math.max(0, prev.hp + hpDelta);
        const newMp = Math.max(0, prev.mp + mpDelta);
        const newGold = Math.max(0, prev.gold + goldDelta);
        if (hpDelta !== 0) toastQueue.push(hpDelta > 0 ? `❤️ HP +${hpDelta}` : `💔 HP ${hpDelta}`);
        if (mpDelta !== 0) toastQueue.push(mpDelta > 0 ? `💙 MP +${mpDelta}` : `💙 MP ${mpDelta}`);
        if (goldDelta !== 0) toastQueue.push(goldDelta > 0 ? `🪙 +${goldDelta} G` : `🪙 ${goldDelta} G`);
        if (newHp === 0) toastQueue.push('💀 HP 歸零！');
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
        toastQueue.push(`${update.delta > 0 ? '💛' : '🖤'} ${npc.name} 好感度 ${update.delta > 0 ? '+' : ''}${update.delta}`);
        return { ...npc, affection: newAffinity };
      }));
    }

    if (toastQueue.length > 0) {
      notifyCommandResult(toastQueue);
    }

    return narrative.replace(/```[a-z]*\s*```/gi, '').trim();
  };

  return { parseAndExecuteCommands, applyItemEffect, scanKeywords, isMemoryTriggered, tickMemoryCounters };
}
