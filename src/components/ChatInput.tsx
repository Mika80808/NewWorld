import React, { useState } from 'react';
import { Send, X } from 'lucide-react';

interface ChatInputProps {
  isLoading: boolean;
  onSend: (text: string) => void;
  onAbort: () => void;
}

/**
 * 輸入框獨立組件：打字 state 內收，避免每個按鍵重渲染整個 App
 */
export const ChatInput: React.FC<ChatInputProps> = ({ isLoading, onSend, onAbort }) => {
  const [text, setText] = useState('');

  const handleSend = () => {
    if (!text.trim() || isLoading) return;
    onSend(text);
    setText('');
  };

  return (
    <>
      <textarea
        className="w-full bg-transparent pl-2 pr-2 outline-none resize-none max-h-32 disabled:opacity-80"
        style={{ color: 'var(--text-main)', lineHeight: '20px', paddingTop: '8px', paddingBottom: '8px' }}
        placeholder={isLoading ? "..." : "輸入你的行動或對話..."}
        rows={1}
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={isLoading}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
          }
        }}
        onInput={(e) => {
          const el = e.currentTarget;
          el.style.height = 'auto';
          el.style.height = Math.min(el.scrollHeight, 128) + 'px';
        }}
      ></textarea>
      {isLoading ? (
        /* 中止按鈕（D7）*/
        <button
          className="px-3 transition"
          style={{ height: '40px', display: 'flex', alignItems: 'center', color: 'var(--color-rose)', cursor: 'pointer' }}
          onClick={onAbort}
          title="中止請求"
        >
          <X className="w-5 h-5" />
        </button>
      ) : (
        /* 送出按鈕 */
        <button
          className="px-3 transition"
          style={{ height: '40px', display: 'flex', alignItems: 'center', color: !text.trim() ? 'var(--text-muted)' : 'var(--btn-primary)', cursor: !text.trim() ? 'not-allowed' : 'pointer', opacity: !text.trim() ? 0.4 : 1 }}
          onMouseEnter={e => { if (text.trim()) (e.currentTarget as HTMLButtonElement).style.color = 'var(--btn-primary-hover)'; }}
          onMouseLeave={e => { if (text.trim()) (e.currentTarget as HTMLButtonElement).style.color = 'var(--btn-primary)'; }}
          onClick={handleSend}
          disabled={!text.trim()}
        >
          <Send className="w-5 h-5" />
        </button>
      )}
    </>
  );
};
