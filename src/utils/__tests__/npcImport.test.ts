import { describe, it, expect } from 'vitest';
import { parseNpcImport, mergeImportedNpcs, buildNpcExport, NPC_IMPORT_TEMPLATE, ImportedNpc } from '../npcImport';
import { Npc, LorebookEntry, Faction } from '../../types';

const faction = (over: Partial<Faction> = {}): Faction => ({
  id: 1, name: '黑牙氏族', type: 'criminal', description: '', isActive: true, ...over,
});

const existingNpc = (over: Partial<Npc> = {}): Npc => ({
  id: 1, name: '芬里爾', job: '獵人', affection: 75,
  appearance: '銀髮', personality: '寡言', category: '登場人物', isActive: true,
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
    expect(r.npcs[0]).toMatchObject({ name: '萊尼', job: '酒館老闆娘', category: '登場人物', isActive: true });
    expect(r.lorebookEntries[0]).toMatchObject({ title: '萊尼', category: 'NPC', isActive: true });
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
    expect(r.npcs[0].job).toBe('獵人');
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
  it('欄位優先取設定集、退回 npcs[]（與 NpcModal 顯示規則一致）', () => {
    const out = buildNpcExport(
      [existingNpc({ name: '芬里爾', appearance: '舊的外貌', personality: '寡言' })],
      [existingLore({ title: '芬里爾', appearance: '設定集裡改過的外貌' })],
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
    const out = buildNpcExport([existingNpc({ name: 'A', job: '', appearance: '', personality: '', memories: [] })], []);
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
