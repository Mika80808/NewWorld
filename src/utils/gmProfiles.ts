/**
 * API 設定檔（多組可切換的供應商設定）。
 *
 * 玩家要在不同模型之間換來換去試文風，但 `mainGM_config` / `subGM_config` 各只存
 * 一組——換一家就得把上一家的金鑰、端點、型號整串重打。設定檔是一個「存起來的
 * 常用組合」清單，套用時把值**複製**進 GM 設定。
 *
 * ⚠️ **刻意用複製，不是用 id 參照**。GM 設定仍然是「實際在用的那一份」的唯一準據，
 * 設定檔只是預設值來源。存 id 的話，刪掉設定檔會讓遊戲突然沒有 API 可用，
 * 而且兩份資料（設定檔改了、GM 設定沒跟著改）必然漂移——同 `Npc.affectionLabel`
 * 與舊的雙來源身分欄位留下的教訓。
 *
 * ⚠️ 設定檔含 API Key，與 GM 設定同樣只存 localStorage、不進遊戲存檔。
 */
import { GMConfig } from '../types';
import { DEFAULT_PROVIDER, isProviderId, normalizeBaseUrl, providerMeta } from './aiProviders';

export interface GMProfile {
  /** 內部識別用，換名字不影響 */
  id: string;
  /** 玩家自己取的名字，例如「DeepSeek 省錢」「Claude 寫景」 */
  label: string;
  provider: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  maxTokens: number;
}

export const PROFILES_STORAGE_KEY = 'gm_profiles';

/** 下拉選單的可讀上限。超過這個數字要找反而比重打還慢 */
export const MAX_PROFILES = 12;

/** 與 `gmConfig.ts` 同一個介面，測試不必造整個 Storage */
export interface ProfileStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const newId = () => `gmp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

/**
 * 把任意資料收斂成合法設定檔；不合法回 null（由呼叫端丟掉）。
 *
 * 壞掉的單一條目不該讓整份清單消失——玩家存了五組，其中一組因為某次改版
 * 少了欄位，不能因此把另外四組連同金鑰一起弄丟。
 */
export function normalizeProfile(raw: unknown): GMProfile | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const label = typeof r.label === 'string' ? r.label.trim() : '';
  const model = typeof r.model === 'string' ? r.model.trim() : '';
  if (!label || !model) return null;

  const provider = isProviderId(r.provider) ? r.provider : DEFAULT_PROVIDER;
  const meta = providerMeta(provider);
  const maxTokens = Number(r.maxTokens);

  return {
    id: typeof r.id === 'string' && r.id ? r.id : newId(),
    label,
    provider,
    baseUrl: normalizeBaseUrl(typeof r.baseUrl === 'string' ? r.baseUrl : '') || meta.defaultBaseUrl,
    model,
    apiKey: typeof r.apiKey === 'string' ? r.apiKey : '',
    maxTokens: Number.isFinite(maxTokens) && maxTokens > 0 ? Math.floor(maxTokens) : 2048,
  };
}

export function loadProfiles(store: ProfileStore): GMProfile[] {
  try {
    const raw = store.getItem(PROFILES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeProfile)
      .filter((p): p is GMProfile => p !== null)
      .slice(0, MAX_PROFILES);
  } catch {
    // localStorage 整個不能用（無痕模式）或 JSON 壞掉：沒有設定檔不該讓 App 開不起來
    return [];
  }
}

/** 寫回 localStorage；寫不進去回 false，由 UI 明講（配額滿、無痕模式） */
export function saveProfiles(store: ProfileStore, profiles: GMProfile[]): boolean {
  try {
    store.setItem(PROFILES_STORAGE_KEY, JSON.stringify(profiles.slice(0, MAX_PROFILES)));
    return true;
  } catch {
    return false;
  }
}

/** 由目前的 GM 設定做一張設定檔 */
export function profileFromConfig(cfg: GMConfig, label: string): GMProfile {
  const meta = providerMeta(cfg.provider);
  return {
    id: newId(),
    label: label.trim(),
    provider: cfg.provider,
    baseUrl: normalizeBaseUrl(cfg.baseUrl ?? '') || meta.defaultBaseUrl,
    model: cfg.model,
    apiKey: cfg.apiKey,
    maxTokens: cfg.maxTokens,
  };
}

/**
 * 套用設定檔到 GM 設定。
 *
 * ⚠️ 只覆寫供應商相關欄位。`useSameKey`（助理 GM）與 `lastSaved` 屬於那一份設定
 * 自己的狀態，被設定檔帶走的話，套用一次就會把「共用主 GM 金鑰」的選擇洗掉。
 */
export function applyProfile<T extends GMConfig>(cfg: T, profile: GMProfile): T {
  return {
    ...cfg,
    provider: profile.provider as T['provider'],
    baseUrl: profile.baseUrl,
    model: profile.model,
    apiKey: profile.apiKey,
    maxTokens: profile.maxTokens,
  };
}

/**
 * 目前設定對應到哪一張設定檔。
 *
 * ⚠️ 由「值相同」推導，**不另外存一個 currentProfileId**。存了旗標之後，玩家套用
 * 設定檔再手動改個型號，旗標仍指著原來那張，畫面上就會顯示一個已經不成立的名字
 * （同 `ModelPicker` 的「是否自訂」由值推導的理由）。
 */
export function matchProfile(cfg: GMConfig, profiles: GMProfile[]): GMProfile | undefined {
  return profiles.find(p =>
    p.provider === cfg.provider &&
    p.model === cfg.model &&
    p.apiKey === cfg.apiKey &&
    p.maxTokens === cfg.maxTokens &&
    normalizeBaseUrl(p.baseUrl) === normalizeBaseUrl(cfg.baseUrl ?? '')
  );
}

/** 新增或就地覆寫（依 id）。同名不擋——玩家可能真的要兩張「DeepSeek」試不同型號 */
export function upsertProfile(profiles: GMProfile[], profile: GMProfile): GMProfile[] {
  const index = profiles.findIndex(p => p.id === profile.id);
  if (index >= 0) {
    const next = [...profiles];
    next[index] = profile;
    return next;
  }
  return [...profiles, profile].slice(0, MAX_PROFILES);
}

export function removeProfile(profiles: GMProfile[], id: string): GMProfile[] {
  return profiles.filter(p => p.id !== id);
}

/** 下拉選單上的一行：「名字 — 供應商／型號」，讓玩家不必記得哪張是哪家 */
export function profileSummary(profile: GMProfile): string {
  return `${profile.label} — ${providerMeta(profile.provider).label}／${profile.model}`;
}
