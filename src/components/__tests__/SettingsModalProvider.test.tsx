// @vitest-environment jsdom
import '../../test/setupDom';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsModal } from '../SettingsModal';
import { GMConfig, SubGMConfig } from '../../types';
import { providerMeta } from '../../utils/aiProviders';

const noop = () => {};

const renderModal = (main: Partial<GMConfig> = {}, sub: Partial<SubGMConfig> = {}) => {
  const mainCfg: GMConfig = { provider: 'gemini', apiKey: '', model: 'gemini-2.5-flash', maxTokens: 8192, baseUrl: '', lastSaved: '', ...main };
  const subCfg: SubGMConfig = { ...mainCfg, maxTokens: 512, useSameKey: true, ...sub };
  return render(
    <SettingsModal
      isOpen onClose={noop}
      mainGMConfig={mainCfg} setMainGMConfig={noop}
      subGMConfig={subCfg} setSubGMConfig={noop}
      handleExportSave={noop} handleImportSave={noop} handleResetGame={noop}
    />
  );
};

const providerSelect = () => screen.getAllByLabelText('供應商')[0] as HTMLSelectElement;
const modelSelect = () => screen.getAllByLabelText('模型')[0] as HTMLSelectElement;
const endpointSelect = () => screen.queryAllByLabelText('端點')[0] as HTMLSelectElement | undefined;

beforeEach(() => localStorage.clear());

describe('SettingsModal — 供應商切換', () => {
  it('預設 Gemini 時沒有端點欄位（走官方 SDK，沒有端點這個概念）', () => {
    renderModal();
    expect(endpointSelect()).toBeUndefined();
  });

  it('換到 OpenAI 相容：型號與端點一起換掉，不會留著上一家的 model id', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.selectOptions(providerSelect(), 'openai');
    expect(modelSelect().value).toBe(providerMeta('openai').defaultModel);
    expect(endpointSelect()?.value).toBe(providerMeta('openai').defaultBaseUrl);
  });

  it('換端點會一併帶上那家服務的常用型號', async () => {
    const user = userEvent.setup();
    renderModal({ provider: 'openai', model: 'gpt-5', baseUrl: 'https://api.openai.com/v1' });
    await user.selectOptions(endpointSelect()!, 'https://api.deepseek.com/v1');
    expect(modelSelect().value).toBe('deepseek-chat');
  });

  it('自訂端點會開出一個自由輸入框', async () => {
    const user = userEvent.setup();
    renderModal({ provider: 'openai', model: 'gpt-5', baseUrl: 'https://api.openai.com/v1' });
    await user.selectOptions(endpointSelect()!, '__custom__');
    expect(screen.getByLabelText('自訂端點')).toBeInTheDocument();
  });

  it('Anthropic 的型號清單換成 Claude', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.selectOptions(providerSelect(), 'anthropic');
    expect(modelSelect().value.startsWith('claude')).toBe(true);
  });
});

describe('SettingsModal — 助理 GM 共用金鑰', () => {
  it('兩邊同一家時可以勾選共用', () => {
    renderModal();
    const share = screen.getByLabelText(/使用與主 GM 相同的 API Key/) as HTMLInputElement;
    expect(share.disabled).toBe(false);
    expect(share.checked).toBe(true);
  });

  it('兩邊不同家時共用被鎖住，並要求填自己的 Key', () => {
    // 拿 Gemini 的 key 去打 OpenAI 只會 401，勾選框看起來卻一切正常
    renderModal({ provider: 'gemini' }, { provider: 'openai', model: 'gpt-5', baseUrl: 'https://api.openai.com/v1' });
    const share = screen.getByLabelText(/使用與主 GM 相同的 API Key/) as HTMLInputElement;
    expect(share.disabled).toBe(true);
    expect(share.checked).toBe(false);
    expect(screen.getByText(/助理 GM 需要自己的 Key/)).toBeInTheDocument();
    expect(screen.getByText('助理 GM API Key')).toBeInTheDocument();
  });
});
