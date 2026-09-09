import { afterEach, describe, expect, it, vi } from 'vitest';
import { debounce } from '../debounce';

afterEach(()=>vi.useRealTimers());
describe('debounce lifecycle',()=>{
  it('只執行最後一次輸入',()=>{
    vi.useFakeTimers();
    const callback=vi.fn();
    const search=debounce(callback,300);
    search('a');search('b');
    vi.advanceTimersByTime(300);
    expect(callback.mock.calls).toEqual([['b']]);
  });
  it('清理後不執行舊回呼，仍可重新排程',()=>{
    vi.useFakeTimers();
    const callback=vi.fn();
    const search=debounce(callback,300);
    search('old');search.cancel();search.cancel();
    vi.advanceTimersByTime(300);
    expect(callback).not.toHaveBeenCalled();
    search('new');vi.advanceTimersByTime(300);
    expect(callback.mock.calls).toEqual([['new']]);
  });
});
