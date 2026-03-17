import React, { useEffect, useRef } from 'react';
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
  const worldRef = useRef<HTMLTextAreaElement>(null);
  const roleplayRef = useRef<HTMLTextAreaElement>(null);
  const writingRef = useRef<HTMLTextAreaElement>(null);

  const autoResize = (textarea: HTMLTextAreaElement | null) => {
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = textarea.scrollHeight + 'px';
    }
  };

  useEffect(() => {
    if (isOpen) {
      // 延遲一下確保 DOM 已渲染
      const timer = setTimeout(() => {
        autoResize(worldRef.current);
        autoResize(roleplayRef.current);
        autoResize(writingRef.current);
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen, systemPrompt]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#0d1f3c]/70 backdrop-blur-xl w-full max-w-2xl rounded-[8px] shadow-[0_0_40px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden text-[#e2eaf8] border border-white/10 relative h-[80vh]">
        <div className="p-4 border-b border-white/5 flex justify-between items-center bg-[#0d1f3c]/50">
          <div className="flex items-center">
            <h2 className="text-lg font-bold flex items-center text-[#e6bf55]"><Brain className="w-5 h-5 mr-2 text-[#e6bf55]" /> 系統底層邏輯</h2>
            <span className="ml-4 text-xs text-[#8ab4e8]"></span>
          </div>
          <button 
            className="text-[#3a5a8a] hover:text-[#e2eaf8] transition"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="space-y-2">
            <div className="flex items-baseline gap-2">
              <label className="text-sm font-bold text-[#8ab4e8] flex items-center shrink-0 ml-3">
                 世界觀｜定義這個世界的基本法則、時代背景與核心衝突。
              </label>
            </div>
            <textarea 
              ref={worldRef}
              value={systemPrompt.worldPremise}
              onChange={(e) => setSystemPrompt({...systemPrompt, worldPremise: e.target.value})}
              onInput={(e) => autoResize(e.currentTarget)}
              className="w-full bg-[#0d1f3c]/50 backdrop-blur-sm border border-white/10 rounded-xl p-3 text-sm text-[#e2eaf8] focus:border-blue-500/50 focus:shadow-[0_0_15px_rgba(16,68,171,0.2)] outline-none transition resize-none min-h-[200px] overflow-hidden"
              placeholder="例如：這是一個賽博龐克世界，企業控制了一切..."
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-baseline gap-2">
              <label className="text-sm font-bold text-[#8ab4e8] flex items-center shrink-0 ml-3">
                 扮演規則｜限制 AI 的行為，例如不能代替玩家說話、必須根據屬性判定結果等。
              </label>
            </div>
            <textarea 
              ref={roleplayRef}
              value={systemPrompt.roleplayRules}
              onChange={(e) => setSystemPrompt({...systemPrompt, roleplayRules: e.target.value})}
              onInput={(e) => autoResize(e.currentTarget)}
              className="w-full bg-[#0d1f3c]/50 backdrop-blur-sm border border-white/10 rounded-xl p-3 text-sm text-[#e2eaf8] focus:border-blue-500/50 focus:shadow-[0_0_15px_rgba(16,68,171,0.2)] outline-none transition resize-none min-h-[200px] overflow-hidden"
              placeholder="例如：你是一個無情的地下城主，絕對不要給玩家放水..."
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-baseline gap-2">
              <label className="text-sm font-bold text-[#8ab4e8] flex items-center shrink-0 ml-3">
                 文筆風格｜指定 AI 回覆的語氣、字數限制與描寫重點。
              </label>
            </div>
            <textarea 
              ref={writingRef}
              value={systemPrompt.writingStyle}
              onChange={(e) => setSystemPrompt({...systemPrompt, writingStyle: e.target.value})}
              onInput={(e) => autoResize(e.currentTarget)}
              className="w-full bg-[#0d1f3c]/50 backdrop-blur-sm border border-white/10 rounded-xl p-3 text-sm text-[#e2eaf8] focus:border-blue-500/50 focus:shadow-[0_0_15px_rgba(16,68,171,0.2)] outline-none transition resize-none min-h-[200px] overflow-hidden"
              placeholder="例如：請使用充滿感官細節的文學筆觸，每次回覆不超過 150 字..."
            />
          </div>
        </div>
        
        <div className="p-4 border-t border-white/5 bg-[#0d1f3c]/50 flex justify-end">
          <button 
            onClick={() => {
              onClose();
              showToast('已儲存系統底層邏輯');
            }}
            className="bg-[#1044ab]/80 hover:bg-[#0046eb] backdrop-blur-sm text-[#e2eaf8] rounded-[8px] transition shadow-[0_0_15px_rgba(16,68,171,0.2)] border-none w-[96px] h-[36px] py-[6px] mr-[14px] flex items-center justify-center text-[14px] leading-[16px]"
          >
            儲存
          </button>
        </div>
      </div>
    </div>
  );
};
