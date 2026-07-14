/**
 * aiProviders.ts — AI 供應商轉接器層
 *
 * callAI（useAIRequest）持有通用邏輯（timeout/retry/abort/role 分流），
 * 本檔負責各供應商的 SDK 差異：
 *   - gemini：@google/genai（原生）
 *   - claude：@anthropic-ai/sdk（BYOK 瀏覽器模式）
 *   - openai：openai SDK
 *   - local ：openai SDK + 自訂 baseUrl（Ollama / LM Studio 等 OpenAI 相容端點）
 *
 * 中止機制沿用 useAIRequest 的 per-request token：轉接器在串流迴圈中
 * 呼叫 shouldAbort()，為真時擲出 AbortError 停止背景消耗。
 */
// Claude / OpenAI SDK 採動態 import：只有玩家選用該供應商時才下載對應 chunk，
// 預設的 Gemini 玩家不需承擔額外 bundle 體積
import { GoogleGenAI } from '@google/genai';
import { AIProvider } from '../types';

// ─── 轉接器共用參數 ────────────────────────────────────────────────────────────
export interface AdapterParams {
  apiKey: string;
  model: string;
  prompt: string;
  maxTokens: number;
  baseUrl?: string;                    // local 專用
  responseJson?: boolean;              // structured output（不支援的模型自動略過）
  onChunk?: (chunk: string) => void;   // 有值走 streaming
  shouldAbort: () => boolean;          // 串流中檢查中止
}

const abortError = () => new DOMException('Aborted', 'AbortError');

// ─── 供應商中繼資料（設定 UI 用）──────────────────────────────────────────────
export interface ProviderMeta {
  label: string;
  defaultModel: string;
  models: { value: string; label: string }[];   // 空陣列 = 自由輸入模型名
  keyPlaceholder: string;
  keyUrl?: string;
  keyOptional?: boolean;    // local 端點通常不需要 key
  needsBaseUrl?: boolean;
}

export const GEMINI_MODELS = [
  { value: 'gemini-3.1-pro-preview',    label: 'Gemini 3.1 Pro Preview（最強推理）' },
  { value: 'gemini-3-flash-preview',    label: 'Gemini 3 Flash Preview（快速／均衡）' },
  { value: 'gemini-3.1-flash-lite-preview', label: 'Gemini 3.1 Flash Lite Preview（最省費）' },
  { value: 'gemini-2.5-pro',            label: 'Gemini 2.5 Pro（穩定最強）' },
  { value: 'gemini-2.5-flash',          label: 'Gemini 2.5 Flash（穩定快速）' },
  { value: 'gemini-2.5-flash-lite',     label: 'Gemini 2.5 Flash Lite（穩定輕量）' },
  { value: 'gemini-2.0-flash',          label: 'Gemini 2.0 Flash（舊版快速）' },
  { value: 'gemini-2.0-flash-lite',     label: 'Gemini 2.0 Flash Lite（舊版輕量）' },
  { value: 'gemma-4-31b-it',            label: 'Gemma 4 31B（開源模型）' },
];

export const CLAUDE_MODELS = [
  { value: 'claude-opus-4-8',  label: 'Claude Opus 4.8（最強劇情）' },
  { value: 'claude-sonnet-5',  label: 'Claude Sonnet 5（均衡推薦）' },
  { value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5（快速省費）' },
];

export const OPENAI_MODELS = [
  { value: 'gpt-5.1',      label: 'GPT-5.1（最強推理）' },
  { value: 'gpt-5-mini',   label: 'GPT-5 mini（均衡）' },
  { value: 'gpt-5-nano',   label: 'GPT-5 nano（最省費）' },
  { value: 'gpt-4.1',      label: 'GPT-4.1（穩定）' },
  { value: 'gpt-4.1-mini', label: 'GPT-4.1 mini（穩定輕量）' },
];

export const PROVIDER_META: Record<AIProvider, ProviderMeta> = {
  gemini: {
    label: 'Google Gemini',
    defaultModel: 'gemini-2.5-flash',
    models: GEMINI_MODELS,
    keyPlaceholder: '貼上 Gemini API Key...',
    keyUrl: 'https://aistudio.google.com/app/apikey',
  },
  claude: {
    label: 'Anthropic Claude',
    defaultModel: 'claude-sonnet-5',
    models: CLAUDE_MODELS,
    keyPlaceholder: '貼上 Anthropic API Key...',
    keyUrl: 'https://platform.claude.com/',
  },
  openai: {
    label: 'OpenAI',
    defaultModel: 'gpt-5-mini',
    models: OPENAI_MODELS,
    keyPlaceholder: '貼上 OpenAI API Key...',
    keyUrl: 'https://platform.openai.com/api-keys',
  },
  local: {
    label: '本地模型（OpenAI 相容）',
    defaultModel: '',
    models: [],   // 自由輸入
    keyPlaceholder: '通常可留空（依端點而定）',
    keyOptional: true,
    needsBaseUrl: true,
  },
};

export const DEFAULT_LOCAL_BASE_URL = 'http://localhost:11434/v1';

// ─── Gemini ───────────────────────────────────────────────────────────────────
async function callGemini(p: AdapterParams): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: p.apiKey });
  const config: Record<string, unknown> = { maxOutputTokens: p.maxTokens };
  // Gemma 開源模型不支援 structured output，自動略過
  if (p.responseJson && !p.model.startsWith('gemma')) {
    config.responseMimeType = 'application/json';
  }

  if (p.onChunk) {
    const response = await ai.models.generateContentStream({
      model: p.model, contents: p.prompt, config,
    });
    let fullText = '';
    for await (const chunk of response) {
      if (p.shouldAbort()) throw abortError();
      if (chunk.text) {
        fullText += chunk.text;
        p.onChunk(chunk.text);
      }
    }
    return fullText;
  }

  const response = await ai.models.generateContent({
    model: p.model, contents: p.prompt, config,
  });
  return response.text?.trim() || '';
}

// ─── Claude ───────────────────────────────────────────────────────────────────
async function callClaude(p: AdapterParams): Promise<string> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  // BYOK 純前端模式：key 是玩家自己的、只存本機 localStorage（與 Gemini 相同模式）
  const client = new Anthropic({ apiKey: p.apiKey, dangerouslyAllowBrowser: true });
  // responseJson：Claude 無 schema-less JSON 模式，依賴 prompt 內的 JSON 格式指示即可
  const request = {
    model: p.model,
    max_tokens: p.maxTokens,
    messages: [{ role: 'user' as const, content: p.prompt }],
  };

  if (p.onChunk) {
    const stream = client.messages.stream(request);
    let fullText = '';
    for await (const event of stream) {
      if (p.shouldAbort()) {
        stream.controller.abort();
        throw abortError();
      }
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        fullText += event.delta.text;
        p.onChunk(event.delta.text);
      }
    }
    return fullText;
  }

  const response = await client.messages.create(request);
  return response.content
    .flatMap(b => (b.type === 'text' ? [b.text] : []))
    .join('')
    .trim();
}

// ─── OpenAI / 本地（OpenAI 相容端點）─────────────────────────────────────────
async function callOpenAICompat(p: AdapterParams, isOfficialOpenAI: boolean): Promise<string> {
  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({
    apiKey: p.apiKey || 'not-needed',   // 本地端點通常不驗證 key，SDK 要求非空
    baseURL: isOfficialOpenAI ? undefined : (p.baseUrl || DEFAULT_LOCAL_BASE_URL),
    dangerouslyAllowBrowser: true,
  });

  const request = {
    model: p.model,
    messages: [{ role: 'user' as const, content: p.prompt }],
    // 官方 API 新模型改用 max_completion_tokens；本地端點普遍只認 max_tokens
    ...(isOfficialOpenAI
      ? { max_completion_tokens: p.maxTokens }
      : { max_tokens: p.maxTokens }),
    // 本地模型對 response_format 支援不一，僅官方端點啟用
    ...(p.responseJson && isOfficialOpenAI
      ? { response_format: { type: 'json_object' as const } }
      : {}),
  };

  if (p.onChunk) {
    const stream = await client.chat.completions.create({ ...request, stream: true });
    let fullText = '';
    for await (const chunk of stream) {
      if (p.shouldAbort()) {
        stream.controller.abort();
        throw abortError();
      }
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        fullText += delta;
        p.onChunk(delta);
      }
    }
    return fullText;
  }

  const response = await client.chat.completions.create(request);
  return response.choices[0]?.message?.content?.trim() || '';
}

// ─── 統一入口 ─────────────────────────────────────────────────────────────────
export function callProvider(provider: AIProvider, params: AdapterParams): Promise<string> {
  switch (provider) {
    case 'gemini': return callGemini(params);
    case 'claude': return callClaude(params);
    case 'openai': return callOpenAICompat(params, true);
    case 'local':  return callOpenAICompat(params, false);
  }
}
