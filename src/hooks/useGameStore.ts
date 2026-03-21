import { useState } from 'react';
import {
  TimeState, Profile, Quest, Npc, NpcMemory, LorebookEntry, SystemPrompt,
  DiaryEntry, Message, MemoryEntry, EquipmentItem, ItemEntry,
} from '../types';
import {
  INITIAL_SYSTEM_PROMPT, INITIAL_LOREBOOK_ENTRIES,
  INITIAL_MESSAGES,
} from '../constants';

export const SAVE_KEY = 'rpworld_save';

function loadSave(): Record<string, unknown> | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

// ─── 型別：儲存快照 ───────────────────────────────────────────────────────────
export interface GameSaveData {
  profile: Profile;
  systemPrompt: SystemPrompt;
  diaryEntries: DiaryEntry[];
  lorebookEntries: LorebookEntry[];
  npcs: Npc[];
  appearingNpcs: string[];
  // 新欄位名
  equipment: EquipmentItem[];
  items: ItemEntry[];
  // 舊欄位名（向下相容，loadFromData 會處理）
  inventory?: unknown[];
  consumables?: unknown[];
  currentLocation: string;
  messages: Message[];
  memories: MemoryEntry[];
  quickOptions: string[];
  timeState: TimeState;
  quests: Quest[];
  adventureLog: string[];
  currentGoals: string[];
}

// ─── 舊存檔 EquipmentItem migrate helper ─────────────────────────────────────
// 舊 InventoryItem = { id, name, quantity, description }
// 新 EquipmentItem = { id, name, description, isEquipped }
function migrateEquipment(raw: unknown[]): EquipmentItem[] {
  return raw.map((i: unknown) => {
    const item = i as Record<string, unknown>;
    return {
      id: (item.id as number) ?? Date.now(),
      name: (item.name as string) ?? '',
      description: (item.description as string) ?? '',
      isEquipped: (item.isEquipped as boolean) ?? false,
    };
  });
}

// ─── 舊存檔 ItemEntry migrate helper ─────────────────────────────────────────
// 舊 ConsumableItem = { id, name, quantity, description, effect? }
// 新 ItemEntry      = { id, name, quantity, description }（移除 effect）
function migrateItems(raw: unknown[]): ItemEntry[] {
  return raw.map((i: unknown) => {
    const item = i as Record<string, unknown>;
    return {
      id: (item.id as number) ?? Date.now(),
      name: (item.name as string) ?? '',
      quantity: (item.quantity as number) ?? 1,
      description: (item.description as string) ?? '',
      // effect 欄位刻意丟棄
    };
  });
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useGameStore() {
  const _s = loadSave();

  // ── 時間 ───────────────────────────────────────────────────────────────────
  const [timeState, setTimeState] = useState<TimeState>(
    () => {
      const t = (_s?.timeState as Partial<TimeState>) || {};
      return {
        year: t.year ?? 1024,
        month: t.month ?? 4,
        day: t.day ?? 15,
        hour: t.hour ?? 21,
        minute: t.minute ?? 30,
        weather: t.weather || '晴朗',
      };
    }
  );

  // ── 玩家角色 ────────────────────────────────────────────────────────────────
  const [profile, setProfile] = useState<Profile>(
    () => {
      const p = (_s?.profile as Partial<Profile>) || {};
      return {
        name: p.name || '',
        job: p.job || '異鄉人',
        appearance: p.appearance || '',
        personality: p.personality || '',
        other: p.other || '',
        hp: p.hp ?? 50,
        mp: p.mp ?? 0,
        gold: p.gold ?? 0,
      };
    }
  );

  // ── 系統提示 ────────────────────────────────────────────────────────────────
  const [systemPrompt, setSystemPrompt] = useState<SystemPrompt>(
    () => (_s?.systemPrompt as SystemPrompt) || INITIAL_SYSTEM_PROMPT
  );

  // ── NPC ─────────────────────────────────────────────────────────────────────
  const [npcs, setNpcs] = useState<Npc[]>(
    () => {
      const raw = (_s?.npcs as Npc[]) || [];
      return raw.map(npc => ({
        ...npc,
        // migrate：舊存檔 memories 可能是 string[]，自動升級為 NpcMemory[]
        memories: Array.isArray(npc.memories)
          ? npc.memories.map((m: string | NpcMemory, i: number): NpcMemory =>
              typeof m === 'string'
                ? {
                    id: `nmem_legacy_${npc.id}_${i}`,
                    text: m,
                    createdAt: '—',
                    source: 'manual' as const,
                    importance: 'normal' as const,
                  }
                : m
            )
          : [],
      }));
    }
  );

  const [appearingNpcs, setAppearingNpcs] = useState<string[]>(
    () => (_s?.appearingNpcs as string[]) || []
  );

  // ── 地點 ────────────────────────────────────────────────────────────────────
  const [currentLocation, setCurrentLocation] = useState<string>(
    () => (_s?.currentLocation as string) || '迷霧森林'
  );

  // ── 記憶 ────────────────────────────────────────────────────────────────────
  const [memories, setMemories] = useState<MemoryEntry[]>(
    () => (_s?.memories as MemoryEntry[]) || []
  );
  // sticky / cooldown 計數器不儲存至 localStorage（每次重開重置）
  const [stickyCounters, setStickyCounters] = useState<Record<string, number>>({});
  const [cooldownCounters, setCooldownCounters] = useState<Record<string, number>>({});

  // ── 任務 ────────────────────────────────────────────────────────────────────
  const [quests, setQuests] = useState<Quest[]>(
    () => ((_s?.quests as Quest[]) || []).map(q => ({
      isGoalMet: false,   // 舊存檔 migrate：補預設值
      ...q,
    }))
  );

  // ── 日記 ────────────────────────────────────────────────────────────────────
  const [diaryEntries, setDiaryEntries] = useState<DiaryEntry[]>(
    () => (_s?.diaryEntries as DiaryEntry[]) || []
  );

  // ── 設定集 ──────────────────────────────────────────────────────────────────
  const [lorebookEntries, setLorebookEntries] = useState<LorebookEntry[]>(
    () => (_s?.lorebookEntries as LorebookEntry[]) || INITIAL_LOREBOOK_ENTRIES
  );

  // ── 裝備（新）────────────────────────────────────────────────────────────────
  // migrate：優先讀 equipment，若無則從舊 inventory 轉換
  const [equipment, setEquipment] = useState<EquipmentItem[]>(() => {
    if (Array.isArray(_s?.equipment) && (_s.equipment as unknown[]).length > 0) {
      return migrateEquipment(_s.equipment as unknown[]);
    }
    if (Array.isArray(_s?.inventory) && (_s.inventory as unknown[]).length > 0) {
      return migrateEquipment(_s.inventory as unknown[]);
    }
    return [];
  });

  // ── 道具（新）────────────────────────────────────────────────────────────────
  // migrate：優先讀 items，若無則從舊 consumables 轉換
  const [items, setItems] = useState<ItemEntry[]>(() => {
    if (Array.isArray(_s?.items) && (_s.items as unknown[]).length > 0) {
      return migrateItems(_s.items as unknown[]);
    }
    if (Array.isArray(_s?.consumables) && (_s.consumables as unknown[]).length > 0) {
      return migrateItems(_s.consumables as unknown[]);
    }
    return [];
  });

  // ── 對話訊息 ────────────────────────────────────────────────────────────────
  const [messages, setMessages] = useState<Message[]>(
    () => (_s?.messages as Message[]) || INITIAL_MESSAGES
  );
  const [quickOptions, setQuickOptions] = useState<string[]>(
    () => (_s?.quickOptions as string[]) || ['觀察四周', '檢查自己', '大聲求助']
  );

  const [adventureLog, setAdventureLog] = useState<string[]>(
    () => (_s?.adventureLog as string[]) || []
  );
  const [currentGoals, setCurrentGoals] = useState<string[]>(
    () => (_s?.currentGoals as string[]) || []
  );

  // ─── 儲存至 localStorage ──────────────────────────────────────────────────
  const saveToStorage = (snapshot?: Partial<GameSaveData>): void => {
    const saveData: GameSaveData = {
      profile, systemPrompt, diaryEntries, lorebookEntries,
      npcs, appearingNpcs,
      equipment, items,
      currentLocation, messages, memories, quickOptions,
      timeState, quests,
      adventureLog, currentGoals,
      ...snapshot,
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(saveData));
  };

  // ─── 從資料載入（匯入存檔用）─────────────────────────────────────────────
  const loadFromData = (saveData: Record<string, unknown>): void => {
    if (saveData.profile) {
      const p = saveData.profile as Partial<Profile>;
      setProfile({
        name: p.name || '',
        job: p.job || '異鄉人',
        appearance: p.appearance || '',
        personality: p.personality || '',
        other: p.other || '',
        hp: p.hp ?? 50,
        mp: p.mp ?? 0,
        gold: p.gold ?? 0,
      });
    }
    if (saveData.systemPrompt) setSystemPrompt(saveData.systemPrompt as SystemPrompt);
    if (saveData.diaryEntries) setDiaryEntries(saveData.diaryEntries as DiaryEntry[]);
    if (saveData.lorebookEntries) setLorebookEntries(saveData.lorebookEntries as LorebookEntry[]);
    if (saveData.npcs) {
      const rawNpcs = saveData.npcs as Npc[];
      setNpcs(rawNpcs.map(npc => ({
        ...npc,
        memories: Array.isArray(npc.memories)
          ? npc.memories.map((m: string | NpcMemory, i: number): NpcMemory =>
              typeof m === 'string'
                ? {
                    id: `nmem_legacy_${npc.id}_${i}`,
                    text: m,
                    createdAt: '—',
                    source: 'manual' as const,
                    importance: 'normal' as const,
                  }
                : m
            )
          : [],
      })));
    }
    if (saveData.appearingNpcs) setAppearingNpcs(saveData.appearingNpcs as string[]);
    if (saveData.currentLocation) setCurrentLocation(saveData.currentLocation as string);
    if (saveData.memories) setMemories(saveData.memories as MemoryEntry[]);
    if (saveData.messages) setMessages(saveData.messages as Message[]);
    if (saveData.quickOptions) setQuickOptions(saveData.quickOptions as string[]);
    if (saveData.timeState) {
      const t = saveData.timeState as Partial<TimeState>;
      setTimeState({
        year: t.year ?? 1024,
        month: t.month ?? 4,
        day: t.day ?? 15,
        hour: t.hour ?? 21,
        minute: t.minute ?? 30,
        weather: t.weather || '晴朗',
      });
    }
    if (saveData.adventureLog) setAdventureLog(saveData.adventureLog as string[]);
    if (saveData.currentGoals) setCurrentGoals(saveData.currentGoals as string[]);

    // 裝備：優先讀新欄位 equipment，否則 migrate 舊 inventory
    if (Array.isArray(saveData.equipment) && (saveData.equipment as unknown[]).length > 0) {
      setEquipment(migrateEquipment(saveData.equipment as unknown[]));
    } else if (Array.isArray(saveData.inventory) && (saveData.inventory as unknown[]).length > 0) {
      setEquipment(migrateEquipment(saveData.inventory as unknown[]));
    } else {
      setEquipment([]);
    }

    // 道具：優先讀新欄位 items，否則 migrate 舊 consumables
    if (Array.isArray(saveData.items) && (saveData.items as unknown[]).length > 0) {
      setItems(migrateItems(saveData.items as unknown[]));
    } else if (Array.isArray(saveData.consumables) && (saveData.consumables as unknown[]).length > 0) {
      setItems(migrateItems(saveData.consumables as unknown[]));
    } else {
      setItems([]);
    }

    if (saveData.quests) setQuests(
      (saveData.quests as Quest[]).map(q => ({ isGoalMet: false, ...q }))
    );
  };

  return {
    // 時間
    timeState, setTimeState,
    // 玩家
    profile, setProfile,
    // 系統提示
    systemPrompt, setSystemPrompt,
    // NPC
    npcs, setNpcs,
    appearingNpcs, setAppearingNpcs,
    // 地點
    currentLocation, setCurrentLocation,
    // 記憶
    memories, setMemories,
    stickyCounters, setStickyCounters,
    cooldownCounters, setCooldownCounters,
    // 任務
    quests, setQuests,
    // 日記
    diaryEntries, setDiaryEntries,
    // 設定集
    lorebookEntries, setLorebookEntries,
    // 裝備 / 道具（新名稱）
    equipment, setEquipment,
    items, setItems,
    // 對話
    messages, setMessages,
    quickOptions, setQuickOptions,
    // 冒險狀態
    adventureLog, setAdventureLog,
    currentGoals, setCurrentGoals,
    // 儲存 / 載入
    saveToStorage,
    loadFromData,
  };
}
