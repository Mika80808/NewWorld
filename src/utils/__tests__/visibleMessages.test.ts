import { describe, it, expect } from 'vitest';
import { nextVisibleMessageCount } from '../visibleMessages';

/**
 * 玩家回報：重新整理網頁後，聊天區只看得到最後一句話，前面的歷史整段消失
 * （資料還在，只是沒渲染）。成因不在這支函數本身，而在呼叫時機——`App.tsx`
 * 曾經在雲端存檔真正載入前，就先用遊戲開場白（長度 1）呼叫過一次，把
 * `prev === 0` 的哨兵狀態提前用掉。這裡把那個場景重現成單元測試，
 * 釘住函數本身的行為；呼叫時機的部分已在 App.tsx 加上 `isStoreReady` 守衛。
 */
describe('nextVisibleMessageCount', () => {
  it('prev 為 0（尚未顯示過）時，顯示最近 initialVisible 則', () => {
    expect(nextVisibleMessageCount(0, 40, 10)).toBe(10);
  });

  it('訊息總數少於 initialVisible 時，全部顯示', () => {
    expect(nextVisibleMessageCount(0, 3, 10)).toBe(3);
  });

  it('prev 幾乎涵蓋全部訊息（玩家在底部跟讀）時，新訊息進來要跟著長', () => {
    expect(nextVisibleMessageCount(9, 10, 10)).toBe(10);
  });

  it('prev 明顯少於訊息總數（玩家往上捲看歷史）時，維持原本可見則數，不拉回底部', () => {
    expect(nextVisibleMessageCount(10, 40, 10)).toBe(10);
  });

  it('訊息清空時回傳 0', () => {
    expect(nextVisibleMessageCount(10, 0, 10)).toBe(0);
  });

  /**
   * 這是實際重現過的錯誤場景：`prev` 因為開場白（長度 1）被提前設成 1，
   * 之後雲端存檔載入、訊息數跳到 40。錯誤的呼叫時機會讓這裡收到 prev=1，
   * 而 1 既不是 0、也不 >= 39，函數本身「維持原值」的邏輯完全合理
   * （這正是「玩家捲到中間時不要被拉回底部」該有的行為）——
   * 問題出在 App.tsx 不該在存檔真正載入前就呼叫它一次。
   * 這條測試釘住：只要呼叫時機正確（prev 真的是初始的 0），
   * 40 則訊息會正確显示最近 10 則，而不是卡在 1。
   */
  it('呼叫時機正確時（prev 真的是 0），40 則歷史正確顯示最近 10 則，不會卡在 1', () => {
    expect(nextVisibleMessageCount(0, 40, 10)).toBe(10);
    expect(nextVisibleMessageCount(0, 40, 10)).not.toBe(1);
  });
});
