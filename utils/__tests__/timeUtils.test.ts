import { describe, it, expect } from 'vitest';
import {
  calculateTotalDays,
  getTotalDaysFromTimeState,
  advanceTimeByMinutes,
  isQuestExpired,
  getQuestRemainingDays,
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
