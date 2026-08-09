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
