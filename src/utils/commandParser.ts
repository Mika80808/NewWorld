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
      return { type: 'UNKNOWN', raw: trimmed, parsed: { text: trimmed } };
    }
  }
}

// ─── Bare Command Extractor ───────────────────────────────────────────────────

function extractBareCommands(text: string): string[] {
  const commands: string[] = [];
  const barePattern = /^(HP:|MP:|GOLD:|LOCATION:|TIME:|AFFINITY:|QUEST_|NPC_|ITEM_|STAT\||STATUS_)/im;
  const lines = text.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (barePattern.test(trimmed)) commands.push(trimmed);
  }
  return commands;
}
