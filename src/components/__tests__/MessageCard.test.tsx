// @vitest-environment jsdom
import '../../test/setupDom';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MessageCard } from '../MessageCard';
import { Message } from '../../types';
import { renderMarkdown } from '../../utils/markdownParser';

const msg = (overrides: Partial<Message> = {}): Message => ({
  id: 1,
  role: 'assistant',
  text: '木門吱呀一聲推開。',
  ...overrides,
} as Message);

const noop = () => {};

const renderCard = (props: Partial<React.ComponentProps<typeof MessageCard>> = {}) =>
  render(
    <MessageCard
      msg={msg()}
      playerName="小美"
      activeMenuId={null}
      editingMessageId={null}
      editMessageText=""
      isLoading={false}
      onRegenerate={noop}
      onMenuToggle={noop}
      onCopy={noop}
      onEdit={noop}
      onDelete={noop}
      onEditChange={noop}
      onEditCancel={noop}
      onEditSave={noop}
      renderMarkdown={(t) => <span>{t}</span>}
      cleanNarrative={(t) => t}
      {...props}
    />
  );

describe('MessageCard 操作列', () => {
  /**
   * 這條釘住的是一個實際壞掉過的行為：操作列原本寫成
   * `opacity-0 group-hover:opacity-100`，而 Tailwind v4 預設把 `hover:`
   * 包進 `@media (hover: hover)`——觸控裝置永遠不會套用，操作列固定停在
   * opacity: 0，手機上等於沒有編輯／刪除。
   *
   * 顯示邏輯改到 index.css 的 `.msg-actions`（依 hover 能力判斷）。
   * jsdom 不會套用真實樣式表的 media query，所以這裡只能釘住「class 契約」：
   * 只要有人改回 Tailwind 的 group-hover 寫法，這條就會紅。
   * 實際的視覺效果以瀏覽器（hover:none / hover:hover）驗證。
   */
  it('操作列掛的是 .msg-actions，不是 group-hover 的 opacity class', () => {
    const { container } = renderCard();
    const bar = container.querySelector('.msg-actions');
    expect(bar).not.toBeNull();
    expect(bar!.className).not.toMatch(/group-hover/);
    expect(bar!.className).not.toMatch(/\bopacity-0\b/);
  });

  it('選單展開時 data-open 為 true，讓觸控裝置上的操作列保持可見', () => {
    const { container, rerender } = renderCard();
    expect(container.querySelector('.msg-actions')).toHaveAttribute('data-open', 'false');

    rerender(
      <MessageCard
        msg={msg()} playerName="小美" activeMenuId={1} editingMessageId={null}
        editMessageText="" isLoading={false} onRegenerate={noop} onMenuToggle={noop}
        onCopy={noop} onEdit={noop} onDelete={noop} onEditChange={noop}
        onEditCancel={noop} onEditSave={noop}
        renderMarkdown={(t) => <span>{t}</span>} cleanNarrative={(t) => t}
      />
    );
    expect(container.querySelector('.msg-actions')).toHaveAttribute('data-open', 'true');
  });

  it('點「更多操作」會 toggle 選單，展開後複製／編輯／刪除都在', async () => {
    const user = userEvent.setup();
    const onMenuToggle = vi.fn();
    const { rerender } = renderCard({ onMenuToggle });

    await user.click(screen.getByLabelText('更多操作'));
    expect(onMenuToggle).toHaveBeenCalledWith(1);

    rerender(
      <MessageCard
        msg={msg()} playerName="小美" activeMenuId={1} editingMessageId={null}
        editMessageText="" isLoading={false} onRegenerate={noop} onMenuToggle={onMenuToggle}
        onCopy={noop} onEdit={noop} onDelete={noop} onEditChange={noop}
        onEditCancel={noop} onEditSave={noop}
        renderMarkdown={(t) => <span>{t}</span>} cleanNarrative={(t) => t}
      />
    );
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: '複製' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: '編輯' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: '刪除' })).toBeInTheDocument();
  });

  it('編輯與刪除會帶著 msg.id 呼叫回呼', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    renderCard({ activeMenuId: 1, onEdit, onDelete });

    await user.click(screen.getByRole('menuitem', { name: '編輯' }));
    expect(onEdit).toHaveBeenCalledWith(1, '木門吱呀一聲推開。');

    await user.click(screen.getByRole('menuitem', { name: '刪除' }));
    expect(onDelete).toHaveBeenCalledWith(1);
  });

  /**
   * 選單方向：先前寫死 `bottom-full`（一律往上開），捲到頂端時最上面那則的
   * 選單會被捲動容器整個裁掉，按鈕看得到卻點不到選項。
   * jsdom 的 getBoundingClientRect 全部回傳 0，等同「上方沒有空間」，
   * 所以這裡應該翻成往下開。
   */
  it('上方空間不足時選單翻向下開', () => {
    renderCard({ activeMenuId: 1 });
    const menu = screen.getByRole('menu');
    expect(menu.className).toMatch(/top-full/);
    expect(menu.className).not.toMatch(/bottom-full/);
  });
});

// ─── 玩家訊息的 markdown 渲染 ────────────────────────────────────────────────
// 玩家要求「AI 跟玩家的 *描述動作文字* 都是特殊色」。先前玩家訊息是純文字
// 輸出（`<p>{msg.text}</p>`），於是玩家自己寫的 *動作* 只會顯示成帶星號的原文。
describe('MessageCard 玩家訊息', () => {
  it('玩家的 *動作描述* 會被渲染成 em，而不是印出星號', () => {
    const { container } = render(
      <MessageCard
        msg={{ id: 1, role: 'user', text: '我走近火堆，*壓低聲音問道*' } as Message}
        playerName="陸星辰" activeMenuId={null} editingMessageId={null}
        editMessageText="" isLoading={false}
        onRegenerate={noop} onMenuToggle={noop} onCopy={noop} onEdit={noop}
        onDelete={noop} onEditChange={noop} onEditCancel={noop} onEditSave={noop}
        renderMarkdown={renderMarkdown} cleanNarrative={(t) => t}
      />
    );
    const em = container.querySelector('em');
    expect(em?.textContent).toBe('壓低聲音問道');
    expect(container.textContent).not.toContain('*');
  });
});
