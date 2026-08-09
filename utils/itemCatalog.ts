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
import { ItemCatalog, ItemDef, ItemEntry } from '../types';

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

/** 存檔遷移：從既有背包 items[] 建立圖鑑（先寫先贏） */
export function buildCatalogFromItems(
  items: ItemEntry[],
  now: number = Date.now(),
): ItemCatalog {
  const catalog: ItemCatalog = {};
  for (const item of items) {
    const name = normalizeItemName(item?.name || '');
    if (!name || catalog[name]) continue;
    catalog[name] = { name, description: item.description || '', createdAt: '—', lastUsedAt: now };
  }
  return catalog;
}
