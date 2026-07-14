/**
 * useAIRequest.ts — AI 請求封裝層（D7 + 多供應商）
 *
 * 功能：
 *   - Timeout：主 GM 90s、Sub GM 30s，超時拋出 REQUEST_TIMEOUT
 *   - Abort：abort() 後，串流迴圈即停止（per-request token 機制）
 *   - Retry：timeout / 429 / 500 / 503 / 529 最多重試 2 次（指數退避）
 *   - 狀態：暴露 aiRequestStatus（'idle' | 'loading' | 'aborted' | 'timeout' | 'error'）
 *   - 多供應商：依 GMConfig.provider 分派至 aiProviders 轉接器
 *     （gemini / claude / openai / local，SDK 差異全部封在轉接器內）
 */
import { useState, useRef, useCallback } from 'react';
import { GMConfig, SubGMConfig } from '../types';
import { callProvider, PROVIDER_META } from '../lib/aiProviders';

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
    // Anthropic / OpenAI SDK 的錯誤帶 status 欄位
    const status = (err as { status?: number }).status;
    if (status === 429 || status === 500 || status === 503 || status === 529) return true;
    const msg = err.message;
    return (
      msg === 'REQUEST_TIMEOUT' ||
      msg.includes('429') ||
      msg.includes('500') ||
      msg.includes('503') ||
      msg.includes('529')
    );
  }
  return false;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useAIRequest(mainGMConfig: GMConfig, subGMConfig: SubGMConfig) {
  const [aiRequestStatus, setAiRequestStatus] = useState<AIRequestStatus>('idle');

  // Per-request abort token：每次呼叫 callAI 遞增，舊請求的串流迴圈偵測到不符即停止
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
      /** 要求模型直接輸出 JSON（structured output）。不支援的模型自動略過 */
      responseJson?: boolean;
    }
  ): Promise<string> => {
    const { role = 'sub' } = options ?? {};
    const cfg = role === 'main' ? mainGMConfig : subGMConfig;
    const provider = cfg.provider || 'gemini';
    // 共用 key 只在供應商相同時才有意義
    const key = (role === 'sub' && subGMConfig.useSameKey && subGMConfig.provider === mainGMConfig.provider)
      ? mainGMConfig.apiKey
      : cfg.apiKey;
    // 本地端點允許空 key，其餘供應商沒 key 直接跳過
    if (!key.trim() && !PROVIDER_META[provider].keyOptional) return '';

    const model  = cfg.model || PROVIDER_META[provider].defaultModel;
    if (!model) return '';
    const tokens = options?.maxTokens ?? cfg.maxTokens;

    abortedRef.current = false;

    for (let attempt = 0; attempt <= MAX_RETRIES[role]; attempt++) {
      if (abortedRef.current) throw new DOMException('Aborted', 'AbortError');
      // 每次 attempt 使用新 token：逾時或 abort 後遞增 token，
      // 讓前一次 attempt 的串流迴圈停止，不再於背景消耗配額
      const myToken = ++requestTokenRef.current;
      try {
        // ── 實際 AI 呼叫（轉接器分派）─────────────────────────────────────────
        const doCall = (): Promise<string> => {
          if (options?.onChunk) options.onStreamStart?.();
          return callProvider(provider, {
            apiKey: key.trim(),
            model,
            prompt,
            maxTokens: tokens,
            baseUrl: cfg.baseUrl,
            responseJson: options?.responseJson,
            onChunk: options?.onChunk,
            shouldAbort: () => requestTokenRef.current !== myToken,
          });
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
    requestTokenRef.current++; // 讓進行中的串流迴圈偵測到 token 不符
    setAiRequestStatus('aborted');
  }, []);

  return { callAI, abort, aiRequestStatus, setAiRequestStatus };
}
