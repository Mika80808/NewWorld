import React, { useState, useEffect } from 'react';

export interface DialogRequest {
  title: string;
  message?: string;
  confirmLabel?: string;
  /** 危險動作（刪除、重置）：確認鈕以紅色文字呈現（依設計規範不用紅色按鈕） */
  danger?: boolean;
  /** 有值時顯示文字輸入框（取代 window.prompt） */
  input?: { placeholder?: string; maxLength?: number };
  onConfirm: (value?: string) => void;
}

interface ConfirmDialogProps {
  request: DialogRequest | null;
  onClose: () => void;
}

/**
 * 取代 window.confirm / window.prompt 的自訂對話框，與整體 UI 風格一致
 */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({ request, onClose }) => {
  const [value, setValue] = useState('');

  useEffect(() => {
    if (request) setValue('');
  }, [request]);

  if (!request) return null;

  const canConfirm = !request.input || value.trim().length > 0;

  const handleConfirm = () => {
    if (!canConfirm) return;
    request.onConfirm(request.input ? value.trim() : undefined);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center px-6"
      style={{ zIndex: 'var(--z-modal-high)', background: 'rgba(0,0,0,0.55)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-[8px] p-5 flex flex-col gap-3"
        style={{
          background: 'var(--bg-elevated)',
          border: '0.5px solid var(--border-default)',
          boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
          {request.title}
        </h2>
        {request.message && (
          <p className="text-sm leading-relaxed" style={{ color: 'var(--text-body)' }}>
            {request.message}
          </p>
        )}
        {request.input && (
          <input
            type="text"
            autoFocus
            value={value}
            maxLength={request.input.maxLength}
            placeholder={request.input.placeholder}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleConfirm(); }}
            className="w-full px-3 py-2 rounded-[8px] text-sm outline-none"
            style={{
              background: 'var(--bg-sys-field)',
              color: 'var(--text-main)',
              border: '0.5px solid var(--border-default)',
            }}
          />
        )}
        <div className="flex justify-end gap-2 mt-1">
          <button
            className="px-4 py-1.5 rounded-[8px] text-sm"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = 'var(--text-body)')}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = 'var(--text-muted)')}
            onClick={onClose}
          >
            取消
          </button>
          {request.danger ? (
            <button
              className="px-4 py-1.5 rounded-[8px] text-sm font-medium"
              style={{ color: 'var(--text-danger)' }}
              onClick={handleConfirm}
            >
              {request.confirmLabel ?? '確定'}
            </button>
          ) : (
            <button
              className="px-4 py-1.5 rounded-[8px] text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: 'var(--btn-primary)', color: 'var(--btn--text)', boxShadow: 'var(--shadow)' }}
              onMouseEnter={e => { if (canConfirm) e.currentTarget.style.background = 'var(--btn-primary-hover)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--btn-primary)'; }}
              onClick={handleConfirm}
              disabled={!canConfirm}
            >
              {request.confirmLabel ?? '確定'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
