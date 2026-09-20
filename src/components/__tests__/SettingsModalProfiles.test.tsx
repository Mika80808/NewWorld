// @vitest-environment jsdom
import '../../test/setupDom';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsModal } from '../SettingsModal';
import { GMConfig, SubGMConfig } from '../../types';
import { PROFILES_STORAGE_KEY, loadProfiles } from '../../utils/gmProfiles';

const noop = () => {};

const renderModal = (main: Partial<GMConfig> = {}) => {
  const mainCfg: GMConfig = {
    provider: 'openai', apiKey: 'sk-ds', model: 'deepseek-chat', maxTokens: 2048,
    baseUrl: 'https://api.deepseek.com/v1', lastSaved: '', ...main,
  };
  const subCfg: SubGMConfig = { ...mainCfg, maxTokens: 512, useSameKey: true };
  return render(
    <SettingsModal
      isOpen onClose={noop}
      mainGMConfig={mainCfg} setMainGMConfig={noop}
      subGMConfig={subCfg} setSubGMConfig={noop}
      handleExportSave={noop} handleImportSave={noop} handleResetGame={noop}
    />
  );
};

const mainProfileSelect = () => screen.getAllByLabelText('設定檔')[0] as HTMLSelectElement;
const mainModelSelect = () => screen.getAllByLabelText('模型')[0] as HTMLSelectElement;
const mainProviderSelect = () => screen.getAllByLabelText('供應商')[0] as HTMLSelectElement;

beforeEach(() => localStorage.clear());

describe('SettingsModal — 設定檔', () => {
  it('沒有設定檔時下拉是空的，且提供「另存」', () => {
    renderModal();
    expect(mainProfileSelect().value).toBe('');
    expect(screen.getAllByText('（尚無設定檔）')).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: '另存' }).length).toBeGreaterThan(0);
  });

  it('另存會把目前設定寫進 localStorage，重開也還在', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(screen.getAllByRole('button', { name: '另存' })[0]);
    await user.type(screen.getByLabelText('設定檔名稱'), 'DeepSeek 省錢');
    await user.click(screen.getAllByRole('button', { name: '儲存' })[0]);

    const saved = loadProfiles(localStorage);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      label: 'DeepSeek 省錢', provider: 'openai',
      model: 'deepseek-chat', apiKey: 'sk-ds', baseUrl: 'https://api.deepseek.com/v1',
    });
  });

  it('存好之後下拉會自己顯示成套用中（由值推導，不存旗標）', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(screen.getAllByRole('button', { name: '另存' })[0]);
    await user.type(screen.getByLabelText('設定檔名稱'), 'DS');
    await user.click(screen.getAllByRole('button', { name: '儲存' })[0]);

    expect(mainProfileSelect().value).not.toBe('');
    // 套用中才會出現這兩顆
    expect(screen.getAllByRole('button', { name: '更新' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: '刪除' }).length).toBeGreaterThan(0);
  });

  it('套用設定檔會把供應商、端點與型號一起換過去', async () => {
    const user = userEvent.setup();
    localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify([{
      id: 'p1', label: 'Claude 寫景', provider: 'anthropic',
      baseUrl: 'https://api.anthropic.com', model: 'claude-sonnet-5',
      apiKey: 'sk-ant', maxTokens: 4096,
    }]));
    renderModal();
    await user.selectOptions(mainProfileSelect(), 'p1');
    expect(mainProviderSelect().value).toBe('anthropic');
    expect(mainModelSelect().value).toBe('claude-sonnet-5');
  });

  it('改掉型號之後下拉退回「未套用」，不會繼續掛著一個不成立的名字', async () => {
    const user = userEvent.setup();
    localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify([{
      id: 'p1', label: 'DS', provider: 'openai',
      baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat',
      apiKey: 'sk-ds', maxTokens: 2048,
    }]));
    renderModal();
    expect(mainProfileSelect().value).toBe('p1');
    await user.selectOptions(mainModelSelect(), 'deepseek-reasoner');
    expect(mainProfileSelect().value).toBe('');
  });

  it('刪除會從 localStorage 拿掉', async () => {
    const user = userEvent.setup();
    localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify([{
      id: 'p1', label: 'DS', provider: 'openai',
      baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat',
      apiKey: 'sk-ds', maxTokens: 2048,
    }]));
    renderModal();
    await user.click(screen.getAllByRole('button', { name: '刪除' })[0]);
    expect(loadProfiles(localStorage)).toEqual([]);
  });

  it('localStorage 寫不進去時明講，不靜默失敗', async () => {
    const user = userEvent.setup();
    renderModal();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError'); });
    await user.click(screen.getAllByRole('button', { name: '另存' })[0]);
    await user.type(screen.getByLabelText('設定檔名稱'), 'X');
    await user.click(screen.getAllByRole('button', { name: '儲存' })[0]);
    expect(screen.getByRole('alert').textContent).toContain('設定檔未能寫入');
    vi.restoreAllMocks();
  });

  it('主 GM 與助理 GM 各有自己的設定檔下拉，共用同一份清單', () => {
    localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify([{
      id: 'p1', label: 'DS', provider: 'openai',
      baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat',
      apiKey: 'sk-ds', maxTokens: 2048,
    }]));
    renderModal();
    const selects = screen.getAllByLabelText('設定檔');
    expect(selects).toHaveLength(2);
    for (const s of selects) {
      expect(Array.from((s as HTMLSelectElement).options).some(o => o.value === 'p1')).toBe(true);
    }
  });
});
