/**
 * MessageCard - Reusable message rendering component
 * 抽離訊息卡片邏輯，供虛擬列表使用
 */

import React from 'react';
import { RefreshCw, MoreVertical } from 'lucide-react';
import { Message } from '../types';

interface MessageCardProps {
  msg: Message;
  profile: { name: string };
  activeMenuId: number | null;
  editingMessageId: number | null;
  editMessageText: string;
  isLoading: boolean;
  messages: Message[];
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
  showToast: (msg: string) => void;
}

export const MessageCard: React.FC<MessageCardProps> = ({
  msg,
  profile,
  activeMenuId,
  editingMessageId,
  editMessageText,
  isLoading,
  messages,
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
  showToast,
}) => {
  return (
    <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end pl-5' : 'items-start pr-5'} max-w-3xl mx-auto w-full group relative ${activeMenuId === msg.id ? 'z-20' : 'z-0'}`}>
      <div className={`flex items-center space-x-2 mb-1 ${msg.role === 'user' ? 'mr-2 flex-row-reverse space-x-reverse' : 'ml-2'}`}>
        <span className="text-sm text-[var(--text-muted)] font-bold">
          {msg.role === 'user' ? profile.name : '異世界'}
        </span>
        <div className={`flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition ${activeMenuId === msg.id ? 'opacity-100' : ''}`}>
          {msg.role !== 'user' && (
            <button
              onClick={() => onRegenerate(msg.id)}
              disabled={isLoading}
              className="p-1 text-[var(--text-muted)] rounded-[8px] transition disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ '--hover-color': 'var(--text-body)' } as React.CSSProperties}
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
              title="更多選項"
            >
              <MoreVertical className="w-3.5 h-3.5" />
            </button>

            {activeMenuId === msg.id && (
              <div className={`absolute bottom-full mb-1 w-24 backdrop-blur-md border border-white/10 rounded-[10px] shadow-[0_0_20px_rgba(0,0,0,0.3)] z-50 overflow-hidden flex flex-col ${msg.role === 'user' ? 'right-0' : 'left-0'}`} style={{ background: 'color-mix(in srgb, var(--bg-elevated) 90%, transparent)' }}>
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

      <div className={`p-4 text-left max-w-full ${editingMessageId === msg.id ? 'w-full' : 'w-fit'}`} style={{
        color: msg.role === 'user' ? 'var(--text-dialog-main)' : 'var(--text-dialog-main)',
        background: msg.role === 'user' ? 'var(--bg-bubble-self)' : 'var(--bg-bubble-npc)',
        borderRadius: '8px',
        border: msg.role === 'user' ? '0.5px solid rgba(119, 93, 22, 0.3)' : '0.5px solid var(--border-default)'
      }}>
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
        ) : msg.role === 'user' ? (
          <p className="leading-relaxed whitespace-pre-wrap">{msg.text}</p>
        ) : msg.text === '' && isLoading && msg.id === messages[messages.length - 1]?.id ? (
          <div className="flex items-center space-x-2 py-0.5 select-none">
            <span className="text-sm" style={{ color: 'var(--text-stat-label)' }}>✦ 異世界正在回應</span>
            <span className="flex items-end space-x-0.5 pb-0.5">
              {[0, 200, 400].map(delay => (
                <span
                  key={delay}
                  className="inline-block w-1 h-1 rounded-full"
                  style={{ background: 'var(--text-stat-label)', animation: `blink-dot 1.4s ease-in-out infinite`, animationDelay: `${delay}ms` }}
                />
              ))}
            </span>
          </div>
        ) : (
          <div className="leading-relaxed">{renderMarkdown(stripBareCommands(msg.text))}</div>
        )}
      </div>
    </div>
  );
};
