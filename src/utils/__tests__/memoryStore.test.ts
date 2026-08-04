import { describe, it, expect } from 'vitest';
import { pruneMemories, touchMemories, MAX_MEMORIES } from '../memoryStore';
import { MemoryEntry } from '../../types';

/** stamp 會嵌進 id，模擬 `mem_${Date.now()}_${random}` 的建檔時間戳 */
const mem = (stamp: number, over: Partial<MemoryEntry> = {}): MemoryEntry => ({
  id: `mem_${stamp}_x`,
  type: 'world',
  importance: 'normal',
  content: `記憶 ${stamp}`,
  tags: { locations: [], npcs: [], factions: [], keywords: [] },
  trigger: { scanDepth: 5, probability: 100, sticky: 0, cooldown: 0 },
  isActive: true,
  source: 'ai_generated',
  createdAt: '4/15',
  ...over,
});

const ids = (mems: MemoryEntry[]) => mems.map(m => m.id);

describe('pruneMemories — LOD 淘汰', () => {
  it('未超量時回傳原 reference（讓 React 與髒標記能 bail out）', () => {
    const initial = [mem(1), mem(2)];
    expect(pruneMemories(initial, 10)).toBe(initial);
    expect(pruneMemories(initial, 2)).toBe(initial);
  });

  it('超量時淘汰最久未觸發的，降到 max 條', () => {
    const pruned = pruneMemories([mem(1), mem(2), mem(3)], 2);
    expect(pruned).toHaveLength(2);
    expect(ids(pruned)).toEqual(['mem_2_x', 'mem_3_x']);
  });

  it('lastTriggeredAt 優先於 id 時間戳：老但一直被觸發的記憶留下', () => {
    const oldButActive = mem(1, { lastTriggeredAt: 9999 });
    const newButStale = mem(500);
    const pruned = pruneMemories([oldButActive, newButStale], 1);
    expect(ids(pruned)).toEqual(['mem_1_x']);
  });

  it('flavor 先於 normal 被淘汰，即使 flavor 比較新', () => {
    const oldNormal = mem(1, { importance: 'normal' });
    const newFlavor = mem(500, { importance: 'flavor' });
    const pruned = pruneMemories([oldNormal, newFlavor], 1);
    expect(ids(pruned)).toEqual(['mem_1_x']);
  });

  it('critical 豁免：即使是最舊的也不淘汰', () => {
    const pruned = pruneMemories(
      [mem(1, { importance: 'critical' }), mem(2), mem(3)],
      2,
    );
    expect(ids(pruned)).toEqual(['mem_1_x', 'mem_3_x']);
  });

  it('manual 豁免：玩家親手寫的不被 AI 生成的記憶擠掉', () => {
    const pruned = pruneMemories(
      [mem(1, { source: 'manual' }), mem(2), mem(3)],
      2,
    );
    expect(ids(pruned)).toEqual(['mem_1_x', 'mem_3_x']);
  });

  // 寧可暫時超量，也不動受保護的記憶——刪掉 critical 等於劇情斷裂
  it('全部受保護時原樣回傳，不強行湊到 max', () => {
    const all = [
      mem(1, { importance: 'critical' }),
      mem(2, { source: 'manual' }),
      mem(3, { importance: 'critical' }),
    ];
    expect(pruneMemories(all, 1)).toBe(all);
  });

  it('可淘汰的不夠時，淘汰所有能淘汰的但保留受保護的', () => {
    const pruned = pruneMemories(
      [mem(1, { importance: 'critical' }), mem(2, { importance: 'critical' }), mem(3), mem(4)],
      1,
    );
    expect(ids(pruned)).toEqual(['mem_1_x', 'mem_2_x']);
  });

  it('id 格式異常時當作最舊，不會 NaN 汙染排序', () => {
    const broken = { ...mem(0), id: 'legacy-no-stamp' };
    const pruned = pruneMemories([broken, mem(5)], 1);
    expect(ids(pruned)).toEqual(['mem_5_x']);
  });

  it('預設上限為 MAX_MEMORIES', () => {
    const many = Array.from({ length: MAX_MEMORIES + 5 }, (_, i) => mem(i + 1));
    expect(pruneMemories(many)).toHaveLength(MAX_MEMORIES);
  });
});

describe('touchMemories — LRU 時間戳', () => {
  it('只更新被觸發的那幾條', () => {
    const next = touchMemories([mem(1), mem(2)], ['mem_1_x'], 12345);
    expect(next[0].lastTriggeredAt).toBe(12345);
    expect(next[1].lastTriggeredAt).toBeUndefined();
  });

  // 每回合都產生新陣列會讓 saveToCloud 的髒標記永遠為髒，整包 JSON 每回合上傳
  it('triggeredIds 為空時回傳原 reference', () => {
    const initial = [mem(1)];
    expect(touchMemories(initial, [], 12345)).toBe(initial);
  });

  it('triggeredIds 都對不上任何記憶時回傳原 reference', () => {
    const initial = [mem(1)];
    expect(touchMemories(initial, ['mem_999_x'], 12345)).toBe(initial);
  });

  it('未被觸發的記憶保持原物件 reference', () => {
    const untouched = mem(2);
    const next = touchMemories([mem(1), untouched], ['mem_1_x'], 12345);
    expect(next[1]).toBe(untouched);
  });
});

// pruneMemories 與 touchMemories 是一組：touch 寫進去的時間戳就是 prune 的排序依據
describe('touchMemories + pruneMemories 串接', () => {
  it('被觸發過的老記憶會贏過沒被觸發的新記憶', () => {
    const start = [mem(1), mem(2), mem(3)];
    const touched = touchMemories(start, ['mem_1_x'], 9999);
    expect(ids(pruneMemories(touched, 1))).toEqual(['mem_1_x']);
  });
});
