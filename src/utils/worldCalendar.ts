import { MONTHS_DATA } from '../constants';

/**
 * 世界曆：月份的雅稱與該月的節慶時節。
 *
 * 資料放在 `constants.MONTHS_DATA`（12 個月，含 `name` / `elegant` / `desc`），
 * 這裡是**唯一查詢入口**——先前 App.tsx 自己寫 `find(...) || MONTHS_DATA[0]`，
 * 之後每個要用的地方都得重抄一次那個 fallback。
 *
 * ⚠️ 這份資料先前只流向 UI（右欄的 World Memory Widget 與狀態列 tooltip），
 * **從來沒有進過 prompt**。玩家在畫面上看得到「四月・雙月之月：霧光許願夜與
 * 星織之夜」，AI 卻只拿到 `Time: 4年4月15日`——於是節日對它等於不存在，
 * 寫出來的四月與十月沒有任何差別。見 `monthPromptLine()`。
 */
export interface MonthInfo {
  id: number;
  name: string;
  /** 月份雅稱，例：初雪之月 */
  elegant: string;
  /** 該月的節慶與時節描述 */
  desc: string;
}

/**
 * 查某個月份的資料。
 *
 * 月份超出 1~12（舊存檔、指令寫壞）時退回一月而不是拋錯——
 * 時間顯示與 prompt 都不該因為一個怪數字就整段消失。
 */
export function monthInfo(month: number): MonthInfo {
  return MONTHS_DATA.find(m => m.id === month) ?? MONTHS_DATA[0];
}

/**
 * 注入 prompt 的月份行。
 *
 * 格式刻意與 `[Current State]` 其他行一致（英文標籤 + 中文內容），
 * 並把「節慶」兩個字寫出來——只丟一句描述的話，模型不見得知道那是
 * 這個月會發生的事，可能當成背景設定讀過去。
 */
export function monthPromptLine(month: number): string {
  const m = monthInfo(month);
  return `Month: ${m.name}・${m.elegant}｜本月節慶與時節：${m.desc}`;
}
