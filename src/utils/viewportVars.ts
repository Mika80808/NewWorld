/**
 * 把「視覺視窗」的量測結果寫成 CSS 變數，給版面與所有 `position: fixed` 覆蓋層用。
 *
 * iOS 鍵盤彈出時會發生兩件事，兩件都要處理：
 *
 * 1. 視覺視窗**變矮**（鍵盤佔掉下半部）→ `--game-viewport-height`
 * 2. 視覺視窗在版面視窗裡**往下位移**，好讓聚焦的欄位露出來 → `--game-viewport-offset-top`
 *
 * ⚠️ 第 2 點先前漏掉，症狀是「編輯欄位時整個視窗跑到上面去」：
 * `position: fixed` 是貼著**版面視窗**定位的，不是視覺視窗。版面視窗沒有動，
 * 所以 `top: 0` 的覆蓋層留在原地，而使用者看到的畫面已經往下挪了 offsetTop，
 * 於是覆蓋層的上半截被推出畫面外——只剩中間一條，底下露出後面的頁面。
 * 光同步高度救不了這個，高度對了位置還是錯的。
 *
 * 兩個變數都掛在 `<html>` 上，CSS 端以 `top: var(--game-viewport-offset-top, 0px)`
 * 與 `height: var(--game-viewport-height, 100dvh)` 成對使用，缺一不可。
 */

export const VIEWPORT_HEIGHT_VAR = '--game-viewport-height';
export const VIEWPORT_OFFSET_TOP_VAR = '--game-viewport-offset-top';

/** `window.visualViewport` 用得到的部分，測試不必造整個 VisualViewport */
export interface ViewportMetrics {
  height: number;
  offsetTop: number;
  scale: number;
}

/**
 * 寫入量測結果。
 *
 * 雙指縮放（`scale !== 1`）時**不寫**，保留瀏覽器原生的縮放行為——
 * 放大瀏覽時視覺視窗本來就會又小又偏，跟著重排版面只會讓畫面亂跳。
 *
 * @returns 是否真的寫入（縮放中回傳 false）
 */
export function applyViewportVars(root: HTMLElement, vv: ViewportMetrics): boolean {
  if (vv.scale !== 1) return false;
  root.style.setProperty(VIEWPORT_HEIGHT_VAR, `${vv.height}px`);
  root.style.setProperty(VIEWPORT_OFFSET_TOP_VAR, `${vv.offsetTop}px`);
  return true;
}

/** 離開手機版面時清掉，讓 CSS 退回 `100dvh` / `0px` 的預設值 */
export function clearViewportVars(root: HTMLElement): void {
  root.style.removeProperty(VIEWPORT_HEIGHT_VAR);
  root.style.removeProperty(VIEWPORT_OFFSET_TOP_VAR);
}
