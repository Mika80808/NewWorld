import { describe, it, expect } from 'vitest';
import { resolveNpcProfile, npcIdentityBrief, findNpcLore } from '../npcProfile';
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
