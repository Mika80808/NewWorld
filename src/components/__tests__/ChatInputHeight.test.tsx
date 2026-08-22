// @vitest-environment jsdom
import '../../test/setupDom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatInput } from '../ChatInput';

/**
 * jsdom 不做排版，scrollHeight 恆為 0，所以這裡以「內容決定的行數」假造它：
 * 這樣才量得到「送出後有沒有縮回去」這個行為，而不是量 jsdom 的 0。
 */
const LINE = 20;
const PAD = 16;
beforeEach(() => {
  Object.defineProperty(HTMLTextAreaElement.prototype, 'scrollHeight', {
    configurable: true,
    get(this: HTMLTextAreaElement) {
      const lines = Math.max(1, this.value.split('\n').length);
      return lines * LINE + PAD;
    },
  });
});

const setup = () => {
  const onSend = vi.fn();
  render(<ChatInput isLoading={false} onSend={onSend} onAbort={vi.fn()} />);
  return { onSend, box: screen.getByPlaceholderText('輸入你的行動或對話...') as HTMLTextAreaElement };
};

describe('ChatInput 高度', () => {
  it('打多行時會長高', async () => {
    const user = userEvent.setup();
    const { box } = setup();
    const before = box.style.height;
    await user.type(box, '第一段{Enter}第二段{Enter}第三段');
    expect(box.style.height).not.toBe(before);
    expect(parseInt(box.style.height)).toBeGreaterThan(LINE + PAD);
  });

  /**
   * 這條釘住實際壞掉的行為：高度是用 `el.style.height = ...` 直接寫上去的，
   * 送出後 `setText('')` 只清了值——inline style 還留在最後長到的高度，
   * 輸入框從此固定是一大格，把上面的故事擋掉。
   *
   * 送出不會觸發 onInput（那只在使用者輸入時發生），所以修法不能繼續掛在
   * onInput 上，要跟著 text 走。
   */
  it('送出後縮回一行高', async () => {
    const user = userEvent.setup();
    const { box } = setup();
    await user.type(box, '第一段{Enter}第二段{Enter}第三段{Enter}第四段');
    const grown = parseInt(box.style.height);
    expect(grown).toBeGreaterThan(LINE + PAD);

    await user.click(screen.getByRole('button'));
    expect(parseInt(box.style.height)).toBe(LINE + PAD);
  });

  it('刪掉內容也會跟著縮回去', async () => {
    const user = userEvent.setup();
    const { box } = setup();
    await user.type(box, '第一段{Enter}第二段{Enter}第三段');
    expect(parseInt(box.style.height)).toBeGreaterThan(LINE + PAD);

    await user.clear(box);
    expect(parseInt(box.style.height)).toBe(LINE + PAD);
  });

  /** 上限存在的理由是不要讓輸入框吃掉整個閱讀區 */
  it('再長也不超過上限', async () => {
    const user = userEvent.setup();
    const { box } = setup();
    await user.type(box, Array.from({ length: 30 }, (_, i) => `第${i}段`).join('{Enter}'));
    expect(parseInt(box.style.height)).toBeLessThanOrEqual(128);
  });
});
