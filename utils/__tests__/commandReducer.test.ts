import { describe, it, expect } from 'vitest';
import { parseCommandsToAST } from '../commandParser';
import { reduceCommands, CurrentState } from '../commandReducer';
import { Npc, Quest, ItemEntry, StatusEffect, LorebookEntry } from '../../types';

const npc = (over: Partial<Npc> = {}): Npc => ({
  id: 1, name: '芬里爾', job: '獵人', affection: 10,
  appearance: '', personality: '', category: 'NPC', isActive: true, memories: [],
  ...over,
});

const state = (over: Partial<CurrentState> = {}): CurrentState => ({
  timeState: { year: 1024, month: 4, day: 15, hour: 12, minute: 0, weather: '晴朗' },
  profile: { name: '玩家', job: '異鄉人', appearance: '', personality: '', other: '', hp: 50, mp: 20, gold: 100 },
  quests: [], memories: [], npcs: [npc()], items: [], itemCatalog: {},
  currentLocation: '月湖鎮', lorebookEntries: [], messages: [],
  stickyCounters: {}, cooldownCounters: {}, statusEffects: [], factions: [],
  ...over,
});

const run = (commandText: string, s: CurrentState = state()) => {
  const { commands } = parseCommandsToAST(`<<COMMANDS>>\n${commandText}\n<</COMMANDS>>`);
  return reduceCommands(commands, s);
};

describe('reduceCommands — 數值指令', () => {
  it('HP/MP/GOLD 累加後寫入 stateChanges.profile', () => {
    const { stateChanges } = run('HP:-10\nMP:+5\nGOLD:+100');
    expect(stateChanges.profile).toMatchObject({ hp: 40, mp: 25, gold: 200 });
  });

  it('同類指令多條累加', () => {
    const { stateChanges } = run('HP:-10\nHP:-15');
    expect(stateChanges.profile?.hp).toBe(25);
  });

  it('HP/MP/GOLD 下限為 0', () => {
    const { stateChanges } = run('HP:-999\nGOLD:-999');
    expect(stateChanges.profile).toMatchObject({ hp: 0, gold: 0 });
  });

  it('無數值指令時不動 profile', () => {
    const { stateChanges } = run('LOCATION:迷霧森林');
    expect(stateChanges.profile).toBeUndefined();
  });
});

describe('reduceCommands — 時間與地點', () => {
  it('TIME 推進 timeState', () => {
    const { stateChanges } = run('TIME:+2h');
    expect(stateChanges.timeState).toMatchObject({ hour: 14, minute: 0 });
  });

  it('LOCATION 更新 currentLocation', () => {
    const { stateChanges } = run('LOCATION:迷霧森林');
    expect(stateChanges.currentLocation).toBe('迷霧森林');
  });

  // useCommandParser 的 ParseResult 用 stateChanges.currentLocation / timeState
  // 算出「指令套用後」的地點與日期回傳給 App.tsx，讓出場 NPC 的足跡蓋到正確的
  // 新地點（AI 常在同一則回應裡一邊移動玩家一邊讓 NPC 出場）。
  // 這兩個欄位必須在同一批指令中同時出現，否則那個修正會靜默退回舊值。
  it('同批 LOCATION + TIME 會同時放進 stateChanges，供 ParseResult 取用', () => {
    const { stateChanges } = run('LOCATION|name=迷霧森林\nTIME|delta=+2h');
    expect(stateChanges.currentLocation).toBe('迷霧森林');
    expect(stateChanges.timeState).toMatchObject({ month: 4, day: 15, hour: 14 });
  });

  it('跨日的 TIME 會推進 day，lastSeenDate 才不會停在前一天', () => {
    const { stateChanges } = run('TIME|delta=+20h');
    expect(stateChanges.timeState).toMatchObject({ day: 16, hour: 8 });
  });

  // 沒有 LOCATION / TIME 時兩者都是 undefined，ParseResult 的 `??` 會退回原值
  it('沒有 LOCATION / TIME 指令時不寫入這兩個欄位', () => {
    const { stateChanges } = run('HP:-10');
    expect(stateChanges.currentLocation).toBeUndefined();
    expect(stateChanges.timeState).toBeUndefined();
  });
});

// 回歸：先前只有 constants 裡的月湖鎮是 known，LOCATION_DISCOVER 一律只寫 heard，
// 而移動指令完全不碰設定集——玩家走遍全世界，地圖上仍舊全是 ???
describe('reduceCommands — LOCATION 解鎖地圖標記', () => {
  const loc = (over: Partial<LorebookEntry> = {}): LorebookEntry => ({
    id: 1, title: '迷霧森林', content: '', category: '地點', isActive: true,
    mapX: 100, mapY: 50, mapStatus: 'heard',
    ...over,
  });

  it('移動到某地時把該地標記為 known', () => {
    const { stateChanges } = run('LOCATION|name=迷霧森林', state({ lorebookEntries: [loc()] }));
    expect(stateChanges.lorebookEntries?.[0]).toMatchObject({ title: '迷霧森林', mapStatus: 'known' });
  });

  it('不動其他地點的 mapStatus', () => {
    const { stateChanges } = run(
      'LOCATION|name=迷霧森林',
      state({ lorebookEntries: [loc(), loc({ id: 2, title: '狼族領地' })] }),
    );
    expect(stateChanges.lorebookEntries?.[1]).toMatchObject({ title: '狼族領地', mapStatus: 'heard' });
  });

  // 座標歸 LOCATION_DISCOVER 管；這裡補一個沒有 mapX/mapY 的條目只會讓它在地圖上不可見
  it('設定集裡沒有該地點時不憑空建立條目', () => {
    const { stateChanges } = run('LOCATION|name=無名荒野', state({ lorebookEntries: [loc()] }));
    expect(stateChanges.currentLocation).toBe('無名荒野');
    expect(stateChanges.lorebookEntries).toHaveLength(1);
  });

  it('同名的非地點條目不受影響', () => {
    const { stateChanges } = run(
      'LOCATION|name=迷霧森林',
      state({ lorebookEntries: [loc({ id: 3, category: '歷史', mapStatus: undefined })] }),
    );
    expect(stateChanges.lorebookEntries?.[0].mapStatus).toBeUndefined();
  });
});

describe('reduceCommands — 道具', () => {
  it('ITEM_ADD 新增道具', () => {
    const { stateChanges } = run('ITEM_ADD|name=草藥|qty=2|desc=回復 20 HP');
    expect(stateChanges.items).toHaveLength(1);
    expect(stateChanges.items?.[0]).toMatchObject({ name: '草藥', quantity: 2 });
  });

  it('ITEM_ADD 同名道具疊加數量', () => {
    const existing: ItemEntry = { id: 1, name: '草藥', quantity: 1, description: '' };
    const { stateChanges } = run('ITEM_ADD|name=草藥|qty=2', state({ items: [existing] }));
    expect(stateChanges.items).toHaveLength(1);
    expect(stateChanges.items?.[0].quantity).toBe(3);
  });

  it('ITEM_REMOVE 扣減並在歸零時移除', () => {
    const existing: ItemEntry = { id: 1, name: '草藥', quantity: 2, description: '' };
    const { stateChanges } = run('ITEM_REMOVE|name=草藥|qty=2', state({ items: [existing] }));
    expect(stateChanges.items?.find(i => i.name === '草藥')).toBeUndefined();
  });

  // 回歸：workingItems 只是 currentState.items 的淺拷貝，舊實作用
  // `existingItem.quantity += n` / `item.quantity -= n` 就地改寫，
  // 會連 React state 裡的同一個物件一起竄改（reducer 應為純函數）
  it('ITEM_ADD 疊加不竄改傳入的 items（純函數）', () => {
    const existing: ItemEntry = { id: 1, name: '草藥', quantity: 1, description: '' };
    const s = state({ items: [existing] });
    run('ITEM_ADD|name=草藥|qty=2', s);
    expect(existing.quantity).toBe(1);
    expect(s.items[0].quantity).toBe(1);
  });

  it('ITEM_REMOVE 扣減不竄改傳入的 items（純函數）', () => {
    const existing: ItemEntry = { id: 1, name: '草藥', quantity: 5, description: '' };
    const s = state({ items: [existing] });
    const { stateChanges } = run('ITEM_REMOVE|name=草藥|qty=2', s);
    expect(existing.quantity).toBe(5);
    expect(stateChanges.items?.[0].quantity).toBe(3);
  });
});

describe('reduceCommands — 道具圖鑑（Master Data）', () => {
  it('ITEM_ADD 首次出現時登錄圖鑑定義', () => {
    const { stateChanges } = run('ITEM_ADD|name=草藥|qty=1|desc=回復 20 HP');
    expect(stateChanges.itemCatalog?.['草藥']).toMatchObject({
      name: '草藥', description: '回復 20 HP',
    });
  });

  it('先寫先贏：同名道具再次出現時沿用圖鑑既有描述，忽略 AI 新描述', () => {
    const s = state({
      itemCatalog: { 草藥: { name: '草藥', description: '回復 20 HP', createdAt: '4/1', lastUsedAt: 1 } },
    });
    const { stateChanges } = run('ITEM_ADD|name=草藥|qty=1|desc=完全不同的新描述', s);
    expect(stateChanges.itemCatalog?.['草藥'].description).toBe('回復 20 HP');
    expect(stateChanges.items?.[0].description).toBe('回復 20 HP');
  });

  it('ITEM_ADD 名稱正規化：空白差異視為同一道具', () => {
    const s = state({
      itemCatalog: { 草藥: { name: '草藥', description: '回復 20 HP', createdAt: '4/1', lastUsedAt: 1 } },
    });
    const { stateChanges } = run('ITEM_ADD|name=　草藥 |qty=1|desc=x', s);
    expect(Object.keys(stateChanges.itemCatalog ?? {})).toEqual(['草藥']);
  });

  it('ITEM_REMOVE 歸零移除實例，但圖鑑定義保留', () => {
    const existing: ItemEntry = { id: 1, name: '草藥', quantity: 1, description: '回復 20 HP' };
    const s = state({
      items: [existing],
      itemCatalog: { 草藥: { name: '草藥', description: '回復 20 HP', createdAt: '4/1', lastUsedAt: 1 } },
    });
    const { stateChanges } = run('ITEM_REMOVE|name=草藥|qty=1', s);
    expect(stateChanges.items).toHaveLength(0);
    expect(stateChanges.itemCatalog?.['草藥']).toBeDefined();
  });

  it('QUEST_COMPLETE 獎勵物品也走圖鑑（既有定義優先於預設描述）', () => {
    const quest = {
      id: 'q1', title: '採藥', giver: '藥師', description: '',
      reward: { items: ['草藥'] }, status: 'active' as const, isGoalMet: true,
      createdAt: '4/15', createdAtTotalDays: 0,
    };
    const s = state({
      quests: [quest],
      itemCatalog: { 草藥: { name: '草藥', description: '回復 20 HP', createdAt: '4/1', lastUsedAt: 1 } },
    });
    const { stateChanges } = run('QUEST_COMPLETE|title=採藥', s);
    expect(stateChanges.items?.[0]).toMatchObject({ name: '草藥', description: '回復 20 HP' });
  });
});

describe('reduceCommands — NPC 好感度', () => {
  it('AFFINITY 更新既有 NPC', () => {
    const { stateChanges } = run('AFFINITY:芬里爾:+5');
    expect(stateChanges.npcs?.find(n => n.name === '芬里爾')?.affection).toBe(15);
  });

  it('好感度下限 -100', () => {
    const { stateChanges } = run('AFFINITY:芬里爾:-999');
    expect(stateChanges.npcs?.find(n => n.name === '芬里爾')?.affection).toBe(-100);
  });

  // 回歸：舊實作用 find 只取第一條，多出來的靜默丟棄，
  // 但 cmdResults 每條都顯示，玩家看到的與實際生效的對不上
  it('同一 NPC 多條 AFFINITY 全部累加', () => {
    const { stateChanges } = run('AFFINITY:芬里爾:+5\nAFFINITY:芬里爾:-2\nAFFINITY:芬里爾:+3');
    expect(stateChanges.npcs?.find(n => n.name === '芬里爾')?.affection).toBe(16);
  });
});

describe('reduceCommands — 狀態異常', () => {
  it('每回合 duration 遞減、歸零移除、永久保留', () => {
    const effects: StatusEffect[] = [
      { id: 's1', name: '中毒', emoji: '☠️', duration: 1 },
      { id: 's2', name: '詛咒', emoji: '🌑', duration: -1 },
      { id: 's3', name: '灼傷', emoji: '🔥', duration: 3 },
    ];
    const { stateChanges } = run('LOCATION:某地', state({ statusEffects: effects }));
    const names = stateChanges.statusEffects?.map(s => s.name);
    expect(names).toEqual(['詛咒', '灼傷']);
    expect(stateChanges.statusEffects?.find(s => s.name === '灼傷')?.duration).toBe(2);
  });

  it('STATUS_ADD 新增異常', () => {
    const { stateChanges } = run('STATUS_ADD|emoji=☠️|name=中毒|duration=3');
    expect(stateChanges.statusEffects?.[0]).toMatchObject({ name: '中毒', duration: 3 });
  });
});

describe('reduceCommands — 任務', () => {
  const quest = (over: Partial<Quest> = {}): Quest => ({
    id: 'q1', title: '採集任務', giver: '村長', description: '',
    reward: {}, deadline: 1, status: 'active', isGoalMet: false,
    createdAt: '4/15', createdAtTotalDays: 1024 * 360 + 3 * 30 + 15,
    ...over,
  });

  it('QUEST_ADD 建立新任務', () => {
    const { stateChanges } = run('QUEST_ADD|title=採集任務|giver=村長|gold=100|deadline=7');
    expect(stateChanges.quests?.[0]).toMatchObject({
      title: '採集任務', status: 'active', deadline: 7,
    });
  });

  it('時間推進導致逾期任務失敗', () => {
    const { stateChanges } = run('TIME:+48h', state({ quests: [quest()] }));
    expect(stateChanges.quests?.[0].status).toBe('failed');
  });
});

describe('reduceCommands — 勢力', () => {
  it('FACTION_NEW 自動指派調色盤顏色', () => {
    const { stateChanges } = run('FACTION_NEW|name=獵人公會|type=guild|desc=獵人們的組織');
    expect(stateChanges.factions).toHaveLength(1);
    expect(stateChanges.factions?.[0]).toMatchObject({ name: '獵人公會', type: 'guild' });
    expect(stateChanges.factions?.[0].color).toMatch(/^#/);
  });
});
