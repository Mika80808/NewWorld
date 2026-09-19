import { describe, it, expect } from 'vitest';
import {
  MAIN_GM_DEFAULTS, MAIN_GM_STORAGE_KEY, SUB_GM_DEFAULTS, SUB_GM_STORAGE_KEY,
  ConfigStore, loadMainGMConfig, loadSubGMConfig, normalizeGMConfig, parseGMConfig, switchProvider,
} from '../gmConfig';
import { providerMeta } from '../aiProviders';

function memoryStore(initial: Record<string, string> = {}): ConfigStore & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k: string) => (k in data ? data[k] : null),
    setItem: (k: string, v: string) => { data[k] = v; },
    removeItem: (k: string) => { delete data[k]; },
  };
}

describe('parseGMConfig', () => {
  it('玩家選的型號一定要活過重整（舊版會把 gemini-2.0-flash 靜默改成 2.5）', () => {
    const store = memoryStore({
      [MAIN_GM_STORAGE_KEY]: JSON.stringify({ ...MAIN_GM_DEFAULTS, model: 'gemini-2.0-flash' }),
    });
    expect(loadMainGMConfig(store).model).toBe('gemini-2.0-flash');
  });

  it('沒有資料、壞掉的 JSON、非物件都退回預設值', () => {
    expect(parseGMConfig(null, MAIN_GM_DEFAULTS)).toEqual(MAIN_GM_DEFAULTS);
    expect(parseGMConfig('{壞掉', MAIN_GM_DEFAULTS)).toEqual(MAIN_GM_DEFAULTS);
    expect(parseGMConfig('[]', MAIN_GM_DEFAULTS)).toEqual(MAIN_GM_DEFAULTS);
    expect(parseGMConfig('"字串"', MAIN_GM_DEFAULTS)).toEqual(MAIN_GM_DEFAULTS);
  });

  it('只存了一部分欄位時，缺的用預設補齊', () => {
    const cfg = parseGMConfig(JSON.stringify({ apiKey: 'abc' }), MAIN_GM_DEFAULTS);
    expect(cfg.apiKey).toBe('abc');
    expect(cfg.maxTokens).toBe(MAIN_GM_DEFAULTS.maxTokens);
  });
});

describe('normalizeGMConfig', () => {
  it('認不得的 provider 退回預設，不讓不存在的 id 流進 callAI', () => {
    const cfg = normalizeGMConfig({ ...MAIN_GM_DEFAULTS, provider: 'mystery' as never });
    expect(cfg.provider).toBe(MAIN_GM_DEFAULTS.provider);
  });

  it('舊設定檔沒有 baseUrl 時補上該供應商的預設端點', () => {
    const cfg = normalizeGMConfig({ ...MAIN_GM_DEFAULTS, provider: 'openai', model: 'gpt-5' });
    expect(cfg.baseUrl).toBe(providerMeta('openai').defaultBaseUrl);
  });

  it('玩家自訂的端點不會被蓋掉', () => {
    const cfg = normalizeGMConfig({ ...MAIN_GM_DEFAULTS, provider: 'openai', baseUrl: 'http://localhost:11434/v1/' });
    expect(cfg.baseUrl).toBe('http://localhost:11434/v1');
  });
});

describe('switchProvider', () => {
  it('換供應商時型號與端點一起換，不會留下上一家的 model id', () => {
    const next = switchProvider({ ...MAIN_GM_DEFAULTS, model: 'gemini-2.5-flash' }, 'anthropic');
    expect(next.provider).toBe('anthropic');
    expect(next.model).toBe(providerMeta('anthropic').defaultModel);
    expect(next.baseUrl).toBe(providerMeta('anthropic').defaultBaseUrl);
  });

  it('API Key 與其他欄位保留（玩家可能兩家都用同一把，也可能只是切回去看看）', () => {
    const next = switchProvider({ ...MAIN_GM_DEFAULTS, apiKey: 'k', maxTokens: 4096 }, 'openai');
    expect(next.apiKey).toBe('k');
    expect(next.maxTokens).toBe(4096);
  });
});

describe('舊版單一 api key 的一次性搬遷', () => {
  it('搬進 mainGM_config 並清掉舊 key', () => {
    const store = memoryStore({ gemini_api_key: 'old-key', gemini_max_tokens: '1024' });
    const cfg = loadMainGMConfig(store);
    expect(cfg.apiKey).toBe('old-key');
    expect(store.data.gemini_api_key).toBeUndefined();
    expect(store.data.gemini_max_tokens).toBeUndefined();
    expect(JSON.parse(store.data[MAIN_GM_STORAGE_KEY]).apiKey).toBe('old-key');
  });

  it('已經有新設定時不搬，玩家之後改過的設定不會被舊 key 覆蓋', () => {
    const store = memoryStore({
      gemini_api_key: 'old-key',
      [MAIN_GM_STORAGE_KEY]: JSON.stringify({ ...MAIN_GM_DEFAULTS, apiKey: 'new-key' }),
    });
    expect(loadMainGMConfig(store).apiKey).toBe('new-key');
  });

  it('localStorage 整個不能用（無痕模式）時回預設值，不讓 App 開不起來', () => {
    const broken: ConfigStore = {
      getItem: () => { throw new Error('SecurityError'); },
      setItem: () => {},
      removeItem: () => {},
    };
    expect(loadMainGMConfig(broken)).toEqual(MAIN_GM_DEFAULTS);
    expect(loadSubGMConfig(broken)).toEqual(SUB_GM_DEFAULTS);
  });
});

describe('loadSubGMConfig', () => {
  it('讀得回助理 GM 自己的供應商設定', () => {
    const store = memoryStore({
      [SUB_GM_STORAGE_KEY]: JSON.stringify({ ...SUB_GM_DEFAULTS, provider: 'openai', model: 'gpt-5-mini', baseUrl: 'https://api.openai.com/v1' }),
    });
    const cfg = loadSubGMConfig(store);
    expect(cfg.provider).toBe('openai');
    expect(cfg.model).toBe('gpt-5-mini');
    expect(cfg.useSameKey).toBe(true);
  });
});
