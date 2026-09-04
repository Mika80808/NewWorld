/**
 * 「這個 NPC 現在在不在場上」的唯一判定入口。
 *
 * 場上名單的唯一真相是 `appearingNpcs`——由 AI 每回應輸出的 `[出場:]` 標記決定，
 * 空標記代表「現場無人」並清空名單（見 CLAUDE.md 的三種語意表）。
 *
 * ⚠️ 不要用 `Npc.location` 判斷在場。那個欄位是**足跡**：NPC 出場時寫入、
 * 退場時從不清除。右欄「當前場景人物」先前是
 * `appearingNpcs.includes(name) || n.location === currentLocation || n.isPinned`，
 * 於是角色只要在月湖鎮出現過一次，之後玩家只要還在月湖鎮就永遠留在清單裡——
 * 明明已經被 `[出場:]` 請下台了。釘選那條同理：釘選的人不管身在哪個城鎮都會
 * 被算成「在場」，而釘選角色本來就有獨立的 PinnedNpcsWidget 在顯示。
 *
 * 比對採前後包含（而非嚴格相等），與 `promptBuilder` 的 `inScene` 判定一致：
 * AI 可能輸出「凱爾」而角色全名是「凱爾·溫德」，兩邊必須用同一套規則，
 * 否則會出現「prompt 當他在場、UI 說他不在」的分歧。
 */
export function isNpcOnStage(npcName: string, appearingNpcs: string[]): boolean {
  return appearingNpcs.some(n => npcName.includes(n) || n.includes(npcName));
}

/**
 * 把「隨行同伴」併進場上名單，得到**實際在場**的名單。
 *
 * `appearingNpcs` 是 AI 每回應寫的 `[出場:]`，語意是「這個場景裡有誰」——
 * 它天生綁定地點與場面調度。隨行同伴（`Npc.isCompanion`）不屬於那個問題：
 * 他是跟著玩家走的，玩家在哪他就在哪，AI 忘了寫、或寫了空標記（現場無人）
 * 都不該讓他消失。
 *
 * ⚠️ 合併只發生在**讀取端**（prompt 組裝、右欄在場名單、足跡更新），
 * 不要把同伴寫回 `appearingNpcs` state。那個欄位存進存檔，混進去之後
 * 「AI 說誰在場」與「誰跟著玩家」就再也分不開，取消隨行時人也清不掉。
 *
 * 沒有隨行同伴（絕大多數回合）時回傳**原陣列 reference**，
 * 避免每回合白白產生新陣列（同 memoryStore 的 touchMemories）。
 */
export function resolveOnStageNames<T extends { name: string; isCompanion?: boolean }>(
  npcs: T[],
  appearingNpcs: string[],
): string[] {
  const extras = npcs
    .filter(n => n.isCompanion && !isNpcOnStage(n.name, appearingNpcs))
    .map(n => n.name);
  return extras.length === 0 ? appearingNpcs : [...appearingNpcs, ...extras];
}

/**
 * 更新出場 NPC 的足跡（`location` / `lastSeenLocation` / `lastSeenDate`）。
 *
 * ⚠️ **只有 `[出場:]` 名單上的角色才算出場過。**
 *
 * `App.tsx` 先前除了依名單更新之外，還多跑一次
 * `narrative.includes(npc.name)`——對整段敘事做子字串比對，只要名字在對話裡
 * **被提到**就把「最後出現於」寫成當前地點。於是「你聽說芬里爾去了北境」
 * 這種句子會讓芬里爾被記成在月湖鎮出現過，而那個欄位會注入 prompt
 * （`[Scene Lorebook]` 的「最後出現於：X」），AI 於是拿到一個他從沒去過的地點。
 *
 * 而且裸的 `includes` 連自己人都分不清：短名字（「里歐」）會被長名字
 * （「里歐娜」）的句子誤中。判定一律走 `isNpcOnStage`，與 promptBuilder、
 * 右欄「當前場景人物」同一套規則。
 *
 * 無人出場時回傳**原陣列 reference**——每回合無條件產生新陣列會讓存檔的
 * 髒標記永遠為髒（與 memoryStore 的 pruneMemories / touchMemories 同理）。
 */
export function updateNpcFootprints<T extends { name: string }>(
  npcs: T[],
  appearingNpcs: string[],
  location: string,
  date: string,
): T[] {
  if (appearingNpcs.length === 0) return npcs;

  let changed = false;
  const next = npcs.map(npc => {
    if (!isNpcOnStage(npc.name, appearingNpcs)) return npc;
    changed = true;
    return { ...npc, location, lastSeenLocation: location, lastSeenDate: date };
  });
  return changed ? next : npcs;
}
