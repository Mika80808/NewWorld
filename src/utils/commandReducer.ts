/**
 * Command Reducer - Phase 2: Reduce Layer
 * 累積狀態變更對象，無副作用的純函式
 */

import { CommandAST } from './commandParser';
import { advanceTimeAndResolveQuestDeadlines } from './timeUtils';
import {
  TimeState, Profile, Quest, MemoryEntry, Npc, ItemEntry,
  LorebookEntry, Message, StatusEffect, Faction, NpcRelation,
} from '../types';

// ─── 狀態變更對象型別 ──────────────────────────────────────────────────────────

export interface StateChanges {
  profile?: Partial<Profile>;
  timeState?: Partial<TimeState>;
  quests?: Quest[];
  memories?: MemoryEntry[];
  npcs?: Npc[];
  items?: ItemEntry[];
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
    memories: MemoryEntry[];
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

  let hpDelta = 0;
  let mpDelta = 0;
  let goldDelta = 0;
  const affinityUpdates: Array<{ npcName: string; value: number }> = [];
  let timeDeltaMinutes = 0;

  let workingQuests = [...currentState.quests];
  let workingNpcs = [...currentState.npcs];
  let workingItems = [...currentState.items];
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
        stateChanges.currentLocation = cmd.parsed.location as string;
        feedback.cmdResults.push(`📍 移動至 ${cmd.parsed.location}`);
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
        const name = cmd.parsed.name as string;
        const quantity = (cmd.parsed.quantity as number) || 1;
        const description = cmd.parsed.description as string;
        const existingItem = workingItems.find(i => i.name === name);
        if (existingItem) {
          existingItem.quantity += quantity;
        } else {
          workingItems.push({ id: Date.now(), name, quantity, description });
        }
        feedback.cmdResults.push(`📦 獲得 ${name} ×${quantity}`);
        break;
      }

      case 'ITEM_REMOVE': {
        const name = cmd.parsed.name as string;
        const quantity = (cmd.parsed.quantity as number) || 1;
        const item = workingItems.find(i => i.name === name);
        if (item) {
          item.quantity -= quantity;
          if (item.quantity <= 0) workingItems = workingItems.filter(i => i.name !== name);
          feedback.cmdResults.push(`📦 移除 ${name} ×${quantity}`);
        }
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
              const existing = workingItems.find(i => i.name === itemName);
              if (existing) existing.quantity += 1;
              else workingItems.push({ id: Date.now(), name: itemName, quantity: 1, description: '完成任務獲得的獎勵' });
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
          if (!npc.name.includes(npcName.trim()) && !npcName.trim().includes(npc.name)) return npc;
          const updatedThoughts = [
            { text: thought, createdAt: `${currentState.timeState.month}/${currentState.timeState.day}` },
            ...(npc.thoughts || []),
          ];
          if (updatedThoughts.length > 10) {
            const mergedText = updatedThoughts.slice(0, 10).reverse().map(t => `[${t.createdAt}] ${t.text}`).join('；');
            const newMemory: MemoryEntry = {
              id: `nmem_${Date.now()}_${Math.random().toString(36).slice(2)}`,
              type: 'npc' as const, importance: 'normal' as const,
              content: `${npc.name} 的想法整理：${mergedText}`,
              tags: { locations: [], npcs: [npc.name], factions: [], keywords: [] },
              trigger: { scanDepth: 5, probability: 100, sticky: 0, cooldown: 0 },
              isActive: true, source: 'pre_merge' as const,
              createdAt: `${currentState.timeState.month}/${currentState.timeState.day}`,
            };
            workingMemories.push(newMemory);
            const unmergedCount = [...(npc.memories || []), newMemory].filter(m => !m.isMerged).length;
            if (unmergedCount > 3) {
              asyncTasks.push({
                type: 'merge_npc_memories',
                payload: { npcId: npc.id, npcName: npc.name, memories: [...(npc.memories || []), newMemory] },
              });
            }
            return { ...npc, thoughts: [], memories: [...(npc.memories || []), newMemory] };
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

      case 'UNKNOWN':
      default:
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
    workingNpcs = workingNpcs.map(npc => {
      const update = affinityUpdates.find(a => a.npcName === npc.name);
      return update ? { ...npc, affection: Math.max(-100, npc.affection + update.value) } : npc;
    });
  }

  stateChanges.quests = workingQuests;
  stateChanges.npcs = workingNpcs;
  stateChanges.items = workingItems;
  stateChanges.memories = workingMemories;
  stateChanges.lorebookEntries = workingLorebookEntries;
  stateChanges.statusEffects = workingStatus;
  stateChanges.factions = workingFactions;

  return { stateChanges, feedback, asyncTasks };
}
