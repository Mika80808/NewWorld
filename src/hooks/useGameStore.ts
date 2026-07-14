/**
 * useGameStore.ts — 遊戲狀態中心（D5 + Supabase + StatusEffect）
 *
 * D5：新增 schemaVersion + saveDataMapper + runMigrations，
 *     統一 loadFromData 與 useState 初始化邏輯。
 * Supabase：移除 IndexedDB（gameDB），改由 App.tsx 呼叫 useAuth.saveToCloud。
 *     buildSaveSnapshot 組裝快照供 App.tsx 傳給 saveToCloud。
 *     setIsStoreReady 由 App.tsx 在雲端載入完成後控制。
 * StatusEffect：新增 statusEffects state，存檔/載入同步更新。
 */
import { useState } from 'react';
import {
  TimeState, Profile, Quest, Npc, NpcMemory, LorebookEntry, SystemPrompt,
  DiaryEntry, Message, MemoryEntry, EquipmentItem, ItemEntry, ItemCatalog, StatusEffect, Faction,
} from '../types';
import { buildCatalogFromItems } from '../utils/itemCatalog';
import {
  INITIAL_SYSTEM_PROMPT, INITIAL_LOREBOOK_ENTRIES,
  INITIAL_MESSAGES,
} from '../constants';

// ─── Schema 版本 ──────────────────────────────────────────────────────────────
export const CURRENT_SCHEMA = 4;

// ─── 型別：儲存快照 ───────────────────────────────────────────────────────────
export interface GameSaveData {
  schemaVersion: number;
  profile: Profile;
  systemPrompt: SystemPrompt;
  diaryEntries: DiaryEntry[];
  lorebookEntries: LorebookEntry[];
  npcs: Npc[];
  appearingNpcs: string[];
  equipment: EquipmentItem[];
  items: ItemEntry[];
  itemCatalog: ItemCatalog;
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
  statusEffects: StatusEffect[];
  factions: Faction[];
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
function migrateV0toV1(data: Record<string, unknown>): Record<string, unknown> {
  return data;
}

function migrateV2toV3(data: Record<string, unknown>): Record<string, unknown> {
  const out = { ...data };
  if (!Array.isArray(out.factions)) {
    out.factions = [];
  }
  return out;
}

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

// v3 → v4：從既有背包 items[] 建立道具圖鑑（Master Data，先寫先贏）
function migrateV3toV4(data: Record<string, unknown>): Record<string, unknown> {
  const out = { ...data };
  if (!out.itemCatalog || typeof out.itemCatalog !== 'object' || Array.isArray(out.itemCatalog)) {
    out.itemCatalog = buildCatalogFromItems(
      Array.isArray(out.items) ? (out.items as ItemEntry[]) : []
    );
  }
  return out;
}

const MIGRATIONS: Record<number, (d: Record<string, unknown>) => Record<string, unknown>> = {
  0: migrateV0toV1,
  1: migrateV1toV2,
  2: migrateV2toV3,
  3: migrateV3toV4,
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

// ─── 新遊戲隨機初始狀態 ───────────────────────────────────────────────────────
function getRandomStartState(): { currentLocation: string; timeState: TimeState } {
  const locationEntries = INITIAL_LOREBOOK_ENTRIES.filter(e => e.category === '地點');
  const randomEntry = locationEntries[Math.floor(Math.random() * locationEntries.length)];
  const currentLocation = randomEntry?.title ?? '迷霧森林';

  const validHours = [5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23];
  const hour = validHours[Math.floor(Math.random() * validHours.length)];
  const minute = Math.floor(Math.random() * 60);

  const month = Math.floor(Math.random() * 12) + 1;
  const day = Math.floor(Math.random() * 28) + 1;

  const weathers: TimeState['weather'][] = ['晴朗', '陰天', '下雨', '下雪', '起霧'];
  const weather = weathers[Math.floor(Math.random() * weathers.length)];

  return {
    currentLocation,
    timeState: { year: 1024, month, day, hour, minute, weather },
  };
}

// ─── saveDataMapper：唯一欄位映射入口 ────────────────────────────────────────
export function saveDataMapper(raw: Record<string, unknown>): GameSaveData {
  const d = runMigrations(raw);

  const isNewGame = !d.currentLocation && !d.timeState;
  const randomStart = isNewGame ? getRandomStartState() : null;

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
      ...(p.maxHp != null ? { maxHp: p.maxHp } : {}),
      ...(p.maxMp != null ? { maxMp: p.maxMp } : {}),
    },
    systemPrompt:    (d.systemPrompt    as SystemPrompt)    || INITIAL_SYSTEM_PROMPT,
    diaryEntries:    (d.diaryEntries    as DiaryEntry[])    || [],
    lorebookEntries: (d.lorebookEntries as LorebookEntry[]) || INITIAL_LOREBOOK_ENTRIES,
    npcs:            mapNpcs(d.npcs),
    appearingNpcs:   (d.appearingNpcs   as string[])        || [],
    equipment:       Array.isArray(d.equipment) ? migrateEquipment(d.equipment as unknown[]) : [],
    items:           Array.isArray(d.items)     ? migrateItems(d.items as unknown[])         : [],
    itemCatalog:     (d.itemCatalog as ItemCatalog) || {},
    currentLocation: (d.currentLocation as string)          || randomStart?.currentLocation || '迷霧森林',
    messages:        (d.messages        as Message[])        || INITIAL_MESSAGES,
    memories:        (d.memories        as MemoryEntry[])    || [],
    quickOptions:    (d.quickOptions    as string[])         || ['觀察四周', '檢查自己', '大聲求助'],
    timeState: {
      year:    t.year    ?? 1024,
      month:   t.month   ?? randomStart?.timeState.month   ?? 4,
      day:     t.day     ?? randomStart?.timeState.day     ?? 15,
      hour:    t.hour    ?? randomStart?.timeState.hour    ?? 21,
      minute:  t.minute  ?? randomStart?.timeState.minute  ?? 30,
      weather: t.weather || randomStart?.timeState.weather || '晴朗',
    },
    quests:       ((d.quests as Quest[]) || []).map(q => ({ isGoalMet: false, ...q })),
    adventureLog:  (d.adventureLog  as string[]) || [],
    currentGoals:  (d.currentGoals  as string[]) || [],
    summaryPool:   (d.summaryPool   as string[]) || [],
    compressCount: (d.compressCount as number)   || 0,
    // 舊存檔無此欄位時給空陣列；同時拋棄舊 profile.status 字串欄位
    statusEffects: Array.isArray(d.statusEffects)
      ? (d.statusEffects as StatusEffect[])
      : [],
    factions: Array.isArray(d.factions)
      ? (d.factions as Faction[])
      : [],
  };
}

// ─── 預設值（空存檔）────────────────────────────────────────────────────────────
const DEFAULTS = saveDataMapper({});

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useGameStore() {

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
  const [itemCatalog,     setItemCatalog]     = useState<ItemCatalog>(DEFAULTS.itemCatalog);
  const [messages,        setMessages]        = useState<Message[]>(DEFAULTS.messages);
  const [quickOptions,    setQuickOptions]    = useState<string[]>(DEFAULTS.quickOptions);
  const [adventureLog,    setAdventureLog]    = useState<string[]>(DEFAULTS.adventureLog);
  const [currentGoals,    setCurrentGoals]    = useState<string[]>(DEFAULTS.currentGoals);
  const [summaryPool,     setSummaryPool]     = useState<string[]>(DEFAULTS.summaryPool);
  const [compressCount,   setCompressCount]   = useState<number>(DEFAULTS.compressCount);
  const [statusEffects,   setStatusEffects]   = useState<StatusEffect[]>(DEFAULTS.statusEffects);
  const [factions,        setFactions]        = useState<Faction[]>(DEFAULTS.factions);

  const addFaction = (faction: Faction) => setFactions(prev => [...prev, faction]);
  const updateFaction = (id: number, updates: Partial<Faction>) =>
    setFactions(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));

  // ── loadFromData ──────────────────────────────────────────────────────────────
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
    setItemCatalog(d.itemCatalog);
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
    setStatusEffects(d.statusEffects);
    setFactions(d.factions);
  };

  // ── buildSaveSnapshot ─────────────────────────────────────────────────────────
  const buildSaveSnapshot = (snapshot?: Partial<GameSaveData>): GameSaveData => {
    return {
      schemaVersion: CURRENT_SCHEMA,
      profile:         snapshot?.profile         ?? profile,
      systemPrompt:    snapshot?.systemPrompt    ?? systemPrompt,
      diaryEntries:    snapshot?.diaryEntries    ?? diaryEntries,
      lorebookEntries: snapshot?.lorebookEntries ?? lorebookEntries,
      npcs:            snapshot?.npcs            ?? npcs,
      appearingNpcs:   snapshot?.appearingNpcs   ?? appearingNpcs,
      equipment:       snapshot?.equipment       ?? equipment,
      items:           snapshot?.items           ?? items,
      itemCatalog:     snapshot?.itemCatalog     ?? itemCatalog,
      currentLocation: snapshot?.currentLocation ?? currentLocation,
      messages:        snapshot?.messages        ?? messages,
      memories:        snapshot?.memories        ?? memories,
      quickOptions:    snapshot?.quickOptions    ?? quickOptions,
      timeState:       snapshot?.timeState       ?? timeState,
      quests:          snapshot?.quests          ?? quests,
      adventureLog:    snapshot?.adventureLog    ?? adventureLog,
      currentGoals:    snapshot?.currentGoals    ?? currentGoals,
      summaryPool:     snapshot?.summaryPool     ?? summaryPool,
      compressCount:   snapshot?.compressCount   ?? compressCount,
      statusEffects:   snapshot?.statusEffects   ?? statusEffects,
      factions:        snapshot?.factions        ?? factions,
    };
  };

  return {
    isStoreReady, setIsStoreReady,
    timeState, setTimeState,
    profile, setProfile,
    systemPrompt, setSystemPrompt,
    npcs, setNpcs,
    appearingNpcs, setAppearingNpcs,
    currentLocation, setCurrentLocation,
    memories, setMemories,
    stickyCounters, setStickyCounters,
    cooldownCounters, setCooldownCounters,
    quests, setQuests,
    diaryEntries, setDiaryEntries,
    lorebookEntries, setLorebookEntries,
    equipment, setEquipment,
    items, setItems,
    itemCatalog, setItemCatalog,
    messages, setMessages,
    quickOptions, setQuickOptions,
    adventureLog, setAdventureLog,
    currentGoals, setCurrentGoals,
    summaryPool, setSummaryPool,
    compressCount, setCompressCount,
    statusEffects, setStatusEffects,
    factions, setFactions, addFaction, updateFaction,
    buildSaveSnapshot,
    loadFromData,
  };
}
