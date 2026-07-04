// ── 好感度顏色（唯一判斷入口）────────────────────────────────────────────────
// 回傳 CSS 變數字串，語意色不隨主題變動（見 CLAUDE.md 顏色系統規則）
export function affectionColor(affection: number): string {
  if (affection < 0)   return 'var(--affection-hostile)';
  if (affection < 50)  return 'var(--affection-low)';
  if (affection < 80)  return 'var(--affection-mid)';
  if (affection < 100) return 'var(--affection-high)';
  return 'var(--affection-max)';
}
