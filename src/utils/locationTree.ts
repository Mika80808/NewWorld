/**
 * locationTree.ts — 地點的母子關係（主城市 ↔ 城內地點）
 *
 * 玩家回報：「原本在月湖鎮裡開店的 NPC 應該會出現在月湖鎮的各個地方，
 * 而不是只待在店裡。」
 *
 * Phase 1 的候選名單是**字串完全相等**比對（`e.homeLocation === currentLocation`）。
 * 酒館老闆娘的主場是「醉醺醺酒館」，玩家人在「月湖鎮」大街上時比不中，
 * 於是她永遠不可能出場——反過來也一樣，玩家走進酒館，鎮上其他人就全部消失。
 *
 * `parentLocation` 把地點串成一棵樹（醉醺醺酒館 → 月湖鎮），候選名單改以
 * 「同一座城」為單位比對。存的是**名稱**不是 id，與 `homeLocation` / `adjacentTo`
 * 一致：id 是各存檔自己編的流水號，跨存檔必然對不上。
 */
import { LorebookEntry } from '../types';

/**
 * 往上找的層數上限。
 *
 * 上限存在的理由不是效能，是**防環**：`parentLocation` 是自由填寫的名稱，
 * 玩家（或 AI）完全可能寫出 A → B → A。少了這道防線，`rootOf` 會無窮迴圈
 * 把整個分頁凍住。實務上「城內建築 → 城鎮」一層就夠，三層是給
 * 「房間 → 建築 → 城鎮 → 王國」這種寫法留的餘裕。
 */
export const MAX_LOCATION_DEPTH = 3;

/** 建一張 title → entry 的表，避免每次比對都掃一遍整本設定集 */
function indexByTitle(entries: LorebookEntry[]): Map<string, LorebookEntry> {
  const map = new Map<string, LorebookEntry>();
  for (const e of entries) {
    if (e.category === '地點' && e.title) map.set(e.title, e);
  }
  return map;
}

/**
 * 這個地點所屬「城」的名稱——一路往上找到沒有母地點為止。
 *
 * 沒有母地點的地點（城鎮本身、野外）root 就是自己，所以兩個無關的野外
 * 不會被判成同城。查無此條目時回傳原名，讓比對退回「字串相等」的舊行為，
 * 而不是把所有查不到的地點都湊成一堆。
 */
export function rootLocationOf(entries: LorebookEntry[], title: string): string {
  if (!title) return '';
  const byTitle = indexByTitle(entries);
  let current = title;
  const seen = new Set<string>([current]);
  for (let depth = 0; depth < MAX_LOCATION_DEPTH; depth++) {
    const parent = byTitle.get(current)?.parentLocation;
    if (!parent || parent === current || seen.has(parent)) break;
    seen.add(parent);
    current = parent;
  }
  return current;
}

/**
 * 兩個地點是否屬於同一座城。
 *
 * 「同城」＝ 兩者的 root 相同。這一口氣涵蓋三種關係：
 *   - 母子：月湖鎮 ↔ 醉醺醺酒館
 *   - 兄弟：醉醺醺酒館 ↔ 鐵匠鋪（都在月湖鎮裡）
 *   - 自己：月湖鎮 ↔ 月湖鎮
 *
 * ⚠️ 兄弟關係是刻意收進來的：玩家說的是「出現在月湖鎮的**各個地方**」，
 * 而不是只有大街上。候選名單那側靠排序讓本地角色優先，不會被同城的人擠掉。
 *
 * 空字串一律不算同城（避免未設定地點的條目全部互相匹配）。
 */
export function isSameCity(entries: LorebookEntry[], a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  return rootLocationOf(entries, a) === rootLocationOf(entries, b);
}

/**
 * 這座城底下有哪些地點（含自己），供 prompt 讓 AI 知道城裡有什麼可去。
 * 只往下一層——完整樹狀展開對敘事沒有幫助，只會撐大 prompt。
 */
export function childLocationsOf(entries: LorebookEntry[], title: string): string[] {
  if (!title) return [];
  return entries
    .filter(e => e.category === '地點' && e.isActive && e.parentLocation === title)
    .map(e => e.title);
}
