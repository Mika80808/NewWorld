/**
 * 聊天區「可見則數」的決策邏輯。
 *
 * 訊息總數變動時（新訊息進來、載入存檔、清空重來），這個純函數決定要顯示
 * 最近幾則：
 * - `prev === 0`（尚未顯示過任何訊息）→ 顯示最近 `initialVisible` 則
 * - `prev` 已經涵蓋到「幾乎所有訊息」（玩家原本就捲到底跟著看）→ 跟著長，全顯示
 * - 否則（玩家往上捲到中間看歷史）→ 維持原本的可見則數，不要把他拉回底部
 *
 * ⚠️ **呼叫端必須只在真正的存檔資料載入完成後才呼叫這個函數**（`App.tsx`
 * 是等 `isStoreReady` 為 true）。
 *
 * 玩家實測回報過：重新整理網頁後，只看得到最後一句話，前面的歷史整段從畫面上
 * 消失（資料還在，只是沒渲染）。成因是呼叫時機——登入到雲端存檔真正載入之間，
 * `messages` 有一段時間是 `INITIAL_MESSAGES`（遊戲開場白，長度 1）。若在那段
 * 期間就呼叫這個函數，`prev === 0` 的哨兵狀態會被那句開場白提前「用掉」，變成
 * `prev = 1`。等雲端存檔真的載入、訊息數從 1 跳到實際則數（例如 40）時，這裡
 * 看到的 `prev` 已經不是 0，又不滿足「幾乎捲到底」（1 不會 >= 39），於是落到
 * 最後一支分支、原封不動回傳 1——可見則數就此卡死，等同重新整理後只看得到
 * 最新一句。
 */
export function nextVisibleMessageCount(
  prev: number,
  messagesLength: number,
  initialVisible: number,
): number {
  if (messagesLength === 0) return 0;
  if (prev === 0) return Math.min(messagesLength, initialVisible);
  if (prev >= messagesLength - 1) return messagesLength;
  return prev;
}
