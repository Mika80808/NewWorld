/**
 * npcImport.ts — 批次匯入 NPC 的純函數層
 *
 * 「把 NPC 加進遊戲」不等於「寫進設定集」：NPC_NEW 指令同時建立
 *   1. npcs[]           — 執行狀態（好感度、記憶庫、釘選、足跡）
 *   2. lorebookEntries  — 設定集條目（注入 prompt 用的靜態設定）
 * 只建其中一份的話，角色會沒有好感度、開不了記憶庫，或是根本不進 prompt。
 * 這裡刻意比照 commandReducer 的 NPC_NEW 行為，兩份一起建。
 *
 * 同名衝突採「先寫先贏」，與道具圖鑑（itemCatalog）一致：既有角色原封不動，
 * 匯入的那筆整筆跳過。玩家累積的好感度與記憶不會被一次匯入洗掉。
 */
import { Npc, NpcMemory, LorebookEntry, Faction } from '../types';

/** 匯入檔的單筆角色。除 name 外全部選填。 */
export interface ImportedNpc {
  name: string;
  gender?: string;
  race?: string;
  age?: string;
  job?: string;
  appearance?: string;
  personality?: string;
  backstory?: string;
  other?: string;
  /** 對玩家的關係描述，優先於好感度推導的標籤 */
  relationship?: string;
  affection?: number;
  homeLocation?: string;
  roamLocations?: string[];
  isPinned?: boolean;
  /** 角色記憶，純字串陣列；好感度 ≥ 60 才會注入 prompt */
  memories?: string[];
  /**
   * 所屬勢力，存**名稱**不是 id。
   * factionIds 是各存檔自己編的流水號，跨檔匯入必然對不上；用名稱才能來回。
   * 匯入時比對現有勢力名稱，對不到的直接丟棄（本功能不建立新勢力）。
   */
  factions?: string[];
}

export interface ParseResult {
  npcs: ImportedNpc[];
  /** 逐筆的格式問題；有 errors 不代表整份失敗，只有那幾筆被丟棄 */
  errors: string[];
}

export interface MergeResult {
  npcs: Npc[];
  lorebookEntries: LorebookEntry[];
  addedNames: string[];
  skippedNames: string[];
  /** 匯入檔提到、但這個存檔裡不存在的勢力名稱（已去重） */
  unknownFactions: string[];
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

const strArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(str).filter(Boolean) : [];

/**
 * 解析匯入檔。容忍三種外層形狀：
 *   1. { "npcs": [...] }   ← 匯出範本的格式
 *   2. [...]               ← 直接一個陣列
 *   3. { ... }             ← 單一角色物件
 * 存檔 JSON（含 npcs 欄位）也會被第 1 種接住，等於順手支援「從舊存檔撈角色」。
 */
export function parseNpcImport(raw: unknown): ParseResult {
  const errors: string[] = [];

  let list: unknown[];
  if (Array.isArray(raw)) {
    list = raw;
  } else if (raw && typeof raw === 'object') {
    const maybe = (raw as Record<string, unknown>).npcs;
    if (Array.isArray(maybe)) list = maybe;
    else if ('name' in (raw as object)) list = [raw];
    else return { npcs: [], errors: ['找不到角色資料：需要 { "npcs": [...] } 或直接一個陣列'] };
  } else {
    return { npcs: [], errors: ['檔案不是有效的 JSON 物件或陣列'] };
  }

  const npcs: ImportedNpc[] = [];
  const seen = new Set<string>();

  list.forEach((item, i) => {
    if (!item || typeof item !== 'object') {
      errors.push(`第 ${i + 1} 筆不是物件，已略過`);
      return;
    }
    const o = item as Record<string, unknown>;
    const name = str(o.name);
    if (!name) {
      errors.push(`第 ${i + 1} 筆缺少 name，已略過`);
      return;
    }
    // 同一份檔案內重複的名字也走先寫先贏，否則後面的會覆蓋前面的
    if (seen.has(name)) {
      errors.push(`第 ${i + 1} 筆「${name}」在檔案內重複，已略過`);
      return;
    }
    seen.add(name);

    // 好感度沿用 AFFINITY 的下限（-100），上限不設——HP/MP 無上限是既有設計
    const rawAffection = typeof o.affection === 'number' && Number.isFinite(o.affection)
      ? Math.max(-100, Math.round(o.affection))
      : 0;

    npcs.push({
      name,
      gender: str(o.gender),
      race: str(o.race),
      age: str(o.age),
      job: str(o.job),
      appearance: str(o.appearance),
      personality: str(o.personality),
      backstory: str(o.backstory),
      other: str(o.other),
      relationship: str(o.relationship),
      affection: rawAffection,
      homeLocation: str(o.homeLocation),
      // 滑動窗口上限 3，與 lorebook 的 roamLocations 一致
      roamLocations: strArray(o.roamLocations).slice(0, 3),
      isPinned: o.isPinned === true,
      memories: strArray(o.memories),
      factions: strArray(o.factions),
    });
  });

  return { npcs, errors };
}

/**
 * 合併進現有狀態。同名（與 npcs[] 或設定集 NPC 條目任一撞名）整筆跳過。
 *
 * 無任何新增時回傳原本的 npcs / lorebookEntries reference，讓呼叫端能跳過
 * setState 與雲端上傳。
 */
export function mergeImportedNpcs(
  imported: ImportedNpc[],
  existingNpcs: Npc[],
  existingLorebook: LorebookEntry[],
  gameDate: string,
  existingFactions: Faction[] = [],
  now: number = Date.now(),
): MergeResult {
  const takenNames = new Set<string>([
    ...existingNpcs.map(n => n.name),
    ...existingLorebook.filter(e => e.category === 'NPC').map(e => e.title),
  ]);

  // 勢力以名稱比對，對不到的收集起來回報，不靜默丟掉
  const factionByName = new Map(existingFactions.map(f => [f.name, f.id]));
  const unknownFactions = new Set<string>();

  const addedNames: string[] = [];
  const skippedNames: string[] = [];
  const newNpcs: Npc[] = [];
  const newEntries: LorebookEntry[] = [];

  let nextNpcId = Math.max(0, ...existingNpcs.map(n => n.id)) + 1;
  let nextLoreId = Math.max(0, ...existingLorebook.map(e => e.id)) + 1;

  for (const src of imported) {
    if (takenNames.has(src.name)) {
      skippedNames.push(src.name);
      continue;
    }
    takenNames.add(src.name);
    addedNames.push(src.name);

    const factionIds: number[] = [];
    for (const fname of src.factions ?? []) {
      const id = factionByName.get(fname);
      if (id === undefined) unknownFactions.add(fname);
      else if (!factionIds.includes(id)) factionIds.push(id);
    }

    const memories: NpcMemory[] = (src.memories ?? []).map((text, i) => ({
      // id 內嵌時間戳，與 NPC_THOUGHT 產生的記憶格式一致
      id: `nmem_${now + i}_${Math.random().toString(36).slice(2, 8)}`,
      text,
      createdAt: gameDate,
      source: 'manual',
      importance: 'normal',
    }));

    newNpcs.push({
      id: nextNpcId++,
      name: src.name,
      job: src.job ?? '',
      affection: src.affection ?? 0,
      appearance: src.appearance ?? '',
      personality: src.personality ?? '',
      gender: src.gender,
      race: src.race,
      age: src.age,
      backstory: src.backstory,
      other: src.other,
      relationship: src.relationship || undefined,
      location: src.homeLocation || undefined,
      isPinned: src.isPinned,
      category: '登場人物',
      isActive: true,
      memories,
      factionIds: factionIds.length > 0 ? factionIds : undefined,
    });

    newEntries.push({
      id: nextLoreId++,
      title: src.name,
      content: `${src.name}（${src.job ?? ''}）`,
      category: 'NPC',
      isActive: true,
      gender: src.gender,
      race: src.race,
      age: src.age,
      job: src.job,
      appearance: src.appearance,
      personality: src.personality,
      backstory: src.backstory,
      other: src.other,
      homeLocation: src.homeLocation || undefined,
      roamLocations: src.roamLocations?.length ? src.roamLocations : undefined,
    });
  }

  if (addedNames.length === 0) {
    return {
      npcs: existingNpcs, lorebookEntries: existingLorebook,
      addedNames, skippedNames, unknownFactions: [...unknownFactions],
    };
  }

  return {
    npcs: [...existingNpcs, ...newNpcs],
    lorebookEntries: [...existingLorebook, ...newEntries],
    addedNames,
    skippedNames,
    unknownFactions: [...unknownFactions],
  };
}

/**
 * 匯出成與匯入相同的格式，可以來回。
 *
 * 欄位優先取設定集條目、退回 npcs[]——這與 NpcModal 的顯示規則一致
 * （`lore?.x ?? npc.x`）。只讀 npcs[] 的話，玩家在設定集裡編輯過的內容會匯不出來。
 * 空字串與空陣列一律省略，讓匯出的檔案不要塞滿無意義的 ""。
 */
export function buildNpcExport(
  npcs: Npc[],
  lorebookEntries: LorebookEntry[],
  factions: Faction[] = [],
): { npcs: ImportedNpc[] } {
  const loreByTitle = new Map(
    lorebookEntries.filter(e => e.category === 'NPC').map(e => [e.title, e])
  );
  const factionById = new Map(factions.map(f => [f.id, f.name]));

  return {
    npcs: npcs.map(n => {
      const lore = loreByTitle.get(n.name);
      const pick = (a?: string, b?: string) => (a ?? b ?? '').trim();

      const out: ImportedNpc = { name: n.name };
      // 只涵蓋字串欄位，避免用 Record<string, unknown> 斷言把型別檢查繞掉
      type StrKey = 'gender' | 'race' | 'age' | 'job' | 'appearance'
        | 'personality' | 'backstory' | 'other' | 'relationship' | 'homeLocation';
      const put = (k: StrKey, v: string) => { if (v) out[k] = v; };

      put('gender', pick(lore?.gender, n.gender));
      put('race', pick(lore?.race, n.race));
      put('age', pick(lore?.age, n.age));
      put('job', pick(lore?.job, n.job));
      put('appearance', pick(lore?.appearance, n.appearance));
      put('personality', pick(lore?.personality, n.personality));
      put('backstory', pick(lore?.backstory, n.backstory));
      put('other', pick(lore?.other, n.other));
      put('relationship', pick(n.relationship, ''));
      put('homeLocation', pick(lore?.homeLocation, n.location));

      if (n.affection) out.affection = n.affection;
      if (n.isPinned) out.isPinned = true;

      const roam = lore?.roamLocations ?? [];
      if (roam.length > 0) out.roamLocations = roam;

      // 已融合（isMerged）的是舊記錄的封存，匯出只帶現行的
      const mems = (n.memories ?? []).filter(m => !m.isMerged).map(m => m.text).filter(Boolean);
      if (mems.length > 0) out.memories = mems;

      const fnames = (n.factionIds ?? [])
        .map(id => factionById.get(id))
        .filter((v): v is string => Boolean(v));
      if (fnames.length > 0) out.factions = fnames;

      return out;
    }),
  };
}

/** 匯出範本：讓玩家（或請 AI）照著填 */
export const NPC_IMPORT_TEMPLATE: { npcs: ImportedNpc[] } = {
  npcs: [
    {
      name: '芬里爾',
      gender: '男',
      race: '精靈',
      age: '約 120 歲',
      job: '獵人',
      appearance: '銀髮高挑，左眼下方有一道舊疤',
      personality: '冷靜寡言，不輕易信任外人，但一旦認可就極為忠誠',
      backstory: '出身黑牙氏族，因拒絕族內的獵殺令而離開，如今獨自住在迷霧森林邊緣。',
      other: '隨身帶著一把祖傳獵弓',
      relationship: '',
      affection: 0,
      homeLocation: '迷霧森林',
      roamLocations: ['月湖鎮'],
      isPinned: false,
      memories: [],
    },
    {
      name: '萊尼',
      job: '酒館老闆娘',
      appearance: '紅髮盤起，圍裙上總有酒漬',
      personality: '爽朗健談，消息靈通',
      homeLocation: '月湖鎮',
    },
  ],
};
