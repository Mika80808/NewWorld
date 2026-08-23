import { describe, it, expect } from 'vitest';
import { saveDataMapper, CURRENT_SCHEMA } from '../useGameStore';
import { Npc, Faction, Quest } from '../../types';

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
  it('非陣列的 currentGoals / summaryPool 退回空陣列', () => {
    const d = saveDataMapper({
      currentGoals: '回應哈德的詢問',
      summaryPool: 'x',
    });
    expect(d.currentGoals).toEqual([]);
    expect(d.summaryPool).toEqual([]);
  });

  it('非陣列的 quests / memories / diaryEntries 退回空陣列', () => {
    const d = saveDataMapper({ quests: 'oops', memories: 'oops', diaryEntries: 'oops' });
    expect(d.quests).toEqual([]);
    expect(d.memories).toEqual([]);
    expect(d.diaryEntries).toEqual([]);
  });
});

// v5 → v6：只有設定集條目、沒有 npcs[] 紀錄的 NPC 是二等公民——
// 「當前場景人物」只讀 npcs[]，所以他們永遠顯示不出來；好感度存不住、
// 釘選也沒作用（LorebookModal 點卡片時捏的假 Npc 是負數 id）。
describe('migrateV5toV6 — 補建缺少的 npcs[] 紀錄', () => {
  const run = (entries: Record<string, unknown>[], npcs: Partial<Npc>[] = []) =>
    saveDataMapper({ schemaVersion: 5, lorebookEntries: entries, npcs });

  it('只有設定集條目的 NPC 會補出 npcs[] 紀錄', () => {
    const d = run([{ id: 1, title: '凱爾', category: 'NPC', content: '', isActive: true, job: '嚮導' }]);
    const kyle = d.npcs.find(n => n.name === '凱爾');
    expect(kyle).toBeDefined();
    // 身分欄位留在設定集條目上（schema v10），不再複製到 npcs[]
    expect(kyle).not.toHaveProperty('job');
    expect(kyle!.affection).toBe(0);
    expect(kyle!.memories).toEqual([]);
  });

  it('已有紀錄的不會被重複補建，也不覆蓋既有好感度', () => {
    const d = run(
      [{ id: 1, title: '芬里爾', category: 'NPC', content: '', isActive: true }],
      [{ id: 9, name: '芬里爾', affection: 75, memories: [] }],
    );
    expect(d.npcs.filter(n => n.name === '芬里爾')).toHaveLength(1);
    expect(d.npcs[0].affection).toBe(75);
  });

  it('補建的 id 不與既有 NPC 相撞', () => {
    const d = run(
      [{ id: 1, title: '凱爾', category: 'NPC', content: '', isActive: true }],
      [{ id: 42, name: '芬里爾', memories: [] }],
    );
    const ids = d.npcs.map(n => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(d.npcs.find(n => n.name === '凱爾')!.id).toBeGreaterThan(42);
  });

  it('非 NPC 類的條目不會被當成角色補建', () => {
    const d = run([
      { id: 1, title: '月湖鎮', category: '地點', content: '', isActive: true },
      { id: 2, title: '大災變', category: '歷史', content: '', isActive: true },
    ]);
    expect(d.npcs).toHaveLength(0);
  });

  /**
   * v5→v6 當年會把設定集的身分欄位複製一份到新建的 `npcs[]` 紀錄上。
   * schema v10 之後身分欄位的唯一來源就是設定集，那份副本會被 v9→v10 摺回去，
   * 所以這裡改成釘住「紀錄建起來了，而設定仍在設定集那邊」。
   */
  it('補建紀錄後，身分設定仍留在設定集條目上', () => {
    const d = run([{
      id: 1, title: '凱爾', category: 'NPC', content: '', isActive: true,
      gender: '女', race: '人類', appearance: '淺棕色短髮', personality: '活潑',
    }]);
    const kyle = d.npcs.find(n => n.name === '凱爾')!;
    expect(kyle).toBeDefined();
    expect(kyle.affection).toBe(0);
    expect(kyle).not.toHaveProperty('gender');

    const lore = d.lorebookEntries.find(e => e.category === 'NPC' && e.title === '凱爾')!;
    expect(lore.gender).toBe('女');
    expect(lore.race).toBe('人類');
    expect(lore.appearance).toBe('淺棕色短髮');
    expect(lore.personality).toBe('活潑');
  });

  it('已是最新版的存檔不受影響', () => {
    const d = saveDataMapper({
      schemaVersion: CURRENT_SCHEMA,
      lorebookEntries: [{ id: 1, title: '凱爾', category: 'NPC', content: '', isActive: true }],
      npcs: [],
    });
    expect(d.npcs).toHaveLength(0);
  });
});

// v6 → v7：任務短 ID。舊存檔的任務沒有這個欄位，不補的話 prompt 印不出 #xxx，
// 那些任務就只能繼續走標題比對——也就是一直帶著原本那個 bug。
describe('migrateV6toV7 — 補上任務短 ID', () => {
  const run = (quests: Partial<Quest>[]) =>
    saveDataMapper({ schemaVersion: 6, quests });

  const q = (over: Partial<Quest> = {}): Partial<Quest> => ({
    id: 'q1', title: '護送商隊', giver: '商會會長', description: '',
    reward: {}, status: 'active', isGoalMet: false,
    createdAt: '4/15', createdAtTotalDays: 1, ...over,
  });

  it('沒有 shortId 的任務會被補上', () => {
    const d = run([q()]);
    expect(d.quests[0].shortId).toMatch(/^[2-9a-z]{3}$/);
  });

  it('已經有 shortId 的不會被改掉', () => {
    const d = run([q({ shortId: 'k3p' })]);
    expect(d.quests[0].shortId).toBe('k3p');
  });

  /**
   * 已完成的任務仍留在存檔裡。若讓進行中的任務撿到同一組碼，
   * AI 引用時就分不出是哪一個——所以唯一性要涵蓋全部狀態，不只 active。
   */
  it('補出來的 ID 彼此不重複，也不與既有的撞號', () => {
    const d = run([
      q({ id: 'q1', title: '舊任務A', shortId: 'k3p', status: 'completed' }),
      q({ id: 'q2', title: '舊任務B' }),
      q({ id: 'q3', title: '舊任務C' }),
      q({ id: 'q4', title: '舊任務D' }),
    ]);
    const ids = d.quests.map(x => x.shortId);
    expect(new Set(ids).size).toBe(4);
    expect(ids.filter(i => i === 'k3p')).toHaveLength(1);
  });

  it('沒有任務的存檔不會壞掉', () => {
    expect(() => saveDataMapper({ schemaVersion: 6, quests: [] })).not.toThrow();
  });
});

// v7 → v8：拆掉 adventureLog。同一份摘要先前存兩個地方——助理 GM 在同一個
// if 區塊裡、相隔三行，把同一個 data.summary 寫進 adventureLog（左欄顯示）
// 與 summaryPool（送進 prompt）。左欄現在直接讀 summaryPool 的最後一則。
describe('migrateV7toV8 — 拆掉 adventureLog', () => {
  const run = (d: Record<string, unknown>) => saveDataMapper({ schemaVersion: 7, ...d });

  it('欄位被移除', () => {
    const d = run({ adventureLog: ['走進店裡'], summaryPool: ['走進店裡'] });
    expect((d as unknown as Record<string, unknown>).adventureLog).toBeUndefined();
  });

  it('內容已經在池尾時不重複追加', () => {
    const d = run({ adventureLog: ['走進店裡'], summaryPool: ['更早的事', '走進店裡'] });
    expect(d.summaryPool).toEqual(['更早的事', '走進店裡']);
  });

  /**
   * 存檔剛好停在「summaryPool 被壓縮成一段、adventureLog 還留著壓縮前最後
   * 那則原文」的時間點時，那則原文只存在於 adventureLog。無腦丟掉會少一則。
   */
  it('對不上池尾時補進去，不丟資料', () => {
    const d = run({ adventureLog: ['壓縮前的最後一則'], summaryPool: ['壓縮後的一整段'] });
    expect(d.summaryPool).toEqual(['壓縮後的一整段', '壓縮前的最後一則']);
  });

  it('沒有 adventureLog 的存檔不受影響', () => {
    const d = run({ summaryPool: ['甲', '乙'] });
    expect(d.summaryPool).toEqual(['甲', '乙']);
  });

  it('adventureLog 是空的或全是空字串時不會塞垃圾進池子', () => {
    expect(run({ adventureLog: [], summaryPool: ['甲'] }).summaryPool).toEqual(['甲']);
    expect(run({ adventureLog: ['', '  '], summaryPool: ['甲'] }).summaryPool).toEqual(['甲']);
  });
});

// v8 → v9：道具說明只留圖鑑一份。實例的 description 欄位移除前必須先摺進圖鑑，
// 否則舊存檔的道具說明會整批消失——尤其是裝備：migrateV3toV4 當年只從 items[]
// 建圖鑑，沒有涵蓋 equipment[]，純裝備的說明很可能只存在實例上。
describe('migrateV8toV9 — 道具說明收斂到圖鑑', () => {
  const run = (d: Record<string, unknown>) => saveDataMapper({ schemaVersion: 8, ...d });

  it('背包實例的說明搬進圖鑑，欄位移除', () => {
    const d = run({ items: [{ id: 1, name: '草藥', quantity: 2, description: '回復 20 HP' }] });
    expect(d.itemCatalog['草藥'].description).toBe('回復 20 HP');
    expect(d.items[0]).not.toHaveProperty('description');
    expect(d.items[0]).toMatchObject({ name: '草藥', quantity: 2 });
  });

  /** 這是最會掉資料的一條：舊的建圖鑑遷移根本沒看 equipment[] */
  it('裝備實例的說明也搬得進去', () => {
    const d = run({ equipment: [{ id: 1, name: '鐵劍', isEquipped: true, description: '一把舊劍' }] });
    expect(d.itemCatalog['鐵劍'].description).toBe('一把舊劍');
    expect(d.equipment[0]).not.toHaveProperty('description');
    expect(d.equipment[0]).toMatchObject({ name: '鐵劍', isEquipped: true });
  });

  it('先寫先贏：圖鑑既有的定義不被實例覆蓋', () => {
    const d = run({
      itemCatalog: { 草藥: { name: '草藥', description: '圖鑑版', createdAt: '4/1', lastUsedAt: 1 } },
      items: [{ id: 1, name: '草藥', quantity: 1, description: '實例版' }],
    });
    expect(d.itemCatalog['草藥'].description).toBe('圖鑑版');
  });

  it('背包與裝備同名時以背包為準（items 先跑）', () => {
    const d = run({
      items: [{ id: 1, name: '鐵劍', quantity: 1, description: '背包裡的' }],
      equipment: [{ id: 2, name: '鐵劍', isEquipped: false, description: '裝備上的' }],
    });
    expect(d.itemCatalog['鐵劍'].description).toBe('背包裡的');
  });

  it('沒有道具的存檔不會壞掉', () => {
    expect(() => run({})).not.toThrow();
  });
});

// v9 → v10：NPC 身分設定只留設定集一份。
// 性別／種族／年齡／職業／外貌／個性／背景／備註原本兩邊都有，NPC_NEW 還會在
// 同一個區塊裡把同一份值寫進兩邊。但角色卡的編輯只寫設定集那份，所以 Npc 上的
// 副本是「建檔時寫一次、之後永遠不再更新」——與舊的 Npc.affectionLabel 同病。
describe('migrateV9toV10 — NPC 身分設定收斂到設定集', () => {
  const run = (npcs: Record<string, unknown>[], entries: Record<string, unknown>[] = []) =>
    saveDataMapper({ schemaVersion: 9, npcs, lorebookEntries: entries });

  const legacyNpc = (over: Record<string, unknown> = {}) => ({
    id: 1, name: '芬里爾', affection: 60, category: 'NPC', isActive: true, memories: [] as unknown[],
    gender: '男', race: '精靈', job: '獵人', appearance: '銀髮高挑', personality: '冷靜寡言',
    ...over,
  });

  it('Npc 上的身分欄位被移除', () => {
    const d = run([legacyNpc()]);
    const npc = d.npcs[0] as unknown as Record<string, unknown>;
    for (const f of ['gender', 'race', 'age', 'job', 'appearance', 'personality', 'backstory', 'other']) {
      expect(npc).not.toHaveProperty(f);
    }
    // 執行狀態原封不動
    expect(d.npcs[0]).toMatchObject({ name: '芬里爾', affection: 60 });
  });

  it('沒有設定集條目時補建一條，設定不會消失', () => {
    const d = run([legacyNpc()]);
    const lore = d.lorebookEntries.find(e => e.category === 'NPC' && e.title === '芬里爾')!;
    expect(lore.gender).toBe('男');
    expect(lore.job).toBe('獵人');
    expect(lore.appearance).toBe('銀髮高挑');
  });

  /**
   * 搬移方向是 Npc → Lorebook，且**設定集已有值的欄位不覆蓋**——那與
   * `resolveNpcProfile` 當時的優先序一致（設定集優先），所以遷移前後
   * 玩家看到的內容不變。
   */
  it('設定集已有值時不被 Npc 上的舊副本覆蓋', () => {
    const d = run(
      [legacyNpc({ job: '建檔當下的舊職業' })],
      [{ id: 1, title: '芬里爾', category: 'NPC', content: '', isActive: true, job: '玩家後來改的職業' }],
    );
    const lore = d.lorebookEntries.find(e => e.title === '芬里爾')!;
    expect(lore.job).toBe('玩家後來改的職業');
  });

  it('設定集缺的欄位才由 Npc 補上', () => {
    const d = run(
      [legacyNpc()],
      [{ id: 1, title: '芬里爾', category: 'NPC', content: '', isActive: true, job: '玩家改過的' }],
    );
    const lore = d.lorebookEntries.find(e => e.title === '芬里爾')!;
    expect(lore.job).toBe('玩家改過的');      // 已有 → 不動
    expect(lore.gender).toBe('男');            // 缺 → 補
  });

  /** 空字串等於沒填，不該把設定集裡真正有值的欄位蓋成空的 */
  it('Npc 上的空字串不會蓋掉設定集的值', () => {
    const d = run(
      [legacyNpc({ gender: '', job: '   ' })],
      [{ id: 1, title: '芬里爾', category: 'NPC', content: '', isActive: true, gender: '女', job: '鐵匠' }],
    );
    const lore = d.lorebookEntries.find(e => e.title === '芬里爾')!;
    expect(lore.gender).toBe('女');
    expect(lore.job).toBe('鐵匠');
  });

  it('補建的條目 id 不與既有條目撞號', () => {
    const d = run(
      [legacyNpc({ name: '萊尼' })],
      [{ id: 7, title: '月湖鎮', category: '地點', content: '', isActive: true }],
    );
    const ids = d.lorebookEntries.map(e => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('沒有 NPC 的存檔不會壞掉', () => {
    expect(() => run([])).not.toThrow();
  });
});
