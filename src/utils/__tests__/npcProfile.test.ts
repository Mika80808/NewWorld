import { describe, it, expect } from 'vitest';
import { resolveNpcProfile, npcIdentityBrief, findNpcLore, normalizeNpcName, isSameNpcName, selectKnownNpcNames } from '../npcProfile';
import { LorebookEntry } from '../../types';

const lore = (over: Partial<LorebookEntry> = {}): LorebookEntry => ({
  id: 1,
  title: '芬里爾',
  content: '',
  category: 'NPC',
  isActive: true,
  ...over,
});

// 身分設定的唯一來源是設定集條目（schema v10）。`Npc` 上只留執行狀態——
// 先前那份副本是「建檔時寫一次、之後永遠不再更新」（角色卡的編輯只寫設定集）。
describe('resolveNpcProfile', () => {
  it('讀設定集條目的欄位', () => {
    const p = resolveNpcProfile(lore({ gender: '女', job: '獵人' }));
    expect(p.gender).toBe('女');
    expect(p.job).toBe('獵人');
  });

  /**
   * `handleAddNpc` 建立的設定集條目每個欄位都是空字串。
   * 用 `??` 的話會停在 '' 而不是視為沒填，所以這裡以「非空字串」判斷。
   */
  it('空字串與純空白都視為沒填', () => {
    const p = resolveNpcProfile(lore({ gender: '', job: '   ' }));
    expect(p.gender).toBe('');
    expect(p.job).toBe('');
  });

  it('race 未填時退到 other（舊資料把種族寫在 other）', () => {
    const p = resolveNpcProfile(lore({ other: '精靈' }));
    expect(p.race).toBe('精靈');
    // race 是從 other 借來的，此時 other 不該再重複顯示一次
    expect(p.other).toBe('');
  });

  it('race 有值時 other 維持備註語意', () => {
    const p = resolveNpcProfile(lore({ race: '精靈', other: '左撇子' }));
    expect(p.race).toBe('精靈');
    expect(p.other).toBe('左撇子');
  });

  it('沒有條目時回傳空字串而非 undefined', () => {
    expect(resolveNpcProfile(null)).toEqual({
      gender: '', race: '', age: '', job: '',
      appearance: '', personality: '', backstory: '', other: '',
    });
    expect(resolveNpcProfile(undefined).gender).toBe('');
  });
});

describe('findNpcLore', () => {
  const entries = [
    lore({ id: 1, title: '芬里爾', job: '獵人' }),
    lore({ id: 2, title: '月湖鎮', category: '地點' }),
    lore({ id: 3, title: '萊尼', job: '酒館老闆' }),
  ];

  it('依名字找到 NPC 條目', () => {
    expect(findNpcLore(entries, '萊尼')?.job).toBe('酒館老闆');
  });

  /** 同名的地點條目不該被當成角色設定 */
  it('只找 category 為 NPC 的條目', () => {
    expect(findNpcLore(entries, '月湖鎮')).toBeUndefined();
  });

  it('找不到或參數為空時回 undefined，不爆炸', () => {
    expect(findNpcLore(entries, '不存在的人')).toBeUndefined();
    expect(findNpcLore(entries, '')).toBeUndefined();
    expect(findNpcLore(undefined, '芬里爾')).toBeUndefined();
  });
});

describe('npcIdentityBrief', () => {
  it('組成 性別・種族・職業', () => {
    expect(npcIdentityBrief(lore({ gender: '女', race: '精靈', job: '獵人' })))
      .toBe('女・精靈・獵人');
  });

  it('缺的欄位不留下空的分隔符', () => {
    expect(npcIdentityBrief(lore({ gender: '女', job: '獵人' })))
      .toBe('女・獵人');
  });

  it('全空時回傳空字串（呼叫端據此省略括號）', () => {
    expect(npcIdentityBrief(lore())).toBe('');
    expect(npcIdentityBrief(null)).toBe('');
  });
});

// 玩家回報：「GM AI 讀到了故事集裡的人物，但名字會搞錯。有時出現同樣設定但
// 不同名的 NPC，有時出現同名不同設定的 NPC。」
//
// 所有 NPC 指令都以**名字**當比對鍵，而 pipe 格式很容易帶進多餘空白。
// 先前各處寫法不一致：NPC_THOUGHT 會 trim、AFFINITY 與 NPC_NEW 完全不 trim。
describe('normalizeNpcName / isSameNpcName', () => {
  it('去掉前後空白', () => {
    expect(normalizeNpcName(' 芬里爾 ')).toBe('芬里爾');
  });

  it('全形空白也收斂', () => {
    expect(normalizeNpcName('　芬里爾　')).toBe('芬里爾');
  });

  it('中間連續空白收成單一半形空白', () => {
    expect(normalizeNpcName('凱爾   溫德')).toBe('凱爾 溫德');
  });

  it('空值不會炸', () => {
    expect(normalizeNpcName('')).toBe('');
    expect(normalizeNpcName(undefined as unknown as string)).toBe('');
  });

  it('正規化後相等即視為同一人', () => {
    expect(isSameNpcName(' 芬里爾', '芬里爾 ')).toBe(true);
  });

  /** 不做模糊比對：簡稱與全名是不同的鍵（在場判定才用前後包含，見 npcPresence） */
  it('不同名字仍然是不同人', () => {
    expect(isSameNpcName('凱爾', '凱爾·溫德')).toBe(false);
  });

  it('空名字不與任何人相等（含另一個空名字）', () => {
    expect(isSameNpcName('', '')).toBe(false);
    expect(isSameNpcName('  ', '芬里爾')).toBe(false);
  });
});

describe('findNpcLore — 名稱正規化', () => {
  const lore = (title: string): LorebookEntry => ({
    id: 1, title, content: '', category: 'NPC', isActive: true,
  });

  it('帶空白的名字仍查得到條目', () => {
    expect(findNpcLore([lore('芬里爾')], ' 芬里爾 ')?.title).toBe('芬里爾');
  });

  it('條目標題帶空白時也查得到', () => {
    expect(findNpcLore([lore(' 芬里爾')], '芬里爾')?.title).toBe(' 芬里爾');
  });
});

// 成因：整條注入鏈以地點為軸，候選名單只收主場在當前地點的人。
// 玩家站在月湖鎮時，住在迷霧森林的獵人對模型而言根本不存在，
// 劇情需要一個獵人，它就照著同一套設定另造一個。
describe('selectKnownNpcNames', () => {
  const lore = (title: string, over: Partial<LorebookEntry> = {}): LorebookEntry => ({
    id: Math.floor(Math.random() * 1e6), title, content: '',
    category: 'NPC', isActive: true, ...over,
  });

  it('列出名字與身分簡介，讓模型知道現成的人裡有沒有需要的職業', () => {
    expect(selectKnownNpcNames([lore('芬里爾', { gender: '男', race: '精靈', job: '獵人' })]))
      .toEqual(['芬里爾（男・精靈・獵人）']);
  });

  it('完全沒有身分資訊時只印名字，不留空括號', () => {
    expect(selectKnownNpcNames([lore('無名氏')])).toEqual(['無名氏']);
  });

  it('只收 NPC 類的啟用條目', () => {
    const out = selectKnownNpcNames([
      lore('芬里爾'),
      lore('停用者', { isActive: false }),
      lore('月湖鎮', { category: '地點' }),
    ]);
    expect(out).toEqual(['芬里爾']);
  });

  // 候選名單／在場／隨行的角色在別處已經完整注入，重列只是浪費 token
  it('排除已在別處注入的角色', () => {
    const out = selectKnownNpcNames(
      [lore('芬里爾'), lore('萊尼'), lore('凱爾')],
      new Set(['萊尼', ' 凱爾 ']),
    );
    expect(out).toEqual(['芬里爾']);
  });

  it('依上限截斷', () => {
    const many = Array.from({ length: 50 }, (_, i) => lore(`角色${i}`));
    expect(selectKnownNpcNames(many, new Set(), 40)).toHaveLength(40);
  });

  it('沒有條目時回傳空陣列', () => {
    expect(selectKnownNpcNames(undefined)).toEqual([]);
  });
});
