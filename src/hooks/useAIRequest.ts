/**
 * useAIRequest.ts — AI 請求封裝層（D7）
 *
 * 功能：
 *   - Timeout：主 GM 90s、Sub GM 30s，超時拋出 REQUEST_TIMEOUT
 *   - Abort：abort() 後，串流迴圈即停止（per-request token 機制）
 *   - Retry：timeout / 429 / 500 / 503 最多重試 2 次（指數退避）
 *   - 狀態：暴露 aiRequestStatus（'idle' | 'loading' | 'aborted' | 'timeout' | 'error'）
 */
import { useState, useRef, useCallback } from 'react';
import { GoogleGenAI } from '@google/genai';
import { GMConfig, SubGMConfig } from '../types';

export type AIRequestStatus = 'idle' | 'loading' | 'aborted' | 'timeout' | 'error';

const TIMEOUT_MS: Record<'main' | 'sub', number> = {
  main: 90_000,
  sub:  30_000,
};

const MAX_RETRIES: Record<'main' | 'sub', number> = {
  main: 2,
  sub:  1,
};

function isRetryable(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message;
    return (
      msg === 'REQUEST_TIMEOUT' ||
      msg.includes('429') ||
      msg.includes('500') ||
      msg.includes('503')
    );
  }
  return false;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useAIRequest(mainGMConfig: GMConfig, subGMConfig: SubGMConfig) {
  const [aiRequestStatus, setAiRequestStatus] = useState<AIRequestStatus>('idle');

  // Per-request abort token：每次呼叫 callAI 遞增，舊請求的 for-await 迴圈偵測到不符即停止
  const requestTokenRef = useRef(0);
  // abort 旗標：涵蓋重試退避空檔（token 已被下一次 attempt 重設時仍能偵測到中止）
  const abortedRef = useRef(false);

  // ── callAI ──────────────────────────────────────────────────────────────────
  const callAI = useCallback(async (
    prompt: string,
    options?: {
      role?: 'main' | 'sub';
      maxTokens?: number;
      onChunk?: (chunk: string) => void;
      /** 每次串流 attempt 開始時呼叫（重試會再次觸發），供呼叫端重置累積的串流文字 */
      onStreamStart?: () => void;
      /** 要求模型直接輸出 JSON（structured output）。Gemma 開源模型不支援，會自動略過 */
      responseJson?: boolean;
    }
  ): Promise<string> => {
    const { role = 'sub' } = options ?? {};
    const cfg = role === 'main' ? mainGMConfig : subGMConfig;
    const key = (role === 'sub' && subGMConfig.useSameKey)
      ? mainGMConfig.apiKey
      : cfg.apiKey;
    if (!key.trim()) return '';

    const model  = cfg.model || 'gemini-2.0-flash';
    const tokens = options?.maxTokens ?? cfg.maxTokens;

    const callConfig: Record<string, unknown> = { maxOutputTokens: tokens };
    if (options?.responseJson && !model.startsWith('gemma')) {
      callConfig.responseMimeType = 'application/json';
    }

    abortedRef.current = false;

    for (let attempt = 0; attempt <= MAX_RETRIES[role]; attempt++) {
      if (abortedRef.current) throw new DOMException('Aborted', 'AbortError');
      // 每次 attempt 使用新 token：逾時或 abort 後遞增 token，
      // 讓前一次 attempt 的串流迴圈停止，不再於背景消耗配額
      const myToken = ++requestTokenRef.current;
      try {
        const ai = new GoogleGenAI({ apiKey: key.trim() });

        // ── 實際 AI 呼叫（streaming 或 non-streaming）───────────────────────
        const doCall = async (): Promise<string> => {
          if (options?.onChunk) {
            // Streaming path（主 GM）
            options.onStreamStart?.();
            const response = await ai.models.generateContentStream({
              model, contents: prompt, config: callConfig,
            });
            let fullText = '';
            for await (const chunk of response) {
              // Abort 檢查：token 不符表示外部已呼叫 abort()
              if (requestTokenRef.current !== myToken) {
                throw new DOMException('Aborted', 'AbortError');
              }
              if (chunk.text) {
                fullText += chunk.text;
                options.onChunk(chunk.text);
              }
            }
            return fullText;
          } else {
            // Non-streaming path（Sub GM）
            const response = await ai.models.generateContent({
              model, contents: prompt, config: callConfig,
            });
            return response.text?.trim() || '';
          }
        };

        // ── Timeout race ─────────────────────────────────────────────────────
        let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutTimer = setTimeout(() => {
            // 讓進行中的串流迴圈偵測到 token 不符而停止
            if (requestTokenRef.current === myToken) requestTokenRef.current++;
            reject(new Error('REQUEST_TIMEOUT'));
          }, TIMEOUT_MS[role]);
        });

        try {
          return await Promise.race([doCall(), timeoutPromise]);
        } finally {
          clearTimeout(timeoutTimer);
        }

      } catch (err) {
        // Abort：不重試，直接往上拋
        if (err instanceof DOMException && err.name === 'AbortError') throw err;

        const isLast = attempt >= MAX_RETRIES[role];
        if (isLast || !isRetryable(err)) throw err;

        // 指數退避
        await new Promise(r => setTimeout(r, 1_000 * Math.pow(2, attempt)));
      }
    }

    return ''; // unreachable
  }, [mainGMConfig, subGMConfig]);

  // ── abort：廢棄當前請求 ──────────────────────────────────────────────────────
  const abort = useCallback(() => {
    abortedRef.current = true;
    requestTokenRef.current++; // 讓進行中的 for-await 迴圈偵測到 token 不符
    setAiRequestStatus('aborted');
  }, []);

  return { callAI, abort, aiRequestStatus, setAiRequestStatus };
}
