import React, { useRef, useState, useLayoutEffect } from 'react';
import { motion } from 'motion/react';
import { RefreshCw, MoreVertical } from 'lucide-react';
import { Message } from '../types';
import { MessageBubble } from './MessageBubble';

/** 選單高度估算（3 個項目），只用於判斷往上開放不放得下 */
const MENU_HEIGHT = 132;

/**
 * 往上找到第一個會裁切內容的捲動祖先。
 * 對話串是 `overflow-y-auto` 容器，選單被裁掉的邊界是「它」而不是視窗——
 * 手機版頂部還有 pt-36 的 HUD，用 window 判斷會以為上面還有空間。
 */
function scrollClipRect(el: HTMLElement | null): DOMRect | null {
  for (let p = el?.parentElement; p; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY;
    if (oy === 'auto' || oy === 'scroll') return p.getBoundingClientRect();
  }
  return null;
}

interface MessageCardProps {
  msg: Message;
  playerName: string;
  activeMenuId: number | null;
  editingMessageId: number | null;
  editMessageText: string;
  isLoading: boolean;
  onRegenerate: (msgId: number) => void;
  onMenuToggle: (msgId: number) => void;
  onCopy: (text: string) => void;
  onEdit: (msgId: number, text: string) => void;
  onDelete: (msgId: number) => void;
  onEditChange: (text: string) => void;
  onEditCancel: () => void;
  onEditSave: (msgId: number, newText: string) => void;
  renderMarkdown: (text: string) => React.ReactNode;
  cleanNarrative: (text: string) => string;
}

// React.memo：callbacks 由 App 以 useCallback 穩定，長對話下只有內容變動的卡片會重渲染
export const MessageCard: React.FC<MessageCardProps> = React.memo(({
  msg,
  playerName,
  activeMenuId,
  editingMessageId,
  editMessageText,
  isLoading,
  onRegenerate,
  onMenuToggle,
  onCopy,
  onEdit,
  onDelete,
  onEditChange,
  onEditCancel,
  onEditSave,
  renderMarkdown,
  cleanNarrative,
}) => {
  const isUser = msg.role === 'user';
  const isAssistant = msg.role === 'assistant';

  // 選單預設往上開；上方放不下時翻向下方。
  // 先前寫死 `bottom-full`，捲到頂端時最上面那則的選單會被捲動容器整個裁掉，
  // 按鈕看得到卻點不到選項——等於編輯／刪除還是不能用。
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const [menuUp, setMenuUp] = useState(true);
  const isMenuOpen = activeMenuId === msg.id;

  useLayoutEffect(() => {
    if (!isMenuOpen) return;
    const btn = menuBtnRef.current;
    if (!btn) return;
    const btnTop = btn.getBoundingClientRect().top;
    const clipTop = scrollClipRect(btn)?.top ?? 0;
    setMenuUp(btnTop - clipTop > MENU_HEIGHT);
  }, [isMenuOpen]);

  return (
    <motion.div
      key={msg.id}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className={`flex flex-col ${isUser ? 'items-end pl-5' : 'items-start pr-5'} max-w-3xl mx-auto w-full group relative ${activeMenuId === msg.id ? 'z-20' : 'z-0'}`}
    >
      <div className={`flex items-center space-x-2 mb-1 ${isUser ? 'mr-2 flex-row-reverse space-x-reverse' : 'ml-2'}`}>
        <span className="text-sm text-[var(--text-muted)] font-bold">
          {isUser ? playerName : '主 GM'}
        </span>
        {/* 顯示／隱藏由 index.css 的 .msg-actions 控制（依 hover 能力，不是螢幕寬度）。
            不要改回 group-hover 的 Tailwind class——觸控裝置上那組規則不會生效 */}
        <div className="msg-actions flex items-center space-x-1" data-open={isMenuOpen}>
          {!isUser && (
            <button
              onClick={() => onRegenerate(msg.id)}
              disabled={isLoading}
              className="msg-action-btn p-1 text-[var(--text-muted)] rounded-[8px] transition disabled:opacity-50 disabled:cursor-not-allowed"
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-body)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = ''}
              title="重新生成"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          )}
          <div className="relative">
            <button
              ref={menuBtnRef}
              onClick={(e) => {
                e.stopPropagation();
                onMenuToggle(msg.id);
              }}
              className="msg-action-btn p-1 text-[var(--text-muted)] rounded-[8px] transition"
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-body)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = ''}
              title="更多操作"
              aria-label="更多操作"
              aria-haspopup="menu"
              aria-expanded={isMenuOpen}
            >
              <MoreVertical className="w-3.5 h-3.5" />
            </button>

            {isMenuOpen && (
              <div
                role="menu"
                className={`absolute ${menuUp ? 'bottom-full mb-1' : 'top-full mt-1'} w-24 backdrop-blur-md border border-white/10 rounded-[10px] shadow-[0_0_20px_rgba(0,0,0,0.3)] z-50 overflow-hidden flex flex-col ${isUser ? 'right-0' : 'left-0'}`}
                style={{ background: 'color-mix(in srgb, var(--bg-elevated) 90%, transparent)' }}
              >
                <button
                  role="menuitem"
                  className="msg-menu-item px-3 py-2 text-sm text-left transition"
                  style={{ color: 'var(--text-body)' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onCopy(msg.text);
                  }}
                >
                  複製
                </button>
                <button
                  role="menuitem"
                  className="msg-menu-item px-3 py-2 text-sm text-left transition"
                  style={{ color: 'var(--text-body)' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(msg.id, msg.text);
                  }}
                >
                  編輯
                </button>
                <button
                  role="menuitem"
                  className="msg-menu-item px-3 py-2 text-sm text-left transition"
                  style={{ color: 'var(--text-danger)' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(msg.id);
                  }}
                >
                  刪除
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <MessageBubble isUser={isUser} isAssistant={isAssistant} fullWidth={editingMessageId === msg.id}>
        {editingMessageId === msg.id ? (
          <div className="flex flex-col w-full">
            <textarea
              value={editMessageText}
              onChange={(e) => onEditChange(e.target.value)}
              className="w-full backdrop-blur-sm p-3 rounded-[10px] border border-white/10 outline-none resize-none text-sm min-h-[200px]"
              style={{ background: 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)', color: 'var(--text-dialog-muted)' }}
              autoFocus
            />
            <div className="flex justify-end space-x-2 mt-2">
              <button
                onClick={onEditCancel}
                className="text-sm text-[var(--text-muted)] px-2 py-1"
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-dialog-main)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = ''}
              >
                取消
              </button>
              <button
                onClick={() => onEditSave(msg.id, editMessageText)}
                className="text-sm backdrop-blur-sm px-3 py-1 rounded-[8px] transition shadow-[var(--shadow)]"
                style={{ background: 'var(--btn-primary)', color: 'var(--text-main)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--btn-primary-hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'var(--btn-primary)'}
              >
                儲存
              </button>
            </div>
          </div>
        ) : isUser ? (
          <p className="leading-relaxed whitespace-pre-wrap">{msg.text}</p>
        ) : (
          <div className="leading-relaxed">{renderMarkdown(cleanNarrative(msg.text))}</div>
        )}
      </MessageBubble>
    </motion.div>
  );
});

MessageCard.displayName = 'MessageCard';
