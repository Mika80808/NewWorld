export interface TimeState {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weather: string;
}

// ─── 狀態異常 ──────────────────────────────────────────────────────────────────
export interface StatusEffect {
  id: string;          // `status_${Date.now()}_${random}`
  name: string;        // AI 自由命名，例如「中毒」「詛咒」
  emoji: string;       // AI 決定，例如「☠️」「🔥」
  duration: number;    // 回合數；-1 = 永久（直到手動移除）
}

export interface Profile {
  name: string;
  job: string;
  appearance: string;
  personality: string;
  other: string;
  hp: number;
  mp: number;
  gold: number;
  maxHp?: number;
  maxMp?: number;
  // 註：舊的 status 欄位已移除。狀態異常改存在頂層的 statusEffects state，
  // 而這個欄位在最後一次搬遷之後就沒有任何讀寫了——留著只會讓人以為它還有效，
  // 然後往裡面寫一份永遠不會被顯示、也不會進 prompt 的資料。
}

export interface Quest {
  id: string;
  /**
   * 給 AI 引用的三碼短 ID（`k3p`）。注入 prompt 時寫成 `#k3p`。
   *
   * 存在的理由是「引用比重打可靠」：AI 回報完成時抄這三碼，
   * 而不是重新打一次中文標題。舊存檔沒有這個欄位（schema v7 補上），
   * 所以比對端仍必須保留標題那條路，見 `utils/questMatch.findQuestByRef`。
   */
  shortId?: string;
  title: string;
  giver: string;
  description: string;
  reward: {
    gold?: number;
    items?: string[];
  };
  deadline?: number | null;
  status: 'active' | 'completed' | 'failed';
  isGoalMet: boolean;
  createdAt: string;
  createdAtTotalDays: number;
  completedAt?: string;
}

// ─── 勢力系統 ─────────────────────────────────────────────────────────────────
export interface FactionRelation {
  targetFactionId: number;
  type: 'ally' | 'enemy' | 'neutral' | 'vassal' | 'rival';
  note?: string;
}

export interface Faction {
  id: number;
  name: string;
  type: 'race' | 'guild' | 'nation' | 'religion' | 'criminal' | 'other';
  description: string;
  color?: string;        // hex，例如 '#7F77DD'，未設定時 UI 自動從調色盤指派
  isActive: boolean;
  homeId?: number;       // LorebookEntry.id of home location on map
  /**
   * @deprecated v5 起改以 Npc.factionIds 為唯一來源，載入時由 migrateV4toV5 摺除。
   * 型別留著只為了讓遷移程式能讀舊存檔，新程式碼一律不要讀寫這個欄位。
   */
  npcIds?: number[];
  relations?: FactionRelation[];
}

export interface NpcRelation {
  targetId: number | 'player';
  type: 'family' | 'ally' | 'rival' | 'enemy' | 'acquaintance' | 'romantic';
  note?: string;
}

// ─── NPC 記憶庫條目 ───────────────────────────────────────────────────────────
export interface NpcMemory {
  id: string;
  text: string;
  createdAt: string;
  source: 'manual' | 'pre_merge' | 'merged';
  importance: 'core' | 'normal';
  isMerged?: boolean;
  mergedFrom?: string[];
  isNew?: boolean;
}

/**
 * NPC 的**執行狀態**：好感度、記憶庫、足跡、釘選、勢力歸屬。
 *
 * ⚠️ 身分設定（性別／種族／年齡／職業／外貌／個性／背景／備註）**不在這裡**，
 * 唯一來源是設定集的 NPC 條目（`LorebookEntry`），讀取一律走
 * `utils/npcProfile.resolveNpcProfile()`。
 *
 * 先前這些欄位兩邊都有，而且 `NPC_NEW` 會在同一個區塊裡把同一份值寫進兩邊。
 * 但**角色卡的編輯只寫設定集那份**（`NpcModal` → `onUpdateLorebook`），
 * 所以 `Npc` 上的副本是「建檔時寫一次、之後永遠不再更新」——與舊的
 * `Npc.affectionLabel` 同一個病。schema v10 移除。
 */
export interface Npc {
  id: number;
  name: string;
  affection: number;
  relationship?: string;
  location?: string;
  lastSeenLocation?: string;
  lastSeenDate?: string;
  thoughts?: { text: string; createdAt: string }[];
  category: string;
  isActive: boolean;
  isPinned?: boolean;
  /**
   * 隨行同伴：這個角色**常駐在玩家身邊**，不綁定地點。
   *
   * 與 `isPinned` 是兩件事，不要合併：釘選只是把角色釘到右欄方便追蹤好感度，
   * 人可能還待在另一座城；隨行則是「他此刻就跟玩家站在一起」。
   *
   * 為 true 時：
   *   1. 無條件視為在場（`resolveOnStageNames`），不必等 AI 輸出 `[出場:]`，
   *      也不受 `[出場:]`（空＝現場無人）清空
   *   2. 完整設定無條件注入 prompt，不受地點候選名單與關鍵字門檻限制
   *   3. 足跡跟著玩家走（`updateNpcFootprints`）
   *
   * 少了這個旗標，常駐角色（引路者、契約精靈、隨行護衛）只進得了 `[Pinned NPCs]`
   * 那種「附帶資料」的位置，從不出現在「現在誰在場」的名單裡——模型於是把他寫成
   * 一個沒有身體的聲音／神諭，而不是走在旁邊的人。
   */
  isCompanion?: boolean;
  memories: NpcMemory[];
  factionIds?: number[];    // 可屬於多個勢力；空陣列或 undefined = 無歸屬
  relations?: NpcRelation[];
}

export interface LorebookEntry {
  id: number;
  title: string;
  content: string;
  category: string;
  isActive: boolean;
  gender?: string;
  race?: string;
  age?: string;
  backstory?: string;
  job?: string;
  appearance?: string;
  personality?: string;
  other?: string;
  keywords?: string[];
  secondaryKeys?: string[];
  selective?: boolean;
  insertionOrder?: number;
  homeLocation?: string;
  roamLocations?: string[];
  mapX?: number;
  mapY?: number;
  cartFare?: number;
  mapStatus?: 'heard' | 'known';
  adjacentTo?: string[];
  locationType?: 'town' | 'wilderness' | 'building';
  aliases?: string[];
}

export interface SystemPrompt {
  worldPremise: string;
  roleplayRules: string;
  writingStyle: string;
}

export interface DiaryEntry {
  id: number;
  title?: string;
  text: string;
  isActive: boolean;
  keywords: string[];
  source?: 'manual' | 'ai_generated' | 'merged';
  mergedFrom?: number[];
  isMerged?: boolean;
}

export interface MemoryEntry {
  id: string;
  type: 'world' | 'region' | 'scene' | 'npc';
  importance: 'critical' | 'normal' | 'flavor';
  content: string;
  tags: {
    locations: string[];
    npcs: string[];
    factions: string[];
    keywords: string[];
  };
  trigger: {
    scanDepth: number;
    probability: number;
    sticky: number;
    cooldown: number;
  };
  isActive: boolean;
  source: 'manual' | 'ai_generated';
  createdAt: string;
  expiresAt?: string;
  /**
   * 最後一次通過觸發判定的 epoch ms，供 pruneMemories 做 LRU 淘汰排序。
   * 舊存檔沒有這個欄位，淘汰時退回以 id 內嵌的建檔時間戳排序（見 memoryStore.ts）。
   * createdAt 是遊戲內日期字串（「4/15」），無法比大小，不能拿來排序。
   */
  lastTriggeredAt?: number;
}

/**
 * 背包與裝備都是**實例**：名稱引用 ＋ 數量／裝備狀態。
 *
 * ⚠️ 兩者都**沒有** description。說明只存在 `itemCatalog` 一份（Master Data），
 * 讀取一律走 `utils/itemCatalog.describeItem()`。
 *
 * 先前這裡各有一個 description 欄位，加上圖鑑共三份，而且沒有任何地方讀圖鑑——
 * 「先寫先贏、全遊戲描述一致」的保證因此只在建立那一刻成立。schema v9 移除。
 */
export interface EquipmentItem {
  id: number;
  name: string;
  isEquipped: boolean;
}

export interface ItemEntry {
  id: number;
  name: string;
  quantity: number;
}

// ─── 道具圖鑑（Master Data：定義全遊戲只存一份，背包 items[] 為實例） ──────────
export interface ItemDef {
  name: string;         // 主鍵（正規化後名稱），與 ItemCatalog 的 key 一致
  description: string;  // 先寫先贏：首次登錄的描述為準，後續同名 ITEM_ADD 沿用
  createdAt: string;    // 遊戲內日期（月/日）
  lastUsedAt: number;   // epoch ms，供 LOD 淘汰排序（最久未使用先淘汰）
}

export type ItemCatalog = Record<string, ItemDef>;

export type InventoryItem = EquipmentItem;
export type ConsumableItem = ItemEntry;

export interface Message {
  id: number;
  role: 'user' | 'assistant' | 'system';
  text: string;
  timestamp?: string;
}

export interface GMConfig {
  provider: 'gemini';
  apiKey: string;
  model: string;
  maxTokens: number;
  lastSaved: string;
}

export interface SubGMConfig extends GMConfig {
  useSameKey: boolean;
}
