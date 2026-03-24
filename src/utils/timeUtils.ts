import { TimeState, Quest } from '../types';

/**
 * ═══ 基礎計算函式 ═══
 */

/**
 * 計算給定日期的總天數（自基準年開始的相對日數）
 * @param year 年份
 * @param month 月份（1-12）
 * @param day 日期（1-30）
 * @returns 相對總天數（year * 360 + (month - 1) * 30 + day）
 */
export function calculateTotalDays(
  year: number,
  month: number,
  day: number
): number {
  return year * 360 + (month - 1) * 30 + day;
}

/**
 * 從 TimeState 對象計算總天數
 */
export function getTotalDaysFromTimeState(timeState: TimeState): number {
  return calculateTotalDays(timeState.year, timeState.month, timeState.day);
}

/**
 * ═══ 時間推進 ═══
 */

/**
 * 將時間狀態推進指定分鐘數，自動處理日、月、年進位
 * @param timeState 當前時間狀態
 * @param minutes 推進的分鐘數（必須非負）
 * @returns 新的時間狀態
 */
export function advanceTimeByMinutes(
  timeState: TimeState,
  minutes: number
): TimeState {
  if (minutes < 0) {
    throw new Error('minutes must be non-negative');
  }

  // 計算新時刻
  let totalMinutes = timeState.hour * 60 + timeState.minute + minutes;
  const extraDays = Math.floor(totalMinutes / (24 * 60));
  totalMinutes = totalMinutes % (24 * 60);

  const newHour = Math.floor(totalMinutes / 60);
  const newMinute = totalMinutes % 60;

  // 計算新日期（月份進位）
  let day = timeState.day + extraDays;
  let month = timeState.month;
  let year = timeState.year;

  while (day > 30) {
    day -= 30;
    month++;
  }
  while (month > 12) {
    month -= 12;
    year++;
  }

  return {
    ...timeState,
    year,
    month,
    day,
    hour: newHour,
    minute: newMinute,
  };
}

/**
 * ═══ 任務期限判定 ═══
 */

/**
 * 判斷任務是否已逾期
 * @param quest 任務對象
 * @param currentTotalDays 當前總天數（由 getTotalDaysFromTimeState 提供）
 * @returns 若任務已逾期返回 true
 */
export function isQuestExpired(
  quest: Quest,
  currentTotalDays: number
): boolean {
  if (quest.status !== 'active' || quest.deadline == null) {
    return false;
  }
  const daysElapsed = currentTotalDays - quest.createdAtTotalDays;
  return daysElapsed >= quest.deadline;
}

/**
 * 計算任務剩餘天數
 * @param quest 任務對象
 * @param currentTotalDays 當前總天數
 * @returns 剩餘天數，若無期限返回 null
 */
export function getQuestRemainingDays(
  quest: Quest,
  currentTotalDays: number
): number | null {
  if (quest.deadline == null) return null;
  const daysElapsed = currentTotalDays - quest.createdAtTotalDays;
  return Math.max(0, quest.deadline - daysElapsed);
}

/**
 * ═══ 任務狀態檢查 ═══
 */

/**
 * 檢查並標記所有已逾期的任務為失敗狀態
 * @param timeState 當前時間狀態
 * @param quests 任務列表
 * @returns { updatedQuests, failedQuestTitles }
 */
export function checkAndFailExpiredQuests(
  timeState: TimeState,
  quests: Quest[]
): { updatedQuests: Quest[]; failedQuestTitles: string[] } {
  const currentTotalDays = getTotalDaysFromTimeState(timeState);
  const failedTitles: string[] = [];

  const updatedQuests = quests.map(q => {
    if (isQuestExpired(q, currentTotalDays)) {
      failedTitles.push(q.title);
      return { ...q, status: 'failed' as const };
    }
    return q;
  });

  return { updatedQuests, failedQuestTitles };
}

/**
 * ═══ 組合函式（時間推進 + 期限檢查）═══
 */

/**
 * 推進時間並檢查任務期限，返回所有變更
 * @param timeState 當前時間狀態
 * @param minutes 推進的分鐘數
 * @param quests 任務列表
 * @returns { newTimeState, updatedQuests, cmdResults } 新時間、更新的任務和命令反饋
 */
export function advanceTimeAndResolveQuestDeadlines(
  timeState: TimeState,
  minutes: number,
  quests: Quest[]
): {
  newTimeState: TimeState;
  updatedQuests: Quest[];
  cmdResults: string[];
} {
  const cmdResults: string[] = [];

  // 推進時間
  const newTimeState = advanceTimeByMinutes(timeState, minutes);

  // 檢查過期任務
  const { updatedQuests, failedQuestTitles } = checkAndFailExpiredQuests(newTimeState, quests);

  // 生成反饋訊息
  failedQuestTitles.forEach(title => {
    cmdResults.push(`⏰ 任務逾期：${title}`);
  });

  return { newTimeState, updatedQuests, cmdResults };
}
