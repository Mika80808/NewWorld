// @vitest-environment jsdom
import '../../test/setupDom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAIRequest } from '../useAIRequest';
import type { GMConfig, SubGMConfig } from '../../types';

// Gemini SDK 不該在這幾個案例被載入——被載到代表分流走錯邊
const sdk = vi.hoisted(() => ({ stream: vi.fn(), generate: vi.fn() }));
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent: sdk.generate, generateContentStream: sdk.stream };
  },
}));

const main = (over: Partial<GMConfig> = {}): GMConfig => ({
  provider: 'openai', apiKey: 'sk-test', model: 'gpt-5',
  maxTokens: 100, baseUrl: 'https://api.openai.com/v1', lastSaved: '', ...over,
});
const sub = (over: Partial<SubGMConfig> = {}): SubGMConfig => ({ ...main(), useSameKey: true, ...over });

const setup = (m = main(), s = sub()) => renderHook(() => useAIRequest(m, s));

const encoder = new TextEncoder();
/** 假的串流回應：chunks 是分塊邊界，刻意切在半行 JSON 上也要能還原 */
function sseResponse(chunks: string[]): Response {
  let i = 0;
  return {
    ok: true, status: 200,
    body: {
      getReader: () => ({
        read: async () => (i < chunks.length
          ? { done: false, value: encoder.encode(chunks[i++]) }
          : { done: true, value: undefined }),
      }),
    },
  } as unknown as Response;
}
const jsonResponse = (json: unknown): Response =>
  ({ ok: true, status: 200, json: async () => json } as unknown as Response);
const errorResponse = (status: number, body: string): Response =>
  ({ ok: false, status, text: async () => body, json: async () => JSON.parse(body) } as unknown as Response);

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  sdk.generate.mockReset();
  sdk.stream.mockReset();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('OpenAI 相容供應商', () => {
  it('串流：分塊切在半行 JSON 上也要完整還原，不吃掉任何一段文字', async () => {
    fetchMock.mockResolvedValue(sseResponse([
      'data: {"choices":[{"delta":{"content":"月湖"}}]}\n\ndata: {"choices":[{"del',
      'ta":{"content":"鎮的黃昏"}}]}\n\ndata: [DONE]\n\n',
    ]));
    const { result } = setup();
    const chunks = vi.fn();
    await expect(result.current.callAI('說個故事', { role: 'main', onChunk: chunks })).resolves.toBe('月湖鎮的黃昏');
    expect(chunks.mock.calls.flat()).toEqual(['月湖', '鎮的黃昏']);
    expect(sdk.stream).not.toHaveBeenCalled();
  });

  it('非串流：取 choices[0].message.content，且請求打在 /chat/completions', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ choices: [{ message: { content: ' 摘要 ' } }] }));
    const { result } = setup();
    await expect(result.current.callAI('整理')).resolves.toBe('摘要');
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.openai.com/v1/chat/completions');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).model).toBe('gpt-5');
  });

  it('json 模式被端點拒絕（400）時拿掉參數重試一次，助理 GM 不會整組停擺', async () => {
    fetchMock
      .mockResolvedValueOnce(errorResponse(400, '{"error":{"message":"response_format is not supported"}}'))
      .mockResolvedValueOnce(jsonResponse({ choices: [{ message: { content: '{"ok":1}' } }] }));
    const { result } = setup();
    await expect(result.current.callAI('整理', { responseJson: true })).resolves.toBe('{"ok":1}');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).response_format).toEqual({ type: 'json_object' });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).response_format).toBeUndefined();
  });

  it('與 json 無關的 400 直接報錯，不要白白多送一次請求', async () => {
    fetchMock.mockResolvedValue(errorResponse(400, '{"error":{"message":"model not found"}}'));
    const { result } = setup();
    await expect(result.current.callAI('整理', { responseJson: true })).rejects.toThrow(/model not found/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('429 會照既有退避重試（錯誤訊息長成 HTTP 429，isRetryable 才比對得到）', async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(errorResponse(429, '{"error":{"message":"rate limit"}}'))
      .mockResolvedValueOnce(jsonResponse({ choices: [{ message: { content: '好了' } }] }));
    const { result } = setup();
    const pending = result.current.callAI('整理');
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(pending).resolves.toBe('好了');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('401 不重試，把供應商的錯誤訊息帶出來給玩家看', async () => {
    fetchMock.mockResolvedValue(errorResponse(401, '{"error":{"message":"Incorrect API key"}}'));
    const { result } = setup();
    await expect(result.current.callAI('整理')).rejects.toThrow(/Incorrect API key/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('本機端點沒有金鑰也要照常發請求', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ choices: [{ message: { content: 'ok' } }] }));
    const local = main({ apiKey: '', baseUrl: 'http://localhost:11434/v1', model: 'llama3' });
    const { result } = setup(local, { ...local, useSameKey: false });
    await expect(result.current.callAI('整理')).resolves.toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('雲端端點缺金鑰時仍然完全不發請求（既有行為）', async () => {
    const noKey = main({ apiKey: '' });
    const { result } = setup(noKey, { ...noKey, useSameKey: false });
    await expect(result.current.callAI('整理')).resolves.toBe('');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('Anthropic 供應商', () => {
  it('串流只取 text_delta，ping 與 message_start 不會混進故事', async () => {
    fetchMock.mockResolvedValue(sseResponse([
      'event: message_start\ndata: {"type":"message_start"}\n\n',
      'event: ping\ndata: {"type":"ping"}\n\n',
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"霧散了"}}\n\n',
      'data: {"type":"message_stop"}\n\n',
    ]));
    const cfg = main({ provider: 'anthropic', model: 'claude-sonnet-5', baseUrl: 'https://api.anthropic.com' });
    const { result } = setup(cfg, { ...cfg, useSameKey: true });
    const chunks = vi.fn();
    await expect(result.current.callAI('說個故事', { role: 'main', onChunk: chunks })).resolves.toBe('霧散了');
    expect(chunks.mock.calls.flat()).toEqual(['霧散了']);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.anthropic.com/v1/messages');
  });
});

describe('跨供應商的金鑰共用', () => {
  it('兩邊同一家時助理 GM 沿用主 GM 的金鑰', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ choices: [{ message: { content: 'ok' } }] }));
    const { result } = setup(main({ apiKey: 'sk-main' }), sub({ apiKey: '', useSameKey: true }));
    await result.current.callAI('整理');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer sk-main');
  });

  it('兩邊不同家時不共用——拿 Gemini 的 key 去打 OpenAI 只會 401', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ choices: [{ message: { content: 'ok' } }] }));
    const mainCfg = main({ provider: 'gemini', apiKey: 'gemini-key', model: 'gemini-2.5-flash', baseUrl: '' });
    const subCfg = sub({ provider: 'openai', apiKey: 'sk-sub', useSameKey: true });
    const { result } = setup(mainCfg, subCfg);
    await result.current.callAI('整理');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer sk-sub');
  });
});

describe('Gemini 仍走官方 SDK', () => {
  it('provider 是 gemini 時不碰 fetch', async () => {
    sdk.generate.mockResolvedValue({ text: '摘要' });
    const cfg = main({ provider: 'gemini', model: 'gemini-2.5-flash', baseUrl: '' });
    const { result } = setup(cfg, { ...cfg, useSameKey: true });
    await expect(result.current.callAI('整理')).resolves.toBe('摘要');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
