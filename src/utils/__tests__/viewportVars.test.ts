import { describe, it, expect } from 'vitest';
import {
  applyViewportVars,
  clearViewportVars,
  VIEWPORT_HEIGHT_VAR,
  VIEWPORT_OFFSET_TOP_VAR,
} from '../viewportVars';

/** 只需要 style.setProperty / getPropertyValue / removeProperty，不必真的建 DOM */
const fakeRoot = () => {
  const store: Record<string, string> = {};
  return {
    store,
    el: {
      style: {
        setProperty: (k: string, v: string) => { store[k] = v; },
        removeProperty: (k: string) => { delete store[k]; },
      },
    } as unknown as HTMLElement,
  };
};

describe('applyViewportVars', () => {
  it('高度與位移兩個都寫入', () => {
    const { store, el } = fakeRoot();
    applyViewportVars(el, { height: 640, offsetTop: 0, scale: 1 });
    expect(store[VIEWPORT_HEIGHT_VAR]).toBe('640px');
    expect(store[VIEWPORT_OFFSET_TOP_VAR]).toBe('0px');
  });

  it('鍵盤把視覺視窗往下推時，位移要跟著寫進去', () => {
    // 這是玩家回報的情境：欄位在下半部，iOS 把視覺視窗往下挪好讓它露出來。
    // 少了 offsetTop，fixed 覆蓋層會留在版面視窗頂端＝被推出畫面外。
    const { store, el } = fakeRoot();
    applyViewportVars(el, { height: 380, offsetTop: 148, scale: 1 });
    expect(store[VIEWPORT_HEIGHT_VAR]).toBe('380px');
    expect(store[VIEWPORT_OFFSET_TOP_VAR]).toBe('148px');
  });

  it('雙指縮放時不寫，保留瀏覽器原生行為', () => {
    const { store, el } = fakeRoot();
    expect(applyViewportVars(el, { height: 300, offsetTop: 90, scale: 2.5 })).toBe(false);
    expect(store).toEqual({});
  });

  it('縮放中不會覆寫先前寫好的值', () => {
    const { store, el } = fakeRoot();
    applyViewportVars(el, { height: 640, offsetTop: 0, scale: 1 });
    applyViewportVars(el, { height: 250, offsetTop: 200, scale: 3 });
    expect(store[VIEWPORT_HEIGHT_VAR]).toBe('640px');
    expect(store[VIEWPORT_OFFSET_TOP_VAR]).toBe('0px');
  });
});

describe('clearViewportVars', () => {
  it('兩個變數都清掉，讓 CSS 退回預設值', () => {
    const { store, el } = fakeRoot();
    applyViewportVars(el, { height: 640, offsetTop: 24, scale: 1 });
    clearViewportVars(el);
    expect(store).toEqual({});
  });
});
