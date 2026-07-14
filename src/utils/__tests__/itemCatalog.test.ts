import { describe, it, expect } from 'vitest';
import {
  normalizeItemName, registerItemDef, touchItemDef,
  pruneItemCatalog, selectKnownItemNames, buildCatalogFromItems,
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
    const catalog = buildCatalogFromItems([
      { id: 1, name: '草藥', quantity: 2, description: '回復 20 HP' },
      { id: 2, name: '草藥', quantity: 1, description: '後來的重複描述' },
      { id: 3, name: ' 鐵劍 ', quantity: 1, description: '一把劍' },
    ]);
    expect(catalog['草藥'].description).toBe('回復 20 HP');
    expect(catalog['鐵劍']).toBeDefined();
    expect(Object.keys(catalog)).toHaveLength(2);
  });

  it('空名稱跳過', () => {
    expect(buildCatalogFromItems([{ id: 1, name: '  ', quantity: 1, description: '' }])).toEqual({});
  });
});
