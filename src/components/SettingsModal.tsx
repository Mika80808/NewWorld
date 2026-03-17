import React, { useRef } from 'react';
import { Settings, Download, Upload, RotateCcw } from 'lucide-react';

import { TOKEN_OPTIONS } from '../constants';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  geminiApiKey: string;
  setGeminiApiKey: (key: string) => void;
  maxTokens: number;
  setMaxTokens: (tokens: number) => void;
  handleExportSave: () => void;
  handleImportSave: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleResetGame: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  geminiApiKey,
  setGeminiApiKey,
  maxTokens,
  setMaxTokens,
  handleExportSave,
  handleImportSave,
  handleResetGame,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#0d1f3c]/70 backdrop-blur-xl w-full max-w-sm rounded-[8px] shadow-[0_0_40px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden text-[#e2eaf8] border border-white/10 relative">
        <div className="p-4 border-b border-white/5 flex justify-between items-center bg-[#0d1f3c]/50">
          <h2 className="text-lg font-bold flex items-center text-[#e6bf55]"><Settings className="w-5 h-5 mr-2 text-[#e6bf55]" /> 系統設定</h2>
          <button 
            className="text-[#3a5a8a] hover:text-[#e2eaf8] transition"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        
        <div className="p-6 space-y-4">

          {/* API Key 輸入 */}
          <div className="bg-[#132540]/40 border border-white/5 rounded-2xl p-4 space-y-2">
            <label className="text-xs text-[#8ab4e8] uppercase tracking-wider flex items-center gap-2">
              <span>🔑</span> Gemini API Key
            </label>
            <div className="relative">
              <input
                type="password"
                value={geminiApiKey}
                onChange={(e) => {
                  setGeminiApiKey(e.target.value);
                  localStorage.setItem('gemini_api_key', e.target.value);
                }}
                placeholder="貼上你的 API Key..."
                className="w-full bg-[#0d1f3c]/60 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-[#e2eaf8] outline-none focus:border-[#e6bf55]/50 transition pr-16"
              />
              {geminiApiKey && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-emerald-400">
                  ✓ 已設定
                </span>
              )}
            </div>
            <p className="text-[11px] text-[#ffffff] leading-relaxed">
              儲存在本機瀏覽器，不會上傳。取得方式：<br/>
              <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-[#85b0f5] hover:text-[#8ab4e8] underline transition">aistudio.google.com</a>
            </p>
          </div>

          {/* Token 上限設定 */}
          <div className="bg-[#132540]/40 border border-white/5 rounded-2xl p-4 space-y-3">
            <label className="text-xs text-[#8ab4e8] uppercase tracking-wider flex items-center gap-2">
              Token 上限
            </label>
            <div className="flex gap-2">
              {TOKEN_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => {
                    setMaxTokens(opt.value);
                    localStorage.setItem('gemini_max_tokens', String(opt.value));
                  }}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-bold border transition ${
                    maxTokens === opt.value
                      ? 'bg-[#0046eb]/80 border-[#0046eb] text-[#e2eaf8] shadow-[0_0_12px_rgba(99,102,241,0.4)]'
                      : 'bg-[#0d1f3c]/50 border-white/10 text-[#8ab4e8] hover:border-[#0046eb]/40 hover:text-[#e2eaf8]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-[#ffffff] leading-relaxed">
              較高的上限允許 AI 產生更長的回應，但會消耗更多 API 額度。
            </p>
          </div>

          
          <div className="border-t border-white/5 pt-2" />

          <button 
            onClick={handleExportSave}
            className="w-full bg-[#132540]/40 backdrop-blur-sm border border-white/5 hover:bg-[#1a2e50]/50 text-[#e2eaf8] py-3 px-4 rounded-2xl flex items-center justify-between transition shadow-sm"
          >
            <span className="flex items-center"><Upload className="w-4 h-4 mr-3 text-[#00d492]" /> 匯出存檔</span>
            <span className="text-xs text-[#8ab4e8]">下載 JSON 檔</span>
          </button>
          
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="w-full bg-[#132540]/40 backdrop-blur-sm border border-white/5 hover:bg-[#1a2e50]/50 text-[#e2eaf8] py-3 px-4 rounded-2xl flex items-center justify-between transition shadow-sm"
          >
            <span className="flex items-center"><Download className="w-4 h-4 mr-3 text-emerald-400" /> 匯入存檔</span>
            <span className="text-xs text-[#8ab4e8]">讀取 JSON 檔</span>
          </button>
          <input 
            type="file" 
            accept=".json" 
            className="hidden" 
            ref={fileInputRef}
            onChange={handleImportSave}
          />

          <div className="pt-4 border-t border-white/5 mt-4">
            <button 
              onClick={handleResetGame}
              className="w-full bg-rose-900/20 backdrop-blur-sm hover:bg-rose-900/40 border border-rose-800/30 text-rose-300 py-3 px-4 rounded-2xl flex items-center justify-between transition shadow-sm"
            >
              <span className="flex items-center"><RotateCcw className="w-4 h-4 mr-3" /> 重置遊戲</span>
              <span className="text-xs text-rose-400/70">清除所有進度</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
