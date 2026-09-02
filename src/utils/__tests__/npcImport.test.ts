import { describe, it, expect } from 'vitest';
import {
  parseNpcImport, mergeImportedNpcs, mergeImportedFactions, buildNpcExport,
  NPC_IMPORT_TEMPLATE, ImportedNpc, ImportedFaction,
} from '../npcImport';
import { Npc, LorebookEntry, Faction } from '../../types';

const faction = (over: Partial<Faction> = {}): Faction => ({
  id: 1, name: '黑牙氏族', type: 'criminal', description: '', isActive: true, ...over,
});

const existingNpc = (over: Partial<Npc> = {}): Npc => ({
  id: 1, name: '芬里爾', affection: 75,
  category: '登場人物', isActive: true,
  memories: [{ id: 'm1', text: '一起打過狼', createdAt: '4/1', source: 'manual', importance: 'normal' }],
  ...over,
});

const existingLore = (over: Partial<LorebookEntry> = {}): LorebookEntry => ({
  id: 1, title: '芬里爾', content: '', category: 'NPC', isActive: true,
  ...over,
});

const imported = (over: Partial<ImportedNpc> = {}): ImportedNpc => ({
  name: '萊尼', ...over,
});

describe('parseNpcImport — 外層形狀', () => {
  it('接受 { npcs: [...] }', () => {
    const { npcs, errors } = parseNpcImport({ npcs: [{ name: 'A' }, { name: 'B' }] });
    expect(npcs.map(n => n.name)).toEqual(['A', 'B']);
    expect(errors).toEqual([]);
  });

  it('接受裸陣列', () => {
    expect(parseNpcImport([{ name: 'A' }]).npcs.map(n => n.name)).toEqual(['A']);
  });

  it('接受單一角色物件', () => {
    expect(parseNpcImport({ name: 'A', job: '鐵匠' }).npcs[0]).toMatchObject({ name: 'A', job: '鐵匠' });
  });

  // 存檔 JSON 有 npcs 欄位，等於順手支援「從舊存檔撈角色」
  it('存檔格式的 JSON 也能被 npcs 欄位接住', () => {
    const save = { profile: { name: '玩家' }, timeState: {}, npcs: [{ name: '芬里爾', job: '獵人' }] };
    expect(parseNpcImport(save).npcs.map(n => n.name)).toEqual(['芬里爾']);
  });

  it('非物件輸入回傳錯誤而非拋例外', () => {
    expect(parseNpcImport('字串').errors).toHaveLength(1);
    expect(parseNpcImport(null).errors).toHaveLength(1);
    expect(parseNpcImport({ foo: 1 }).errors).toHaveLength(1);
  });
});

describe('parseNpcImport — 逐筆驗證', () => {
  it('缺 name 的整筆丟棄，其餘照常匯入', () => {
    const { npcs, errors } = parseNpcImport({ npcs: [{ name: 'A' }, { job: '無名' }, { name: 'C' }] });
    expect(npcs.map(n => n.name)).toEqual(['A', 'C']);
    expect(errors[0]).toContain('第 2 筆');
  });

  it('name 只有空白視為缺少', () => {
    expect(parseNpcImport({ npcs: [{ name: '   ' }] }).npcs).toHaveLength(0);
  });

  it('欄位前後空白會被 trim', () => {
    expect(parseNpcImport({ npcs: [{ name: ' 芬里爾 ', job: ' 獵人 ' }] }).npcs[0])
      .toMatchObject({ name: '芬里爾', job: '獵人' });
  });

  // 同一份檔案內重複也走先寫先贏，否則後面的會蓋掉前面的
  it('檔案內同名只留第一筆', () => {
    const { npcs, errors } = parseNpcImport({ npcs: [{ name: 'A', job: '先' }, { name: 'A', job: '後' }] });
    expect(npcs).toHaveLength(1);
    expect(npcs[0].job).toBe('先');
    expect(errors[0]).toContain('重複');
  });

  it('affection 非數字時歸零，低於 -100 夾到 -100', () => {
    expect(parseNpcImport({ npcs: [{ name: 'A' }] }).npcs[0].affection).toBe(0);
    expect(parseNpcImport({ npcs: [{ name: 'A', affection: '80' }] }).npcs[0].affection).toBe(0);
    expect(parseNpcImport({ npcs: [{ name: 'A', affection: -999 }] }).npcs[0].affection).toBe(-100);
    expect(parseNpcImport({ npcs: [{ name: 'A', affection: 60 }] }).npcs[0].affection).toBe(60);
  });

  it('roamLocations 截斷到 3 個，非陣列視為空', () => {
    expect(parseNpcImport({ npcs: [{ name: 'A', roamLocations: ['a', 'b', 'c', 'd'] }] }).npcs[0].roamLocations)
      .toEqual(['a', 'b', 'c']);
    expect(parseNpcImport({ npcs: [{ name: 'A', roamLocations: '月湖鎮' }] }).npcs[0].roamLocations).toEqual([]);
  });

  it('isPinned 只接受布林 true', () => {
    expect(parseNpcImport({ npcs: [{ name: 'A', isPinned: 'yes' }] }).npcs[0].isPinned).toBe(false);
    expect(parseNpcImport({ npcs: [{ name: 'A', isPinned: true }] }).npcs[0].isPinned).toBe(true);
  });

  it('內建範本自己解析得過', () => {
    const { npcs, errors } = parseNpcImport(NPC_IMPORT_TEMPLATE);
    expect(errors).toEqual([]);
    expect(npcs).toHaveLength(2);
  });
});

describe('mergeImportedNpcs — 同時建立兩份資料', () => {
  // NPC_NEW 同時建 npcs[] 與設定集條目；只建一份的話角色會沒有好感度或不進 prompt
  it('每個新角色同時產生 npcs[] 與設定集 NPC 條目', () => {
    const r = mergeImportedNpcs([imported({ job: '酒館老闆娘' })], [], [], '4/15');
    expect(r.npcs).toHaveLength(1);
    expect(r.lorebookEntries).toHaveLength(1);
    // Npc 只有執行狀態；職業等身分欄位寫進設定集條目（schema v10）
    expect(r.npcs[0]).toMatchObject({ name: '萊尼', category: '登場人物', isActive: true });
    expect(r.npcs[0]).not.toHaveProperty('job');
    expect(r.lorebookEntries[0]).toMatchObject({
      title: '萊尼', category: 'NPC', isActive: true, job: '酒館老闆娘',
    });
  });

  it('id 接續現有最大值，不與既有條目衝突', () => {
    const r = mergeImportedNpcs(
      [imported()],
      [existingNpc({ id: 7 })],
      [existingLore({ id: 12 })],
      '4/15',
    );
    expect(r.npcs[1].id).toBe(8);
    expect(r.lorebookEntries[1].id).toBe(13);
  });

  it('memories 字串轉成 NpcMemory 結構，source 標為 manual', () => {
    const r = mergeImportedNpcs([imported({ memories: ['初次見面', '一起喝過酒'] })], [], [], '4/15');
    expect(r.npcs[0].memories).toHaveLength(2);
    expect(r.npcs[0].memories[0]).toMatchObject({ text: '初次見面', createdAt: '4/15', source: 'manual', importance: 'normal' });
  });

  it('memories id 各自唯一', () => {
    const r = mergeImportedNpcs([imported({ memories: ['a', 'b', 'c'] })], [], [], '4/15');
    expect(new Set(r.npcs[0].memories.map(m => m.id)).size).toBe(3);
  });
});

describe('mergeImportedNpcs — 同名先寫先贏', () => {
  it('與現有 npcs[] 撞名時整筆跳過', () => {
    const r = mergeImportedNpcs([imported({ name: '芬里爾', job: '冒牌貨' })], [existingNpc()], [], '4/15');
    expect(r.addedNames).toEqual([]);
    expect(r.skippedNames).toEqual(['芬里爾']);
    expect(r.npcs).toHaveLength(1);
    // 整筆跳過：既有紀錄原封不動，匯入檔的職業沒有寫進任何地方
    expect(r.npcs[0].affection).toBe(75);
    expect(r.lorebookEntries.find(e => e.title === '芬里爾')?.job).not.toBe('冒牌貨');
  });

  // 玩家累積的好感度與記憶不能被一次匯入洗掉
  it('跳過時不動既有好感度與記憶', () => {
    const r = mergeImportedNpcs(
      [imported({ name: '芬里爾', affection: 0, memories: ['覆蓋用'] })],
      [existingNpc()],
      [],
      '4/15',
    );
    expect(r.npcs[0].affection).toBe(75);
    expect(r.npcs[0].memories).toHaveLength(1);
    expect(r.npcs[0].memories[0].text).toBe('一起打過狼');
  });

  // 只存在於設定集、還沒有執行狀態的角色也算佔用名字
  it('只與設定集 NPC 條目撞名也跳過', () => {
    const r = mergeImportedNpcs([imported({ name: '芬里爾' })], [], [existingLore()], '4/15');
    expect(r.skippedNames).toEqual(['芬里爾']);
  });

  it('與非 NPC 類別的同名條目不算衝突', () => {
    const r = mergeImportedNpcs(
      [imported({ name: '迷霧森林' })],
      [],
      [existingLore({ title: '迷霧森林', category: '地點' })],
      '4/15',
    );
    expect(r.addedNames).toEqual(['迷霧森林']);
  });

  it('部分衝突時分別回報新增與跳過', () => {
    const r = mergeImportedNpcs(
      [imported({ name: '芬里爾' }), imported({ name: '萊尼' })],
      [existingNpc()],
      [],
      '4/15',
    );
    expect(r.addedNames).toEqual(['萊尼']);
    expect(r.skippedNames).toEqual(['芬里爾']);
  });

  // 沒有任何新增時呼叫端要能跳過 setState 與雲端上傳
  it('全部跳過時回傳原 reference', () => {
    const npcs = [existingNpc()];
    const lore = [existingLore()];
    const r = mergeImportedNpcs([imported({ name: '芬里爾' })], npcs, lore, '4/15');
    expect(r.npcs).toBe(npcs);
    expect(r.lorebookEntries).toBe(lore);
  });

  it('空匯入清單回傳原 reference', () => {
    const npcs = [existingNpc()];
    expect(mergeImportedNpcs([], npcs, [], '4/15').npcs).toBe(npcs);
  });
});

// 勢力用名稱不用 id：factionIds 是各存檔自己編的流水號，跨檔必然對不上
describe('mergeImportedNpcs — 勢力以名稱解析', () => {
  const factions = [faction({ id: 3, name: '黑牙氏族' }), faction({ id: 7, name: '獵人公會' })];

  it('名稱解析成該存檔的 factionId', () => {
    const r = mergeImportedNpcs(
      [imported({ factions: ['獵人公會'] })], [], [], '4/15', factions,
    );
    expect(r.npcs[0].factionIds).toEqual([7]);
  });

  it('多個勢力都解析', () => {
    const r = mergeImportedNpcs(
      [imported({ factions: ['黑牙氏族', '獵人公會'] })], [], [], '4/15', factions,
    );
    expect(r.npcs[0].factionIds).toEqual([3, 7]);
  });

  it('查無的勢力名稱收集起來回報，不靜默丟棄', () => {
    const r = mergeImportedNpcs(
      [imported({ factions: ['不存在的幫派', '獵人公會'] })], [], [], '4/15', factions,
    );
    expect(r.npcs[0].factionIds).toEqual([7]);
    expect(r.unknownFactions).toEqual(['不存在的幫派']);
  });

  it('多筆角色查到同一個未知勢力只回報一次', () => {
    const r = mergeImportedNpcs(
      [imported({ name: 'A', factions: ['幽靈幫'] }), imported({ name: 'B', factions: ['幽靈幫'] })],
      [], [], '4/15', factions,
    );
    expect(r.unknownFactions).toEqual(['幽靈幫']);
  });

  it('沒有勢力時 factionIds 為 undefined，不留空陣列', () => {
    const r = mergeImportedNpcs([imported()], [], [], '4/15', factions);
    expect(r.npcs[0].factionIds).toBeUndefined();
  });

  it('未傳勢力清單時全部視為查無', () => {
    const r = mergeImportedNpcs([imported({ factions: ['黑牙氏族'] })], [], [], '4/15');
    expect(r.npcs[0].factionIds).toBeUndefined();
    expect(r.unknownFactions).toEqual(['黑牙氏族']);
  });
});

describe('buildNpcExport — 與匯入格式來回', () => {
  // 身分欄位的唯一來源是設定集條目（schema v10）。先前這條釘的是
  // 「優先取設定集、退回 npcs[]」的雙來源規則，現在只剩一個來源。
  it('身分欄位取自設定集條目', () => {
    const out = buildNpcExport(
      [existingNpc({ name: '芬里爾' })],
      [existingLore({ title: '芬里爾', appearance: '設定集裡改過的外貌', personality: '寡言' })],
    );
    expect(out.npcs[0].appearance).toBe('設定集裡改過的外貌');
    expect(out.npcs[0].personality).toBe('寡言');
  });

  it('勢力匯出成名稱', () => {
    const out = buildNpcExport(
      [existingNpc({ factionIds: [3] })], [], [faction({ id: 3, name: '黑牙氏族' })],
    );
    expect(out.npcs[0].factions).toEqual(['黑牙氏族']);
  });

  it('對不到勢力定義的 id 直接略過，不匯出空值', () => {
    const out = buildNpcExport([existingNpc({ factionIds: [999] })], [], []);
    expect(out.npcs[0].factions).toBeUndefined();
  });

  it('空字串與空陣列一律省略，不塞滿 ""', () => {
    const out = buildNpcExport([existingNpc({ name: 'A', memories: [] })], []);
    expect(out.npcs[0]).toEqual({ name: 'A', affection: 75 });
  });

  // isMerged 是舊記錄的封存，匯出只帶現行的
  it('已融合的記憶不匯出', () => {
    const out = buildNpcExport([existingNpc({
      memories: [
        { id: 'a', text: '現行', createdAt: '4/1', source: 'manual', importance: 'normal' },
        { id: 'b', text: '封存', createdAt: '4/1', source: 'pre_merge', importance: 'normal', isMerged: true },
      ],
    })], []);
    expect(out.npcs[0].memories).toEqual(['現行']);
  });

  it('匯出的結果能原樣被 parseNpcImport 讀回', () => {
    const factions = [faction({ id: 3, name: '黑牙氏族' })];
    const out = buildNpcExport(
      [existingNpc({ name: '芬里爾', factionIds: [3], affection: 65 })], [], factions,
    );
    const back = parseNpcImport(out);
    expect(back.errors).toEqual([]);
    expect(back.npcs[0]).toMatchObject({ name: '芬里爾', affection: 65, factions: ['黑牙氏族'] });
  });

  // 匯出 → 匯入到另一個存檔（勢力 id 完全不同）仍能對上
  it('跨存檔來回：勢力 id 不同也能靠名稱接回', () => {
    const source = buildNpcExport(
      [existingNpc({ name: '芬里爾', factionIds: [3] })], [], [faction({ id: 3, name: '黑牙氏族' })],
    );
    const { npcs: parsed } = parseNpcImport(source);
    const merged = mergeImportedNpcs(parsed, [], [], '5/1', [faction({ id: 88, name: '黑牙氏族' })]);
    expect(merged.npcs[0].factionIds).toEqual([88]);
    expect(merged.unknownFactions).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 勢力與角色必須一起匯出。角色的勢力歸屬存的是「名稱」，匯入端原本只做比對，
// 目標存檔沒有同名勢力時整段歸屬就掉了——只帶角色等於帶了一份對不到的引用。
// ─────────────────────────────────────────────────────────────────────────────
const impFaction = (over: Partial<ImportedFaction> = {}): ImportedFaction => ({
  name: '黑牙氏族', type: 'race', ...over,
});

describe('parseNpcImport — 勢力區塊', () => {
  it('讀出 factions 區塊', () => {
    const r = parseNpcImport({ factions: [{ name: '黑牙氏族', type: 'race' }], npcs: [{ name: 'A' }] });
    expect(r.factions).toHaveLength(1);
    expect(r.factions[0]).toMatchObject({ name: '黑牙氏族', type: 'race' });
  });

  // 舊的匯出檔沒有這一段，不能因此爆掉或報錯
  it('沒有 factions 區塊時為空陣列且不產生錯誤', () => {
    const r = parseNpcImport({ npcs: [{ name: 'A' }] });
    expect(r.factions).toEqual([]);
    expect(r.errors).toEqual([]);
  });

  it('裸陣列與單一角色物件沒有勢力區塊', () => {
    expect(parseNpcImport([{ name: 'A' }]).factions).toEqual([]);
    expect(parseNpcImport({ name: 'A' }).factions).toEqual([]);
  });

  it('缺 name 的勢力整筆丟棄並回報', () => {
    const r = parseNpcImport({ factions: [{ type: 'guild' }, { name: 'B' }], npcs: [{ name: 'A' }] });
    expect(r.factions.map(f => f.name)).toEqual(['B']);
    expect(r.errors[0]).toContain('勢力第 1 筆');
  });

  // type 只影響 UI 分類，認不得就退回 other；丟掉整個勢力太粗暴
  it('認不得的 type 退回 other', () => {
    const r = parseNpcImport({ factions: [{ name: 'A', type: '幫派' }], npcs: [] });
    expect(r.factions[0].type).toBe('other');
  });

  // 關係相反：畫錯線比少一條線更難察覺，寧可丟棄
  it('關係缺 target 或 type 無效時丟棄該條並回報', () => {
    const r = parseNpcImport({
      factions: [{ name: 'A', relations: [{ target: 'B', type: '友好' }, { type: 'ally' }, { target: 'C', type: 'ally' }] }],
      npcs: [],
    });
    expect(r.factions[0].relations).toEqual([{ target: 'C', type: 'ally' }]);
    expect(r.errors).toHaveLength(2);
  });

  it('檔案內同名勢力只留第一筆', () => {
    const r = parseNpcImport({ factions: [{ name: 'A', description: '先' }, { name: 'A', description: '後' }], npcs: [] });
    expect(r.factions).toHaveLength(1);
    expect(r.factions[0].description).toBe('先');
  });

  // 整份存檔 JSON 的 factions 是內部格式（relations 用 targetFactionId），
  // 讀不出關係是預期的，但不能拋例外
  it('存檔內部格式的勢力不會爆，只是關係解不出來', () => {
    const r = parseNpcImport({
      factions: [{ id: 3, name: '黑牙氏族', type: 'race', relations: [{ targetFactionId: 7, type: 'enemy' }] }],
      npcs: [{ name: 'A' }],
    });
    expect(r.factions[0].name).toBe('黑牙氏族');
    expect(r.factions[0].relations).toEqual([]);
  });
});

describe('mergeImportedFactions', () => {
  it('缺的勢力會被建立，id 接續現有最大值', () => {
    const r = mergeImportedFactions([impFaction()], [faction({ id: 9, name: '獵人公會' })]);
    expect(r.addedNames).toEqual(['黑牙氏族']);
    expect(r.factions).toHaveLength(2);
    expect(r.factions[1]).toMatchObject({ id: 10, name: '黑牙氏族', type: 'race', isActive: true });
  });

  // 玩家自己調過的顏色、描述與關係圖不該被一次匯入洗掉
  it('同名先寫先贏：既有勢力原封不動', () => {
    const existing = [faction({ id: 3, name: '黑牙氏族', description: '玩家寫的', color: '#ABCDEF' })];
    const r = mergeImportedFactions([impFaction({ description: '檔案裡的', color: '#000000' })], existing);
    expect(r.addedNames).toEqual([]);
    expect(r.skippedNames).toEqual(['黑牙氏族']);
    expect(r.factions[0].description).toBe('玩家寫的');
    expect(r.factions[0].color).toBe('#ABCDEF');
  });

  it('沒有新增時回傳原 reference', () => {
    const existing = [faction({ name: '黑牙氏族' })];
    expect(mergeImportedFactions([impFaction()], existing).factions).toBe(existing);
    expect(mergeImportedFactions([], existing).factions).toBe(existing);
  });

  it('color 未提供時留空，交給 UI 的調色盤退回值', () => {
    const r = mergeImportedFactions([impFaction()], []);
    expect(r.factions[0].color).toBeUndefined();
  });

  it('homeLocation 比對設定集地點條目轉成 homeId', () => {
    const lore = [existingLore({ id: 5, title: '狼族領地', category: '地點' })];
    const r = mergeImportedFactions([impFaction({ homeLocation: '狼族領地' })], [], lore);
    expect(r.factions[0].homeId).toBe(5);
  });

  // 匯入角色不該偷偷長出新的地圖點位
  it('查無地點時 homeId 留空，不建立地點條目', () => {
    const r = mergeImportedFactions([impFaction({ homeLocation: '不存在的地方' })], [], []);
    expect(r.factions[0].homeId).toBeUndefined();
  });

  it('關係以名稱解析成 targetFactionId', () => {
    const r = mergeImportedFactions(
      [impFaction({ relations: [{ target: '獵人公會', type: 'enemy', note: '世仇' }] })],
      [faction({ id: 9, name: '獵人公會' })],
    );
    expect(r.factions[1].relations).toEqual([{ targetFactionId: 9, type: 'enemy', note: '世仇' }]);
  });

  // 檔案裡「A 與 B 為敵」可能寫在 B 之前，所以關係要等所有 id 都配完才解
  it('關係對象是同一份檔案裡後面才出現的勢力也解得開', () => {
    const r = mergeImportedFactions(
      [
        impFaction({ name: 'A', relations: [{ target: 'B', type: 'ally' }] }),
        impFaction({ name: 'B' }),
      ],
      [],
    );
    const a = r.factions.find(f => f.name === 'A')!;
    const b = r.factions.find(f => f.name === 'B')!;
    expect(a.relations).toEqual([{ targetFactionId: b.id, type: 'ally' }]);
  });

  it('對象查無時丟棄該條關係並回報，其餘照常', () => {
    const r = mergeImportedFactions(
      [impFaction({ relations: [{ target: '幽靈幫', type: 'enemy' }, { target: '獵人公會', type: 'ally' }] })],
      [faction({ id: 9, name: '獵人公會' })],
    );
    expect(r.factions[1].relations).toEqual([{ targetFactionId: 9, type: 'ally' }]);
    expect(r.unresolvedRelations).toEqual(['黑牙氏族 → 幽靈幫']);
  });

  it('自己指向自己的關係丟棄', () => {
    const r = mergeImportedFactions([impFaction({ relations: [{ target: '黑牙氏族', type: 'ally' }] })], []);
    expect(r.factions[0].relations).toBeUndefined();
  });

  // 既有勢力比照先寫先贏不動它，否則匯入會偷改玩家已經畫好的關係圖
  it('不會把關係寫進既有的同名勢力', () => {
    const existing = [faction({ id: 3, name: '黑牙氏族' }), faction({ id: 9, name: '獵人公會' })];
    const r = mergeImportedFactions([impFaction({ relations: [{ target: '獵人公會', type: 'enemy' }] })], existing);
    expect(r.factions[0].relations).toBeUndefined();
  });
});

describe('buildNpcExport — 勢力一起匯出', () => {
  const lore = [existingLore({ id: 5, title: '狼族領地', category: '地點' })];

  it('勢力連定義一起匯出，homeId 轉成地點名稱', () => {
    const out = buildNpcExport(
      [existingNpc({ factionIds: [3] })], lore,
      [faction({ id: 3, name: '黑牙氏族', type: 'race', description: '狼族', homeId: 5, color: '#ABCDEF' })],
    );
    expect(out.factions).toEqual([{
      name: '黑牙氏族', type: 'race', description: '狼族', color: '#ABCDEF', homeLocation: '狼族領地',
    }]);
  });

  it('關係的 targetFactionId 轉成名稱', () => {
    const out = buildNpcExport([], [], [
      faction({ id: 3, name: '黑牙氏族', relations: [{ targetFactionId: 9, type: 'rival', note: '年度決鬥' }] }),
      faction({ id: 9, name: '獵人公會' }),
    ]);
    expect(out.factions?.[0].relations).toEqual([{ target: '獵人公會', type: 'rival', note: '年度決鬥' }]);
  });

  // 關係是勢力之間互指的，只匯出「有人歸屬」的那幾個會讓指向其他勢力的關係解不開
  it('沒有成員的勢力也照樣匯出', () => {
    const out = buildNpcExport([existingNpc({ factionIds: [3] })], [], [
      faction({ id: 3, name: '黑牙氏族' }), faction({ id: 9, name: '沒有成員的勢力' }),
    ]);
    expect(out.factions?.map(f => f.name)).toEqual(['黑牙氏族', '沒有成員的勢力']);
  });

  it('沒有勢力時整個欄位省略，維持舊檔案的樣子', () => {
    expect('factions' in buildNpcExport([existingNpc()], [], [])).toBe(false);
  });
});

describe('角色＋勢力跨存檔完整來回', () => {
  // 這是這組功能的重點：來源存檔的勢力在目標存檔完全不存在時，
  // 舊行為是「查無勢力」把歸屬整段丟掉，現在要能連勢力帶關係一起長出來
  it('目標存檔沒有任何勢力時，勢力與歸屬都能重建', () => {
    const sourceLore = [existingLore({ id: 5, title: '狼族領地', category: '地點' })];
    const source = buildNpcExport(
      [existingNpc({ name: '芬里爾', factionIds: [3] })],
      sourceLore,
      [
        faction({ id: 3, name: '黑牙氏族', type: 'race', homeId: 5, relations: [{ targetFactionId: 9, type: 'rival' }] }),
        faction({ id: 9, name: '獵人公會', type: 'guild' }),
      ],
    );

    // 目標存檔：地點 id 與來源完全不同，且一個勢力都沒有
    const targetLore = [existingLore({ id: 77, title: '狼族領地', category: '地點' })];
    const parsed = parseNpcImport(source);
    const fMerged = mergeImportedFactions(parsed.factions, [], targetLore);
    const merged = mergeImportedNpcs(parsed.npcs, [], targetLore, '5/1', fMerged.factions);

    expect(fMerged.addedNames).toEqual(['黑牙氏族', '獵人公會']);
    const blackfang = fMerged.factions.find(f => f.name === '黑牙氏族')!;
    const guild = fMerged.factions.find(f => f.name === '獵人公會')!;
    // 地點 id 跨存檔重新對上
    expect(blackfang.homeId).toBe(77);
    expect(blackfang.relations).toEqual([{ targetFactionId: guild.id, type: 'rival' }]);
    // 角色掛回剛建立的勢力，不再是「查無勢力」
    expect(merged.npcs[0].factionIds).toEqual([blackfang.id]);
    expect(merged.unknownFactions).toEqual([]);
  });

  it('內建範本自己走得完整條流程', () => {
    const parsed = parseNpcImport(NPC_IMPORT_TEMPLATE);
    expect(parsed.errors).toEqual([]);
    const fMerged = mergeImportedFactions(parsed.factions, []);
    const merged = mergeImportedNpcs(parsed.npcs, [], [], '4/15', fMerged.factions);
    expect(fMerged.addedNames).toEqual(['黑牙氏族', '獵人公會']);
    expect(merged.addedNames).toEqual(['芬里爾', '萊尼']);
    expect(merged.unknownFactions).toEqual([]);
    expect(merged.npcs[0].factionIds).toEqual([fMerged.factions.find(f => f.name === '黑牙氏族')!.id]);
  });
});
