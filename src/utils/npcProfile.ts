import { LorebookEntry } from '../types';

/**
 * NPC 靜態設定（性別／種族／職業⋯）的**唯一讀取入口**。
 *
 * 這些欄位的唯一來源是設定集的 NPC 條目（`LorebookEntry`）。`Npc` 上只留
 * 執行狀態（好感度、記憶庫、足跡、釘選、勢力歸屬），見 types.ts 的說明。
 *
 * 這支存在的歷史：同一份資料原本存在兩個地方，UI 與 promptBuilder 各自解析，
 * `NpcModal` 會 fallback 到 `Npc.gender` 而 `promptBuilder` 不會——玩家在
 * 角色卡上看到「女」，AI 拿到的卻是空字串，於是自己編一個性別。
 * 當時先統一成這支入口（雙來源、lore 優先），現在連資料本身也收成一份。
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

/**
 * ⚠️ 用「非空字串」判斷而非 `??`：空字串要視為「沒填」往下退。
 * `handleAddNpc` 建立的設定集條目每個欄位都是 `''`。
 */
const pick = (...vals: (string | undefined | null)[]): string => {
  for (const v of vals) {
    if (typeof v === 'string' && v.trim() !== '') return v;
  }
  return '';
};

export function resolveNpcProfile(lore?: LorebookEntry | null): NpcProfile {
  // 舊資料把種族寫在 other，故 race 未填時退到 other
  const race = pick(lore?.race, lore?.other);
  return {
    gender:      pick(lore?.gender),
    race,
    age:         pick(lore?.age),
    job:         pick(lore?.job),
    appearance:  pick(lore?.appearance),
    personality: pick(lore?.personality),
    backstory:   pick(lore?.backstory),
    other:       pick(lore?.race) ? pick(lore?.other) : '',
  };
}

/**
 * 依角色名找設定集裡的 NPC 條目。
 *
 * 收成一支是因為這個查詢原本散落在 `NpcModal`、`SceneNpcsWidget`、
 * `promptBuilder` 等處各寫一份 `find(e => e.category === 'NPC' && e.title === name)`，
 * 條件一旦要改（例如支援別名）就得記得每一處都改。
 */
export function findNpcLore(
  entries: LorebookEntry[] | undefined | null,
  name: string,
): LorebookEntry | undefined {
  if (!entries || !name) return undefined;
  return entries.find(e => e.category === 'NPC' && e.title === name);
}

/**
 * 候選名單用的一行身分描述：`性別・種族・職業`。
 *
 * Phase 1 的候選名單先前只給「名字（職業）」，AI 在角色**首次登場那一回合**
 * 完全不知道對方性別——完整資料要等它輸出 `[出場:名字]` 之後的下一輪才注入。
 * 於是它自己猜，猜錯就寫進對話歷史，之後即使拿到正確性別也會為了前後一致
 * 繼續錯下去。性別／種族只多幾個字，值得放進 Phase 1。
 */
export function npcIdentityBrief(lore?: LorebookEntry | null): string {
  const p = resolveNpcProfile(lore);
  return [p.gender, p.race, p.job].filter(Boolean).join('・');
}
