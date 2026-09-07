/**
 * Command Parser — v1 Key=Value format
 *
 * 格式：COMMANDS v1 ... END_COMMANDS（或 <<COMMANDS>> ... <</COMMANDS>>）
 * 每行指令使用 Key=Value 具名參數，例如：
 *   STAT|field=hp|delta=-10
 *   ITEM_ADD|name=鐵劍|qty=1|desc=一把普通的劍
 *   STATUS_ADD|emoji=☠️|name=中毒|duration=3
 *
 * 無 header 的裸指令仍保留 legacy fallback 解析。
 * 未來升 v2 時在 parseCommandsToAST 入口加版本分流即可。
 */

import { MemoryEntry } from '../types';
import { normalizeWeather, WEATHER_VALUES } from './weather';

export const COMMANDS_VERSION = 'v1';

/**
 * 所有已知的指令名稱——**指令詞彙的唯一來源**。
 *
 * ⚠️ 這份清單原本存在三個地方各寫各的：這裡的 `extractBareCommands`、
 * `markdownParser` 的 `CMD_NAMES`、以及下方 `parseSingleCommand` 的 switch。
 * 前兩者一旦漏掉某個指令名，症狀是**靜默的**：
 *
 * - 漏在 `extractBareCommands`：COMMANDS 區塊格式跑掉而落到 fallback 時，
 *   那條指令直接消失。實際發生過——這裡原本只認 legacy 的 `TIME:` / `LOCATION:`
 *   冒號寫法，pipe 格式的 `TIME|delta=+45m` 一條都比不到，
 *   於是「模型把 `<<COMMANDS>>` 打成 `<<COMMANDS`」的那一輪，
 *   時間與地點完全沒有推進，而且沒有任何 log
 * - 漏在 `markdownParser`：那條指令會原封不動印在故事裡給玩家看
 *
 * 新增指令時只改這裡。
 */
export const COMMAND_NAMES = [
  'STAT', 'HP', 'MP', 'GOLD', 'AFFINITY', 'LOCATION', 'TIME', 'WEATHER',
  'ITEM_ADD', 'ITEM_REMOVE', 'ITEM_USE',
  'QUEST_ADD', 'QUEST_GOAL_MET', 'QUEST_COMPLETE',
  'NPC_NEW', 'NPC_HOME', 'NPC_LOCATION', 'NPC_THOUGHT',
  'NPC_RELATIONSHIP', 'NPC_RELATION',
  'LOCATION_DISCOVER', 'MEMORY_ADD',
  'STATUS_ADD', 'STATUS_REMOVE', 'STATUS_CLEAR',
  'FACTION_NEW', 'FACTION_JOIN', 'FACTION_RELATION',
] as const;

export interface CommandAST {
  type: string;
  raw: string;
  parsed: Record<string, unknown>;
}

export interface ParseResult {
  commands: CommandAST[];
  narrative: string;
}

// ─── Key=Value 解析工具 ───────────────────────────────────────────────────────

/**
 * 記憶的 type / importance 收斂（同 `STAT|field=` 的白名單、`WEATHER|value=` 的
 * 同義詞收斂）。
 *
 * 先前兩者都是裸的型別斷言（`(kv.type || 'scene') as ...`）——TypeScript 的
 * `as` 在執行期什麼都不做，`type=地區`、`importance=high` 會原封不動寫進存檔。
 * 而 promptBuilder 是按 `m.type === 'world' | 'region' | 'scene' | 'npc'` 分區注入、
 * 按 `importance` 分 critical / normal / flavor 截斷的：值對不上的記憶落在
 * 每一個桶子外面，**永遠不會被注入**，也不會被 pruneMemories 正確排序，
 * 而且沒有任何 log。玩家只會覺得「AI 忘了這件事」。
 *
 * 認得的同義詞一律收斂，認不得的退回預設值並 warn（不丟棄整條記憶——
 * 內容本身通常是對的，丟掉損失更大，同 `TIME|delta=` 缺單位的處理）。
 */
type MemoryType = MemoryEntry['type'];
const MEMORY_TYPE_ALIASES: Record<string, MemoryType> = {
  world: 'world', 世界: 'world', global: 'world',
  region: 'region', 區域: 'region', 地區: 'region', area: 'region',
  scene: 'scene', 場景: 'scene', location: 'scene', 地點: 'scene',
  npc: 'npc', 角色: 'npc', character: 'npc', 人物: 'npc',
};

function normalizeMemoryType(raw: string | undefined): MemoryType {
  const key = (raw || '').trim().toLowerCase();
  if (!key) return 'scene';
  const hit = MEMORY_TYPE_ALIASES[key];
  if (hit) return hit;
  console.warn(`[MEMORY_ADD] 未知的 type「${raw}」，改用 scene。`);
  return 'scene';
}

type MemoryImportance = MemoryEntry['importance'];
const MEMORY_IMPORTANCE_ALIASES: Record<string, MemoryImportance> = {
  critical: 'critical', 重要: 'critical', high: 'critical', major: 'critical',
  normal: 'normal', 一般: 'normal', medium: 'normal',
  flavor: 'flavor', 氛圍: 'flavor', low: 'flavor', minor: 'flavor',
};

function normalizeMemoryImportance(raw: string | undefined): MemoryImportance {
  const key = (raw || '').trim().toLowerCase();
  if (!key) return 'normal';
  const hit = MEMORY_IMPORTANCE_ALIASES[key];
  if (hit) return hit;
  console.warn(`[MEMORY_ADD] 未知的 importance「${raw}」，改用 normal。`);
  return 'normal';
}

/**
 * 數量解析：缺失、非數字、0 或負數一律退回 1。
 *
 * 舊寫法 `parseInt(kv.qty || '1') || 1` 看似等價，但負數是 truthy——
 * `qty=-3` 會原樣通過，ITEM_ADD 變成扣庫存、ITEM_REMOVE 變成加庫存。
 */
function parseQty(raw: string | undefined): number {
  const n = parseInt(raw ?? '');
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/**
 * 時間增量解析。支援 `+1h`、`30m`、`1h30m`、`2小時30分` 等寫法。
 *
 * 缺單位時（`delta=30`）**不丟棄**：TIME 是 prompt 明訂「每次回應必須輸出」的指令，
 * 舊版在此 `return null`，整條指令消失、遊戲時鐘直接停擺且毫無跡象。
 * 改為以分鐘解讀並警告——時鐘略偏遠好過完全不動。
 */
function parseTimeDelta(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;

  let minutes = 0;
  let hasUnit = false;

  const h = s.match(/(\d+)\s*(?:h|hr|hours?|小時|時)/i);
  if (h) { minutes += parseInt(h[1]) * 60; hasUnit = true; }

  const m = s.match(/(\d+)\s*(?:m|min|minutes?|分鐘|分)/i);
  if (m) { minutes += parseInt(m[1]); hasUnit = true; }

  if (!hasUnit) {
    const bare = s.match(/\d+/);
    if (!bare) return null;
    minutes = parseInt(bare[0]);
    console.warn(`[TIME] delta 缺少單位（"${raw}"），以 ${minutes} 分鐘解讀`);
  }

  return minutes > 0 ? minutes : null;
}

/**
 * 絕對時刻解析（`TIME|set=`）。支援 `07:00`、`7:00`、`7`、`7點`、`7點30分`，
 * 也容忍 AI 加上的「早上／下午／晚上」前綴——12 小時制在中文敘事裡很自然，
 * 而「下午3點」若被讀成 03:00 會把時鐘往回推一整個白天。
 *
 * 認不得回 `null`（呼叫端丟棄）。這裡與 `parseTimeDelta` 的寬容策略相反：
 * delta 猜錯只是時鐘略偏，set 猜錯是直接跳到錯誤的時刻，寧可不動。
 */
function parseClockTime(raw: string): { hour: number; minute: number } | null {
  const s = raw.trim();
  if (!s) return null;

  const pm = /下午|傍晚|晚上|夜裡|夜間|凌晨?後|p\.?m\.?/i.test(s);
  const am = /上午|早上|清晨|凌晨|a\.?m\.?/i.test(s);

  const m = s.match(/(\d{1,2})\s*(?::|點|时|時)?\s*(\d{1,2})?\s*分?/);
  if (!m) return null;

  let hour = parseInt(m[1]);
  const minute = m[2] !== undefined ? parseInt(m[2]) : 0;
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (minute > 59) return null;

  // 12 小時制換算。只在有明確前綴時動手——沒有前綴的 `set=15:00` 本來就是 24 小時制
  if (pm && hour < 12) hour += 12;
  if (am && hour === 12) hour = 0;

  if (hour > 23) return null;
  return { hour, minute };
}

/** STAT 支援的欄位。parser 原本照單全收 field，未知欄位會變成幽靈 type 死在 reducer */
const STAT_FIELDS = new Set(['HP', 'MP', 'GOLD']);

/**
 * LOCATION_DISCOVER 的地點分類。缺漏或認不得時退回 wilderness——
 * 不給值的話 Phase 1 的候選上限會落在「未設定」分支（等同野外的 3 人），
 * 地圖也少了分類圖示，而且從 UI 上完全看不出是 AI 沒輸出還是刻意留白。
 */
const LOCATION_TYPES = new Set(['town', 'wilderness', 'building']);

/**
 * `LOCATION_DISCOVER|status=` 的地圖狀態。
 *
 * 這個欄位決定地圖上顯示地名還是 `???`。先前指令根本沒有這個參數，
 * reducer 一律寫死 `heard`——玩家人就站在店裡，設定集卻標「聽說過」。
 *
 * 認不得時回傳 null，由 reducer 依「玩家此刻是不是就在那裡」推定，
 * 不亂猜也不丟棄整條指令（丟掉的話新地點連登錄都沒了）。
 */
const MAP_STATUS_ALIASES: Record<string, 'known' | 'heard'> = {
  known: 'known', visited: 'known', 已造訪: 'known', 造訪: 'known', 到過: 'known', 去過: 'known',
  heard: 'heard', rumor: 'heard', rumour: 'heard', 聽說過: 'heard', 聽說: 'heard', 傳聞: 'heard',
};

function parseMapStatus(raw: string | undefined): 'known' | 'heard' | null {
  const key = (raw ?? '').trim().toLowerCase();
  if (!key) return null;
  const hit = MAP_STATUS_ALIASES[key];
  if (!hit) {
    console.warn(`[LOCATION_DISCOVER] 未知的 status=${raw}，改依玩家所在地推定（僅支援 known / heard）`);
    return null;
  }
  return hit;
}

function parseKV(parts: string[]): Record<string, string> {
  const kv: Record<string, string> = {};
  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) kv[key] = val;
  }
  return kv;
}

// ─── Main Entry ───────────────────────────────────────────────────────────────

export function parseCommandsToAST(rawText: string): ParseResult {
  const commands: CommandAST[] = [];
  let narrative: string;

  // 結尾容忍 <</COMMANDS>> 與 </COMMANDS>> 兩種寫法；
  // 舊 regex 只吃掉 </COMMANDS>>，殘留的 < 會被誤解析成一條 UNKNOWN 指令
  const commandBlockRegex = /<<COMMANDS>>([\s\S]*?)<{1,2}\/COMMANDS>>/i;

  /**
   * 寬鬆版：開頭的 `>>` 可省、結尾接受單獨一行的 `>>`。
   *
   * ⚠️ **先嚴後寬**，不要直接把寬鬆版當唯一 regex：指令參數裡可能帶 `>>`
   * （例如 desc 寫了箭頭），惰性比對會提早收尾而截掉後半段指令。
   * 嚴格版比中時代表標記完好，就不必冒這個險。
   *
   * 這條 fallback 是實際踩到的：模型把 `<<COMMANDS>>` 打成 `<<COMMANDS`、
   * 收尾只給 `>>`，整個區塊比不到，於是落到裸指令 fallback；那條路當時
   * 只認 legacy 冒號格式，`TIME|` 與 `LOCATION|` 直接消失，而殘留的 `>>`
   * 被 markdown 當成引言區塊印在故事開頭。
   */
  const looseBlockRegex = /<<COMMANDS>{0,2}\s*\n([\s\S]*?)\n\s*(?:<{1,2}\/COMMANDS>{0,2}|>>)\s*$/i;

  const blockMatch = rawText.match(commandBlockRegex) ?? rawText.match(looseBlockRegex);
  const matchedRegex = rawText.match(commandBlockRegex) ? commandBlockRegex : looseBlockRegex;

  if (blockMatch && blockMatch[1]) {
    const commandText = blockMatch[1];
    narrative = rawText.replace(matchedRegex, '').trim();

    const lines = commandText.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      // 跳過空行、註釋、版本 header
      if (!trimmed || trimmed.startsWith('//') || /^COMMANDS\s+v\d+$/i.test(trimmed)) continue;
      const parsed = parseSingleCommand(trimmed);
      if (parsed) commands.push(parsed);
    }
  } else {
    const bareCommands = extractBareCommands(rawText);
    bareCommands.forEach(cmd => {
      const parsed = parseSingleCommand(cmd);
      if (parsed) commands.push(parsed);
    });
    narrative = rawText;
  }

  return { commands, narrative };
}

// ─── Single Command Parser ────────────────────────────────────────────────────

function parseSingleCommand(line: string): CommandAST | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const parts = trimmed.split('|');
  const cmdType = parts[0].toUpperCase();
  const kv = parseKV(parts.slice(1));

  switch (cmdType) {

    // ── v1 Key=Value 格式 ─────────────────────────────────────────────────────

    // STAT|field=hp|delta=-10
    case 'STAT': {
      const field = (kv.field || '').toUpperCase();
      const delta = parseInt(kv.delta || '0');
      if (!field || isNaN(delta)) return null;
      // 未知欄位（AI 自行發明 field=exp 之類）舊版會變成 type 'EXP'，
      // 在 reducer 落到 default 靜默消失。在此攔下並出聲。
      if (!STAT_FIELDS.has(field)) {
        console.warn(`[STAT] 未知欄位 field=${kv.field}，指令已忽略（僅支援 hp / mp / gold）`);
        return null;
      }
      return { type: field, raw: trimmed, parsed: { value: delta } };
    }

    // ITEM_ADD|name=鐵劍|qty=1|desc=一把普通的劍
    case 'ITEM_ADD': {
      const name = kv.name || kv.n || '';
      if (!name) return null;
      return {
        type: 'ITEM_ADD', raw: trimmed,
        parsed: {
          name,
          quantity: parseQty(kv.qty || kv.quantity),
          description: kv.desc || kv.description || '',
        },
      };
    }

    // ITEM_REMOVE|name=鐵劍|qty=1
    case 'ITEM_REMOVE': {
      const name = kv.name || kv.n || '';
      if (!name) return null;
      return {
        type: 'ITEM_REMOVE', raw: trimmed,
        parsed: { name, quantity: parseQty(kv.qty || kv.quantity) },
      };
    }

    // ITEM_USE|name=鐵劍
    case 'ITEM_USE': {
      const name = kv.name || kv.n || '';
      if (!name) return null;
      return { type: 'ITEM_USE', raw: trimmed, parsed: { name } };
    }

    // AFFINITY|npc=角色名|delta=+10
    case 'AFFINITY': {
      const npcName = kv.npc || kv.name || '';
      const value = parseInt(kv.delta || kv.value || '0');
      if (!npcName || isNaN(value)) return null;
      return { type: 'AFFINITY', raw: trimmed, parsed: { npcName, value } };
    }

    // LOCATION|name=新地點名稱
    case 'LOCATION': {
      const location = kv.name || kv.loc || '';
      if (!location) return null;
      return { type: 'LOCATION', raw: trimmed, parsed: { location } };
    }

    // TIME|delta=+1h、TIME|delta=+30m、TIME|set=07:00（絕對時刻校準）
    // 兩者可同時出現：先累加 delta，再校準到 set（見 timeUtils.setClockForward）
    case 'TIME': {
      const rawDelta = kv.delta || kv.value || '';
      const minutes = rawDelta ? parseTimeDelta(rawDelta) : null;
      const setTo = kv.set ? parseClockTime(kv.set) : null;

      if (kv.set && !setTo) {
        console.warn(`[TIME] set 認不得的時刻（"${kv.set}"），已忽略。原始指令：${trimmed}`);
      }
      // delta 與 set 都拿不到才整條丟棄
      if (minutes === null && !setTo) return null;

      return { type: 'TIME', raw: trimmed, parsed: { minutes: minutes ?? 0, setTo } };
    }

    // WEATHER|value=下雨
    case 'WEATHER': {
      const weather = normalizeWeather(kv.value || kv.weather || kv.name || '');
      if (!weather) {
        console.warn(`[WEATHER] 認不得的天氣（"${kv.value || kv.weather || kv.name || ''}"），已忽略。可用值：${WEATHER_VALUES.join('／')}。原始指令：${trimmed}`);
        return null;
      }
      return { type: 'WEATHER', raw: trimmed, parsed: { weather } };
    }

    // QUEST_ADD|title=任務名|giver=委託人|desc=目標描述|gold=100|items=物品A,物品B|deadline=7
    case 'QUEST_ADD': {
      const title = kv.title || kv.name || '';
      if (!title) return null;
      return {
        type: 'QUEST_ADD', raw: trimmed,
        parsed: {
          title,
          giver: kv.giver || '',
          description: kv.desc || kv.description || '',
          gold: kv.gold ? parseInt(kv.gold) : undefined,
          items: kv.items ? kv.items.split(',').map(s => s.trim()).filter(Boolean) : [],
          deadline: kv.deadline ? parseInt(kv.deadline) : undefined,
        },
      };
    }

    // QUEST_GOAL_MET|id=a7f（title= 為舊格式與 fallback，見下方說明）
    case 'QUEST_GOAL_MET': {
      const title = kv.title || kv.name || '';
      const id = kv.id || '';
      // 兩個都沒有才丟棄。只給 id 是新格式的常態，不能要求一定要有 title
      if (!title && !id) return null;
      return { type: 'QUEST_GOAL_MET', raw: trimmed, parsed: { title, id } };
    }

    // QUEST_COMPLETE|id=a7f（title= 為舊格式與 fallback）
    case 'QUEST_COMPLETE': {
      const title = kv.title || kv.name || '';
      const id = kv.id || '';
      if (!title && !id) return null;
      return { type: 'QUEST_COMPLETE', raw: trimmed, parsed: { title, id } };
    }

    // NPC_THOUGHT|npc=角色名|text=第一人稱內心想法
    case 'NPC_THOUGHT': {
      const npcName = kv.npc || kv.name || '';
      const thought = kv.text || kv.thought || '';
      if (!npcName || !thought) return null;
      return { type: 'NPC_THOUGHT', raw: trimmed, parsed: { npcName, thought } };
    }

    // NPC_LOCATION|npc=角色名|loc=地點
    case 'NPC_LOCATION': {
      const npcName = kv.npc || kv.name || '';
      const location = kv.loc || kv.location || '';
      if (!npcName || !location) return null;
      return { type: 'NPC_LOCATION', raw: trimmed, parsed: { npcName, location } };
    }

    // NPC_NEW|name=姓名|race=種族|gender=性別|age=年齡|job=職業|appearance=外貌|personality=個性|backstory=背景
    case 'NPC_NEW': {
      const name = kv.name || '';
      if (!name) return null;
      return {
        type: 'NPC_NEW', raw: trimmed,
        parsed: {
          name,
          race: kv.race || '',
          gender: kv.gender || '',
          age: kv.age || '',
          job: kv.job || '',
          appearance: kv.appearance || kv.appear || '',
          personality: kv.personality || kv.persona || '',
          backstory: kv.backstory || kv.bg || '',
          other: kv.other || '',
        },
      };
    }

    // NPC_HOME|name=姓名|loc=地點
    case 'NPC_HOME': {
      const name = kv.name || kv.npc || '';
      const loc = kv.loc || kv.location || '';
      if (!name || !loc) return null;
      return { type: 'NPC_HOME', raw: trimmed, parsed: { npcName: name, location: loc } };
    }

    // NPC_RELATIONSHIP|npc=角色名|rel=關係描述（與玩家的關係文字，不同於 NPC_RELATION 的結構化關係）
    case 'NPC_RELATIONSHIP': {
      const npcName = kv.npc || kv.name || '';
      const rel = kv.rel || kv.relationship || '';
      if (!npcName) return null;
      return { type: 'NPC_RELATIONSHIP', raw: trimmed, parsed: { npcName, relationship: rel } };
    }

    // LOCATION_DISCOVER|name=名稱|x=110|y=70|type=building|status=known|desc=簡介|parent=月湖鎮
    case 'LOCATION_DISCOVER': {
      const name = kv.name || kv.loc || '';
      if (!name) return null;
      const rawType = (kv.type || kv.locationType || '').toLowerCase();
      if (kv.type && !LOCATION_TYPES.has(rawType)) {
        console.warn(`[LOCATION_DISCOVER] 未知的 type=${kv.type}，退回 wilderness（僅支援 town / wilderness / building）`);
      }
      // parseInt('abc') 是 NaN，而 NaN 存進 mapX 會讓地圖標記整個消失（座標算不出來），
      // 比座標錯更難查。認不得時退回 0，至少看得到點位不對
      const num = (v: string | undefined) => {
        const n = parseInt(v ?? '');
        return Number.isFinite(n) ? n : 0;
      };
      return {
        type: 'LOCATION_DISCOVER', raw: trimmed,
        parsed: {
          name,
          x: num(kv.x),
          y: num(kv.y),
          locationType: LOCATION_TYPES.has(rawType) ? rawType : 'wilderness',
          // 地點簡介。先前指令沒有這個參數，新登錄的條目 content 一律是空字串——
          // 設定集裡一片空白，玩家看不到，AI 下回合也讀不回自己寫過的地方
          desc: (kv.desc || kv.description || kv.content || '').trim(),
          mapStatus: parseMapStatus(kv.status ?? kv.mapStatus),
          // 母地點：這個地點座落在哪一座城裡（「醉醺醺酒館」→「月湖鎮」）。
          // 候選名單的同城判定靠它，見 utils/locationTree.ts
          parent: (kv.parent || kv.parentLocation || kv.in || '').trim(),
        },
      };
    }

    // MEMORY_ADD — v1 pipe 格式（冒號 legacy 格式無 pipe，cmdType 不會等於
    // MEMORY_ADD，由 default case 的 parseLegacyMemoryAdd 處理）
    // v1:  MEMORY_ADD|type=region|importance=normal|content=...|locations=...|keywords=...|sticky=3
    case 'MEMORY_ADD': {
      const memType = normalizeMemoryType(kv.type);
      const importance = normalizeMemoryImportance(kv.importance);
      const content = kv.content || kv.text || '';
      if (!content) return null;
      return {
        type: 'MEMORY_ADD', raw: trimmed,
        parsed: {
          memType, importance, content,
          locations: kv.locations ? kv.locations.split(',').map(s => s.trim()).filter(Boolean) : [],
          npcs: kv.npcs ? kv.npcs.split(',').map(s => s.trim()).filter(Boolean) : [],
          factions: kv.factions ? kv.factions.split(',').map(s => s.trim()).filter(Boolean) : [],
          keywords: kv.keywords ? kv.keywords.split(',').map(s => s.trim()).filter(Boolean) : [],
          sticky: kv.sticky ? parseInt(kv.sticky) : 0,
          cooldown: kv.cooldown ? parseInt(kv.cooldown) : 0,
        },
      };
    }

    // STATUS_ADD|emoji=☠️|name=中毒|duration=3
    case 'STATUS_ADD': {
      const name = kv.name || '';
      if (!name) return null;
      return {
        type: 'STATUS_ADD', raw: trimmed,
        parsed: {
          name,
          emoji: kv.emoji || '⚠️',
          duration: kv.duration ? parseInt(kv.duration) : -1,
        },
      };
    }

    // STATUS_REMOVE|name=中毒
    case 'STATUS_REMOVE': {
      const name = kv.name || '';
      if (!name) return null;
      return { type: 'STATUS_REMOVE', raw: trimmed, parsed: { name } };
    }

    // STATUS_CLEAR
    case 'STATUS_CLEAR':
      return { type: 'STATUS_CLEAR', raw: trimmed, parsed: {} };

    // ── 勢力系統 v1 Key=Value 格式 ────────────────────────────────────────────

    // FACTION_NEW|name=勢力名|type=guild|desc=描述
    case 'FACTION_NEW': {
      const name = kv.name || '';
      if (!name) return null;
      return {
        type: 'FACTION_NEW', raw: trimmed,
        parsed: {
          name,
          factionType: kv.type || 'other',
          description: kv.desc || kv.description || '',
        },
      };
    }

    // FACTION_JOIN|faction=勢力名|npc=NPC名
    case 'FACTION_JOIN': {
      const faction = kv.faction || kv.name || '';
      const npc = kv.npc || '';
      if (!faction || !npc) return null;
      return { type: 'FACTION_JOIN', raw: trimmed, parsed: { factionName: faction, npcName: npc } };
    }

    // FACTION_RELATION|a=勢力A|type=ally|b=勢力B|note=備註
    case 'FACTION_RELATION': {
      const a = kv.a || kv.from || '';
      const relType = kv.type || kv.rel || '';
      const b = kv.b || kv.to || '';
      if (!a || !relType || !b) return null;
      return {
        type: 'FACTION_RELATION', raw: trimmed,
        parsed: { factionA: a, relationType: relType.toLowerCase(), factionB: b, note: kv.note || '' },
      };
    }

    // NPC_RELATION|npc=NPC名|type=family|target=目標名|note=備註
    case 'NPC_RELATION': {
      const npc = kv.npc || kv.name || '';
      const relType = kv.type || kv.rel || '';
      const target = kv.target || '';
      if (!npc || !relType || !target) return null;
      return {
        type: 'NPC_RELATION', raw: trimmed,
        parsed: { npcName: npc, relationType: relType.toLowerCase(), targetName: target, note: kv.note || '' },
      };
    }

    // ── Legacy fallback（舊格式相容）────────────────────────────────────────────

    default: {
      // MEMORY_ADD:type:importance:content[:key=val...]（CLAUDE.md 約定的冒號格式）
      if (/^MEMORY_ADD:/i.test(trimmed)) {
        return parseLegacyMemoryAdd(trimmed);
      }
      // HP:+10 / HP:-5
      const numMatch = trimmed.match(/^(HP|MP|GOLD):\s*([+-])(\d+)$/i);
      if (numMatch) {
        return {
          type: numMatch[1].toUpperCase(), raw: trimmed,
          parsed: { value: parseInt(`${numMatch[2]}${numMatch[3]}`) },
        };
      }
      // TIME:+1h
      const timeMatch = trimmed.match(/^TIME:\+(\d+)([hm])$/i);
      if (timeMatch) {
        const minutes = timeMatch[2].toLowerCase() === 'h'
          ? parseInt(timeMatch[1]) * 60 : parseInt(timeMatch[1]);
        return { type: 'TIME', raw: trimmed, parsed: { minutes } };
      }
      // LOCATION:地點名稱
      const locMatch = trimmed.match(/^LOCATION:(.+)$/i);
      if (locMatch) {
        return { type: 'LOCATION', raw: trimmed, parsed: { location: locMatch[1].trim() } };
      }
      // AFFINITY:NPC:+10
      const affMatch = trimmed.match(/^AFFINITY:([^:]+):\s*([+-])(\d+)$/i);
      if (affMatch) {
        return {
          type: 'AFFINITY', raw: trimmed,
          parsed: { npcName: affMatch[1].trim(), value: parseInt(`${affMatch[2]}${affMatch[3]}`) },
        };
      }
      // FACTION_NEW:勢力名:類型:描述
      const factionNewMatch = trimmed.match(/^FACTION_NEW:([^:]+):([^:]+):(.*)$/i);
      if (factionNewMatch) {
        return {
          type: 'FACTION_NEW', raw: trimmed,
          parsed: { name: factionNewMatch[1].trim(), factionType: factionNewMatch[2].trim(), description: factionNewMatch[3].trim() },
        };
      }
      // FACTION_JOIN:勢力名:NPC名
      const factionJoinMatch = trimmed.match(/^FACTION_JOIN:([^:]+):(.+)$/i);
      if (factionJoinMatch) {
        return {
          type: 'FACTION_JOIN', raw: trimmed,
          parsed: { factionName: factionJoinMatch[1].trim(), npcName: factionJoinMatch[2].trim() },
        };
      }
      // FACTION_RELATION:勢力A:type:勢力B[:備註]
      const factionRelMatch = trimmed.match(/^FACTION_RELATION:([^:]+):(ally|enemy|neutral|vassal|rival):([^:]+)(?::(.*))?$/i);
      if (factionRelMatch) {
        return {
          type: 'FACTION_RELATION', raw: trimmed,
          parsed: { factionA: factionRelMatch[1].trim(), relationType: factionRelMatch[2].toLowerCase(), factionB: factionRelMatch[3].trim(), note: factionRelMatch[4]?.trim() || '' },
        };
      }
      // NPC_RELATION:NPC名:type:目標[:備註]
      const npcRelMatch = trimmed.match(/^NPC_RELATION:([^:]+):(family|ally|rival|enemy|acquaintance|romantic):([^:]+)(?::(.*))?$/i);
      if (npcRelMatch) {
        return {
          type: 'NPC_RELATION', raw: trimmed,
          parsed: { npcName: npcRelMatch[1].trim(), relationType: npcRelMatch[2].toLowerCase(), targetName: npcRelMatch[3].trim(), note: npcRelMatch[4]?.trim() || '' },
        };
      }
      return { type: 'UNKNOWN', raw: trimmed, parsed: { text: trimmed } };
    }
  }
}

// ─── Legacy MEMORY_ADD（冒號格式）─────────────────────────────────────────────
// MEMORY_ADD:type:importance:content[:locations=...:keywords=...:sticky=N]

/** 冒號格式尾段可出現的 meta key，用來界定 content 在哪裡結束 */
const LEGACY_MEMORY_META_KEYS = ['locations', 'npcs', 'factions', 'keywords', 'sticky', 'cooldown'];

function isLegacyMemoryMetaPart(part: string): boolean {
  const eqIdx = part.indexOf('=');
  if (eqIdx <= 0) return false;
  return LEGACY_MEMORY_META_KEYS.includes(part.slice(0, eqIdx).trim().toLowerCase());
}

function parseLegacyMemoryAdd(trimmed: string): CommandAST | null {
  const afterPrefix = trimmed.slice('MEMORY_ADD'.length + 1);
  const colonParts = afterPrefix.split(':');
  if (colonParts.length < 3) return null;
  // 同 v1 分支：值不收斂的話，寫進存檔的記憶會落在注入端每一個桶子外面
  const memType = normalizeMemoryType(colonParts[0]);
  const importance = normalizeMemoryImportance(colonParts[1]);
  // content 本身可能含半形冒號（「魔王宣布:向月湖鎮宣戰」），不能只取 colonParts[2]，
  // 否則後半段會被當成 meta、又因為沒有 `=` 而被靜默丟棄。
  // 改為往後掃到第一個「已知 meta key=value」片段為止，中間全部接回來當 content。
  let metaStart = colonParts.length;
  for (let i = 2; i < colonParts.length; i++) {
    if (isLegacyMemoryMetaPart(colonParts[i])) { metaStart = i; break; }
  }
  const content = colonParts.slice(2, metaStart).join(':').trim();
  if (!content) return null;
  const metaParts = colonParts.slice(metaStart);
  const metaKv: Record<string, string> = {};
  for (const mp of metaParts) {
    const eqIdx = mp.indexOf('=');
    if (eqIdx !== -1) metaKv[mp.slice(0, eqIdx).trim()] = mp.slice(eqIdx + 1).trim();
  }
  return {
    type: 'MEMORY_ADD', raw: trimmed,
    parsed: {
      memType, importance, content,
      locations: metaKv.locations ? metaKv.locations.split(',').map(s => s.trim()).filter(Boolean) : [],
      npcs: metaKv.npcs ? metaKv.npcs.split(',').map(s => s.trim()).filter(Boolean) : [],
      factions: metaKv.factions ? metaKv.factions.split(',').map(s => s.trim()).filter(Boolean) : [],
      keywords: metaKv.keywords ? metaKv.keywords.split(',').map(s => s.trim()).filter(Boolean) : [],
      sticky: metaKv.sticky ? parseInt(metaKv.sticky) : 0,
      cooldown: metaKv.cooldown ? parseInt(metaKv.cooldown) : 0,
    },
  };
}

// ─── Bare Command Extractor ───────────────────────────────────────────────────

/**
 * 認得 pipe（`TIME|delta=+45m`）與 legacy 冒號（`TIME:+45m`）兩種寫法。
 *
 * ⚠️ 這裡原本只列了冒號形式的 `LOCATION:` / `TIME:`，而 prompt 早就改教 AI
 * 輸出 pipe。COMMANDS 區塊的開閉標記一旦被模型打壞（例如 `<<COMMANDS` 少了
 * `>>`），解析就落到這條 fallback——`TIME|` 與 `LOCATION|` 兩條在此比不到，
 * 整輪的時間與地點靜默消失。指令名一律取自 `COMMAND_NAMES`，不要再手抄一份。
 */
const BARE_COMMAND_PATTERN = new RegExp(
  `^(?:${COMMAND_NAMES.join('|')})(?:\\||:)`,
  'i',
);

function extractBareCommands(text: string): string[] {
  const commands: string[] = [];
  const barePattern = BARE_COMMAND_PATTERN;
  const lines = text.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (barePattern.test(trimmed)) commands.push(trimmed);
  }
  return commands;
}
