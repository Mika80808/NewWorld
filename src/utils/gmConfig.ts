import { GMConfig, SubGMConfig } from '../types';
import { DEFAULT_PROVIDER, isProviderId, normalizeBaseUrl, providerMeta } from './aiProviders';

/**
 * 主／助理 GM 的 API 設定讀取（localStorage，不隨存檔匯出匯入）。
 *
 * 抽成純函數的理由：原本兩段幾乎相同的邏輯寫在 `App.tsx` 的 `useState` 初始化器裡，
 * 測不到——而它正好藏著一個吃掉玩家選擇的 bug（見下）。
 */

export const MAIN_GM_DEFAULTS: GMConfig = {
  provider: 'gemini', apiKey: '', model: 'gemini-2.5-flash', maxTokens: 2048, lastSaved: '',
};

export const SUB_GM_DEFAULTS: SubGMConfig = {
  provider: 'gemini', apiKey: '', model: 'gemini-2.5-flash', maxTokens: 512, useSameKey: true, lastSaved: '',
};

/**
 * 把 localStorage 裡的原始字串解析成設定；壞掉或不存在就回傳預設值。
 *
 * ⚠️ **不要再加「把某個型號改寫成另一個型號」的遷移**。
 *
 * 先前這裡有一行 `if (parsed.model === 'gemini-2.0-flash') parsed.model = 'gemini-2.5-flash'`，
 * 大概是當年要把人從舊預設推上去。但 `gemini-2.0-flash` **是下拉選單上的正式選項**
 * （「Gemini 2.0 Flash（舊版快速）」），於是變成：玩家選它 → 存檔 → 重整 →
 * 靜默變回 2.5-flash。選單給得出來、選了卻留不住，而且完全沒有提示。
 *
 * 這種「一次性遷移」寫在每次讀取都會跑的路徑上就不再是一次性的，它分不出
 * 「舊預設殘留」與「玩家真的選了這個」——而後者是不該被動的。
 * 真的要淘汰某個型號，請從 `GEMINI_MODELS` 清單拿掉，讓它選不到。
 */
export function parseGMConfig<T extends GMConfig>(raw: string | null, defaults: T): T {
  if (!raw) return defaults;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return defaults;
    return normalizeGMConfig({ ...defaults, ...parsed });
  } catch {
    // 壞掉的 JSON 退回預設值：設定讀不回來不該讓整個 App 開不起來
    return defaults;
  }
}

/**
 * 補齊與收斂供應商相關欄位。
 *
 * - `provider` 認不得（舊存的字串、手改壞的 JSON）就退回預設，不要讓一個不存在的
 *   供應商 id 流進 `callAI`——那會走到「找不到分支」而靜默不發請求。
 * - `baseUrl` 空的時候補該供應商的預設端點。舊設定檔根本沒有這個欄位，
 *   不補的話換到 OpenAI 相容那一類會組出 `/chat/completions` 這種相對路徑。
 */
export function normalizeGMConfig<T extends GMConfig>(cfg: T): T {
  const provider = isProviderId(cfg.provider) ? cfg.provider : DEFAULT_PROVIDER;
  const meta = providerMeta(provider);
  return {
    ...cfg,
    provider,
    baseUrl: normalizeBaseUrl(cfg.baseUrl ?? '') || meta.defaultBaseUrl,
  };
}

/**
 * 換供應商時同時換掉型號與端點。
 *
 * 只改 `provider` 的話，model 還停在上一家的 id（例如帶著 `gemini-2.5-flash`
 * 去打 OpenAI），送出才會報一個看不懂的 400。端點同理。
 * 型號留白由玩家自己填也不行——`callAI` 會拿空字串去組請求。
 */
export function switchProvider<T extends GMConfig>(cfg: T, provider: string): T {
  const meta = providerMeta(provider);
  return { ...cfg, provider: meta.id, model: meta.defaultModel, baseUrl: meta.defaultBaseUrl };
}

/** 舊版單一 key 的儲存格式，`migrateLegacyApiKey` 用來判斷要不要搬 */
const LEGACY_KEY = 'gemini_api_key';
const LEGACY_MAX_TOKENS = 'gemini_max_tokens';
export const MAIN_GM_STORAGE_KEY = 'mainGM_config';
export const SUB_GM_STORAGE_KEY = 'subGM_config';

/** `parseGMConfig` 需要的 localStorage 子集，測試不必造整個 Storage */
export interface ConfigStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * 讀主 GM 設定，順便處理「舊的單一 `gemini_api_key`」那次真正的一次性搬遷。
 *
 * 這個搬遷與上面禁止的型號改寫不同：它有明確的完成條件（搬完就把舊 key 刪掉，
 * 而且只在 `mainGM_config` 還不存在時才跑），不會反覆覆蓋玩家之後的設定。
 */
export function loadMainGMConfig(store: ConfigStore): GMConfig {
  try {
    const oldKey = store.getItem(LEGACY_KEY);
    if (oldKey && !store.getItem(MAIN_GM_STORAGE_KEY)) {
      const cfg: GMConfig = { ...MAIN_GM_DEFAULTS, apiKey: oldKey, lastSaved: new Date().toISOString() };
      store.setItem(MAIN_GM_STORAGE_KEY, JSON.stringify(cfg));
      store.removeItem(LEGACY_KEY);
      store.removeItem(LEGACY_MAX_TOKENS);
      return cfg;
    }
    return parseGMConfig(store.getItem(MAIN_GM_STORAGE_KEY), MAIN_GM_DEFAULTS);
  } catch {
    // localStorage 本身可能整個不能用（無痕模式、瀏覽器設定擋掉）
    return MAIN_GM_DEFAULTS;
  }
}

/** 讀助理 GM 設定（沒有舊格式要搬） */
export function loadSubGMConfig(store: ConfigStore): SubGMConfig {
  try {
    return parseGMConfig(store.getItem(SUB_GM_STORAGE_KEY), SUB_GM_DEFAULTS);
  } catch {
    return SUB_GM_DEFAULTS;
  }
}
