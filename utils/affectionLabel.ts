// ── 好感度語意標籤（唯一判斷入口）──────────────────────────────────────────────
//
// 為什麼是衍生值而不是存檔欄位：
// 舊版 `Npc.affectionLabel` 是建檔時寫死的字串（NPC_NEW 寫 '陌生'、手動建檔寫 '陌生人'），
// 之後好感度怎麼漲都不會再更新，等於一個永遠停在初始值的死欄位。
// 標籤本來就是好感度的函數，存起來只會漂移，所以改為每次由 affection 現算。
//
// 門檻對齊 affectionColor() 的邊界（0 / 50 / 80 / 100），確保顏色與標籤不會互相矛盾；
// 額外的 20 是程式裡已有語意的門檻（backstory 永久解鎖），不是新發明的數字。
export function affectionLabel(affection: number): string {
  if (affection < 0)   return '敵對';
  if (affection < 20)  return '陌生';
  if (affection < 50)  return '相識';
  if (affection < 80)  return '友好';
  if (affection < 100) return '信賴';
  return '摯友';
}

/**
 * 顯示／注入用的關係字串。
 *
 * AI 只在「初次確立明確關係或重大轉變」時送 NPC_RELATIONSHIP，而好感度是靠
 * AFFINITY 獨立累積的，中間有一大段空窗期沒有任何關係描述可用。
 * 有明確關係時以它為準，沒有時退回好感度推導的標籤。
 */
export function relationText(relationship: string | undefined, affection: number): string {
  const rel = relationship?.trim();
  return rel || affectionLabel(affection);
}
