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
/**
 * NPC 名稱正規化（同 itemCatalog 的 `normalizeItemName`）。
 *
 * 全部的 NPC 指令都以**名字**當比對鍵，先前各處寫法不一致：`NPC_THOUGHT` 會
 * `npcName.trim()`，`AFFINITY` / `NPC_NEW` / `NPC_HOME` 則是裸的 `===`。
 *
 * 指令那一側其實還好——`parseKV` 已經把值 trim 過了。真正對不上的是**沒有經過
 * 指令解析**的名字：玩家在角色卡標題手打的、`npcImport` 從 JSON 檔帶進來的、
 * 以及舊存檔裡本來就有的。那些名字只要多一個空白，之後所有指令都再也比不中
 * 那個角色，而畫面上兩個名字長得一模一樣，玩家完全看不出差別。
 *
 * 另外 `trim()` 管不到**中間**的空白：半形空白與全形空白（U+3000）夾在名字中間時，
 * 「凱爾 溫德」會是兩個不同的鍵。
 *
 * 半形／全形空白一律收斂成單一半形空白，前後空白去掉。
 */
export function normalizeNpcName(name: string): string {
  return (name || '').replace(/[\s\u3000]+/g, ' ').trim();
}

/** 兩個名字是否指同一個人（正規化後完全相等） */
export function isSameNpcName(a: string, b: string): boolean {
  const na = normalizeNpcName(a);
  return !!na && na === normalizeNpcName(b);
}

export function findNpcLore(
  entries: LorebookEntry[] | undefined | null,
  name: string,
): LorebookEntry | undefined {
  if (!entries || !name) return undefined;
  return entries.find(e => e.category === 'NPC' && isSameNpcName(e.title, name));
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

/** `[其他已知角色]` 名冊一次最多列幾個（同 itemCatalog 的 KNOWN_ITEMS_PROMPT_LIMIT） */
export const KNOWN_NPCS_PROMPT_LIMIT = 40;

/**
 * 「這個世界已經有誰」的名冊，供 prompt 引導 AI **沿用既有角色**而非另造一個。
 *
 * 玩家回報：「GM AI 讀到了故事集裡的人物，但名字會搞錯。有時出現同樣設定但
 * 不同名的 NPC。」成因是整條 NPC 注入鏈都以**地點**為軸——`npcCandidates` 只收
 * `homeLocation === 當前地點` 的人，所以玩家站在月湖鎮時，住在迷霧森林的獵人
 * 芬里爾對模型而言**根本不存在**。劇情需要一個獵人，它就照著同一套設定
 * 造一個「洛恩」出來。
 *
 * 這與道具的同義新名是同一個問題，解法也照抄 `[已知物品]`：把名字攤開給模型看，
 * 並在指令說明裡要求沿用完全相同的名稱。差別是道具只需要名字（定義在圖鑑裡），
 * 角色還要一小段身分（性別・種族・職業）——否則模型看到一串名字，
 * 仍然不知道哪個是獵人。
 *
 * @param exclude 已經在別處完整注入的角色（候選名單／在場／隨行），不重複列出
 */
export function selectKnownNpcNames(
  entries: LorebookEntry[] | undefined | null,
  exclude: Set<string> = new Set(),
  limit: number = KNOWN_NPCS_PROMPT_LIMIT,
): string[] {
  if (!entries) return [];
  const excluded = new Set([...exclude].map(normalizeNpcName));
  return entries
    .filter(e => e.category === 'NPC' && e.isActive && !excluded.has(normalizeNpcName(e.title)))
    .slice(0, limit)
    .map(e => {
      const brief = npcIdentityBrief(e);
      return brief ? `${e.title}（${brief}）` : e.title;
    });
}
