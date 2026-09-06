import { describe, it, expect } from 'vitest';
import {
  scoreNpcCandidate, selectNpcCandidates, CandidateContext,
  CANDIDATE_SCORE, MAX_AFFECTION_BONUS,
} from '../npcCandidates';
import { LorebookEntry, Npc } from '../../types';

const lore = (title: string, over: Partial<LorebookEntry> = {}): LorebookEntry => ({
  id: Math.floor(Math.random() * 1e6), title, content: '', category: 'NPC', isActive: true, ...over,
});
const place = (title: string, over: Partial<LorebookEntry> = {}): LorebookEntry => ({
  id: Math.floor(Math.random() * 1e6), title, content: '', category: '地點', isActive: true, ...over,
});
const npc = (name: string, over: Partial<Npc> = {}): Npc =>
  ({ id: 1, name, affection: 0, category: 'NPC', isActive: true, memories: [], ...over }) as Npc;

const ctx = (over: Partial<CandidateContext> = {}): CandidateContext => ({
  location: '月湖鎮', lorebookEntries: [], npcs: [], ...over,
});

describe('scoreNpcCandidate — 各層基礎分', () => {
  it('主場就在這裡', () => {
    const e = lore('萊尼', { homeLocation: '月湖鎮' });
    expect(scoreNpcCandidate(e, ctx({ lorebookEntries: [e] })))
      .toMatchObject({ score: CANDIDATE_SCORE.home, reason: 'home' });
  });

  it('遊蕩地點含此地', () => {
    const e = lore('信差', { homeLocation: '王城', roamLocations: ['月湖鎮'] });
    expect(scoreNpcCandidate(e, ctx({ lorebookEntries: [e] })))
      .toMatchObject({ score: CANDIDATE_SCORE.roam, reason: 'roam' });
  });

  /**
   * 足跡那一層不可省略：`homeLocation` 只有 AI 的 NPC_HOME 與角色卡寫得到，
   * AI 建檔後忘了補的角色就靠上一次出場的位置把鏈接回去。
   */
  it('足跡：上次出場就在這裡', () => {
    const e = lore('浪人');
    expect(scoreNpcCandidate(e, ctx({ lorebookEntries: [e], npcs: [npc('浪人', { location: '月湖鎮' })] })))
      .toMatchObject({ score: CANDIDATE_SCORE.footprint, reason: 'footprint' });
  });

  it('同城：主場是這座城底下的另一個地方', () => {
    const tavern = place('醉醺醺酒館', { parentLocation: '月湖鎮' });
    const e = lore('老闆娘', { homeLocation: '醉醺醺酒館' });
    expect(scoreNpcCandidate(e, ctx({ lorebookEntries: [e, place('月湖鎮'), tavern] })))
      .toMatchObject({ score: CANDIDATE_SCORE.sameCity, reason: 'sameCity' });
  });

  it('不限地點', () => {
    const e = lore('行商', { homeLocation: '王城', anyLocation: true });
    expect(scoreNpcCandidate(e, ctx({ lorebookEntries: [e] })))
      .toMatchObject({ score: CANDIDATE_SCORE.anyLocation, reason: 'anyLocation' });
  });

  it('哪一層都沾不上就是 0，不列入候選', () => {
    const e = lore('遠方人', { homeLocation: '別的城' });
    expect(scoreNpcCandidate(e, ctx({ lorebookEntries: [e] })).score).toBe(0);
  });
});

describe('scoreNpcCandidate — 地點分取最大值而非加總', () => {
  /**
   * 主場在這裡的人同時也滿足「同城」（自己跟自己同城）。加總的話他會多拿 40，
   * 層與層的距離被稀釋，排序意圖跟著模糊。取最大值＝「最強的理由決定他排哪一層」。
   */
  it('主場在這裡的人不會因為同時同城而加倍', () => {
    const e = lore('萊尼', { homeLocation: '月湖鎮' });
    const score = scoreNpcCandidate(e, ctx({ lorebookEntries: [e, place('月湖鎮')] })).score;
    expect(score).toBe(CANDIDATE_SCORE.home);
  });
});

describe('scoreNpcCandidate — 好感度只打破同層平手', () => {
  it('好感度加成上限是 MAX_AFFECTION_BONUS', () => {
    const e = lore('摯友', { homeLocation: '月湖鎮' });
    const score = scoreNpcCandidate(
      e, ctx({ lorebookEntries: [e], npcs: [npc('摯友', { affection: 500 })] }),
    ).score;
    expect(score).toBe(CANDIDATE_SCORE.home + MAX_AFFECTION_BONUS);
  });

  /**
   * 這是分數量級刻意拉開的目的：好感破表的同城店主不該越級擠掉真正住在這裡的人。
   */
  it('好感 100 的同城角色仍排在好感 0 的本地角色之後', () => {
    const tavern = place('醉醺醺酒館', { parentLocation: '月湖鎮' });
    const shopkeeper = lore('老闆娘', { homeLocation: '醉醺醺酒館' });
    const local = lore('路人', { homeLocation: '月湖鎮' });
    const entries = [shopkeeper, local, place('月湖鎮'), tavern];
    const out = selectNpcCandidates(
      ctx({ lorebookEntries: entries, npcs: [npc('老闆娘', { affection: 100 })] }), 8,
    );
    expect(out.map(c => c.entry.title)).toEqual(['路人', '老闆娘']);
  });

  it('沒有任何地點理由時，好感度不會讓他變成候選人', () => {
    const e = lore('遠方摯友', { homeLocation: '別的城' });
    const score = scoreNpcCandidate(
      e, ctx({ lorebookEntries: [e], npcs: [npc('遠方摯友', { affection: 100 })] }),
    ).score;
    expect(score).toBe(0);
  });

  it('負好感不會倒扣', () => {
    const e = lore('仇家', { homeLocation: '月湖鎮' });
    const score = scoreNpcCandidate(
      e, ctx({ lorebookEntries: [e], npcs: [npc('仇家', { affection: -50 })] }),
    ).score;
    expect(score).toBe(CANDIDATE_SCORE.home);
  });
});

describe('scoreNpcCandidate — 可出場（canAppear）', () => {
  it('不受地點限制，主場在別的城也照樣是候選人', () => {
    const e = lore('引路者', { homeLocation: '起始神殿' });
    expect(scoreNpcCandidate(
      e, ctx({ lorebookEntries: [e], npcs: [npc('引路者', { canAppear: true })] }),
    )).toMatchObject({ score: CANDIDATE_SCORE.canAppear, reason: 'canAppear' });
  });

  /** 玩家親手指定的，不該被一群剛好住在這裡的路人擠掉 */
  it('名額不足時排在所有本地角色前面', () => {
    const locals = ['甲', '乙', '丙', '丁'].map(n => lore(n, { homeLocation: '月湖鎮' }));
    const guide = lore('引路者', { homeLocation: '起始神殿' });
    const out = selectNpcCandidates(
      ctx({ lorebookEntries: [...locals, guide], npcs: [npc('引路者', { canAppear: true })] }), 3,
    );
    expect(out[0].entry.title).toBe('引路者');
    expect(out).toHaveLength(3);
  });

  it('人剛好也在這裡時分數疊加，仍然排最前面', () => {
    const e = lore('引路者', { homeLocation: '月湖鎮' });
    expect(scoreNpcCandidate(
      e, ctx({ lorebookEntries: [e], npcs: [npc('引路者', { canAppear: true })] }),
    ).score).toBe(CANDIDATE_SCORE.canAppear + CANDIDATE_SCORE.home);
  });
});

describe('selectNpcCandidates', () => {
  it('依分數由高到低，砍到 limit 為止', () => {
    const entries = [
      lore('行商', { homeLocation: '王城', anyLocation: true }),
      lore('信差', { homeLocation: '王城', roamLocations: ['月湖鎮'] }),
      lore('萊尼', { homeLocation: '月湖鎮' }),
    ];
    const out = selectNpcCandidates(ctx({ lorebookEntries: entries }), 2);
    expect(out.map(c => c.entry.title)).toEqual(['萊尼', '信差']);
  });

  it('只收 NPC 類且啟用中的條目', () => {
    const entries = [
      lore('萊尼', { homeLocation: '月湖鎮' }),
      lore('關掉的人', { homeLocation: '月湖鎮', isActive: false }),
      place('月湖鎮'),
    ];
    expect(selectNpcCandidates(ctx({ lorebookEntries: entries }), 8).map(c => c.entry.title))
      .toEqual(['萊尼']);
  });

  /**
   * 同分時維持設定集原順序。每回合換一批人會讓 prompt 的 context caching 白白
   * 失效，模型看到的「這裡有誰」也跟著飄。
   */
  it('同分時維持原順序（穩定排序）', () => {
    const entries = ['甲', '乙', '丙'].map(n => lore(n, { homeLocation: '月湖鎮' }));
    expect(selectNpcCandidates(ctx({ lorebookEntries: entries }), 8).map(c => c.entry.title))
      .toEqual(['甲', '乙', '丙']);
  });

  it('limit 為 0 或負數時回傳空陣列', () => {
    const entries = [lore('萊尼', { homeLocation: '月湖鎮' })];
    expect(selectNpcCandidates(ctx({ lorebookEntries: entries }), 0)).toEqual([]);
  });

  /** 名字多一個空白在畫面上看不出來，卻會讓 Npc 與條目對不起來 */
  it('Npc 與條目的名稱比對走 normalizeNpcName', () => {
    const e = lore('凱爾 溫德');
    const out = selectNpcCandidates(
      ctx({ lorebookEntries: [e], npcs: [npc('凱爾　溫德', { location: '月湖鎮' })] }), 8,
    );
    expect(out.map(c => c.entry.title)).toEqual(['凱爾 溫德']);
  });
});
