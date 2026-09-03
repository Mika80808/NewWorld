import React from 'react';

interface MessageBubbleProps {
  isUser: boolean;
  isAssistant: boolean;
  /** 編輯中時撐滿寬度，否則寬度貼合內容 */
  fullWidth?: boolean;
  children: React.ReactNode;
}

/**
 * 對話泡泡外框（純樣式容器）。
 * MessageCard 與 StreamingBubble 共用，確保串流中與串流結束後的外觀完全一致。
 *
 * ⚠️ **這個容器不得再帶會製造合成層（compositing layer）的屬性。**
 *
 * 玩家回報「手機上中間故事區的文字全部消失，選單與狀態列正常」，送出一則新
 * 訊息、畫面重繪之後文字又整批回來——內容一直在 DOM 裡、顏色也對，只是
 * **沒有被畫出來**。這是 iOS Safari 的合成層耗盡：這個容器會隨對話長度
 * 一則一則累積，每則都要求一個獨立圖層，超過預算後 WebKit 就不再點陣化，
 * 直到某次重繪才補上。玩久了才會遇到，正是玩家的情況。
 *
 * 兩個來源都已移除（各自只影響一個主題，兩邊都量過）：
 * - `backdrop-filter: blur(12px)`：只在深色主題生效（羊皮紙本來就用
 *   `!important` 關掉了）。泡泡底色是半透明的，拿掉之後背景顆粒會透出來一點，
 *   實測肉眼幾乎看不出差別——拿一則故事被整段吞掉換這個，不划算
 * - `tactile-paper`：只在羊皮紙生效，而閱讀模式已經把卡片的
 *   `background-image` 設成 `none !important`，它只剩一個
 *   `background-blend-mode: multiply` 在對不存在的背景做混色。
 *   實測移除前後的截圖 byte 完全相同，純粹是白付一個圖層
 *
 * `rpg-message-user` 供閱讀模式分辨玩家與 GM 的行——拆掉泡泡之後兩者只能
 * 靠文字顏色區分。`tactile-raised` 只有 box-shadow，不製造圖層，保留。
 */
export const MessageBubble: React.FC<MessageBubbleProps> = ({
  isUser,
  isAssistant,
  fullWidth = false,
  children,
}) => (
  <div
    // tactile-raised 只在 [data-theme="parchment"] 底下有樣式，深色主題完全無感
    className={`rpg-message-card tactile-raised ${isAssistant ? 'rpg-message-card-assistant' : ''} ${isUser ? 'rpg-message-user' : ''} p-4 text-left max-w-full relative overflow-hidden ${fullWidth ? 'w-full' : 'w-fit'}`}
    style={{
      color: 'var(--text-dialog-main)',
      background: isUser ? 'var(--bg-bubble-self)' : 'var(--bg-bubble-npc)',
      borderRadius: '14px',   // 圓角要夠大，柔和光影才有過渡空間
      border: isUser
        ? '0.5px solid color-mix(in srgb, var(--color-amber) 28%, transparent)'
        : '0.5px solid var(--border-default)',
    }}
  >
    <div
      className="absolute top-0 left-0 right-0 h-[1px] pointer-events-none"
      style={{
        background: isUser
          ? 'linear-gradient(to right, transparent, color-mix(in srgb, var(--color-amber) 55%, transparent), transparent)'
          : 'linear-gradient(to right, transparent, color-mix(in srgb, var(--text-body) 35%, transparent), transparent)',
      }}
    />
    {children}
  </div>
);

MessageBubble.displayName = 'MessageBubble';
