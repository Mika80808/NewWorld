import { describe, it, expect } from 'vitest';
import {
  normalizeItemName, registerItemDef, touchItemDef,
  pruneItemCatalog, selectKnownItemNames, buildCatalogFromItems, describeItem, selectConsumedItems,
} from '../itemCatalog';
import { ItemCatalog } from '../../types';

const def = (name: string, lastUsedAt: number, description = ''): ItemCatalog[string] =>
  ({ name, description, createdAt: '4/1', lastUsedAt });

describe('normalizeItemName', () => {
  it('去頭尾空白與全形空白', () => {
    expect(normalizeItemName('　草藥 ')).toBe('草藥');
  });

  it('連續空白摺疊為單一空白', () => {
    expect(normalizeItemName('火焰  之劍')).toBe('火焰 之劍');
  });
});

describe('registerItemDef — 先寫先贏', () => {
  it('不存在時登錄新定義', () => {
    const { catalog, def: d } = registerItemDef({}, '草藥', '回復 20 HP', '4/15', 100);
    expect(catalog['草藥']).toMatchObject({ description: '回復 20 HP', createdAt: '4/15', lastUsedAt: 100 });
    expect(d.description).toBe('回復 20 HP');
  });

  it('已存在時沿用既有描述，只更新 lastUsedAt', () => {
    const initial: ItemCatalog = { 草藥: def('草藥', 1, '回復 20 HP') };
    const { catalog, def: d } = registerItemDef(initial, '草藥', '新描述', '5/1', 200);
    expect(d.description).toBe('回復 20 HP');
    expect(catalog['草藥'].lastUsedAt).toBe(200);
    expect(catalog['草藥'].createdAt).toBe('4/1');
  });

  it('不改動輸入的 catalog（純函數）', () => {
    const initial: ItemCatalog = {};
    registerItemDef(initial, '草藥', 'x', '4/15');
    expect(initial).toEqual({});
  });
});

describe('touchItemDef', () => {
  it('更新既有條目的 lastUsedAt', () => {
    const catalog = touchItemDef({ 草藥: def('草藥', 1) }, '草藥', 999);
    expect(catalog['草藥'].lastUsedAt).toBe(999);
  });

  it('條目不存在時原樣回傳', () => {
    const initial: ItemCatalog = { 草藥: def('草藥', 1) };
    expect(touchItemDef(initial, '不存在')).toBe(initial);
  });
});

describe('pruneItemCatalog — LOD 淘汰', () => {
  it('未超過上限時不動', () => {
    const initial: ItemCatalog = { 草藥: def('草藥', 1) };
    expect(pruneItemCatalog(initial, new Set(), 10)).toBe(initial);
  });

  it('超過上限時淘汰最久未使用的條目', () => {
    const catalog: ItemCatalog = {
      舊物: def('舊物', 1),
      中物: def('中物', 2),
      新物: def('新物', 3),
    };
    const pruned = pruneItemCatalog(catalog, new Set(), 2);
    expect(Object.keys(pruned).sort()).toEqual(['中物', '新物']);
  });

  it('背包內道具受保護不被淘汰', () => {
    const catalog: ItemCatalog = {
      舊物: def('舊物', 1),
      中物: def('中物', 2),
      新物: def('新物', 3),
    };
    const pruned = pruneItemCatalog(catalog, new Set(['舊物']), 2);
    expect(pruned['舊物']).toBeDefined();
    expect(pruned['中物']).toBeUndefined();
  });
});

describe('selectKnownItemNames', () => {
  it('最近使用優先並截斷至上限', () => {
    const catalog: ItemCatalog = {
      a: def('a', 1), b: def('b', 3), c: def('c', 2),
    };
    expect(selectKnownItemNames(catalog, 2)).toEqual(['b', 'c']);
  });
});

describe('buildCatalogFromItems — 存檔遷移', () => {
  it('從背包實例建立圖鑑，先寫先贏', () => {
    // 舊存檔裡的實例還帶著 id / quantity（schema v9 之前 description 也在上面）
    const catalog = buildCatalogFromItems([
      { id: 1, name: '草藥', quantity: 2, description: '回復 20 HP' },
      { id: 2, name: '草藥', quantity: 1, description: '後來的重複描述' },
      { id: 3, name: ' 鐵劍 ', quantity: 1, description: '一把劍' },
    ] as unknown as { name?: string; description?: string }[]);
    expect(catalog['草藥'].description).toBe('回復 20 HP');
    expect(catalog['鐵劍']).toBeDefined();
    expect(Object.keys(catalog)).toHaveLength(2);
  });

  it('空名稱跳過', () => {
    expect(buildCatalogFromItems([{ name: '  ', description: '' }])).toEqual({});
  });
});

// ─── describeItem：讀取說明的唯一入口 ────────────────────────────────────────
// 說明先前存三份（圖鑑、背包實例、裝備實例），而且沒有任何地方讀圖鑑——
// 「先寫先贏、全遊戲描述一致」的保證因此只在建立那一刻成立。實例的欄位已移除。
describe('describeItem', () => {
  const catalog = {
    草藥: { name: '草藥', description: '回復 20 HP', createdAt: '4/1', lastUsedAt: 1 },
  };

  it('查得到', () => {
    expect(describeItem(catalog, '草藥')).toBe('回復 20 HP');
  });

  /** 圖鑑主鍵是正規化後的名稱，查詢端不該還要自己記得正規化 */
  it('名稱有空白差異也查得到', () => {
    expect(describeItem(catalog, '　草藥 ')).toBe('回復 20 HP');
  });

  /**
   * 查不到時回空字串而不是 undefined——呼叫端多半直接串進字串模板
   * （`（我使用了 ${name}（${desc}））`），回 undefined 玩家會看到字面的 undefined
   */
  it('查不到回空字串，不是 undefined', () => {
    expect(describeItem(catalog, '不存在的道具')).toBe('');
    expect(describeItem({}, '草藥')).toBe('');
    expect(describeItem(catalog, '')).toBe('');
  });
});

describe('buildCatalogFromItems — base 既有圖鑑', () => {
  /** 先寫先贏：圖鑑已有的名稱不該被舊實例上的描述覆蓋掉 */
  it('既有圖鑑優先於實例', () => {
    const base = { 草藥: { name: '草藥', description: '圖鑑版', createdAt: '4/1', lastUsedAt: 1 } };
    const out = buildCatalogFromItems(
      [{ name: '草藥', description: '實例版' }, { name: '鐵劍', description: '一把劍' }],
      123, base,
    );
    expect(out['草藥'].description).toBe('圖鑑版');
    expect(out['鐵劍'].description).toBe('一把劍');
  });

  it('不改動傳入的 base', () => {
    const base = { 草藥: { name: '草藥', description: '圖鑑版', createdAt: '4/1', lastUsedAt: 1 } };
    buildCatalogFromItems([{ name: '鐵劍', description: '一把劍' }], 123, base);
    expect(Object.keys(base)).toEqual(['草藥']);
  });
});

/**
 * 使用消耗品改成「先寫進草稿、玩家補完後手動送出」，扣數量也跟著延後到送出。
 * 這支決定送出時到底要扣哪些。
 */
describe('selectConsumedItems', () => {
  it('名字還在送出的文字裡就扣', () => {
    expect(selectConsumedItems(['草藥'], '（我使用了草藥（回復 20 HP）），餵給芬里爾')).toEqual(['草藥']);
  });

  /** 玩家把草稿刪掉重寫＝改變主意，不該平白少一瓶藥 */
  it('名字被刪掉就不扣', () => {
    expect(selectConsumedItems(['草藥'], '算了，我直接衝上去')).toEqual([]);
  });

  it('一次寫進多個道具時各自判斷', () => {
    expect(selectConsumedItems(['草藥', '解毒劑'], '我先喝草藥，解毒劑留著')).toEqual(['草藥', '解毒劑']);
    expect(selectConsumedItems(['草藥', '解毒劑'], '我只喝草藥')).toEqual(['草藥']);
  });

  it('沒有待用道具時回空陣列', () => {
    expect(selectConsumedItems([], '我使用了草藥')).toEqual([]);
  });
});
