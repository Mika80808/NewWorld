import { describe, it, expect } from 'vitest';
import { normalizeQuestTitle, findQuestByTitle } from '../questMatch';

const q = (title: string, status = 'active') => ({ id: title, title, status });

describe('normalizeQuestTitle', () => {
  it('去掉模型自己加上的引號', () => {
    expect(normalizeQuestTitle('「護送商隊」')).toBe(normalizeQuestTitle('護送商隊'));
    expect(normalizeQuestTitle('《護送商隊》')).toBe(normalizeQuestTitle('護送商隊'));
  });

  it('去掉句尾標點', () => {
    expect(normalizeQuestTitle('護送商隊。')).toBe(normalizeQuestTitle('護送商隊'));
    expect(normalizeQuestTitle('護送商隊 ')).toBe(normalizeQuestTitle('護送商隊'));
  });

  it('全形半形視為相同', () => {
    expect(normalizeQuestTitle('Ｑｕｅｓｔ１')).toBe(normalizeQuestTitle('quest1'));
  });

  it('不同的任務不會被折成同一個', () => {
    expect(normalizeQuestTitle('護送商隊')).not.toBe(normalizeQuestTitle('討伐哥布林'));
  });
});

describe('findQuestByTitle', () => {
  /**
   * 「重複發放」：QUEST_ADD 的去重先前是 `some(q => q.title === title)`，
   * 模型重發同一個委託時多一組引號就比不到，於是長出第二筆同樣的任務。
   */
  it('引號／標點漂掉時仍比得到（QUEST_ADD 去重）', () => {
    const quests = [q('護送商隊')];
    expect(findQuestByTitle(quests, '「護送商隊」')?.title).toBe('護送商隊');
    expect(findQuestByTitle(quests, '護送商隊。')?.title).toBe('護送商隊');
  });

  /**
   * 「完成沒被偵測」：QUEST_COMPLETE 先前是 `find(q => q.title === title && ...)`，
   * 比不到就 `if (quest)` 整段跳過，沒有 log 也沒有提示。
   */
  it('標題有出入時仍能結案（QUEST_COMPLETE）', () => {
    const quests = [q('護送商隊到南門')];
    expect(findQuestByTitle(quests, '護送商隊', true)?.title).toBe('護送商隊到南門');
  });

  it('activeOnly 時不會比到已完成的任務', () => {
    const quests = [q('護送商隊', 'completed')];
    expect(findQuestByTitle(quests, '護送商隊', true)).toBeUndefined();
    // 但 QUEST_ADD 的去重要涵蓋所有狀態，否則剛完成的任務會被再發一次而復活
    expect(findQuestByTitle(quests, '護送商隊')?.title).toBe('護送商隊');
  });

  /**
   * 包含比對有歧義時寧可失敗——挑錯會把獎勵發到別的任務上，比沒偵測到更難查。
   * 上層會 console.warn 並在 cmdResults 顯示⚠️。
   */
  it('包含關係有多筆命中時回傳 undefined，不隨便挑一個', () => {
    const quests = [q('護送商隊'), q('護送商隊到南門')];
    // 「護送商隊」對第一筆是正規化後完全相等 → 明確命中
    expect(findQuestByTitle(quests, '護送商隊', true)?.title).toBe('護送商隊');
    // 「護送」兩筆都包含得到 → 無從分辨
    expect(findQuestByTitle(quests, '護送', true)).toBeUndefined();
  });

  it('正規化後有多筆完全同名時也回傳 undefined', () => {
    const quests = [
      { id: 'a', title: '護送商隊', status: 'active' },
      { id: 'b', title: '「護送商隊」', status: 'active' },
    ];
    expect(findQuestByTitle(quests, '護送商隊 ', true)).toBeUndefined();
  });

  it('完全相等時直接命中，不受正規化影響', () => {
    const quests = [q('護送商隊'), q('護送商隊到南門')];
    expect(findQuestByTitle(quests, '護送商隊到南門', true)?.title).toBe('護送商隊到南門');
  });

  /**
   * 很可能的實戰漂移：prompt 的 [進行中任務] 是以
   * `${q.title}（委託：${q.giver}，剩 N 天）` 注入的，標題邊界並不明確，
   * 模型結案時可能把整串括號一起複製回來。
   */
  it('模型把 prompt 裡的括號說明一起複製回來時仍能結案', () => {
    const quests = [q('護送商隊')];
    expect(findQuestByTitle(quests, '護送商隊（委託：商會會長，剩 7 天）', true)?.title)
      .toBe('護送商隊');
  });

  it('空標題與空清單不會誤判', () => {
    expect(findQuestByTitle([], '護送商隊')).toBeUndefined();
    expect(findQuestByTitle([q('護送商隊')], '')).toBeUndefined();
  });
});

// ─── strictContainment（QUEST_ADD 去重專用）────────────────────────────────
// **同一組字串，兩個指令要的答案是相反的**：
//   既有「護送商隊到南門」+ AI 寫「護送商隊」→ COMPLETE 該結案
//   既有「護送商隊」    + AI 寫「護送商隊到南門」→ ADD 該建新任務
// 所以長度上限只在去重時套用，由呼叫端指定，不是全域行為。
describe('findQuestByTitle — strictContainment（去重專用）', () => {
  const q = (title: string) => ({ title, status: 'active' });
  const dedupe = (quests: { title: string; status: string }[], title: string) =>
    findQuestByTitle(quests, title, false, true);

  it('差一大截時不算重複，系列任務進得來', () => {
    expect(dedupe([q('護送商隊')], '護送商隊到南門')).toBeUndefined();
    expect(dedupe([q('調查失蹤案')], '調查失蹤案：第二夜')).toBeUndefined();
  });

  it('反向也一樣（既有的比較長）', () => {
    expect(dedupe([q('護送商隊到南門')], '護送商隊')).toBeUndefined();
  });

  /** 包含比對真正要救的是模型在同一個標題上多打／少打一兩個字 */
  it('只差一兩個字時仍算重複', () => {
    expect(dedupe([q('討伐哥布林')], '討伐哥布林們')?.title).toBe('討伐哥布林');
    expect(dedupe([q('護送商隊')], '護送商隊的')?.title).toBe('護送商隊');
  });

  /** 前兩段（完全相等、正規化後相等）不受長度上限影響 */
  it('正規化後完全相等時照樣算重複', () => {
    expect(dedupe([q('護送商隊')], '「護送商隊」。')?.title).toBe('護送商隊');
  });

  /** 沒開 strict 的結案路徑維持寬鬆——這是同一組字串的另一半 */
  it('不開 strict 時（結案路徑）差一大截仍比得到', () => {
    expect(findQuestByTitle([q('護送商隊到南門')], '護送商隊', true)?.title)
      .toBe('護送商隊到南門');
  });
});
