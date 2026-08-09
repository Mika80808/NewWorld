import { describe, it, expect } from 'vitest';
import { resolveNpcProfile, npcIdentityBrief } from '../npcProfile';
import { Npc, LorebookEntry } from '../../types';

const npc = (over: Partial<Npc> = {}): Npc => ({
  id: 1,
  name: '芬里爾',
  job: '獵人',
  affection: 50,
  appearance: '銀髮高挑',
  personality: '冷靜寡言',
  category: 'NPC',
  isActive: true,
  memories: [],
  ...over,
});

const lore = (over: Partial<LorebookEntry> = {}): LorebookEntry => ({
  id: 1,
  title: '芬里爾',
  content: '',
  category: 'NPC',
  isActive: true,
  ...over,
});

describe('resolveNpcProfile', () => {
  it('設定集條目有值時以它為準', () => {
    const p = resolveNpcProfile(npc({ gender: '男' }), lore({ gender: '女' }));
    expect(p.gender).toBe('女');
  });

  /**
   * 這條釘住實際壞掉過的行為：promptBuilder 只讀設定集條目的 gender、不 fallback，
   * 但角色卡顯示時會退回 Npc.gender。玩家看到「女」，AI 拿到空字串，自己編一個性別。
   */
  it('設定集條目沒填時退回 Npc 那份', () => {
    const p = resolveNpcProfile(npc({ gender: '女' }), lore());
    expect(p.gender).toBe('女');
  });

  /**
   * `handleAddNpc` 建立的設定集條目每個欄位都是空字串。
   * 用 `??` 的話會停在 '' 永遠退不下去，所以這裡必須把空字串視為「沒填」。
   */
  it('空字串視為沒填，繼續往下退', () => {
    const p = resolveNpcProfile(npc({ gender: '女', job: '獵人' }), lore({ gender: '', job: '' }));
    expect(p.gender).toBe('女');
    expect(p.job).toBe('獵人');
  });

  it('只有空白字元也算沒填', () => {
    const p = resolveNpcProfile(npc({ gender: '女' }), lore({ gender: '   ' }));
    expect(p.gender).toBe('女');
  });

  it('race 未填時退到 other（舊資料把種族寫在 other）', () => {
    const p = resolveNpcProfile(npc(), lore({ other: '精靈' }));
    expect(p.race).toBe('精靈');
    // race 是從 other 借來的，此時 other 不該再重複顯示一次
    expect(p.other).toBe('');
  });

  it('race 有值時 other 維持備註語意', () => {
    const p = resolveNpcProfile(npc(), lore({ race: '精靈', other: '左撇子' }));
    expect(p.race).toBe('精靈');
    expect(p.other).toBe('左撇子');
  });

  it('兩邊都沒有時回傳空字串而非 undefined', () => {
    const p = resolveNpcProfile(null, null);
    expect(p).toEqual({
      gender: '', race: '', age: '', job: '',
      appearance: '', personality: '', backstory: '', other: '',
    });
  });
});

describe('npcIdentityBrief', () => {
  it('組成 性別・種族・職業', () => {
    expect(npcIdentityBrief(npc(), lore({ gender: '女', race: '精靈', job: '獵人' })))
      .toBe('女・精靈・獵人');
  });

  it('缺的欄位不留下空的分隔符', () => {
    expect(npcIdentityBrief(npc({ job: '獵人' }), lore({ gender: '女' })))
      .toBe('女・獵人');
  });

  it('全空時回傳空字串（呼叫端據此省略括號）', () => {
    expect(npcIdentityBrief(npc({ job: '' }), lore())).toBe('');
  });
});
