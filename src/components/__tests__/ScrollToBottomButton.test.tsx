// @vitest-environment jsdom
import '../../test/setupDom';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ScrollToBottomButton } from '../ScrollToBottomButton';

const btn = () => screen.queryByRole('button', { name: '回到最新訊息' });

describe('ScrollToBottomButton', () => {
  it('已經在底部時不掛載——一直掛著會擋住故事，按了也沒有作用', () => {
    render(<ScrollToBottomButton visible={false} onClick={vi.fn()} />);
    expect(btn()).toBeNull();
  });

  it('捲離底部時出現', () => {
    render(<ScrollToBottomButton visible onClick={vi.fn()} />);
    expect(btn()).not.toBeNull();
  });

  it('按下時呼叫 onClick', async () => {
    const onClick = vi.fn();
    render(<ScrollToBottomButton visible onClick={onClick} />);
    await userEvent.click(btn()!);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  /**
   * 放在表單／輸入框附近的按鈕沒寫 type 的話預設是 submit，
   * 會連帶送出外層 form。這裡明確釘住 type="button"。
   */
  it('是 type="button"，不會意外送出表單', () => {
    render(<ScrollToBottomButton visible onClick={vi.fn()} />);
    expect(btn()!.getAttribute('type')).toBe('button');
  });

  it('有無障礙名稱可供輔助技術辨識', () => {
    render(<ScrollToBottomButton visible onClick={vi.fn()} />);
    expect(btn()!.getAttribute('aria-label')).toBe('回到最新訊息');
  });
});
