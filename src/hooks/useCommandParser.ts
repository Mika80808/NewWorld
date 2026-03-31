/**
 * useCommandParser Hook - Integration Layer
 * 整合 parse → reduce → effects 三層邏輯
 */

import React from 'react';
import {
  Profile, Npc, Quest, LorebookEntry, MemoryEntry,
  EquipmentItem, ItemEntry, TimeState, Message, PendingQuestFailure, StatusEffect,
} from '../types';
import { parseCommandsToAST } from '../utils/commandParser';
import { reduceCommands } from '../utils/commandReducer';
import { applyStateChanges } from '../utils/commandEffects';

// ─── 型別定義 ──────────────────────────────────────────────────────────────────

export interface CommandParserDeps {
  // 讀取
  timeState: TimeState;
  profile: Profile;
  currentLocation: string;
  quests: Quest[];
  memories: MemoryEntry[];
  items: ItemEntry[];
  npcs: Npc[];
  lorebookEntries: LorebookEntry[];
  stickyCounters: Record<string, number>;
  cooldownCounters: Record<string, number>;
  messages: Message[];

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
  statusEffects: StatusEffect[];
  setStatusEffects: React.Dispatch<React.SetStateAction<StatusEffect[]>>;

  // UI 回呼
  showToast: (msg: string) => void;
  notifyCommandResult: (messages: string[]) => void;
  onNewQuest?: () => void;
  callAI: (prompt: string, options?: { role?: 'main' | 'sub'; maxTokens?: number; onChunk?: (chunk: string) => void }) => Promise<string>;
}

export interface ParseResult {
  narrative: string;
  newItems: string[];
  newFailures: PendingQuestFailure[];
}

export interface UseCommandParserReturn {
  parseAndExecuteCommands: (fullText: string) => Promise<ParseResult>;
  useItem: (itemName: string, qty?: number) => boolean;
  scanKeywords: (keywords: string[], depth?: number) => boolean;
  isMemoryTriggered: (mem: MemoryEntry, userInput: string, location: string) => boolean;
  tickMemoryCounters: (triggeredIds: string[]) => void;
}

// ─── Hook 實現 ──────────────────────────────────────────────────────────────────

export function useCommandParser(deps: CommandParserDeps): UseCommandParserReturn {
  const {
    timeState, profile, currentLocation, quests, memories, items, npcs, lorebookEntries,
    stickyCounters, cooldownCounters, messages, statusEffects,
    setTimeState, setProfile, setCurrentLocation, setQuests, setMemories,
    setEquipment, setItems, setNpcs, setLorebookEntries, setQuickOptions,
    setStickyCounters, setCooldownCounters, setStatusEffects,
    showToast, notifyCommandResult, callAI,
  } = deps;

  // ─── 核心函數：parseAndExecuteCommands（整合三層邏輯）──────────────────────────

  const parseAndExecuteCommands = async (fullText: string): Promise<ParseResult> => {
    // Phase 1: Parse
    const { commands, narrative } = parseCommandsToAST(fullText);

    // Phase 2: Reduce（純函式，無副作用）
    const { stateChanges, feedback, asyncTasks, newFailures } = reduceCommands(
      commands,
      {
        timeState,
        profile,
        quests,
        memories,
        npcs,
        items,
        currentLocation,
        lorebookEntries,
        messages,
        stickyCounters,
        cooldownCounters,
        statusEffects,
      }
    );

    // Phase 3: Effects（應用所有副作用）
    await applyStateChanges(
      stateChanges,
      feedback,
      asyncTasks,
      {
        setProfile,
        setTimeState,
        setQuests,
        setMemories,
        setNpcs,
        setItems,
        setLorebookEntries,
        setCurrentLocation,
        setStickyCounters,
        setCooldownCounters,
        setStatusEffects,
      },
      {
        showToast,
        notifyCommandResult,
        callAI: (prompt: string, role?: 'main' | 'sub') => callAI(prompt, role ? { role } : undefined),
      }
    );

    // 提取新增的道具名稱（供 updateAdventureState 使用）
    const newItems = stateChanges.items
      ? stateChanges.items
          .filter(item => !deps.items.some(existing => existing.id === item.id))
          .map(item => item.name)
      : [];

    return { narrative, newItems, newFailures };
  };

  // ─── 工具函數：記憶觸發判斷 ────────────────────────────────────────────────────

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
    if (locTags.length > 0 && mem.type !== 'world') {
      const locationEntry = lorebookEntries.find(e => e.category === '地點' && e.title === location);
      const locationAliases = (locationEntry as any)?.aliases || [];
      const allNames = [location, ...locationAliases];
      if (!locTags.some(l => allNames.includes(l))) {
        return false;
      }
    }

    // 關鍵字比對
    const kwTags = mem.tags?.keywords || [];
    const scanText = messages.slice(-(mem.trigger?.scanDepth ?? 5)).map(m => m.text).join(' ')
      + ' ' + userInput + ' ' + location;
    if (kwTags.length > 0 && !kwTags.some(k => scanText.toLowerCase().includes(k.toLowerCase()))) {
      return false;
    }

    // 概率
    const prob = mem.trigger?.probability ?? 100;
    return Math.random() * 100 < prob;
  };

  // ─── 工具函數：記憶計數器更新 ─────────────────────────────────────────────────

  const tickMemoryCounters = (triggeredIds: string[]) => {
    setStickyCounters(prev => {
      const updated = { ...prev };
      for (const id of triggeredIds) {
        const mem = memories.find(m => m.id === id);
        if (mem && mem.trigger?.sticky) {
          updated[id] = mem.trigger.sticky;
        }
      }
      // 遞減所有 sticky 計數器
      for (const id in updated) {
        updated[id] = Math.max(0, updated[id] - 1);
      }
      return updated;
    });

    setCooldownCounters(prev => {
      const updated = { ...prev };
      // 遞減所有 cooldown 計數器
      for (const id in updated) {
        updated[id] = Math.max(0, updated[id] - 1);
        // 若 sticky 剛變 0，則進入 cooldown
        if (!triggeredIds.includes(id) && stickyCounters[id] === 1) {
          const mem = memories.find(m => m.id === id);
          if (mem && mem.trigger?.cooldown) {
            updated[id] = mem.trigger.cooldown;
          }
        }
      }
      return updated;
    });
  };

  // ─── 工具函數：使用道具 ────────────────────────────────────────────────────────

  const useItem = (itemName: string, qty: number = 1): boolean => {
    const item = items.find(i => i.name === itemName);
    if (!item || item.quantity < qty) {
      return false;
    }

    setItems(prev =>
      prev
        .map(i => (i.name === itemName ? { ...i, quantity: i.quantity - qty } : i))
        .filter(i => i.quantity > 0)
    );

    showToast(`🎒 使用了 ${itemName} ×${qty}`);
    return true;
  };

  // ─── 工具函數：掃描關鍵字 ──────────────────────────────────────────────────────

  const scanKeywords = (keywords: string[], depth: number = 5): boolean => {
    const recentText = messages.slice(-depth).map(m => m.text).join(' ').toLowerCase();
    return keywords.some(k => recentText.includes(k.toLowerCase()));
  };

  // ─── 回傳所有暴露的函數 ─────────────────────────────────────────────────────────

  return {
    parseAndExecuteCommands,
    useItem,
    scanKeywords,
    isMemoryTriggered,
    tickMemoryCounters,
  };
}
