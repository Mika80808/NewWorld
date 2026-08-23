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
import { Npc, NpcMemory, LorebookEntry, Faction, FactionRelation } from '../types';

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

/**
 * 匯入檔的單筆勢力定義。
 *
 * 為什麼要一起帶：NPC 的勢力歸屬存的是**名稱**，而匯入端原本只做「比對現有勢力」，
 * 目標存檔沒有同名勢力時就只回報「查無勢力」——角色進得去，勢力關係整段掉。
 * 帶上定義後，缺的勢力可以連同關係一起建起來。
 *
 * 同樣不存 id：`homeId`（設定集地點 id）與 `relations[].targetFactionId` 都是
 * 各存檔自己編的流水號，跨檔必然對不上，一律改存名稱。
 */
export interface ImportedFactionRelation {
  /** 對象勢力的**名稱** */
  target: string;
  type: FactionRelation['type'];
  note?: string;
}

export interface ImportedFaction {
  name: string;
  type?: Faction['type'];
  description?: string;
  color?: string;
  /** 大本營所在地點的**名稱**（對應設定集的地點條目標題） */
  homeLocation?: string;
  relations?: ImportedFactionRelation[];
}

export interface ParseResult {
  npcs: ImportedNpc[];
  /** 檔案帶的勢力定義；舊的匯出檔沒有這一段，會是空陣列 */
  factions: ImportedFaction[];
  /** 逐筆的格式問題；有 errors 不代表整份失敗，只有那幾筆被丟棄 */
  errors: string[];
}

export interface FactionMergeResult {
  factions: Faction[];
  /** 這次新建立的勢力名稱 */
  addedNames: string[];
  /** 已存在而沿用既有定義的勢力名稱（先寫先贏，不覆蓋玩家現有設定） */
  skippedNames: string[];
  /** 對象查無而丟棄的關係，格式為「A → B」 */
  unresolvedRelations: string[];
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

const FACTION_TYPES: Faction['type'][] = ['race', 'guild', 'nation', 'religion', 'criminal', 'other'];
const RELATION_TYPES: FactionRelation['type'][] = ['ally', 'enemy', 'neutral', 'vassal', 'rival'];

/**
 * 解析檔案帶的勢力定義。缺 name 的整筆丟棄，其餘欄位比照 NPC 一律容錯：
 * 認不得的 type 退回 'other'（丟掉整筆勢力太粗暴，type 只影響 UI 分類圖示），
 * 但認不得的關係 type 是**丟棄那條關係**——關係圖上畫錯線比少一條線更難察覺。
 */
function parseFactions(raw: unknown, errors: string[]): ImportedFaction[] {
  if (!Array.isArray(raw)) return [];

  const out: ImportedFaction[] = [];
  const seen = new Set<string>();

  raw.forEach((item, i) => {
    if (!item || typeof item !== 'object') {
      errors.push(`勢力第 ${i + 1} 筆不是物件，已略過`);
      return;
    }
    const o = item as Record<string, unknown>;
    const name = str(o.name);
    if (!name) {
      errors.push(`勢力第 ${i + 1} 筆缺少 name，已略過`);
      return;
    }
    if (seen.has(name)) {
      errors.push(`勢力第 ${i + 1} 筆「${name}」在檔案內重複，已略過`);
      return;
    }
    seen.add(name);

    const type = FACTION_TYPES.find(t => t === o.type) ?? 'other';

    const relations: ImportedFactionRelation[] = [];
    if (Array.isArray(o.relations)) {
      for (const r of o.relations) {
        if (!r || typeof r !== 'object') continue;
        const rel = r as Record<string, unknown>;
        const target = str(rel.target);
        const relType = RELATION_TYPES.find(t => t === rel.type);
        if (!target || !relType) {
          errors.push(`勢力「${name}」有一條關係缺少 target 或 type 無效，已略過`);
          continue;
        }
        relations.push({ target, type: relType, ...(str(rel.note) ? { note: str(rel.note) } : {}) });
      }
    }

    out.push({
      name,
      type,
      description: str(o.description),
      color: str(o.color),
      homeLocation: str(o.homeLocation),
      relations,
    });
  });

  return out;
}

/**
 * 解析匯入檔。容忍三種外層形狀：
 *   1. { "npcs": [...] }   ← 匯出範本的格式
 *   2. [...]               ← 直接一個陣列
 *   3. { ... }             ← 單一角色物件
 * 存檔 JSON（含 npcs 欄位）也會被第 1 種接住，等於順手支援「從舊存檔撈角色」。
 */
export function parseNpcImport(raw: unknown): ParseResult {
  const errors: string[] = [];

  // 勢力定義只可能出現在物件外層；裸陣列與單一角色物件沒有這一段
  const factions = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? parseFactions((raw as Record<string, unknown>).factions, errors)
    : [];

  let list: unknown[];
  if (Array.isArray(raw)) {
    list = raw;
  } else if (raw && typeof raw === 'object') {
    const maybe = (raw as Record<string, unknown>).npcs;
    if (Array.isArray(maybe)) list = maybe;
    else if ('name' in (raw as object)) list = [raw];
    else return { npcs: [], factions, errors: ['找不到角色資料：需要 { "npcs": [...] } 或直接一個陣列'] };
  } else {
    return { npcs: [], factions: [], errors: ['檔案不是有效的 JSON 物件或陣列'] };
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

  return { npcs, factions, errors };
}

/**
 * 把檔案帶的勢力定義併進現有勢力，回傳合併後的清單。
 *
 * 呼叫順序是「先合勢力、再合角色」：把這裡的結果當成 `mergeImportedNpcs` 的
 * `existingFactions` 傳進去，角色的 `factions: ["名稱"]` 才對得到這次新建的勢力。
 *
 * 同名先寫先贏，與角色一致——既有勢力原封不動，連 description／color／關係都不覆蓋。
 * 玩家自己調過的顏色與關係圖不該被一次匯入洗掉。
 *
 * 無任何新增時回傳原本的 reference，讓呼叫端能跳過 setState 與雲端上傳。
 */
export function mergeImportedFactions(
  imported: ImportedFaction[],
  existingFactions: Faction[],
  lorebookEntries: LorebookEntry[] = [],
): FactionMergeResult {
  const byName = new Map(existingFactions.map(f => [f.name, f]));
  const addedNames: string[] = [];
  const skippedNames: string[] = [];
  const unresolvedRelations: string[] = [];
  const created: Faction[] = [];

  let nextId = Math.max(0, ...existingFactions.map(f => f.id)) + 1;

  // 大本營以地點名稱比對設定集；查無時留空，不順手建立地點條目
  //（匯入角色不該偷偷長出新地圖點位）
  const locationIdByTitle = new Map(
    lorebookEntries.filter(e => e.category === '地點').map(e => [e.title, e.id])
  );

  // 第一輪只建立勢力本身：關係要等所有名字都有 id 之後才解得開，
  // 否則檔案裡「A 與 B 為敵」寫在 B 之前時就會解析失敗
  for (const src of imported) {
    if (byName.has(src.name)) {
      skippedNames.push(src.name);
      continue;
    }
    const homeId = src.homeLocation ? locationIdByTitle.get(src.homeLocation) : undefined;
    const f: Faction = {
      id: nextId++,
      name: src.name,
      type: src.type ?? 'other',
      description: src.description ?? '',
      isActive: true,
      // color 留空是安全的：UI 兩處（設定集卡片、地圖關係圖）都會退回調色盤自動指派
      ...(src.color ? { color: src.color } : {}),
      ...(homeId != null ? { homeId } : {}),
    };
    byName.set(f.name, f);
    created.push(f);
    addedNames.push(f.name);
  }

  // 第二輪解析關係。只寫進這次新建的勢力——既有勢力比照先寫先贏不動它，
  // 否則匯入會偷改玩家已經畫好的關係圖
  for (const src of imported) {
    const self = byName.get(src.name);
    if (!self || !created.includes(self)) continue;

    const relations: FactionRelation[] = [];
    for (const rel of src.relations ?? []) {
      const target = byName.get(rel.target);
      if (!target) {
        unresolvedRelations.push(`${src.name} → ${rel.target}`);
        continue;
      }
      if (target.id === self.id) continue; // 自己對自己，無意義
      relations.push({
        targetFactionId: target.id,
        type: rel.type,
        ...(rel.note ? { note: rel.note } : {}),
      });
    }
    if (relations.length > 0) self.relations = relations;
  }

  if (created.length === 0) {
    return { factions: existingFactions, addedNames, skippedNames, unresolvedRelations };
  }
  return { factions: [...existingFactions, ...created], addedNames, skippedNames, unresolvedRelations };
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

    // 只建執行狀態。身分欄位寫進下面的設定集條目——那是唯一來源（schema v10）
    newNpcs.push({
      id: nextNpcId++,
      name: src.name,
      affection: src.affection ?? 0,
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
): { factions?: ImportedFaction[]; npcs: ImportedNpc[] } {
  const loreByTitle = new Map(
    lorebookEntries.filter(e => e.category === 'NPC').map(e => [e.title, e])
  );
  const factionById = new Map(factions.map(f => [f.id, f.name]));
  const locationTitleById = new Map(
    lorebookEntries.filter(e => e.category === '地點').map(e => [e.id, e.title])
  );

  // 勢力整份帶走，不只帶「這批角色有歸屬的那幾個」——關係是勢力之間互指的，
  // 篩掉沒人歸屬的那些會讓指向它們的關係在匯入端全部解不開
  const exportedFactions: ImportedFaction[] = factions.map(f => {
    const out: ImportedFaction = { name: f.name, type: f.type };
    if (f.description) out.description = f.description;
    if (f.color) out.color = f.color;
    const home = f.homeId != null ? locationTitleById.get(f.homeId) : undefined;
    if (home) out.homeLocation = home;
    const rels = (f.relations ?? [])
      .map(r => {
        const target = factionById.get(r.targetFactionId);
        return target ? { target, type: r.type, ...(r.note ? { note: r.note } : {}) } : null;
      })
      .filter((r): r is ImportedFactionRelation => r !== null);
    if (rels.length > 0) out.relations = rels;
    return out;
  });

  return {
    // 沒有勢力時整個欄位省略，維持舊檔案的樣子
    ...(exportedFactions.length > 0 ? { factions: exportedFactions } : {}),
    npcs: npcs.map(n => {
      const lore = loreByTitle.get(n.name);
      const pick = (a?: string, b?: string) => (a ?? b ?? '').trim();

      const out: ImportedNpc = { name: n.name };
      // 只涵蓋字串欄位，避免用 Record<string, unknown> 斷言把型別檢查繞掉
      type StrKey = 'gender' | 'race' | 'age' | 'job' | 'appearance'
        | 'personality' | 'backstory' | 'other' | 'relationship' | 'homeLocation';
      const put = (k: StrKey, v: string) => { if (v) out[k] = v; };

      // 身分欄位只從設定集條目取——schema v10 起 Npc 上沒有這些欄位了
      put('gender', pick(lore?.gender));
      put('race', pick(lore?.race));
      put('age', pick(lore?.age));
      put('job', pick(lore?.job));
      put('appearance', pick(lore?.appearance));
      put('personality', pick(lore?.personality));
      put('backstory', pick(lore?.backstory));
      put('other', pick(lore?.other));
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

/**
 * 匯出範本：讓玩家（或請 AI）照著填。
 *
 * 刻意示範**完整**欄位（含 factions 區塊），與 buildNpcExport 的輸出同一份格式。
 * 範本少了哪個欄位，照著填的人就不會知道那個欄位存在——`factions` 過去就是這樣，
 * 匯出檔有、範本沒有，看起來像兩種格式。
 */
export const NPC_IMPORT_TEMPLATE: { factions: ImportedFaction[]; npcs: ImportedNpc[] } = {
  factions: [
    {
      name: '黑牙氏族',
      type: 'race',
      description: '盤據東境森林的狼族氏族，重視武力與榮譽。',
      homeLocation: '黑牙氏族',
      relations: [{ target: '獵人公會', type: 'rival', note: '每年一次的切磋決鬥' }],
    },
    {
      name: '獵人公會',
      type: 'guild',
      description: '月湖鎮最大的公會，負責發派討伐與護衛任務。',
      homeLocation: '月湖鎮',
    },
  ],
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
      memories: ['第一次見面時借給你一支箭'],
      factions: ['黑牙氏族'],
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
