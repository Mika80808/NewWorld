import { useState } from 'react';
import {
  TimeState, Profile, Quest, Npc, LorebookEntry, SystemPrompt,
  DiaryEntry, Message, WorldMap, MemoryEntry, InventoryItem, ConsumableItem, NpcMemory,
} from '../types';
import {
  INITIAL_SYSTEM_PROMPT, INITIAL_LOREBOOK_ENTRIES,
  INITIAL_WORLD_MAP, INITIAL_MESSAGES,
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
  inventory: InventoryItem[];
  consumables: ConsumableItem[];
  currentLocation: string;
  messages: Message[];
  memories: MemoryEntry[];
  quickOptions: string[];
  timeState: TimeState;
  quests: Quest[];
  worldMap: WorldMap;
  adventureLog: string[];
  currentGoals: string[];
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

// 注意：NpcMemory 需要從 types 引入，請在 useGameStore.ts 的 import 裡補上：
// import { ..., NpcMemory } from '../types';

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

  // ── 道具 ────────────────────────────────────────────────────────────────────
  const [inventory, setInventory] = useState<InventoryItem[]>(
    () => (_s?.inventory as InventoryItem[]) || []
  );
  const [consumables, setConsumables] = useState<ConsumableItem[]>(
    () => (_s?.consumables as ConsumableItem[]) || []
  );

  // ── 對話訊息 ────────────────────────────────────────────────────────────────
  const [messages, setMessages] = useState<Message[]>(
    () => (_s?.messages as Message[]) || INITIAL_MESSAGES
  );
  const [quickOptions, setQuickOptions] = useState<string[]>(
    () => (_s?.quickOptions as string[]) || ['觀察四周', '檢查自己', '大聲求助']
  );

  // ── 世界地圖 ────────────────────────────────────────────────────────────────
  const [worldMap, setWorldMap] = useState<WorldMap>(
    () => (_s?.worldMap as WorldMap) || INITIAL_WORLD_MAP
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
      npcs, appearingNpcs, inventory, consumables,
      currentLocation, messages, memories, quickOptions,
      timeState, quests, worldMap,
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
    if (saveData.npcs) setNpcs(saveData.npcs as Npc[]);
    if (saveData.appearingNpcs) setAppearingNpcs(saveData.appearingNpcs as string[]);
    if (saveData.inventory) setInventory(saveData.inventory as InventoryItem[]);
    if (saveData.consumables) setConsumables(saveData.consumables as ConsumableItem[]);
    if (saveData.currentLocation) setCurrentLocation(saveData.currentLocation as string);
    if (saveData.messages) setMessages(saveData.messages as Message[]);
    if (saveData.worldMap) setWorldMap(saveData.worldMap as WorldMap);
    if (saveData.adventureLog) setAdventureLog(saveData.adventureLog as string[]);
    if (saveData.currentGoals) setCurrentGoals(saveData.currentGoals as string[]);

    if (saveData.memories) {
      setMemories(saveData.memories as MemoryEntry[]);
    } else {
      // ── 舊存檔自動轉換 ────────────────────────────────────────────────────
      const migrated: MemoryEntry[] = [];
      const nowStr = '（已匯入）';
      const defaults = {
        trigger: { scanDepth: 5, probability: 100, sticky: 0, cooldown: 0 },
        isActive: true as const, source: 'manual' as const, createdAt: nowStr,
      };
      ((saveData.worldMemory as string[]) || []).forEach(text => migrated.push({
        id: `mig_w_${Date.now()}_${Math.random()}`,
        type: 'world', importance: 'critical', content: text,
        tags: { locations: [], npcs: [], factions: [], keywords: [] }, ...defaults,
      }));
      ((saveData.factionMemory as { name: string; memories: string[] }[]) || []).forEach(f => {
        (f.memories || []).forEach(text => migrated.push({
          id: `mig_f_${Date.now()}_${Math.random()}`,
          type: 'world', importance: 'normal', content: `[${f.name}] ${text}`,
          tags: { locations: [], npcs: [], factions: [f.name], keywords: [] }, ...defaults,
        }));
      });
      ((saveData.locationMemory as { name: string; memories: string[] }[]) || []).forEach(loc => {
        (loc.memories || []).forEach(text => migrated.push({
          id: `mig_l_${Date.now()}_${Math.random()}`,
          type: 'scene', importance: 'normal', content: text,
          tags: { locations: [loc.name], npcs: [], factions: [], keywords: [] }, ...defaults,
        }));
      });
      if (migrated.length > 0) setMemories(migrated);
    }

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
    // 道具
    inventory, setInventory,
    consumables, setConsumables,
    // 對話
    messages, setMessages,
    quickOptions, setQuickOptions,
    // 地圖
    worldMap, setWorldMap,
    // 冒險狀態
    adventureLog, setAdventureLog,
    currentGoals, setCurrentGoals,
    // 儲存 / 載入
    saveToStorage,
    loadFromData,
  };
}
