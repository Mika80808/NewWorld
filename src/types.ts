export interface TimeState {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weather: string;
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
  status?: string;
}

export interface Quest {
  id: string;
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

// ─── NPC 記憶庫條目 ───────────────────────────────────────────────────────────
export interface NpcMemory {
  id: string;                                         // `nmem_${Date.now()}_${random}`
  text: string;                                       // 記憶內容
  createdAt: string;                                  // 遊戲內時間，例如 '4/15'
  source: 'manual' | 'pre_merge' | 'merged';
  // manual    = 玩家手動輸入
  // pre_merge = thoughts 自動串接後寫入（尚未 AI 融合的原始記錄）
  // merged    = Sub GM AI 融合後的摘要產物
  importance: 'core' | 'normal';
  // core   = 永遠注入 prompt，不受截斷規則影響
  // normal = 依截斷規則（最近 5 則，超出 300 字縮減到 3 則）
  isMerged?: boolean;                                 // 已被 AI 融合，保留但不注入 prompt
  mergedFrom?: string[];                              // 融合來源的 id 陣列
  isNew?: boolean;                                    // 剛融合產生，尚未被玩家讀取，NpcModal 開啟後自動清除
}

export interface Npc {
  id: number;
  name: string;
  job: string;
  affection: number;
  affectionLabel: string;
  appearance: string;
  personality: string;
  gender?: string;
  race?: string;
  age?: string;
  backstory?: string;
  other?: string;
  relationship?: string;
  location?: string;
  lastSeenLocation?: string;
  lastSeenDate?: string;
  thoughts?: { text: string; createdAt: string }[];
  category: string;
  isActive: boolean;
  isPinned?: boolean;
  memories: NpcMemory[];
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
}

export interface SystemPrompt {
  worldPremise: string;
  roleplayRules: string;
  writingStyle: string;
}

export interface DiaryEntry {
  id: number;
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
}

// ─── 裝備（穿戴型，無消耗）────────────────────────────────────────────────────
// 舊名：InventoryItem
export interface EquipmentItem {
  id: number;
  name: string;
  description: string;                // 裝備說明（防禦力、魔法屬性等）
  isEquipped: boolean;                // 是否正在穿戴
}

// ─── 道具（使用型，有數量）────────────────────────────────────────────────────
// 舊名：ConsumableItem（移除 effect 欄位，效果由 AI 敘事處理）
export interface ItemEntry {
  id: number;
  name: string;
  quantity: number;
  description: string;                // 道具說明，AI 使用時根據此說明生成劇情
}

// ─── 向下相容型別別名（舊存檔 migrate 用）────────────────────────────────────
// App.tsx / useGameStore.ts 讀取舊存檔時使用，新程式碼不應再引用這兩個型別
export type InventoryItem = EquipmentItem;
export type ConsumableItem = ItemEntry;

export interface Message {
  id: number;
  role: 'user' | 'assistant' | 'system';
  text: string;
  timestamp?: string;
}

// ─── GM 設定（不隨存檔匯出，單獨存於 localStorage）────────────────────────────
export interface GMConfig {
  provider: 'gemini';
  apiKey: string;
  model: string;
  maxTokens: number;
  lastSaved: string;   // ISO 時間字串，UI 顯示用
}

export interface SubGMConfig extends GMConfig {
  useSameKey: boolean; // true（預設）時使用主 GM 的 apiKey
}
