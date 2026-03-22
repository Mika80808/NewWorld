import React, { useState, useRef, useEffect } from 'react';
import { Users, BookPlus, Pin, Star, Trash2, Lock, ChevronDown, ChevronUp, Edit2, Check, X, BookOpen, Heart, AlertTriangle } from 'lucide-react';
import { Npc, NpcMemory, LorebookEntry } from '../types';

// ── 好感度顏色 ────────────────────────────────────────────────────────────────
export function affectionColor(affection: number): string {
  if (affection < 0)   return 'var(--affection-hostile)';
  if (affection < 50)  return 'var(--affection-low)';
  if (affection < 80)  return 'var(--affection-mid)';
  if (affection < 100) return 'var(--affection-high)';
  return 'var(--affection-max)';
}

const SOURCE_LABEL: Record<NpcMemory['source'], string> = {
  manual:    '手動',
  pre_merge: '想法',
  merged:    '摘要',
};

const SOURCE_STYLE: Record<NpcMemory['source'], React.CSSProperties> = {
  manual:    { color: 'var(--text-body)',   borderColor: 'var(--border-default)' },
  pre_merge: { color: 'var(--color-rose)',  borderColor: 'color-mix(in srgb, var(--color-rose) 40%, transparent)' },
  merged:    { color: 'var(--color-amber)', borderColor: 'color-mix(in srgb, var(--color-amber) 40%, transparent)' },
};

interface NpcModalProps {
  selectedNpc: Npc | null;
  lorebookEntries: LorebookEntry[];
  onClose: () => void;
  onRecordNpc: (npc: Npc) => void;
  onTogglePinNpc: (id: number) => void;
  onAddNpcMemory: (id: number, text: string, importance?: 'core' | 'normal') => void;
  onRemoveNpcMemory: (id: number, memId: string) => void;
  onUpdateNpcMemory: (id: number, memId: string, updates: Partial<NpcMemory>) => void;
  onUpdateLorebook: (id: number, updates: Partial<LorebookEntry>) => void;
  onDeleteNpc: (npcId: number, lorebookId?: number) => void;
  onClearNewMemories: (npcId: number) => void;
  onUpdateNpcName?: (npcId: number, name: string) => void;
}

export const NpcModal: React.FC<NpcModalProps> = ({
  selectedNpc,
  lorebookEntries,
  onClose,
  onRecordNpc,
  onTogglePinNpc,
  onAddNpcMemory,
  onRemoveNpcMemory,
  onUpdateNpcMemory,
  onUpdateLorebook,
  onDeleteNpc,
  onClearNewMemories,
  onUpdateNpcName,
}) => {
  const [activeTab, setActiveTab] = useState<'info' | 'memories'>('info');
  const [showArchived, setShowArchived] = useState(false);
  const [editingMemId, setEditingMemId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editFields, setEditFields] = useState<Partial<LorebookEntry>>({});
  const [editName, setEditName] = useState('');
  const newMemRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // 切換 NPC 時重置編輯狀態；若為新建角色則自動進入編輯模式
  useEffect(() => {
    setMenuOpen(false);
    setShowDeleteConfirm(false);
    setActiveTab('info');
    if (selectedNpc?.name === '新角色' && !selectedNpc.job && !selectedNpc.appearance) {
      setIsEditing(true);
      setEditName('新角色');
      setEditFields({ gender: '', race: '', age: '', job: '', appearance: '', personality: '', backstory: '', other: '' });
    } else {
      setIsEditing(false);
      setEditFields({});
    }
  }, [selectedNpc?.id]);

  // 讀 isNew 記憶後自動清除標記
  useEffect(() => {
    if (selectedNpc && activeTab === 'memories') {
      const hasNew = selectedNpc.memories?.some(m => m.isNew && !m.isMerged);
      if (hasNew) onClearNewMemories(selectedNpc.id);
    }
  }, [selectedNpc?.id, activeTab]);

  // 點外部關閉三點選單
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (!selectedNpc) return null;

  const lore = lorebookEntries.find(e => e.category === 'NPC' && e.title === selectedNpc.name);
  const displayGender      = lore?.gender      ?? selectedNpc.gender      ?? '';
  const displayRace        = lore?.race        ?? lore?.other             ?? selectedNpc.race ?? selectedNpc.other ?? '';
  const displayAge         = lore?.age         ?? selectedNpc.age         ?? '';
  const displayJob         = lore?.job         ?? selectedNpc.job         ?? '';
  const displayAppearance  = lore?.appearance  ?? selectedNpc.appearance  ?? '';
  const displayPersonality = lore?.personality ?? selectedNpc.personality ?? '';
  const displayBackstory   = lore?.backstory   ?? selectedNpc.backstory   ?? '';
  const displayOther       = lore?.race ? (lore?.other ?? '') : '';

  const memoryUnlocked    = selectedNpc.affection >= 60;
  const backstoryUnlocked = selectedNpc.affection >= 20;

  const activeMemories   = (selectedNpc.memories || []).filter(m => !m.isMerged);
  const archivedMemories = (selectedNpc.memories || []).filter(m => m.isMerged);
  const hasNewMemory     = activeMemories.some(m => m.isNew);

  // thoughts: 顯示前 5 條
  const visibleThoughts = (selectedNpc.thoughts || []).slice(0, 5);

  // ── 三點選單：開啟編輯 ──────────────────────────────────────────────────────
  const handleOpenEdit = () => {
    setEditName(selectedNpc.name);
    setEditFields({
      gender:      displayGender,
      race:        displayRace,
      age:         displayAge,
      job:         displayJob,
      appearance:  displayAppearance,
      personality: displayPersonality,
      backstory:   displayBackstory,
      other:       displayOther,
    });
    setIsEditing(true);
    setMenuOpen(false);
    setActiveTab('info');
  };

  const handleSaveEdit = () => {
    const trimmedName = editName.trim() || selectedNpc.name;
    if (lore) {
      onUpdateLorebook(lore.id, { ...editFields, title: trimmedName });
    }
    if (trimmedName !== selectedNpc.name) {
      onUpdateNpcName?.(selectedNpc.id, trimmedName);
    }
    setIsEditing(false);
  };

  // ── 記憶操作 ────────────────────────────────────────────────────────────────
  const handleAddMemory = (importance: 'core' | 'normal' = 'normal') => {
    const val = newMemRef.current?.value?.trim();
    if (!val) return;
    onAddNpcMemory(selectedNpc.id, val, importance);
    if (newMemRef.current) newMemRef.current.value = '';
  };

  const handleStartEdit = (mem: NpcMemory) => { setEditingMemId(mem.id); setEditingText(mem.text); };
  const handleConfirmEdit = (memId: string) => {
    if (editingText.trim()) onUpdateNpcMemory(selectedNpc.id, memId, { text: editingText.trim() });
    setEditingMemId(null);
  };
  const handleCancelEdit = () => setEditingMemId(null);
  const handleToggleImportance = (mem: NpcMemory) => {
    onUpdateNpcMemory(selectedNpc.id, mem.id, { importance: mem.importance === 'core' ? 'normal' : 'core' });
  };

  const inputStyle: React.CSSProperties = {
    background: 'color-mix(in srgb, var(--tab-inactive) 60%, transparent)',
    borderColor: 'rgba(255,255,255,0.1)',
    color: 'var(--text-body)',
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="backdrop-blur-xl w-full max-w-md rounded-[8px] shadow-[0_0_40px_rgba(0,0,0,0.6)] flex flex-col overflow-hidden border border-white/10 relative"
        style={{ maxHeight: '90vh', background: 'color-mix(in srgb, var(--bg-elevated) 90%, transparent)', color: 'var(--text-title)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ────────────────────────────────────────────────────────── */}
        <div
          className="p-4 border-b border-white/5 shrink-0 space-y-2"
          style={{ background: 'color-mix(in srgb, var(--bg-elevated) 60%, transparent)' }}
        >
          {/* Row 1: checkbox + 名字 + 種族性別 + 好感度 + 編輯 + 關閉 */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {/* isActive 勾選 */}
              {lore && (
                <button
                  onClick={() => onUpdateLorebook(lore.id, { isActive: !lore.isActive })}
                  className="shrink-0 transition"
                  style={{ color: lore.isActive ? 'var(--text-primary)' : 'var(--text-muted)' }}
                  title={lore.isActive ? 'AI 已讀取此角色' : 'AI 不讀取此角色'}
                >
                  {lore.isActive
                    ? <svg className="w-4 h-4 fill-current" viewBox="0 0 16 16"><rect x="1" y="1" width="14" height="14" rx="2" /><path d="M4.5 8l2.5 2.5L11 5.5" stroke="var(--bg-elevated)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>
                    : <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none"><rect x="1" y="1" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.5"/></svg>
                  }
                </button>
              )}
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-bold flex items-center gap-1.5 flex-wrap leading-tight" style={{ color: 'var(--text-primary)' }}>
                  <Users className="w-4 h-4 shrink-0" />
                  <span style={{ fontFamily: 'Georgia, serif' }}>{selectedNpc.name}</span>
                  {displayGender && <span className="text-sm font-normal" style={{ color: 'var(--text-muted)' }}>{displayGender}</span>}
                  {displayRace   && <span className="text-sm font-normal" style={{ color: 'var(--text-muted)' }}>{displayRace}</span>}
                  {displayAge    && <span className="text-sm font-normal" style={{ color: 'var(--text-muted)' }}>{displayAge}</span>}
                </h2>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {/* 好感度 */}
              <span className="flex items-center gap-0.5 text-sm font-semibold  " style={{ color: affectionColor(selectedNpc.affection) }}>
                <Heart className="w-3.5 h-3.5 fill-current" />
                {selectedNpc.affection}
              </span>
              {/* 釘選 */}
              <button
                className="transition p-0.5 rounded mr-5 "
                style={{ color: selectedNpc.isPinned ? 'var(--text-primary)' : 'var(--color-emerald)' }}
                onClick={() => onTogglePinNpc(selectedNpc.id)}
                title={selectedNpc.isPinned ? '取消釘選' : '釘選至個人資訊'}
                onMouseEnter={e => { if (!selectedNpc.isPinned) e.currentTarget.style.color = 'var(--text-body)'; }}
                onMouseLeave={e => { if (!selectedNpc.isPinned) e.currentTarget.style.color = 'var(--color-emerald)'; }}
              >
                <Pin className={`w-3.5 h-3.5 ${selectedNpc.isPinned ? 'fill-current' : ''}`} />
              </button>
              {/* 記入設定集（只在未建 lore 且未編輯時顯示） */}
              {!lore && !isEditing && (
                <button
                  onClick={() => onRecordNpc(selectedNpc)}
                  className="p-0.5 transition rounded"
                  style={{ color: 'var(--text-muted)' }}
                  title="記入設定集"
                  onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-title)'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; }}
                >
                  <BookPlus className="w-4 h-4" />
                </button>
              )}
              {/* 編輯鈕（未在編輯模式時顯示） */}
              {!isEditing && (
                <button
                  onClick={handleOpenEdit}
                  className="p-0.5 transition rounded"
                  style={{ color: 'var(--text-muted)' }}
                  title="編輯角色"
                  onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-title)'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; }}
                >
                  <Edit2 className="w-4 h-4" />
                </button>
              )}
              {/* 關閉 */}
              <button
                className="p-0.5 transition rounded"
                style={{ color: 'var(--text-muted)' }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-title)'; }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; }}
                onClick={onClose}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Row 2: 職業（左）＋ 關係（右） */}
          <div className="flex justify-between items-center text-sm">
            <span style={{ color: 'var(--text-body)' }}>{displayJob || '職業未知'}</span>
            <span className="mr-19" style={{ color: 'var(--color-emerald)' }}>{selectedNpc.relationship || '關係未知'}</span>
          </div>

          {/* Row 3: 上次見面 */}
          {(selectedNpc.lastSeenLocation || selectedNpc.lastSeenDate) && (
            <div className="text-sm flex items-center gap-1" style={{ color: 'var(--text-body)' }}>
              <span>上次見面：</span>
              {selectedNpc.lastSeenLocation && <span style={{ color: 'var(--text-body)' }}>{selectedNpc.lastSeenLocation}</span>}
              {selectedNpc.lastSeenDate && <span className="ml-1">{selectedNpc.lastSeenDate}</span>}
            </div>
          )}
        </div>

        {/* ── Tabs ──────────────────────────────────────────────────────────── */}
        <div className="flex border-b border-white/5 shrink-0">
          {(['info', 'memories'] as const).map(tab => {
            const isActive = activeTab === tab;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className="flex-1 py-2 text-base font-semibold tracking-wide transition relative"
                style={{
                  color: isActive ? 'var(--text-tab)' : 'var(--text-muted)',
                  background: isActive ? 'color-mix(in srgb, var(--tab-active) 40%, transparent)' : 'transparent',
                  borderBottom: isActive ? '2px solid var(--text-primary)' : '2px solid transparent',
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.color = 'var(--text-tab)'; }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.color = 'var(--text-muted)'; }}
              >
                {tab === 'info' ? '資料' : (
                  <span className="flex items-center justify-center gap-1">
                    記憶
                    {hasNewMemory && (
                      <span className="inline-block w-2 h-2 rounded-full" style={{ background: 'var(--bg-mark)' }} title="有新記憶" />
                    )}
                    {activeMemories.length > 0 && <span className="text-[10px] opacity-70">({activeMemories.length})</span>}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* ── Body ──────────────────────────────────────────────────────────── */}
        <div className="overflow-y-auto flex-1">

          {/* ====== 資料 Tab ====== */}
          {activeTab === 'info' && (
            <div className="p-4 space-y-3">
              {isEditing ? (
                /* ── 編輯模式 ── */
                <div className="space-y-2">
                  {/* Row 1: 姓名(50%) + 性別 + 好感度(locked) */}
                  <div className="flex gap-2 items-end">
                    <div style={{ width: '50%' }}>
                      <p className="text-sm ml-3 uppercase tracking-wider mb-0.5" style={{ color: 'var(--text-body)' }}>姓名</p>
                      <input
                        type="text"
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        placeholder="角色姓名⋯"
                        className="w-full border border-white/10 rounded-[8px] px-3 py-2 text-sm outline-none transition"
                        style={inputStyle}
                      />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm ml-3 uppercase tracking-wider mb-0.5" style={{ color: 'var(--text-body)' }}>性別</p>
                      <input
                        type="text"
                        value={(editFields.gender as string) ?? ''}
                        onChange={e => setEditFields(prev => ({ ...prev, gender: e.target.value }))}
                        placeholder="男、女⋯"
                        className="w-full border border-white/10 rounded-[8px] px-3 py-2 text-sm outline-none transition"
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <p className="text-sm ml-3 uppercase tracking-wider mb-0.5" style={{ color: 'var(--text-body)' }}>好感度</p>
                      <div
                        className="flex items-center gap-1 border border-white/10 rounded-[8px] px-3 py-2 text-sm"
                        style={{ ...inputStyle, color: affectionColor(selectedNpc.affection), cursor: 'default', opacity: 0.7 }}
                      >
                        <Heart className="w-3.5 h-3.5 fill-current" />
                        {selectedNpc.affection}
                      </div>
                    </div>
                  </div>

                  {/* Row 2: 年齡 + 種族 + 職業 */}
                  <div className="flex gap-2">
                    {([
                      { key: 'age',  label: '年齡', placeholder: '約30歲⋯' },
                      { key: 'race', label: '種族', placeholder: '人類、精靈⋯' },
                      { key: 'job',  label: '職業', placeholder: '職業⋯' },
                    ] as { key: keyof LorebookEntry; label: string; placeholder: string }[]).map(({ key, label, placeholder }) => (
                      <div key={key} className="flex-1">
                        <p className="text-sm ml-3 uppercase tracking-wider mb-0.5" style={{ color: 'var(--text-body)' }}>{label}</p>
                        <input
                          type="text"
                          value={(editFields[key] as string) ?? ''}
                          onChange={e => setEditFields(prev => ({ ...prev, [key]: e.target.value }))}
                          placeholder={placeholder}
                          className="w-full border border-white/10 rounded-[8px] px-3 py-2 text-sm outline-none transition"
                          style={inputStyle}
                        />
                      </div>
                    ))}
                  </div>

                  {/* 外貌、個性、背景故事、其他 */}
                  {([
                    { key: 'appearance',  label: '外貌',    placeholder: '外貌描述⋯' },
                    { key: 'personality', label: '個性',    placeholder: '個性描述⋯' },
                    { key: 'backstory',   label: '背景故事', placeholder: '背景故事⋯' },
                    { key: 'other',       label: '其他',    placeholder: '其他⋯' },
                  ] as { key: keyof LorebookEntry; label: string; placeholder: string }[]).map(({ key, label, placeholder }) => (
                    <div key={key}>
                      <p className="text-sm ml-3 uppercase tracking-wider mb-0.5" style={{ color: 'var(--text-body)' }}>{label}</p>
                      <textarea
                        value={(editFields[key] as string) ?? ''}
                        onChange={e => setEditFields(prev => ({ ...prev, [key]: e.target.value }))}
                        placeholder={placeholder}
                        className="w-full border border-white/10 rounded-[8px] px-3 py-2 text-sm outline-none transition resize-y min-h-[60px]"
                        style={inputStyle}
                      />
                    </div>
                  ))}
                  <div className="flex items-center pt-1">
                    {/* 左：刪除（與 LorebookModal 樣式一致） */}
                    <button
                      onClick={() => setShowDeleteConfirm(true)}
                      className="text-sm flex items-center px-2 py-1.5 rounded-[8px] gap-1 transition border"
                      style={{ color: 'var(--text-muted)', borderColor: 'var(--border-default)' }}
                      onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-danger)'; e.currentTarget.style.borderColor = 'var(--text-danger)'; }}
                      onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border-default)'; }}
                    >
                      <Trash2 className="w-3.5 h-3.5" /> 刪除
                    </button>
                    {/* 右：取消 + 儲存 */}
                    <div className="flex gap-2 ml-auto">
                      <button
                        onClick={() => setIsEditing(false)}
                        className="px-4 py-1.5 text-sm rounded-[8px] transition border"
                        style={{ background: 'var(--bg-elevated)', color: 'var(--text-body)', borderColor: 'var(--border-default)' }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-elevated)'; }}
                      >
                        取消
                      </button>
                      <button
                        onClick={handleSaveEdit}
                        className="px-4 py-1.5 text-sm rounded-[8px] transition"
                        style={{ background: 'var(--btn-primary)', color: 'var(--text-tab)' }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'var(--btn-primary-hover)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'var(--btn-primary)'; }}
                      >
                        儲存
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                /* ── 顯示模式 ── */
                <>
                  {/* 基本資料卡片 */}
                  {[
                    { label: '種族', value: displayRace },
                    { label: '外貌', value: displayAppearance },
                    { label: '個性', value: displayPersonality },
                    { label: '其他', value: displayOther },
                  ].map(({ label, value }) =>
                    value ? (
                      <div
                        key={label}
                        className="border border-white/5 rounded-[8px] px-3 py-2"
                        style={{ background: 'color-mix(in srgb, var(--bg-ui-card) 50%, transparent)' }}
                      >
                        <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>{label}</p>
                        <p className="text-sm leading-relaxed" style={{ color: 'var(--text-body)' }}>{value}</p>
                      </div>
                    ) : null
                  )}

                  {/* 背景故事 */}
                  <div
                    className="border border-white/5 rounded-[8px] px-3 py-2"
                    style={{ background: 'color-mix(in srgb, var(--bg-ui-card) 50%, transparent)' }}
                  >
                    <p className="text-[10px] uppercase tracking-wider mb-1 flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                      <BookOpen className="w-3 h-3" /> 背景故事
                      {!backstoryUnlocked && <Lock className="w-3 h-3 ml-0.5" />}
                    </p>
                    {backstoryUnlocked ? (
                      displayBackstory
                        ? <p className="text-sm leading-relaxed" style={{ color: 'var(--text-body)' }}>{displayBackstory}</p>
                        : <p className="text-sm italic" style={{ color: 'var(--text-muted)' }}>（暫無）</p>
                    ) : (
                      <p className="text-sm italic" style={{ color: 'var(--text-muted)' }}>
                        ？？？
                        <span className="text-sm ml-2">（好感度 ≥ 20 解鎖，目前：{selectedNpc.affection}）</span>
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ====== 記憶 Tab ====== */}
          {activeTab === 'memories' && (
            <div className="p-4 space-y-5">

              {/* ── 內心想法 ── */}
              {visibleThoughts.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>💭 內心想法</p>
                  <div className="space-y-1.5">
                    {visibleThoughts.map((thought, idx) => {
                      const opacity = [1, 0.92, 0.82, 0.72, 0.62][Math.min(idx, 4)];
                      return (
                        <div
                          key={idx}
                          className="border-l-2 px-3 py-2 rounded-r-[8px] relative"
                          style={{
                            opacity,
                            background: 'color-mix(in srgb, var(--bg-elevated) 80%, transparent)',
                            borderLeftColor: 'color-mix(in srgb, var(--color-rose) 60%, transparent)',
                          }}
                        >
                          <p className="text-sm italic" style={{ color: 'var(--text-body)' }}>「{thought.text}」</p>
                          <span className="absolute bottom-1 right-2 text-[10px]" style={{ color: 'var(--text-muted)' }}>{thought.createdAt}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── 角色記憶 ── */}
              <div>
                <p className="text-[10px] uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                  角色記憶
                  {hasNewMemory && <span className="inline-block w-2 h-2 rounded-full" style={{ background: 'var(--bg-mark)' }} title="有新融合記憶" />}
                </p>

                {memoryUnlocked ? (
                  <>
                    {activeMemories.length > 0 ? (
                      <div className="space-y-2">
                        {activeMemories.map(mem => (
                          <MemoryCard
                            key={mem.id}
                            mem={mem}
                            isEditing={editingMemId === mem.id}
                            editingText={editingText}
                            onEditTextChange={setEditingText}
                            onStartEdit={handleStartEdit}
                            onConfirmEdit={handleConfirmEdit}
                            onCancelEdit={handleCancelEdit}
                            onToggleImportance={handleToggleImportance}
                            onRemove={(memId) => onRemoveNpcMemory(selectedNpc.id, memId)}
                          />
                        ))}
                      </div>
                    ) : (
                      <div
                        className="text-sm italic text-center py-6 border border-dashed rounded-[8px]"
                        style={{ color: 'var(--text-muted)', borderColor: 'color-mix(in srgb, var(--border-default) 40%, transparent)' }}
                      >
                        目前還沒有特別的回憶...
                      </div>
                    )}

                    {/* 封存記錄 */}
                    {archivedMemories.length > 0 && (
                      <div className="mt-3">
                        <button
                          className="flex items-center gap-1.5 text-[10px] transition"
                          style={{ color: 'var(--text-muted)' }}
                          onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-body)'; }}
                          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; }}
                          onClick={() => setShowArchived(v => !v)}
                        >
                          {showArchived ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          查看已封存的原始記錄 ({archivedMemories.length})
                        </button>
                        {showArchived && (
                          <div className="mt-2 space-y-1.5 opacity-60">
                            {archivedMemories.map(mem => (
                              <div
                                key={mem.id}
                                className="border border-white/5 rounded-[8px] px-3 py-2 text-sm line-through"
                                style={{ background: 'color-mix(in srgb, var(--bg-elevated) 60%, transparent)', color: 'var(--text-muted)' }}
                              >
                                <div className="flex justify-between items-start gap-2" style={{ textDecoration: 'none' }}>
                                  <span className="flex-1 break-words" style={{ textDecorationLine: 'none' }}>{mem.text}</span>
                                  <span className="shrink-0 text-[10px]" style={{ color: 'var(--border-default)' }}>{mem.createdAt}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* 新增記憶 */}
                    <div className="pt-2 border-t border-white/5 space-y-2 mt-3">
                      <textarea
                        ref={newMemRef}
                        placeholder="新增與他的回憶... (Enter 送出 / Shift+Enter 換行)"
                        className="w-full border border-white/10 rounded-[8px] px-3 py-2 text-sm outline-none transition resize-none"
                        style={{
                          background: 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)',
                          color: 'var(--text-title)',
                        }}
                        rows={2}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddMemory('normal'); }
                        }}
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleAddMemory('normal')}
                          className="flex-1 border border-white/10 rounded-[8px] py-1.5 text-sm transition"
                          style={{ background: 'color-mix(in srgb, var(--bg-elevated) 60%, transparent)', color: 'var(--text-title)' }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-elevated)'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'color-mix(in srgb, var(--bg-elevated) 60%, transparent)'; }}
                        >
                          新增（一般）
                        </button>
                        <button
                          onClick={() => handleAddMemory('core')}
                          className="flex-1 rounded-[8px] py-1.5 text-sm transition border"
                          style={{
                            background: 'color-mix(in srgb, var(--bg-elevated) 60%, transparent)',
                            borderColor: 'color-mix(in srgb, var(--color-amber) 30%, transparent)',
                            color: 'var(--color-amber)',
                          }}
                          title="Core 記憶永遠注入，不受截斷規則影響"
                          onMouseEnter={e => { e.currentTarget.style.background = 'color-mix(in srgb, var(--bg-elevated) 80%, transparent)'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'color-mix(in srgb, var(--bg-elevated) 60%, transparent)'; }}
                        >
                          ★ 核心記憶
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
                    <Lock className="w-6 h-6" style={{ color: 'var(--color-emerald)' }} />
                    <p className="text-sm" style={{ color: 'var(--text-body)' }}>好感度不足，無法開啟專屬記憶庫</p>
                    <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>需要好感度 ≥ 60（目前：{selectedNpc.affection}）</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── 刪除確認對話框 ── */}
        {showDeleteConfirm && (
          <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-10 rounded-[8px]">
            <div
              className="rounded-[8px] p-5 m-4 text-center space-y-3 shadow-xl border"
              style={{
                background: 'var(--bg-elevated)',
                borderColor: 'color-mix(in srgb, var(--color-rose) 30%, transparent)',
              }}
            >
              <AlertTriangle className="w-8 h-8 mx-auto" style={{ color: 'var(--color-rose)' }} />
              <p className="text-sm font-semibold" style={{ color: 'var(--text-title)' }}>確定刪除「{selectedNpc.name}」？</p>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>此操作將同時移除設定集資料，無法復原。</p>
              <div className="flex gap-2">
                <button
                  onClick={() => { onDeleteNpc(selectedNpc.id, lore?.id); setShowDeleteConfirm(false); }}
                  className="flex-1 py-2 text-sm rounded-[8px] transition"
                  style={{ background: 'color-mix(in srgb, var(--color-rose) 60%, transparent)', color: 'var(--text-title)', border: '1px solid color-mix(in srgb, var(--color-rose) 40%, transparent)' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'color-mix(in srgb, var(--color-rose) 75%, transparent)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'color-mix(in srgb, var(--color-rose) 60%, transparent)'; }}
                >
                  確認刪除
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 border border-white/10 py-2 text-sm rounded-[8px] transition"
                  style={{ background: 'var(--bg-elevated)', color: 'var(--text-body)' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-elevated)'; }}
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ── 記憶卡片子組件 ─────────────────────────────────────────────────────────────
interface MemoryCardProps {
  mem: NpcMemory;
  isEditing: boolean;
  editingText: string;
  onEditTextChange: (v: string) => void;
  onStartEdit: (mem: NpcMemory) => void;
  onConfirmEdit: (memId: string) => void;
  onCancelEdit: () => void;
  onToggleImportance: (mem: NpcMemory) => void;
  onRemove: (memId: string) => void;
}

const MemoryCard: React.FC<MemoryCardProps> = ({
  mem, isEditing, editingText, onEditTextChange,
  onStartEdit, onConfirmEdit, onCancelEdit, onToggleImportance, onRemove,
}) => {
  const isCore = mem.importance === 'core';

  return (
    <div
      className="group rounded-[8px] px-3 py-2.5 transition border"
      style={{
        background: isCore
          ? 'color-mix(in srgb, var(--color-amber) 8%, transparent)'
          : 'color-mix(in srgb, var(--bg-elevated) 60%, transparent)',
        borderColor: isCore
          ? 'color-mix(in srgb, var(--color-amber) 30%, transparent)'
          : 'rgba(255,255,255,0.05)',
      }}
      onMouseEnter={e => { if (!isCore) e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
      onMouseLeave={e => { if (!isCore) e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)'; }}
    >
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <span
            className="text-[10px] border rounded-[8px] px-1.5 py-0.5"
            style={SOURCE_STYLE[mem.source]}
          >
            {SOURCE_LABEL[mem.source]}
          </span>
          {isCore && (
            <span
              className="text-[10px] border rounded-[8px] px-1.5 py-0.5"
              style={{ color: 'var(--color-amber)', borderColor: 'color-mix(in srgb, var(--color-amber) 30%, transparent)' }}
            >
              ★ core
            </span>
          )}
          {mem.isNew && (
            <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: 'var(--bg-mark)' }} title="新記憶" />
          )}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px] mr-1" style={{ color: 'var(--text-muted)' }}>{mem.createdAt}</span>
          {!isEditing && (
            <>
              <button
                onClick={() => onToggleImportance(mem)}
                className="opacity-0 group-hover:opacity-100 transition p-0.5 rounded-[8px]"
                style={{ color: isCore ? 'var(--color-amber)' : 'var(--text-muted)' }}
                title={isCore ? '降為一般記憶' : '設為核心記憶（永遠注入）'}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-amber)'; }}
                onMouseLeave={e => { e.currentTarget.style.color = isCore ? 'var(--color-amber)' : 'var(--text-muted)'; }}
              >
                <Star className={`w-3 h-3 ${isCore ? 'fill-current' : ''}`} />
              </button>
              <button
                onClick={() => onStartEdit(mem)}
                className="opacity-0 group-hover:opacity-100 transition p-0.5 rounded-[8px]"
                style={{ color: 'var(--text-muted)' }}
                title="編輯記憶"
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-body)'; }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; }}
              >
                <Edit2 className="w-3 h-3" />
              </button>
              <button
                onClick={() => onRemove(mem.id)}
                className="opacity-0 group-hover:opacity-100 transition p-0.5 rounded-[8px]"
                style={{ color: 'var(--text-muted)' }}
                title="刪除記憶"
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-rose)'; }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; }}
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </>
          )}
          {isEditing && (
            <>
              <button
                onClick={() => onConfirmEdit(mem.id)}
                className="p-0.5 rounded-[8px] transition"
                style={{ color: 'var(--color-success)' }}
                title="確認"
                onMouseEnter={e => { e.currentTarget.style.opacity = '0.8'; }}
                onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
              >
                <Check className="w-3 h-3" />
              </button>
              <button
                onClick={onCancelEdit}
                className="p-0.5 rounded-[8px] transition"
                style={{ color: 'var(--text-muted)' }}
                title="取消"
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-rose)'; }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; }}
              >
                <X className="w-3 h-3" />
              </button>
            </>
          )}
        </div>
      </div>

      {isEditing ? (
        <textarea
          value={editingText}
          onChange={e => onEditTextChange(e.target.value)}
          className="w-full border rounded-[8px] px-2 py-1 text-sm outline-none resize-none"
          style={{
            background: 'color-mix(in srgb, var(--bg-elevated) 60%, transparent)',
            borderColor: 'color-mix(in srgb, var(--color-amber) 30%, transparent)',
            color: 'var(--text-title)',
          }}
          rows={3} autoFocus
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onConfirmEdit(mem.id); }
            if (e.key === 'Escape') onCancelEdit();
          }}
        />
      ) : (
        <p className="text-sm leading-relaxed whitespace-pre-wrap break-words" style={{ color: 'var(--text-body)' }}>{mem.text}</p>
      )}
    </div>
  );
};
