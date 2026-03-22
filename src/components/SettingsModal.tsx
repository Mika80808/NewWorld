import React, { useState, useRef } from 'react';
import { Settings, Download, Upload, RotateCcw, Eye, EyeOff } from 'lucide-react';
import { GMConfig, SubGMConfig } from '../types';

const GEMINI_MODELS = [
  { value: 'gemini-2.5-flash',        label: 'Gemini 2.5 Flash（快速／輕量）' },
  { value: 'gemini-2.5-flash-lite',   label: 'Gemini 2.5 Flash Lite（最省費）' },
  { value: 'gemini-2.5-pro',          label: 'Gemini 2.5 Pro（最強／較慢）' },
  { value: 'gemini-2.0-flash-lite',   label: 'Gemini 2.0 Flash Lite（舊版輕量）' },
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

  const inputStyle: React.CSSProperties = { background: 'color-mix(in srgb, var(--bg-elevated) 60%, transparent)', color: 'var(--text-body)', borderColor: 'var(--border-default)' };
  const sectionStyle: React.CSSProperties = { background: 'color-mix(in srgb, var(--bg-elevated) 40%, transparent)', border: `1px solid color-mix(in srgb, var(--border-default) 40%, transparent)` };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="backdrop-blur-xl w-full max-w-sm rounded-[8px] shadow-[0_0_40px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden border rounded-[8px]" style={{ background: 'color-mix(in srgb, var(--bg-elevated) 90%, transparent)', color: 'var(--text-title)', borderColor: 'color-mix(in srgb, var(--border-default) 60%, transparent)' }}>

        {/* 標題列 */}
        <div className="p-4 flex justify-between items-center" style={{ borderBottom: `1px solid color-mix(in srgb, var(--border-default) 40%, transparent)` }}>
          <h2 className="text-base font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <Settings className="w-4 h-4" /> 系統設定
          </h2>
          <button
            onClick={onClose}
            className="transition text-lg leading-none"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--text-title)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
          >✕</button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto max-h-[80vh]">

          {/* ── 主 GM ── */}
          <div className="rounded-[8px] p-4 space-y-3" style={sectionStyle}>
            <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-title)' }}>主 GM</p>

            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--text-body)' }}>API Key</label>
              <div className="relative">
                <input
                  type={showMainKey ? 'text' : 'password'}
                  value={draftMain.apiKey}
                  onChange={e => setDraftMain(p => ({ ...p, apiKey: e.target.value }))}
                  placeholder="貼上 Gemini API Key..."
                  className="w-full border rounded-[8px] px-3 py-2 text-sm outline-none transition pr-10 "
                  style={inputStyle}
                />
                <button
                  onClick={() => setShowMainKey(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 transition"
                  style={{ color: 'var(--text-muted)' }}
                  onMouseEnter={e => e.currentTarget.style.color = 'var(--text-body)'}
                  onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
                >
                  {showMainKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {draftMain.apiKey && (
                <p className="text-[11px] mt-1" style={{ color: 'var(--color-success)' }}>✓ 已填寫</p>
              )}
            </div>

            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--text-body)' }}>模型</label>
              <select
                value={draftMain.model}
                onChange={e => setDraftMain(p => ({ ...p, model: e.target.value }))}
                className="w-full border rounded-[8px] px-3 py-2 text-sm outline-none transition"
                style={inputStyle}
              >
                {GEMINI_MODELS.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--text-body)' }}>Token 上限（回應長度）</label>
              <input
                type="number"
                min={256}
                max={65536}
                step={256}
                value={draftMain.maxTokens}
                onChange={e => setDraftMain(p => ({ ...p, maxTokens: parseInt(e.target.value) || 2048 }))}
                className="w-full border rounded-[8px] px-3 py-2 text-sm outline-none transition"
                style={inputStyle}
              />
            </div>
          </div>

          {/* ── 助理 GM ── */}
          <div className="rounded-[8px] p-4 space-y-3" style={sectionStyle}>
            <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-title)' }}>助理 GM</p>

            <label className="flex items-center gap-2 text-sm cursor-pointer select-none" style={{ color: 'var(--text-body)' }}>
              <input
                type="checkbox"
                checked={draftSub.useSameKey}
                onChange={e => setDraftSub(p => ({ ...p, useSameKey: e.target.checked }))}
                style={{ accentColor: 'var(--tab-active)' }}
              />
              使用與主 GM 相同的 API Key
            </label>

            {!draftSub.useSameKey && (
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--text-body)' }}>助理 GM API Key</label>
                <div className="relative">
                  <input
                    type={showSubKey ? 'text' : 'password'}
                    value={draftSub.apiKey}
                    onChange={e => setDraftSub(p => ({ ...p, apiKey: e.target.value }))}
                    placeholder="貼上助理 GM API Key..."
                    className="w-full border rounded-[8px] px-3 py-2 text-sm outline-none transition pr-10"
                    style={inputStyle}
                  />
                  <button
                    onClick={() => setShowSubKey(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 transition"
                    style={{ color: 'var(--text-muted)' }}
                    onMouseEnter={e => e.currentTarget.style.color = 'var(--text-body)'}
                    onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
                  >
                    {showSubKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--text-body)' }}>模型</label>
              <select
                value={draftSub.model}
                onChange={e => setDraftSub(p => ({ ...p, model: e.target.value }))}
                className="w-full border rounded-[8px] px-3 py-2 text-sm outline-none transition"
                style={inputStyle}
              >
                {GEMINI_MODELS.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--text-body)' }}>Token 上限（背景摘要）</label>
              <input
                type="number"
                min={128}
                max={4096}
                step={128}
                value={draftSub.maxTokens}
                onChange={e => setDraftSub(p => ({ ...p, maxTokens: parseInt(e.target.value) || 512 }))}
                className="w-full border rounded-[8px] px-3 py-2 text-sm outline-none transition"
                style={inputStyle}
              />
            </div>
          </div>

          {/* ── 狀態資訊 + 儲存 ── */}
          <div className="space-y-2">
            <div className="text-xs space-y-0.5" style={{ color: 'var(--text-muted)' }}>
              <p>最後儲存：{formatLastSaved(mainGMConfig.lastSaved)}</p>
              <p>當前生效：{mainGMConfig.model || '—'}</p>
            </div>
            <button
              onClick={handleSave}
              className="w-full py-2.5 rounded-[8px] text-sm font-bold transition"
              style={{ background: 'color-mix(in srgb, var(--text-primary) 20%, transparent)', border: `1px solid color-mix(in srgb, var(--text-primary) 40%, transparent)`, color: 'var(--text-primary)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'color-mix(in srgb, var(--text-primary) 30%, transparent)'}
              onMouseLeave={e => e.currentTarget.style.background = 'color-mix(in srgb, var(--text-primary) 20%, transparent)'}
            >
              儲存設定
            </button>
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              API Key 只存在本機瀏覽器，不會上傳。取得：{' '}
              <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="hover:underline" style={{ color: 'var(--color-blue)' }}>aistudio.google.com</a>
            </p>
          </div>

          <div style={{ borderTop: `1px solid color-mix(in srgb, var(--border-default) 40%, transparent)`, paddingTop: '8px' }} />

          {/* ── 資料管理 ── */}
          <button
            onClick={handleExportSave}
            className="w-full rounded-[8px] py-2.5 px-4 flex items-center justify-between transition text-sm"
            style={{ background: 'color-mix(in srgb, var(--bg-elevated) 40%, transparent)', border: `1px solid color-mix(in srgb, var(--border-default) 40%, transparent)`, color: 'var(--text-body)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)'}
            onMouseLeave={e => e.currentTarget.style.background = 'color-mix(in srgb, var(--bg-elevated) 40%, transparent)'}
          >
            <span className="flex items-center"><Upload className="w-4 h-4 mr-2" style={{ color: 'var(--color-success)' }} /> 匯出存檔</span>
            <span className="text-xs" style={{ color: 'var(--text-body)' }}>下載 JSON</span>
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full rounded-[8px] py-2.5 px-4 flex items-center justify-between transition text-sm"
            style={{ background: 'color-mix(in srgb, var(--bg-elevated) 40%, transparent)', border: `1px solid color-mix(in srgb, var(--border-default) 40%, transparent)`, color: 'var(--text-body)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)'}
            onMouseLeave={e => e.currentTarget.style.background = 'color-mix(in srgb, var(--bg-elevated) 40%, transparent)'}
          >
            <span className="flex items-center"><Download className="w-4 h-4 mr-2" style={{ color: 'var(--color-success)' }} /> 匯入存檔</span>
            <span className="text-xs" style={{ color: 'var(--text-body)' }}>讀取 JSON</span>
          </button>
          <input type="file" accept=".json" className="hidden" ref={fileInputRef} onChange={handleImportSave} />

          <button
            onClick={handleResetGame}
            className="w-full rounded-[8px] py-2.5 px-4 flex items-center justify-between transition text-sm"
            style={{ background: 'color-mix(in srgb, var(--color-rose) 10%, transparent)', border: `1px solid color-mix(in srgb, var(--color-rose) 20%, transparent)`, color: 'var(--text-danger)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'color-mix(in srgb, var(--color-rose) 20%, transparent)'}
            onMouseLeave={e => e.currentTarget.style.background = 'color-mix(in srgb, var(--color-rose) 10%, transparent)'}
          >
            <span className="flex items-center"><RotateCcw className="w-4 h-4 mr-2" /> 重置遊戲</span>
            <span className="text-xs" style={{ color: 'color-mix(in srgb, var(--text-danger) 70%, transparent)' }}>清除所有進度</span>
          </button>

        </div>
      </div>
    </div>
  );
};
