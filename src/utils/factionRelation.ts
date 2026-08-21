import { Faction, FactionRelation } from '../types';

/**
 * 勢力關係的唯一寫入入口。
 *
 * 關係是**存在雙方身上的兩筆資料**，不是一筆。寫入時必須同時更新 A 與 B，
 * 漏掉一邊會讓關係圖只有單向箭頭、prompt 也只有一邊看得到對方。
 *
 * ⚠️ `vassal`（附庸）是**單向**的——「A 附庸於 B」不代表「B 附庸於 A」。
 * 其餘四種（同盟／敵對／競爭／中立）是對稱關係，雙向寫入。
 *
 * 抽成純函數是因為有兩個呼叫端：AI 的 `FACTION_RELATION` 指令，以及故事集的
 * 手動編輯。這兩邊若各寫一套，遲早會出現「AI 設的是雙向、玩家設的是單向」
 * 這種只有在特定劇情才會浮現的分歧。
 */
export function setFactionRelation(
  factions: Faction[],
  aId: number,
  bId: number,
  type: FactionRelation['type'],
  note?: string,
): Faction[] {
  if (aId === bId) return factions;                       // 不能跟自己建立關係
  const a = factions.find(f => f.id === aId);
  const b = factions.find(f => f.id === bId);
  if (!a || !b) return factions;

  // 先清掉兩邊既有的對彼此關係，再寫入新的——同一組勢力之間只留一種關係
  const relA = (a.relations ?? []).filter(r => r.targetFactionId !== bId);
  relA.push({ targetFactionId: bId, type, ...(note ? { note } : {}) });

  const relB = (b.relations ?? []).filter(r => r.targetFactionId !== aId);
  if (type !== 'vassal') {
    relB.push({ targetFactionId: aId, type, ...(note ? { note } : {}) });
  }

  return factions.map(f => {
    if (f.id === aId) return { ...f, relations: relA };
    if (f.id === bId) return { ...f, relations: relB };
    return f;
  });
}

/** 解除兩個勢力之間的關係（兩邊一起清，避免留下單向殘骸） */
export function removeFactionRelation(
  factions: Faction[],
  aId: number,
  bId: number,
): Faction[] {
  return factions.map(f => {
    if (f.id !== aId && f.id !== bId) return f;
    const other = f.id === aId ? bId : aId;
    const rels = (f.relations ?? []).filter(r => r.targetFactionId !== other);
    return { ...f, relations: rels };
  });
}
