import { describe, it, expect } from 'vitest';
import { saveDataMapper, CURRENT_SCHEMA } from '../useGameStore';
import { Npc, Faction } from '../../types';

// v4 → v5：NPC 勢力歸屬先前存在兩個地方各寫各的——FACTION_JOIN 寫 Npc.factionIds，
// 勢力分頁的勾選寫 Faction.npcIds。promptBuilder 只讀前者，於是手動勾的成員 AI 看不到。
describe('migrateV4toV5 — 勢力歸屬合一', () => {
  const run = (npcs: Partial<Npc>[], factions: Partial<Faction>[]) =>
    saveDataMapper({ schemaVersion: 4, npcs, factions });

  it('Faction.npcIds 摺進 Npc.factionIds', () => {
    const d = run([{ id: 1, name: '芬里爾', memories: [] }], [{ id: 5, name: '黑牙氏族', npcIds: [1] }]);
    expect(d.npcs[0].factionIds).toEqual([5]);
  });

  it('與既有 factionIds 聯集且去重', () => {
    const d = run(
      [{ id: 1, name: '芬里爾', factionIds: [5, 9], memories: [] }],
      [{ id: 5, name: 'A', npcIds: [1] }, { id: 9, name: 'B', npcIds: [1] }, { id: 12, name: 'C', npcIds: [1] }],
    );
    expect([...d.npcs[0].factionIds!].sort((a, b) => a - b)).toEqual([5, 9, 12]);
  });

  it('遷移後移除 Faction.npcIds，不留第二個來源', () => {
    const d = run([{ id: 1, name: 'A', memories: [] }], [{ id: 5, name: 'F', npcIds: [1] }]);
    expect('npcIds' in d.factions[0]).toBe(false);
  });

  it('npcIds 指向不存在的 NPC 不會爆，其餘照常', () => {
    const d = run([{ id: 1, name: 'A', memories: [] }], [{ id: 5, name: 'F', npcIds: [1, 999] }]);
    expect(d.npcs[0].factionIds).toEqual([5]);
    expect(d.npcs).toHaveLength(1);
  });

  it('沒有勢力的存檔原樣通過', () => {
    const d = run([{ id: 1, name: 'A', memories: [] }], []);
    expect(d.npcs[0].factionIds).toBeUndefined();
  });

  // 已是 v5 的存檔不該被重跑（factionIds 才是來源，npcIds 應已不存在）
  it('v5 存檔不受影響', () => {
    const d = saveDataMapper({
      schemaVersion: CURRENT_SCHEMA,
      npcs: [{ id: 1, name: 'A', factionIds: [5], memories: [] }],
      factions: [{ id: 5, name: 'F' }],
    });
    expect(d.npcs[0].factionIds).toEqual([5]);
  });
});

describe('saveDataMapper — 空存檔預設值', () => {
  it('回傳完整預設結構', () => {
    const d = saveDataMapper({});
    expect(d.schemaVersion).toBe(CURRENT_SCHEMA);
    expect(d.profile.hp).toBe(50);
    expect(d.profile.job).toBe('異鄉人');
    expect(d.npcs).toEqual([]);
    expect(d.factions).toEqual([]);
    expect(d.statusEffects).toEqual([]);
    expect(Array.isArray(d.messages)).toBe(true);
  });

  it('新遊戲隨機開場：時間在合法範圍', () => {
    const d = saveDataMapper({});
    expect(d.timeState.hour).toBeGreaterThanOrEqual(0);
    expect(d.timeState.hour).toBeLessThan(24);
    expect(d.timeState.day).toBeGreaterThanOrEqual(1);
    expect(d.timeState.day).toBeLessThanOrEqual(30);
    expect(d.currentLocation).toBeTruthy();
  });
});

describe('saveDataMapper — schema migration', () => {
  it('v1 → v2：inventory/consumables 更名為 equipment/items', () => {
    const d = saveDataMapper({
      schemaVersion: 1,
      inventory: [{ id: 1, name: '鐵劍', description: '', isEquipped: true }],
      consumables: [{ id: 2, name: '草藥', quantity: 3, description: '' }],
      currentLocation: '月湖鎮',
      timeState: { year: 1024, month: 4, day: 15, hour: 12, minute: 0, weather: '晴朗' },
    });
    expect(d.equipment).toHaveLength(1);
    expect(d.equipment[0]).toMatchObject({ name: '鐵劍', isEquipped: true });
    expect(d.items).toHaveLength(1);
    expect(d.items[0]).toMatchObject({ name: '草藥', quantity: 3 });
  });

  it('v2 → v3：補上空 factions 陣列', () => {
    const d = saveDataMapper({ schemaVersion: 2, currentLocation: '月湖鎮' });
    expect(d.factions).toEqual([]);
    expect(d.schemaVersion).toBe(CURRENT_SCHEMA);
  });

  it('v3 → v4：從既有背包 items 建立道具圖鑑', () => {
    const d = saveDataMapper({
      schemaVersion: 3,
      currentLocation: '月湖鎮',
      timeState: { year: 1024, month: 4, day: 15, hour: 12, minute: 0, weather: '晴朗' },
      items: [{ id: 1, name: '草藥', quantity: 3, description: '回復 20 HP' }],
    });
    expect(d.itemCatalog['草藥']).toMatchObject({ name: '草藥', description: '回復 20 HP' });
  });

  it('v4 存檔已有 itemCatalog 時不重建', () => {
    const d = saveDataMapper({
      schemaVersion: 4,
      currentLocation: '月湖鎮',
      timeState: { year: 1024, month: 4, day: 15, hour: 12, minute: 0, weather: '晴朗' },
      items: [{ id: 1, name: '草藥', quantity: 3, description: '後來的描述' }],
      itemCatalog: { 草藥: { name: '草藥', description: '原始描述', createdAt: '4/1', lastUsedAt: 1 } },
    });
    expect(d.itemCatalog['草藥'].description).toBe('原始描述');
  });

  it('NPC 舊字串記憶轉為 NpcMemory 物件', () => {
    const d = saveDataMapper({
      schemaVersion: 3,
      currentLocation: '月湖鎮',
      npcs: [{
        id: 1, name: '芬里爾', job: '獵人', affection: 10, affectionLabel: '',
        appearance: '', personality: '', category: 'NPC', isActive: true,
        memories: ['救過玩家一命'],
      }],
    });
    const mem = d.npcs[0].memories[0];
    expect(mem).toMatchObject({ text: '救過玩家一命', source: 'manual', importance: 'normal' });
    expect(mem.id).toContain('nmem_legacy');
  });

  it('quests 補上 isGoalMet 預設值', () => {
    const d = saveDataMapper({
      schemaVersion: 3,
      currentLocation: '月湖鎮',
      quests: [{
        id: 'q1', title: '任務', giver: '', description: '', reward: {},
        status: 'active', createdAt: '4/15', createdAtTotalDays: 100,
      }],
    });
    expect(d.quests[0].isGoalMet).toBe(false);
  });

  it('保留既有 profile 數值不被預設值覆蓋', () => {
    const d = saveDataMapper({
      schemaVersion: 3,
      currentLocation: '月湖鎮',
      profile: { name: '陸星辰', hp: 0, mp: 5, gold: 999 },
    });
    // hp: 0 是合法值（?? 不會覆蓋），name 保留
    expect(d.profile).toMatchObject({ name: '陸星辰', hp: 0, mp: 5, gold: 999 });
  });
});

// handleImportSave 匯入後上傳雲端的快照改用 saveDataMapper(parsed) 產生，
// 而非 buildSaveSnapshot()——後者讀閉包捕獲的 state，在 loadFromData 的 setState
// flush 前會拿到「匯入前」的舊資料，把雲端槽覆蓋掉。
// 這組測試守住該修法的前提：mapper 必須完整保留匯入內容，且為冪等。
describe('saveDataMapper — 匯入快照（handleImportSave 依賴）', () => {
  const savedGame: Record<string, unknown> = {
    schemaVersion: 4,
    profile: { name: '陸星辰', job: '劍士', appearance: '黑髮', personality: '沉穩', other: '左撇子', hp: 80, mp: 12, gold: 250 },
    currentLocation: '哈德的奇物店',
    timeState: { year: 1024, month: 8, day: 3, hour: 1, minute: 24, weather: '晴朗' },
    npcs: [{
      id: 1, name: '萊尼', job: '拾荒者', affection: 5, affectionLabel: '',
      appearance: '', personality: '', category: 'NPC', isActive: true, memories: [],
    }],
    appearingNpcs: ['萊尼'],
    quests: [{ id: 'q1', title: '碎片來源', giver: '哈德', description: '', reward: {}, status: 'active', createdAt: '8/3', createdAtTotalDays: 1 }],
    factions: [{ id: 1, name: '拾荒者聯盟', isActive: true }],
    currentGoals: ['回應哈德的詢問'],
    itemCatalog: { 金屬碎片: { name: '金屬碎片', description: '來源不明', createdAt: '8/3', lastUsedAt: 1 } },
  };

  it('完整保留匯入內容，不被預設值覆蓋', () => {
    const d = saveDataMapper(savedGame);
    expect(d.profile).toMatchObject({ name: '陸星辰', job: '劍士', appearance: '黑髮', hp: 80, gold: 250 });
    expect(d.currentLocation).toBe('哈德的奇物店');
    expect(d.timeState).toMatchObject({ hour: 1, minute: 24 });
    expect(d.npcs[0].name).toBe('萊尼');
    expect(d.appearingNpcs).toEqual(['萊尼']);
    expect(d.quests[0].title).toBe('碎片來源');
    expect(d.factions[0].name).toBe('拾荒者聯盟');
    expect(d.currentGoals).toEqual(['回應哈德的詢問']);
    expect(d.itemCatalog['金屬碎片'].description).toBe('來源不明');
  });

  it('冪等：再次餵回 mapper 結果不變（上傳的與載入的是同一份）', () => {
    const once  = saveDataMapper(savedGame);
    const twice = saveDataMapper({ ...once });
    expect(twice).toEqual(once);
  });
});

// 回歸：舊實作用 `(d.currentGoals as string[]) || []`，擋不掉「型別錯但 truthy」的值。
// 助理 GM 偶爾會把 goals 回成字串，寫進 state 後 GoalsPanel 的 .map 直接爆炸，
// 而且它會被存進雲端存檔——之後每次載入都白畫面。陣列欄位一律用 Array.isArray 驗。
describe('saveDataMapper — 陣列欄位型別防衛', () => {
  it('非陣列的 currentGoals / adventureLog / summaryPool 退回空陣列', () => {
    const d = saveDataMapper({
      currentGoals: '回應哈德的詢問',
      adventureLog: { latest: '走進店裡' },
      summaryPool: 'x',
    });
    expect(d.currentGoals).toEqual([]);
    expect(d.adventureLog).toEqual([]);
    expect(d.summaryPool).toEqual([]);
  });

  it('非陣列的 quests / memories / diaryEntries 退回空陣列', () => {
    const d = saveDataMapper({ quests: 'oops', memories: 'oops', diaryEntries: 'oops' });
    expect(d.quests).toEqual([]);
    expect(d.memories).toEqual([]);
    expect(d.diaryEntries).toEqual([]);
  });
});
