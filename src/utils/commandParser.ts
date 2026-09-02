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
  'STAT', 'HP', 'MP', 'GOLD', 'AFFINITY', 'LOCATION', 'TIME',
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

/** STAT 支援的欄位。parser 原本照單全收 field，未知欄位會變成幽靈 type 死在 reducer */
const STAT_FIELDS = new Set(['HP', 'MP', 'GOLD']);

/**
 * LOCATION_DISCOVER 的地點分類。缺漏或認不得時退回 wilderness——
 * 不給值的話 Phase 1 的候選上限會落在「未設定」分支（等同野外的 3 人），
 * 地圖也少了分類圖示，而且從 UI 上完全看不出是 AI 沒輸出還是刻意留白。
 */
const LOCATION_TYPES = new Set(['town', 'wilderness', 'building']);

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

    // TIME|delta=+1h  or  TIME|delta=+30m
    case 'TIME': {
      const minutes = parseTimeDelta(kv.delta || kv.value || '');
      if (minutes === null) return null;
      return { type: 'TIME', raw: trimmed, parsed: { minutes } };
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

    // LOCATION_DISCOVER|name=地點名稱|x=110|y=70|type=wilderness
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
        },
      };
    }

    // MEMORY_ADD — v1 pipe 格式（冒號 legacy 格式無 pipe，cmdType 不會等於
    // MEMORY_ADD，由 default case 的 parseLegacyMemoryAdd 處理）
    // v1:  MEMORY_ADD|type=region|importance=normal|content=...|locations=...|keywords=...|sticky=3
    case 'MEMORY_ADD': {
      const memType = (kv.type || 'scene') as 'world' | 'region' | 'scene' | 'npc';
      const importance = (kv.importance || 'normal') as 'critical' | 'normal' | 'flavor';
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
  const memType = colonParts[0].trim() as 'world' | 'region' | 'scene' | 'npc';
  const importance = colonParts[1].trim() as 'critical' | 'normal' | 'flavor';
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
