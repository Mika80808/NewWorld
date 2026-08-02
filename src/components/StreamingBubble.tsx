import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { MessageBubble } from './MessageBubble';

export interface StreamingBubbleHandle {
  /** 由 App 的 onChunk / onStreamStart 以命令式方式推入目前應顯示的完整文字 */
  setText: (text: string) => void;
}

interface StreamingBubbleProps {
  renderMarkdown: (text: string) => React.ReactNode;
  stripBareCommands: (text: string) => string;
  /** 串流內容變長時捲動至此錨點 */
  scrollAnchorRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * 串流中的主 GM 泡泡。
 *
 * 串流文字由本組件自己持有，App 透過 ref 推入 chunk，
 * 因此每個 chunk 只重渲染這顆泡泡，不會重渲染整棵 App
 * （左右側欄的 memories / npcs / quests / lorebook 過濾運算都會被連帶重算）。
 * 串流結束後才由 App 把最終敘事一次性寫入 messages。
 */
export const StreamingBubble = forwardRef<StreamingBubbleHandle, StreamingBubbleProps>(
  ({ renderMarkdown, stripBareCommands, scrollAnchorRef }, ref) => {
    const [text, setText] = useState('');
    const rafRef = useRef<number | null>(null);

    useImperativeHandle(ref, () => ({
      setText: (next: string) => {
        setText(next);
        // 以 rAF 合併捲動；behavior 用 'auto' 而非 'smooth'，
        // 避免每個 chunk 都重啟一次平滑捲動動畫造成畫面抖動
        if (rafRef.current !== null) return;
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = null;
          scrollAnchorRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
        });
      },
    }), [scrollAnchorRef]);

    useEffect(() => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    }, []);

    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
        className="flex flex-col items-start pr-5 max-w-3xl mx-auto w-full"
      >
        <div className="flex items-center space-x-2 mb-1 ml-2">
          <span className="text-sm text-[var(--text-muted)] font-bold">主 GM</span>
        </div>
        <MessageBubble isUser={false} isAssistant>
          {text === '' ? (
            <div className="flex items-center space-x-2 py-0.5 select-none">
              <span className="text-sm" style={{ color: 'var(--text-stat-label)' }}>主 GM 思考中</span>
              <span className="flex items-end space-x-0.5 pb-0.5">
                {[0, 200, 400].map(delay => (
                  <span
                    key={delay}
                    className="inline-block w-1 h-1 rounded-full"
                    style={{ background: 'var(--text-stat-label)', animation: 'blink-dot 1.4s ease-in-out infinite', animationDelay: `${delay}ms` }}
                  />
                ))}
              </span>
            </div>
          ) : (
            <div className="leading-relaxed">{renderMarkdown(stripBareCommands(text))}</div>
          )}
        </MessageBubble>
      </motion.div>
    );
  }
);

StreamingBubble.displayName = 'StreamingBubble';
