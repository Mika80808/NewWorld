/**
 * 任務標題比對的唯一入口。
 *
 * 任務系統整條都以「標題字串完全相等」在比對（`QUEST_ADD` 去重、
 * `QUEST_GOAL_MET`、`QUEST_COMPLETE`），而標題是 **AI 每次重新打字產生的**。
 * prompt 雖然寫了「名稱需與 QUEST_ADD 完全一致」，但那是願望不是保證——
 * 模型很常多一組引號、句尾多個標點、或全形半形飄掉。兩個實際症狀：
 *
 * - **重複發放**：`QUEST_ADD` 的去重比不到既有任務 → 同一個委託長出第二筆
 * - **完成沒被偵測**：`QUEST_COMPLETE` 找不到任務 → `if (quest)` 直接跳過，
 *   沒有 log、沒有提示，玩家只看到任務還掛在「進行中」
 *
 * 因此比對一律走這裡，並採三段式：完全相等 → 正規化後相等 → 唯一的包含關係。
 */

/** 標題兩側常見的引號／括號，模型很愛自己加上去 */
const WRAPPERS = /[「」『』《》〈〉【】〔〕[\]()（）"'‘’“”]/g;
/** 句尾標點 */
const TRAILING_PUNCT = /[。．.、,，!！?？~～:：;；\-－—_\s]+$/;

/** 全形英數 → 半形 */
const toHalfWidth = (s: string) =>
  s.replace(/[！-～]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
   .replace(/\u3000/g, ' ');   // 全形空白（用跳脫寫法，字面值會觸發 no-irregular-whitespace）

export function normalizeQuestTitle(raw: string): string {
  return toHalfWidth(raw ?? '')
    .replace(WRAPPERS, '')
    .replace(/\s+/g, '')
    .replace(TRAILING_PUNCT, '')
    .toLowerCase();
}

interface TitledQuest {
  title: string;
  status: string;
}

/**
 * 依標題找任務。
 *
 * @param activeOnly 只找進行中的任務（`QUEST_GOAL_MET` / `QUEST_COMPLETE` 用）。
 *                   `QUEST_ADD` 去重時要涵蓋所有狀態，否則剛完成的任務會被
 *                   模型再發一次而復活。
 *
 * ⚠️ 第三段的包含比對**只在唯一命中時採用**。「護送商隊」與「護送商隊到南門」
 * 同時存在時兩者都包含得到，這種情況寧可判定失敗讓上層 warn，也不要隨便挑一個
 * ——挑錯會把獎勵發到別的任務上，比沒偵測到更難查。
 */
export function findQuestByTitle<T extends TitledQuest>(
  quests: T[],
  rawTitle: string,
  activeOnly = false,
): T | undefined {
  const pool = activeOnly ? quests.filter(q => q.status === 'active') : quests;
  if (pool.length === 0) return undefined;

  const exact = pool.find(q => q.title === rawTitle);
  if (exact) return exact;

  const target = normalizeQuestTitle(rawTitle);
  if (!target) return undefined;

  const normalized = pool.filter(q => normalizeQuestTitle(q.title) === target);
  if (normalized.length === 1) return normalized[0];
  // 正規化後有多筆完全同名時無從分辨，交給上層 warn
  if (normalized.length > 1) return undefined;

  const contained = pool.filter(q => {
    const t = normalizeQuestTitle(q.title);
    return t.length > 0 && (t.includes(target) || target.includes(t));
  });
  return contained.length === 1 ? contained[0] : undefined;
}
