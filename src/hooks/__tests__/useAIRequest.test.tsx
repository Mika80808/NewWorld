// @vitest-environment jsdom
import '../../test/setupDom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useAIRequest } from '../useAIRequest';
import type { GMConfig } from '../../types';

const sdk = vi.hoisted(() => ({ stream: vi.fn(), generate: vi.fn() }));
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent: sdk.generate, generateContentStream: sdk.stream };
  },
}));
const config: GMConfig = { provider:'gemini', apiKey:'test-key', model:'test-model', maxTokens:100, lastSaved:'' };
const setup = () => renderHook(() => useAIRequest(config, {...config,useSameKey:true}));
const deferred = <T,>() => {
  let resolve!: (value:T) => void;
  const promise = new Promise<T>(r => { resolve=r; });
  return {promise,resolve};
};
beforeEach(() => { vi.useFakeTimers(); sdk.generate.mockReset(); sdk.stream.mockReset(); });
afterEach(() => vi.useRealTimers());

describe('AI request lifecycle', () => {
  it('背景助理請求不會中止故事串流', async () => {
    const gate = deferred<void>();
    sdk.stream.mockResolvedValue((async function*() { yield {text:'前半'}; await gate.promise; yield {text:'後半'}; })());
    sdk.generate.mockResolvedValue({text:'摘要'});
    const {result} = setup();
    const chunks = vi.fn();
    const story = result.current.callAI('story',{role:'main',onChunk:chunks});
    await vi.advanceTimersByTimeAsync(0);
    await expect(result.current.callAI('summary')).resolves.toBe('摘要');
    gate.resolve();
    await expect(story).resolves.toBe('前半後半');
    expect(chunks.mock.calls.flat()).toEqual(['前半','後半']);
  });
  it('取消立即結束沒有回應的非串流請求，新請求不會重新啟用舊請求', async () => {
    const late = deferred<{text:string}>();
    sdk.generate.mockReturnValueOnce(late.promise).mockResolvedValue({text:'新結果'});
    const {result} = setup();
    const pending = result.current.callAI('old');
    const rejected = expect(pending).rejects.toMatchObject({name:'AbortError'});
    await vi.advanceTimersByTimeAsync(0);
    const signal = sdk.generate.mock.calls[0][0].config.abortSignal;
    act(() => result.current.abort());
    await rejected;
    expect(signal.aborted).toBe(true);
    await expect(result.current.callAI('new')).resolves.toBe('新結果');
    late.resolve({text:'舊結果'});
    expect(vi.getTimerCount()).toBe(0);
  });
  it('逾時會中止底層請求，重試不收取上一輪晚到的串流片段', async () => {
    const gate=deferred<void>();
    sdk.stream.mockResolvedValueOnce((async function*(){yield {text:'舊'};await gate.promise;yield {text:'不應收到'};})())
      .mockResolvedValueOnce((async function*(){yield {text:'新'};})());
    const {result}=setup();
    const chunks=vi.fn();
    const start=vi.fn();
    const pending=result.current.callAI('story',{role:'main',onChunk:chunks,onStreamStart:start});
    await vi.advanceTimersByTimeAsync(90_000);
    expect(sdk.stream.mock.calls[0][0].config.abortSignal.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(pending).resolves.toBe('新');
    gate.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(chunks.mock.calls.flat()).toEqual(['舊','新']);
    expect(start).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('取消退避中的請求，不再等待或繼續重試', async () => {
    sdk.generate.mockRejectedValue(new Error('503 unavailable'));
    const {result}=setup();
    const pending=result.current.callAI('retry');
    const rejected=expect(pending).rejects.toMatchObject({name:'AbortError'});
    await vi.advanceTimersByTimeAsync(0);
    act(()=>result.current.abort());
    await rejected;
    await vi.advanceTimersByTimeAsync(5000);
    expect(sdk.generate).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('卸載後取消所有尚未完成的請求', async () => {
    sdk.generate.mockReturnValue(new Promise(()=>{}));
    const {result,unmount}=setup();
    const pending=result.current.callAI('pending');
    const rejected=expect(pending).rejects.toMatchObject({name:'AbortError'});
    await vi.advanceTimersByTimeAsync(0);
    unmount();
    await rejected;
    expect(vi.getTimerCount()).toBe(0);
  });
  it('401 不自動重試', async () => {
    sdk.generate.mockRejectedValue(new Error('401 invalid key'));
    const {result}=setup();
    await expect(result.current.callAI('invalid')).rejects.toThrow('401');
    expect(sdk.generate).toHaveBeenCalledTimes(1);
  });
});
