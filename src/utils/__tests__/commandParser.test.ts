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
