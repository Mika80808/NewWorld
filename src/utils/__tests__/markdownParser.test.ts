import { describe, it, expect } from 'vitest';
import { cleanNarrative, stripOrphanFontTags } from '../markdownParser';

// cleanNarrative 是顯示層的最後一道防線：parseCommandsToAST 在沒有 COMMANDS
// 區塊時會刻意保留原文（見 commandParser.test.ts），漏出來的指令由這裡在渲染前濾掉。
// 舊版 BARE_CMD_PATTERN 只列 legacy 冒號格式，而 promptBuilder 早已改教 AI 輸出
// pipe 格式，等於這道防線對現行格式完全失效。
describe('cleanNarrative — v1 pipe 格式', () => {
  it('濾掉 pipe 格式的殘留指令', () => {
    const text = [
      '你推開酒館的門，暖意撲面而來。',
      'STAT|field=hp|delta=-10',
      'ITEM_ADD|name=草藥|qty=1|desc=回復 20 HP',
      'AFFINITY|npc=芬里爾|delta=+5',
      '老闆抬起頭看了你一眼。',
    ].join('\n');
    expect(cleanNarrative(text)).toBe(
      '你推開酒館的門，暖意撲面而來。\n老闆抬起頭看了你一眼。'
    );
  });

  it('濾掉沒被配對到的 COMMANDS 區塊標記與版本 header', () => {
    const text = '<<COMMANDS>>\nCOMMANDS v1\nTIME|delta=+1h\n<</COMMANDS>>\n夜色漸深。';
    expect(cleanNarrative(text)).toBe('夜色漸深。');
  });

  it('濾掉無參數的 STATUS_CLEAR', () => {
    expect(cleanNarrative('STATUS_CLEAR\n身上的異常一掃而空。')).toBe('身上的異常一掃而空。');
  });
});

describe('cleanNarrative — legacy 冒號格式仍有效', () => {
  it('濾掉冒號格式的殘留指令', () => {
    expect(cleanNarrative('你撿起了金幣。\nGOLD:+50')).toBe('你撿起了金幣。');
  });
});

describe('cleanNarrative — 不誤刪一般敘事', () => {
  it('保留含冒號或直線但不是指令的句子', () => {
    const text = [
      '他低聲說：這條路不好走。',
      '告示牌上寫著｜前方施工｜',
      '木門上刻著一行字：TIME 已到。',
    ].join('\n');
    expect(cleanNarrative(text)).toBe(text);
  });
});

// 結構化標籤是給程式讀的，任何一種漏網都會直接印在故事裡
describe('cleanNarrative — 結構化標籤', () => {
  it('移除出場標記', () => {
    expect(cleanNarrative('[出場:芬里爾,萊尼]酒館裡人聲鼎沸。')).toBe('酒館裡人聲鼎沸。');
  });

  it('移除空的出場標記', () => {
    expect(cleanNarrative('[出場:]空無一人的街道。')).toBe('空無一人的街道。');
  });

  // 回歸：舊版最終文字用嚴格的 /\[出場:[^\]]*\]/g，AI 漏寫 ] 時標籤會殘留，
  // 而串流中的遮蔽邏輯有處理未閉合片段——同一個標籤串流時被藏起來、寫入時又冒出來
  it('移除未閉合的出場標記，且不吃掉下一行', () => {
    expect(cleanNarrative('[出場:芬里爾\n酒館裡人聲鼎沸。')).toBe('酒館裡人聲鼎沸。');
  });

  // [重要NPC] 出自預設 systemPrompt，但全專案沒有任何地方解析它
  it('移除沒有解析的死標籤 [重要NPC]', () => {
    expect(cleanNarrative('老闆哈德[重要NPC]擦著杯子。')).toBe('老闆哈德擦著杯子。');
  });

  // FONT 不能在 cleanNarrative 濾：它跑在 renderMarkdown 之前，
  // 在此清掉會連成對的標記一起吃掉，字體功能整個失效
  it('不碰 FONT 標記（成對配對由 renderMarkdown 負責）', () => {
    const text = '[FONT:serif]公告：明日休市。[/FONT]';
    expect(cleanNarrative(text)).toBe(text);
  });
});

// renderMarkdown 的 fontRegex 要求成對，AI 漏寫收尾時整段不匹配，
// [FONT:serif] 這幾個字就當正文印給玩家看
describe('stripOrphanFontTags — 未成對的 FONT 標記', () => {
  it('移除落單的開頭標記', () => {
    expect(stripOrphanFontTags('[FONT:serif]公告：明日休市。')).toBe('公告：明日休市。');
  });

  it('移除落單的收尾標記', () => {
    expect(stripOrphanFontTags('公告：明日休市。[/FONT]')).toBe('公告：明日休市。');
  });

  it('不誤刪方括號內的一般文字', () => {
    expect(stripOrphanFontTags('[布告欄] 徵求護衛')).toBe('[布告欄] 徵求護衛');
  });
});
