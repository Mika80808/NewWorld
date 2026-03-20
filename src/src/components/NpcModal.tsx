import React, { useState, useRef } from 'react';
import { Users, BookPlus, Pin, Star, Trash2, Lock, ChevronDown, ChevronUp, Edit2, Check, X } from 'lucide-react';
import { Npc, NpcMemory } from '../types';

interface NpcModalProps {
  selectedNpc: Npc | null;
  onClose: () => void;
  onRecordNpc: (npc: Npc) => void;
  onTogglePinNpc: (id: number) => void;
  onAddNpcMemory: (id: number, text: string, importance?: 'core' | 'normal') => void;
  onRemoveNpcMemory: (id: number, memId: string) => void;
  onUpdateNpcMemory: (id: number, memId: string, updates: Partial<NpcMemory>) => void;
}

// 來源標籤文字
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

export const NpcModal: React.FC<NpcModalProps> = ({
  selectedNpc,
  onClose,
  onRecordNpc,
  onTogglePinNpc,
  onAddNpcMemory,
  onRemoveNpcMemory,
  onUpdateNpcMemory,
}) => {
  const [activeTab, setActiveTab] = useState<'info' | 'memories'>('info');
  const [showArchived, setShowArchived] = useState(false);
  const [editingMemId, setEditingMemId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const newMemRef = useRef<HTMLTextAreaElement>(null);

  if (!selectedNpc) return null;

  const memoryUnlocked = selectedNpc.affection >= 60;

  // 分組：active（未封存）vs archived（isMerged=true）
  const activeMemories = (selectedNpc.memories || []).filter(m => !m.isMerged);
  const archivedMemories = (selectedNpc.memories || []).filter(m => m.isMerged);

  const handleAddMemory = (importance: 'core' | 'normal' = 'normal') => {
    const val = newMemRef.current?.value?.trim();
    if (!val) return;
    onAddNpcMemory(selectedNpc.id, val, importance);
    if (newMemRef.current) newMemRef.current.value = '';
  };

  const handleStartEdit = (mem: NpcMemory) => {
    setEditingMemId(mem.id);
    setEditingText(mem.text);
  };

  const handleConfirmEdit = (memId: string) => {
    if (editingText.trim()) {
      onUpdateNpcMemory(selectedNpc.id, memId, { text: editingText.trim() });
    }
    setEditingMemId(null);
  };

  const handleCancelEdit = () => {
    setEditingMemId(null);
    setEditingText('');
  };

  const handleToggleImportance = (mem: NpcMemory) => {
    onUpdateNpcMemory(selectedNpc.id, mem.id, {
      importance: mem.importance === 'core' ? 'normal' : 'core',
    });
  };

  // 好感度顏色
  const affectionColor =
    selectedNpc.affection >= 80 ? 'text-emerald-400' :
    selectedNpc.affection >= 50 ? 'text-amber-400' :
    selectedNpc.affection >= 0  ? 'text-[#e8e8e9]' :
    'text-rose-400';

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div
        className="bg-[#24282d]/90 backdrop-blur-xl w-full max-w-md rounded-[8px] shadow-[0_0_40px_rgba(0,0,0,0.6)] flex flex-col overflow-hidden text-[#fbf5e4] border border-white/10 relative"
        style={{ maxHeight: '90vh' }}
      >
        {/* ── Header ── */}
        <div className="p-4 border-b border-white/5 flex justify-between items-start bg-[#24282d]/60 shrink-0">
          <div className="flex-1 min-w-0 pr-3">
            <h2 className="text-lg font-bold text-[#fde68a] flex items-center gap-2">
              <Users className="w-4 h-4 shrink-0" />
              {selectedNpc.name}
              <span className="text-[#e8e8e9] text-sm font-normal">｜{selectedNpc.job}</span>
            </h2>
            <p className="text-xs text-[#e8e8e9] mt-0.5 flex items-center gap-2">
              <span>{selectedNpc.relationship || '關係未知'}</span>
              <span className="text-[#283b57]">｜</span>
              <span className={`font-bold ${affectionColor}`}>
                ♥ {selectedNpc.affection} {selectedNpc.affectionLabel}
              </span>
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              className="text-[var(--text3)] hover:text-[#fde68a] transition"
              onClick={() => onRecordNpc(selectedNpc)}
              title="記下此人 (加入設定集)"
            >
              <BookPlus className="w-4 h-4" />
            </button>
            <button
              className={`transition ${selectedNpc.isPinned ? 'text-[#fde68a]' : 'text-[var(--text3)] hover:text-[#e8e8e9]'}`}
              onClick={() => onTogglePinNpc(selectedNpc.id)}
              title={selectedNpc.isPinned ? '取消釘選' : '釘選至個人資訊'}
            >
              <Pin className={`w-4 h-4 ${selectedNpc.isPinned ? 'fill-current' : ''}`} />
            </button>
            <button className="text-[var(--text3)] hover:text-[#fbf5e4] transition" onClick={onClose}>
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="flex border-b border-white/5 shrink-0">
          {(['info', 'memories'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2 text-xs font-semibold tracking-wide transition ${
                activeTab === tab
                  ? 'text-[#fde68a] border-b-2 border-[#fde68a] bg-[#132540]/40'
                  : 'text-[var(--text3)] hover:text-[#e8e8e9]'
              }`}
            >
              {tab === 'info' ? '📋 資料' : `📖 記憶庫${activeMemories.length > 0 ? ` (${activeMemories.length})` : ''}`}
            </button>
          ))}
        </div>

        {/* ── Body ── */}
        <div className="overflow-y-auto flex-1">

          {/* ====== 資料 Tab ====== */}
          {activeTab === 'info' && (
            <div className="p-4 space-y-4">

              {/* 基本資料 */}
              {[
                { label: '外貌', value: selectedNpc.appearance },
                { label: '個性', value: selectedNpc.personality },
                { label: '其他', value: selectedNpc.other },
              ].map(({ label, value }) =>
                value ? (
                  <div key={label}>
                    <p className="text-[10px] text-[var(--text3)] uppercase tracking-wider mb-1">{label}</p>
                    <p className="text-sm text-[#c8d8f0] leading-relaxed">{value}</p>
                  </div>
                ) : null
              )}

              {/* 上次見面 */}
              {(selectedNpc.lastSeenLocation || selectedNpc.lastSeenDate) && (
                <div className="bg-[#132540]/60 border border-white/5 rounded-[8px] px-3 py-2 text-xs text-[#e8e8e9]">
                  上次見面：
                  {selectedNpc.lastSeenLocation && <span className="text-[#fbf5e4]">{selectedNpc.lastSeenLocation}</span>}
                  {selectedNpc.lastSeenDate && <span className="ml-2 text-[var(--text3)]">{selectedNpc.lastSeenDate}</span>}
                </div>
              )}

              {/* 角色想法 */}
              {selectedNpc.thoughts && selectedNpc.thoughts.length > 0 && (
                <div>
                  <p className="text-[10px] text-[var(--text3)] uppercase tracking-wider mb-2">💭 角色想法</p>
                  <div className="space-y-1.5">
                    {selectedNpc.thoughts.map((thought, idx) => {
                      const opacity = [1, 0.82, 0.65, 0.5, 0.35][Math.min(idx, 4)];
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
            </div>
          )}

          {/* ====== 記憶庫 Tab ====== */}
          {activeTab === 'memories' && (
            <div className="p-4 space-y-4">
              {memoryUnlocked ? (
                <>
                  {/* 記憶列表 */}
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

                  {/* 封存記錄摺疊 */}
                  {archivedMemories.length > 0 && (
                    <div>
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
                            <div
                              key={mem.id}
                              className="bg-[#24282d]/60 border border-white/5 rounded-[8px] px-3 py-2 text-xs text-[var(--text3)] line-through"
                            >
                              <div className="flex justify-between items-start gap-2 no-underline" style={{ textDecoration: 'none' }}>
                                <span className="flex-1 break-words text-[var(--text3)] no-underline" style={{ textDecorationLine: 'none' }}>
                                  {mem.text}
                                </span>
                                <span className="shrink-0 text-[10px] text-[#283b57]">{mem.createdAt}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* 新增記憶輸入區 */}
                  <div className="pt-2 border-t border-white/5 space-y-2">
                    <textarea
                      ref={newMemRef}
                      placeholder="新增與他的回憶... (Enter 送出 / Shift+Enter 換行)"
                      className="w-full bg-[#24282d]/50 border border-white/10 rounded-[8px] px-3 py-2 text-sm text-[#fbf5e4] placeholder-[#283b57] focus:border-amber-500/50 outline-none transition resize-none"
                      rows={2}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleAddMemory('normal');
                        }
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
          )}
        </div>
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
  mem,
  isEditing,
  editingText,
  onEditTextChange,
  onStartEdit,
  onConfirmEdit,
  onCancelEdit,
  onToggleImportance,
  onRemove,
}) => {
  const isCore = mem.importance === 'core';

  return (
    <div
      className={`group bg-[#24282d]/60 border rounded-[8px] px-3 py-2.5 transition ${
        isCore
          ? 'border-amber-500/30 bg-[#1a2010]/40'
          : 'border-white/5 hover:border-white/10'
      }`}
    >
      {/* 頂部：來源標籤 + 日期 + 操作按鈕 */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <span className={`text-[10px] border rounded-[8px] px-1.5 py-0.5 ${SOURCE_COLOR[mem.source]}`}>
            {SOURCE_LABEL[mem.source]}
          </span>
          {isCore && (
            <span className="text-[10px] text-amber-300 border border-amber-400/30 rounded-[8px] px-1.5 py-0.5">
              ★ core
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-[var(--text3)] mr-1">{mem.createdAt}</span>
          {!isEditing && (
            <>
              {/* ★ 切換 core/normal */}
              <button
                onClick={() => onToggleImportance(mem)}
                className={`opacity-0 group-hover:opacity-100 transition p-0.5 rounded-[8px] ${
                  isCore ? 'text-amber-300 hover:text-amber-400' : 'text-[var(--text3)] hover:text-amber-300'
                }`}
                title={isCore ? '降為一般記憶' : '設為核心記憶（永遠注入）'}
              >
                <Star className={`w-3 h-3 ${isCore ? 'fill-current' : ''}`} />
              </button>
              {/* 編輯 */}
              <button
                onClick={() => onStartEdit(mem)}
                className="opacity-0 group-hover:opacity-100 transition p-0.5 rounded-[8px] text-[var(--text3)] hover:text-[#e8e8e9]"
                title="編輯記憶"
              >
                <Edit2 className="w-3 h-3" />
              </button>
              {/* 刪除 */}
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
              <button
                onClick={() => onConfirmEdit(mem.id)}
                className="p-0.5 rounded-[8px] text-emerald-400 hover:text-emerald-300 transition"
                title="確認"
              >
                <Check className="w-3 h-3" />
              </button>
              <button
                onClick={onCancelEdit}
                className="p-0.5 rounded-[8px] text-[var(--text3)] hover:text-rose-400 transition"
                title="取消"
              >
                <X className="w-3 h-3" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* 內容：編輯模式 or 顯示模式 */}
      {isEditing ? (
        <textarea
          value={editingText}
          onChange={e => onEditTextChange(e.target.value)}
          className="w-full bg-[#132540]/60 border border-amber-500/30 rounded-[8px] px-2 py-1 text-sm text-[#fbf5e4] outline-none resize-none"
          rows={3}
          autoFocus
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onConfirmEdit(mem.id); }
            if (e.key === 'Escape') onCancelEdit();
          }}
        />
      ) : (
        <p className="text-sm text-[#c8d8f0] leading-relaxed whitespace-pre-wrap break-words">
          {mem.text}
        </p>
      )}
    </div>
  );
};
