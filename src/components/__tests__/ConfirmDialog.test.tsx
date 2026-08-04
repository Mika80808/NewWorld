// @vitest-environment jsdom
import '../../test/setupDom';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmDialog, DialogRequest } from '../ConfirmDialog';

const makeRequest = (overrides: Partial<DialogRequest> = {}): DialogRequest => ({
  title: '標題',
  input: { placeholder: '請輸入⋯' },
  onConfirm: vi.fn(),
  ...overrides,
});

describe('ConfirmDialog', () => {
  it('request 為 null 時不渲染任何東西', () => {
    const { container } = render(<ConfirmDialog request={null} onClose={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  // 這條釘住 render 期間比對 prevRequest 的重置邏輯。
  // 若有人把它拿掉（或改成只在 mount 時清空），前一個對話框打到一半的文字
  // 會原封不動出現在下一個對話框裡。
  it('換一個 request 物件時清空輸入框', async () => {
    const user = userEvent.setup();
    const first = makeRequest({ title: '第一個' });
    const { rerender } = render(<ConfirmDialog request={first} onClose={vi.fn()} />);

    const input = () => screen.getByPlaceholderText('請輸入⋯');
    await user.type(input(), '打到一半的字');
    expect(input()).toHaveValue('打到一半的字');

    rerender(<ConfirmDialog request={makeRequest({ title: '第二個' })} onClose={vi.fn()} />);

    expect(screen.getByRole('heading')).toHaveTextContent('第二個');
    expect(input()).toHaveValue('');
  });

  // 同一個 request 物件重新 render（例如父層因別的 state 更新而重繪）
  // 不該把玩家正在打的字清掉——比對的是物件 identity，不是內容
  it('同一個 request 物件重繪時保留已輸入的文字', async () => {
    const user = userEvent.setup();
    const request = makeRequest();
    const { rerender } = render(<ConfirmDialog request={request} onClose={vi.fn()} />);

    await user.type(screen.getByPlaceholderText('請輸入⋯'), '保留我');
    rerender(<ConfirmDialog request={request} onClose={vi.fn()} />);

    expect(screen.getByPlaceholderText('請輸入⋯')).toHaveValue('保留我');
  });

  it('有輸入框時，空字串不可確認；輸入後可確認並回傳 trim 過的值', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(<ConfirmDialog request={makeRequest({ onConfirm })} onClose={onClose} />);

    const confirmBtn = screen.getByRole('button', { name: '確定' });
    expect(confirmBtn).toBeDisabled();

    await user.type(screen.getByPlaceholderText('請輸入⋯'), '  存檔名稱  ');
    expect(confirmBtn).toBeEnabled();

    await user.click(confirmBtn);
    expect(onConfirm).toHaveBeenCalledWith('存檔名稱');
    expect(onClose).toHaveBeenCalled();
  });

  it('沒有輸入框時 onConfirm 收到 undefined', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog request={{ title: '確定重置？', onConfirm }} onClose={vi.fn()} />
    );

    await user.click(screen.getByRole('button', { name: '確定' }));
    expect(onConfirm).toHaveBeenCalledWith(undefined);
  });
});
