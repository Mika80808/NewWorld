import { Npc, LorebookEntry } from '../types';

/**
 * NPC 的靜態設定欄位（性別／種族／職業⋯）解析入口。
 *
 * 為什麼要有這支：同一份資料存在兩個地方——`Npc`（好感度／記憶庫那份）與
 * 設定集的 NPC 條目（`LorebookEntry`）。過去 UI 與 promptBuilder 各自解析：
 *
 * - `NpcModal` 顯示時會 fallback 到 `Npc.gender`
 * - `promptBuilder` 只讀 `LorebookEntry.gender`，不 fallback
 *
 * 結果是玩家在角色卡上看到「女」，AI 拿到的卻是空字串，於是自己編一個性別。
 * 兩邊一律改走這裡，確保「玩家看到的」等於「AI 讀到的」。
 *
 * ⚠️ 用 `||` 而非 `??`：空字串要視為「沒填」往下退。`handleAddNpc` 建立的
 * 設定集條目每個欄位都是 `''`，用 `??` 的話會停在空字串、永遠退不到 `Npc` 那份。
 */
export interface NpcProfile {
  gender: string;
  race: string;
  age: string;
  job: string;
  appearance: string;
  personality: string;
  backstory: string;
  /** 備註：只有在 race 另有其值時才有意義（race 未填時 other 會被當成種族用） */
  other: string;
}

const pick = (...vals: (string | undefined | null)[]): string => {
  for (const v of vals) {
    if (typeof v === 'string' && v.trim() !== '') return v;
  }
  return '';
};

export function resolveNpcProfile(
  npc?: Npc | null,
  lore?: LorebookEntry | null,
): NpcProfile {
  // 舊資料把種族寫在 other，故 race 未填時退到 other
  const race = pick(lore?.race, lore?.other, npc?.race, npc?.other);
  return {
    gender:      pick(lore?.gender, npc?.gender),
    race,
    age:         pick(lore?.age, npc?.age),
    job:         pick(lore?.job, npc?.job),
    appearance:  pick(lore?.appearance, npc?.appearance),
    personality: pick(lore?.personality, npc?.personality),
    backstory:   pick(lore?.backstory, npc?.backstory),
    other:       pick(lore?.race) ? pick(lore?.other) : '',
  };
}

/**
 * 候選名單用的一行身分描述：`性別・種族・職業`。
 *
 * Phase 1 的候選名單先前只給「名字（職業）」，AI 在角色**首次登場那一回合**
 * 完全不知道對方性別——完整資料要等它輸出 `[出場:名字]` 之後的下一輪才注入。
 * 於是它自己猜，猜錯就寫進對話歷史，之後即使拿到正確性別也會為了前後一致
 * 繼續錯下去。性別／種族只多幾個字，值得放進 Phase 1。
 */
export function npcIdentityBrief(npc?: Npc | null, lore?: LorebookEntry | null): string {
  const p = resolveNpcProfile(npc, lore);
  return [p.gender, p.race, p.job].filter(Boolean).join('・');
}
