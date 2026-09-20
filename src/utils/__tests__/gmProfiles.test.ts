import { describe, it, expect } from 'vitest';
import {
  GMProfile, MAX_PROFILES, PROFILES_STORAGE_KEY, ProfileStore,
  applyProfile, loadProfiles, matchProfile, normalizeProfile, profileFromConfig,
  profileSummary, removeProfile, saveProfiles, upsertProfile,
} from '../gmProfiles';
import { MAIN_GM_DEFAULTS, SUB_GM_DEFAULTS } from '../gmConfig';
import { providerMeta } from '../aiProviders';
import { GMConfig } from '../../types';

function memoryStore(initial: Record<string, string> = {}): ProfileStore & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k: string) => (k in data ? data[k] : null),
    setItem: (k: string, v: string) => { data[k] = v; },
  };
}

const deepseek = (): GMConfig => ({
  provider: 'openai', apiKey: 'sk-ds', model: 'deepseek-chat',
  maxTokens: 2048, baseUrl: 'https://api.deepseek.com/v1', lastSaved: '',
});

describe('normalizeProfile', () => {
  it('缺名稱或型號的條目視為壞掉', () => {
    expect(normalizeProfile({ label: '', model: 'gpt-5' })).toBeNull();
    expect(normalizeProfile({ label: 'x', model: '   ' })).toBeNull();
    expect(normalizeProfile('字串')).toBeNull();
    expect(normalizeProfile(null)).toBeNull();
  });

  it('認不得的 provider 退回預設，baseUrl 空的補該供應商的預設端點', () => {
    const p = normalizeProfile({ label: 'x', model: 'm', provider: '外星供應商' })!;
    expect(p.provider).toBe(MAIN_GM_DEFAULTS.provider);
    expect(p.baseUrl).toBe(providerMeta(MAIN_GM_DEFAULTS.provider).defaultBaseUrl);
  });

  it('maxTokens 不是正數時退回預設，不讓 NaN 流進請求', () => {
    expect(normalizeProfile({ label: 'x', model: 'm', maxTokens: 'abc' })!.maxTokens).toBe(2048);
    expect(normalizeProfile({ label: 'x', model: 'm', maxTokens: -5 })!.maxTokens).toBe(2048);
    expect(normalizeProfile({ label: 'x', model: 'm', maxTokens: 4096 })!.maxTokens).toBe(4096);
  });
});

describe('loadProfiles', () => {
  it('壞掉的單一條目被丟掉，其餘照常讀回——不能因為一張壞掉就連金鑰一起弄丟', () => {
    const store = memoryStore({
      [PROFILES_STORAGE_KEY]: JSON.stringify([
        { id: 'a', label: '好的', model: 'deepseek-chat', provider: 'openai', apiKey: 'k', maxTokens: 2048 },
        { label: '沒有型號' },
        { id: 'c', label: '也是好的', model: 'gpt-5', provider: 'openai', apiKey: 'k2', maxTokens: 512 },
      ]),
    });
    const list = loadProfiles(store);
    expect(list.map(p => p.label)).toEqual(['好的', '也是好的']);
  });

  it('沒資料、壞 JSON、不是陣列都回空清單，不讓 App 開不起來', () => {
    expect(loadProfiles(memoryStore())).toEqual([]);
    expect(loadProfiles(memoryStore({ [PROFILES_STORAGE_KEY]: '{壞' }))).toEqual([]);
    expect(loadProfiles(memoryStore({ [PROFILES_STORAGE_KEY]: '{"a":1}' }))).toEqual([]);
  });

  it('localStorage 整個不能用（無痕模式）時回空清單', () => {
    const broken: ProfileStore = {
      getItem: () => { throw new Error('SecurityError'); },
      setItem: () => {},
    };
    expect(loadProfiles(broken)).toEqual([]);
  });
});

describe('saveProfiles', () => {
  it('寫不進去回 false，讓 UI 有機會明講而不是靜默失敗', () => {
    const broken: ProfileStore = {
      getItem: () => null,
      setItem: () => { throw new Error('QuotaExceededError'); },
    };
    expect(saveProfiles(broken, [])).toBe(false);
  });

  it('存得回來，而且讀回的內容一致', () => {
    const store = memoryStore();
    const profile = profileFromConfig(deepseek(), 'DeepSeek 省錢');
    expect(saveProfiles(store, [profile])).toBe(true);
    expect(loadProfiles(store)).toEqual([profile]);
  });
});

describe('applyProfile', () => {
  it('套用會換掉供應商／端點／型號／金鑰／token 上限', () => {
    const profile = profileFromConfig(deepseek(), 'DS');
    const next = applyProfile(MAIN_GM_DEFAULTS, profile);
    expect(next.provider).toBe('openai');
    expect(next.model).toBe('deepseek-chat');
    expect(next.apiKey).toBe('sk-ds');
    expect(next.baseUrl).toBe('https://api.deepseek.com/v1');
    expect(next.maxTokens).toBe(2048);
  });

  it('不碰 useSameKey——套用一次就把「共用主 GM 金鑰」洗掉是不能接受的', () => {
    const profile = profileFromConfig(deepseek(), 'DS');
    const next = applyProfile({ ...SUB_GM_DEFAULTS, useSameKey: true }, profile);
    expect(next.useSameKey).toBe(true);
  });
});

describe('matchProfile', () => {
  it('值完全相同時才算套用中', () => {
    const profile = profileFromConfig(deepseek(), 'DS');
    expect(matchProfile(applyProfile(MAIN_GM_DEFAULTS, profile), [profile])).toBe(profile);
  });

  it('套用後手動改一個型號就不再對應——旗標式記法會在這裡顯示一個不成立的名字', () => {
    const profile = profileFromConfig(deepseek(), 'DS');
    const edited = { ...applyProfile(MAIN_GM_DEFAULTS, profile), model: 'deepseek-reasoner' };
    expect(matchProfile(edited, [profile])).toBeUndefined();
  });

  it('端點尾端多一槓仍算同一張（比對前先正規化）', () => {
    const profile = profileFromConfig(deepseek(), 'DS');
    const cfg = { ...applyProfile(MAIN_GM_DEFAULTS, profile), baseUrl: 'https://api.deepseek.com/v1/' };
    expect(matchProfile(cfg, [profile])).toBe(profile);
  });
});

describe('upsertProfile / removeProfile', () => {
  const make = (id: string, label: string): GMProfile =>
    ({ ...profileFromConfig(deepseek(), label), id });

  it('同 id 就地覆寫，不會多一張', () => {
    const list = [make('a', '舊名')];
    const next = upsertProfile(list, make('a', '新名'));
    expect(next).toHaveLength(1);
    expect(next[0].label).toBe('新名');
  });

  it('同名不同 id 可以並存——玩家可能真的要兩張同家不同型號', () => {
    const next = upsertProfile([make('a', 'DeepSeek')], make('b', 'DeepSeek'));
    expect(next).toHaveLength(2);
  });

  it('數量上限擋住，避免下拉長到找不到東西', () => {
    const full = Array.from({ length: MAX_PROFILES }, (_, i) => make(`id${i}`, `p${i}`));
    expect(upsertProfile(full, make('new', '再一張'))).toHaveLength(MAX_PROFILES);
  });

  it('刪除只動指定那張', () => {
    const list = [make('a', 'A'), make('b', 'B')];
    expect(removeProfile(list, 'a').map(p => p.label)).toEqual(['B']);
  });
});

describe('profileSummary', () => {
  it('一行看得出是哪家哪個型號', () => {
    const text = profileSummary(profileFromConfig(deepseek(), 'DS'));
    expect(text).toContain('DS');
    expect(text).toContain('deepseek-chat');
  });
});
