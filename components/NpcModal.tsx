import React, { useState, useRef, useEffect } from 'react';
import { Users, BookPlus, Pin, Star, Trash2, Lock, ChevronDown, ChevronUp, Edit2, Check, X, MoreVertical, BookOpen, Heart, AlertTriangle } from 'lucide-react';
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

const SOURCE_COLOR: Record<NpcMemory['source'], string> = {
  manual:    'text-[#e8e8e9] border-[#283b57]',
  pre_merge: 'text-rose-300 border-rose-400/40',
  merged:    'text-amber-300 border-amber-400/40',
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
}) => {
  const [activeTab, setActiveTab] = useState<'info' | 'memories'>('info');
  const [showArchived, setShowArchived] = useState(false);
  const [editingMemId, setEditingMemId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editFields, setEditFields] = useState<Partial<LorebookEntry>>({});
  const newMemRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

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
    setEditFields({
      gender:      displayGender,
      race:        displayRace,
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
    if (lore) {
      onUpdateLorebook(lore.id, editFields);
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

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-[#24282d]/90 backdrop-blur-xl w-full max-w-md rounded-[8px] shadow-[0_0_40px_rgba(0,0,0,0.6)] flex flex-col overflow-hidden text-[#fbf5e4] border border-white/10 relative"
        style={{ maxHeight: '90vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ────────────────────────────────────────────────────────── */}
        <div className="p-4 border-b border-white/5 bg-[#24282d]/60 shrink-0 space-y-2">
          {/* Row 1: checkbox + 名字 + 種族性別 + 好感度 + 三點選單 + 關閉 */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {/* isActive 勾選 */}
              {lore && (
                <button
                  onClick={() => onUpdateLorebook(lore.id, { isActive: !lore.isActive })}
                  className={`shrink-0 transition ${lore.isActive ? 'text-[#fde68a]' : 'text-[var(--text3)]'}`}
                  title={lore.isActive ? 'AI 已讀取此角色' : 'AI 不讀取此角色'}
                >
                  {lore.isActive
                    ? <svg className="w-4 h-4 fill-current" viewBox="0 0 16 16"><rect x="1" y="1" width="14" height="14" rx="2" /><path d="M4.5 8l2.5 2.5L11 5.5" stroke="#24282d" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>
                    : <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none"><rect x="1" y="1" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.5"/></svg>
                  }
                </button>
              )}
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-bold text-[#fde68a] flex items-center gap-1.5 flex-wrap leading-tight">
                  <Users className="w-4 h-4 shrink-0" />
                  <span style={{ fontFamily: 'Georgia, serif' }}>{selectedNpc.name}</span>
                  {displayGender && <span className="text-[var(--text3)] text-xs font-normal">{displayGender}</span>}
                  {displayRace && <span className="text-[var(--text3)] text-xs font-normal">{displayRace}</span>}
                </h2>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {/* 好感度 */}
              <span className="flex items-center gap-0.5 text-sm font-semibold" style={{ color: affectionColor(selectedNpc.affection) }}>
                <Heart className="w-3.5 h-3.5 fill-current" />
                {selectedNpc.affection}
              </span>
              {/* 釘選 */}
              <button
                className={`transition p-0.5 rounded ${selectedNpc.isPinned ? 'text-[#fde68a]' : 'text-[var(--text3)] hover:text-[#e8e8e9]'}`}
                onClick={() => onTogglePinNpc(selectedNpc.id)}
                title={selectedNpc.isPinned ? '取消釘選' : '釘選至個人資訊'}
              >
                <Pin className={`w-3.5 h-3.5 ${selectedNpc.isPinned ? 'fill-current' : ''}`} />
              </button>
              {/* 三點選單 */}
              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setMenuOpen(v => !v)}
                  className="p-0.5 text-[var(--text3)] hover:text-[#fbf5e4] transition rounded"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>
                {menuOpen && (
                  <div className="absolute right-0 top-6 z-10 bg-[#1e2228] border border-white/10 rounded-[8px] shadow-xl py-1 w-32 text-sm">
                    <button
                      onClick={handleOpenEdit}
                      className="w-full text-left px-3 py-2 hover:bg-white/5 transition flex items-center gap-2"
                    >
                      <Edit2 className="w-3.5 h-3.5" /> 編輯角色
                    </button>
                    {!lore && (
                      <button
                        onClick={() => { onRecordNpc(selectedNpc); setMenuOpen(false); }}
                        className="w-full text-left px-3 py-2 hover:bg-white/5 transition flex items-center gap-2"
                      >
                        <BookPlus className="w-3.5 h-3.5" /> 記入設定集
                      </button>
                    )}
                    <button
                      onClick={() => { setShowDeleteConfirm(true); setMenuOpen(false); }}
                      className="w-full text-left px-3 py-2 hover:bg-white/5 text-rose-400 transition flex items-center gap-2"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> 刪除角色
                    </button>
                  </div>
                )}
              </div>
              {/* 關閉 */}
              <button className="p-0.5 text-[var(--text3)] hover:text-[#fbf5e4] transition rounded" onClick={onClose}>
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Row 2: 職業（左）＋ 關係（右） */}
          <div className="flex justify-between items-center text-xs">
            <span className="text-[#e8e8e9]">{displayJob || '職業未知'}</span>
            <span className="text-[var(--text3)]">{selectedNpc.relationship || '關係未知'}</span>
          </div>

          {/* Row 3: 上次見面 */}
          {(selectedNpc.lastSeenLocation || selectedNpc.lastSeenDate) && (
            <div className="text-[11px] text-[var(--text3)] flex items-center gap-1">
              <span>上次見面：</span>
              {selectedNpc.lastSeenLocation && <span className="text-[#e8e8e9]">{selectedNpc.lastSeenLocation}</span>}
              {selectedNpc.lastSeenDate && <span className="ml-1">{selectedNpc.lastSeenDate}</span>}
            </div>
          )}
        </div>

        {/* ── Tabs ──────────────────────────────────────────────────────────── */}
        <div className="flex border-b border-white/5 shrink-0">
          {(['info', 'memories'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2 text-xs font-semibold tracking-wide transition relative ${
                activeTab === tab
                  ? 'text-[#fde68a] border-b-2 border-[#fde68a] bg-[#132540]/40'
                  : 'text-[var(--text3)] hover:text-[#e8e8e9]'
              }`}
            >
              {tab === 'info' ? '📋 資料' : (
                <span className="flex items-center justify-center gap-1">
                  📖 記憶
                  {hasNewMemory && (
                    <span className="inline-block w-2 h-2 rounded-full bg-[#FF6B8A]" title="有新記憶" />
                  )}
                  {activeMemories.length > 0 && <span className="text-[10px] opacity-70">({activeMemories.length})</span>}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Body ──────────────────────────────────────────────────────────── */}
        <div className="overflow-y-auto flex-1">

          {/* ====== 資料 Tab ====== */}
          {activeTab === 'info' && (
            <div className="p-4 space-y-3">
              {isEditing ? (
                /* ── 編輯模式 ── */
                <div className="space-y-2">
                  {(
                    [
                      { key: 'gender',      label: '性別',    placeholder: '男、女、無性別⋯',  multiline: false },
                      { key: 'race',        label: '種族',    placeholder: '人類、精靈⋯',       multiline: false },
                      { key: 'job',         label: '職業',    placeholder: '職業⋯',             multiline: false },
                      { key: 'appearance',  label: '外貌',    placeholder: '外貌描述⋯',         multiline: true  },
                      { key: 'personality', label: '個性',    placeholder: '個性描述⋯',         multiline: true  },
                      { key: 'backstory',   label: '背景故事', placeholder: '背景故事（50字以內）', multiline: true },
                      { key: 'other',       label: '其他備註', placeholder: '其他⋯',            multiline: true  },
                    ] as { key: keyof LorebookEntry; label: string; placeholder: string; multiline: boolean }[]
                  ).map(({ key, label, placeholder, multiline }) => (
                    <div key={key}>
                      <p className="text-[10px] text-[var(--text3)] uppercase tracking-wider mb-0.5">{label}</p>
                      {multiline ? (
                        <textarea
                          value={(editFields[key] as string) ?? ''}
                          onChange={e => setEditFields(prev => ({ ...prev, [key]: e.target.value }))}
                          placeholder={placeholder}
                          className="w-full bg-[#132540]/60 border border-white/10 rounded-[8px] px-3 py-2 text-sm text-[#fbf5e4] placeholder-[var(--text3)] outline-none focus:border-[#fde68a]/40 transition resize-y min-h-[60px]"
                        />
                      ) : (
                        <input
                          type="text"
                          value={(editFields[key] as string) ?? ''}
                          onChange={e => setEditFields(prev => ({ ...prev, [key]: e.target.value }))}
                          placeholder={placeholder}
                          className="w-full bg-[#132540]/60 border border-white/10 rounded-[8px] px-3 py-2 text-sm text-[#fbf5e4] placeholder-[var(--text3)] outline-none focus:border-[#fde68a]/40 transition"
                        />
                      )}
                    </div>
                  ))}
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={handleSaveEdit}
                      className="flex-1 bg-[#1044ab] hover:bg-[#1a56db] text-[#fbf5e4] py-2 text-xs rounded-[8px] transition"
                    >
                      儲存
                    </button>
                    <button
                      onClick={() => setIsEditing(false)}
                      className="flex-1 bg-[#24282d] hover:bg-white/5 border border-white/10 text-[#e8e8e9] py-2 text-xs rounded-[8px] transition"
                    >
                      取消
                    </button>
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
                      <div key={label} className="bg-[#132540]/50 border border-white/5 rounded-[8px] px-3 py-2">
                        <p className="text-[10px] text-[var(--text3)] uppercase tracking-wider mb-1">{label}</p>
                        <p className="text-sm text-[#c8d8f0] leading-relaxed">{value}</p>
                      </div>
                    ) : null
                  )}

                  {/* 背景故事 */}
                  <div className="bg-[#132540]/50 border border-white/5 rounded-[8px] px-3 py-2">
                    <p className="text-[10px] text-[var(--text3)] uppercase tracking-wider mb-1 flex items-center gap-1">
                      <BookOpen className="w-3 h-3" /> 背景故事
                      {!backstoryUnlocked && <Lock className="w-3 h-3 ml-0.5" />}
                    </p>
                    {backstoryUnlocked ? (
                      displayBackstory
                        ? <p className="text-sm text-[#c8d8f0] leading-relaxed">{displayBackstory}</p>
                        : <p className="text-xs text-[var(--text3)] italic">（暫無）</p>
                    ) : (
                      <p className="text-sm text-[var(--text3)] italic">
                        ？？？
                        <span className="text-[10px] ml-2">（好感度 ≥ 20 解鎖，目前：{selectedNpc.affection}）</span>
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
                  <p className="text-[10px] text-[var(--text3)] uppercase tracking-wider mb-2">💭 內心想法</p>
                  <div className="space-y-1.5">
                    {visibleThoughts.map((thought, idx) => {
                      const opacity = [1, 0.92, 0.82, 0.72, 0.62][Math.min(idx, 4)];
                      return (
                        <div
                          key={idx}
                          className="bg-[#132540]/80 border-l-2 border-rose-400/60 px-3 py-2 rounded-r-[8px] relative"
                          style={{ opacity }}
                        >
                          <p className="text-xs text-[#e8e8e9] italic">「{thought.text}」</p>
                          <span className="absolute bottom-1 right-2 text-[10px] text-[var(--text3)]">{thought.createdAt}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── 角色記憶 ── */}
              <div>
                <p className="text-[10px] text-[var(--text3)] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  角色記憶
                  {hasNewMemory && <span className="inline-block w-2 h-2 rounded-full bg-[#FF6B8A]" title="有新融合記憶" />}
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
                      <div className="text-xs text-[var(--text3)] italic text-center py-6 border border-dashed border-[#283b57]/40 rounded-[8px]">
                        目前還沒有特別的回憶...
                      </div>
                    )}

                    {/* 封存記錄 */}
                    {archivedMemories.length > 0 && (
                      <div className="mt-3">
                        <button
                          className="flex items-center gap-1.5 text-[10px] text-[var(--text3)] hover:text-[#e8e8e9] transition"
                          onClick={() => setShowArchived(v => !v)}
                        >
                          {showArchived ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          查看已封存的原始記錄 ({archivedMemories.length})
                        </button>
                        {showArchived && (
                          <div className="mt-2 space-y-1.5 opacity-60">
                            {archivedMemories.map(mem => (
                              <div key={mem.id} className="bg-[#24282d]/60 border border-white/5 rounded-[8px] px-3 py-2 text-xs text-[var(--text3)] line-through">
                                <div className="flex justify-between items-start gap-2" style={{ textDecoration: 'none' }}>
                                  <span className="flex-1 break-words" style={{ textDecorationLine: 'none' }}>{mem.text}</span>
                                  <span className="shrink-0 text-[10px] text-[#283b57]">{mem.createdAt}</span>
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
                        className="w-full bg-[#24282d]/50 border border-white/10 rounded-[8px] px-3 py-2 text-sm text-[#fbf5e4] placeholder-[#283b57] focus:border-amber-500/50 outline-none transition resize-none"
                        rows={2}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddMemory('normal'); }
                        }}
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleAddMemory('normal')}
                          className="flex-1 bg-[#132540]/60 hover:bg-[#132540] border border-white/10 rounded-[8px] py-1.5 text-xs text-[#fbf5e4] transition"
                        >
                          新增（一般）
                        </button>
                        <button
                          onClick={() => handleAddMemory('core')}
                          className="flex-1 bg-[#132540]/60 hover:bg-[#1a3a60] border border-amber-500/30 rounded-[8px] py-1.5 text-xs text-amber-300 transition"
                          title="Core 記憶永遠注入，不受截斷規則影響"
                        >
                          ★ 核心記憶
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
                    <Lock className="w-6 h-6 text-[#283b57]" />
                    <p className="text-xs text-[#e8e8e9]">好感度不足，無法開啟專屬記憶庫</p>
                    <p className="text-[10px] text-[var(--text3)]">需要好感度 ≥ 60（目前：{selectedNpc.affection}）</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── 刪除確認對話框 ── */}
        {showDeleteConfirm && (
          <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-10 rounded-[8px]">
            <div className="bg-[#1e2228] border border-rose-400/30 rounded-[8px] p-5 m-4 text-center space-y-3 shadow-xl">
              <AlertTriangle className="w-8 h-8 text-rose-400 mx-auto" />
              <p className="text-sm font-semibold text-[#fbf5e4]">確定刪除「{selectedNpc.name}」？</p>
              <p className="text-xs text-[var(--text3)]">此操作將同時移除設定集資料，無法復原。</p>
              <div className="flex gap-2">
                <button
                  onClick={() => { onDeleteNpc(selectedNpc.id, lore?.id); setShowDeleteConfirm(false); }}
                  className="flex-1 bg-rose-600 hover:bg-rose-500 text-white py-2 text-xs rounded-[8px] transition"
                >
                  確認刪除
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 bg-[#24282d] hover:bg-white/5 border border-white/10 text-[#e8e8e9] py-2 text-xs rounded-[8px] transition"
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
      className={`group bg-[#24282d]/60 border rounded-[8px] px-3 py-2.5 transition ${
        isCore ? 'border-amber-500/30 bg-[#1a2010]/40' : 'border-white/5 hover:border-white/10'
      }`}
    >
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <span className={`text-[10px] border rounded-[8px] px-1.5 py-0.5 ${SOURCE_COLOR[mem.source]}`}>
            {SOURCE_LABEL[mem.source]}
          </span>
          {isCore && (
            <span className="text-[10px] text-amber-300 border border-amber-400/30 rounded-[8px] px-1.5 py-0.5">★ core</span>
          )}
          {mem.isNew && (
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#FF6B8A]" title="新記憶" />
          )}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-[var(--text3)] mr-1">{mem.createdAt}</span>
          {!isEditing && (
            <>
              <button
                onClick={() => onToggleImportance(mem)}
                className={`opacity-0 group-hover:opacity-100 transition p-0.5 rounded-[8px] ${isCore ? 'text-amber-300 hover:text-amber-400' : 'text-[var(--text3)] hover:text-amber-300'}`}
                title={isCore ? '降為一般記憶' : '設為核心記憶（永遠注入）'}
              >
                <Star className={`w-3 h-3 ${isCore ? 'fill-current' : ''}`} />
              </button>
              <button
                onClick={() => onStartEdit(mem)}
                className="opacity-0 group-hover:opacity-100 transition p-0.5 rounded-[8px] text-[var(--text3)] hover:text-[#e8e8e9]"
                title="編輯記憶"
              >
                <Edit2 className="w-3 h-3" />
              </button>
              <button
                onClick={() => onRemove(mem.id)}
                className="opacity-0 group-hover:opacity-100 transition p-0.5 rounded-[8px] text-[var(--text3)] hover:text-rose-400"
                title="刪除記憶"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </>
          )}
          {isEditing && (
            <>
              <button onClick={() => onConfirmEdit(mem.id)} className="p-0.5 rounded-[8px] text-emerald-400 hover:text-emerald-300 transition" title="確認"><Check className="w-3 h-3" /></button>
              <button onClick={onCancelEdit} className="p-0.5 rounded-[8px] text-[var(--text3)] hover:text-rose-400 transition" title="取消"><X className="w-3 h-3" /></button>
            </>
          )}
        </div>
      </div>

      {isEditing ? (
        <textarea
          value={editingText}
          onChange={e => onEditTextChange(e.target.value)}
          className="w-full bg-[#132540]/60 border border-amber-500/30 rounded-[8px] px-2 py-1 text-sm text-[#fbf5e4] outline-none resize-none"
          rows={3} autoFocus
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onConfirmEdit(mem.id); }
            if (e.key === 'Escape') onCancelEdit();
          }}
        />
      ) : (
        <p className="text-sm text-[#c8d8f0] leading-relaxed whitespace-pre-wrap break-words">{mem.text}</p>
      )}
    </div>
  );
};
