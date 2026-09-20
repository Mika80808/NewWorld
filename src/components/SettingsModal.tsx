import React, { useState, useRef } from 'react';
import { Settings, Download, Upload, RotateCcw, Eye, EyeOff } from 'lucide-react';
import { User } from '@supabase/supabase-js';
import { GMConfig, SubGMConfig } from '../types';
import { PROVIDERS, ProviderModel, modelsForEndpoint, normalizeBaseUrl, providerMeta } from '../utils/aiProviders';
import { switchProvider } from '../utils/gmConfig';
import {
  GMProfile, MAX_PROFILES, applyProfile, loadProfiles, matchProfile,
  profileFromConfig, profileSummary, removeProfile, saveProfiles, upsertProfile,
} from '../utils/gmProfiles';
import { ThemeId, THEMES } from '../utils/theme';

const CUSTOM_MODEL = '__custom__';
const CUSTOM_ENDPOINT = '__custom__';

const isKnownModel = (models: ProviderModel[], model: string) => models.some(m => m.value === model);

/**
 * 模型選擇：下拉清單 ＋ 自訂型號輸入框。
 *
 * 清單依供應商切換，但永遠只是常用捷徑——各家一出新型號就得改程式重新部署，
 * 玩家只能乾等。留一個自由輸入的入口之後，任何 model id 都能直接用。
 *
 * ⚠️ 「是否處於自訂模式」**不另外存進設定**——由「目前的值不在清單上」推導。
 * 存成旗標的話它會跟著 model 一起進 localStorage，兩份資料之後必然漂移
 * （同 `Npc.affectionLabel` 與舊的雙來源身分欄位留下的教訓）。
 * 只有「剛切到自訂、還沒改字」這個瞬間需要一個純 UI 的 state 記住。
 */
const ModelPicker: React.FC<{
  label: string;
  value: string;
  models: ProviderModel[];
  fallbackModel: string;
  onChange: (model: string) => void;
  inputStyle: React.CSSProperties;
}> = ({ label, value, models, fallbackModel, onChange, inputStyle }) => {
  const [customMode, setCustomMode] = useState(() => !isKnownModel(models, value));
  const showCustom = customMode || !isKnownModel(models, value);

  return (
    <div>
      <label className="text-xs mb-1 block" style={{ color: 'var(--text-body)' }}>{label}</label>
      <select
        aria-label={label}
        value={showCustom ? CUSTOM_MODEL : value}
        onChange={e => {
          if (e.target.value === CUSTOM_MODEL) {
            // 不清空 model：帶著目前的型號進輸入框，讓玩家在既有字串上改
            // （多半是加一段 preview 後綴），比清成空白重打整串友善
            setCustomMode(true);
          } else {
            setCustomMode(false);
            onChange(e.target.value);
          }
        }}
        className="w-full border rounded-[8px] px-3 py-2 text-sm outline-none transition"
        style={inputStyle}
      >
        {models.map(m => (
          <option key={m.value} value={m.value}>{m.label}</option>
        ))}
        <option value={CUSTOM_MODEL}>自訂型號⋯</option>
      </select>

      {showCustom && (
        <>
          <input
            type="text"
            value={value}
            onChange={e => onChange(e.target.value.trim())}
            placeholder={`例如 ${fallbackModel}`}
            aria-label={`${label} 自訂型號`}
            spellCheck={false}
            autoComplete="off"
            className="w-full border rounded-[8px] px-3 py-2 text-sm outline-none transition mt-2 font-mono"
            style={inputStyle}
          />
          {/* 空字串在 callAI 會靜默退回該供應商的預設型號，
              玩家會以為自己在用某個型號、實際上跑的是另一個，所以明講 */}
          {!value && (
            <p className="text-[11px] mt-1" style={{ color: 'var(--color-amber)' }}>
              留空會退回 {fallbackModel}
            </p>
          )}
          <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
            直接送給 API 的 model id，打錯要等到送出訊息時才會報錯。
          </p>
        </>
      )}
    </div>
  );
};

/**
 * 供應商與端點選擇。
 *
 * OpenAI 相容那一類（OpenAI／OpenRouter／DeepSeek／本機模型）協定相同、只差端點，
 * 所以端點做成「常用預設 ＋ 自由輸入」，與型號同一套想法。
 *
 * ⚠️ 換供應商一律走 `switchProvider`，它會把型號與端點一起換掉。只改 provider
 * 會留下上一家的 model id，送出才會拿到一個看不懂的 400。
 */
const ProviderPicker: React.FC<{
  value: GMConfig;
  onChange: (next: Partial<GMConfig>) => void;
  onSwitchProvider: (provider: string) => void;
  inputStyle: React.CSSProperties;
}> = ({ value, onChange, onSwitchProvider, inputStyle }) => {
  const meta = providerMeta(value.provider);
  const baseUrl = value.baseUrl ?? '';
  const matchedPreset = meta.presets.find(p => normalizeBaseUrl(p.baseUrl) === normalizeBaseUrl(baseUrl));
  const [customEndpoint, setCustomEndpoint] = useState(() => !matchedPreset);
  const showCustomEndpoint = customEndpoint || !matchedPreset;

  return (
    <>
      <div>
        <label className="text-xs mb-1 block" style={{ color: 'var(--text-body)' }}>供應商</label>
        <select
          aria-label="供應商"
          value={meta.id}
          onChange={e => { setCustomEndpoint(false); onSwitchProvider(e.target.value); }}
          className="w-full border rounded-[8px] px-3 py-2 text-sm outline-none transition"
          style={inputStyle}
        >
          {PROVIDERS.map(p => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
        <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>{meta.hint}</p>
      </div>

      {meta.editableBaseUrl && (
        <div>
          <label className="text-xs mb-1 block" style={{ color: 'var(--text-body)' }}>端點</label>
          <select
            aria-label="端點"
            value={showCustomEndpoint ? CUSTOM_ENDPOINT : normalizeBaseUrl(baseUrl)}
            onChange={e => {
              if (e.target.value === CUSTOM_ENDPOINT) {
                setCustomEndpoint(true);
                return;
              }
              setCustomEndpoint(false);
              const preset = meta.presets.find(p => normalizeBaseUrl(p.baseUrl) === e.target.value);
              // 換端點＝換服務，型號多半也不同，一併帶上該服務的第一個常用型號
              onChange({ baseUrl: e.target.value, ...(preset?.models[0] ? { model: preset.models[0].value } : {}) });
            }}
            className="w-full border rounded-[8px] px-3 py-2 text-sm outline-none transition"
            style={inputStyle}
          >
            {meta.presets.map(p => (
              <option key={p.baseUrl} value={normalizeBaseUrl(p.baseUrl)}>{p.label}</option>
            ))}
            <option value={CUSTOM_ENDPOINT}>自訂端點⋯</option>
          </select>
          {showCustomEndpoint && (
            <>
              <input
                type="text"
                value={baseUrl}
                onChange={e => onChange({ baseUrl: e.target.value.trim() })}
                placeholder={meta.defaultBaseUrl}
                aria-label="自訂端點"
                spellCheck={false}
                autoComplete="off"
                className="w-full border rounded-[8px] px-3 py-2 text-sm outline-none transition mt-2 font-mono"
                style={inputStyle}
              />
              <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
                填到 <span className="font-mono">/v1</span> 為止即可，系統會自己接上路徑。
              </p>
            </>
          )}
        </div>
      )}
    </>
  );
};

/**
 * 設定檔列：套用／另存／刪除一組供應商設定。
 *
 * 玩家要在不同模型之間換來換去比文風，而 GM 設定各只存一組——換一家就得把
 * 上一家的金鑰、端點、型號整串重打。設定檔是一個「存起來的常用組合」清單。
 *
 * ⚠️ 套用是把值**複製**進草稿，不是用 id 參照那張設定檔（見 utils/gmProfiles.ts）。
 * 「目前是哪一張」也由值推導，不存旗標——套用之後手動改個型號，存旗標的話
 * 畫面會繼續顯示一個已經不成立的名字。
 */
const ProfileBar: React.FC<{
  config: GMConfig;
  profiles: GMProfile[];
  onApply: (profile: GMProfile) => void;
  onSaveAs: (label: string) => void;
  onOverwrite: (profile: GMProfile) => void;
  onDelete: (profile: GMProfile) => void;
  inputStyle: React.CSSProperties;
}> = ({ config, profiles, onApply, onSaveAs, onOverwrite, onDelete, inputStyle }) => {
  const [naming, setNaming] = useState(false);
  const [label, setLabel] = useState('');
  const current = matchProfile(config, profiles);
  const full = profiles.length >= MAX_PROFILES;

  const commit = () => {
    if (!label.trim()) return;
    onSaveAs(label);
    setLabel('');
    setNaming(false);
  };

  return (
    <div className="space-y-2">
      <label className="text-xs block" style={{ color: 'var(--text-body)' }}>設定檔</label>

      <div className="flex gap-2">
        <select
          aria-label="設定檔"
          value={current?.id ?? ''}
          onChange={e => {
            const picked = profiles.find(p => p.id === e.target.value);
            if (picked) onApply(picked);
          }}
          className="flex-1 min-w-0 border rounded-[8px] px-3 py-2 text-sm outline-none transition"
          style={inputStyle}
        >
          {/* 沒有對應的設定檔時要有一個可顯示的值，否則 select 會自己選中第一張、
              看起來像已經套用了那組設定 */}
          <option value="">{profiles.length ? '（未套用設定檔）' : '（尚無設定檔）'}</option>
          {profiles.map(p => (
            <option key={p.id} value={p.id}>{profileSummary(p)}</option>
          ))}
        </select>

        {current ? (
          <>
            <button
              onClick={() => onOverwrite(current)}
              title="以目前的設定覆寫這張設定檔"
              className="px-3 py-2 rounded-[8px] text-xs shrink-0 transition"
              style={{ background: 'var(--bg-sys-field)', color: 'var(--text-body)', border: '1px solid var(--border-default)' }}
            >更新</button>
            <button
              onClick={() => onDelete(current)}
              title="刪除這張設定檔"
              className="px-3 py-2 rounded-[8px] text-xs shrink-0 transition"
              style={{ background: 'var(--bg-sys-field)', color: 'var(--text-danger)', border: '1px solid var(--border-default)' }}
            >刪除</button>
          </>
        ) : (
          <button
            onClick={() => setNaming(v => !v)}
            disabled={full}
            title={full ? `最多 ${MAX_PROFILES} 張` : '把目前的設定存成設定檔'}
            className="px-3 py-2 rounded-[8px] text-xs shrink-0 transition"
            style={{
              background: 'var(--bg-sys-field)',
              color: full ? 'var(--text-muted)' : 'var(--text-body)',
              border: '1px solid var(--border-default)',
              cursor: full ? 'not-allowed' : 'pointer',
            }}
          >另存</button>
        )}
      </div>

      {naming && !current && (
        <div className="flex gap-2">
          <input
            type="text"
            value={label}
            autoFocus
            onChange={e => setLabel(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setNaming(false); }}
            placeholder="設定檔名稱，例如「DeepSeek 省錢」"
            aria-label="設定檔名稱"
            className="flex-1 min-w-0 border rounded-[8px] px-3 py-2 text-sm outline-none transition"
            style={inputStyle}
          />
          <button
            onClick={commit}
            className="px-3 py-2 rounded-[8px] text-xs shrink-0"
            style={{ background: 'var(--btn-primary)', color: 'var(--btn--text)' }}
          >儲存</button>
        </div>
      )}

      <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
        設定檔含 API Key，與其他設定一樣只存在本機瀏覽器，不會上傳，也不隨遊戲存檔匯出。
      </p>
    </div>
  );
};

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
  authUser?: User | null;
  onLogout?: () => void;
  onOpenSaveSlots?: () => void;
  isCloudSaving?: boolean;
  /** 目前佈景主題 */
  theme?: ThemeId;
  /** 切換佈景主題（唯一入口，見 utils/theme.ts） */
  onSetTheme?: (theme: ThemeId) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen, onClose,
  mainGMConfig, setMainGMConfig,
  subGMConfig, setSubGMConfig,
  handleExportSave, handleImportSave, handleResetGame,
  theme = 'dark', onSetTheme,
  authUser, onLogout, onOpenSaveSlots, isCloudSaving,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showMainKey, setShowMainKey] = useState(false);
  const [showSubKey, setShowSubKey] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [draftMain, setDraftMain] = useState<GMConfig>(mainGMConfig);
  const [draftSub, setDraftSub] = useState<SubGMConfig>(subGMConfig);

  // 設定檔清單是兩個 GM 共用的一份（同一批服務，主／助理都可能用到）
  const [profiles, setProfiles] = useState<GMProfile[]>(() => loadProfiles(localStorage));

  const persistProfiles = (next: GMProfile[]) => {
    if (!saveProfiles(localStorage, next)) {
      setSaveError('設定檔未能寫入，請允許瀏覽器儲存資料後重試。');
      return;
    }
    setSaveError(null);
    setProfiles(next);
  };

  const mainMeta = providerMeta(draftMain.provider);
  const subMeta = providerMeta(draftSub.provider);
  // 兩邊不同家時共用金鑰沒有意義（拿 Gemini 的 key 去打 OpenAI 只會 401），
  // callAI 那側也擋掉了，這裡把勾選框一起關起來免得玩家以為有生效
  const canShareKey = draftMain.provider === draftSub.provider;

  if (!isOpen) return null;

  const handleSave = () => {
    const now = new Date().toISOString();
    const savedMain = { ...draftMain, lastSaved: now };
    const savedSub = { ...draftSub, lastSaved: now };
    try {
      localStorage.setItem('mainGM_config', JSON.stringify(savedMain));
      localStorage.setItem('subGM_config', JSON.stringify(savedSub));
    } catch {
      setSaveError('設定未完整儲存，請允許瀏覽器儲存資料後重試。草稿仍保留在這裡。');
      return;
    }
    setSaveError(null);
    setMainGMConfig(savedMain);
    setSubGMConfig(savedSub);
    // draft 與已儲存設定同步，否則 lastSaved 的差異會讓下方一直判定為未儲存
    setDraftMain(savedMain);
    setDraftSub(savedSub);
  };

  // 草稿未按「儲存」前只存在 draftMain / draftSub，點遮罩直接關會靜默丟掉
  // 已輸入的 API Key。有未儲存變更時忽略遮罩點擊，改由 X 或儲存明確關閉。
  const hasUnsavedChanges =
    JSON.stringify(draftMain) !== JSON.stringify(mainGMConfig) ||
    JSON.stringify(draftSub) !== JSON.stringify(subGMConfig);

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
    <div className="responsive-modal-overlay fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4" onClick={() => { if (!hasUnsavedChanges) onClose(); }}>
      <div className="responsive-modal-panel backdrop-blur-xl w-full max-w-sm rounded-[8px] shadow-[var(--shadow-modal)] flex flex-col overflow-hidden border rounded-[8px] relative z-[61]" style={{ background: 'color-mix(in srgb, var(--bg-elevated) 90%, transparent)', color: 'var(--text-title)', borderColor: 'color-mix(in srgb, var(--border-default) 60%, transparent)' }} onClick={e => e.stopPropagation()}>
        {saveError && <p role="alert" className="px-4 py-3 text-sm shrink-0" style={{ color: 'var(--text-danger)' }}>{saveError}</p>}

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

          {/* ── 外觀 ──
              主題不進遊戲存檔：那是這台裝置的閱讀偏好，不是世界狀態。
              存進去的話，手機選了羊皮紙、桌機開同一個存檔也會被強制換掉。 */}
          <div className="mb-4 pb-4" style={{ borderBottom: '1px solid var(--border-default)' }}>
            <p className="text-xs mb-3 font-medium" style={{ color: 'var(--text-muted)' }}>🎨 外觀</p>
            <div className="flex gap-2">
              {THEMES.map(t => {
                const active = theme === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => onSetTheme?.(t.id)}
                    aria-pressed={active}
                    className="flex-1 text-left px-3 py-2.5 rounded-[8px] transition"
                    style={{
                      background: active ? 'var(--btn-primary)' : 'var(--bg-sys-field)',
                      color: active ? 'var(--btn--text)' : 'var(--text-body)',
                      border: `var(--border-width) solid ${active ? 'var(--border-accent)' : 'var(--border-default)'}`,
                    }}
                  >
                    <span className="block text-sm font-medium">{t.label}</span>
                    <span className="block text-xs mt-0.5 opacity-80">{t.description}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── 帳號 ── */}
          <div className="mb-4 pb-4" style={{ borderBottom: '1px solid var(--border-default)' }}>
            <p className="text-xs mb-3 font-medium" style={{ color: 'var(--text-muted)' }}>👤 帳號</p>
            {authUser ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  {authUser.user_metadata?.avatar_url ? (
                    <img
                      src={authUser.user_metadata.avatar_url}
                      alt="avatar"
                      className="w-8 h-8 rounded-full object-cover"
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  ) : (
                    <span className="text-2xl">👤</span>
                  )}
                  <div className="flex flex-col">
                    <span className="text-sm font-medium" style={{ color: 'var(--text-body)' }}>
                      {authUser.user_metadata?.full_name ?? '玩家'}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {authUser.email}
                    </span>
                  </div>
                  {isCloudSaving && (
                    <span className="ml-auto text-xs" style={{ color: 'var(--text-muted)' }}>
                      ☁️ 同步中...
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={onOpenSaveSlots}
                    className="flex-1 py-1.5 text-xs rounded-[6px] transition"
                    style={{ background: 'var(--bg-ui-card)', color: 'var(--text-body)', border: '1px solid var(--border-default)' }}
                  >
                    管理存檔槽
                  </button>
                  <button
                    onClick={onLogout}
                    className="flex-1 py-1.5 text-xs rounded-[6px] transition"
                    style={{ background: 'var(--bg-ui-card)', color: 'var(--text-muted)', border: '1px solid var(--border-default)' }}
                  >
                    登出
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>未登入</p>
            )}
          </div>

          {/* ── 主 GM ── */}
          <div className="rounded-[8px] p-4 space-y-3" style={sectionStyle}>
            <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-title)' }}>主 GM</p>

            <ProfileBar
              config={draftMain}
              profiles={profiles}
              onApply={p => setDraftMain(prev => applyProfile(prev, p))}
              onSaveAs={label => persistProfiles(upsertProfile(profiles, profileFromConfig(draftMain, label)))}
              onOverwrite={p => persistProfiles(upsertProfile(profiles, { ...profileFromConfig(draftMain, p.label), id: p.id }))}
              onDelete={p => persistProfiles(removeProfile(profiles, p.id))}
              inputStyle={inputStyle}
            />

            <ProviderPicker
              value={draftMain}
              onChange={patch => setDraftMain(p => ({ ...p, ...patch }))}
              onSwitchProvider={provider => setDraftMain(p => switchProvider(p, provider))}
              inputStyle={inputStyle}
            />

            <div>
              <label className="text-xs mb-1 block" style={{ color: 'var(--text-body)' }}>API Key</label>
              <div className="relative">
                <input
                  type={showMainKey ? 'text' : 'password'}
                  value={draftMain.apiKey}
                  onChange={e => setDraftMain(p => ({ ...p, apiKey: e.target.value }))}
                  placeholder={mainMeta.keyPlaceholder}
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

            <ModelPicker
              label="模型"
              value={draftMain.model}
              models={modelsForEndpoint(draftMain.provider, draftMain.baseUrl ?? '')}
              fallbackModel={mainMeta.defaultModel}
              onChange={model => setDraftMain(p => ({ ...p, model }))}
              inputStyle={inputStyle}
            />

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

            <ProfileBar
              config={draftSub}
              profiles={profiles}
              onApply={p => setDraftSub(prev => applyProfile(prev, p))}
              onSaveAs={label => persistProfiles(upsertProfile(profiles, profileFromConfig(draftSub, label)))}
              onOverwrite={p => persistProfiles(upsertProfile(profiles, { ...profileFromConfig(draftSub, p.label), id: p.id }))}
              onDelete={p => persistProfiles(removeProfile(profiles, p.id))}
              inputStyle={inputStyle}
            />

            <ProviderPicker
              value={draftSub}
              onChange={patch => setDraftSub(p => ({ ...p, ...patch }))}
              onSwitchProvider={provider => setDraftSub(p => switchProvider(p, provider))}
              inputStyle={inputStyle}
            />

            <label
              className="flex items-center gap-2 text-sm select-none"
              style={{ color: canShareKey ? 'var(--text-body)' : 'var(--text-muted)', cursor: canShareKey ? 'pointer' : 'not-allowed' }}
            >
              <input
                type="checkbox"
                checked={canShareKey && draftSub.useSameKey}
                disabled={!canShareKey}
                onChange={e => setDraftSub(p => ({ ...p, useSameKey: e.target.checked }))}
                style={{ accentColor: 'var(--tab-active)' }}
              />
              使用與主 GM 相同的 API Key
            </label>
            {!canShareKey && (
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                兩邊供應商不同，助理 GM 需要自己的 Key。
              </p>
            )}

            {(!draftSub.useSameKey || !canShareKey) && (
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

            <ModelPicker
              label="模型"
              value={draftSub.model}
              models={modelsForEndpoint(draftSub.provider, draftSub.baseUrl ?? '')}
              fallbackModel={subMeta.defaultModel}
              onChange={model => setDraftSub(p => ({ ...p, model }))}
              inputStyle={inputStyle}
            />

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
              <p>當前生效：{providerMeta(mainGMConfig.provider).label}／{mainGMConfig.model || '—'}</p>
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
              <a href={mainMeta.keyUrl} target="_blank" rel="noopener noreferrer" className="hover:underline" style={{ color: 'var(--color-blue)' }}>
                {new URL(mainMeta.keyUrl).hostname}
              </a>
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
