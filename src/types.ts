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
  isGoalMet: boolean;           // 目標是否已達成（等待玩家回報）
  createdAt: string;
  createdAtTotalDays: number;
  completedAt?: string;
}

export interface Npc {
  id: number;
  name: string;
  job: string;
  affection: number;
  affectionLabel: string;
  appearance: string;
  personality: string;
  other?: string;
  relationship?: string;
  location?: string;
  lastSeenLocation?: string;
  lastSeenDate?: string;
  thoughts?: { text: string; createdAt: string }[];
  category: string;
  isActive: boolean;
  isPinned?: boolean;
  memories: string[];
}

export interface LorebookEntry {
  id: number;
  title: string;
  content: string;
  category: string;
  isActive: boolean;
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
  mapStatus?: 'discovered' | 'known';
  adjacentTo?: string[];
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

export interface InventoryItem {
  id: number;
  name: string;
  quantity: number;
  description: string;
}

export interface ConsumableItem {
  id: number;
  name: string;
  quantity: number;
  description: string;
  effect?: {
    hp?: number;
    mp?: number;
    gold?: number;
    status?: string;
  };
}

export interface Message {
  id: number;
  role: 'user' | 'assistant' | 'system';
  text: string;
  timestamp?: string;
}

export interface MapLocation {
  id: string;
  name: string;
  type: 'town' | 'city' | 'danger' | 'poi';
  x: number;
  y: number;
  desc: string;
  discovered?: boolean;
}

export interface DynamicLocation {
  id: string;
  name: string;
  location: string;
  desc: string;
  isPinned: boolean;
  discovered?: boolean;
}

export interface WorldMap {
  fixed: MapLocation[];
  dynamic: DynamicLocation[];
}
