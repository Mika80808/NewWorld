import { describe, it, expect } from 'vitest';
import { parseCommandsToAST } from '../commandParser';
import { reduceCommands, CurrentState, isMergeable, MEMORY_MERGE_LIMIT, THOUGHTS_LIMIT } from '../commandReducer';
import { Npc, NpcMemory, Quest, ItemEntry, StatusEffect, LorebookEntry } from '../../types';

const npc = (over: Partial<Npc> = {}): Npc => ({
  id: 1, name: '芬里爾', affection: 10,
  category: 'NPC', isActive: true, memories: [],
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

// AI 先前把新地點全建在 (2,-1)、(5,-2) 這種原點附近的座標上，整批疊在月湖鎮(0,0)；
// 而且新建的條目沒有 locationType，Phase 1 的候選上限會落在「未設定」＝野外 3 人
describe('reduceCommands — LOCATION_DISCOVER 座標與分類', () => {
  const loc = (over: Partial<LorebookEntry> = {}): LorebookEntry => ({
    id: 1, title: '迷霧森林', content: '', category: '地點', isActive: true,
    mapX: 100, mapY: 50, mapStatus: 'heard',
    ...over,
  });

  it('新地點帶入座標與分類', () => {
    const { stateChanges } = run('LOCATION_DISCOVER|name=黑牙聚落|x=120|y=80|type=town', state({ lorebookEntries: [loc()] }));
    expect(stateChanges.lorebookEntries?.[1]).toMatchObject({
      title: '黑牙聚落', category: '地點', mapX: 120, mapY: 80, mapStatus: 'heard', locationType: 'town',
    });
  });

  it('沒給 type 時退回 wilderness，不留 undefined', () => {
    const { stateChanges } = run('LOCATION_DISCOVER|name=無名谷|x=50|y=60');
    expect(stateChanges.lorebookEntries?.[0].locationType).toBe('wilderness');
  });

  it('認不得的 type 退回 wilderness', () => {
    const { stateChanges } = run('LOCATION_DISCOVER|name=無名谷|x=50|y=60|type=城鎮');
    expect(stateChanges.lorebookEntries?.[0].locationType).toBe('wilderness');
  });

  // NaN 存進 mapX 會讓地圖標記整個消失，比座標錯更難查
  it('座標不是數字時退回 0，不寫入 NaN', () => {
    const { stateChanges } = run('LOCATION_DISCOVER|name=無名谷|x=東邊|y=遠方');
    expect(stateChanges.lorebookEntries?.[0].mapX).toBe(0);
    expect(stateChanges.lorebookEntries?.[0].mapY).toBe(0);
  });

  // 玩家可能在設定集裡調過座標或分類，AI 再次 DISCOVER 不該蓋掉
  it('地點已存在時不覆蓋既有座標與分類', () => {
    const { stateChanges } = run(
      'LOCATION_DISCOVER|name=迷霧森林|x=1|y=1|type=town',
      state({ lorebookEntries: [loc({ locationType: 'wilderness' })] }),
    );
    expect(stateChanges.lorebookEntries?.[0]).toMatchObject({ mapX: 100, mapY: 50, locationType: 'wilderness' });
  });

  it('既有條目缺分類時才補上', () => {
    const { stateChanges } = run(
      'LOCATION_DISCOVER|name=迷霧森林|x=1|y=1|type=building',
      state({ lorebookEntries: [loc({ locationType: undefined })] }),
    );
    expect(stateChanges.lorebookEntries?.[0].locationType).toBe('building');
  });
});

// 玩家回報：「AI 並沒有填寫地點簡介，需要主動填寫」「地點狀態須為：已造訪」。
// AI 現在會替月湖鎮裡的每間店都建條目，而那些條目一律是「空白簡介 ＋ 聽說過」——
// 玩家人就坐在餐館裡，設定集卻說他只是聽說過這個地方，地圖上顯示 ???。
describe('reduceCommands — LOCATION_DISCOVER 簡介與地圖狀態', () => {
  const loc = (over: Partial<LorebookEntry> = {}): LorebookEntry => ({
    id: 1, title: '迷霧森林', content: '', category: '地點', isActive: true,
    mapX: 100, mapY: 50, mapStatus: 'heard',
    ...over,
  });

  it('desc 寫進 content，不再留一片空白', () => {
    const { stateChanges } = run('LOCATION_DISCOVER|name=晨露餐館|x=3|y=2|type=building|desc=月湖鎮東側的小餐館，招牌是晨露燉湯。');
    expect(stateChanges.lorebookEntries?.[0].content).toBe('月湖鎮東側的小餐館，招牌是晨露燉湯。');
  });

  it('沒給 desc 時仍照常登錄地點（只是簡介空著）', () => {
    const { stateChanges } = run('LOCATION_DISCOVER|name=晨露餐館|x=3|y=2|type=building');
    expect(stateChanges.lorebookEntries?.[0]).toMatchObject({ title: '晨露餐館', content: '' });
  });

  // 先寫先贏（同 itemCatalog）：玩家在設定集裡寫過的東西不該被 AI 洗掉
  it('既有條目已有簡介時不覆蓋', () => {
    const { stateChanges } = run(
      'LOCATION_DISCOVER|name=迷霧森林|x=1|y=1|desc=AI 重寫的版本',
      state({ lorebookEntries: [loc({ content: '玩家自己寫的設定' })] }),
    );
    expect(stateChanges.lorebookEntries?.[0].content).toBe('玩家自己寫的設定');
  });

  // 舊條目大多是空的（先前的 LOCATION_DISCOVER 根本沒有 desc 參數），這是唯一的補寫機會
  it('既有條目簡介是空的時候補上', () => {
    const { stateChanges } = run(
      'LOCATION_DISCOVER|name=迷霧森林|x=1|y=1|desc=終年起霧的針葉林',
      state({ lorebookEntries: [loc({ content: '   ' })] }),
    );
    expect(stateChanges.lorebookEntries?.[0].content).toBe('終年起霧的針葉林');
  });

  it('status=known 標成已造訪', () => {
    const { stateChanges } = run('LOCATION_DISCOVER|name=晨露餐館|x=3|y=2|type=building|status=known|desc=小餐館');
    expect(stateChanges.lorebookEntries?.[0].mapStatus).toBe('known');
  });

  it('status=heard 標成聽說過', () => {
    const { stateChanges } = run('LOCATION_DISCOVER|name=遠方王都|x=90|y=90|type=town|status=heard|desc=聽商隊提起的王都');
    expect(stateChanges.lorebookEntries?.[0].mapStatus).toBe('heard');
  });

  it('認不得的 status 不丟棄指令，改依所在地推定', () => {
    const { stateChanges } = run('LOCATION_DISCOVER|name=遠方王都|x=90|y=90|status=也許吧');
    expect(stateChanges.lorebookEntries?.[0]).toMatchObject({ title: '遠方王都', mapStatus: 'heard' });
  });

  /**
   * 省略 status 時的推定：玩家此刻就在那裡＝已造訪。
   * 「抵達新地點」本來就該同時輸出 LOCATION 與 LOCATION_DISCOVER，
   * 而所在地在主迴圈之前就算好了，所以兩者誰先誰後都一樣。
   */
  it.each([
    ['DISCOVER 在前', 'LOCATION_DISCOVER|name=新城鎮|x=90|y=40|type=town|desc=山腳下的城鎮\nLOCATION|name=新城鎮'],
    ['LOCATION 在前', 'LOCATION|name=新城鎮\nLOCATION_DISCOVER|name=新城鎮|x=90|y=40|type=town|desc=山腳下的城鎮'],
  ])('省略 status 時，玩家同批移動過去的地點是已造訪（%s）', (_label, cmds) => {
    const { stateChanges } = run(cmds);
    expect(stateChanges.lorebookEntries?.[0].mapStatus).toBe('known');
  });

  it('省略 status 且玩家不在那裡時是聽說過', () => {
    const { stateChanges } = run('LOCATION_DISCOVER|name=遠方王都|x=90|y=90|type=town|desc=聽說中的王都');
    expect(stateChanges.lorebookEntries?.[0].mapStatus).toBe('heard');
  });

  /**
   * ⚠️ 這條是真正的回歸：既有條目原本被無條件寫回 `heard`。
   * 玩家走過一次（LOCATION 那支已標成 known），AI 之後在敘事裡再提一次同一個地方，
   * 狀態就被降級回「聽說過」，地圖上的地名變回 ???。
   */
  it('既有的已造訪不會被降級回聽說過', () => {
    const { stateChanges } = run(
      'LOCATION_DISCOVER|name=迷霧森林|x=1|y=1|status=heard',
      state({ lorebookEntries: [loc({ mapStatus: 'known' })] }),
    );
    expect(stateChanges.lorebookEntries?.[0].mapStatus).toBe('known');
  });

  it('聽說過的舊條目在玩家實際到訪時升級成已造訪', () => {
    const { stateChanges } = run(
      'LOCATION|name=迷霧森林\nLOCATION_DISCOVER|name=迷霧森林|x=1|y=1',
      state({ lorebookEntries: [loc({ mapStatus: 'heard' })] }),
    );
    expect(stateChanges.lorebookEntries?.[0].mapStatus).toBe('known');
  });
});

describe('reduceCommands — 道具', () => {
  it('ITEM_ADD 新增道具', () => {
    const { stateChanges } = run('ITEM_ADD|name=草藥|qty=2|desc=回復 20 HP');
    expect(stateChanges.items).toHaveLength(1);
    expect(stateChanges.items?.[0]).toMatchObject({ name: '草藥', quantity: 2 });
  });

  it('ITEM_ADD 同名道具疊加數量', () => {
    const existing: ItemEntry = { id: 1, name: '草藥', quantity: 1 };
    const { stateChanges } = run('ITEM_ADD|name=草藥|qty=2', state({ items: [existing] }));
    expect(stateChanges.items).toHaveLength(1);
    expect(stateChanges.items?.[0].quantity).toBe(3);
  });

  it('ITEM_REMOVE 扣減並在歸零時移除', () => {
    const existing: ItemEntry = { id: 1, name: '草藥', quantity: 2 };
    const { stateChanges } = run('ITEM_REMOVE|name=草藥|qty=2', state({ items: [existing] }));
    expect(stateChanges.items?.find(i => i.name === '草藥')).toBeUndefined();
  });

  // 回歸：workingItems 只是 currentState.items 的淺拷貝，舊實作用
  // `existingItem.quantity += n` / `item.quantity -= n` 就地改寫，
  // 會連 React state 裡的同一個物件一起竄改（reducer 應為純函數）
  it('ITEM_ADD 疊加不竄改傳入的 items（純函數）', () => {
    const existing: ItemEntry = { id: 1, name: '草藥', quantity: 1 };
    const s = state({ items: [existing] });
    run('ITEM_ADD|name=草藥|qty=2', s);
    expect(existing.quantity).toBe(1);
    expect(s.items[0].quantity).toBe(1);
  });

  it('ITEM_REMOVE 扣減不竄改傳入的 items（純函數）', () => {
    const existing: ItemEntry = { id: 1, name: '草藥', quantity: 5 };
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
    // 實例上不再有 description（schema v9 移除）——說明只在圖鑑一份，
    // 顯示與 prompt 都走 describeItem() 查回來
    expect(stateChanges.items?.[0]).not.toHaveProperty('description');
  });

  it('ITEM_ADD 名稱正規化：空白差異視為同一道具', () => {
    const s = state({
      itemCatalog: { 草藥: { name: '草藥', description: '回復 20 HP', createdAt: '4/1', lastUsedAt: 1 } },
    });
    const { stateChanges } = run('ITEM_ADD|name=　草藥 |qty=1|desc=x', s);
    expect(Object.keys(stateChanges.itemCatalog ?? {})).toEqual(['草藥']);
  });

  it('ITEM_REMOVE 歸零移除實例，但圖鑑定義保留', () => {
    const existing: ItemEntry = { id: 1, name: '草藥', quantity: 1 };
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
    expect(stateChanges.items?.[0]).toMatchObject({ name: '草藥' });
    // 說明改由圖鑑提供（實例不再帶 description）
    expect(stateChanges.itemCatalog?.['草藥'].description).toBe('回復 20 HP');
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

// thoughts[] 的 index 0 是最新的一則（新想法一律 unshift）
const thoughts = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ text: `想法${i + 1}`, createdAt: '4/1' }));

const npcMem = (id: string, over: Partial<NpcMemory> = {}): NpcMemory => ({
  id, text: `記憶${id}`, createdAt: '4/1',
  source: 'pre_merge', importance: 'normal',
  ...over,
});

const overflow = (over: Partial<Npc> = {}) =>
  run('NPC_THOUGHT|npc=芬里爾|text=第十則',
      state({ npcs: [npc({ thoughts: thoughts(9), ...over })] }));

describe('reduceCommands — NPC 想法打包', () => {
  it('滿 10 則打包成一條 pre_merge 記憶並清空 thoughts', () => {
    const target = overflow().stateChanges.npcs![0];
    expect(target.thoughts).toEqual([]);
    expect(target.memories).toHaveLength(1);
    expect(target.memories[0]).toMatchObject({ source: 'pre_merge', importance: 'normal' });
  });

  it('打包保留全部 10 則，最舊一則不會遺失', () => {
    const text = overflow().stateChanges.npcs![0].memories[0].text;
    expect(text).toContain('想法9');    // 最舊
    expect(text).toContain('第十則');   // 最新
    expect(text.split('；')).toHaveLength(10);
  });

  it('記憶掛遊戲內日期而非現實日期', () => {
    expect(overflow().stateChanges.npcs![0].memories[0].createdAt).toBe('4/15');
  });

  it('第 9 則不觸發打包', () => {
    const s = state({ npcs: [npc({ thoughts: thoughts(8) })] });
    const target = run('NPC_THOUGHT|npc=芬里爾|text=第九則', s).stateChanges.npcs![0];
    expect(target.thoughts).toHaveLength(9);
    expect(target.memories).toHaveLength(0);
  });
});

describe('reduceCommands — NPC 記憶融合門檻', () => {
  const many = (n: number, over: Partial<NpcMemory> = {}) =>
    Array.from({ length: n }, (_, i) => npcMem(`${over.source ?? 'p'}${i}`, over));

  // overflow() 本身會打包出一條新的 pre_merge 記憶，所以可融合數 = n + 1。
  // ⚠️ 門檻一律引用 MEMORY_MERGE_LIMIT，不要寫死數字——先前寫死 10，
  // 把門檻調成 5 之後整批紅在「未滿 10 條不觸發」這種與行為無關的地方。
  const justUnder = MEMORY_MERGE_LIMIT - 2;
  const justAt = MEMORY_MERGE_LIMIT - 1;

  it('可融合記憶達門檻時排入融合任務', () => {
    const { asyncTasks } = overflow({ memories: many(justAt) });
    expect(asyncTasks).toHaveLength(1);
    expect(asyncTasks[0].payload).toMatchObject({ npcName: '芬里爾', gameDate: '4/15' });
  });

  it('差一條不觸發', () => {
    expect(overflow({ memories: many(justUnder) }).asyncTasks).toHaveLength(0);
  });

  it('玩家手寫記憶（含 ★ 核心）不計入門檻', () => {
    const memories = [
      ...many(justUnder),
      ...many(20, { source: 'manual' }),
      ...many(3, { source: 'manual', importance: 'core' }),
    ];
    expect(overflow({ memories }).asyncTasks).toHaveLength(0);
  });

  it('已封存記憶不計入門檻', () => {
    expect(overflow({ memories: many(20, { isMerged: true }) }).asyncTasks).toHaveLength(0);
  });

  /**
   * 玩家回報：`pre_merge` 記憶是把 10 則想法原文串成的一大塊，而 [記憶庫] 一次
   * 注入最近 5 條非摘要記憶——門檻放在 10 的時候，模型同時讀到 5 大塊措辭雷同的
   * 想法流水帳，於是過度著重在那些重複詞彙上。這條釘住「門檻確實比想法打包的
   * 批次小」：不然原文永遠來不及被濃縮封存。
   */
  it('融合門檻低於想法打包批次，原文才來得及被濃縮', () => {
    expect(MEMORY_MERGE_LIMIT).toBeLessThan(THOUGHTS_LIMIT);
  });
});

describe('isMergeable', () => {
  it('只有未封存的 AI 產出記憶可融合', () => {
    expect(isMergeable(npcMem('a', { source: 'pre_merge' }))).toBe(true);
    expect(isMergeable(npcMem('b', { source: 'merged' }))).toBe(true);
    expect(isMergeable(npcMem('c', { source: 'pre_merge', isMerged: true }))).toBe(false);
  });

  it('玩家手寫的一律不可融合', () => {
    expect(isMergeable(npcMem('d', { source: 'manual' }))).toBe(false);
    expect(isMergeable(npcMem('e', { source: 'manual', importance: 'core' }))).toBe(false);
  });
});

// ─── 任務比對 ─────────────────────────────────────────────────────────────────
// 玩家回報「任務有可能重複發放，或完成後沒被偵測到」。
// 兩者同源：整條任務系統以標題字串完全相等在比對，而標題是 AI 每次重打的。
describe('reduceCommands — 任務標題比對', () => {
  const quest = (over: Partial<Quest> = {}): Quest => ({
    id: 'q1', title: '護送商隊', giver: '商會會長', description: '',
    reward: { gold: 100 }, status: 'active', isGoalMet: false,
    createdAt: '4/15', createdAtTotalDays: 368654, ...over,
  });

  it('標題多了引號時不會重複發放', () => {
    const s = state({ quests: [quest()] });
    const { stateChanges } = run('QUEST_ADD|title=「護送商隊」|giver=商會會長', s);
    // 沒有長出第二筆
    expect(stateChanges.quests).toHaveLength(1);
  });

  it('標題多了句尾標點時不會重複發放', () => {
    const s = state({ quests: [quest()] });
    const { stateChanges } = run('QUEST_ADD|title=護送商隊。|giver=商會會長', s);
    expect(stateChanges.quests).toHaveLength(1);
  });

  /**
   * 系列任務。先前包含比對沒有長度上限，「護送商隊到南門」會被判成既有
   * 「護送商隊」的重複而**靜默不建立**——玩家接了任務卻什麼都沒出現。
   */
  it('標題包含既有任務但差一大截時，會建立成新任務', () => {
    const s = state({ quests: [quest()] });   // 既有：護送商隊
    const { stateChanges } = run('QUEST_ADD|title=護送商隊到南門|giver=商會會長', s);
    expect(stateChanges.quests).toHaveLength(2);
    expect(stateChanges.quests?.map(q => q.title)).toContain('護送商隊到南門');
  });

  it('只差一兩個字時仍視為同一個任務，不重複發放', () => {
    const s = state({ quests: [quest()] });
    const { stateChanges } = run('QUEST_ADD|title=護送商隊的|giver=商會會長', s);
    expect(stateChanges.quests).toHaveLength(1);
  });

  it('真的是新任務時照常發放', () => {
    const s = state({ quests: [quest()] });
    const { stateChanges } = run('QUEST_ADD|title=討伐哥布林|giver=村長', s);
    expect(stateChanges.quests).toHaveLength(2);
  });

  it('標題有出入時仍能結案並發獎勵', () => {
    const s = state({ quests: [quest({ title: '護送商隊到南門' })] });
    const { stateChanges } = run('QUEST_COMPLETE|title=護送商隊', s);
    expect(stateChanges.quests?.[0].status).toBe('completed');
    expect(stateChanges.profile?.gold).toBe(200);   // 100 + 獎勵 100
  });

  /**
   * 先前是 `if (quest) { ... }` 沒有 else：比不到就整段靜默跳過，
   * 玩家只看到任務還掛在進行中、獎勵也沒發，而且沒有任何 log 可查。
   */
  it('完全比不到任務時不再靜默失敗，會回報⚠️', () => {
    const s = state({ quests: [quest()] });
    const { stateChanges, feedback } = run('QUEST_COMPLETE|title=某個不存在的任務', s);
    expect(stateChanges.quests).toHaveLength(1);
    expect(stateChanges.quests?.[0].status).toBe('active');   // 沒有被誤結案
    expect(stateChanges.profile).toBeUndefined();             // 沒有亂發獎勵
    expect(feedback.cmdResults.some(r => r.includes('⚠️') && r.includes('某個不存在的任務'))).toBe(true);
  });

  it('QUEST_GOAL_MET 比不到時不再謊報成功', () => {
    const s = state({ quests: [quest()] });
    const { feedback } = run('QUEST_GOAL_MET|title=某個不存在的任務', s);
    expect(feedback.cmdResults.some(r => r.includes('⚠️'))).toBe(true);
    expect(feedback.cmdResults.some(r => r.startsWith('✅'))).toBe(false);
  });

  // ─── 短 ID ────────────────────────────────────────────────────────────────
  // 標題比對救不了、也不該救的一類是「兩個標題互相包含」。短 ID 是給那一類的。
  it('QUEST_ADD 會配一組短 ID', () => {
    const { stateChanges } = run('QUEST_ADD|title=採集任務|giver=村長');
    expect(stateChanges.quests?.[0].shortId).toMatch(/^[2-9a-z]{3}$/);
  });

  it('連續發多個任務時短 ID 不重複', () => {
    let s = state();
    for (let i = 0; i < 20; i++) {
      // 標題補零到等長：`任務1` 會被 `任務10` 的包含比對判成同一個任務
      // （QUEST_ADD 的去重刻意涵蓋包含關係），那會讓這條測試量到的是去重而非 ID
      const { stateChanges } = run(`QUEST_ADD|title=任務${String(i).padStart(2, '0')}|giver=村長`, s);
      s = state({ quests: stateChanges.quests as Quest[] });
    }
    const ids = (s.quests as Quest[]).map(q => q.shortId);
    expect(new Set(ids).size).toBe(20);
  });

  /** 已結案的任務仍在存檔裡，新任務撿走它的碼的話，AI 引用時就分不出是哪一個 */
  it('短 ID 也會避開已完成任務用過的碼', () => {
    const done = Array.from({ length: 15 }, (_, i) =>
      quest({ id: `d${i}`, title: `舊任務${i}`, shortId: `x${i}z`.slice(0, 3), status: 'completed' }));
    const s = state({ quests: done });
    const { stateChanges } = run('QUEST_ADD|title=新任務|giver=村長', s);
    const created = stateChanges.quests?.find(q => q.title === '新任務');
    expect(done.map(d => d.shortId)).not.toContain(created?.shortId);
  });

  it('QUEST_COMPLETE 用 id 結案', () => {
    const s = state({ quests: [quest({ shortId: 'k3p' })] });
    const { stateChanges } = run('QUEST_COMPLETE|id=k3p', s);
    expect(stateChanges.quests?.[0].status).toBe('completed');
    expect(stateChanges.profile?.gold).toBe(200);
  });

  /** 模型多半會連 prompt 裡的井字號一起抄回來 */
  it('id 帶 # 也結得了案', () => {
    const s = state({ quests: [quest({ shortId: 'k3p' })] });
    const { stateChanges } = run('QUEST_COMPLETE|id=#k3p', s);
    expect(stateChanges.quests?.[0].status).toBe('completed');
  });

  /**
   * 這題是短 ID 存在的理由：兩個標題互相包含，`findQuestByTitle` 會刻意
   * 判定失敗（挑錯會把獎勵發到別的任務上）。只有 ID 分得出來。
   */
  it('標題互相包含時，用 id 仍能結對任務', () => {
    const s = state({
      quests: [
        quest({ id: 'q1', title: '護送商隊', shortId: 'k3p', reward: { gold: 100 } }),
        quest({ id: 'q2', title: '護送商隊到南門', shortId: 'm82', reward: { gold: 500 } }),
      ],
    });
    const { stateChanges } = run('QUEST_COMPLETE|id=m82', s);
    expect(stateChanges.quests?.find(q => q.id === 'q2')?.status).toBe('completed');
    expect(stateChanges.quests?.find(q => q.id === 'q1')?.status).toBe('active');
    expect(stateChanges.profile?.gold).toBe(600);   // 100 + 500，發對任務的獎勵
  });

  /** ID 抄錯時退回標題，而不是整條失敗 */
  it('id 比不到時退回標題比對', () => {
    const s = state({ quests: [quest({ shortId: 'k3p' })] });
    const { stateChanges } = run('QUEST_COMPLETE|id=zzz|title=護送商隊', s);
    expect(stateChanges.quests?.[0].status).toBe('completed');
  });

  it('QUEST_GOAL_MET 也吃 id', () => {
    const s = state({ quests: [quest({ shortId: 'k3p' })] });
    const { stateChanges } = run('QUEST_GOAL_MET|id=k3p', s);
    expect(stateChanges.quests?.[0].isGoalMet).toBe(true);
  });

  it('QUEST_GOAL_MET 標題有出入時仍標記待回報', () => {
    const s = state({ quests: [quest({ title: '護送商隊到南門' })] });
    const { stateChanges } = run('QUEST_GOAL_MET|title=「護送商隊到南門」', s);
    expect(stateChanges.quests?.[0].isGoalMet) .toBe(true);
  });
})

/**
 * 玩家回報：「時間跟天氣他現在抓不準，故事是早上可是狀態列裡面是半夜，
 * 天氣也沒有改變，他沒有辦法校準。」
 *
 * 兩個獨立的缺口：
 * - `weather` 注入 prompt、畫在狀態列，但沒有任何指令寫得到它 → 永遠是初始值
 * - `TIME` 只有 delta，時鐘只能累加，一旦與敘事分家就再也合不回來
 */
describe('reduceCommands — WEATHER', () => {
  it('寫入 stateChanges.timeState.weather', () => {
    const { stateChanges, feedback } = run('WEATHER|value=下雨');
    expect(stateChanges.timeState?.weather).toBe('下雨');
    expect(feedback.cmdResults.some(r => r.includes('下雨'))).toBe(true);
  });

  it('同義詞收斂成清單上的值', () => {
    expect(run('WEATHER|value=傾盆大雨').stateChanges.timeState?.weather).toBe('下雨');
  });

  /** AI 每回合都輸出 WEATHER 是常態，沒變還報一次只是刷版面 */
  it('與現值相同時不動、也不推訊息', () => {
    const { stateChanges, feedback } = run('WEATHER|value=晴朗');
    expect(stateChanges.timeState).toBeUndefined();
    expect(feedback.cmdResults).toHaveLength(0);
  });

  /** 認不得的天氣丟棄，與 STAT|field= 的白名單同一個原則 */
  it('認不得的天氣整條丟棄', () => {
    const { stateChanges } = run('WEATHER|value=微風徐徐帶著海鹽味');
    expect(stateChanges.timeState).toBeUndefined();
  });

  /**
   * 同一回合同時有 WEATHER 與 TIME 時，時間那段是後寫的。
   * 直接指派 stateChanges.timeState 會把 weather 蓋掉——下雨過了一小時，
   * 天氣就默默變回晴朗。
   */
  it('與 TIME 同回合時天氣不會被時間覆蓋', () => {
    const { stateChanges } = run('WEATHER|value=下雨\nTIME|delta=+1h');
    expect(stateChanges.timeState?.weather).toBe('下雨');
    expect(stateChanges.timeState?.hour).toBe(13);
  });
});

describe('reduceCommands — TIME 絕對時刻校準', () => {
  const night = () => state({
    timeState: { year: 1024, month: 4, day: 15, hour: 2, minute: 14, weather: '晴朗' },
  });

  it('set 把半夜的時鐘校準到早上', () => {
    const { stateChanges } = run('TIME|set=07:00', night());
    expect(stateChanges.timeState).toMatchObject({ day: 15, hour: 7, minute: 0 });
  });

  it('校準時推一則訊息讓玩家看得見', () => {
    const { feedback } = run('TIME|set=07:00', night());
    expect(feedback.cmdResults.some(r => r.includes('校準'))).toBe(true);
  });

  it('delta 與 set 同時出現時，先累加再校準', () => {
    const { stateChanges } = run('TIME|delta=+30m\nTIME|set=09:00', night());
    expect(stateChanges.timeState).toMatchObject({ hour: 9, minute: 0 });
  });

  it('多條 set 以最後一條為準', () => {
    const { stateChanges } = run('TIME|set=07:00\nTIME|set=10:30', night());
    expect(stateChanges.timeState).toMatchObject({ hour: 10, minute: 30 });
  });

  /** 只有 delta 時完全維持原本行為 */
  it('沒有 set 時不推校準訊息', () => {
    const { feedback } = run('TIME|delta=+1h', night());
    expect(feedback.cmdResults.some(r => r.includes('校準'))).toBe(false);
  });

  /** 跨日的校準要標出日期，否則玩家只會發現任務莫名逾期 */
  it('跨日校準的訊息帶上日期', () => {
    const { feedback, stateChanges } = run(
      'TIME|set=06:00',
      state({ timeState: { year: 1024, month: 4, day: 15, hour: 23, minute: 0, weather: '晴朗' } })
    );
    expect(stateChanges.timeState).toMatchObject({ day: 16, hour: 6 });
    expect(feedback.cmdResults.some(r => r.includes('4/16'))).toBe(true);
  });
});

/**
 * 玩家回報：「我在黑牙氏族，氏族裡有廚房，我的所在地被標在廚房，
 * 其他氏族裡的 NPC 出不來。」
 *
 * `currentLocation` 是 Phase 1 候選名單的比對鍵，而那是字串完全相等比對
 * （promptBuilder：`e.homeLocation === loc`）。一旦被寫成「廚房」這種建築內的
 * 房間，主場在「黑牙氏族營地」的角色全部比不中，整個氏族的人就此消失。
 *
 * LOCATION_DISCOVER 早有「建築內的個別房間一律不要登錄」的粒度規則，
 * LOCATION 卻完全沒有——prompt 的觸發時機清單根本沒提它。這裡把兩者對齊。
 */
describe('reduceCommands — LOCATION 的粒度守門', () => {
  const camp = (): LorebookEntry => ({
    id: 1, title: '黑牙氏族營地', content: '', category: '地點', isActive: true,
    mapX: 60, mapY: 20, mapStatus: 'known',
  });
  // 玩家站在已登錄的營地上——這是守門真正該生效的前提
  const atCamp = (over: Partial<CurrentState> = {}) =>
    state({ currentLocation: '黑牙氏族營地', lorebookEntries: [camp()], ...over });

  it('走進營地裡的廚房不改變所在地', () => {
    const { stateChanges } = run('LOCATION|name=廚房', atCamp());
    expect(stateChanges.currentLocation).toBeUndefined();
  });

  it('被判定成房間時不推「移動至」的提示，避免與畫面上沒變的地點矛盾', () => {
    const { feedback } = run('LOCATION|name=廚房', atCamp());
    expect(feedback.cmdResults.some(r => r.includes('移動至'))).toBe(false);
  });

  it('移動到設定集裡真的有的地點照常生效', () => {
    const forest = { ...camp(), id: 2, title: '迷霧森林', mapStatus: 'heard' as const };
    const { stateChanges } = run('LOCATION|name=迷霧森林', atCamp({ lorebookEntries: [camp(), forest] }));
    expect(stateChanges.currentLocation).toBe('迷霧森林');
  });

  /**
   * 「抵達新城鎮」本來就該同時輸出 LOCATION 與 LOCATION_DISCOVER。
   * 粒度判定必須與指令順序無關——LOCATION 排在 DISCOVER 之前也要成立。
   */
  it.each([
    ['DISCOVER 在前', 'LOCATION_DISCOVER|name=新城鎮|x=90|y=40|type=town\nLOCATION|name=新城鎮'],
    ['LOCATION 在前', 'LOCATION|name=新城鎮\nLOCATION_DISCOVER|name=新城鎮|x=90|y=40|type=town'],
  ])('同批指令登錄新地點時放行（%s）', (_label, cmds) => {
    const { stateChanges } = run(cmds, atCamp());
    expect(stateChanges.currentLocation).toBe('新城鎮');
  });

  /**
   * NPC_NEW 拿 currentLocation 當新角色的 homeLocation。守門若拖到迴圈之後才做，
   * 「抵達新城鎮並遇見商人」會把商人的主場寫成上一個地點——那個角色從此
   * 進不了新城鎮的候選名單。所以粒度判定必須在主迴圈之前完成。
   */
  it('同批的 NPC_NEW 用的是判定後的地點', () => {
    const { stateChanges } = run(
      'LOCATION|name=新城鎮\nLOCATION_DISCOVER|name=新城鎮|x=90|y=40|type=town\nNPC_NEW|name=商人',
      atCamp(),
    );
    const merchant = stateChanges.lorebookEntries?.find(e => e.title === '商人');
    expect(merchant?.homeLocation).toBe('新城鎮');
  });

  it('房間名被擋下時，同批的 NPC_NEW 主場是營地而不是廚房', () => {
    const { stateChanges } = run('LOCATION|name=廚房\nNPC_NEW|name=廚子', atCamp());
    const cook = stateChanges.lorebookEntries?.find(e => e.title === '廚子');
    expect(cook?.homeLocation).toBe('黑牙氏族營地');
  });

  /**
   * 安全閥：目前地點自己都不在設定集裡，代表已經在地圖之外（舊存檔卡在「廚房」，
   * 或這條規則上線前留下的自由文字地名）。這時再擋就是把玩家永久困住，
   * 連走回營地都做不到——一律放行。
   */
  it('目前地點不在設定集裡時一律放行，才不會把玩家困死', () => {
    const { stateChanges } = run(
      'LOCATION|name=餐廳',
      state({ currentLocation: '廚房', lorebookEntries: [camp()] }),
    );
    expect(stateChanges.currentLocation).toBe('餐廳');
  });

  it('卡在地圖外時仍能走回已登錄的地點', () => {
    const { stateChanges } = run(
      'LOCATION|name=黑牙氏族營地',
      state({ currentLocation: '廚房', lorebookEntries: [camp()] }),
    );
    expect(stateChanges.currentLocation).toBe('黑牙氏族營地');
  });
});

// 玩家回報：「GM AI 讀到了故事集裡的人物，但名字會搞錯。有時出現同樣設定但
// 不同名的 NPC，有時出現同名不同設定的 NPC。」
//
// 名字比對一律走 normalizeNpcName。指令這側的前後空白 parseKV 已經處理掉了
// （所以下面幾條在修正前就是綠的，它們是防回歸的守衛）；真正會對不上的是
// 沒經過指令解析的名字——玩家在角色卡手打的、npcImport 帶進來的、舊存檔裡的。
// 那一段由 npcProfile.test.ts 的 findNpcLore 測試釘住。
describe('reduceCommands — NPC 名稱正規化', () => {
  const withNpc = (over: Partial<Npc> = {}) =>
    state({ npcs: [npc(over)], lorebookEntries: [{
      id: 1, title: '芬里爾', content: '', category: 'NPC', isActive: true,
      job: '獵人', gender: '男',
    }] });

  it('NPC_NEW 帶多餘空白時不會建出分身', () => {
    const { stateChanges } = run('NPC_NEW|name= 芬里爾 |job=獵人', withNpc());
    expect(stateChanges.npcs?.map(n => n.name)).toEqual(['芬里爾']);
    expect(stateChanges.lorebookEntries?.map(e => e.title)).toEqual(['芬里爾']);
  });

  it('AFFINITY 帶多餘空白仍記到同一個人身上', () => {
    const { stateChanges } = run('AFFINITY|npc= 芬里爾 |delta=+5', withNpc({ affection: 10 }));
    expect(stateChanges.npcs?.[0].affection).toBe(15);
  });

  it('NPC_THOUGHT 帶全形空白仍記到同一個人身上', () => {
    const { stateChanges } = run('NPC_THOUGHT|npc=　芬里爾　|text=覺得玩家可信', withNpc());
    expect(stateChanges.npcs?.[0].thoughts?.[0].text).toBe('覺得玩家可信');
  });

  it('NPC_HOME 帶多餘空白仍寫得到設定集條目', () => {
    const { stateChanges } = run('NPC_HOME|name= 芬里爾|loc=迷霧森林', withNpc());
    expect(stateChanges.lorebookEntries?.[0].homeLocation).toBe('迷霧森林');
  });

  it('NPC_RELATIONSHIP 帶多餘空白仍寫得到', () => {
    const { stateChanges } = run('NPC_RELATIONSHIP|npc=芬里爾 |rel=旅伴', withNpc());
    expect(stateChanges.npcs?.[0].relationship).toBe('旅伴');
  });

  it('新角色的名字存進去時已經正規化，不會留下前後空白', () => {
    const { stateChanges } = run('NPC_NEW|name= 萊尼 |job=酒館老闆娘');
    expect(stateChanges.npcs?.[1].name).toBe('萊尼');
    expect(stateChanges.lorebookEntries?.[0].title).toBe('萊尼');
  });

  it('名字只有空白時整條丟棄，不建出無名角色', () => {
    const { stateChanges } = run('NPC_NEW|name=   |job=獵人');
    expect(stateChanges.npcs?.map(n => n.name)).toEqual(['芬里爾']);
    expect(stateChanges.lorebookEntries).toEqual([]);
  });
});

/**
 * 「同名不同設定」的另一半：設定集條目的欄位是空的時候，prompt 拿不到外貌／
 * 個性，AI 每次都得重編一份。既有值一律不覆蓋（先寫先贏，同 itemCatalog），
 * 但原本是空的就補上——這是唯一的補寫機會。
 */
describe('reduceCommands — NPC_NEW 對既有角色只補空欄位', () => {
  const existing = (over: Partial<LorebookEntry> = {}) => state({
    npcs: [npc({ name: '芬里爾' })],
    lorebookEntries: [{
      id: 1, title: '芬里爾', content: '', category: 'NPC', isActive: true,
      gender: '男', job: '獵人', appearance: '', personality: '',
      ...over,
    }],
  });

  it('空欄位補上 AI 這次給的值', () => {
    const { stateChanges } = run(
      'NPC_NEW|name=芬里爾|gender=女|job=吟遊詩人|appearance=銀髮高挑|personality=冷靜寡言',
      existing(),
    );
    expect(stateChanges.lorebookEntries?.[0]).toMatchObject({
      appearance: '銀髮高挑', personality: '冷靜寡言',
    });
  });

  it('既有值不被覆蓋——設定集才是唯一來源', () => {
    const { stateChanges } = run(
      'NPC_NEW|name=芬里爾|gender=女|job=吟遊詩人',
      existing(),
    );
    expect(stateChanges.lorebookEntries?.[0]).toMatchObject({ gender: '男', job: '獵人' });
  });

  it('不重複建立 Npc 執行狀態', () => {
    const { stateChanges } = run('NPC_NEW|name=芬里爾|appearance=銀髮', existing());
    expect(stateChanges.npcs).toHaveLength(1);
  });

  it('既有欄位全滿時一個字都不改', () => {
    const s = existing({ appearance: '銀髮高挑', personality: '冷靜寡言' });
    const { stateChanges } = run('NPC_NEW|name=芬里爾|appearance=黑髮矮小|personality=暴躁', s);
    expect(stateChanges.lorebookEntries?.[0]).toMatchObject({
      appearance: '銀髮高挑', personality: '冷靜寡言',
    });
  });
});

// 玩家要求：「在地點的地方設置主城市跟城內地點的子母關係，例如：月湖鎮裡的
// 醉醺醺酒館。」候選名單靠 parentLocation 判定同城（見 utils/locationTree.ts）。
describe('reduceCommands — LOCATION_DISCOVER 的 parent', () => {
  const town = (over: Partial<LorebookEntry> = {}): LorebookEntry => ({
    id: 1, title: '月湖鎮', content: '', category: '地點', isActive: true,
    locationType: 'town', mapX: 0, mapY: 0, mapStatus: 'known', ...over,
  });

  it('新地點掛在既有城鎮底下', () => {
    const { stateChanges } = run(
      'LOCATION_DISCOVER|name=醉醺醺酒館|x=2|y=1|type=building|parent=月湖鎮|desc=鎮上的酒館',
      state({ lorebookEntries: [town()] }),
    );
    expect(stateChanges.lorebookEntries?.[1].parentLocation).toBe('月湖鎮');
  });

  /**
   * parent 認不得就留空——留空只是退回「字串完全相等」的舊行為，
   * 寫錯卻會把兩座不相干的城判成同一座，整批 NPC 互相亂竄。
   */
  it('parent 不是設定集裡的地點時忽略', () => {
    const { stateChanges } = run(
      'LOCATION_DISCOVER|name=醉醺醺酒館|x=2|y=1|parent=不存在的城',
      state({ lorebookEntries: [town()] }),
    );
    expect(stateChanges.lorebookEntries?.[1].parentLocation).toBeUndefined();
  });

  it('parent 指向自己時忽略（否則整棵樹失去意義）', () => {
    const { stateChanges } = run(
      'LOCATION_DISCOVER|name=醉醺醺酒館|x=2|y=1|parent=醉醺醺酒館',
      state({ lorebookEntries: [town()] }),
    );
    expect(stateChanges.lorebookEntries?.[1].parentLocation).toBeUndefined();
  });

  it('同一批指令裡新登錄的城鎮也能當 parent', () => {
    const { stateChanges } = run(
      'LOCATION_DISCOVER|name=新城鎮|x=90|y=40|type=town\n' +
      'LOCATION_DISCOVER|name=新城鎮酒館|x=91|y=41|type=building|parent=新城鎮',
    );
    expect(stateChanges.lorebookEntries?.[1].parentLocation).toBe('新城鎮');
  });

  // 既有值先寫先贏：玩家可能在設定集裡調過歸屬
  it('既有條目的母地點不被覆蓋', () => {
    const { stateChanges } = run(
      'LOCATION_DISCOVER|name=醉醺醺酒館|x=2|y=1|parent=月湖鎮',
      state({ lorebookEntries: [
        town(),
        { id: 2, title: '醉醺醺酒館', content: '', category: '地點', isActive: true, parentLocation: '別座城' },
        { id: 3, title: '別座城', content: '', category: '地點', isActive: true },
      ] }),
    );
    expect(stateChanges.lorebookEntries?.[1].parentLocation).toBe('別座城');
  });

  it('沒給 parent 時不寫入這個欄位', () => {
    const { stateChanges } = run(
      'LOCATION_DISCOVER|name=醉醺醺酒館|x=2|y=1',
      state({ lorebookEntries: [town()] }),
    );
    expect(stateChanges.lorebookEntries?.[1].parentLocation).toBeUndefined();
  });
});
