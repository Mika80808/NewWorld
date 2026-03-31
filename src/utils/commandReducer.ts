/**
 * Command Reducer - Phase 2: Reduce Layer
 * 累積狀態變更對象，無副作用的純函式
 */

import { CommandAST } from './commandParser';
import { advanceTimeAndResolveQuestDeadlines } from './timeUtils';
import {
  TimeState, Profile, Quest, MemoryEntry, Npc, ItemEntry,
  LorebookEntry, Message, PendingQuestFailure, StatusEffect,
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
  newFailures: PendingQuestFailure[];
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
}

// ─── Main Reduce Function ──────────────────────────────────────────────────────

/**
 * 將解析後的指令累積為狀態變更對象（純函式）
 * @param commands 解析後的指令陣列
 * @param currentState 當前遊戲狀態
 * @returns { stateChanges, feedback, asyncTasks }
 */
export function reduceCommands(
  commands: CommandAST[],
  currentState: CurrentState
): ReduceResult {
  // 初始化累積變數
  const stateChanges: StateChanges = {};
  const feedback: Feedback = {
    toasts: [],
    cmdResults: [],
  };
  const asyncTasks: AsyncTask[] = [];
  let newFailures: PendingQuestFailure[] = [];

  // 數值累積變數（最後一次性應用）
  let hpDelta = 0;
  let mpDelta = 0;
  let goldDelta = 0;
  const affinityUpdates: Array<{ npcName: string; value: number }> = [];
  let timeDeltaMinutes = 0;

  // 複製現有列表（避免直接修改）
  let workingQuests = [...currentState.quests];
  let workingNpcs = [...currentState.npcs];
  let workingItems = [...currentState.items];
  let workingMemories = [...currentState.memories];
  let workingLorebookEntries = [...currentState.lorebookEntries];
  let workingStatusEffects = [...(currentState.statusEffects || [])];

  // ─── 遍歷指令，累積變更 ────────────────────────────────────────────────────────

  for (const cmd of commands) {
    switch (cmd.type) {
      // ═══ HP / MP / GOLD（延遲應用）
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

      // ═══ TIME（推進時間 + 檢查期限）
      case 'TIME': {
        const minutes = (cmd.parsed.minutes as number) || 0;
        timeDeltaMinutes += minutes;
        break;
      }

      // ═══ LOCATION
      case 'LOCATION': {
        stateChanges.currentLocation = cmd.parsed.location as string;
        feedback.cmdResults.push(`📍 移動至 ${cmd.parsed.location}`);
        break;
      }

      // ═══ AFFINITY
      case 'AFFINITY': {
        const npcName = cmd.parsed.npcName as string;
        const value = cmd.parsed.value as number;
        affinityUpdates.push({ npcName, value });
        feedback.cmdResults.push(`💕 ${npcName} 好感度 ${value > 0 ? '+' : ''}${value}`);
        break;
      }

      // ═══ ITEM_ADD
      case 'ITEM_ADD': {
        const name = cmd.parsed.name as string;
        const quantity = (cmd.parsed.quantity as number) || 1;
        const description = cmd.parsed.description as string;

        const existingItem = workingItems.find(i => i.name === name);
        if (existingItem) {
          existingItem.quantity += quantity;
        } else {
          workingItems.push({
            id: Date.now(),
            name,
            quantity,
            description,
          });
        }
        feedback.cmdResults.push(`📦 獲得 ${name} ×${quantity}`);
        break;
      }

      // ═══ ITEM_REMOVE
      case 'ITEM_REMOVE': {
        const name = cmd.parsed.name as string;
        const quantity = (cmd.parsed.quantity as number) || 1;

        const item = workingItems.find(i => i.name === name);
        if (item) {
          item.quantity -= quantity;
          if (item.quantity <= 0) {
            workingItems = workingItems.filter(i => i.name !== name);
          }
          feedback.cmdResults.push(`📦 移除 ${name} ×${quantity}`);
        }
        break;
      }

      // ═══ QUEST_ADD
      case 'QUEST_ADD': {
        const title = cmd.parsed.title as string;
        const giver = cmd.parsed.giver as string;
        const description = cmd.parsed.description as string;
        const gold = (cmd.parsed.gold as number) || 0;
        const items = (cmd.parsed.items as string[]) || [];
        const deadline = cmd.parsed.deadline as number | undefined;

        // 檢查重複
        if (!workingQuests.some(q => q.title === title)) {
          const createdAtTotalDays =
            currentState.timeState.year * 360 +
            (currentState.timeState.month - 1) * 30 +
            currentState.timeState.day;

          workingQuests.push({
            id: `quest_${Date.now()}_${Math.floor(Math.random() * 9999)}`,
            title,
            giver,
            description,
            reward: {
              gold: gold > 0 ? gold : undefined,
              items: items.length > 0 ? items : undefined,
            },
            ...(deadline ? { deadline } : {}),
            status: 'active' as const,
            isGoalMet: false,
            createdAt: `${currentState.timeState.month}/${currentState.timeState.day}`,
            createdAtTotalDays,
          });
          feedback.cmdResults.push(`📋 新任務：${title}`);
        }
        break;
      }

      // ═══ QUEST_GOAL_MET
      case 'QUEST_GOAL_MET': {
        const title = cmd.parsed.title as string;
        workingQuests = workingQuests.map(q =>
          q.title === title && q.status === 'active'
            ? { ...q, isGoalMet: true }
            : q
        );
        feedback.cmdResults.push(`✅ ${title}（目標達成，待玩家回報）`);
        break;
      }

      // ═══ QUEST_COMPLETE
      case 'QUEST_COMPLETE': {
        const title = cmd.parsed.title as string;
        const quest = workingQuests.find(q => q.title === title && q.status === 'active');

        if (quest) {
          // 發放獎勵
          if (quest.reward?.gold && quest.reward.gold > 0) {
            goldDelta += quest.reward.gold;
            feedback.cmdResults.push(`💰 完成獎勵：+${quest.reward.gold} 金幣`);
          }

          if (quest.reward?.items && quest.reward.items.length > 0) {
            quest.reward.items.forEach(itemName => {
              const existingItem = workingItems.find(i => i.name === itemName);
              if (existingItem) {
                existingItem.quantity += 1;
              } else {
                workingItems.push({
                  id: Date.now(),
                  name: itemName,
                  quantity: 1,
                  description: '完成任務獲得的獎勵',
                });
              }
            });
            feedback.cmdResults.push(`📦 獎勵物品：${quest.reward.items.join('、')}`);
          }

          // 標記完成
          workingQuests = workingQuests.map(q =>
            q.title === title && q.status === 'active'
              ? {
                  ...q,
                  status: 'completed' as const,
                  completedAt: `${currentState.timeState.month}/${currentState.timeState.day}`,
                }
              : q
          );
          feedback.cmdResults.push(`✅ 任務完成：${title}`);
        }
        break;
      }

      // ═══ NPC_THOUGHT
      case 'NPC_THOUGHT': {
        const npcName = cmd.parsed.npcName as string;
        const thought = cmd.parsed.thought as string;

        workingNpcs = workingNpcs.map(npc => {
          if (!npc.name.includes(npcName.trim()) && !npcName.trim().includes(npc.name)) {
            return npc;
          }

          const updatedThoughts = [
            { text: thought, createdAt: `${currentState.timeState.month}/${currentState.timeState.day}` },
            ...(npc.thoughts || []),
          ];

          // 如果想法超過 10 則，串接到記憶
          if (updatedThoughts.length > 10) {
            const mergedText = updatedThoughts
              .slice(0, 10)
              .reverse()
              .map(t => `[${t.createdAt}] ${t.text}`)
              .join('；');

            const newMemory: MemoryEntry = {
              id: `nmem_${Date.now()}_${Math.random().toString(36).slice(2)}`,
              type: 'npc' as const,
              importance: 'normal' as const,
              content: `${npc.name} 的想法整理：${mergedText}`,
              tags: {
                locations: [],
                npcs: [npc.name],
                factions: [],
                keywords: [],
              },
              trigger: {
                scanDepth: 5,
                probability: 100,
                sticky: 0,
                cooldown: 0,
              },
              isActive: true,
              source: 'pre_merge' as const,
              createdAt: `${currentState.timeState.month}/${currentState.timeState.day}`,
            };

            workingMemories.push(newMemory);

            // 檢查是否需要觸發 AI 融合
            const unmergedCount = [...(npc.memories || []), newMemory].filter(m => !m.isMerged).length;
            if (unmergedCount > 3) {
              asyncTasks.push({
                type: 'merge_npc_memories',
                payload: {
                  npcId: npc.id,
                  npcName: npc.name,
                  memories: [...(npc.memories || []), newMemory],
                },
              });
            }

            return { ...npc, thoughts: [], memories: [...(npc.memories || []), newMemory] };
          }

          return { ...npc, thoughts: updatedThoughts };
        });

        break;
      }

      // ═══ NPC_LOCATION
      case 'NPC_LOCATION': {
        const npcName = cmd.parsed.npcName as string;
        const location = cmd.parsed.location as string;

        // 更新 lorebookEntries（若為 NPC 類）
        workingLorebookEntries = workingLorebookEntries.map(e => {
          if (e.category === 'NPC' && e.title === npcName) {
            const roamLocs = [...(e.roamLocations || [])];
            // 保持最多 3 個活動地點
            if (!roamLocs.includes(location)) {
              roamLocs.unshift(location);
              if (roamLocs.length > 3) roamLocs.pop();
            }
            return { ...e, roamLocations: roamLocs };
          }
          return e;
        });

        // 更新 npcs
        workingNpcs = workingNpcs.map(npc =>
          npc.name === npcName
            ? { ...npc, location, lastSeenLocation: location, lastSeenDate: `${currentState.timeState.month}/${currentState.timeState.day}` }
            : npc
        );

        feedback.cmdResults.push(`👤 ${npcName} 現在在 ${location}`);
        break;
      }

      case 'STATUS_ADD': {
        const { id, name, emoji, duration, description } = cmd.parsed as {
          id: string; name: string; emoji: string; duration: number; description?: string;
        };
        // 若已存在相同 id，覆蓋
        workingStatusEffects = workingStatusEffects.filter(s => s.id !== id);
        workingStatusEffects.push({ id, name, emoji, duration, description });
        feedback.cmdResults.push(`${emoji} 獲得狀態：${name}${duration === -1 ? '（永久）' : ` ×${duration}`}`);
        break;
      }

      case 'STATUS_REMOVE': {
        const { id } = cmd.parsed as { id: string };
        const removed = workingStatusEffects.find(s => s.id === id);
        workingStatusEffects = workingStatusEffects.filter(s => s.id !== id);
        if (removed) feedback.cmdResults.push(`✨ 狀態解除：${removed.name}`);
        break;
      }

      case 'STATUS_CLEAR': {
        if (workingStatusEffects.length > 0) {
          feedback.cmdResults.push('✨ 所有狀態異常已清除');
        }
        workingStatusEffects = [];
        break;
      }

      case 'UNKNOWN':
      default:
        // 未知指令，跳過
        break;
    }
  }

  // ─── 最後統一應用延遲的數值變更和時間推進 ─────────────────────────────────

  // 應用 HP / MP / GOLD 累積
  if (hpDelta !== 0 || mpDelta !== 0 || goldDelta !== 0) {
    stateChanges.profile = {
      hp: Math.max(0, currentState.profile.hp + hpDelta),
      mp: Math.max(0, currentState.profile.mp + mpDelta),
      gold: Math.max(0, currentState.profile.gold + goldDelta),
    };
  }

  // 應用時間推進
  if (timeDeltaMinutes > 0) {
    const { newTimeState, updatedQuests, cmdResults, newFailures: timeFailures } = advanceTimeAndResolveQuestDeadlines(
      currentState.timeState,
      timeDeltaMinutes,
      workingQuests
    );
    stateChanges.timeState = newTimeState;
    workingQuests = updatedQuests;
    feedback.cmdResults.push(...cmdResults);
    newFailures = timeFailures;
  }

  // 應用好感度變更
  if (affinityUpdates.length > 0) {
    workingNpcs = workingNpcs.map(npc => {
      const update = affinityUpdates.find(a => a.npcName === npc.name);
      if (update) {
        return { ...npc, affection: Math.max(-100, npc.affection + update.value) };
      }
      return npc;
    });
  }

  // 時間推進時遞減 statusEffects duration，移除歸零的
  if (timeDeltaMinutes > 0) {
    const expired: string[] = [];
    workingStatusEffects = workingStatusEffects
      .map(s => {
        if (s.duration === -1) return s; // 永久
        const next = s.duration - 1;
        if (next <= 0) { expired.push(s.name); return null; }
        return { ...s, duration: next };
      })
      .filter((s): s is StatusEffect => s !== null);
    expired.forEach(name => feedback.cmdResults.push(`✨ 狀態結束：${name}`));
  }

  // 應用工作副本到 stateChanges
  stateChanges.quests = workingQuests;
  stateChanges.npcs = workingNpcs;
  stateChanges.items = workingItems;
  stateChanges.memories = workingMemories;
  stateChanges.lorebookEntries = workingLorebookEntries;
  stateChanges.statusEffects = workingStatusEffects;

  return { stateChanges, feedback, asyncTasks, newFailures };
}
