/**
 * 天氣詞彙表。
 *
 * `TimeState.weather` 一直都注入 prompt（`Time: … | Weather: X`），也一直畫在
 * 狀態列與天空梯度上——但**從來沒有任何指令能寫它**。開新遊戲給的初始值就是
 * 那個存檔一輩子的天氣：故事裡下了三天暴雨，狀態列還是「晴朗」，而 AI 每回合
 * 又從 prompt 讀回「晴朗」當成事實，於是連敘事都被拉回晴天。
 *
 * 這份清單是唯一準據，同時被三個地方吃：
 * - `WEATHER` 指令（AI 寫入前先 `normalizeWeather`）
 * - 狀態列的天氣圖示 `getWeatherIcon()`
 * - 天空梯度的 `overlayMap`
 *
 * 值刻意收斂成五種。天氣不是自由文字：AI 很願意寫「微風徐徐帶著海鹽味」，
 * 那種東西進了 `weather` 欄位就沒有圖示、沒有梯度，只是一段塞在狀態列裡的散文。
 */
export const WEATHER_VALUES = ['晴朗', '陰天', '下雨', '下雪', '起霧'] as const;

export type Weather = (typeof WEATHER_VALUES)[number];

const CANONICAL = new Set<string>(WEATHER_VALUES);

/**
 * 同義詞。AI 不會每次都挑中清單上的那個詞——它會寫「晴」「大雨」「暴風雪」。
 * 與其丟棄（天氣又卡住不動），不如把講的是同一件事的收進來。
 */
const ALIASES: Record<string, Weather> = {
  晴: '晴朗', 晴天: '晴朗', 天晴: '晴朗', 放晴: '晴朗', 晴朗無雲: '晴朗',
  萬里無雲: '晴朗', 豔陽: '晴朗', 艷陽: '晴朗', 大晴天: '晴朗',

  陰: '陰天', 多雲: '陰天', 陰霾: '陰天', 烏雲: '陰天', 陰沉: '陰天',
  陰鬱: '陰天', 密雲: '陰天',

  雨: '下雨', 雨天: '下雨', 小雨: '下雨', 大雨: '下雨', 豪雨: '下雨',
  暴雨: '下雨', 細雨: '下雨', 陣雨: '下雨', 雷雨: '下雨', 傾盆大雨: '下雨',

  雪: '下雪', 雪天: '下雪', 小雪: '下雪', 大雪: '下雪', 暴雪: '下雪',
  飄雪: '下雪', 暴風雪: '下雪',

  霧: '起霧', 濃霧: '起霧', 薄霧: '起霧', 大霧: '起霧', 霧氣: '起霧',
  迷霧: '起霧',
};

/**
 * 把 AI 給的天氣字串收斂成清單上的值。
 *
 * 認不得就回 `null` 讓呼叫端丟棄並 warn——與 `STAT|field=` 的白名單同一個原則。
 * 靜默寫進去的話，狀態列會出現一個沒有圖示的怪詞，而且下一回合就被 AI 讀回去
 * 當成既定事實，錯誤會自己滾雪球。
 */
export function normalizeWeather(raw: string): Weather | null {
  const s = raw.trim();
  if (!s) return null;
  if (CANONICAL.has(s)) return s as Weather;
  if (ALIASES[s]) return ALIASES[s];

  // 「今天下雨」「天氣：大雪」這種帶了前後綴的，退一步找包含關係。
  // 先比對長詞才不會讓「暴風雪」被「雨」以外的短詞搶先比中。
  const byLength = Object.keys(ALIASES).sort((a, b) => b.length - a.length);
  for (const key of [...WEATHER_VALUES].sort((a, b) => b.length - a.length)) {
    if (s.includes(key)) return key;
  }
  for (const key of byLength) {
    if (s.includes(key)) return ALIASES[key];
  }
  return null;
}
