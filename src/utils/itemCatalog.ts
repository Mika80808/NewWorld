/**
 * itemCatalog.ts — 道具圖鑑（Master Data 層）純函數
 *
 * 單機遊戲「主資料表」模式：道具定義（名稱＋介紹）全遊戲只存一份，
 * 背包 items[] 只是實例（名稱引用＋數量）。
 * - 去重採先寫先贏（first-write-wins）：同名道具再次出現時沿用既有定義，
 *   AI 重新生成的描述會被忽略，確保全遊戲描述一致。
 * - 查詢以名稱為主鍵（Record key），O(1)，AI 不參與查重。
 * - LOD 淘汰：圖鑑超過上限時，淘汰最久未使用且不在背包中的條目。
 */
import { ItemCatalog, ItemDef } from '../types';

/** 圖鑑條目上限，超過時觸發 LRU 淘汰 */
export const MAX_CATALOG_SIZE = 300;

/** 注入 prompt 的已知物品名稱上限（只注入名稱，不含描述） */
export const KNOWN_ITEMS_PROMPT_LIMIT = 30;

/** 名稱正規化：去頭尾空白、全形空白與連續空白摺疊，作為圖鑑主鍵 */
export function normalizeItemName(name: string): string {
  return name.replace(/[\s\u3000]+/g, ' ').trim();
}

/**
 * 先寫先贏登錄：已存在 → 沿用既有定義（只更新 lastUsedAt）；
 * 不存在 → 以本次描述登錄新定義。
 * 回傳的 def.description 即實例應使用的描述。
 */
export function registerItemDef(
  catalog: ItemCatalog,
  name: string,
  description: string,
  createdAt: string,
  now: number = Date.now(),
): { catalog: ItemCatalog; def: ItemDef } {
  const existing = catalog[name];
  const def: ItemDef = existing
    ? { ...existing, lastUsedAt: now }
    : { name, description, createdAt, lastUsedAt: now };
  return { catalog: { ...catalog, [name]: def }, def };
}

/**
 * 讀取道具描述的**唯一入口**。
 *
 * ⚠️ 描述先前存了三份：圖鑑（這裡，CLAUDE.md 寫明是「全遊戲只存一份」的
 * Master Data）、`ItemEntry.description`（背包）、`EquipmentItem.description`
 * （裝備）。而且沒有任何地方讀圖鑑——prompt 與 UI 全部讀實例上的副本，
 * 圖鑑只在 ITEM_ADD 時被寫入、然後複製一份進實例。
 *
 * 結果是「先寫先贏」只在**建立那一刻**成立：圖鑑之後被改動，背包裡的舊實例
 * 不會跟著變。實例的 description 欄位已於 schema v9 移除，一律查這裡。
 *
 * 查不到時回空字串而不是 undefined——呼叫端多半直接串進字串模板，
 * 回 undefined 會讓玩家看到「未知道具（undefined）」。
 */
export function describeItem(catalog: ItemCatalog, name: string): string {
  return catalog[normalizeItemName(name || '')]?.description ?? '';
}

/** 更新 lastUsedAt（道具被使用、移除時），條目不存在則原樣回傳 */
export function touchItemDef(
  catalog: ItemCatalog,
  name: string,
  now: number = Date.now(),
): ItemCatalog {
  const existing = catalog[name];
  if (!existing) return catalog;
  return { ...catalog, [name]: { ...existing, lastUsedAt: now } };
}

/**
 * LOD 淘汰：條目數超過 max 時，依 lastUsedAt 由舊到新淘汰，
 * protectedNames（背包內道具）永不淘汰。
 */
export function pruneItemCatalog(
  catalog: ItemCatalog,
  protectedNames: Set<string>,
  max: number = MAX_CATALOG_SIZE,
): ItemCatalog {
  const defs = Object.values(catalog);
  if (defs.length <= max) return catalog;
  const evictable = defs
    .filter(d => !protectedNames.has(d.name))
    .sort((a, b) => a.lastUsedAt - b.lastUsedAt);
  const toEvict = new Set(evictable.slice(0, defs.length - max).map(d => d.name));
  if (toEvict.size === 0) return catalog;
  const next: ItemCatalog = {};
  for (const d of defs) {
    if (!toEvict.has(d.name)) next[d.name] = d;
  }
  return next;
}

/** 供 prompt 注入的已知物品名稱切片（最近使用優先） */
export function selectKnownItemNames(
  catalog: ItemCatalog,
  limit: number = KNOWN_ITEMS_PROMPT_LIMIT,
): string[] {
  return Object.values(catalog)
    .sort((a, b) => b.lastUsedAt - a.lastUsedAt)
    .slice(0, limit)
    .map(d => d.name);
}

/**
 * 存檔遷移：把帶有 name / description 的實例摺進圖鑑（先寫先贏）。
 *
 * 背包與裝備兩種實例都吃——它們的 description 欄位在 schema v9 被移除，
 * 移除前必須先把值搬進圖鑑，否則舊存檔的道具說明會整批消失。
 *
 * @param base 既有圖鑑。先寫先贏：已經在圖鑑裡的名稱不會被實例覆蓋。
 *
 * 參數型別只要求 name / description：吃進來的是**舊存檔裡的實例**，
 * 還帶著 id / quantity / isEquipped 等欄位，那些這裡一概不看。
 */
export function buildCatalogFromItems(
  items: readonly Partial<Record<'name' | 'description', string>>[],
  now: number = Date.now(),
  base: ItemCatalog = {},
): ItemCatalog {
  const catalog: ItemCatalog = { ...base };
  for (const item of items) {
    const name = normalizeItemName(item?.name || '');
    if (!name || catalog[name]) continue;
    catalog[name] = { name, description: item.description || '', createdAt: '—', lastUsedAt: now };
  }
  return catalog;
}

/**
 * 從「已寫進草稿、等著送出」的道具名單中，挑出這次真的要扣的。
 *
 * 背景：使用消耗品改成只寫進輸入框草稿、由玩家補完後手動送出（他要先講清楚
 * 這瓶藥是自己喝還是餵給倒地的同伴）。扣數量因此也延後到送出那一刻——
 * 按下去就扣的話，玩家改主意清掉草稿，道具沒了、故事裡卻沒發生任何事。
 *
 * 判斷依據是**送出的文字裡還留著名字**：玩家把那段刪掉重寫，代表他改變主意了。
 * 用 `includes` 而非精確比對，因為玩家會在草稿上加字（「我使用了草藥，餵給芬里爾」）。
 */
export function selectConsumedItems(pending: string[], sentText: string): string[] {
  if (pending.length === 0) return [];
  return pending.filter(name => name && sentText.includes(name));
}
