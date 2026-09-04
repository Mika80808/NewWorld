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

// ─── 開閉標記畸形（實際回報） ────────────────────────────────────────────────
// 玩家回報「AI 輸出的開頭會出現 >>，沒遮蔽到」。模型把 `<<COMMANDS>>` 打成
// `<<COMMANDS`、收尾只給 `>>`。看得見的是那個 `>>`（markdown 當成引言區塊），
// 看不見的更嚴重：整個區塊比不到 → 落到裸指令 fallback → 那條路當時只認
// legacy 冒號格式，`TIME|` 與 `LOCATION|` 兩條**靜默消失**，
// 該回合的時間與地點完全沒有推進。
describe('parseCommandsToAST — 畸形的開閉標記', () => {
  const raw = [
    '離開了湖畔詩社溫暖的營火。',
    '',
    '<<COMMANDS',
    'TIME|delta=+45m',
    'ITEM_ADD|name=霧光花|qty=1|desc=一朵散發淡淡藍光的乾花。',
    'LOCATION|name=鐘塔荒野',
    'NPC_NEW|name=埃里克|race=人類|gender=男|job=衛兵',
    'MEMORY_ADD|type=scene|importance=normal|content=前往鐘塔荒野。|locations=鐘塔荒野',
    '>>',
  ].join('\n');

  it('開頭少了 >>、收尾只有 >> 時仍解析得到全部指令', () => {
    const { commands } = parseCommandsToAST(raw);
    const types = commands.map(c => c.type);
    expect(types).toContain('TIME');
    expect(types).toContain('LOCATION');
    expect(types).toContain('ITEM_ADD');
    expect(types).toContain('NPC_NEW');
    expect(types).toContain('MEMORY_ADD');
  });

  /** TIME 是 prompt 明訂每回應必須輸出的指令，丟掉＝遊戲時鐘停擺且無跡象 */
  it('TIME 的分鐘數正確帶出來', () => {
    const { commands } = parseCommandsToAST(raw);
    expect(commands.find(c => c.type === 'TIME')?.parsed.minutes).toBe(45);
  });

  it('敘事裡不留下 >> 殘骸', () => {
    const { narrative } = parseCommandsToAST(raw);
    expect(narrative).not.toContain('>>');
    expect(narrative).not.toContain('<<COMMANDS');
    expect(narrative.trim()).toBe('離開了湖畔詩社溫暖的營火。');
  });

  /**
   * ⚠️ 先嚴後寬：指令參數裡帶 `>>` 時（desc 寫了箭頭），
   * 寬鬆版的惰性比對會提早收尾。標記完好時必須走嚴格版。
   */
  it('標記完好時不受寬鬆比對影響，參數裡的 >> 不會截斷後面的指令', () => {
    const ok = [
      '敘事。',
      '<<COMMANDS>>',
      'ITEM_ADD|name=指路石|qty=1|desc=刻著 >> 的石頭',
      'TIME|delta=+10m',
      '<</COMMANDS>>',
    ].join('\n');
    const { commands, narrative } = parseCommandsToAST(ok);
    expect(commands.map(c => c.type)).toEqual(['ITEM_ADD', 'TIME']);
    expect(narrative.trim()).toBe('敘事。');
  });
});

describe('parseCommandsToAST — TIME set 與 WEATHER', () => {
  const one = (line: string) =>
    parseCommandsToAST(`<<COMMANDS>>\n${line}\n<</COMMANDS>>`).commands[0];

  it.each([
    ['TIME|set=07:00', 7, 0],
    ['TIME|set=7:30', 7, 30],
    ['TIME|set=7', 7, 0],
    ['TIME|set=7點', 7, 0],
    ['TIME|set=7點30分', 7, 30],
    ['TIME|set=23:59', 23, 59],
  ])('%s → %s:%s', (line, hour, minute) => {
    expect(one(line)?.parsed.setTo).toEqual({ hour, minute });
  });

  /** 12 小時制在中文敘事裡很自然。「下午3點」讀成 03:00 會把時鐘往回推一整個白天 */
  it.each([
    ['TIME|set=下午3點', 15],
    ['TIME|set=晚上8點', 20],
    ['TIME|set=早上7點', 7],
    ['TIME|set=中午12:00', 12],
  ])('%s 的 12 小時制換算', (line, hour) => {
    expect((one(line)?.parsed.setTo as { hour: number }).hour).toBe(hour);
  });

  it('delta 與 set 可以同時給', () => {
    const cmd = one('TIME|delta=+30m|set=09:00');
    expect(cmd?.parsed.minutes).toBe(30);
    expect(cmd?.parsed.setTo).toEqual({ hour: 9, minute: 0 });
  });

  /** set 猜錯是直接跳到錯誤時刻，寧可不動——與 delta 的寬容策略相反 */
  it.each(['TIME|set=稍晚', 'TIME|set=25:00', 'TIME|set=12:99'])('認不得的 set 丟棄：%s', (line) => {
    expect(one(line)).toBeUndefined();
  });

  it('set 認不得但 delta 有效時，delta 仍然生效', () => {
    const cmd = one('TIME|delta=+1h|set=稍晚');
    expect(cmd?.parsed.minutes).toBe(60);
    expect(cmd?.parsed.setTo).toBeNull();
  });

  it('只有 delta 時 setTo 為 null（維持原行為）', () => {
    const cmd = one('TIME|delta=+45m');
    expect(cmd?.parsed.minutes).toBe(45);
    expect(cmd?.parsed.setTo).toBeNull();
  });

  it('WEATHER 解析並收斂同義詞', () => {
    expect(one('WEATHER|value=大雨')?.parsed.weather).toBe('下雨');
  });

  it('認不得的 WEATHER 丟棄', () => {
    expect(one('WEATHER|value=天氣不錯')).toBeUndefined();
  });
});

describe('parseCommandsToAST — LOCATION_DISCOVER 的 desc 與 status', () => {
  const one = (line: string) =>
    parseCommandsToAST(`<<COMMANDS>>\n${line}\n<</COMMANDS>>`).commands[0];

  it('desc 解析並去頭尾空白', () => {
    expect(one('LOCATION_DISCOVER|name=晨露餐館|x=3|y=2|desc=  月湖鎮東側的小餐館  ')?.parsed.desc)
      .toBe('月湖鎮東側的小餐館');
  });

  it('沒給 desc 時是空字串，不是 undefined', () => {
    expect(one('LOCATION_DISCOVER|name=晨露餐館|x=3|y=2')?.parsed.desc).toBe('');
  });

  it.each([
    ['known', 'known'], ['KNOWN', 'known'], ['visited', 'known'], ['已造訪', 'known'],
    ['heard', 'heard'], ['聽說過', 'heard'], ['傳聞', 'heard'],
  ])('status=%s → %s', (input, expected) => {
    expect(one(`LOCATION_DISCOVER|name=某地|x=1|y=1|status=${input}`)?.parsed.mapStatus).toBe(expected);
  });

  /**
   * 認不得時回傳 null 交給 reducer 依所在地推定，而不是丟棄整條指令——
   * 丟掉的話新地點連登錄都沒了，比狀態標錯嚴重得多（同 TIME delta 的寬容）。
   */
  it('認不得的 status 是 null，指令本身仍然保留', () => {
    const cmd = one('LOCATION_DISCOVER|name=某地|x=1|y=1|status=也許吧');
    expect(cmd?.type).toBe('LOCATION_DISCOVER');
    expect(cmd?.parsed.mapStatus).toBeNull();
  });

  it('沒給 status 時是 null（由 reducer 推定）', () => {
    expect(one('LOCATION_DISCOVER|name=某地|x=1|y=1')?.parsed.mapStatus).toBeNull();
  });
});
