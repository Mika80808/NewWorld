import { describe, it, expect } from 'vitest';
import { pruneMemories, touchMemories, MAX_MEMORIES, editMemoryContent, isSceneMergeable, selectMergeableMemories, replaceMemoriesWithMerged } from '../memoryStore';
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

// ─── 玩家編輯與融合 ───────────────────────────────────────────────────────────
// 玩家回報：「開放修改場景記憶，AI 不會刪除的話會變得很長一串，
// 或者讓 AI 搜尋相關記憶並融合。」memories[] 先前對玩家完全唯讀。
describe('editMemoryContent', () => {
  const m = (over: Partial<MemoryEntry> = {}): MemoryEntry => ({
    id: 'm1', type: 'scene', importance: 'normal', content: '原本的內容',
    tags: { locations: ['月湖鎮'], npcs: [], factions: [], keywords: [] },
    trigger: { scanDepth: 5, probability: 100, sticky: 0, cooldown: 0 },
    isActive: true, source: 'ai_generated', createdAt: '4/15',
    ...over,
  });

  it('改寫內容', () => {
    expect(editMemoryContent([m()], 'm1', '改過的內容')[0].content).toBe('改過的內容');
  });

  /**
   * 玩家動手修正過的內容不該再被 AI 融合改寫、也不該被 LOD 淘汰擠掉——
   * 與 NPC 記憶庫「手寫的不參與融合」是同一條規則。
   */
  it('改過的記憶轉成玩家手寫，之後不再參與融合與淘汰', () => {
    const out = editMemoryContent([m()], 'm1', '改過的內容');
    expect(out[0].source).toBe('manual');
    expect(isSceneMergeable(out[0])).toBe(false);
  });

  it('去頭尾空白', () => {
    expect(editMemoryContent([m()], 'm1', '  改過的內容  ')[0].content).toBe('改過的內容');
  });

  it('空白內容視為無效，回傳原 reference', () => {
    const list = [m()];
    expect(editMemoryContent(list, 'm1', '   ')).toBe(list);
  });

  it('內容沒變時回傳原 reference', () => {
    const list = [m()];
    expect(editMemoryContent(list, 'm1', '原本的內容')).toBe(list);
  });

  it('找不到 id 時回傳原 reference', () => {
    const list = [m()];
    expect(editMemoryContent(list, '不存在', '新內容')).toBe(list);
  });
});

describe('isSceneMergeable / selectMergeableMemories', () => {
  const m = (over: Partial<MemoryEntry> & Pick<MemoryEntry, 'id'>): MemoryEntry => ({
    type: 'scene', importance: 'normal', content: `內容${over.id}`,
    tags: { locations: ['月湖鎮'], npcs: [], factions: [], keywords: [] },
    trigger: { scanDepth: 5, probability: 100, sticky: 0, cooldown: 0 },
    isActive: true, source: 'ai_generated', createdAt: '4/15',
    ...over,
  });

  /**
   * 兩條豁免與 pruneMemories 的 isProtected 同一套理由。融合是**直接取代**
   * 原文（MemoryEntry 沒有 isMerged 封存欄位），所以豁免必須成立。
   */
  it('玩家手寫的不可融合', () => {
    expect(isSceneMergeable(m({ id: 'a', source: 'manual' }))).toBe(false);
  });

  it('critical 不可融合', () => {
    expect(isSceneMergeable(m({ id: 'a', importance: 'critical' }))).toBe(false);
  });

  it('停用的不可融合', () => {
    expect(isSceneMergeable(m({ id: 'a', isActive: false }))).toBe(false);
  });

  it('AI 產出的一般記憶可融合', () => {
    expect(isSceneMergeable(m({ id: 'a' }))).toBe(true);
  });

  // 挑選條件必須與 SceneMemoryWidget 的顯示條件一致，
  // 否則會出現「畫面上看到 5 條、按下融合卻併了 8 條」的分歧
  it('scene 只收明確標到這個地點的', () => {
    const out = selectMergeableMemories([
      m({ id: 'a' }),
      m({ id: 'b', tags: { locations: ['迷霧森林'], npcs: [], factions: [], keywords: [] } }),
      m({ id: 'c', tags: { locations: [], npcs: [], factions: [], keywords: [] } }),
    ], '月湖鎮', 'scene');
    expect(out.map(x => x.id)).toEqual(['a']);
  });

  it('region 把沒有地點標籤的視為全域，一併收進來', () => {
    const out = selectMergeableMemories([
      m({ id: 'a', type: 'region' }),
      m({ id: 'b', type: 'region', tags: { locations: [], npcs: [], factions: [], keywords: [] } }),
      m({ id: 'c', type: 'region', tags: { locations: ['迷霧森林'], npcs: [], factions: [], keywords: [] } }),
    ], '月湖鎮', 'region');
    expect(out.map(x => x.id)).toEqual(['a', 'b']);
  });

  it('不跨層挑選（scene 不會收到 region）', () => {
    const out = selectMergeableMemories([
      m({ id: 'a' }), m({ id: 'b', type: 'region' }), m({ id: 'c', type: 'world' }),
    ], '月湖鎮', 'scene');
    expect(out.map(x => x.id)).toEqual(['a']);
  });
});

describe('replaceMemoriesWithMerged', () => {
  const m = (id: string): MemoryEntry => ({
    id, type: 'scene', importance: 'normal', content: `內容${id}`,
    tags: { locations: [], npcs: [], factions: [], keywords: [] },
    trigger: { scanDepth: 5, probability: 100, sticky: 0, cooldown: 0 },
    isActive: true, source: 'ai_generated', createdAt: '4/15',
  });

  it('把整批換成一條', () => {
    const out = replaceMemoriesWithMerged([m('a'), m('b'), m('c')], ['a', 'b'], m('merged'));
    expect(out.map(x => x.id)).toEqual(['merged', 'c']);
  });

  /**
   * 注入端的 sortByNewest 讀的是 id 內嵌的時間戳，而融合結果掛的是新時間戳。
   * 接在陣列尾巴會讓它每次都排到最前面，把真正的新記憶擠出截斷範圍。
   */
  it('插在第一條被取代者的位置，不是接到尾巴', () => {
    const out = replaceMemoriesWithMerged([m('a'), m('b'), m('c'), m('d')], ['b', 'c'], m('merged'));
    expect(out.map(x => x.id)).toEqual(['a', 'merged', 'd']);
  });

  it('沒有任何一條命中時回傳原 reference', () => {
    const list = [m('a'), m('b')];
    expect(replaceMemoriesWithMerged(list, ['x'], m('merged'))).toBe(list);
  });
});
