/**
 * useGameStore.ts — 遊戲狀態中心（D5 + D6）
 *
 * D5：新增 schemaVersion + saveDataMapper + runMigrations，
 *     統一 loadFromData 與 useState 初始化邏輯。
 * D6：saveToStorage 改為寫入 IndexedDB（async，fire-and-forget 安全），
 *     useState 初始值統一用 saveDataMapper({}) 預設值，
 *     useEffect 非同步從 IndexedDB 載入真實存檔（含 localStorage 一次性遷移），
 *     暴露 isStoreReady 讓 App.tsx 在載入前顯示 loading 畫面。
 */
import { useState, useEffect, useRef } from 'react';
import {
  TimeState, Profile, Quest, Npc, NpcMemory, LorebookEntry, SystemPrompt,
  DiaryEntry, Message, MemoryEntry, EquipmentItem, ItemEntry,
} from '../types';
import {
  INITIAL_SYSTEM_PROMPT, INITIAL_LOREBOOK_ENTRIES,
  INITIAL_MESSAGES,
} from '../constants';
import * as gameDB from '../db/gameDB';

// ─── 存檔 Key（向下相容，IndexedDB 遷移後可選保留或移除）─────────────────────
export const SAVE_KEY = 'rpworld_save';

// ─── Schema 版本 ──────────────────────────────────────────────────────────────
// 每次有破壞性欄位變更時 +1，並在 MIGRATIONS 新增對應函數
const CURRENT_SCHEMA = 2;

// ─── 型別：儲存快照 ───────────────────────────────────────────────────────────
export interface GameSaveData {
  schemaVersion: number;          // D5 新增
  profile: Profile;
  systemPrompt: SystemPrompt;
  diaryEntries: DiaryEntry[];
  lorebookEntries: LorebookEntry[];
  npcs: Npc[];
  appearingNpcs: string[];
  equipment: EquipmentItem[];
  items: ItemEntry[];
  currentLocation: string;
  messages: Message[];
  memories: MemoryEntry[];
  quickOptions: string[];
  timeState: TimeState;
  quests: Quest[];
  adventureLog: string[];
  currentGoals: string[];
  summaryPool: string[];
  compressCount: number;
}

// ─── Migration helpers ────────────────────────────────────────────────────────
function migrateEquipment(raw: unknown[]): EquipmentItem[] {
  return raw.map((i: unknown) => {
    const item = i as Record<string, unknown>;
    return {
      id:          (item.id          as number)  ?? Date.now(),
      name:        (item.name        as string)  ?? '',
      description: (item.description as string)  ?? '',
      isEquipped:  (item.isEquipped  as boolean) ?? false,
    };
  });
}

function migrateItems(raw: unknown[]): ItemEntry[] {
  return raw.map((i: unknown) => {
    const item = i as Record<string, unknown>;
    return {
      id:          (item.id          as number) ?? Date.now(),
      name:        (item.name        as string) ?? '',
      quantity:    (item.quantity    as number) ?? 1,
      description: (item.description as string) ?? '',
    };
  });
}

function mapNpcs(raw: unknown): Npc[] {
  if (!Array.isArray(raw)) return [];
  return (raw as Npc[]).map(npc => ({
    ...npc,
    memories: Array.isArray(npc.memories)
      ? npc.memories.map((m: string | NpcMemory, i: number): NpcMemory =>
          typeof m === 'string'
            ? {
                id:         `nmem_legacy_${npc.id}_${i}`,
                text:        m,
                createdAt:  '—',
                source:     'manual'  as const,
                importance: 'normal'  as const,
              }
            : m
        )
      : [],
  }));
}

// ─── Version migrations ───────────────────────────────────────────────────────
// V0→V1：無結構變更（placeholder）
function migrateV0toV1(data: Record<string, unknown>): Record<string, unknown> {
  return data;
}

// V1→V2：inventory → equipment，consumables → items
function migrateV1toV2(data: Record<string, unknown>): Record<string, unknown> {
  const out = { ...data };
  if (!(Array.isArray(out.equipment) && (out.equipment as unknown[]).length > 0)) {
    if (Array.isArray(out.inventory) && (out.inventory as unknown[]).length > 0) {
      out.equipment = out.inventory;
    }
  }
  if (!(Array.isArray(out.items) && (out.items as unknown[]).length > 0)) {
    if (Array.isArray(out.consumables) && (out.consumables as unknown[]).length > 0) {
      out.items = out.consumables;
    }
  }
  delete out.inventory;
  delete out.consumables;
  return out;
}

const MIGRATIONS: Record<number, (d: Record<string, unknown>) => Record<string, unknown>> = {
  0: migrateV0toV1,
  1: migrateV1toV2,
};

function runMigrations(raw: Record<string, unknown>): Record<string, unknown> {
  let version = (raw.schemaVersion as number) ?? 0;
  let data = { ...raw };
  while (version < CURRENT_SCHEMA) {
    if (MIGRATIONS[version]) data = MIGRATIONS[version](data);
    version++;
  }
  return { ...data, schemaVersion: CURRENT_SCHEMA };
}

// ─── saveDataMapper：唯一欄位映射入口 ────────────────────────────────────────
// 接受任意 unknown 形狀（含空物件），回傳完整、型別安全的 GameSaveData。
export function saveDataMapper(raw: Record<string, unknown>): GameSaveData {
  const d = runMigrations(raw);

  const p = (d.profile as Partial<Profile>) || {};
  const t = (d.timeState as Partial<TimeState>) || {};

  return {
    schemaVersion:  CURRENT_SCHEMA,
    profile: {
      name:        p.name        || '',
      job:         p.job         || '異鄉人',
      appearance:  p.appearance  || '',
      personality: p.personality || '',
      other:       p.other       || '',
      hp:          p.hp          ?? 50,
      mp:          p.mp          ?? 0,
      gold:        p.gold        ?? 0,
    },
    systemPrompt:    (d.systemPrompt    as SystemPrompt)    || INITIAL_SYSTEM_PROMPT,
    diaryEntries:    (d.diaryEntries    as DiaryEntry[])    || [],
    lorebookEntries: (d.lorebookEntries as LorebookEntry[]) || INITIAL_LOREBOOK_ENTRIES,
    npcs:            mapNpcs(d.npcs),
    appearingNpcs:   (d.appearingNpcs   as string[])        || [],
    equipment:       Array.isArray(d.equipment)
                       ? migrateEquipment(d.equipment as unknown[])
                       : [],
    items:           Array.isArray(d.items)
                       ? migrateItems(d.items as unknown[])
                       : [],
    currentLocation: (d.currentLocation as string)          || '迷霧森林',
    messages:        (d.messages        as Message[])        || INITIAL_MESSAGES,
    memories:        (d.memories        as MemoryEntry[])    || [],
    quickOptions:    (d.quickOptions    as string[])         || ['觀察四周', '檢查自己', '大聲求助'],
    timeState: {
      year:    t.year    ?? 1024,
      month:   t.month   ?? 4,
      day:     t.day     ?? 15,
      hour:    t.hour    ?? 21,
      minute:  t.minute  ?? 30,
      weather: t.weather || '晴朗',
    },
    quests:       ((d.quests as Quest[]) || []).map(q => ({ isGoalMet: false, ...q })),
    adventureLog:  (d.adventureLog  as string[]) || [],
    currentGoals:  (d.currentGoals  as string[]) || [],
    summaryPool:   (d.summaryPool   as string[]) || [],
    compressCount: (d.compressCount as number)   || 0,
  };
}

// ─── 預設值（空存檔）────────────────────────────────────────────────────────────
const DEFAULTS = saveDataMapper({});

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useGameStore() {

  // ── State（全部初始值為預設值，useEffect 非同步覆寫真實存檔）─────────────────
  const [isStoreReady,    setIsStoreReady]    = useState(false);
  const [timeState,       setTimeState]       = useState<TimeState>(DEFAULTS.timeState);
  const [profile,         setProfile]         = useState<Profile>(DEFAULTS.profile);
  const [systemPrompt,    setSystemPrompt]    = useState<SystemPrompt>(DEFAULTS.systemPrompt);
  const [npcs,            setNpcs]            = useState<Npc[]>(DEFAULTS.npcs);
  const [appearingNpcs,   setAppearingNpcs]   = useState<string[]>(DEFAULTS.appearingNpcs);
  const [currentLocation, setCurrentLocation] = useState<string>(DEFAULTS.currentLocation);
  const [memories,        setMemories]        = useState<MemoryEntry[]>(DEFAULTS.memories);
  const [stickyCounters,   setStickyCounters]   = useState<Record<string, number>>({});
  const [cooldownCounters, setCooldownCounters] = useState<Record<string, number>>({});
  const [quests,          setQuests]          = useState<Quest[]>(DEFAULTS.quests);
  const [diaryEntries,    setDiaryEntries]    = useState<DiaryEntry[]>(DEFAULTS.diaryEntries);
  const [lorebookEntries, setLorebookEntries] = useState<LorebookEntry[]>(DEFAULTS.lorebookEntries);
  const [equipment,       setEquipment]       = useState<EquipmentItem[]>(DEFAULTS.equipment);
  const [items,           setItems]           = useState<ItemEntry[]>(DEFAULTS.items);
  const [messages,        setMessages]        = useState<Message[]>(DEFAULTS.messages);
  const [quickOptions,    setQuickOptions]    = useState<string[]>(DEFAULTS.quickOptions);
  const [adventureLog,    setAdventureLog]    = useState<string[]>(DEFAULTS.adventureLog);
  const [currentGoals,    setCurrentGoals]    = useState<string[]>(DEFAULTS.currentGoals);
  const [summaryPool,     setSummaryPool]     = useState<string[]>(DEFAULTS.summaryPool);
  const [compressCount,   setCompressCount]   = useState<number>(DEFAULTS.compressCount);

  // ── loadFromData：批次套用 saveDataMapper 的結果到 state ─────────────────────
  const loadFromData = (raw: Record<string, unknown>): void => {
    const d = saveDataMapper(raw);
    setProfile(d.profile);
    setSystemPrompt(d.systemPrompt);
    setDiaryEntries(d.diaryEntries);
    setLorebookEntries(d.lorebookEntries);
    setNpcs(d.npcs);
    setAppearingNpcs(d.appearingNpcs);
    setEquipment(d.equipment);
    setItems(d.items);
    setCurrentLocation(d.currentLocation);
    setMessages(d.messages);
    setMemories(d.memories);
    setQuickOptions(d.quickOptions);
    setTimeState(d.timeState);
    setQuests(d.quests);
    setAdventureLog(d.adventureLog);
    setCurrentGoals(d.currentGoals);
    setSummaryPool(d.summaryPool);
    setCompressCount(d.compressCount);
  };

  // ── D6：非同步初始化（IndexedDB，含 localStorage 一次性遷移）────────────────
  const initDoneRef = useRef(false);
  useEffect(() => {
    if (initDoneRef.current) return;   // StrictMode 防重複
    initDoneRef.current = true;

    (async () => {
      try {
        let raw = await gameDB.readSave(gameDB.SLOT_DEFAULT);

        if (!raw) {
          // 舊存檔在 localStorage → 遷移至 IndexedDB
          const lsRaw = localStorage.getItem(SAVE_KEY);
          if (lsRaw) {
            try {
              raw = JSON.parse(lsRaw) as Record<string, unknown>;
              const mapped = saveDataMapper(raw);
              await gameDB.writeSave(gameDB.SLOT_DEFAULT, mapped);
              localStorage.removeItem(SAVE_KEY);  // 遷移成功後清除
            } catch {
              // IndexedDB 寫入失敗：保留 localStorage，繼續使用 raw
            }
          }
        }

        if (raw) loadFromData(raw);
      } catch (err) {
        console.error('[useGameStore] IndexedDB 讀取失敗，嘗試 localStorage fallback', err);
        try {
          const lsRaw = localStorage.getItem(SAVE_KEY);
          if (lsRaw) loadFromData(JSON.parse(lsRaw));
        } catch { /* ignore */ }
      } finally {
        setIsStoreReady(true);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── saveToStorage：寫入 IndexedDB（async，fire-and-forget 安全）────────────
  const saveToStorage = (snapshot?: Partial<GameSaveData>): Promise<void> => {
    const saveData: GameSaveData = {
      schemaVersion: CURRENT_SCHEMA,
      profile, systemPrompt, diaryEntries, lorebookEntries,
      npcs, appearingNpcs,
      equipment, items,
      currentLocation, messages, memories, quickOptions,
      timeState, quests,
      adventureLog, currentGoals,
      summaryPool, compressCount,
      ...snapshot,
    };

    // 更新最後存檔時間（metadata，localStorage）
    localStorage.setItem('rpworld_last_saved', new Date().toISOString());

    return gameDB.writeSave(gameDB.SLOT_DEFAULT, saveData).catch(err => {
      // IndexedDB 失敗時 fallback 寫入 localStorage
      console.error('[saveToStorage] IndexedDB 失敗，fallback 至 localStorage', err);
      try { localStorage.setItem(SAVE_KEY, JSON.stringify(saveData)); } catch { /* ignore */ }
    });
  };

  return {
    // 初始化狀態
    isStoreReady,
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
    // 裝備 / 道具
    equipment, setEquipment,
    items, setItems,
    // 對話
    messages, setMessages,
    quickOptions, setQuickOptions,
    // 冒險狀態
    adventureLog, setAdventureLog,
    currentGoals, setCurrentGoals,
    summaryPool, setSummaryPool,
    compressCount, setCompressCount,
    // 儲存 / 載入
    saveToStorage,
    loadFromData,
  };
}
