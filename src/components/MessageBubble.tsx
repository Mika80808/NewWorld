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
 */
export const MessageBubble: React.FC<MessageBubbleProps> = ({
  isUser,
  isAssistant,
  fullWidth = false,
  children,
}) => (
  <div
    // tactile-* 只在 [data-theme="parchment"] 底下有樣式，深色主題完全無感
    className={`rpg-message-card tactile-raised tactile-paper ${isAssistant ? 'rpg-message-card-assistant' : ''} p-4 text-left max-w-full relative overflow-hidden ${fullWidth ? 'w-full' : 'w-fit'}`}
    style={{
      color: 'var(--text-dialog-main)',
      background: isUser ? 'var(--bg-bubble-self)' : 'var(--bg-bubble-npc)',
      borderRadius: '8px',
      border: isUser
        ? '0.5px solid color-mix(in srgb, var(--color-amber) 28%, transparent)'
        : '0.5px solid var(--border-default)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
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
