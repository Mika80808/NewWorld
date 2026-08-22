// @vitest-environment jsdom
import '../../test/setupDom';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsModal } from '../SettingsModal';
import { GMConfig, SubGMConfig } from '../../types';
import { ThemeId, THEMES } from '../../utils/theme';

const mainCfg: GMConfig = { provider: 'gemini', apiKey: '', model: 'gemini-2.5-flash', maxTokens: 8192, lastSaved: '' };
const subCfg: SubGMConfig = { ...mainCfg, useSameKey: true };

const noop = () => {};

const renderModal = (theme: ThemeId, onSetTheme: (t: ThemeId) => void) =>
  render(
    <SettingsModal
      isOpen
      onClose={noop}
      mainGMConfig={mainCfg}
      setMainGMConfig={noop}
      subGMConfig={subCfg}
      setSubGMConfig={noop}
      handleExportSave={noop}
      handleImportSave={noop}
      handleResetGame={noop}
      theme={theme}
      onSetTheme={onSetTheme}
    />
  );

/**
 * 主題切換開關。沒有這個入口的話，羊皮紙那整套 `[data-theme="parchment"]`
 * CSS 就只是死碼——玩家沒有任何辦法把它打開。
 */
describe('SettingsModal 外觀', () => {
  it('列出所有主題', () => {
    renderModal('dark', noop);
    THEMES.forEach(t => {
      expect(screen.getByRole('button', { name: new RegExp(t.label) })).toBeInTheDocument();
    });
  });

  it('點羊皮紙會呼叫 onSetTheme', async () => {
    const user = userEvent.setup();
    const onSetTheme = vi.fn();
    renderModal('dark', onSetTheme);

    await user.click(screen.getByRole('button', { name: /羊皮紙/ }));
    expect(onSetTheme).toHaveBeenCalledWith('parchment');
  });

  /**
   * 目前主題要看得出來。只靠背景色的話，色盲玩家與讀螢幕的人分不出
   * 哪個是啟用中，所以另外掛 aria-pressed。
   */
  it('目前主題標記 aria-pressed，其他的沒有', () => {
    renderModal('parchment', noop);
    expect(screen.getByRole('button', { name: /羊皮紙/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /夜色/ })).toHaveAttribute('aria-pressed', 'false');
  });

  it('切回夜色也走同一個入口', async () => {
    const user = userEvent.setup();
    const onSetTheme = vi.fn();
    renderModal('parchment', onSetTheme);

    await user.click(screen.getByRole('button', { name: /夜色/ }));
    expect(onSetTheme).toHaveBeenCalledWith('dark');
  });
});
