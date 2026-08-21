// @vitest-environment jsdom
import '../../test/setupDom';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatInput } from '../ChatInput';

const setup = () => {
  const onSend = vi.fn();
  render(<ChatInput isLoading={false} onSend={onSend} onAbort={vi.fn()} />);
  return { onSend, box: screen.getByPlaceholderText('輸入你的行動或對話...') };
};

describe('ChatInput 送出行為', () => {
  /**
   * 這條釘住玩家明確要求的行為：**Enter 不送出**。
   *
   * 這是自由文字 RPG，玩家常寫多段的行動描述，打到一半按 Enter 就被送出去
   * 是很難挽回的——AI 已經接著回應了。送出只認送出鍵。
   */
  it('按 Enter 只換行，不送出', async () => {
    const user = userEvent.setup();
    const { onSend, box } = setup();
    await user.type(box, '我走近火堆');
    await user.keyboard('{Enter}');
    expect(onSend).not.toHaveBeenCalled();
  });

  it('Enter 之後還能繼續打第二段', async () => {
    const user = userEvent.setup();
    const { onSend, box } = setup();
    await user.type(box, '第一段');
    await user.keyboard('{Enter}');
    await user.type(box, '第二段');
    expect(onSend).not.toHaveBeenCalled();
    expect((box as HTMLTextAreaElement).value).toContain('第一段');
    expect((box as HTMLTextAreaElement).value).toContain('第二段');
  });

  it('Shift+Enter 也不送出', async () => {
    const user = userEvent.setup();
    const { onSend, box } = setup();
    await user.type(box, '測試');
    await user.keyboard('{Shift>}{Enter}{/Shift}');
    expect(onSend).not.toHaveBeenCalled();
  });

  it('點送出鍵才送出', async () => {
    const user = userEvent.setup();
    const { onSend, box } = setup();
    await user.type(box, '我走近火堆');
    await user.click(screen.getByRole('button'));
    expect(onSend).toHaveBeenCalledWith('我走近火堆');
  });

  /** 想要鍵盤快捷的話用 Ctrl/⌘+Enter，不要用裸 Enter */
  it('Ctrl+Enter 可以送出（保留給習慣快捷鍵的人）', async () => {
    const user = userEvent.setup();
    const { onSend, box } = setup();
    await user.type(box, '我走近火堆');
    await user.keyboard('{Control>}{Enter}{/Control}');
    expect(onSend).toHaveBeenCalledWith('我走近火堆');
  });

  it('空白內容不會送出', async () => {
    const user = userEvent.setup();
    const { onSend, box } = setup();
    await user.type(box, '   ');
    await user.keyboard('{Control>}{Enter}{/Control}');
    expect(onSend).not.toHaveBeenCalled();
  });
});
