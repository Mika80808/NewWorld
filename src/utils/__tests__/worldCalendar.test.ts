import { describe, it, expect } from 'vitest';
import { MONTHS_DATA } from '../../constants';
import { monthInfo, monthPromptLine } from '../worldCalendar';

describe('monthInfo', () => {
  it('查得到每一個月', () => {
    for (const m of MONTHS_DATA) {
      expect(monthInfo(m.id)).toEqual(m);
    }
  });

  /**
   * 月份超出 1~12（舊存檔、指令寫壞）時退回一月而不是拋錯——
   * 時間顯示與 prompt 都不該因為一個怪數字就整段消失。
   */
  it('月份不合法時退回一月，不拋錯', () => {
    for (const bad of [0, 13, -1, 99, NaN]) {
      expect(monthInfo(bad)).toEqual(MONTHS_DATA[0]);
    }
  });
});

describe('monthPromptLine', () => {
  it('帶上月份名稱、雅稱與該月節慶', () => {
    const line = monthPromptLine(4);
    const april = MONTHS_DATA.find(m => m.id === 4)!;
    expect(line).toContain(april.name);
    expect(line).toContain(april.elegant);
    expect(line).toContain(april.desc);
  });

  /**
   * 只丟一句描述的話，模型不見得知道那是這個月會發生的事，
   * 可能當成背景設定讀過去，所以「節慶」兩個字要寫出來。
   */
  it('明說那是本月的節慶與時節', () => {
    expect(monthPromptLine(4)).toContain('本月節慶與時節');
  });

  it('十二個月都產得出非空的行', () => {
    for (const m of MONTHS_DATA) {
      expect(monthPromptLine(m.id).trim().length).toBeGreaterThan(0);
    }
  });
});
