/** AI 請求：各呼叫獨立取消、每次嘗試限制時間、可中止的重試退避。 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { GMConfig, SubGMConfig } from '../types';
import {
  buildChatRequest, dataLinesOf, extractErrorMessage, extractStreamDelta, extractText,
  providerMeta, requiresApiKey, splitSSEEvents,
} from '../utils/aiProviders';

// SDK 延遲載入；下載失敗後允許下一次呼叫重新載入。
let genaiModulePromise: Promise<typeof import('@google/genai')> | null = null;
function loadGenAI() {
  genaiModulePromise ??= import('@google/genai').catch(error => {
    genaiModulePromise = null;
    throw error;
  });
  return genaiModulePromise;
}

type AIRequestStatus = 'idle' | 'loading' | 'aborted' | 'timeout' | 'error';
const TIMEOUT_MS = { main: 90_000, sub: 30_000 };
const MAX_RETRIES = { main: 2, sub: 1 };
const abortError = () => new DOMException('Aborted', 'AbortError');

function isRetryable(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return err.message === 'REQUEST_TIMEOUT' || /\b(429|500|503)\b/.test(err.message);
}

function waitForRetry(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(abortError()); return; }
    const onAbort = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      reject(abortError());
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}


interface HttpCallOptions {
  provider: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
  maxTokens: number;
  responseJson?: boolean;
  onChunk?: (chunk: string) => void;
  onStreamStart?: () => void;
  signal: AbortSignal;
  ensureActive: () => void;
}

/**
 * Gemini 以外的供應商一律走 fetch（OpenAI 相容與 Anthropic 共用這個流程，
 * 差異全部收在 `utils/aiProviders.ts` 的純函數裡）。
 *
 * 錯誤訊息刻意做成 `HTTP 429 ...` 的形式：外層 `isRetryable` 以
 * `\b(429|500|503)\b` 比對，字串長成 `HTTP_429` 的話 `_` 兩側都是詞字元、
 * 沒有邊界，重試會整個失效。
 */
async function callHttpProvider(o: HttpCallOptions): Promise<string> {
  const stream = !!o.onChunk;
  const send = (responseJson: boolean | undefined) => {
    const req = buildChatRequest({
      provider: o.provider, baseUrl: o.baseUrl, apiKey: o.apiKey, model: o.model,
      prompt: o.prompt, maxTokens: o.maxTokens, stream, responseJson,
    });
    return fetch(req.url, {
      method: 'POST',
      headers: req.headers,
      body: JSON.stringify(req.body),
      signal: o.signal,
    });
  };

  let response = await send(o.responseJson);
  // 不是每個 OpenAI 相容服務都吃 json 模式（本機模型尤其常見）。
  // 400 就把它拿掉重試一次——prompt 本身已經要求輸出 JSON，少了這個參數仍能用，
  // 直接報錯則是整個助理 GM 停擺。
  if (!response.ok && response.status === 400 && o.responseJson) {
    const body = await response.text().catch(() => '');
    if (/response_format|json/i.test(body)) {
      response = await send(false);
    } else {
      throw new Error(`HTTP 400 ${extractErrorMessage(body)}`);
    }
  }
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`HTTP ${response.status} ${extractErrorMessage(body)}`);
  }

  if (!stream) {
    const json = await response.json();
    o.ensureActive();
    return extractText(o.provider, json).trim();
  }

  o.onStreamStart?.();
  const reader = response.body?.getReader();
  if (!reader) {
    // 少數環境拿不到 ReadableStream（舊瀏覽器、某些代理），退回一次性讀取，
    // 至少把整段文字交出去，而不是讓故事一片空白
    const json = await response.json();
    o.ensureActive();
    const text = extractText(o.provider, json);
    if (text) o.onChunk?.(text);
    return text;
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  for (;;) {
    const { done, value } = await reader.read();
    o.ensureActive();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const { events, rest } = splitSSEEvents(buffer);
    buffer = rest;
    for (const event of events) {
      for (const line of dataLinesOf(event)) {
        const delta = extractStreamDelta(o.provider, line);
        if (delta) {
          fullText += delta;
          o.onChunk?.(delta);
        }
      }
    }
  }
  o.ensureActive();
  return fullText;
}

export function useAIRequest(mainGMConfig: GMConfig, subGMConfig: SubGMConfig) {
  const [aiRequestStatus, setAiRequestStatus] = useState<AIRequestStatus>('idle');
  // 背景整理與故事串流可並行；新請求不能廢棄另一個請求或解除它的中止狀態。
  const activeRequests = useRef(new Set<AbortController>());
  useEffect(() => {
    const requests = activeRequests.current;
    return () => { for (const request of requests) request.abort(); };
  }, []);

  const callAI = useCallback(async (
    prompt: string,
    options?: {
      role?: 'main' | 'sub';
      maxTokens?: number;
      onChunk?: (chunk: string) => void;
      onStreamStart?: () => void;
      responseJson?: boolean;
    }
  ): Promise<string> => {
    const { role = 'sub' } = options ?? {};
    const cfg = role === 'main' ? mainGMConfig : subGMConfig;
    // 共用金鑰只在兩邊是同一家供應商時成立——拿 Gemini 的 key 去打 OpenAI
    // 只會得到 401，而畫面上那個勾選框看起來一切正常
    const shareKey = role === 'sub' && subGMConfig.useSameKey && subGMConfig.provider === mainGMConfig.provider;
    const key = shareKey ? mainGMConfig.apiKey : cfg.apiKey;
    const meta = providerMeta(cfg.provider);
    const baseUrl = cfg.baseUrl || meta.defaultBaseUrl;
    if (!key.trim() && requiresApiKey(cfg.provider, baseUrl)) return '';
    // 型號留空時退回該供應商的預設，不是寫死的 Gemini 型號
    const model = cfg.model || meta.defaultModel;
    const maxTokens = options?.maxTokens ?? cfg.maxTokens;
    const config = {
      maxOutputTokens: maxTokens,
      ...(options?.responseJson && !model.startsWith('gemma') ? { responseMimeType: 'application/json' } : {}),
    };
    const request = new AbortController();
    activeRequests.current.add(request);
    try {
      for (let attempt = 0; attempt <= MAX_RETRIES[role]; attempt++) {
        if (request.signal.aborted) throw abortError();
        const controller = new AbortController();
        let timer: ReturnType<typeof setTimeout> | undefined;
        let onAbort = () => {};
        const interrupted = new Promise<never>((_, reject) => {
          onAbort = () => { reject(abortError()); controller.abort(); };
          request.signal.addEventListener('abort', onAbort, { once: true });
          timer = setTimeout(() => {
            reject(new Error('REQUEST_TIMEOUT'));
            controller.abort();
          }, TIMEOUT_MS[role]);
        });
        const ensureActive = () => {
          if (controller.signal.aborted || request.signal.aborted) throw abortError();
        };
        const doCall = async () => {
          if (cfg.provider !== 'gemini') {
            return callHttpProvider({
              provider: cfg.provider, baseUrl, apiKey: key, model, prompt, maxTokens,
              responseJson: options?.responseJson,
              onChunk: options?.onChunk, onStreamStart: options?.onStreamStart,
              signal: controller.signal, ensureActive,
            });
          }
          const { GoogleGenAI } = await loadGenAI();
          ensureActive();
          const ai = new GoogleGenAI({ apiKey: key.trim() });
          const params = { model, contents: prompt, config: { ...config, abortSignal: controller.signal } };
          if (!options?.onChunk) {
            const response = await ai.models.generateContent(params);
            ensureActive();
            return response.text?.trim() || '';
          }
          options.onStreamStart?.();
          const response = await ai.models.generateContentStream(params);
          let fullText = '';
          for await (const chunk of response) {
            ensureActive();
            if (chunk.text) {
              fullText += chunk.text;
              options.onChunk(chunk.text);
            }
          }
          ensureActive();
          return fullText;
        };
        let retry = false;
        try {
          return await Promise.race([doCall(), interrupted]);
        } catch (error) {
          if (request.signal.aborted) throw abortError();
          if (attempt >= MAX_RETRIES[role] || !isRetryable(error)) throw error;
          retry = true;
        } finally {
          clearTimeout(timer);
          request.signal.removeEventListener('abort', onAbort);
          controller.abort();
        }
        if (retry) await waitForRetry(1_000 * 2 ** attempt, request.signal);
      }
      return '';
    } finally {
      activeRequests.current.delete(request);
    }
  }, [mainGMConfig, subGMConfig]);

  // 重置遊戲與使用者中止都會取消當時的請求；後續新請求獨立開始。
  const abort = useCallback(() => {
    for (const request of activeRequests.current) request.abort();
    setAiRequestStatus('aborted');
  }, []);

  return { callAI, abort, aiRequestStatus, setAiRequestStatus };
}
