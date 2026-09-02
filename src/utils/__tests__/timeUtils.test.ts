import { describe, it, expect } from 'vitest';
import {
  calculateTotalDays,
  getTotalDaysFromTimeState,
  advanceTimeByMinutes,
  isQuestExpired,
  getQuestRemainingDays,
  setClockForward,
  advanceTimeAndResolveQuestDeadlines,
} from '../timeUtils';
import { TimeState, Quest } from '../../types';

const t = (over: Partial<TimeState> = {}): TimeState => ({
  year: 1024, month: 4, day: 15, hour: 12, minute: 0, weather: '晴朗', ...over,
});

describe('calculateTotalDays', () => {
  it('以 360 天/年、30 天/月 計算', () => {
    expect(calculateTotalDays(0, 1, 1)).toBe(1);
    expect(calculateTotalDays(0, 2, 1)).toBe(31);
    expect(calculateTotalDays(1, 1, 1)).toBe(361);
  });

  it('getTotalDaysFromTimeState 與 calculateTotalDays 一致', () => {
    const ts = t();
    expect(getTotalDaysFromTimeState(ts)).toBe(calculateTotalDays(1024, 4, 15));
  });
});

describe('advanceTimeByMinutes', () => {
  it('同日推進', () => {
    const next = advanceTimeByMinutes(t({ hour: 10, minute: 30 }), 45);
    expect(next).toMatchObject({ day: 15, hour: 11, minute: 15 });
  });

  it('跨日進位', () => {
    const next = advanceTimeByMinutes(t({ hour: 23, minute: 30 }), 60);
    expect(next).toMatchObject({ day: 16, hour: 0, minute: 30 });
  });

  it('跨月進位（第 30 天之後進入下個月）', () => {
    const next = advanceTimeByMinutes(t({ day: 30, hour: 23, minute: 0 }), 120);
    expect(next).toMatchObject({ month: 5, day: 1, hour: 1 });
  });

  it('跨年進位（12 月 30 日之後進入新年）', () => {
    const next = advanceTimeByMinutes(t({ month: 12, day: 30, hour: 23, minute: 0 }), 120);
    expect(next).toMatchObject({ year: 1025, month: 1, day: 1 });
  });

  it('負數分鐘拋出錯誤', () => {
    expect(() => advanceTimeByMinutes(t(), -1)).toThrow();
  });

  it('保留天氣等其他欄位', () => {
    const next = advanceTimeByMinutes(t({ weather: '下雨' }), 10);
    expect(next.weather).toBe('下雨');
  });
});

describe('任務期限', () => {
  const quest = (over: Partial<Quest> = {}): Quest => ({
    id: 'q1', title: '測試任務', giver: 'NPC', description: '',
    reward: {}, deadline: 7, status: 'active', isGoalMet: false,
    createdAt: '4/15', createdAtTotalDays: calculateTotalDays(1024, 4, 15),
    ...over,
  });

  it('未到期限不算逾期', () => {
    const now = calculateTotalDays(1024, 4, 20);
    expect(isQuestExpired(quest(), now)).toBe(false);
    expect(getQuestRemainingDays(quest(), now)).toBe(2);
  });

  it('達到期限天數即逾期', () => {
    const now = calculateTotalDays(1024, 4, 22);
    expect(isQuestExpired(quest(), now)).toBe(true);
    expect(getQuestRemainingDays(quest(), now)).toBe(0);
  });

  it('無期限任務永不逾期', () => {
    const now = calculateTotalDays(1024, 12, 30);
    expect(isQuestExpired(quest({ deadline: null }), now)).toBe(false);
    expect(getQuestRemainingDays(quest({ deadline: null }), now)).toBeNull();
  });

  it('非 active 任務不判定逾期', () => {
    const now = calculateTotalDays(1024, 5, 30);
    expect(isQuestExpired(quest({ status: 'completed' }), now)).toBe(false);
  });
});

/**
 * 玩家回報：「故事是早上，可是狀態列裡面是半夜，沒有辦法校準。」
 *
 * 成因是 TIME 只有 delta，時鐘只能累加。AI 寫「你一覺醒來，晨光灑進窗子」
 * 卻只給了 +30m，時鐘就停在半夜；之後每回合 prompt 又把「02:14」餵回去，
 * 敘事被自己的時鐘拉回夜晚，而且沒有任何辦法修回來。
 */
describe('setClockForward', () => {
  it('校準到今天稍晚的時刻', () => {
    const next = setClockForward(t({ hour: 6, minute: 0 }), 9, 30);
    expect(next).toMatchObject({ day: 15, hour: 9, minute: 30 });
  });

  /** 睡到隔天早上：要求的時刻早於現在，解讀成「明天的那個時刻」 */
  it('要求的時刻早於現在時跨到隔天', () => {
    const next = setClockForward(t({ day: 15, hour: 23, minute: 0 }), 6, 0);
    expect(next).toMatchObject({ day: 16, hour: 6, minute: 0 });
  });

  it('跨日時月份與年份跟著進位', () => {
    const next = setClockForward(t({ month: 12, day: 30, hour: 22, minute: 0 }), 5, 0);
    expect(next).toMatchObject({ year: 1025, month: 1, day: 1, hour: 5 });
  });

  /** 時間單調遞增是硬前提：任務期限、日記時序、NPC 足跡日期全建立在上面 */
  it('永遠不倒轉', () => {
    const before = t({ day: 15, hour: 20, minute: 0 });
    const after = setClockForward(before, 8, 0);
    expect(getTotalDaysFromTimeState(after)).toBeGreaterThanOrEqual(getTotalDaysFromTimeState(before));
    expect(after.day).toBe(16);
  });

  /**
   * AI 想講「現在大約八點」而時鐘已經 08:30 時，照「往前轉」會整整跳掉 23.5
   * 小時——一句無意義的校準吃掉一整天。小幅落後視為已經到了，不動。
   */
  it('小幅落後視為已到達，不跳日', () => {
    const before = t({ hour: 8, minute: 30 });
    expect(setClockForward(before, 8, 0)).toBe(before);
  });

  it('超過容忍範圍的落後才跳日', () => {
    const before = t({ day: 15, hour: 8, minute: 30 });
    const after = setClockForward(before, 7, 0);
    expect(after).toMatchObject({ day: 16, hour: 7, minute: 0 });
  });

  /** 無變更時回傳原 reference，呼叫端據此判斷要不要顯示校準訊息 */
  it('已經在目標時刻時回傳原物件', () => {
    const before = t({ hour: 9, minute: 30 });
    expect(setClockForward(before, 9, 30)).toBe(before);
  });

  it('天氣等其他欄位原樣保留', () => {
    expect(setClockForward(t({ hour: 6, weather: '下雨' }), 9, 0).weather).toBe('下雨');
  });

  it.each([[24, 0], [-1, 0], [12, 60], [12, -1], [1.5, 0]])(
    '不合法的時刻直接丟錯（%s:%s）',
    (h, m) => {
      expect(() => setClockForward(t(), h, m)).toThrow();
    }
  );
});

describe('advanceTimeAndResolveQuestDeadlines 的 setTo', () => {
  const quest = (over: Partial<Quest> = {}): Quest => ({
    id: 'q1', shortId: 'k3p', title: '任務', giver: '委託人', description: '',
    reward: {}, deadline: 1, status: 'active', isGoalMet: false,
    createdAt: '4/15', createdAtTotalDays: calculateTotalDays(1024, 4, 15), ...over,
  });

  it('delta 先累加、set 後校準', () => {
    const { newTimeState } = advanceTimeAndResolveQuestDeadlines(
      t({ hour: 6, minute: 0 }), 60, [], { hour: 9, minute: 0 }
    );
    // 6:00 +1h = 7:00，再校準到 9:00
    expect(newTimeState).toMatchObject({ day: 15, hour: 9, minute: 0 });
  });

  it('沒給 setTo 時行為與原本完全相同', () => {
    const { newTimeState, calibrated } = advanceTimeAndResolveQuestDeadlines(
      t({ hour: 6, minute: 0 }), 90, []
    );
    expect(newTimeState).toMatchObject({ hour: 7, minute: 30 });
    expect(calibrated).toBe(false);
  });

  /** 校準跨日同樣會讓任務逾期——期限檢查必須跑在最終時間上 */
  it('校準跨日也會結算逾期任務', () => {
    const { updatedQuests, cmdResults } = advanceTimeAndResolveQuestDeadlines(
      t({ day: 15, hour: 23, minute: 0 }), 0, [quest()], { hour: 6, minute: 0 }
    );
    expect(updatedQuests[0].status).toBe('failed');
    expect(cmdResults.some(r => r.includes('逾期'))).toBe(true);
  });

  it('校準沒有實際改變時間時 calibrated 為 false', () => {
    const { calibrated } = advanceTimeAndResolveQuestDeadlines(
      t({ hour: 9, minute: 0 }), 0, [], { hour: 9, minute: 0 }
    );
    expect(calibrated).toBe(false);
  });
});
