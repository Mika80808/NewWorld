/**
 * Command Reducer - Phase 2: Reduce Layer
 * 累積狀態變更對象，無副作用的純函式
 */

import { CommandAST } from './commandParser';
import { advanceTimeAndResolveQuestDeadlines } from './timeUtils';
import { normalizeItemName, registerItemDef, touchItemDef, pruneItemCatalog } from './itemCatalog';
import { pruneMemories } from './memoryStore';
import {
  TimeState, Profile, Quest, MemoryEntry, Npc, ItemEntry, ItemCatalog,
  LorebookEntry, Message, StatusEffect, Faction, NpcRelation, NpcMemory,
} from '../types';

// ─── 狀態變更對象型別 ──────────────────────────────────────────────────────────

export interface StateChanges {
  profile?: Partial<Profile>;
  timeState?: Partial<TimeState>;
  quests?: Quest[];
  memories?: MemoryEntry[];
  npcs?: Npc[];
  items?: ItemEntry[];
  itemCatalog?: ItemCatalog;
  lorebookEntries?: LorebookEntry[];
  currentLocation?: string;
  quickOptions?: string[];
  stickyCounters?: Record<string, number>;
  cooldownCounters?: Record<string, number>;
  statusEffects?: StatusEffect[];
  factions?: Faction[];
}

export interface Feedback {
  toasts: string[];
  cmdResults: string[];
}

export interface AsyncTask {
  type: 'merge_npc_memories';
  payload: {
    npcId: number;
    npcName: string;
    memories: NpcMemory[];
  };
}

export interface ReduceResult {
  stateChanges: StateChanges;
  feedback: Feedback;
  asyncTasks: AsyncTask[];
}

// ─── 當前狀態讀取依賴 ──────────────────────────────────────────────────────────

export interface CurrentState {
  timeState: TimeState;
  profile: Profile;
  quests: Quest[];
  memories: MemoryEntry[];
  npcs: Npc[];
  items: ItemEntry[];
  itemCatalog: ItemCatalog;
  currentLocation: string;
  lorebookEntries: LorebookEntry[];
  messages: Message[];
  stickyCounters: Record<string, number>;
  cooldownCounters: Record<string, number>;
  statusEffects: StatusEffect[];
  factions: Faction[];
}

// ─── 勢力調色盤 ────────────────────────────────────────────────────────────────
const FACTION_COLOR_PALETTE = ['#7F77DD', '#EF9F27', '#1D9E75', '#D85A30', '#888780', '#D4537E'];

// ─── Main Reduce Function ──────────────────────────────────────────────────────

export function reduceCommands(
  commands: CommandAST[],
  currentState: CurrentState
): ReduceResult {
  const stateChanges: StateChanges = {};
  const feedback: Feedback = { toasts: [], cmdResults: [] };
  const asyncTasks: AsyncTask[] = [];

  // Bug #1/#2 fix: 用 counter 避免同毫秒多條指令的 id 碰撞
  let _idCounter = 0;
  const nextId = () => Date.now() * 1000 + (_idCounter++);

  let hpDelta = 0;
  let mpDelta = 0;
  let goldDelta = 0;
  const affinityUpdates: Array<{ npcName: string; value: number }> = [];
  let timeDeltaMinutes = 0;

  const gameDate = `${currentState.timeState.month}/${currentState.timeState.day}`;

  let workingQuests = [...currentState.quests];
  let workingNpcs = [...currentState.npcs];
  let workingItems = [...currentState.items];
  let workingCatalog = currentState.itemCatalog;
  let workingMemories = [...currentState.memories];
  let workingLorebookEntries = [...currentState.lorebookEntries];
  let workingFactions = [...currentState.factions];

  // 狀態異常：每回合對所有 duration > 0 的異常 -1，歸零自動移除
  let workingStatus: StatusEffect[] = currentState.statusEffects
    .map(s => s.duration === -1 ? s : { ...s, duration: s.duration - 1 })
    .filter(s => s.duration !== 0);

  // ─── 遍歷指令 ─────────────────────────────────────────────────────────────────

  for (const cmd of commands) {
    switch (cmd.type) {

      case 'HP': {
        hpDelta += (cmd.parsed.value as number) || 0;
        feedback.cmdResults.push(`❤️ HP ${(cmd.parsed.value as number) > 0 ? '+' : ''}${cmd.parsed.value}`);
        break;
      }

      case 'MP': {
        mpDelta += (cmd.parsed.value as number) || 0;
        feedback.cmdResults.push(`💙 MP ${(cmd.parsed.value as number) > 0 ? '+' : ''}${cmd.parsed.value}`);
        break;
      }

      case 'GOLD': {
        goldDelta += (cmd.parsed.value as number) || 0;
        feedback.cmdResults.push(`💰 金幣 ${(cmd.parsed.value as number) > 0 ? '+' : ''}${cmd.parsed.value}`);
        break;
      }

      case 'TIME': {
        timeDeltaMinutes += (cmd.parsed.minutes as number) || 0;
        break;
      }

      case 'LOCATION': {
        const destination = cmd.parsed.location as string;
        stateChanges.currentLocation = destination;
        // 親自到過就是「已知」。先前只有 constants 裡的月湖鎮是 known，
        // LOCATION_DISCOVER 一律只寫 heard，而移動指令完全不碰設定集——
        // 於是玩家走遍全世界，地圖上仍舊全是 ???。
        // 找不到對應條目時不建新的：座標交給 LOCATION_DISCOVER 決定，
        // 這裡憑空補一個沒有 mapX/mapY 的條目只會讓它在地圖上不可見。
        workingLorebookEntries = workingLorebookEntries.map(e =>
          e.category === '地點' && e.title === destination && e.mapStatus !== 'known'
            ? { ...e, mapStatus: 'known' as const }
            : e
        );
        feedback.cmdResults.push(`📍 移動至 ${destination}`);
        break;
      }

      case 'AFFINITY': {
        affinityUpdates.push({
          npcName: cmd.parsed.npcName as string,
          value: cmd.parsed.value as number,
        });
        feedback.cmdResults.push(`💕 ${cmd.parsed.npcName} 好感度 ${(cmd.parsed.value as number) > 0 ? '+' : ''}${cmd.parsed.value}`);
        break;
      }

      case 'ITEM_ADD': {
        const name = normalizeItemName(cmd.parsed.name as string);
        const quantity = (cmd.parsed.quantity as number) || 1;
        // 圖鑑先寫先贏：同名道具已有定義時沿用，忽略 AI 本次重新生成的描述
        const reg = registerItemDef(workingCatalog, name, cmd.parsed.description as string, gameDate);
        workingCatalog = reg.catalog;
        // workingItems 只是 currentState.items 的淺拷貝，直接改 item.quantity 會就地
        // 竄改 React state 裡的同一個物件（前一版快照也跟著變）。一律換新物件。
        const existingIdx = workingItems.findIndex(i => i.name === name);
        if (existingIdx !== -1) {
          const prev = workingItems[existingIdx];
          workingItems = workingItems.map((i, idx) =>
            idx === existingIdx ? { ...prev, quantity: prev.quantity + quantity } : i
          );
        } else {
          workingItems = [...workingItems, { id: nextId(), name, quantity, description: reg.def.description }];
        }
        feedback.cmdResults.push(`📦 獲得 ${name} ×${quantity}`);
        break;
      }

      case 'ITEM_REMOVE': {
        const name = normalizeItemName(cmd.parsed.name as string);
        const quantity = (cmd.parsed.quantity as number) || 1;
        const item = workingItems.find(i => i.name === name);
        if (item) {
          const remaining = item.quantity - quantity;
          workingItems = remaining <= 0
            ? workingItems.filter(i => i.name !== name)
            : workingItems.map(i => i.name === name ? { ...i, quantity: remaining } : i);
          workingCatalog = touchItemDef(workingCatalog, name);
          feedback.cmdResults.push(`📦 移除 ${name} ×${quantity}`);
        }
        break;
      }

      case 'ITEM_USE': {
        // 數量扣減由前端 consumeItem 處理；此處只更新圖鑑的 lastUsedAt
        workingCatalog = touchItemDef(workingCatalog, normalizeItemName(cmd.parsed.name as string));
        break;
      }

      case 'QUEST_ADD': {
        const title = cmd.parsed.title as string;
        if (!workingQuests.some(q => q.title === title)) {
          const createdAtTotalDays =
            currentState.timeState.year * 360 +
            (currentState.timeState.month - 1) * 30 +
            currentState.timeState.day;
          workingQuests.push({
            id: `quest_${Date.now()}_${Math.floor(Math.random() * 9999)}`,
            title,
            giver: (cmd.parsed.giver as string) || '',
            description: (cmd.parsed.description as string) || '',
            reward: {
              gold: (cmd.parsed.gold as number) > 0 ? (cmd.parsed.gold as number) : undefined,
              items: (cmd.parsed.items as string[])?.length > 0 ? (cmd.parsed.items as string[]) : undefined,
            },
            ...((cmd.parsed.deadline as number) ? { deadline: cmd.parsed.deadline as number } : {}),
            status: 'active' as const,
            isGoalMet: false,
            createdAt: `${currentState.timeState.month}/${currentState.timeState.day}`,
            createdAtTotalDays,
          });
          feedback.cmdResults.push(`📋 新任務：${title}`);
        }
        break;
      }

      case 'QUEST_GOAL_MET': {
        const title = cmd.parsed.title as string;
        workingQuests = workingQuests.map(q =>
          q.title === title && q.status === 'active' ? { ...q, isGoalMet: true } : q
        );
        feedback.cmdResults.push(`✅ ${title}（目標達成，待玩家回報）`);
        break;
      }

      case 'QUEST_COMPLETE': {
        const title = cmd.parsed.title as string;
        const quest = workingQuests.find(q => q.title === title && q.status === 'active');
        if (quest) {
          if (quest.reward?.gold && quest.reward.gold > 0) {
            goldDelta += quest.reward.gold;
            feedback.cmdResults.push(`💰 完成獎勵：+${quest.reward.gold} 金幣`);
          }
          if (quest.reward?.items?.length) {
            quest.reward.items.forEach(itemName => {
              const name = normalizeItemName(itemName);
              const reg = registerItemDef(workingCatalog, name, '完成任務獲得的獎勵', gameDate);
              workingCatalog = reg.catalog;
              const existingIdx = workingItems.findIndex(i => i.name === name);
              if (existingIdx !== -1) {
                const prev = workingItems[existingIdx];
                workingItems = workingItems.map((i, idx) =>
                  idx === existingIdx ? { ...prev, quantity: prev.quantity + 1 } : i
                );
              } else {
                workingItems = [...workingItems, { id: nextId(), name, quantity: 1, description: reg.def.description }];
              }
            });
            feedback.cmdResults.push(`📦 獎勵物品：${quest.reward.items.join('、')}`);
          }
          workingQuests = workingQuests.map(q =>
            q.title === title && q.status === 'active'
              ? { ...q, status: 'completed' as const, completedAt: `${currentState.timeState.month}/${currentState.timeState.day}` }
              : q
          );
          feedback.cmdResults.push(`✅ 任務完成：${title}`);
        }
        break;
      }

      case 'NPC_THOUGHT': {
        const npcName = cmd.parsed.npcName as string;
        const thought = cmd.parsed.thought as string;
        workingNpcs = workingNpcs.map(npc => {
          if (npc.name !== npcName.trim()) return npc;
          const updatedThoughts = [
            { text: thought, createdAt: `${currentState.timeState.month}/${currentState.timeState.day}` },
            ...(npc.thoughts || []),
          ];
          if (updatedThoughts.length > 10) {
            const mergedText = updatedThoughts.slice(0, 10).reverse().map(t => `[${t.createdAt}] ${t.text}`).join('；');
            const newMemory: NpcMemory = {
              id: `nmem_${Date.now()}_${Math.random().toString(36).slice(2)}`,
              text: `${npc.name} 的想法整理：${mergedText}`,
              importance: 'normal',
              source: 'pre_merge',
              createdAt: `${currentState.timeState.month}/${currentState.timeState.day}`,
            };
            const updatedMemories = [...(npc.memories || []), newMemory];
            const unmergedCount = updatedMemories.filter(m => !m.isMerged).length;
            if (unmergedCount > 3) {
              asyncTasks.push({
                type: 'merge_npc_memories',
                payload: { npcId: npc.id, npcName: npc.name, memories: updatedMemories },
              });
            }
            return { ...npc, thoughts: [], memories: updatedMemories };
          }
          return { ...npc, thoughts: updatedThoughts };
        });
        break;
      }

      case 'NPC_LOCATION': {
        const npcName = cmd.parsed.npcName as string;
        const location = cmd.parsed.location as string;
        workingLorebookEntries = workingLorebookEntries.map(e => {
          if (e.category === 'NPC' && e.title === npcName) {
            const roamLocs = [...(e.roamLocations || [])];
            if (!roamLocs.includes(location)) {
              roamLocs.unshift(location);
              if (roamLocs.length > 3) roamLocs.pop();
            }
            return { ...e, roamLocations: roamLocs };
          }
          return e;
        });
        workingNpcs = workingNpcs.map(npc =>
          npc.name === npcName
            ? { ...npc, location, lastSeenLocation: location, lastSeenDate: `${currentState.timeState.month}/${currentState.timeState.day}` }
            : npc
        );
        feedback.cmdResults.push(`👤 ${npcName} 現在在 ${location}`);
        break;
      }

      // ── 狀態異常指令 ───────────────────────────────────────────────────────────

      case 'STATUS_ADD': {
        const name = cmd.parsed.name as string;
        const emoji = cmd.parsed.emoji as string;
        const duration = cmd.parsed.duration as number;
        // 同名異常：覆寫（重置 duration）
        workingStatus = workingStatus.filter(s => s.name !== name);
        workingStatus.push({
          id: `status_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name, emoji, duration,
        });
        const durationLabel = duration === -1 ? '永久' : `${duration} 回合`;
        feedback.cmdResults.push(`${emoji} 獲得狀態：${name}（${durationLabel}）`);
        break;
      }

      case 'STATUS_REMOVE': {
        const name = cmd.parsed.name as string;
        workingStatus = workingStatus.filter(s => s.name !== name);
        feedback.cmdResults.push(`✨ 狀態解除：${name}`);
        break;
      }

      case 'STATUS_CLEAR': {
        workingStatus = [];
        feedback.cmdResults.push('✨ 所有狀態異常已解除');
        break;
      }

      // ── 勢力系統指令 ───────────────────────────────────────────────────────────

      case 'FACTION_NEW': {
        const name = cmd.parsed.name as string;
        const factionType = cmd.parsed.factionType as Faction['type'];
        const description = cmd.parsed.description as string;
        // 同名勢力已存在則略過
        if (workingFactions.some(f => f.name === name)) break;
        const newId = Math.max(...workingFactions.map(f => f.id), 0) + 1;
        const color = FACTION_COLOR_PALETTE[workingFactions.length % FACTION_COLOR_PALETTE.length];
        workingFactions.push({
          id: newId,
          name,
          type: factionType || 'other',
          description,
          color,
          isActive: true,
          relations: [],
        });
        feedback.toasts.push(`勢力「${name}」已登錄`);
        break;
      }

      case 'FACTION_JOIN': {
        const factionName = cmd.parsed.factionName as string;
        const npcName = cmd.parsed.npcName as string;
        const faction = workingFactions.find(f => f.name === factionName);
        const npcIdx = workingNpcs.findIndex(n => n.name === npcName);
        if (!faction || npcIdx === -1) {
          console.warn(`[FACTION_JOIN] 找不到勢力「${factionName}」或 NPC「${npcName}」`);
          break;
        }
        const npc = workingNpcs[npcIdx];
        const existingIds = npc.factionIds || [];
        if (!existingIds.includes(faction.id)) {
          workingNpcs = workingNpcs.map((n, i) =>
            i === npcIdx ? { ...n, factionIds: [...existingIds, faction.id] } : n
          );
          feedback.toasts.push(`${npcName} 加入了 ${factionName}`);
        }
        break;
      }

      case 'FACTION_RELATION': {
        const factionA = cmd.parsed.factionA as string;
        const relationType = cmd.parsed.relationType as 'ally' | 'enemy' | 'neutral' | 'vassal' | 'rival';
        const factionB = cmd.parsed.factionB as string;
        const note = cmd.parsed.note as string | undefined;
        const idxA = workingFactions.findIndex(f => f.name === factionA);
        const idxB = workingFactions.findIndex(f => f.name === factionB);
        if (idxA === -1 || idxB === -1) break;
        const fa = workingFactions[idxA];
        const fb = workingFactions[idxB];
        // 寫入 A → B
        const relA = (fa.relations || []).filter(r => r.targetFactionId !== fb.id);
        relA.push({ targetFactionId: fb.id, type: relationType, note });
        // vassal 是單向（A 是 B 的附庸），其餘雙向
        const relB = (fb.relations || []).filter(r => r.targetFactionId !== fa.id);
        if (relationType !== 'vassal') {
          relB.push({ targetFactionId: fa.id, type: relationType, note });
        }
        workingFactions = workingFactions.map((f, i) => {
          if (i === idxA) return { ...f, relations: relA };
          if (i === idxB) return { ...f, relations: relB };
          return f;
        });
        break;
      }

      case 'NPC_RELATION': {
        const npcName = cmd.parsed.npcName as string;
        const relationType = cmd.parsed.relationType as NpcRelation['type'];
        const targetName = cmd.parsed.targetName as string;
        const note = cmd.parsed.note as string | undefined;
        const npcIdx = workingNpcs.findIndex(n => n.name === npcName);
        if (npcIdx === -1) break;
        const isPlayer = targetName.toUpperCase() === 'PLAYER';
        const targetId: number | 'player' = isPlayer
          ? 'player'
          : (workingNpcs.find(n => n.name === targetName)?.id ?? -1);
        if (targetId === -1) break;
        // 寫入 npc.relations（去重）
        const npcRelations = (workingNpcs[npcIdx].relations || []).filter(
          r => r.targetId !== targetId
        );
        npcRelations.push({ targetId, type: relationType, note });
        workingNpcs = workingNpcs.map((n, i) =>
          i === npcIdx ? { ...n, relations: npcRelations } : n
        );
        // 對稱寫入（非 player 目標）
        if (!isPlayer && typeof targetId === 'number') {
          const symmetric = ['family', 'ally', 'enemy', 'rival'].includes(relationType);
          if (symmetric) {
            const targetIdx = workingNpcs.findIndex(n => n.id === targetId);
            if (targetIdx !== -1) {
              const targetRelations = (workingNpcs[targetIdx].relations || []).filter(
                r => r.targetId !== workingNpcs[npcIdx].id
              );
              targetRelations.push({ targetId: workingNpcs[npcIdx].id, type: relationType, note });
              workingNpcs = workingNpcs.map((n, i) =>
                i === targetIdx ? { ...n, relations: targetRelations } : n
              );
            }
          }
        }
        break;
      }

      case 'NPC_NEW': {
        const name = cmd.parsed.name as string;
        // 已存在則不重複建立
        if (workingNpcs.some(n => n.name === name)) break;
        const newNpc: Npc = {
          id: Math.max(...workingNpcs.map(n => n.id), 0) + 1,
          name,
          job: cmd.parsed.job as string || '',
          affection: 0,
          appearance: cmd.parsed.appearance as string || '',
          personality: cmd.parsed.personality as string || '',
          gender: cmd.parsed.gender as string || '',
          race: cmd.parsed.race as string || '',
          age: cmd.parsed.age as string || '',
          backstory: cmd.parsed.backstory as string || '',
          other: cmd.parsed.other as string || '',
          category: '登場人物',
          isActive: true,
          memories: [],
        };
        workingNpcs = [...workingNpcs, newNpc];
        // 同步建立 lorebook NPC 條目
        if (!workingLorebookEntries.some(e => e.category === 'NPC' && e.title === name)) {
          const newEntry: LorebookEntry = {
            id: Math.max(...workingLorebookEntries.map(e => e.id), 0) + 1,
            title: name,
            content: `${name}（${cmd.parsed.job || ''}）`,
            category: 'NPC',
            isActive: true,
            gender: cmd.parsed.gender as string || '',
            race: cmd.parsed.race as string || '',
            age: cmd.parsed.age as string || '',
            job: cmd.parsed.job as string || '',
            appearance: cmd.parsed.appearance as string || '',
            personality: cmd.parsed.personality as string || '',
            backstory: cmd.parsed.backstory as string || '',
            other: cmd.parsed.other as string || '',
          };
          workingLorebookEntries = [...workingLorebookEntries, newEntry];
        }
        feedback.toasts.push(`👤 新角色登場：${name}`);
        break;
      }

      case 'NPC_HOME': {
        const npcName = cmd.parsed.npcName as string;
        const location = cmd.parsed.location as string;
        workingLorebookEntries = workingLorebookEntries.map(e =>
          e.category === 'NPC' && e.title === npcName
            ? { ...e, homeLocation: location }
            : e
        );
        workingNpcs = workingNpcs.map(npc =>
          npc.name === npcName ? { ...npc, location } : npc
        );
        break;
      }

      case 'NPC_RELATIONSHIP': {
        // 文字形式的玩家-NPC 關係描述（區別於 NPC_RELATION 的結構化關係）
        const npcName = cmd.parsed.npcName as string;
        const relationship = cmd.parsed.relationship as string;
        workingNpcs = workingNpcs.map(npc =>
          npc.name === npcName ? { ...npc, relationship } : npc
        );
        break;
      }

      case 'LOCATION_DISCOVER': {
        const name = cmd.parsed.name as string;
        const x = cmd.parsed.x as number;
        const y = cmd.parsed.y as number;
        // 地點已存在則更新 mapStatus，不存在則新增
        const existing = workingLorebookEntries.find(e => e.category === '地點' && e.title === name);
        if (existing) {
          workingLorebookEntries = workingLorebookEntries.map(e =>
            e.category === '地點' && e.title === name
              ? { ...e, mapStatus: 'heard' as const, mapX: e.mapX ?? x, mapY: e.mapY ?? y }
              : e
          );
        } else {
          const newEntry: LorebookEntry = {
            id: Math.max(...workingLorebookEntries.map(e => e.id), 0) + 1,
            title: name,
            content: '',
            category: '地點',
            isActive: true,
            mapX: x,
            mapY: y,
            mapStatus: 'heard',
          };
          workingLorebookEntries = [...workingLorebookEntries, newEntry];
        }
        feedback.toasts.push(`🗺️ 聽聞新地點：${name}`);
        break;
      }

      case 'MEMORY_ADD': {
        const memType = cmd.parsed.memType as MemoryEntry['type'];
        const importance = cmd.parsed.importance as MemoryEntry['importance'];
        const content = cmd.parsed.content as string;
        const sticky = cmd.parsed.sticky as number;
        const cooldown = cmd.parsed.cooldown as number;
        const newMem: MemoryEntry = {
          id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          type: memType,
          importance,
          content,
          tags: {
            locations: cmd.parsed.locations as string[] || [],
            npcs: cmd.parsed.npcs as string[] || [],
            factions: cmd.parsed.factions as string[] || [],
            keywords: cmd.parsed.keywords as string[] || [],
          },
          trigger: {
            scanDepth: 5,
            probability: 100,
            sticky: sticky || 0,
            cooldown: cooldown || 0,
          },
          isActive: true,
          source: 'ai_generated',
          createdAt: `${currentState.timeState.month}/${currentState.timeState.day}`,
        };
        workingMemories = [...workingMemories, newMem];
        break;
      }

      // 認不得的指令：舊版直接 break，格式打錯完全無聲（整份程式只有 FACTION_JOIN
      // 會 warn）。玩家只會看到「數值沒變」而無從查起，故補上診斷輸出。
      case 'UNKNOWN':
        console.warn(`[COMMANDS] 無法解析的指令，已略過：${cmd.raw}`);
        break;
      default:
        console.warn(`[COMMANDS] 未處理的指令類型 ${cmd.type}，已略過：${cmd.raw}`);
        break;
    }
  }

  // ─── 統一應用延遲的數值變更 ────────────────────────────────────────────────────

  if (hpDelta !== 0 || mpDelta !== 0 || goldDelta !== 0) {
    stateChanges.profile = {
      hp: Math.max(0, currentState.profile.hp + hpDelta),
      mp: Math.max(0, currentState.profile.mp + mpDelta),
      gold: Math.max(0, currentState.profile.gold + goldDelta),
    };
  }

  if (timeDeltaMinutes > 0) {
    const { newTimeState, updatedQuests, cmdResults } = advanceTimeAndResolveQuestDeadlines(
      currentState.timeState, timeDeltaMinutes, workingQuests
    );
    stateChanges.timeState = newTimeState;
    workingQuests = updatedQuests;
    feedback.cmdResults.push(...cmdResults);
  }

  if (affinityUpdates.length > 0) {
    // 同一回合同一 NPC 可能有多條 AFFINITY（例如先 +5 再 -2）。
    // 舊實作用 find 只取第一條，其餘被靜默丟棄，但 cmdResults 已經把每條都顯示給玩家，
    // 造成「畫面顯示 +5 -2、實際只加了 5」的對不上。改為先加總再套用。
    const affinitySum = new Map<string, number>();
    for (const { npcName, value } of affinityUpdates) {
      affinitySum.set(npcName, (affinitySum.get(npcName) ?? 0) + value);
    }
    workingNpcs = workingNpcs.map(npc => {
      const delta = affinitySum.get(npc.name);
      return delta !== undefined ? { ...npc, affection: Math.max(-100, npc.affection + delta) } : npc;
    });
  }

  // LOD 淘汰：背包內道具受保護，其餘依 lastUsedAt 由舊到新淘汰
  workingCatalog = pruneItemCatalog(workingCatalog, new Set(workingItems.map(i => i.name)));

  // 同理淘汰記憶：critical / manual 豁免，其餘 flavor 優先、最久未觸發優先。
  // 未超量時 pruneMemories 回傳原 reference，不會平白產生新陣列。
  workingMemories = pruneMemories(workingMemories);

  stateChanges.quests = workingQuests;
  stateChanges.npcs = workingNpcs;
  stateChanges.items = workingItems;
  stateChanges.itemCatalog = workingCatalog;
  stateChanges.memories = workingMemories;
  stateChanges.lorebookEntries = workingLorebookEntries;
  stateChanges.statusEffects = workingStatus;
  stateChanges.factions = workingFactions;

  return { stateChanges, feedback, asyncTasks };
}
