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
  status?: StatusEffect[];  // 原 string 改為 StatusEffect 陣列
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
  npcIds?: number[];     // UI-managed member list (NPC ids)
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
}

export interface EquipmentItem {
  id: number;
  name: string;
  description: string;
  isEquipped: boolean;
}

export interface ItemEntry {
  id: number;
  name: string;
  quantity: number;
  description: string;
}

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
