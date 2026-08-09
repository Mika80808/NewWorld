// @vitest-environment jsdom
import '../../test/setupDom';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, renderHook } from '@testing-library/react';
import type { FC } from 'react';
import { useAuth } from '../useAuth';

/**
 * readOAuthError 沒有 export，只能透過 useAuth 的 authError 觀察。
 * 這裡用 history.replaceState 佈置網址——jsdom 的 window.location 不可直接指派，
 * 但 replaceState 會如實反映到 location.hash / location.search。
 */
const setUrl = (urlSuffix: string) => {
  window.history.replaceState(null, '', `/${urlSuffix}`);
};

describe('useAuth — OAuth 錯誤讀取', () => {
  beforeEach(() => setUrl(''));
  afterEach(() => setUrl(''));

  it('從 hash 讀取 error_description', () => {
    setUrl('#error=access_denied&error_description=User+denied+access');
    const { result } = renderHook(() => useAuth());
    expect(result.current.authError).toBe('User denied access');
  });

  it('從 query 讀取 error_description', () => {
    setUrl('?error=server_error&error_description=Database+error+saving+new+user');
    const { result } = renderHook(() => useAuth());
    expect(result.current.authError).toBe('Database error saving new user');
  });

  it('沒有 error_description 時退回 error 代碼', () => {
    setUrl('#error=access_denied');
    const { result } = renderHook(() => useAuth());
    expect(result.current.authError).toBe('access_denied');
  });

  it('percent-encoding 會被還原', () => {
    setUrl('?error_description=Token%20expired%3A%20retry');
    const { result } = renderHook(() => useAuth());
    expect(result.current.authError).toBe('Token expired: retry');
  });

  it('網址乾淨時為 null', () => {
    const { result } = renderHook(() => useAuth());
    expect(result.current.authError).toBeNull();
  });

  // OAuth 成功時 hash 帶的是 access_token，不是錯誤——不能誤判成錯誤，
  // 否則 effect 會提早抹掉網址讓 supabase.auth 讀不到 token
  it('成功轉址帶回的 token hash 不被當成錯誤', () => {
    setUrl('#access_token=abc123&token_type=bearer&expires_in=3600');
    const { result } = renderHook(() => useAuth());
    expect(result.current.authError).toBeNull();
    expect(window.location.hash).toBe('#access_token=abc123&token_type=bearer&expires_in=3600');
  });
});

describe('useAuth — authError 在第一次 render 就到位', () => {
  beforeEach(() => setUrl(''));
  afterEach(() => setUrl(''));

  // 用 useState 初始值（而非 effect 內 setState）取得錯誤訊息，
  // 少一次「先畫沒有錯誤的登入頁、再補上錯誤」的閃動。
  // 若有人改回 useEffect + setAuthError，第一次 render 會是 null，這條就會失敗。
  it('第一個 render pass 的 authError 已是錯誤訊息，且不觸發第二次 render', () => {
    setUrl('#error_description=First+paint+must+have+it');

    const seen: (string | null)[] = [];
    const Probe: FC = () => {
      const { authError } = useAuth();
      seen.push(authError);
      return null;
    };
    render(<Probe />);

    expect(seen[0]).toBe('First paint must have it');
    // 沒有「null → 錯誤」的中間狀態
    expect(seen).not.toContain(null);
  });

  it('確有錯誤時 effect 會清掉網址上的 OAuth 參數', () => {
    setUrl('#error_description=Cleaned+up');
    renderHook(() => useAuth());

    expect(window.location.hash).toBe('');
    expect(window.location.search).toBe('');
  });
});
