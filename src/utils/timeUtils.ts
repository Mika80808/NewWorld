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
 * 校準到某個時刻時，落後多少分鐘以內視為「已經到了」而不推進。
 * 見 `setClockForward` 的說明。
 */
export const CLOCK_SET_TOLERANCE_MINUTES = 60;

/**
 * 把時鐘**往前**轉到指定時刻（絕對時刻校準）。
 *
 * 為什麼需要這個：`TIME|delta=` 只能累加，時鐘與敘事一旦分家就再也合不回來。
 * AI 寫「你一覺醒來，晨光灑進窗子」卻只給了 `delta=+30m`，時鐘就停在半夜；
 * 之後每回合 prompt 都把「02:14」餵回去，AI 於是又被拉回夜晚的設定，
 * 玩家看到的就是「故事是早上、狀態列是半夜」，而且沒有任何辦法修。
 *
 * ⚠️ **只會往前，永遠不倒轉。** 時間單調遞增是這個系統的硬前提：任務期限、
 * 日記時序、NPC 足跡日期全都建立在它上面。要求的時刻早於現在時，解讀成
 * 「明天的那個時刻」（睡到隔天早上就是這個情況）。
 *
 * 唯一的例外是**小幅落後**（`CLOCK_SET_TOLERANCE_MINUTES` 以內）：那多半是
 * AI 想講「現在大約是八點」而時鐘已經走到 08:30，照「往前轉」的規則會整整
 * 跳掉 23.5 小時——一句無意義的校準吃掉一天。這種情況視為已經到了，不動。
 *
 * @returns 無變更時回傳**原 reference**，呼叫端可用來判斷要不要顯示校準訊息
 */
export function setClockForward(
  timeState: TimeState,
  hour: number,
  minute: number
): TimeState {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw new Error(`hour must be an integer in 0..23 (got ${hour})`);
  }
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) {
    throw new Error(`minute must be an integer in 0..59 (got ${minute})`);
  }

  const nowOfDay = timeState.hour * 60 + timeState.minute;
  const targetOfDay = hour * 60 + minute;
  const diff = targetOfDay - nowOfDay;

  if (diff === 0) return timeState;
  if (diff < 0 && -diff <= CLOCK_SET_TOLERANCE_MINUTES) return timeState;

  return advanceTimeByMinutes(timeState, diff > 0 ? diff : diff + 24 * 60);
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

  return { updatedQuests, failedQuestTitles: failedTitles };
}

/**
 * ═══ 組合函式（時間推進 + 期限檢查）═══
 */

/**
 * 推進時間並檢查任務期限，返回所有變更
 *
 * `setTo` 是可選的**絕對時刻校準**，在累加 `minutes` 之後才套用（見
 * `setClockForward`）。期限檢查放在最後、對最終時間跑一次——校準可能跨日，
 * 那一步同樣會讓任務逾期，兩段各檢查一次只是重複工。
 *
 * @param timeState 當前時間狀態
 * @param minutes 推進的分鐘數
 * @param quests 任務列表
 * @param setTo 校準目標時刻；不需要校準時省略
 * @returns { newTimeState, updatedQuests, cmdResults, calibrated } 新時間、更新的任務、
 *          命令反饋，以及校準是否真的改變了時間（沒變就不必通知玩家）
 */
export function advanceTimeAndResolveQuestDeadlines(
  timeState: TimeState,
  minutes: number,
  quests: Quest[],
  setTo?: { hour: number; minute: number } | null
): {
  newTimeState: TimeState;
  updatedQuests: Quest[];
  cmdResults: string[];
  calibrated: boolean;
} {
  const cmdResults: string[] = [];

  // 推進時間
  const advanced = minutes > 0 ? advanceTimeByMinutes(timeState, minutes) : timeState;

  // 再校準到絕對時刻（只往前）
  const newTimeState = setTo ? setClockForward(advanced, setTo.hour, setTo.minute) : advanced;
  const calibrated = newTimeState !== advanced;

  // 檢查過期任務
  const { updatedQuests, failedQuestTitles } = checkAndFailExpiredQuests(newTimeState, quests);

  // 生成反饋訊息
  failedQuestTitles.forEach(title => {
    cmdResults.push(`⏰ 任務逾期：${title}`);
  });

  return { newTimeState, updatedQuests, cmdResults, calibrated };
}
