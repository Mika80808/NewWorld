/**
 * Command Effects - Phase 3: Effects Layer
 * 應用所有副作用：setState、UI 反饋、異步任務
 */

import React from 'react';
import { StateChanges, Feedback, AsyncTask } from './commandReducer';
import { TimeState, Profile, Quest, MemoryEntry, Npc, ItemEntry, LorebookEntry } from '../types';

// ─── 副作用依賴型別 ────────────────────────────────────────────────────────────

export interface Setters {
  setProfile: React.Dispatch<React.SetStateAction<Profile>>;
  setTimeState: React.Dispatch<React.SetStateAction<TimeState>>;
  setQuests: React.Dispatch<React.SetStateAction<Quest[]>>;
  setMemories: React.Dispatch<React.SetStateAction<MemoryEntry[]>>;
  setNpcs: React.Dispatch<React.SetStateAction<Npc[]>>;
  setItems: React.Dispatch<React.SetStateAction<ItemEntry[]>>;
  setLorebookEntries: React.Dispatch<React.SetStateAction<LorebookEntry[]>>;
  setCurrentLocation: React.Dispatch<React.SetStateAction<string>>;
  setStickyCounters: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  setCooldownCounters: React.Dispatch<React.SetStateAction<Record<string, number>>>;
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
    }
  }
}

// ─── 異步任務實現 ──────────────────────────────────────────────────────────────

/**
 * 觸發 NPC 記憶融合（異步調用 AI）
 */
async function triggerNpcMemoryMerge(
  payload: {
    npcId: number;
    npcName: string;
    memories: MemoryEntry[];
  },
  setters: Setters,
  callbacks: Callbacks
): Promise<void> {
  const { npcId, npcName, memories } = payload;

  // 篩選未融合的記憶
  const unmergedMemories = memories.filter(m => !m.isMerged);

  if (unmergedMemories.length === 0) {
    return;
  }

  // 構建融合提示詞
  const memoryTexts = unmergedMemories.map(m => m.content).join('\n\n');
  const mergePrompt = `以下是 NPC "${npcName}" 的多條記憶，請將其融合為一條簡潔、通俗易懂的句子，保留關鍵信息：

${memoryTexts}

請只回傳融合後的記憶內容，不要加任何前綴或解釋。`;

  try {
    // 調用 AI 進行融合
    const mergedContent = await callbacks.callAI(mergePrompt, 'sub');

    // 創建融合後的記憶條目
    const mergedMemory: MemoryEntry = {
      id: `nmem_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      type: 'npc' as const,
      importance: 'normal' as const,
      content: mergedContent.trim(),
      tags: {
        locations: [],
        npcs: [npcName],
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
      source: 'merged' as const,
      createdAt: new Date().toISOString(),
      isNew: true,
      mergedFrom: unmergedMemories.map(m => m.id),
    };

    // 標記原有記憶為已融合，並添加融合後的記憶
    setters.setNpcs(prev =>
      prev.map(npc =>
        npc.id === npcId
          ? {
              ...npc,
              memories: [
                ...(npc.memories || []).map(m =>
                  unmergedMemories.some(um => um.id === m.id)
                    ? { ...m, isMerged: true }
                    : m
                ),
                mergedMemory,
              ],
            }
          : npc
      )
    );

    callbacks.showToast(`✨ 融合了 ${npcName} 的 ${unmergedMemories.length} 條記憶`);
  } catch (error) {
    console.error('NPC memory merge failed:', error);
    throw error;
  }
}
