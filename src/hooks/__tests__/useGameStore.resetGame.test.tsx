// @vitest-environment jsdom
import '../../test/setupDom';
import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useGameStore, GameSaveData } from '../useGameStore';
import { INITIAL_SYSTEM_PROMPT } from '../../constants';

/**
 * 重置遊戲＝清掉這一槽的進度、回到全新遊戲，同時保留玩家自訂的世界設定。
 *
 * 這支測試釘住的是一個實際壞掉過的行為：舊版「重置」其實是刪雲端存檔槽 + reload，
 * 而 reload 後的初始化會去載入「最新的一槽」——玩家只要有第二個存檔槽就會直接
 * 掉進另一份舊進度，進度從頭到尾沒被清過。
 */

// 一份「玩到一半」的存檔
const PLAYED: Record<string, unknown> = {
  profile: { name: '小美', job: '藥師', appearance: '短髮', personality: '好奇', other: '左撇子', hp: 12, mp: 30, gold: 999 },
  systemPrompt: { worldPremise: '自訂世界觀', roleplayRules: '自訂規則', writingStyle: '自訂文風' },
  lorebookEntries: [
    { id: 1, title: '自訂村莊', content: '玩家自己寫的地點', category: '地點', isActive: true },
    { id: 2, title: '芬里爾', content: '獵人', category: 'NPC', isActive: true },
  ],
  npcs: [
    { id: 1, name: '芬里爾', job: '獵人', affection: 85, appearance: '銀髮', personality: '寡言',
      category: '登場人物', isActive: true, isPinned: true, relationship: '戀人',
      location: '月湖鎮', lastSeenLocation: '月湖鎮', lastSeenDate: '4/20',
      thoughts: [{ text: '想再見到她', createdAt: '4/20' }],
      memories: [{ id: 'nm1', text: '一起打過狼', createdAt: '4/18', source: 'manual', importance: 'normal' }],
      factionIds: [5] },
  ],
  factions: [{ id: 5, name: '黑牙氏族', type: 'criminal' }],
  appearingNpcs: ['芬里爾'],
  items: [{ id: 1, name: '草藥', quantity: 3, description: '回復 20 HP' }],
  itemCatalog: { 草藥: { name: '草藥', description: '回復 20 HP', createdAt: '4/15', lastUsedAt: 1 } },
  equipment: [{ id: 1, name: '鐵劍', description: '普通的劍', isEquipped: true }],
  quests: [{ id: 1, title: '找回失物', status: 'active' }],
  diaryEntries: [{ id: 1, text: '今天遇到了芬里爾', isActive: true, keywords: [] }],
  memories: [
    { id: 'm1', type: 'world', importance: 'normal', content: '玩家手寫設定', source: 'manual',
      tags: { locations: [], npcs: [], factions: [], keywords: [] },
      trigger: { scanDepth: 5, probability: 100, sticky: 0, cooldown: 0 }, isActive: true, createdAt: '4/15' },
    { id: 'm2', type: 'scene', importance: 'flavor', content: 'AI 生的劇情記憶', source: 'ai_generated',
      tags: { locations: [], npcs: [], factions: [], keywords: [] },
      trigger: { scanDepth: 5, probability: 100, sticky: 0, cooldown: 0 }, isActive: true, createdAt: '4/16' },
  ],
  messages: [
    { id: 1, role: 'assistant', text: '開場' },
    { id: 2, role: 'user', text: '我往北走' },
    { id: 3, role: 'assistant', text: '你抵達了月湖鎮' },
  ],
  currentLocation: '月湖鎮',
  timeState: { year: 1024, month: 7, day: 3, hour: 14, minute: 20, weather: '下雨' },
  currentGoals: ['找到回家的方法'],
  summaryPool: ['前情提要一'],
  compressCount: 4,
  statusEffects: [{ id: 1, name: '中毒', description: '每回合 -3 HP' }],
  quickOptions: ['進酒館', '找公會', '睡覺'],
};

function setup() {
  const hook = renderHook(() => useGameStore());
  act(() => hook.result.current.loadFromData(PLAYED));
  let returned!: GameSaveData;
  act(() => { returned = hook.result.current.resetGame(); });
  return { store: hook.result.current, returned };
}

describe('useGameStore.resetGame — 清進度', () => {
  it('對話回到初始開場', () => {
    const { store } = setup();
    expect(store.messages).toHaveLength(1);
    expect(store.messages[0].role).toBe('assistant');
  });

  it('背包、裝備、圖鑑、任務、日記、狀態全部清空', () => {
    const { store } = setup();
    expect(store.items).toEqual([]);
    expect(store.equipment).toEqual([]);
    expect(store.itemCatalog).toEqual({});
    expect(store.quests).toEqual([]);
    expect(store.diaryEntries).toEqual([]);
    expect(store.statusEffects).toEqual([]);
  });

  it('助理 GM 的中期記憶與目標清空', () => {
    const { store } = setup();
    expect(store.currentGoals).toEqual([]);
    expect(store.summaryPool).toEqual([]);
    expect(store.compressCount).toBe(0);
  });

  it('數值回到初始值，出場名單清空', () => {
    const { store } = setup();
    expect(store.profile.hp).toBe(50);
    expect(store.profile.mp).toBe(0);
    expect(store.profile.gold).toBe(0);
    expect(store.appearingNpcs).toEqual([]);
  });

  it('AI 生成的記憶清掉，手寫的保留', () => {
    const { store } = setup();
    expect(store.memories.map(m => m.id)).toEqual(['m1']);
  });
});

describe('useGameStore.resetGame — 保留設定', () => {
  it('自訂 systemPrompt 不會被還原成預設', () => {
    const { store } = setup();
    expect(store.systemPrompt.worldPremise).toBe('自訂世界觀');
    expect(store.systemPrompt.worldPremise).not.toBe(INITIAL_SYSTEM_PROMPT.worldPremise);
  });

  it('設定集（含 NPC 條目）原樣保留', () => {
    const { store } = setup();
    expect(store.lorebookEntries.map(e => e.title)).toEqual(['自訂村莊', '芬里爾']);
  });

  it('角色設定欄位保留，只有數值被重置', () => {
    const { store } = setup();
    expect(store.profile.name).toBe('小美');
    expect(store.profile.job).toBe('藥師');
    expect(store.profile.appearance).toBe('短髮');
    expect(store.profile.personality).toBe('好奇');
    expect(store.profile.other).toBe('左撇子');
  });

  it('勢力保留，NPC 的勢力歸屬不會變成懸空 id', () => {
    const { store } = setup();
    expect(store.factions.map(f => f.name)).toEqual(['黑牙氏族']);
    expect(store.npcs[0].factionIds).toEqual([5]);
  });

  // 設定集的 NPC 條目被保留，若 npcs[] 被清空，角色進得了 prompt 卻沒有好感度紀錄，
  // AFFINITY 指令會靜默失效（CLAUDE.md 注意事項 20：兩份資料必須同時存在）
  it('NPC 不刪人，只把關係進度歸零', () => {
    const { store } = setup();
    const npc = store.npcs[0];
    expect(npc.name).toBe('芬里爾');
    expect(npc.affection).toBe(0);
    expect(npc.memories).toEqual([]);
    expect(npc.thoughts).toEqual([]);
    expect(npc.isPinned).toBe(false);
    expect(npc.relationship).toBeUndefined();
    expect(npc.location).toBeUndefined();
    expect(npc.lastSeenLocation).toBeUndefined();
    expect(npc.lastSeenDate).toBeUndefined();
  });
});

describe('useGameStore.resetGame — 回傳值', () => {
  // 呼叫端要拿這份去上傳雲端。若改用 buildSaveSnapshot()，讀到的會是閉包捕獲的
  // 舊 state（setState 要到次一次 render 才生效），等於把重置前的進度又寫回雲端。
  it('回傳的是重置後的資料，不是重置前的快照', () => {
    const { returned } = setup();
    expect(returned.messages).toHaveLength(1);
    expect(returned.items).toEqual([]);
    expect(returned.npcs[0].affection).toBe(0);
    expect(returned.profile.gold).toBe(0);
    expect(returned.systemPrompt.worldPremise).toBe('自訂世界觀');
  });

  it('回傳值與寫進 state 的內容一致', () => {
    const { store, returned } = setup();
    expect(returned.currentLocation).toBe(store.currentLocation);
    expect(returned.timeState).toEqual(store.timeState);
  });
});
