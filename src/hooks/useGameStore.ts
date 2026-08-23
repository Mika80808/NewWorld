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
import { generateQuestShortId } from '../utils/questShortId';
import {
  INITIAL_SYSTEM_PROMPT, INITIAL_LOREBOOK_ENTRIES,
  INITIAL_MESSAGES,
} from '../constants';

// ─── Schema 版本 ──────────────────────────────────────────────────────────────
export const CURRENT_SCHEMA = 10;

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
      isEquipped:  (item.isEquipped  as boolean) ?? false,
      // 沒有 description：說明只存圖鑑一份（schema v9），這裡再補一次就等於
      // 把剛移除的欄位又長回來
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
      // 同上：不要補 description 回來
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

// v4 → v5：NPC 勢力歸屬統一成 Npc.factionIds，把 Faction.npcIds 摺進去
//
// 先前同一份關係存在兩個地方各寫各的：FACTION_JOIN 指令寫 Npc.factionIds，
// 而勢力分頁的成員勾選寫 Faction.npcIds。UI 與地圖用 `A || B` 兩邊都認所以看起來
// 正常，但 promptBuilder 只讀 Npc.factionIds——玩家在勢力分頁手動勾的成員，
// AI 完全不知道。這裡把 npcIds 併進 factionIds 後移除，只留單一來源。
export function migrateV4toV5(data: Record<string, unknown>): Record<string, unknown> {
  const out = { ...data };
  const factions = Array.isArray(out.factions) ? (out.factions as Faction[]) : [];
  const npcs = Array.isArray(out.npcs) ? (out.npcs as Npc[]) : [];
  if (factions.length === 0) return out;

  const extra = new Map<number, number[]>();
  for (const f of factions) {
    for (const npcId of f.npcIds ?? []) {
      extra.set(npcId, [...(extra.get(npcId) ?? []), f.id]);
    }
  }

  if (extra.size > 0) {
    out.npcs = npcs.map(n => {
      const add = extra.get(n.id);
      if (!add) return n;
      return { ...n, factionIds: [...new Set([...(n.factionIds ?? []), ...add])] };
    });
  }
  // 移除舊欄位：留著只會讓人以為它還是有效來源。資料已完整搬到 factionIds，
  // 且舊版程式讀 npcIds 時本來就有 factionIds 的 fallback，回退也不會掉資料。
  out.factions = factions.map(f => {
    const { npcIds: _npcIds, ...rest } = f;
    return rest;
  });
  return out;
}

/**
 * v5 → v6：替只有設定集條目、沒有 `npcs[]` 紀錄的 NPC 補建紀錄。
 *
 * 「把 NPC 加進遊戲」本來就規定要建兩份資料（見 CLAUDE.md 注意事項 20），
 * 但舊存檔裡有一批角色只有設定集條目。這些角色是二等公民：
 *
 * - 「當前場景人物」讀的是 `npcs[]`，所以他們**永遠顯示不出來**，
 *   即使 AI 已經用 `[出場:]` 讓他們登場、prompt 也注入了他們
 * - 好感度永遠是 0、記憶庫存不進去
 * - 釘選沒有作用——`LorebookModal` 點卡片時會臨時捏一個 id 為**負數**的
 *   假 Npc 給角色卡用，那個 id 對不到 `npcs[]` 裡的任何人
 * - `promptBuilder` 候選名單的「足跡」來源也救不到他們，足跡存在 `npcs[]` 上
 *
 * 補建的紀錄一律 `affection: 0`、空記憶庫——這是新建角色的正常起點，
 * 而不是資料遺失（他們本來就從來沒有過好感度可言）。
 */
export function migrateV5toV6(data: Record<string, unknown>): Record<string, unknown> {
  const out = { ...data };
  const entries = Array.isArray(out.lorebookEntries) ? (out.lorebookEntries as LorebookEntry[]) : [];
  const npcs = Array.isArray(out.npcs) ? (out.npcs as Npc[]) : [];
  if (entries.length === 0) return out;

  const existing = new Set(npcs.map(n => n.name));
  const missing = entries.filter(e => e.category === 'NPC' && e.title && !existing.has(e.title));
  if (missing.length === 0) return out;

  // id 從既有最大值往上長，避免與現有 NPC 撞號
  let nextId = Math.max(0, ...npcs.map(n => n.id)) + 1;
  // 這裡產出的是**當時**的 Npc 形狀（身分欄位還在上面），之後會被 v9→v10
  // 摺進設定集並移除。不要把它改成現在的 Npc 型別——遷移鏈必須照當年的樣子走
  out.npcs = [
    ...npcs,
    ...missing.map((e): Record<string, unknown> => ({
      id: nextId++,
      name: e.title,
      job: e.job ?? '',
      affection: 0,
      appearance: e.appearance ?? '',
      personality: e.personality ?? '',
      gender: e.gender ?? '',
      race: e.race ?? '',
      age: e.age ?? '',
      backstory: e.backstory ?? '',
      other: e.other ?? '',
      category: 'NPC',
      isActive: true,
      isPinned: false,
      memories: [],
      thoughts: [],
    })),
  ];
  return out;
}

/**
 * v6 → v7：替既有任務補上短 ID。
 *
 * 短 ID 是給 AI 引用的（見 utils/questShortId.ts）。舊存檔裡的任務沒有這個欄位，
 * 補之前 prompt 會印不出 `#xxx`，那些任務就只能繼續走標題比對——也就是
 * 一直帶著原本那個 bug。因此在遷移時一次補齊，而不是等下次 QUEST_ADD。
 *
 * ⚠️ 要在**全部任務**中唯一，不只進行中的：已完成的任務仍留在存檔裡，
 * 讓新舊任務撿到同一組碼的話，AI 引用時就分不出是哪一個。
 */
export function migrateV6toV7(data: Record<string, unknown>): Record<string, unknown> {
  const out = { ...data };
  const quests = Array.isArray(out.quests) ? (out.quests as Quest[]) : [];
  if (quests.length === 0) return out;

  const taken = quests.map(q => q.shortId ?? '').filter(Boolean);
  out.quests = quests.map(q => {
    if (q.shortId) return q;                     // 已經有的不動
    const id = generateQuestShortId(taken);
    taken.push(id);
    return { ...q, shortId: id };
  });
  return out;
}

/**
 * v7 → v8：拆掉 `adventureLog`，左欄的「冒險摘要」改讀 `summaryPool` 的最後一則。
 *
 * 同一份摘要先前存了兩個地方——助理 GM 在同一個 if 區塊裡、相隔三行，
 * 把同一個 `data.summary` 分別寫進 `adventureLog`（左欄顯示）與 `summaryPool`
 * （送進 prompt 的前情提要）。`adventureLog` 而且永遠只有一個元素，
 * 宣告成 string[] 是歷史遺留。
 *
 * 兩者唯一真的會分岔的時刻是壓縮：`summaryPool` 滿 10 則會被換成一段壓縮紀錄，
 * 而 `adventureLog` 還留著壓縮前最後那則原文。所以這裡不能無腦丟掉——
 * 舊存檔剛好停在那個時間點時，那則原文只存在於 `adventureLog`。
 * 對不上 pool 尾端才補進去，避免重複。
 */
export function migrateV7toV8(data: Record<string, unknown>): Record<string, unknown> {
  const out = { ...data };
  const legacy = Array.isArray(out.adventureLog) ? (out.adventureLog as string[]) : [];
  const pool = Array.isArray(out.summaryPool) ? (out.summaryPool as string[]) : [];

  const latest = legacy.find(x => typeof x === 'string' && x.trim());
  if (latest && pool[pool.length - 1] !== latest) {
    out.summaryPool = [...pool, latest];
  }
  delete out.adventureLog;
  return out;
}

/**
 * v8 → v9：道具說明只留圖鑑一份。
 *
 * 說明先前存三份：`itemCatalog[name].description`（CLAUDE.md 寫明是「全遊戲
 * 只存一份」的 Master Data）、`ItemEntry.description`、`EquipmentItem.description`。
 * 而且**沒有任何地方讀圖鑑**——prompt 與 UI 全讀實例上的副本，圖鑑只在
 * ITEM_ADD 時寫入、複製一份進實例。「先寫先贏」於是只在建立那一刻成立。
 *
 * ⚠️ 必須先把實例的說明摺進圖鑑再刪欄位，否則舊存檔的道具說明會整批消失：
 * - `migrateV3toV4` 當年只從 `items[]` 建圖鑑，**沒有涵蓋 `equipment[]`**，
 *   所以純裝備的說明很可能只存在實例上
 * - 先寫先贏：圖鑑已有的名稱不被實例覆蓋；items 先於 equipment
 */
export function migrateV8toV9(data: Record<string, unknown>): Record<string, unknown> {
  const out = { ...data };
  const items = Array.isArray(out.items) ? (out.items as ItemEntry[]) : [];
  const equipment = Array.isArray(out.equipment) ? (out.equipment as EquipmentItem[]) : [];
  const base = (out.itemCatalog && typeof out.itemCatalog === 'object' && !Array.isArray(out.itemCatalog))
    ? (out.itemCatalog as ItemCatalog)
    : {};

  const now = Date.now();
  let catalog = buildCatalogFromItems(items as { name?: string; description?: string }[], now, base);
  catalog = buildCatalogFromItems(equipment as { name?: string; description?: string }[], now, catalog);
  out.itemCatalog = catalog;

  // 欄位移除。留著的話下一個人會以為它還是有效來源，然後又寫進去
  out.items = items.map(i => {
    const { description: _d, ...rest } = i as ItemEntry & { description?: string };
    return rest;
  });
  out.equipment = equipment.map(e => {
    const { description: _d, ...rest } = e as EquipmentItem & { description?: string };
    return rest;
  });
  return out;
}

/** v10 遷移要搬的身分欄位。`Npc` 上這些副本已於 v10 移除 */
const NPC_IDENTITY_FIELDS = [
  'gender', 'race', 'age', 'job', 'appearance', 'personality', 'backstory', 'other',
] as const;

/**
 * v9 → v10：NPC 身分設定只留設定集一份。
 *
 * 性別／種族／年齡／職業／外貌／個性／背景／備註原本 `Npc` 與 `LorebookEntry`
 * 兩邊都有，`NPC_NEW` 還會在同一個區塊裡把同一份值寫進兩邊。但**角色卡的編輯
 * 只寫設定集那份**（`NpcModal` → `onUpdateLorebook`），所以 `Npc` 上的副本是
 * 「建檔時寫一次、之後永遠不再更新」——與舊的 `Npc.affectionLabel` 同一個病。
 *
 * ⚠️ 搬移方向是 Npc → Lorebook，而且**設定集已有值的欄位不覆蓋**：那與
 * `resolveNpcProfile` 當時的優先序一致（lore 優先、空字串視為沒填），
 * 所以遷移前後玩家看到的內容不變。
 *
 * 沒有對應設定集條目的 NPC 會補建一條——只有 `npcs[]` 紀錄的角色進不了
 * prompt（CLAUDE.md 注意事項 20），身分欄位直接刪掉的話那些設定就真的沒了。
 */
export function migrateV9toV10(data: Record<string, unknown>): Record<string, unknown> {
  const out = { ...data };
  const npcs = Array.isArray(out.npcs) ? (out.npcs as Record<string, unknown>[]) : [];
  if (npcs.length === 0) return out;

  const entries = Array.isArray(out.lorebookEntries)
    ? [...(out.lorebookEntries as LorebookEntry[])]
    : [];
  let nextId = Math.max(0, ...entries.map(e => Number(e.id) || 0)) + 1;

  const nonEmpty = (v: unknown) => typeof v === 'string' && v.trim() !== '';

  for (const npc of npcs) {
    const name = npc.name as string;
    if (!name) continue;

    const idx = entries.findIndex(e => e.category === 'NPC' && e.title === name);
    const carried: Record<string, string> = {};
    for (const f of NPC_IDENTITY_FIELDS) {
      if (nonEmpty(npc[f])) carried[f] = npc[f] as string;
    }

    if (idx === -1) {
      entries.push({
        id: nextId++, title: name, content: '', category: 'NPC', isActive: true,
        ...carried,
      } as LorebookEntry);
    } else {
      const e = entries[idx] as unknown as Record<string, unknown>;
      const merged = { ...e };
      for (const [f, v] of Object.entries(carried)) {
        if (!nonEmpty(merged[f])) merged[f] = v;   // 設定集已有值就不覆蓋
      }
      entries[idx] = merged as unknown as LorebookEntry;
    }
  }

  out.lorebookEntries = entries;
  // 欄位移除。留著只會讓人以為它還是有效來源，然後又寫一份永遠不更新的副本
  out.npcs = npcs.map(npc => {
    const rest = { ...npc };
    for (const f of NPC_IDENTITY_FIELDS) delete rest[f];
    return rest;
  });
  return out;
}

const MIGRATIONS: Record<number, (d: Record<string, unknown>) => Record<string, unknown>> = {
  0: migrateV0toV1,
  1: migrateV1toV2,
  2: migrateV2toV3,
  3: migrateV3toV4,
  4: migrateV4toV5,
  5: migrateV5toV6,
  6: migrateV6toV7,
  7: migrateV7toV8,
  8: migrateV8toV9,
  9: migrateV9toV10,
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
    diaryEntries:    Array.isArray(d.diaryEntries)    ? d.diaryEntries    as DiaryEntry[]    : [],
    lorebookEntries: Array.isArray(d.lorebookEntries) ? d.lorebookEntries as LorebookEntry[] : INITIAL_LOREBOOK_ENTRIES,
    npcs:            mapNpcs(d.npcs),
    appearingNpcs:   Array.isArray(d.appearingNpcs)   ? d.appearingNpcs   as string[]        : [],
    equipment:       Array.isArray(d.equipment) ? migrateEquipment(d.equipment as unknown[]) : [],
    items:           Array.isArray(d.items)     ? migrateItems(d.items as unknown[])         : [],
    itemCatalog:     (d.itemCatalog as ItemCatalog) || {},
    currentLocation: (d.currentLocation as string)          || randomStart?.currentLocation || '迷霧森林',
    messages:        Array.isArray(d.messages)     ? d.messages     as Message[]     : INITIAL_MESSAGES,
    memories:        Array.isArray(d.memories)     ? d.memories     as MemoryEntry[] : [],
    quickOptions:    Array.isArray(d.quickOptions) ? d.quickOptions as string[]      : ['觀察四周', '檢查自己', '大聲求助'],
    timeState: {
      year:    t.year    ?? 1024,
      month:   t.month   ?? randomStart?.timeState.month   ?? 4,
      day:     t.day     ?? randomStart?.timeState.day     ?? 15,
      hour:    t.hour    ?? randomStart?.timeState.hour    ?? 21,
      minute:  t.minute  ?? randomStart?.timeState.minute  ?? 30,
      weather: t.weather || randomStart?.timeState.weather || '晴朗',
    },
    quests:       (Array.isArray(d.quests) ? d.quests as Quest[] : []).map(q => ({ isGoalMet: false, ...q })),
    // `|| []` 擋不掉「型別錯但 truthy」的值（例如助理 GM 回了字串的 goals），
    // 那種值會一路進到 GoalsPanel 的 .map 而白畫面，所以一律用 Array.isArray 驗
    currentGoals:  Array.isArray(d.currentGoals) ? d.currentGoals as string[] : [],
    summaryPool:   Array.isArray(d.summaryPool)  ? d.summaryPool  as string[] : [],
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
    setCurrentGoals(d.currentGoals);
    setSummaryPool(d.summaryPool);
    setCompressCount(d.compressCount);
    setStatusEffects(d.statusEffects);
    setFactions(d.factions);
  };

  // ── resetGame ─────────────────────────────────────────────────────────────────
  //
  // 「重置遊戲」＝把這一槽的**進度**清回全新遊戲，不是刪存檔。
  // 先前 App.tsx 的實作是「刪掉雲端槽 + reload」，而 reload 後的初始化會去讀
  // 「最新的那一槽」——只要玩家還有別的存檔槽，就會直接被載入，畫面上看到的是
  // 另一份舊進度，等於只刪了一個檔、遊戲根本沒重置。
  //
  // 保留玩家自己寫的設定（systemPrompt／設定集／手寫記憶／勢力／角色設定欄位），
  // 清掉所有由遊玩產生的東西（對話、道具、任務、日記、好感度、時間地點…）。
  //
  // ⚠️ 回傳「剛寫進 state 的那一份」給呼叫端上傳。呼叫端若改用 buildSaveSnapshot()
  // 會踩到與 handleImportSave 同一個坑：下面的 setState 要到次一次 render 才生效，
  // 當場組出來的快照仍是「重置前」的舊狀態，上傳等於把舊進度又寫回雲端。
  const resetGame = (): GameSaveData => {
    // 重新呼叫 saveDataMapper({}) 而不是用模組層的 DEFAULTS：DEFAULTS 是在模組載入時
    // 就把隨機開局算死的同一份，沿用它會讓每次重置都回到跟本次開場一模一樣的
    // 地點與時間。
    const fresh = saveDataMapper({});

    const data: GameSaveData = {
      ...fresh,
      // ── 保留：玩家自訂的世界設定 ──
      systemPrompt,
      lorebookEntries,
      factions,
      // 角色設定欄位是玩家自己捏的角色，屬於設定；HP／MP／金幣等數值才是進度，
      // 一律沿用 fresh 的初始值
      profile: {
        ...fresh.profile,
        name:        profile.name,
        job:         profile.job,
        appearance:  profile.appearance,
        personality: profile.personality,
        other:       profile.other,
      },
      // 手寫記憶等同玩家自己補的設定，保留；AI 在遊玩中生成的記憶是進度，清掉
      memories: memories.filter(m => m.source === 'manual'),
      // NPC 只清進度、不刪人。設定集的 NPC 條目被保留下來，若這裡把 npcs[] 清空，
      // 角色會進得了 prompt 卻沒有好感度紀錄，AFFINITY 指令也會靜默失效
      //（見 CLAUDE.md 注意事項 20：NPC 一定要兩份資料同時存在）
      npcs: npcs.map((n): Npc => ({
        ...n,
        affection: 0,
        memories: [],
        thoughts: [],
        relationship:     undefined,
        location:         undefined,
        lastSeenLocation: undefined,
        lastSeenDate:     undefined,
        isPinned: false,
      })),
    };

    loadFromData(data as unknown as Record<string, unknown>);
    // loadFromData 不管這兩個計數器（它們不進存檔），重置時得另外清，
    // 否則上一輪的 sticky／cooldown 會殘留到新遊戲的前幾回合
    setStickyCounters({});
    setCooldownCounters({});

    return data;
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
    currentGoals, setCurrentGoals,
    summaryPool, setSummaryPool,
    compressCount, setCompressCount,
    statusEffects, setStatusEffects,
    factions, setFactions, addFaction, updateFaction,
    buildSaveSnapshot,
    loadFromData,
    resetGame,
  };
}
