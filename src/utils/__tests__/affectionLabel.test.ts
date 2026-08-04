import { describe, it, expect } from 'vitest';
import { affectionLabel, relationText } from '../affectionLabel';
import { affectionColor } from '../affectionColor';

describe('affectionLabel — 門檻', () => {
  it('各區間對應標籤', () => {
    expect(affectionLabel(-100)).toBe('敵對');
    expect(affectionLabel(-1)).toBe('敵對');
    expect(affectionLabel(0)).toBe('陌生');
    expect(affectionLabel(19)).toBe('陌生');
    expect(affectionLabel(20)).toBe('相識');
    expect(affectionLabel(49)).toBe('相識');
    expect(affectionLabel(50)).toBe('友好');
    expect(affectionLabel(79)).toBe('友好');
    expect(affectionLabel(80)).toBe('信賴');
    expect(affectionLabel(99)).toBe('信賴');
    expect(affectionLabel(100)).toBe('摯友');
    expect(affectionLabel(999)).toBe('摯友');
  });

  // 標籤門檻是 affectionColor 邊界的細分，不能出現「顏色換了標籤沒換」的矛盾
  it('顏色換色的邊界上標籤必定也換', () => {
    for (const boundary of [0, 50, 80, 100]) {
      expect(affectionColor(boundary - 1)).not.toBe(affectionColor(boundary));
      expect(affectionLabel(boundary - 1)).not.toBe(affectionLabel(boundary));
    }
  });
});

describe('relationText — 明確關係優先', () => {
  it('有 relationship 時以它為準', () => {
    expect(relationText('旅伴', 10)).toBe('旅伴');
  });

  // AI 只在「初次確立關係或重大轉變」才送 NPC_RELATIONSHIP，
  // 中間好感度靠 AFFINITY 獨立累積的那段空窗要由標籤補上
  it('沒有 relationship 時退回好感度標籤', () => {
    expect(relationText(undefined, 90)).toBe('信賴');
    expect(relationText('', 90)).toBe('信賴');
    expect(relationText('   ', 90)).toBe('信賴');
  });
});
