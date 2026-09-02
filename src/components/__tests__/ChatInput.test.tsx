// @vitest-environment jsdom
import '../../test/setupDom';
import { describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatInput, ChatInputHandle } from '../ChatInput';

const setup = (over: Partial<React.ComponentProps<typeof ChatInput>> = {}) => {
  const ref = createRef<ChatInputHandle>();
  const onSend = vi.fn();
  render(<ChatInput ref={ref} isLoading={false} onSend={onSend} onAbort={vi.fn()} {...over} />);
  const box = screen.getByPlaceholderText('輸入你的行動或對話...') as HTMLTextAreaElement;
  return { ref, onSend, box };
};

/**
 * 玩家回報：「使用道具之後，道具的說明文字會直接送出對話，但我希望它的說明能夠
 * 先停在對話欄，讓我補充我要怎麼使用這個道具之後，再手動送出。」
 *
 * 打字的 state 刻意留在組件內（避免每個按鍵重渲染整個 App），所以外部要塞草稿
 * 只能走 ref。這幾條釘住那支把手的行為。
 */
describe('ChatInput.appendDraft', () => {
  it('空的輸入框直接放入草稿', () => {
    const { ref, box } = setup();
    act(() => ref.current!.appendDraft('（我使用了草藥（回復 20 HP））'));
    expect(box.value).toBe('（我使用了草藥（回復 20 HP））');
  });

  /** 玩家可能已經寫到一半，覆蓋掉就是把他的字吃了 */
  it('已有內容時換行接續，不覆蓋', async () => {
    const user = userEvent.setup();
    const { ref, box } = setup();
    await user.type(box, '我走向倒地的芬里爾');
    act(() => ref.current!.appendDraft('（我使用了草藥（回復 20 HP））'));
    expect(box.value).toBe('我走向倒地的芬里爾\n（我使用了草藥（回復 20 HP））');
  });

  it('接續時不會留下多餘空白行', async () => {
    const user = userEvent.setup();
    const { ref, box } = setup();
    await user.type(box, '我打開背包   ');
    act(() => ref.current!.appendDraft('（我使用了草藥）'));
    expect(box.value).toBe('我打開背包\n（我使用了草藥）');
  });

  /** 重點：塞進草稿不等於送出 */
  it('放入草稿不會觸發送出', () => {
    const { ref, onSend } = setup();
    act(() => ref.current!.appendDraft('（我使用了草藥）'));
    expect(onSend).not.toHaveBeenCalled();
  });

  it('玩家補完後手動送出，送的是補完的整段', async () => {
    const user = userEvent.setup();
    const { ref, onSend, box } = setup();
    act(() => ref.current!.appendDraft('（我使用了草藥（回復 20 HP））'));
    await user.type(box, '，餵給倒地的芬里爾');

    await user.click(screen.getByRole('button'));
    expect(onSend).toHaveBeenCalledWith('（我使用了草藥（回復 20 HP）），餵給倒地的芬里爾');
  });

  it('送出後清空草稿', async () => {
    const user = userEvent.setup();
    const { ref, box } = setup();
    act(() => ref.current!.appendDraft('（我使用了草藥）'));
    await user.click(screen.getByRole('button'));
    expect(box.value).toBe('');
  });
});

/**
 * ⚠️ 裸 Enter 一律換行。這是自由文字 RPG，玩家常寫多段行動描述，
 * 打到一半被送出去是很難挽回的（AI 已經回應了）。
 */
describe('ChatInput 送出時機', () => {
  it('裸 Enter 不送出', async () => {
    const user = userEvent.setup();
    const { onSend, box } = setup();
    await user.type(box, '我走進酒館{Enter}');
    expect(onSend).not.toHaveBeenCalled();
  });

  it('Ctrl+Enter 送出', async () => {
    const user = userEvent.setup();
    const { onSend, box } = setup();
    await user.type(box, '我走進酒館');
    await user.keyboard('{Control>}{Enter}{/Control}');
    expect(onSend).toHaveBeenCalledWith('我走進酒館');
  });

  it('只有空白時不送出', async () => {
    const user = userEvent.setup();
    const { onSend, box } = setup();
    await user.type(box, '   ');
    await user.keyboard('{Control>}{Enter}{/Control}');
    expect(onSend).not.toHaveBeenCalled();
  });
});
