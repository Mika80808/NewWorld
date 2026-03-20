import React, { useState, useRef } from 'react';
import { Settings, Download, Upload, RotateCcw, Eye, EyeOff } from 'lucide-react';
import { GMConfig, SubGMConfig } from '../types';

const GEMINI_MODELS = [
  { value: 'gemini-2.0-flash',        label: 'Gemini 2.0 Flash（快速／輕量）' },
  { value: 'gemini-2.0-flash-lite',   label: 'Gemini 2.0 Flash Lite（最省費）' },
  { value: 'gemini-2.5-pro-preview',  label: 'Gemini 2.5 Pro（最強／較慢）' },
  { value: 'gemini-1.5-pro',          label: 'Gemini 1.5 Pro（穩定版）' },
  { value: 'gemini-1.5-flash',        label: 'Gemini 1.5 Flash（穩定輕量）' },
];

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  mainGMConfig: GMConfig;
  setMainGMConfig: (cfg: GMConfig) => void;
  subGMConfig: SubGMConfig;
  setSubGMConfig: (cfg: SubGMConfig) => void;
  handleExportSave: () => void;
  handleImportSave: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleResetGame: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen, onClose,
  mainGMConfig, setMainGMConfig,
  subGMConfig, setSubGMConfig,
  handleExportSave, handleImportSave, handleResetGame,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showMainKey, setShowMainKey] = useState(false);
  const [showSubKey, setShowSubKey] = useState(false);

  // 本地草稿，點「儲存設定」才寫入 localStorage + 更新 state
  const [draftMain, setDraftMain] = useState<GMConfig>(mainGMConfig);
  const [draftSub, setDraftSub] = useState<SubGMConfig>(subGMConfig);

  if (!isOpen) return null;

  const handleSave = () => {
    const now = new Date().toISOString();
    const savedMain = { ...draftMain, lastSaved: now };
    const savedSub = { ...draftSub, lastSaved: now };
    localStorage.setItem('mainGM_config', JSON.stringify(savedMain));
    localStorage.setItem('subGM_config', JSON.stringify(savedSub));
    setMainGMConfig(savedMain);
    setSubGMConfig(savedSub);
  };

  const formatLastSaved = (iso: string) => {
    if (!iso) return '尚未儲存';
    try {
      const d = new Date(iso);
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    } catch { return '—'; }
  };

  const inputClass = "w-full bg-[#24282d]/60 border border-[#283b57] rounded-[8px] px-3 py-2 text-sm text-[#fbf5e4] outline-none focus:border-[#fde68a]/50 transition";
  const selectClass = "w-full bg-[#24282d]/60 border border-[#283b57] rounded-[8px] px-3 py-2 text-sm text-[#fbf5e4] outline-none focus:border-[#fde68a]/50 transition";
  const labelClass = "text-xs text-[#e8e8e9] mb-1 block";
  const sectionClass = "bg-[#132540]/40 border border-[#283b57]/40 rounded-[8px] p-4 space-y-3";

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#24282d]/90 backdrop-blur-xl w-full max-w-sm rounded-[8px] shadow-[0_0_40px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden text-[#fbf5e4] border border-[#283b57]/60">

        {/* 標題列 */}
        <div className="p-4 border-b border-[#283b57]/40 flex justify-between items-center">
          <h2 className="text-base font-bold flex items-center gap-2 text-[#fde68a]">
            <Settings className="w-4 h-4" /> 系統設定
          </h2>
          <button onClick={onClose} className="text-[var(--text3)] hover:text-[#fbf5e4] transition text-lg leading-none">✕</button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto max-h-[80vh]">

          {/* ── 主 GM ─────────────────────────────────────────── */}
          <div className={sectionClass}>
            <p className="text-xs font-bold text-[#fde68a] uppercase tracking-wider">主 GM</p>

            <div>
              <label className={labelClass}>API Key</label>
              <div className="relative">
                <input
                  type={showMainKey ? 'text' : 'password'}
                  value={draftMain.apiKey}
                  onChange={e => setDraftMain(p => ({ ...p, apiKey: e.target.value }))}
                  placeholder="貼上 Gemini API Key..."
                  className={`${inputClass} pr-10`}
                />
                <button
                  onClick={() => setShowMainKey(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text3)] hover:text-[#e8e8e9] transition"
                >
                  {showMainKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {draftMain.apiKey && (
                <p className="text-[11px] text-emerald-400 mt-1">✓ 已填寫</p>
              )}
            </div>

            <div>
              <label className={labelClass}>模型</label>
              <select
                value={draftMain.model}
                onChange={e => setDraftMain(p => ({ ...p, model: e.target.value }))}
                className={selectClass}
              >
                {GEMINI_MODELS.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass}>Token 上限（回應長度）</label>
              <input
                type="number"
                min={256}
                max={65536}
                step={256}
                value={draftMain.maxTokens}
                onChange={e => setDraftMain(p => ({ ...p, maxTokens: parseInt(e.target.value) || 2048 }))}
                className={inputClass}
              />
            </div>
          </div>

          {/* ── 助理 GM ───────────────────────────────────────── */}
          <div className={sectionClass}>
            <p className="text-xs font-bold text-[#fde68a] uppercase tracking-wider">助理 GM</p>

            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <input
                type="checkbox"
                checked={draftSub.useSameKey}
                onChange={e => setDraftSub(p => ({ ...p, useSameKey: e.target.checked }))}
                className="accent-[#fde68a]"
              />
              使用與主 GM 相同的 API Key
            </label>

            {!draftSub.useSameKey && (
              <div>
                <label className={labelClass}>助理 GM API Key</label>
                <div className="relative">
                  <input
                    type={showSubKey ? 'text' : 'password'}
                    value={draftSub.apiKey}
                    onChange={e => setDraftSub(p => ({ ...p, apiKey: e.target.value }))}
                    placeholder="貼上助理 GM API Key..."
                    className={`${inputClass} pr-10`}
                  />
                  <button
                    onClick={() => setShowSubKey(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text3)] hover:text-[#e8e8e9] transition"
                  >
                    {showSubKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            <div>
              <label className={labelClass}>模型</label>
              <select
                value={draftSub.model}
                onChange={e => setDraftSub(p => ({ ...p, model: e.target.value }))}
                className={selectClass}
              >
                {GEMINI_MODELS.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass}>Token 上限（背景摘要）</label>
              <input
                type="number"
                min={128}
                max={4096}
                step={128}
                value={draftSub.maxTokens}
                onChange={e => setDraftSub(p => ({ ...p, maxTokens: parseInt(e.target.value) || 512 }))}
                className={inputClass}
              />
            </div>
          </div>

          {/* ── 狀態資訊 + 儲存 ──────────────────────────────── */}
          <div className="space-y-2">
            <div className="text-xs text-[var(--text3)] space-y-0.5">
              <p>最後儲存：{formatLastSaved(mainGMConfig.lastSaved)}</p>
              <p>當前生效：{mainGMConfig.model || '—'}</p>
            </div>
            <button
              onClick={handleSave}
              className="w-full py-2.5 rounded-[8px] bg-[#fde68a]/20 border border-[#fde68a]/40 text-[#fde68a] text-sm font-bold hover:bg-[#fde68a]/30 transition"
            >
              儲存設定
            </button>
            <p className="text-[11px] text-[var(--text3)]">
              API Key 只存在本機瀏覽器，不會上傳。取得：{' '}
              <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-[#e8e8e9] hover:underline">aistudio.google.com</a>
            </p>
          </div>

          <div className="border-t border-[#283b57]/40 pt-2" />

          {/* ── 資料管理 ──────────────────────────────────────── */}
          <button
            onClick={handleExportSave}
            className="w-full bg-[#132540]/40 border border-[#283b57]/40 hover:bg-[#132540]/50 text-[#fbf5e4] py-2.5 px-4 rounded-[8px] flex items-center justify-between transition text-sm"
          >
            <span className="flex items-center"><Upload className="w-4 h-4 mr-2 text-[#00d492]" /> 匯出存檔</span>
            <span className="text-xs text-[#e8e8e9]">下載 JSON</span>
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full bg-[#132540]/40 border border-[#283b57]/40 hover:bg-[#132540]/50 text-[#fbf5e4] py-2.5 px-4 rounded-[8px] flex items-center justify-between transition text-sm"
          >
            <span className="flex items-center"><Download className="w-4 h-4 mr-2 text-emerald-400" /> 匯入存檔</span>
            <span className="text-xs text-[#e8e8e9]">讀取 JSON</span>
          </button>
          <input type="file" accept=".json" className="hidden" ref={fileInputRef} onChange={handleImportSave} />

          <button
            onClick={handleResetGame}
            className="w-full bg-rose-900/20 hover:bg-rose-900/40 border border-rose-800/30 text-rose-300 py-2.5 px-4 rounded-[8px] flex items-center justify-between transition text-sm"
          >
            <span className="flex items-center"><RotateCcw className="w-4 h-4 mr-2" /> 重置遊戲</span>
            <span className="text-xs text-rose-400/70">清除所有進度</span>
          </button>

        </div>
      </div>
    </div>
  );
};
