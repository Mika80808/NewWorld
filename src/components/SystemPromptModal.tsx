import React from 'react';
import { Brain } from 'lucide-react';

import { SystemPrompt } from '../types';

interface SystemPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  systemPrompt: SystemPrompt;
  setSystemPrompt: (prompt: SystemPrompt) => void;
  showToast: (msg: string) => void;
}

export const SystemPromptModal: React.FC<SystemPromptModalProps> = ({
  isOpen,
  onClose,
  systemPrompt,
  setSystemPrompt,
  showToast,
}) => {

  if (!isOpen) return null;

  const textareaClass = "w-full backdrop-blur-sm border border-white/10 rounded-[8px] p-3 text-sm outline-none transition resize-y min-h-[200px] overflow-y-auto";

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div className="backdrop-blur-xl w-full max-w-2xl rounded-[8px] shadow-[0_0_40px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden border border-white/10 relative h-[80vh]" style={{ background: 'color-mix(in srgb, var(--bg-elevated) 70%, transparent)', color: 'var(--text-title)' }}>
        <div className="p-4 border-b border-white/5 flex justify-between items-center" style={{ background: 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)' }}>
          <div className="flex items-center">
            <h2 className="text-lg font-bold flex items-center" style={{ color: 'var(--text-primary)' }}>
              <Brain className="w-5 h-5 mr-2" style={{ color: 'var(--text-primary)' }} /> 系統底層邏輯
            </h2>
          </div>
          <button
            className="transition text-lg leading-none"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--text-body)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {([
            { key: 'worldPremise' as keyof SystemPrompt, label: '世界觀｜定義這個世界的基本法則、時代背景與核心衝突。', placeholder: '例如：這是一個賽博龐克世界，企業控制了一切...' },
            { key: 'roleplayRules' as keyof SystemPrompt, label: '扮演規則｜限制 AI 的行為，例如不能代替玩家說話、必須根據屬性判定結果等。', placeholder: '例如：你是一個無情的地下城主，絕對不要給玩家放水...' },
            { key: 'writingStyle' as keyof SystemPrompt, label: '文筆風格｜指定 AI 回覆的語氣、字數限制與描寫重點。', placeholder: '例如：請使用充滿感官細節的文學筆觸，每次回覆不超過 150 字...' },
          ]).map(({ key, label, placeholder }) => (
            <div key={key} className="space-y-2">
              <div className="flex items-baseline gap-2">
                <label className="text-sm font-bold flex items-center shrink-0 ml-3" style={{ color: 'var(--text-body)' }}>
                   {label}
                </label>
              </div>
              <textarea
                value={(systemPrompt[key] as string) ?? ''}
                onChange={(e) => setSystemPrompt({ ...systemPrompt, [key]: e.target.value })}
                className={textareaClass}
                style={{ background: 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)', color: 'var(--text-body)' }}
                placeholder={placeholder}
              />
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-white/5 flex justify-end" style={{ background: 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)' }}>
          <button
            onClick={() => {
              onClose();
              showToast('已儲存系統底層邏輯');
            }}
            className="backdrop-blur-sm rounded-[8px] transition shadow-[var(--shadow)] border-none w-[96px] h-[36px] py-[6px] mr-[14px] flex items-center justify-center text-[14px] leading-[16px]"
            style={{ background: 'var(--btn-primary)', color: 'var(--btn--text' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--btn-primary-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'var(--btn-primary)'}
          >
            儲存
          </button>
        </div>
      </div>
    </div>
  );
};
