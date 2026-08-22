/**
 * 任務短 ID。
 *
 * 任務系統原本整條都靠「標題字串」比對，而標題是 **AI 每次重新打字產生的**。
 * `questMatch` 的三段式比對（完全相等 → 正規化 → 唯一包含）救回了大部分情況，
 * 但有一類救不了也不該救：**兩個標題互相包含**。
 * 「護送商隊」與「護送商隊到南門」同時存在時，包含比對兩邊都命中，
 * `findQuestByTitle` 會刻意判定失敗——挑錯會把獎勵發到別的任務上，
 * 比沒偵測到更難查。
 *
 * 短 ID 就是給這種情況的：系統發任務時配一組三碼，注入 prompt 時擺在標題前面，
 * AI 回報完成時**引用**那三碼而不是重打標題。引用比重打可靠得多。
 *
 * ⚠️ 短 ID **治不了「重複發放」**。`QUEST_ADD` 是在建立新任務，手上根本沒有
 * 既有 ID 可引用，去重仍然只能靠標題正規化（`findQuestByTitle`）。
 * 兩者是互補的，不是替代關係。
 */

/**
 * 去掉形近字元：0/O、1/l/I 在等寬字體以外幾乎分不出來，
 * 而這組碼的唯一用途就是被模型讀進去再原樣吐出來。
 */
const ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz';

/** 三碼 = 31³ ≈ 29,791 種組合。任務數量是幾十的量級，碰撞靠重試即可 */
const ID_LENGTH = 3;

/** 產生一組不與 `taken` 重複的短 ID */
export function generateQuestShortId(taken: Iterable<string> = []): string {
  const used = new Set<string>();
  for (const t of taken) {
    const n = normalizeQuestShortId(t);
    if (n) used.add(n);
  }

  // 上限只是保險絲：空間有近三萬組，正常永遠不會走到
  for (let attempt = 0; attempt < 200; attempt++) {
    let id = '';
    for (let i = 0; i < ID_LENGTH; i++) {
      id += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    }
    if (!used.has(id)) return id;
  }

  // 真的撞滿了就線性找一個沒用過的，寧可長一點也不要回傳重複的 ID
  for (let i = 0; ; i++) {
    const id = `${ALPHABET[i % ALPHABET.length]}${i}`;
    if (!used.has(id)) return id;
  }
}

/**
 * 正規化 AI 寫回來的 ID。
 *
 * prompt 裡是以 `#k3p` 的樣子呈現的，模型多半會連井字號一起抄回來；
 * 大小寫與空白也不能指望。這些都不該讓比對失敗。
 */
export function normalizeQuestShortId(raw: string | undefined | null): string {
  return (raw ?? '')
    .trim()
    .replace(/^#+/, '')
    .toLowerCase()
    .replace(/[^0-9a-z]/g, '');
}
