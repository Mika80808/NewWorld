// @vitest-environment jsdom
import '../../test/setupDom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsModal } from '../SettingsModal';
import { GMConfig, SubGMConfig } from '../../types';

const noop = () => {};

const cfg = (over: Partial<GMConfig> = {}): GMConfig => ({
  provider: 'gemini', apiKey: '', model: 'gemini-2.5-flash', maxTokens: 8192, lastSaved: '', ...over,
});

const renderModal = (over: { main?: Partial<GMConfig>; setMain?: (c: GMConfig) => void } = {}) => {
  const main = cfg(over.main);
  const sub: SubGMConfig = { ...cfg(), useSameKey: true };
  return render(
    <SettingsModal
      isOpen
      onClose={noop}
      mainGMConfig={main}
      setMainGMConfig={over.setMain ?? noop}
      subGMConfig={sub}
      setSubGMConfig={noop}
      handleExportSave={noop}
      handleImportSave={noop}
      handleResetGame={noop}
    />
  );
};

/** 主 GM 與助理 GM 各一個「模型」下拉，取第一個＝主 GM */
const mainSelect = () => screen.getAllByRole('combobox')[0];
const customInput = () => screen.queryAllByLabelText(/自訂型號/)[0];

beforeEach(() => {
  localStorage.clear();
});

/**
 * 清單是寫死的，Google 一出新型號就得改程式重新部署，玩家只能乾等。
 * 自由輸入的入口讓清單降級成常用捷徑，任何 model id 都能直接用。
 */
describe('SettingsModal 模型選擇 — 自訂型號', () => {
  it('清單裡的型號照常顯示，且不出現自訂輸入框', () => {
    renderModal();
    expect((mainSelect() as HTMLSelectElement).value).toBe('gemini-2.5-flash');
    expect(customInput()).toBeUndefined();
  });

  it('下拉裡有「自訂型號」這個選項', () => {
    renderModal();
    expect(screen.getAllByRole('option', { name: /自訂型號/ }).length).toBeGreaterThan(0);
  });

  it('選了自訂型號就出現輸入框', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.selectOptions(mainSelect(), '__custom__');
    expect(customInput()).toBeInTheDocument();
  });

  /** 多半是在既有型號上加後綴，清成空白等於逼玩家重打整串 */
  it('切到自訂時帶入目前的型號，不清空', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.selectOptions(mainSelect(), '__custom__');
    expect((customInput() as HTMLInputElement).value).toBe('gemini-2.5-flash');
  });

  it('輸入的型號會存進設定', async () => {
    const user = userEvent.setup();
    const setMain = vi.fn();
    renderModal({ setMain });
    await user.selectOptions(mainSelect(), '__custom__');
    const box = customInput() as HTMLInputElement;
    await user.clear(box);
    await user.type(box, 'gemini-9-ultra-preview');
    await user.click(screen.getByRole('button', { name: /儲存/ }));

    expect(setMain).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gemini-9-ultra-preview' })
    );
  });

  /** model id 沒有空白，順手擋掉「多一個空格導致整個請求失敗」的經典坑 */
  it('輸入時去掉前後空白', async () => {
    const user = userEvent.setup();
    const setMain = vi.fn();
    renderModal({ setMain });
    await user.selectOptions(mainSelect(), '__custom__');
    const box = customInput() as HTMLInputElement;
    await user.clear(box);
    await user.type(box, '  gemini-9-ultra  ');
    await user.click(screen.getByRole('button', { name: /儲存/ }));

    expect(setMain).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gemini-9-ultra' })
    );
  });

  /**
   * 「是否自訂」由「值不在清單上」推導，不另外存旗標——存了會跟 model
   * 兩份資料互相漂移。這條釘住推導本身：載入一個清單外的型號時要自動開啟自訂模式。
   */
  it('載入清單外的型號時自動進入自訂模式並顯示原值', () => {
    renderModal({ main: { model: 'gemini-9-ultra-preview' } });
    expect((mainSelect() as HTMLSelectElement).value).toBe('__custom__');
    expect((customInput() as HTMLInputElement).value).toBe('gemini-9-ultra-preview');
  });

  it('從自訂切回清單型號會關掉輸入框', async () => {
    const user = userEvent.setup();
    renderModal({ main: { model: 'gemini-9-ultra-preview' } });
    await user.selectOptions(mainSelect(), 'gemini-2.5-pro');
    expect((mainSelect() as HTMLSelectElement).value).toBe('gemini-2.5-pro');
    expect(customInput()).toBeUndefined();
  });

  /**
   * `callAI` 是 `cfg.model || 'gemini-2.0-flash'`——留空會靜默跑另一個型號，
   * 玩家卻以為自己在用剛剛打的那個。這條釘住警告有出現。
   */
  it('清空型號時警告會退回 gemini-2.0-flash', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.selectOptions(mainSelect(), '__custom__');
    await user.clear(customInput() as HTMLInputElement);
    expect(screen.getByText(/留空會退回 gemini-2.0-flash/)).toBeInTheDocument();
  });

  it('助理 GM 也有各自獨立的自訂型號欄位', async () => {
    const user = userEvent.setup();
    renderModal();
    const subSelect = screen.getAllByRole('combobox')[1];
    await user.selectOptions(subSelect, '__custom__');
    // 只有助理那一個進入自訂模式，主 GM 不受影響
    expect(screen.queryAllByLabelText(/自訂型號/)).toHaveLength(1);
    expect((mainSelect() as HTMLSelectElement).value).toBe('gemini-2.5-flash');
  });
});


it('瀏覽器無法儲存時保留草稿並提示，不假裝已儲存', async () => {
  const setMain=vi.fn();
  renderModal({setMain});
  const failure=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new DOMException('Blocked','SecurityError');});
  try {
    await userEvent.click(screen.getByRole('button',{name:'儲存設定'}));
    expect(screen.getByRole('alert')).toHaveTextContent('設定未完整儲存');
    expect(setMain).not.toHaveBeenCalled();
  } finally { failure.mockRestore(); }
});
