import React from 'react';
import { motion } from 'motion/react';
import { RefreshCw, MoreVertical } from 'lucide-react';
import { Message } from '../types';
import { MessageBubble } from './MessageBubble';

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
  stripBareCommands: (text: string) => string;
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
  stripBareCommands,
}) => {
  const isUser = msg.role === 'user';
  const isAssistant = msg.role === 'assistant';

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
        <div className={`flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition ${activeMenuId === msg.id ? 'opacity-100' : ''}`}>
          {!isUser && (
            <button
              onClick={() => onRegenerate(msg.id)}
              disabled={isLoading}
              className="p-1 text-[var(--text-muted)] rounded-[8px] transition disabled:opacity-50 disabled:cursor-not-allowed"
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-body)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = ''}
              title="重新生成"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          )}
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onMenuToggle(msg.id);
              }}
              className="p-1 text-[var(--text-muted)] rounded-[8px] transition"
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-body)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = ''}
              title="更多操作"
            >
              <MoreVertical className="w-3.5 h-3.5" />
            </button>

            {activeMenuId === msg.id && (
              <div
                className={`absolute bottom-full mb-1 w-24 backdrop-blur-md border border-white/10 rounded-[10px] shadow-[0_0_20px_rgba(0,0,0,0.3)] z-50 overflow-hidden flex flex-col ${isUser ? 'right-0' : 'left-0'}`}
                style={{ background: 'color-mix(in srgb, var(--bg-elevated) 90%, transparent)' }}
              >
                <button
                  className="px-3 py-2 text-sm text-left transition"
                  style={{ color: 'var(--text-body)' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onCopy(msg.text);
                  }}
                >
                  複製
                </button>
                <button
                  className="px-3 py-2 text-sm text-left transition"
                  style={{ color: 'var(--text-body)' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(msg.id, msg.text);
                  }}
                >
                  編輯
                </button>
                <button
                  className="px-3 py-2 text-sm text-left transition"
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
          <div className="leading-relaxed">{renderMarkdown(stripBareCommands(msg.text))}</div>
        )}
      </MessageBubble>
    </motion.div>
  );
});

MessageCard.displayName = 'MessageCard';
