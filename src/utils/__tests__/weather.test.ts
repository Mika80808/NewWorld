import { describe, it, expect } from 'vitest';
import { normalizeWeather, WEATHER_VALUES } from '../weather';

/**
 * `TimeState.weather` 一直注入 prompt、一直畫在狀態列，卻沒有任何指令能寫它。
 * 玩家回報「天氣也沒有改變」——因為它從開新遊戲那一刻起就永遠不會變。
 */
describe('normalizeWeather', () => {
  it.each(WEATHER_VALUES)('清單上的值原樣通過：%s', (value) => {
    expect(normalizeWeather(value)).toBe(value);
  });

  it.each([
    ['晴', '晴朗'], ['晴天', '晴朗'], ['萬里無雲', '晴朗'],
    ['多雲', '陰天'], ['陰霾', '陰天'],
    ['大雨', '下雨'], ['雷雨', '下雨'], ['傾盆大雨', '下雨'],
    ['暴風雪', '下雪'], ['飄雪', '下雪'],
    ['濃霧', '起霧'], ['薄霧', '起霧'],
  ])('同義詞收斂：%s → %s', (input, expected) => {
    expect(normalizeWeather(input)).toBe(expected);
  });

  /** AI 很愛加前後綴。整句丟棄的話天氣又卡住不動了 */
  it.each([
    ['天氣：大雪', '下雪'],
    ['今天下雨', '下雨'],
    ['天氣轉為晴朗', '晴朗'],
  ])('帶前後綴仍比得到：%s → %s', (input, expected) => {
    expect(normalizeWeather(input)).toBe(expected);
  });

  /** 長詞優先，否則「暴風雪」會被短詞先比中 */
  it('長詞優先於短詞', () => {
    expect(normalizeWeather('暴風雪來襲')).toBe('下雪');
  });

  /**
   * 認不得就回 null 讓呼叫端丟棄——與 STAT|field= 的白名單同一個原則。
   * 靜默寫進去的話狀態列會出現沒有圖示的怪詞，而且下一回合被 AI 讀回去當事實。
   */
  it.each(['', '   ', '微風徐徐帶著海鹽味', '天氣不錯', 'sunny-ish'])(
    '認不得的一律回 null：%s',
    (input) => {
      expect(normalizeWeather(input)).toBeNull();
    }
  );

  it('前後空白不影響', () => {
    expect(normalizeWeather('  下雨  ')).toBe('下雨');
  });
});
