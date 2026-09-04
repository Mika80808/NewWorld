/**
 * memoryStore.ts — memories[] 四層記憶的儲存層純函數
 *
 * 對應 itemCatalog.ts 之於道具。memories[] 先前只有 append、沒有任何上限，
 * 長期遊玩會有兩個問題：
 *   1. 存檔無限膨脹（整包 JSON 上雲）
 *   2. 每回合 buildPrompt 都對全量跑一次 isMemoryTriggered，每條含字串比對與擲骰
 * 注入端的截斷（promptBuilder 的 filterByImportance）只管「這回合送幾條給 AI」，
 * 完全不影響儲存量，兩者是不同的問題。
 */
import { MemoryEntry } from '../types';

/** 記憶總數上限，超過時觸發 LOD 淘汰 */
export const MAX_MEMORIES = 300;

/**
 * 記憶的「新鮮度」排序鍵。
 * 優先用 lastTriggeredAt（真正的 LRU：老記憶只要一直被觸發就代表還有用），
 * 舊存檔沒有該欄位時退回 id 內嵌的建檔時間戳（`mem_${Date.now()}_${random}`）。
 */
function recencyOf(m: MemoryEntry): number {
  if (typeof m.lastTriggeredAt === 'number') return m.lastTriggeredAt;
  const stamp = parseInt(m.id?.split('_')[1] ?? '', 10);
  return Number.isFinite(stamp) ? stamp : 0;
}

/** 淘汰優先序：flavor（純氛圍）先於 normal */
function evictionRank(m: MemoryEntry): number {
  return m.importance === 'flavor' ? 0 : 1;
}

/**
 * 淘汰豁免。兩種記憶永不自動刪除：
 *   - critical：世界級事件（魔王宣戰之類），刪掉等於劇情斷裂
 *   - manual：玩家親手寫的，不該被 AI 生成的記憶擠掉
 */
function isProtected(m: MemoryEntry): boolean {
  return m.importance === 'critical' || m.source === 'manual';
}

/**
 * LOD 淘汰：總數超過 max 時，依「flavor 優先、最久未觸發優先」淘汰至 max 條。
 * critical 與 manual 豁免；若可淘汰的條目不足以降到 max，就淘汰所有能淘汰的，
 * 不會為了湊數字而動到受保護的記憶（寧可暫時超量）。
 *
 * 未超量時回傳原陣列 reference，讓呼叫端的 === 比較與 React 的 bail-out 生效。
 */
export function pruneMemories(
  memories: MemoryEntry[],
  max: number = MAX_MEMORIES,
): MemoryEntry[] {
  if (memories.length <= max) return memories;

  const evictable = memories
    .filter(m => !isProtected(m))
    .sort((a, b) => evictionRank(a) - evictionRank(b) || recencyOf(a) - recencyOf(b));

  const toEvict = new Set(
    evictable.slice(0, memories.length - max).map(m => m.id)
  );
  if (toEvict.size === 0) return memories;

  return memories.filter(m => !toEvict.has(m.id));
}

/**
 * 標記本回合觸發過的記憶（更新 LRU 時間戳）。
 * triggeredIds 為空、或沒有任何一條實際匹配時回傳原 reference——
 * 每回合無條件產生新陣列會讓存檔的髒標記永遠為髒。
 */
export function touchMemories(
  memories: MemoryEntry[],
  triggeredIds: string[],
  now: number = Date.now(),
): MemoryEntry[] {
  if (triggeredIds.length === 0) return memories;
  const ids = new Set(triggeredIds);
  let changed = false;
  const next = memories.map(m => {
    if (!ids.has(m.id)) return m;
    changed = true;
    return { ...m, lastTriggeredAt: now };
  });
  return changed ? next : memories;
}

// ─── 玩家編輯與融合（場景／區域記憶）────────────────────────────────────────
//
// 玩家回報：「開放修改場景記憶，AI 不會刪除的話會變得很長一串，或者讓 AI
// 搜尋相關記憶並融合。」
//
// memories[] 先前對玩家是**唯讀**的：右欄 Widget 只印出來，沒有任何新增／
// 編輯／刪除入口，而 AI 只會 MEMORY_ADD、從來不刪。`pruneMemories` 是 300 條
// 的儲存上限，離「這個地點列了十幾條」還很遠，救不了畫面上的那一串。

/** 一次融合最少要有幾條可融合記憶才划算（少於這個數，融合只是把兩句話併成一句） */
export const MIN_MERGE_CANDIDATES = 3;

/**
 * 可融合 = AI 產出、非 critical、且還在啟用中。
 *
 * 兩種豁免與 `pruneMemories` 的 `isProtected` 同一套理由：
 *   - `manual`：玩家親手寫的（或親手改過的，見 `editMemoryContent`）不交給 AI 改寫
 *   - `critical`：劇情承重的世界級事件，被概括掉等於劇情斷裂
 *
 * ⚠️ 與 NPC 記憶的 `isMergeable` 不同，`MemoryEntry` 沒有 `isMerged` 封存欄位，
 * 所以融合是**直接取代**原文。這正是上面兩條豁免必須存在的原因。
 */
export function isSceneMergeable(m: MemoryEntry): boolean {
  return m.isActive && m.source === 'ai_generated' && m.importance !== 'critical';
}

/**
 * 挑出「這個地點的這一層」裡可以融合的記憶。
 *
 * 地點比對與 `SceneMemoryWidget` 的顯示條件一致，否則會出現「畫面上看到 5 條、
 * 按下融合卻併了 8 條」的分歧：
 *   - `scene`：必須明確標到這個地點
 *   - `region`：沒有地點標籤視為全域，也算在內
 */
export function selectMergeableMemories(
  memories: MemoryEntry[],
  location: string,
  type: 'scene' | 'region',
): MemoryEntry[] {
  return memories.filter(m => {
    if (m.type !== type || !isSceneMergeable(m)) return false;
    const locs = m.tags?.locations || [];
    return type === 'region'
      ? locs.length === 0 || locs.includes(location)
      : locs.includes(location);
  });
}

/**
 * 把 mergedIds 這批記憶換成一條 replacement。
 *
 * replacement 插在**第一條被取代者的位置**，不是接到陣列尾巴——注入端的
 * `sortByNewest` 讀的是 id 內嵌的時間戳，而融合結果掛的是新時間戳；接在尾巴
 * 會讓它每次都排到最前面，把真正的新記憶擠出截斷範圍。
 *
 * 找不到任何一條要取代的就回傳原 reference（避免無謂的新陣列）。
 */
export function replaceMemoriesWithMerged(
  memories: MemoryEntry[],
  mergedIds: string[],
  replacement: MemoryEntry,
): MemoryEntry[] {
  const ids = new Set(mergedIds);
  const firstIdx = memories.findIndex(m => ids.has(m.id));
  if (firstIdx === -1) return memories;

  const kept = memories.filter(m => !ids.has(m.id));
  const insertAt = memories.slice(0, firstIdx).filter(m => !ids.has(m.id)).length;
  return [...kept.slice(0, insertAt), replacement, ...kept.slice(insertAt)];
}

/**
 * 玩家編輯記憶內容。
 *
 * ⚠️ 改過的記憶一律轉成 `source: 'manual'`。玩家動手修正過的內容，不該再被
 * AI 融合改寫、也不該被 LOD 淘汰擠掉——這與 NPC 記憶庫「手寫的不參與融合」
 * 是同一條規則。空白內容視為無效，回傳原 reference。
 */
export function editMemoryContent(
  memories: MemoryEntry[],
  id: string,
  content: string,
): MemoryEntry[] {
  const trimmed = content.trim();
  if (!trimmed) return memories;
  let changed = false;
  const next = memories.map(m => {
    if (m.id !== id || m.content === trimmed) return m;
    changed = true;
    return { ...m, content: trimmed, source: 'manual' as const };
  });
  return changed ? next : memories;
}
