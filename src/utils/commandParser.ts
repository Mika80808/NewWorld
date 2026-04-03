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
  let narrative = rawText;

  const commandBlockRegex = /<<COMMANDS>>([\s\S]*?)<\/COMMANDS>>/i;
  const blockMatch = rawText.match(commandBlockRegex);

  if (blockMatch && blockMatch[1]) {
    const commandText = blockMatch[1];
    narrative = rawText.replace(commandBlockRegex, '').trim();

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
          quantity: parseInt(kv.qty || kv.quantity || '1') || 1,
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
        parsed: { name, quantity: parseInt(kv.qty || kv.quantity || '1') || 1 },
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
      const deltaStr = kv.delta || kv.value || '';
      const hMatch = deltaStr.match(/(\d+)h/i);
      const mMatch = deltaStr.match(/(\d+)m/i);
      const minutes = (hMatch ? parseInt(hMatch[1]) * 60 : 0) + (mMatch ? parseInt(mMatch[1]) : 0);
      if (minutes <= 0) return null;
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

    // QUEST_GOAL_MET|title=任務名
    case 'QUEST_GOAL_MET': {
      const title = kv.title || kv.name || '';
      if (!title) return null;
      return { type: 'QUEST_GOAL_MET', raw: trimmed, parsed: { title } };
    }

    // QUEST_COMPLETE|title=任務名
    case 'QUEST_COMPLETE': {
      const title = kv.title || kv.name || '';
      if (!title) return null;
      return { type: 'QUEST_COMPLETE', raw: trimmed, parsed: { title } };
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

    // LOCATION_DISCOVER|name=地點名稱|x=0|y=0
    case 'LOCATION_DISCOVER': {
      const name = kv.name || kv.loc || '';
      if (!name) return null;
      return {
        type: 'LOCATION_DISCOVER', raw: trimmed,
        parsed: {
          name,
          x: kv.x ? parseInt(kv.x) : 0,
          y: kv.y ? parseInt(kv.y) : 0,
        },
      };
    }

    // MEMORY_ADD — 支援 v1 pipe 格式及 legacy 冒號格式
    // v1:  MEMORY_ADD|type=region|importance=normal|content=...|locations=...|keywords=...|sticky=3
    // leg: MEMORY_ADD:type:importance:content:locations=...:keywords=...:sticky=N
    case 'MEMORY_ADD': {
      if (parts.length > 1 && (kv.type || kv.content)) {
        // v1 pipe 格式
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
      // legacy 冒號格式：MEMORY_ADD:type:importance:content[:key=val...]
      const afterPrefix = trimmed.slice('MEMORY_ADD'.length + 1);
      const colonParts = afterPrefix.split(':');
      if (colonParts.length < 3) return null;
      const memType = colonParts[0].trim() as 'world' | 'region' | 'scene' | 'npc';
      const importance = colonParts[1].trim() as 'critical' | 'normal' | 'flavor';
      const content = colonParts[2].trim();
      if (!content) return null;
      const metaParts = colonParts.slice(3);
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

// ─── Bare Command Extractor ───────────────────────────────────────────────────

function extractBareCommands(text: string): string[] {
  const commands: string[] = [];
  const barePattern = /^(HP:|MP:|GOLD:|LOCATION:|TIME:|AFFINITY:|QUEST_|NPC_|ITEM_|STAT\||STATUS_|FACTION_|MEMORY_ADD|LOCATION_DISCOVER)/im;
  const lines = text.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (barePattern.test(trimmed)) commands.push(trimmed);
  }
  return commands;
}
