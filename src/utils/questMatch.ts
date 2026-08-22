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
 *
 * 標題比對救不了、也不該救的一類是**兩個標題互相包含**（「護送商隊」與
 * 「護送商隊到南門」）。那種情況交給短 ID——見 `findQuestByRef` 與 questShortId.ts。
 */
import { normalizeQuestShortId } from './questShortId';

/** 標題兩側常見的引號／括號，模型很愛自己加上去 */
const WRAPPERS = /[「」『』《》〈〉【】〔〕[\]()（）"'‘’“”]/g;
/**
 * `strictContainment` 模式下，包含比對允許的長度差距（正規化後的字元數）。
 *
 * 這個值在救「模型多打／少打幾個字」與誤殺「真的是另一個任務」之間權衡。
 * 2 的依據是實際會飄的東西：多一個「的」「之」、少一個量詞、
 * 「討伐哥布林」↔「討伐哥布林們」這種。系列任務通常會多出「：第二夜」
 * 「到南門」這類 3 字以上的後綴，落在門檻之外。
 */
const CONTAINMENT_MAX_DIFF = 2;

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
  shortId?: string;
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
 *
 * @param strictContainment 包含比對加上長度差距上限（`QUEST_ADD` 去重用）。
 *
 * ⚠️ 為什麼這件事要由呼叫端決定：**同一組字串，兩個指令要的答案是相反的**。
 *
 * | 既有任務 | AI 寫的 | QUEST_COMPLETE 該怎樣 | QUEST_ADD 該怎樣 |
 * |---|---|---|---|
 * | 護送商隊到南門 | 護送商隊 | 結案（他在講這個） | — |
 * | 護送商隊 | 護送商隊到南門 | — | 建新任務（這是系列的下一個） |
 *
 * 結案時寬鬆是對的：模型在指涉一個**已經存在**的東西，猜近的那個通常沒錯。
 * 去重時寬鬆是錯的：會把真正的新任務靜默吞掉，系列任務（「調查失蹤案」→
 * 「調查失蹤案：第二夜」）全部進不來，而且沒有任何提示——這是「完成偵測
 * 不到」的鏡像，一樣難查。
 *
 * 短 ID 上線後結案已有可靠的路（`findQuestByRef` 先比 ID），
 * 標題那條路的寬鬆代價更小了。
 */
export function findQuestByTitle<T extends TitledQuest>(
  quests: T[],
  rawTitle: string,
  activeOnly = false,
  strictContainment = false,
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
    if (t.length === 0) return false;
    if (!t.includes(target) && !target.includes(t)) return false;
    // 去重時：差一大截的多半是真的另一個任務，不是模型打錯字
    if (strictContainment && Math.abs(t.length - target.length) > CONTAINMENT_MAX_DIFF) return false;
    return true;
  });
  return contained.length === 1 ? contained[0] : undefined;
}

/**
 * 依短 ID 找任務。ID 是系統發的、AI 只負責原樣引用，所以只要正規化後相等即可。
 */
export function findQuestByShortId<T extends TitledQuest>(
  quests: T[],
  rawId: string,
  activeOnly = false,
): T | undefined {
  const target = normalizeQuestShortId(rawId);
  if (!target) return undefined;
  const pool = activeOnly ? quests.filter(q => q.status === 'active') : quests;
  return pool.find(q => normalizeQuestShortId(q.shortId) === target);
}

/**
 * 任務比對的**唯一入口**（`QUEST_GOAL_MET` / `QUEST_COMPLETE` 都走這裡）。
 *
 * 順序是先 ID 後標題，理由是可靠度：ID 是 AI 從 prompt 抄回來的，
 * 標題是 AI 重新打的。ID 比中就不必再猜標題。
 *
 * 兩者都給時**不要求一致**——模型很常 ID 抄對、標題順手改寫成別的說法。
 * 那種情況以 ID 為準才是對的；若因為對不起來就判失敗，等於把可靠的訊號
 * 拿去被不可靠的訊號否決。
 *
 * 舊存檔的任務沒有 shortId，AI 也還沒學會輸出 id=，所以標題那條路必須留著。
 */
export function findQuestByRef<T extends TitledQuest>(
  quests: T[],
  ref: { id?: string; title?: string },
  activeOnly = false,
): T | undefined {
  if (ref.id) {
    const byId = findQuestByShortId(quests, ref.id, activeOnly);
    if (byId) return byId;
  }
  if (ref.title) return findQuestByTitle(quests, ref.title, activeOnly);
  return undefined;
}
