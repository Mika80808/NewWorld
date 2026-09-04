import React, { useState } from 'react';
import { MapPin, Edit2, Trash2, Check, X, Sparkles, Loader2 } from 'lucide-react';
import { MemoryEntry } from '../../types';
import { MIN_MERGE_CANDIDATES, isSceneMergeable } from '../../utils/memoryStore';

interface SceneMemoryWidgetProps {
  memories: MemoryEntry[];
  currentLocation: string;
  /** 編輯記憶內容。改過的記憶會轉成玩家手寫（不再被 AI 融合／淘汰） */
  onUpdateMemory?: (id: string, content: string) => void;
  onDeleteMemory?: (id: string) => void;
  /** 交給助理 GM 把這一層的可融合記憶濃縮成一條 */
  onMergeMemories?: (type: 'scene' | 'region') => void;
  /** 融合進行中的層級（避免重複點擊） */
  mergingType?: 'scene' | 'region' | null;
}

/**
 * 右欄 Widget 3：場景 & 區域記憶（區域 / 場景 兩段）。
 * 桌面右欄與手機右抽屜共用。
 *
 * ⚠️ 這裡刻意不顯示 `type === 'npc'` 的記憶。這個 Widget 講的是「你現在站的地方」，
 * 而 NPC 記憶沒有地點條件（先前那一段完全不過濾 currentLocation），
 * 於是跨場景的角色對話會一路累積在這裡，把真正的場景記憶擠掉。
 * 角色相關的內容看 NPC 卡片的記憶庫；npc 記憶本身照常存在、照常注入 prompt。
 *
 * 記憶對玩家原本是**唯讀**的——沒有編輯也沒有刪除入口，而 AI 只會 MEMORY_ADD、
 * 從來不刪，於是同一個地點待久了就是「很長一串」（玩家回報）。現在每一條都可以
 * 就地改、就地刪，整段也可以交給助理 GM 濃縮成一條。
 */
export const SceneMemoryWidget: React.FC<SceneMemoryWidgetProps> = ({
  memories,
  currentLocation,
  onUpdateMemory,
  onDeleteMemory,
  onMergeMemories,
  mergingType = null,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  // 單趟走訪分兩類，取代原本連續兩次 memories.filter
  const regionMems: MemoryEntry[] = [];
  const sceneMems: MemoryEntry[] = [];
  for (const m of memories) {
    if (!m.isActive) continue;
    const locs = m.tags?.locations || [];
    if (m.type === 'region') {
      if (locs.length === 0 || locs.some(l => l === currentLocation)) regionMems.push(m);
    } else if (m.type === 'scene') {
      if (locs.some(l => l === currentLocation)) sceneMems.push(m);
    }
  }

  const startEdit = (mem: MemoryEntry) => {
    setEditingId(mem.id);
    setDraft(mem.content);
  };
  const cancelEdit = () => {
    setEditingId(null);
    setDraft('');
  };
  const confirmEdit = (id: string) => {
    if (draft.trim()) onUpdateMemory?.(id, draft);
    cancelEdit();
  };

  const iconBtn = 'opacity-0 group-focus-within/mem:opacity-100 group-hover/mem:opacity-100 transition p-0.5 rounded-[8px] shrink-0';

  const renderRow = (mem: MemoryEntry, dotColor: string) => {
    const isEditing = editingId === mem.id;
    return (
      <li key={mem.id} className="group/mem flex items-start gap-2 text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
        <span className="mt-1.5 w-1 h-1 rounded-full shrink-0" style={{ background: dotColor, opacity: 0.7 }} />
        {isEditing ? (
          <div className="flex-1 flex items-start gap-1">
            <textarea
              value={draft}
              onChange={e => setDraft(e.target.value)}
              autoFocus
              rows={3}
              aria-label="編輯記憶內容"
              className="flex-1 rounded-[8px] px-2 py-1 text-xs resize-y outline-none"
              style={{
                background: 'var(--bg-sys-field)',
                color: 'var(--text-main)',
                border: 'var(--border-width) solid var(--border-default)',
              }}
            />
            <button
              onClick={() => confirmEdit(mem.id)}
              className="p-0.5 rounded-[8px] transition shrink-0"
              style={{ color: 'var(--color-success)' }}
              title="確認"
            >
              <Check className="w-3 h-3" />
            </button>
            <button
              onClick={cancelEdit}
              className="p-0.5 rounded-[8px] transition shrink-0"
              style={{ color: 'var(--text-muted)' }}
              title="取消"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <>
            <span className="flex-1">
              {mem.content}
              {mem.expiresAt && <em className="ml-1 opacity-60">（至 {mem.expiresAt}）</em>}
              {mem.source === 'ai_generated' && <em className="ml-1 text-[0.625rem] opacity-50">AI</em>}
            </span>
            {onUpdateMemory && (
              <button
                onClick={() => startEdit(mem)}
                className={iconBtn}
                style={{ color: 'var(--text-muted)' }}
                title="編輯記憶"
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-body)'; }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; }}
              >
                <Edit2 className="w-3 h-3" />
              </button>
            )}
            {onDeleteMemory && (
              <button
                onClick={() => onDeleteMemory(mem.id)}
                className={iconBtn}
                style={{ color: 'var(--text-muted)' }}
                title="刪除記憶"
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-rose)'; }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; }}
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </>
        )}
      </li>
    );
  };

  /**
   * 融合鈕。刻意做成**玩家按才動**，不像 NPC 記憶那樣自動觸發：
   * `MemoryEntry` 沒有 `isMerged` 封存欄位，融合是直接取代原文，
   * 自動跑等於在玩家沒看到的時候改寫存檔。少於 MIN_MERGE_CANDIDATES 條時
   * 不顯示——把兩句話併成一句沒有意義。
   */
  const renderMergeButton = (type: 'scene' | 'region', list: MemoryEntry[]) => {
    if (!onMergeMemories) return null;
    const candidates = list.filter(isSceneMergeable);
    if (candidates.length < MIN_MERGE_CANDIDATES) return null;
    const busy = mergingType === type;
    return (
      <button
        onClick={() => onMergeMemories(type)}
        disabled={busy}
        className="flex items-center gap-1 text-[0.625rem] px-1.5 py-0.5 rounded-[8px] transition disabled:opacity-50"
        style={{ color: 'var(--text-muted)', border: 'var(--border-width) solid var(--tint-line)' }}
        title={`把這裡 ${candidates.length} 條 AI 記憶濃縮成一條（玩家手寫與 critical 不動）`}
        onMouseEnter={e => { if (!busy) e.currentTarget.style.color = 'var(--color-amber)'; }}
        onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; }}
      >
        {busy
          ? <Loader2 className="w-2.5 h-2.5 animate-spin" />
          : <Sparkles className="w-2.5 h-2.5" />}
        融合 {candidates.length}
      </button>
    );
  };

  return (
    <div
      className="rounded-[8px] border border-[color:var(--tint-line)] backdrop-blur-md p-4 shadow-xl transition-all duration-300"
      style={{ background: 'var(--bg-ui-card)' }}
      onMouseEnter={e => (e.currentTarget.style.boxShadow = 'var(--ring-accent), var(--shadow-float)')}
      onMouseLeave={e => (e.currentTarget.style.boxShadow = 'var(--shadow-float)')}
    >
      <div className="flex items-center gap-2 mb-4">
        <MapPin className="w-4 h-4 shrink-0" style={{ color: 'var(--color-amber)' }} />
        <span className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>場景記憶</span>
      </div>

      {/* 區域記憶 */}
      {regionMems.length > 0 && (
        <div className="mb-3">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <p className="text-[0.625rem] uppercase tracking-widest font-semibold" style={{ color: 'var(--text-muted)' }}>區域</p>
            {renderMergeButton('region', regionMems)}
          </div>
          <ul className="space-y-1.5">
            {regionMems.map(mem => renderRow(mem, 'var(--color-amber)'))}
          </ul>
        </div>
      )}

      {/* 場景記憶 */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <p className="text-[0.625rem] uppercase tracking-widest font-semibold" style={{ color: 'var(--text-muted)' }}>場景</p>
          {renderMergeButton('scene', sceneMems)}
        </div>
        {sceneMems.length > 0 ? (
          <ul className="space-y-1.5">
            {sceneMems.map(mem => renderRow(mem, 'var(--color-sky)'))}
          </ul>
        ) : (
          <p className="text-xs pl-1" style={{ color: 'var(--text-muted)' }}>此場景尚無記憶...</p>
        )}
      </div>
    </div>
  );
};

SceneMemoryWidget.displayName = 'SceneMemoryWidget';
