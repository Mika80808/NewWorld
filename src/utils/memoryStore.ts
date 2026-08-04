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
