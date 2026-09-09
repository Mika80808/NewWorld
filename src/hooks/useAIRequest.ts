/** AI 請求：各呼叫獨立取消、每次嘗試限制時間、可中止的重試退避。 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { GMConfig, SubGMConfig } from '../types';

// SDK 延遲載入；下載失敗後允許下一次呼叫重新載入。
let genaiModulePromise: Promise<typeof import('@google/genai')> | null = null;
function loadGenAI() {
  genaiModulePromise ??= import('@google/genai').catch(error => {
    genaiModulePromise = null;
    throw error;
  });
  return genaiModulePromise;
}

export type AIRequestStatus = 'idle' | 'loading' | 'aborted' | 'timeout' | 'error';
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
    const key = role === 'sub' && subGMConfig.useSameKey ? mainGMConfig.apiKey : cfg.apiKey;
    if (!key.trim()) return '';
    const model = cfg.model || 'gemini-2.0-flash';
    const config = {
      maxOutputTokens: options?.maxTokens ?? cfg.maxTokens,
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
