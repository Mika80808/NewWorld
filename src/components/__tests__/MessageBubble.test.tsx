// @vitest-environment jsdom
import '../../test/setupDom';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MessageBubble } from '../MessageBubble';

const bubble = (over: Partial<React.ComponentProps<typeof MessageBubble>> = {}) => {
  const { container } = render(
    <MessageBubble isUser={false} isAssistant {...over}>
      <p>你推開酒館的門。</p>
    </MessageBubble>
  );
  return container.querySelector('.rpg-message-card') as HTMLElement;
};

/**
 * 玩家回報：手機（iOS Safari）上「中間故事區的文字全部消失」，選單、右欄、
 * 狀態列都正常；送出一則新訊息、畫面重繪之後，整段聊天記錄的文字又回來了。
 *
 * 文字會因為一次重繪就回來，代表它一直在 DOM 裡、顏色也是對的，只是**沒有被
 * 畫出來**——這是 WebKit 的合成層耗盡。這個容器會隨對話長度一則一則累積，
 * 每則都要求一個獨立圖層，超過預算後就不再點陣化。
 *
 * 下面兩條把「泡泡不得製造合成層」釘住。兩個屬性都量過：拿掉之後羊皮紙的
 * 截圖 byte 完全相同，深色主題只有背景顆粒透出來一點、肉眼幾乎看不出。
 */
describe('MessageBubble 不得製造合成層', () => {
  /**
   * backdrop-filter 是 iOS 上最典型的兇手：長列表裡每則訊息一個圖層。
   * 羊皮紙主題本來就用 !important 關掉它了，這裡是為了深色主題。
   */
  it('不帶 backdrop-filter', () => {
    const el = bubble();
    expect(el.style.backdropFilter).toBe('');
    expect(el.style.getPropertyValue('-webkit-backdrop-filter')).toBe('');
  });

  /**
   * tactile-paper 在閱讀模式下只剩 background-blend-mode: multiply，
   * 而卡片的 background-image 已經被設成 none !important——對不存在的背景
   * 做混色，畫面完全沒差，卻照樣要一個圖層。
   */
  it('不帶 tactile-paper', () => {
    expect(bubble().classList.contains('tactile-paper')).toBe(false);
  });

  /** tactile-raised 只有 box-shadow，不製造圖層，是要保留的 */
  it('保留 tactile-raised 的光影', () => {
    expect(bubble().classList.contains('tactile-raised')).toBe(true);
  });
});

/** 移除上面兩者時不該順手動到外觀與閱讀模式賴以區分玩家／GM 的 class */
describe('MessageBubble 外觀維持不變', () => {
  it('玩家訊息帶 rpg-message-user（閱讀模式靠它分辨墨色）', () => {
    expect(bubble({ isUser: true, isAssistant: false }).classList.contains('rpg-message-user')).toBe(true);
  });

  it('GM 訊息帶 rpg-message-card-assistant', () => {
    expect(bubble().classList.contains('rpg-message-card-assistant')).toBe(true);
  });

  it('底色與圓角照舊', () => {
    const el = bubble();
    expect(el.style.borderRadius).toBe('14px');
    expect(el.style.background).toBe('var(--bg-bubble-npc)');
  });

  it('內容照常渲染', () => {
    bubble();
    expect(screen.getByText('你推開酒館的門。')).toBeInTheDocument();
  });
});
