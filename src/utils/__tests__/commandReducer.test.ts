import { describe, it, expect } from 'vitest';
import { parseCommandsToAST } from '../commandParser';
import { reduceCommands, CurrentState } from '../commandReducer';
import { Npc, Quest, ItemEntry, StatusEffect } from '../../types';

const npc = (over: Partial<Npc> = {}): Npc => ({
  id: 1, name: '芬里爾', job: '獵人', affection: 10, affectionLabel: '陌生人',
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
