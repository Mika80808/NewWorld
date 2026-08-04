import { describe, it, expect } from 'vitest';
import { parseCommandsToAST } from '../commandParser';

describe('parseCommandsToAST — COMMANDS 區塊', () => {
  const text = `你推開酒館的門，暖意撲面而來。

<<COMMANDS>>
HP:-10
GOLD:+100
AFFINITY:芬里爾:+5
LOCATION:月湖鎮
TIME:+2h
<</COMMANDS>>`;

  it('解析所有 legacy 冒號指令', () => {
    const { commands } = parseCommandsToAST(text);
    const types = commands.map(c => c.type);
    expect(types).toEqual(['HP', 'GOLD', 'AFFINITY', 'LOCATION', 'TIME']);
  });

  it('數值指令帶正負號', () => {
    const { commands } = parseCommandsToAST(text);
    expect(commands[0].parsed.value).toBe(-10);
    expect(commands[1].parsed.value).toBe(100);
  });

  it('AFFINITY 解析 NPC 名與增減值', () => {
    const { commands } = parseCommandsToAST(text);
    expect(commands[2].parsed).toMatchObject({ npcName: '芬里爾', value: 5 });
  });

  it('TIME 轉為分鐘', () => {
    const { commands } = parseCommandsToAST(text);
    expect(commands[4].parsed.minutes).toBe(120);
  });

  it('narrative 移除 COMMANDS 區塊', () => {
    const { narrative } = parseCommandsToAST(text);
    expect(narrative).toBe('你推開酒館的門，暖意撲面而來。');
    expect(narrative).not.toContain('COMMANDS');
  });

  it('跳過空行、註釋與版本 header', () => {
    const { commands } = parseCommandsToAST(`<<COMMANDS>>
COMMANDS v1
// 這是註釋

HP:+5
<</COMMANDS>>`);
    expect(commands).toHaveLength(1);
    expect(commands[0].type).toBe('HP');
  });
});

describe('parseCommandsToAST — v1 pipe 格式', () => {
  it('STAT 指令', () => {
    const { commands } = parseCommandsToAST('<<COMMANDS>>\nSTAT|field=hp|delta=-10\n<</COMMANDS>>');
    expect(commands[0]).toMatchObject({ type: 'HP', parsed: { value: -10 } });
  });

  it('ITEM_ADD 帶數量與描述', () => {
    const { commands } = parseCommandsToAST('<<COMMANDS>>\nITEM_ADD|name=草藥|qty=2|desc=回復 20 HP\n<</COMMANDS>>');
    expect(commands[0]).toMatchObject({
      type: 'ITEM_ADD',
      parsed: { name: '草藥', quantity: 2, description: '回復 20 HP' },
    });
  });

  it('QUEST_ADD 解析獎勵與期限', () => {
    const { commands } = parseCommandsToAST('<<COMMANDS>>\nQUEST_ADD|title=採集任務|giver=村長|desc=採 5 株草藥|gold=100|items=草藥,布袋|deadline=7\n<</COMMANDS>>');
    expect(commands[0].parsed).toMatchObject({
      title: '採集任務', giver: '村長', gold: 100, deadline: 7,
      items: ['草藥', '布袋'],
    });
  });

  it('FACTION_RELATION 正規化關係類型為小寫', () => {
    const { commands } = parseCommandsToAST('<<COMMANDS>>\nFACTION_RELATION|a=獵人公會|type=ALLY|b=月湖鎮\n<</COMMANDS>>');
    expect(commands[0].parsed.relationType).toBe('ally');
  });
});

describe('parseCommandsToAST — MEMORY_ADD legacy 冒號格式', () => {
  it('解析 type/importance/content 與 meta 欄位', () => {
    const { commands } = parseCommandsToAST(
      '<<COMMANDS>>\nMEMORY_ADD:region:normal:迷霧森林昨日大火:locations=迷霧森林:keywords=大火:sticky=3\n<</COMMANDS>>'
    );
    expect(commands[0]).toMatchObject({
      type: 'MEMORY_ADD',
      parsed: {
        memType: 'region', importance: 'normal', content: '迷霧森林昨日大火',
        locations: ['迷霧森林'], keywords: ['大火'], sticky: 3,
      },
    });
  });

  // 回歸：content 含半形冒號時，舊實作只取 colonParts[2]，後半段會落入 meta 陣列
  // 又因缺少 `=` 被靜默丟棄（「魔王宣布」後面整段消失）
  it('content 含半形冒號時不截斷', () => {
    const { commands } = parseCommandsToAST(
      '<<COMMANDS>>\nMEMORY_ADD:world:critical:魔王宣布:向月湖鎮宣戰:keywords=魔王,宣戰\n<</COMMANDS>>'
    );
    expect(commands[0].parsed).toMatchObject({
      memType: 'world', importance: 'critical',
      content: '魔王宣布:向月湖鎮宣戰',
      keywords: ['魔王', '宣戰'],
    });
  });

  it('content 含冒號且無 meta 欄位時全部保留', () => {
    const { commands } = parseCommandsToAST(
      '<<COMMANDS>>\nMEMORY_ADD:scene:normal:告示寫著:禁止進入\n<</COMMANDS>>'
    );
    expect(commands[0].parsed.content).toBe('告示寫著:禁止進入');
  });

  // content 內的 `=` 不是已知 meta key，不應被誤判為 meta 的起點
  it('content 含非 meta key 的等號時不截斷', () => {
    const { commands } = parseCommandsToAST(
      '<<COMMANDS>>\nMEMORY_ADD:world:normal:契約條款 A=B 已生效:keywords=契約\n<</COMMANDS>>'
    );
    expect(commands[0].parsed).toMatchObject({
      content: '契約條款 A=B 已生效',
      keywords: ['契約'],
    });
  });
});

describe('parseCommandsToAST — MEMORY_ADD / 勢力指令 v1 pipe 格式', () => {
  it('MEMORY_ADD pipe 格式：content 含冒號完全不受影響', () => {
    const { commands } = parseCommandsToAST(
      '<<COMMANDS>>\nMEMORY_ADD|type=world|importance=critical|content=魔王宣布:向月湖鎮宣戰|keywords=魔王,宣戰|sticky=3\n<</COMMANDS>>'
    );
    expect(commands[0]).toMatchObject({
      type: 'MEMORY_ADD',
      parsed: {
        memType: 'world', importance: 'critical',
        content: '魔王宣布:向月湖鎮宣戰',
        keywords: ['魔王', '宣戰'], sticky: 3,
      },
    });
  });

  it('FACTION_NEW / FACTION_JOIN pipe 格式', () => {
    const { commands } = parseCommandsToAST(
      '<<COMMANDS>>\nFACTION_NEW|name=黑牙氏族|type=criminal|desc=盤據東境的盜賊團\nFACTION_JOIN|faction=黑牙氏族|npc=芬里爾\n<</COMMANDS>>'
    );
    expect(commands[0].parsed).toMatchObject({
      name: '黑牙氏族', factionType: 'criminal', description: '盤據東境的盜賊團',
    });
    expect(commands[1].parsed).toMatchObject({ factionName: '黑牙氏族', npcName: '芬里爾' });
  });

  it('NPC_RELATION pipe 格式含備註', () => {
    const { commands } = parseCommandsToAST(
      '<<COMMANDS>>\nNPC_RELATION|npc=芬里爾|type=ally|target=PLAYER|note=共同經歷森林大火\n<</COMMANDS>>'
    );
    expect(commands[0].parsed).toMatchObject({
      npcName: '芬里爾', relationType: 'ally', targetName: 'PLAYER',
      note: '共同經歷森林大火',
    });
  });
});

describe('parseCommandsToAST — 無區塊時的 bare command fallback', () => {
  it('從敘事中萃取裸指令，narrative 保留原文', () => {
    const text = '你撿起了金幣。\nGOLD:+50';
    const { commands, narrative } = parseCommandsToAST(text);
    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({ type: 'GOLD', parsed: { value: 50 } });
    expect(narrative).toBe(text);
  });

  it('無任何指令時回傳空陣列', () => {
    const { commands } = parseCommandsToAST('平靜的一天，什麼都沒發生。');
    expect(commands).toHaveLength(0);
  });
});

describe('parseCommandsToAST — 未知指令', () => {
  it('標記為 UNKNOWN 不拋錯', () => {
    const { commands } = parseCommandsToAST('<<COMMANDS>>\nWHATEVER:foo\n<</COMMANDS>>');
    expect(commands[0].type).toBe('UNKNOWN');
  });
});

// TIME 是 prompt 明訂「每次回應必須輸出」的指令，靜默失效等於遊戲時鐘停擺
describe('parseCommandsToAST — TIME 增量', () => {
  const minutesOf = (delta: string) => {
    const { commands } = parseCommandsToAST(`<<COMMANDS>>\nTIME|delta=${delta}\n<</COMMANDS>>`);
    return commands[0]?.parsed.minutes;
  };

  it('時與分', () => {
    expect(minutesOf('+2h')).toBe(120);
    expect(minutesOf('+30m')).toBe(30);
    expect(minutesOf('+1h30m')).toBe(90);
  });

  it('中文單位', () => {
    expect(minutesOf('+2小時')).toBe(120);
    expect(minutesOf('45分鐘')).toBe(45);
    expect(minutesOf('1小時30分')).toBe(90);
  });

  // 回歸：舊版 minutes<=0 就 return null，整條指令消失且毫無跡象
  it('缺單位時以分鐘解讀而非丟棄', () => {
    expect(minutesOf('30')).toBe(30);
    expect(minutesOf('+90')).toBe(90);
  });

  it('完全沒有數字才丟棄', () => {
    const { commands } = parseCommandsToAST('<<COMMANDS>>\nTIME|delta=一會兒\n<</COMMANDS>>');
    expect(commands).toHaveLength(0);
  });
});

describe('parseCommandsToAST — 參數防衛', () => {
  // 回歸：舊寫法 `parseInt(qty) || 1` 讓負數原樣通過（負數是 truthy），
  // ITEM_ADD 變成扣庫存、ITEM_REMOVE 變成加庫存
  it('qty 為 0、負數或非數字時退回 1', () => {
    const qtyOf = (cmd: string) => {
      const { commands } = parseCommandsToAST(`<<COMMANDS>>\n${cmd}\n<</COMMANDS>>`);
      return commands[0]?.parsed.quantity;
    };
    expect(qtyOf('ITEM_ADD|name=草藥|qty=-3')).toBe(1);
    expect(qtyOf('ITEM_ADD|name=草藥|qty=0')).toBe(1);
    expect(qtyOf('ITEM_ADD|name=草藥|qty=abc')).toBe(1);
    expect(qtyOf('ITEM_REMOVE|name=草藥|qty=-3')).toBe(1);
    expect(qtyOf('ITEM_ADD|name=草藥|qty=5')).toBe(5);
  });

  // 回歸：舊版 type 直接取 field，未知欄位變成幽靈 type 在 reducer 靜默消失
  it('STAT 未知欄位直接丟棄，不產生幽靈 type', () => {
    const { commands } = parseCommandsToAST('<<COMMANDS>>\nSTAT|field=exp|delta=+50\n<</COMMANDS>>');
    expect(commands).toHaveLength(0);
  });

  it('STAT 已知欄位不分大小寫', () => {
    const { commands } = parseCommandsToAST('<<COMMANDS>>\nSTAT|field=Gold|delta=+10\n<</COMMANDS>>');
    expect(commands[0]).toMatchObject({ type: 'GOLD', parsed: { value: 10 } });
  });
});
