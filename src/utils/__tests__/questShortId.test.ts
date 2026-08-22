import { describe, it, expect } from 'vitest';
import { generateQuestShortId, normalizeQuestShortId } from '../questShortId';
import { findQuestByShortId, findQuestByRef } from '../questMatch';

const q = (title: string, shortId?: string, status = 'active') => ({ title, shortId, status });

describe('generateQuestShortId', () => {
  it('產生三碼', () => {
    expect(generateQuestShortId()).toHaveLength(3);
  });

  /** 形近字元讀錯一個，AI 引用回來就對不上了 */
  it('不含 0 / 1 / o / l / i 這些形近字元', () => {
    const ids = Array.from({ length: 300 }, () => generateQuestShortId());
    expect(ids.join('')).not.toMatch(/[01oli]/);
  });

  it('避開已被使用的 ID', () => {
    // 把字母表塞到只剩極少數可選，仍然不能撞號
    const taken = new Set<string>();
    for (let i = 0; i < 500; i++) taken.add(generateQuestShortId(taken));
    expect(taken.size).toBe(500);
  });

  /** taken 裡混著空字串（舊存檔沒有 shortId 的任務）不該讓它爆掉 */
  it('taken 含空字串時仍正常', () => {
    expect(generateQuestShortId(['', '', 'abc'])).toHaveLength(3);
  });
});

describe('normalizeQuestShortId', () => {
  it.each([
    ['#k3p', 'k3p'],
    ['k3p', 'k3p'],
    ['  #K3P  ', 'k3p'],
    ['##k3p', 'k3p'],
    ['#k3p、', 'k3p'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeQuestShortId(input)).toBe(expected);
  });

  it('空值回傳空字串而不是爆掉', () => {
    expect(normalizeQuestShortId(undefined)).toBe('');
    expect(normalizeQuestShortId(null)).toBe('');
  });
});

describe('findQuestByShortId', () => {
  const quests = [q('找回失竊的聖遺物', 'k3p'), q('護送商隊', 'm82')];

  it('比得到', () => {
    expect(findQuestByShortId(quests, 'k3p')?.title).toBe('找回失竊的聖遺物');
  });

  /** 模型多半會連 prompt 裡的井字號一起抄回來 */
  it('帶 # 與大寫也比得到', () => {
    expect(findQuestByShortId(quests, '#K3P')?.title).toBe('找回失竊的聖遺物');
  });

  it('沒有 shortId 的任務不會被空字串誤中', () => {
    const legacy = [q('舊任務', undefined)];
    expect(findQuestByShortId(legacy, '')).toBeUndefined();
    expect(findQuestByShortId(legacy, '#')).toBeUndefined();
  });

  it('activeOnly 會排除已完成的任務', () => {
    const done = [q('已結案', 'k3p', 'completed')];
    expect(findQuestByShortId(done, 'k3p')).toBeDefined();
    expect(findQuestByShortId(done, 'k3p', true)).toBeUndefined();
  });
});

describe('findQuestByRef', () => {
  /**
   * 短 ID 存在的理由就是這一題：兩個標題互相包含時，`findQuestByTitle`
   * 會刻意判定失敗（挑錯比沒偵測到更難查），只有 ID 分得出來。
   */
  it('標題互相包含時，ID 仍分得出是哪一個', () => {
    const quests = [q('護送商隊', 'k3p'), q('護送商隊到南門', 'm82')];
    expect(findQuestByRef(quests, { title: '護送商隊到南' })).toBeUndefined();
    expect(findQuestByRef(quests, { id: 'm82' })?.title).toBe('護送商隊到南門');
  });

  /**
   * 模型很常 ID 抄對、標題卻順手改寫成別的說法。以 ID 為準才是對的——
   * 若因為兩者對不起來就判失敗，等於讓不可靠的訊號否決可靠的訊號。
   */
  it('ID 與標題指向不同任務時以 ID 為準', () => {
    const quests = [q('找回失竊的聖遺物', 'k3p'), q('護送商隊', 'm82')];
    expect(findQuestByRef(quests, { id: 'k3p', title: '護送商隊' })?.title)
      .toBe('找回失竊的聖遺物');
  });

  /** 舊存檔的任務沒有 shortId，AI 也還不一定會輸出 id=，標題那條路必須留著 */
  it('只給標題時仍走標題比對（舊存檔與 fallback）', () => {
    const quests = [q('找回失竊的聖遺物', undefined)];
    expect(findQuestByRef(quests, { title: '「找回失竊的聖遺物」' })?.title)
      .toBe('找回失竊的聖遺物');
  });

  /** ID 抄錯（清單上沒有）時退回標題，而不是整條失敗 */
  it('ID 比不到時退回標題比對', () => {
    const quests = [q('找回失竊的聖遺物', 'k3p')];
    expect(findQuestByRef(quests, { id: 'zzz', title: '找回失竊的聖遺物' })?.title)
      .toBe('找回失竊的聖遺物');
  });

  it('兩者都比不到時回 undefined', () => {
    const quests = [q('找回失竊的聖遺物', 'k3p')];
    expect(findQuestByRef(quests, { id: 'zzz', title: '不存在的任務' })).toBeUndefined();
    expect(findQuestByRef(quests, {})).toBeUndefined();
  });
});
