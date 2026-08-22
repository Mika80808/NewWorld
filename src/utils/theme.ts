/**
 * 佈景主題的唯一入口。
 *
 * 主題**不進遊戲存檔**——它是「這台裝置上的閱讀偏好」，不是世界狀態。
 * 存進存檔的話，玩家在手機選了羊皮紙、桌機開同一個存檔也會被強制換掉；
 * 而且會讓存檔的髒標記因為純顯示設定而變髒。與 API 設定同理，走 localStorage。
 */
export type ThemeId = 'dark' | 'parchment';

export const THEME_STORAGE_KEY = 'newworld_theme';

export const DEFAULT_THEME: ThemeId = 'dark';

export const THEMES: { id: ThemeId; label: string; description: string }[] = [
  { id: 'dark',      label: '夜色',   description: '深色玻璃，原本的冒險氛圍' },
  { id: 'parchment', label: '羊皮紙', description: '淺色紙面，像在看電子書' },
];

const isThemeId = (v: unknown): v is ThemeId =>
  v === 'dark' || v === 'parchment';

/**
 * 讀取已儲存的主題。
 *
 * ⚠️ localStorage 在無痕模式／停用 cookie 的瀏覽器會直接 throw（不是回傳 null），
 * 整個 App 會在啟動時白畫面。一律包 try/catch 並退回預設值。
 */
export function loadTheme(): ThemeId {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeId(raw) ? raw : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function saveTheme(theme: ThemeId): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // 存不進去就算了——主題在本次工作階段仍然生效，只是重開會回到預設。
    // 這不值得打斷玩家，也不該讓 App 崩潰。
  }
}

/**
 * 套用到 <html> 的 data-theme。
 *
 * 預設的 dark 主題就是 `:root` 本身，所以**移除屬性**而不是寫上 "dark"——
 * 寫上去的話 CSS 得同時維護 `:root` 和 `[data-theme="dark"]` 兩套選擇器。
 */
export function applyTheme(theme: ThemeId): void {
  const root = document.documentElement;
  if (theme === DEFAULT_THEME) {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', theme);
  }
}
