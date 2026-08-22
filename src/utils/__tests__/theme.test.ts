// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { loadTheme, saveTheme, applyTheme, THEME_STORAGE_KEY, DEFAULT_THEME } from '../theme';

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});
afterEach(() => vi.restoreAllMocks());

describe('loadTheme', () => {
  it('沒存過時回傳預設主題', () => {
    expect(loadTheme()).toBe(DEFAULT_THEME);
  });

  it('讀得回已存的主題', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'parchment');
    expect(loadTheme()).toBe('parchment');
  });

  /** 存檔裡被塞了認不得的值（手動改、舊版遺留）時不能讓 App 掛掉 */
  it('認不得的值退回預設，不會回傳垃圾', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'neon-cyberpunk');
    expect(loadTheme()).toBe(DEFAULT_THEME);
  });

  /**
   * localStorage 在無痕模式／停用 cookie 的瀏覽器會直接 throw，
   * 不是回傳 null。沒有 try/catch 的話整個 App 會在啟動時白畫面。
   */
  it('localStorage 直接 throw 時仍回傳預設值', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(loadTheme()).toBe(DEFAULT_THEME);
  });
});

describe('saveTheme', () => {
  it('寫得進去', () => {
    saveTheme('parchment');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('parchment');
  });

  it('localStorage 寫入 throw 時不往外拋（不打斷玩家）', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(() => saveTheme('parchment')).not.toThrow();
  });
});

describe('applyTheme', () => {
  it('羊皮紙寫上 data-theme', () => {
    applyTheme('parchment');
    expect(document.documentElement.getAttribute('data-theme')).toBe('parchment');
  });

  /**
   * 預設的 dark 就是 :root 本身，所以要**移除**屬性而不是寫上 "dark"——
   * 寫上去的話 CSS 得同時維護 :root 與 [data-theme="dark"] 兩套選擇器。
   */
  it('切回夜色時移除屬性，而不是寫上 dark', () => {
    applyTheme('parchment');
    applyTheme('dark');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('可以來回切換', () => {
    applyTheme('parchment');
    applyTheme('dark');
    applyTheme('parchment');
    expect(document.documentElement.getAttribute('data-theme')).toBe('parchment');
  });
});
