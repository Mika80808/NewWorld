/**
 * Command Parser - Phase 1: Parse Layer
 * 將 AI 回應文本轉換為結構化指令陣列
 */

export interface CommandAST {
  type: string;                          // 指令類型 'HP', 'MP', 'LOCATION', 等
  raw: string;                           // 原始指令行
  parsed: Record<string, unknown>;       // 解析後的欄位
}

export interface ParseResult {
  commands: CommandAST[];
  narrative: string;
}

/**
 * 將 AI 回應文本解析為結構化指令陣列和敘事文本
 * @param rawText AI 回應的完整文本
 * @returns { commands, narrative } 結構化指令和敘事文本
 */
export function parseCommandsToAST(rawText: string): ParseResult {
  const commands: CommandAST[] = [];
  let narrative = rawText;

  // 第一步：嘗試找到 <<COMMANDS>> ... <</COMMANDS>> 區塊
  const commandBlockRegex = /<<COMMANDS>>([\s\S]*?)<\/COMMANDS>>/i;
  const blockMatch = rawText.match(commandBlockRegex);

  if (blockMatch && blockMatch[1]) {
    // 找到了 COMMANDS 區塊
    const commandText = blockMatch[1];

    // 去除 COMMANDS 區塊，保留敘事文本
    narrative = rawText
      .replace(commandBlockRegex, '')
      .trim();

    // 逐行解析指令
    const lines = commandText.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === '' || trimmed.startsWith('//')) continue;

      const parsed = parseSingleCommand(trimmed);
      if (parsed) {
        commands.push(parsed);
      }
    }
  } else {
    // 未找到 COMMANDS 區塊，嘗試用 fallback 解析裸指令
    const bareCommands = extractBareCommands(rawText);
    bareCommands.forEach(cmd => {
      const parsed = parseSingleCommand(cmd);
      if (parsed) {
        commands.push(parsed);
      }
    });

    // fallback 時，保持原始文本作為敘事
    narrative = rawText;
  }

  return { commands, narrative };
}

/**
 * 解析單個指令行，返回結構化的 CommandAST
 */
function parseSingleCommand(line: string): CommandAST | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  // 數值類指令：HP, MP, GOLD
  const numMatch = trimmed.match(/^(HP|MP|GOLD):\s*([+-])(\d+)$/i);
  if (numMatch) {
    return {
      type: numMatch[1].toUpperCase(),
      raw: trimmed,
      parsed: {
        value: parseInt(`${numMatch[2]}${numMatch[3]}`),
      },
    };
  }

  // 時間指令：TIME:+8h 或 TIME:+30m
  const timeMatch = trimmed.match(/^TIME:\+(\d+)([hm])$/i);
  if (timeMatch) {
    const minutes = timeMatch[2].toLowerCase() === 'h' ? parseInt(timeMatch[1]) * 60 : parseInt(timeMatch[1]);
    return {
      type: 'TIME',
      raw: trimmed,
      parsed: {
        minutes,
      },
    };
  }

  // 位置指令：LOCATION:地點名稱
  const locMatch = trimmed.match(/^LOCATION:(.+)$/i);
  if (locMatch) {
    return {
      type: 'LOCATION',
      raw: trimmed,
      parsed: {
        location: locMatch[1].trim(),
      },
    };
  }

  // 好感度指令：AFFINITY:NPC名稱:+或-數字
  const affMatch = trimmed.match(/^AFFINITY:([^:]+):\s*([+-])(\d+)$/i);
  if (affMatch) {
    return {
      type: 'AFFINITY',
      raw: trimmed,
      parsed: {
        npcName: affMatch[1].trim(),
        value: parseInt(`${affMatch[2]}${affMatch[3]}`),
      },
    };
  }

  // 道具新增：ITEM_ADD:道具名:數量:描述:效果類型:效果值
  const itemAddMatch = trimmed.match(/^ITEM_ADD:([^:]+):(\d+):(.*)$/i);
  if (itemAddMatch) {
    const descParts = itemAddMatch[3].split(':');
    return {
      type: 'ITEM_ADD',
      raw: trimmed,
      parsed: {
        name: itemAddMatch[1].trim(),
        quantity: parseInt(itemAddMatch[2]),
        description: descParts[0]?.trim() || '',
        effectType: descParts[1]?.trim() || '',
        effectValue: descParts[2] ? parseInt(descParts[2]) : undefined,
      },
    };
  }

  // 道具移除：ITEM_REMOVE:道具名:數量
  const itemRemoveMatch = trimmed.match(/^ITEM_REMOVE:([^:]+):(\d+)$/i);
  if (itemRemoveMatch) {
    return {
      type: 'ITEM_REMOVE',
      raw: trimmed,
      parsed: {
        name: itemRemoveMatch[1].trim(),
        quantity: parseInt(itemRemoveMatch[2]),
      },
    };
  }

  // 道具使用：ITEM_USE:道具名
  const itemUseMatch = trimmed.match(/^ITEM_USE:(.+)$/i);
  if (itemUseMatch) {
    return {
      type: 'ITEM_USE',
      raw: trimmed,
      parsed: {
        name: itemUseMatch[1].trim(),
      },
    };
  }

  // 任務新增：QUEST_ADD:標題:委託人:描述:獎金:獎勵物品:期限天數
  const questAddMatch = trimmed.match(/^QUEST_ADD:([^:]+):([^:]+):([^:]*):(\d+)?:([^:]*):(\d+)?$/i);
  if (questAddMatch) {
    return {
      type: 'QUEST_ADD',
      raw: trimmed,
      parsed: {
        title: questAddMatch[1].trim(),
        giver: questAddMatch[2].trim(),
        description: questAddMatch[3]?.trim() || '',
        gold: questAddMatch[4] ? parseInt(questAddMatch[4]) : undefined,
        items: questAddMatch[5]?.trim() ? questAddMatch[5].split(',').map(s => s.trim()) : [],
        deadline: questAddMatch[6] ? parseInt(questAddMatch[6]) : undefined,
      },
    };
  }

  // 任務目標達成：QUEST_GOAL_MET:任務標題
  const questGoalMatch = trimmed.match(/^QUEST_GOAL_MET:(.+)$/i);
  if (questGoalMatch) {
    return {
      type: 'QUEST_GOAL_MET',
      raw: trimmed,
      parsed: {
        title: questGoalMatch[1].trim(),
      },
    };
  }

  // 任務完成：QUEST_COMPLETE:任務標題
  const questCompleteMatch = trimmed.match(/^QUEST_COMPLETE:(.+)$/i);
  if (questCompleteMatch) {
    return {
      type: 'QUEST_COMPLETE',
      raw: trimmed,
      parsed: {
        title: questCompleteMatch[1].trim(),
      },
    };
  }

  // NPC 想法：NPC_THOUGHT:NPC名稱:想法內容
  const npcThoughtMatch = trimmed.match(/^NPC_THOUGHT:([^:]+):(.+)$/i);
  if (npcThoughtMatch) {
    return {
      type: 'NPC_THOUGHT',
      raw: trimmed,
      parsed: {
        npcName: npcThoughtMatch[1].trim(),
        thought: npcThoughtMatch[2].trim(),
      },
    };
  }

  // NPC 位置：NPC_LOCATION:NPC名稱:位置
  const npcLocMatch = trimmed.match(/^NPC_LOCATION:([^:]+):(.+)$/i);
  if (npcLocMatch) {
    return {
      type: 'NPC_LOCATION',
      raw: trimmed,
      parsed: {
        npcName: npcLocMatch[1].trim(),
        location: npcLocMatch[2].trim(),
      },
    };
  }

  // 狀態異常新增：STATUS_ADD:id:名稱:emoji:回合數:說明(選填)
  // duration = -1 表示永久
  const statusAddMatch = trimmed.match(/^STATUS_ADD:([^:]+):([^:]+):([^:]+):(-1|\d+)(?::(.*))?$/i);
  if (statusAddMatch) {
    return {
      type: 'STATUS_ADD',
      raw: trimmed,
      parsed: {
        id:          statusAddMatch[1].trim(),
        name:        statusAddMatch[2].trim(),
        emoji:       statusAddMatch[3].trim(),
        duration:    parseInt(statusAddMatch[4]),
        description: statusAddMatch[5]?.trim() || '',
      },
    };
  }

  // 狀態異常移除：STATUS_REMOVE:id
  const statusRemoveMatch = trimmed.match(/^STATUS_REMOVE:(.+)$/i);
  if (statusRemoveMatch) {
    return {
      type: 'STATUS_REMOVE',
      raw: trimmed,
      parsed: {
        id: statusRemoveMatch[1].trim(),
      },
    };
  }

  // 清除所有狀態異常：STATUS_CLEAR
  if (/^STATUS_CLEAR$/i.test(trimmed)) {
    return {
      type: 'STATUS_CLEAR',
      raw: trimmed,
      parsed: {},
    };
  }


  // 未匹配的指令，返回原始格式
  return {
    type: 'UNKNOWN',
    raw: trimmed,
    parsed: { text: trimmed },
  };
}

/**
 * 從敘事文本中提取裸指令（未被 <<COMMANDS>> 包裹的指令）
 */
function extractBareCommands(text: string): string[] {
  const commands: string[] = [];

  // 簡單的指令模式（行開頭為指令）
  const barePattern = /^(HP:|MP:|GOLD:|LOCATION:|TIME:|AFFINITY:|QUEST_|NPC_|ITEM_|STATUS_)/im;

  const lines = text.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (barePattern.test(trimmed)) {
      commands.push(trimmed);
    }
  }

  return commands;
}
