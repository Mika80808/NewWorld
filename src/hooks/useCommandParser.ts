/**
 * useCommandParser Hook - Integration Layer
 * 整合 parse → reduce → effects 三層邏輯
 */

import React, { useEffect, useRef } from 'react';
import {
  Profile, Npc, Quest, LorebookEntry, MemoryEntry,
  EquipmentItem, ItemEntry, ItemCatalog, TimeState, Message, StatusEffect, Faction,
} from '../types';
import { parseCommandsToAST } from '../utils/commandParser';
import { reduceCommands } from '../utils/commandReducer';
import { applyStateChanges } from '../utils/commandEffects';
import { touchItemDef } from '../utils/itemCatalog';
import { touchMemories } from '../utils/memoryStore';
import { calculateTotalDays, getTotalDaysFromTimeState } from '../utils/timeUtils';

// ─── 型別定義 ──────────────────────────────────────────────────────────────────

export interface CommandParserDeps {
  // 讀取
  timeState: TimeState;
  profile: Profile;
  currentLocation: string;
  quests: Quest[];
  memories: MemoryEntry[];
  items: ItemEntry[];
  itemCatalog: ItemCatalog;
  npcs: Npc[];
  lorebookEntries: LorebookEntry[];
  statusEffects: StatusEffect[];
  factions: Faction[];
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
  setItemCatalog: React.Dispatch<React.SetStateAction<ItemCatalog>>;
  setNpcs: React.Dispatch<React.SetStateAction<Npc[]>>;
  setLorebookEntries: React.Dispatch<React.SetStateAction<LorebookEntry[]>>;
  setQuickOptions: React.Dispatch<React.SetStateAction<string[]>>;
  setStickyCounters: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  setCooldownCounters: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  setStatusEffects: React.Dispatch<React.SetStateAction<StatusEffect[]>>;
  setFactions: React.Dispatch<React.SetStateAction<Faction[]>>;

  // UI 回呼
  showToast: (msg: string) => void;
  notifyCommandResult: (messages: string[]) => void;
  onNewQuest?: () => void;
  callAI: (prompt: string, options?: { role?: 'main' | 'sub'; maxTokens?: number; onChunk?: (chunk: string) => void }) => Promise<string>;
}

export interface ParseResult {
  narrative: string;
  newItems: string[];
  /**
   * 本批指令套用「之後」的地點與日期（沒有 LOCATION / TIME 指令時即為原值）。
   *
   * 呼叫端在 await 之後拿不到這兩個值的最新版本：React state 要等重新渲染才更新，
   * 而 handleSendMessage 的閉包停在玩家送出當下。少了它們，AI 在同一則回應裡
   * 「移動玩家 + 讓 NPC 出場」時（例如「你走進酒館，看到芬里爾」），
   * 出場 NPC 的足跡會被蓋上**移動前**的地點。
   */
  location: string;
  /** 遊戲日期字串 `月/日`，與 Npc.lastSeenDate 同格式 */
  date: string;
}

export interface UseCommandParserReturn {
  parseAndExecuteCommands: (fullText: string) => Promise<ParseResult>;
  consumeItem: (itemName: string, qty?: number) => boolean;
  scanKeywords: (keywords: string[], depth?: number) => boolean;
  isMemoryTriggered: (mem: MemoryEntry, userInput: string, location: string) => boolean;
  tickMemoryCounters: (triggeredIds: string[]) => void;
}

// ─── Hook 實現 ──────────────────────────────────────────────────────────────────

export function useCommandParser(deps: CommandParserDeps): UseCommandParserReturn {
  // 這幾支（isMemoryTriggered / scanKeywords / consumeItem）都是在事件當下**同步**
  // 呼叫的，讀當次 render 的閉包即可；await 之後才跑的那兩支見下方 depsRef
  const {
    timeState, items, lorebookEntries,
    stickyCounters, cooldownCounters, messages,
    setItems, setItemCatalog,
    showToast,
  } = deps;

  /**
   * 最新值 ref。`parseAndExecuteCommands` 是在 `handleSendMessage` **await 完 AI 回應之後**
   * 才被呼叫的，而它是玩家按下送出那一次 render 產生的閉包——裡面的 `npcs`、`items`、
   * `lorebookEntries`⋯⋯全部停在送出當下。
   *
   * 串流期間（幾秒到 90 秒）玩家仍然可以開角色卡釘選、寫記憶、改設定集、丟道具、
   * 用地圖旅行（`handleTravel` 會先 `setCurrentLocation` 再送訊息）。reducer 拿舊快照算出
   * `stateChanges.npcs / items / lorebookEntries …`，`applyStateChanges` 再**整份**
   * `setNpcs(stateChanges.npcs)` 寫回去——等待期間的每一筆編輯就這樣被回應一到就洗掉，
   * 而畫面上什麼提示都沒有。旅行的 `known` 標記、剛釘選的角色、剛寫的記憶都會消失。
   *
   * 走 ref 才讀得到 commit 後的最新值（同 App.tsx 的 itemsRef / summaryPoolRef）。
   * 一律在 commit 後同步，不在 render 期間寫 ref（render 必須是純函數）。
   */
  const depsRef = useRef(deps);
  useEffect(() => {
    depsRef.current = deps;
  });

  // ─── 核心函數：parseAndExecuteCommands（整合三層邏輯）──────────────────────────

  const parseAndExecuteCommands = async (fullText: string): Promise<ParseResult> => {
    // 一律讀最新值，不讀閉包（理由見 depsRef 的說明）
    const {
      timeState, profile, currentLocation, quests, memories, items, itemCatalog, npcs, lorebookEntries,
      statusEffects, factions, stickyCounters, cooldownCounters, messages,
      setTimeState, setProfile, setCurrentLocation, setQuests, setMemories,
      setItems, setItemCatalog, setNpcs, setLorebookEntries,
      setStickyCounters, setCooldownCounters, setStatusEffects, setFactions,
      showToast, notifyCommandResult, callAI,
    } = depsRef.current;

    // Phase 1: Parse
    const { commands, narrative } = parseCommandsToAST(fullText);

    // Phase 2: Reduce（純函式，無副作用）
    const { stateChanges, feedback, asyncTasks } = reduceCommands(
      commands,
      {
        timeState,
        profile,
        quests,
        memories,
        npcs,
        items,
        itemCatalog,
        currentLocation,
        lorebookEntries,
        messages,
        stickyCounters,
        cooldownCounters,
        statusEffects,
        factions,
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
        setItemCatalog,
        setLorebookEntries,
        setCurrentLocation,
        setStickyCounters,
        setCooldownCounters,
        setStatusEffects,
        setFactions,
      },
      {
        showToast,
        notifyCommandResult,
        callAI: (prompt: string, role?: 'main' | 'sub') => callAI(prompt, role ? { role } : undefined),
      }
    );

    // Bug #3 fix: 改用名稱比對而非 id 比對（避免閉包舊快照誤判）
    const prevItemNames = new Set(items.map(i => i.name));
    const newItems = stateChanges.items
      ? stateChanges.items
          .filter(item => !prevItemNames.has(item.name))
          .map(item => item.name)
      : [];

    // 套用後的地點／日期：有對應指令就用算好的新值，否則沿用原值。
    // stateChanges.timeState 是 advanceTimeAndResolveQuestDeadlines 的結果（TIME 在
    // reduceCommands 最後才結算），所以這裡拿到的已經是推進過的時間。
    const resolvedLocation = stateChanges.currentLocation ?? currentLocation;
    const resolvedMonth = stateChanges.timeState?.month ?? timeState.month;
    const resolvedDay = stateChanges.timeState?.day ?? timeState.day;

    return {
      narrative,
      newItems,
      location: resolvedLocation,
      date: `${resolvedMonth}/${resolvedDay}`,
    };
  };

  // ─── 工具函數：記憶觸發判斷 ────────────────────────────────────────────────────

  const isMemoryTriggered = (mem: MemoryEntry, userInput: string, location: string): boolean => {
    if (!mem.isActive) return false;

    // 過期判斷：支援「年/月/日」與「月/日」兩種格式（月/日視為當前年度）
    if (mem.expiresAt) {
      const parts = mem.expiresAt.split('/').map(p => parseInt(p, 10));
      let expTotalDays: number | null = null;
      if (parts.length === 3 && parts.every(n => !isNaN(n))) {
        expTotalDays = calculateTotalDays(parts[0], parts[1], parts[2]);
      } else if (parts.length === 2 && parts.every(n => !isNaN(n))) {
        expTotalDays = calculateTotalDays(timeState.year, parts[0], parts[1]);
      }
      if (expTotalDays !== null && getTotalDaysFromTimeState(timeState) > expTotalDays) {
        return false;
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
    // 同 parseAndExecuteCommands：這支也是在 await 之後才被呼叫，讀最新值
    const { memories, setMemories, setStickyCounters, setCooldownCounters } = depsRef.current;

    // LRU 時間戳：讓 pruneMemories 能分辨「老但一直在用」與「老且沒人碰」。
    // touchMemories 在無實際變更時回傳原 reference，不會每回合白白產生新陣列。
    setMemories(prev => touchMemories(prev, triggeredIds));

    // 不在 updater 內呼叫另一個 setState（updater 必須是純函數）。
    // 改以區域變數捕捉遞減前的 sticky 值：useGameStore 中 stickyCounters 的
    // useState 宣告在 cooldownCounters 之前，因此 sticky 的 updater 會先執行，
    // 捕捉到的值在 cooldown 的 updater 執行時已就緒。
    let stickyBeforeTick: Record<string, number> = {};

    setStickyCounters(prev => {
      stickyBeforeTick = prev;
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

    setCooldownCounters(prevCooldown => {
      const updated = { ...prevCooldown };
      for (const id in updated) {
        updated[id] = Math.max(0, updated[id] - 1);
      }
      // 若 sticky 剛歸零（=1 → 0），且未被此回合觸發，進入 cooldown
      for (const id in stickyBeforeTick) {
        if (!triggeredIds.includes(id) && stickyBeforeTick[id] === 1) {
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

  const consumeItem = (itemName: string, qty: number = 1): boolean => {
    const item = items.find(i => i.name === itemName);
    if (!item || item.quantity < qty) {
      return false;
    }

    setItems(prev =>
      prev
        .map(i => (i.name === itemName ? { ...i, quantity: i.quantity - qty } : i))
        .filter(i => i.quantity > 0)
    );
    // 圖鑑記錄最近使用時間，供 LOD 淘汰排序
    setItemCatalog(prev => touchItemDef(prev, itemName));

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
    consumeItem,
    scanKeywords,
    isMemoryTriggered,
    tickMemoryCounters,
  };
}
