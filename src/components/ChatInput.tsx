import React, { useState, useRef, useLayoutEffect, useImperativeHandle, forwardRef } from 'react';
import { Send, X } from 'lucide-react';

interface ChatInputProps {
  isLoading: boolean;
  onSend: (text: string) => void;
  onAbort: () => void;
}

/**
 * 外部往輸入框塞草稿用的把手。
 *
 * 打字的 state 刻意留在組件內（見下方說明），所以外面不能直接改 value。
 * 走 ref 而不是把 state 提上去，是為了保住那個「打字不重渲染整個 App」的設計——
 * 與 `StreamingBubble` 的 handle 同一個做法。
 */
export interface ChatInputHandle {
  /** 把文字接進草稿並聚焦。已有內容時換行接續，不覆蓋玩家寫到一半的字 */
  appendDraft: (text: string) => void;
}

/**
 * 輸入框獨立組件：打字 state 內收，避免每個按鍵重渲染整個 App
 */
/** 輸入框最高長到這裡，再高就內部捲動——不然它會吃掉整個閱讀區 */
const MAX_HEIGHT = 128;

export const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>(({ isLoading, onSend, onAbort }, ref) => {
  const [text, setText] = useState('');
  const boxRef = useRef<HTMLTextAreaElement>(null);

  useImperativeHandle(ref, () => ({
    appendDraft: (addition: string) => {
      setText(prev => (prev.trim() ? `${prev.replace(/\s+$/, '')}\n${addition}` : addition));
      // 聚焦並把游標放到最後：玩家接著要補「我要怎麼用」，
      // 落在文字中間或整段被選取都得先多按一下才寫得下去
      requestAnimationFrame(() => {
        const el = boxRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
        el.scrollTop = el.scrollHeight;
      });
    },
  }));

  /**
   * 自動長高一律跟著 `text` 走，不要掛在 onInput 上。
   *
   * ⚠️ 這裡踩過的坑：高度是用 `el.style.height = ...` 直接寫上去的 inline style，
   * 而 onInput **只在使用者輸入時觸發**。送出後 `setText('')` 只清掉了值，
   * 高度還留在最後長到的那一格——輸入框從此固定是一大格，把上面的故事擋住。
   *
   * 跟著 state 走就一併涵蓋了送出清空、外部改動與首次掛載。
   */
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    el.style.height = 'auto';                                   // 先收合才量得到真正的 scrollHeight
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
  }, [text]);

  const handleSend = () => {
    if (!text.trim() || isLoading) return;
    onSend(text);
    setText('');
  };

  return (
    <>
      <textarea
        ref={boxRef}
        className="w-full bg-transparent pl-2 pr-2 outline-none resize-none max-h-32 disabled:opacity-80"
        style={{ color: 'var(--text-main)', lineHeight: '20px', paddingTop: '8px', paddingBottom: '8px' }}
        placeholder={isLoading ? "..." : "輸入你的行動或對話..."}
        rows={1}
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={isLoading}
        // Enter 一律換行，送出只認送出鍵。
        // ⚠️ 不要改回 Enter 送出：這是自由文字 RPG，玩家常寫多段的行動描述，
        // 打到一半按 Enter 就被送出去是很難挽回的（AI 已經回應了）。
        // 想要快捷鍵的話用 Ctrl/⌘+Enter，不要用裸 Enter。
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            handleSend();
          }
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
});

ChatInput.displayName = 'ChatInput';
