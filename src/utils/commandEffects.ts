/**
 * Command Effects - Phase 3: Effects Layer
 * 應用所有副作用：setState、UI 反饋、異步任務
 */

import React from 'react';
import { StateChanges, Feedback, AsyncTask, isMergeable } from './commandReducer';
import { TimeState, Profile, Quest, MemoryEntry, Npc, ItemEntry, ItemCatalog, LorebookEntry, StatusEffect, Faction, NpcMemory } from '../types';

// ─── 副作用依賴型別 ────────────────────────────────────────────────────────────

export interface Setters {
  setProfile: React.Dispatch<React.SetStateAction<Profile>>;
  setTimeState: React.Dispatch<React.SetStateAction<TimeState>>;
  setQuests: React.Dispatch<React.SetStateAction<Quest[]>>;
  setMemories: React.Dispatch<React.SetStateAction<MemoryEntry[]>>;
  setNpcs: React.Dispatch<React.SetStateAction<Npc[]>>;
  setItems: React.Dispatch<React.SetStateAction<ItemEntry[]>>;
  setItemCatalog: React.Dispatch<React.SetStateAction<ItemCatalog>>;
  setLorebookEntries: React.Dispatch<React.SetStateAction<LorebookEntry[]>>;
  setCurrentLocation: React.Dispatch<React.SetStateAction<string>>;
  setStickyCounters: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  setCooldownCounters: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  setStatusEffects: React.Dispatch<React.SetStateAction<StatusEffect[]>>;
  setFactions: React.Dispatch<React.SetStateAction<Faction[]>>;
}

export interface Callbacks {
  showToast: (msg: string) => void;
  notifyCommandResult: (msgs: string[]) => void;
  callAI: (prompt: string, role?: 'main' | 'sub') => Promise<string>;
}

// ─── Main Effects Function ────────────────────────────────────────────────────

/**
 * 應用所有狀態變更和副作用（集中在此處）
 * @param stateChanges 狀態變更對象
 * @param feedback 反饋訊息和 toast
 * @param asyncTasks 異步任務隊列
 * @param setters 所有 setState 函數
 * @param callbacks UI 和 AI 回調
 * @returns Promise（等待所有異步任務完成）
 */
export async function applyStateChanges(
  stateChanges: StateChanges,
  feedback: Feedback,
  asyncTasks: AsyncTask[],
  setters: Setters,
  callbacks: Callbacks
): Promise<void> {
  // ─── Phase 1: 應用所有 setState ────────────────────────────────────────────────

  if (stateChanges.profile) {
    setters.setProfile(prev => ({ ...prev, ...stateChanges.profile }));
  }

  if (stateChanges.timeState) {
    setters.setTimeState(prev => ({ ...prev, ...stateChanges.timeState }));
  }

  if (stateChanges.quests !== undefined) {
    setters.setQuests(stateChanges.quests);
  }

  if (stateChanges.memories !== undefined) {
    setters.setMemories(stateChanges.memories);
  }

  if (stateChanges.npcs !== undefined) {
    setters.setNpcs(stateChanges.npcs);
  }

  if (stateChanges.items !== undefined) {
    setters.setItems(stateChanges.items);
  }

  if (stateChanges.itemCatalog !== undefined) {
    setters.setItemCatalog(stateChanges.itemCatalog);
  }

  if (stateChanges.lorebookEntries !== undefined) {
    setters.setLorebookEntries(stateChanges.lorebookEntries);
  }

  if (stateChanges.currentLocation) {
    setters.setCurrentLocation(stateChanges.currentLocation);
  }

  if (stateChanges.stickyCounters !== undefined) {
    setters.setStickyCounters(stateChanges.stickyCounters);
  }

  if (stateChanges.cooldownCounters !== undefined) {
    setters.setCooldownCounters(stateChanges.cooldownCounters);
  }

  if (stateChanges.statusEffects !== undefined) {
    setters.setStatusEffects(stateChanges.statusEffects);
  }

  if (stateChanges.factions !== undefined) {
    setters.setFactions(stateChanges.factions);
  }

  // ─── Phase 2: 顯示 UI 反饋 ────────────────────────────────────────────────────

  // 顯示 toast 訊息
  feedback.toasts.forEach(msg => callbacks.showToast(msg));

  // 通知所有命令結果
  if (feedback.cmdResults.length > 0) {
    callbacks.notifyCommandResult(feedback.cmdResults);
  }

  // ─── Phase 3: 執行異步任務 ────────────────────────────────────────────────────

  for (const task of asyncTasks) {
    if (task.type === 'merge_npc_memories') {
      try {
        await triggerNpcMemoryMerge(task.payload, setters, callbacks);
      } catch (error) {
        console.error('Failed to merge NPC memories:', error);
        callbacks.showToast(`❌ NPC 記憶融合失敗：${task.payload.npcName}`);
      }
    } else if (task.type === 'condense_npc_thoughts') {
      try {
        await triggerThoughtCondense(task.payload, setters, callbacks);
      } catch (error) {
        // 失敗不提示玩家：記憶已經以原文形式寫進去了，這只是「沒能變短」，
        // 不是資料遺失。跳一個紅色 toast 只會讓人以為想法沒被記錄
        console.error('Failed to condense NPC thoughts:', error);
      }
    }
  }
}

// ─── 異步任務實現 ──────────────────────────────────────────────────────────────

/**
 * 想法打包後先濃縮一次。
 *
 * 打包本身是把 10 則想法**原文**用「；」串起來，實測約 1000 字，而且劇情密度
 * 很高（玩家回報）。那一大塊之後會整塊進 `[記憶庫]`，模型讀到的是一長串
 * 措辭雷同的流水帳。這裡把它換成一段濃縮過的文字。
 *
 * ⚠️ 記憶已經由 reducer **同步寫進去了**（原文版），這裡只負責換掉 `text`。
 * 換不成就維持原文——那是保底，不是錯誤路徑。反過來做（等 AI 回來才寫）的話，
 * AI 失敗或沒設 API Key 時那 10 則想法已經從 `thoughts[]` 清空，會直接遺失。
 */
async function triggerThoughtCondense(
  payload: {
    npcId: number;
    npcName: string;
    memoryId: string;
    thoughts: { text: string; createdAt: string }[];
  },
  setters: Setters,
  callbacks: Callbacks
): Promise<void> {
  const { npcId, npcName, memoryId, thoughts } = payload;
  if (thoughts.length === 0) return;

  const span = thoughts.length > 1
    ? `${thoughts[0].createdAt}～${thoughts[thoughts.length - 1].createdAt}`
    : thoughts[0].createdAt;

  // 這段文字會**寫進存檔**並在之後每回合注入主 GM，所以語言、人稱、長度都要講死：
  // 少講一項，模型就會自己決定，而它的決定會沿著記憶鏈一路擴散下去
  const prompt = `以下是 RPG 角色「${npcName}」在 ${span} 期間的內心想法，依時間排列。
請濃縮成一段連貫的回憶記錄。

規則：
- 使用**繁體中文**（台灣用語）
- 保留所有具體事實：發生什麼事、對誰、做了什麼決定、態度有何轉變
- 合併重複與措辭雷同的部分，刪去純情緒的贅述
- 以「${npcName}」的**第一人稱**書寫，維持他原本的語氣
- **200 字以內**，直接輸出文字，不要標題、編號或任何說明

想法原文：
${thoughts.map((t, i) => `${i + 1}. [${t.createdAt}] ${t.text}`).join('\n')}`;

  const condensed = (await callbacks.callAI(prompt, 'sub')).trim();
  // callAI 在 API key 未設定時回傳空字串而非 throw。少了這道防護會把整條記憶
  // 清成空字串——那 10 則想法就真的消失了（同 triggerNpcMemoryMerge 的防護）
  if (!condensed) return;

  setters.setNpcs(prev =>
    prev.map(npc =>
      npc.id === npcId
        ? {
            ...npc,
            memories: (npc.memories || []).map(m =>
              m.id === memoryId ? { ...m, text: condensed } : m
            ),
          }
        : npc
    )
  );
}

/**
 * 觸發 NPC 記憶融合（異步調用 AI）
 */
async function triggerNpcMemoryMerge(
  payload: {
    npcId: number;
    npcName: string;
    memories: NpcMemory[];
    gameDate: string;
  },
  setters: Setters,
  callbacks: Callbacks
): Promise<void> {
  const { npcId, npcName, memories, gameDate } = payload;

  // 只融合 AI 產出的 pre_merge / merged；玩家手寫的（含 ★ 核心）保留原文
  const mergeableMemories = memories.filter(isMergeable);

  if (mergeableMemories.length === 0) {
    return;
  }

  // 構建融合提示詞（NpcMemory 用 .text 欄位）
  const memoryTexts = mergeableMemories.map(m => m.text).join('\n\n');
  const mergePrompt = `以下是 NPC "${npcName}" 的多條記憶，請將其融合為一條簡潔、通俗易懂的句子，保留關鍵信息：

${memoryTexts}

請只回傳融合後的記憶內容，不要加任何前綴或解釋。`;

  try {
    // 調用 AI 進行融合
    const mergedContent = await callbacks.callAI(mergePrompt, 'sub');

    // callAI 在 API key 未設定時回傳空字串而非 throw。少了這道防護，
    // 會寫入一條空記憶並把原文全數標記為已封存，等於該 NPC 的記憶被無聲清空。
    if (!mergedContent.trim()) {
      throw new Error('EMPTY_MERGE_RESULT');
    }

    // 創建融合後的 NpcMemory 條目
    const mergedMemory: NpcMemory = {
      id: `nmem_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      text: mergedContent.trim(),
      importance: 'normal',
      source: 'merged',
      createdAt: gameDate,
      isMerged: false,
      mergedFrom: mergeableMemories.map(m => m.id),
    };

    // 標記原有記憶為已融合，並添加融合後的記憶
    setters.setNpcs(prev =>
      prev.map(npc =>
        npc.id === npcId
          ? {
              ...npc,
              memories: [
                ...(npc.memories || []).map(m =>
                  mergeableMemories.some(mm => mm.id === m.id)
                    ? { ...m, isMerged: true }
                    : m
                ),
                mergedMemory,
              ],
            }
          : npc
      )
    );

    callbacks.showToast(`✨ 融合了 ${npcName} 的 ${mergeableMemories.length} 條記憶`);
  } catch (error) {
    console.error('NPC memory merge failed:', error);
    throw error;
  }
}
