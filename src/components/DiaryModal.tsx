import React, { useState } from 'react';
import { Book, CheckSquare, Square, Trash2, ChevronDown, ChevronRight, Search, Pencil } from 'lucide-react';

import { DiaryEntry } from '../types';

interface DiaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  diaryEntries: DiaryEntry[];
  onAddDiary: () => number;
  onGenerateDiary: () => Promise<void>;
  onMergeDiary: (selectedIds: number[]) => Promise<void>;
  onToggleDiary: (id: number) => void;
  onDiaryChange: (id: number, text: string) => void;
  onDiaryTitleChange: (id: number, title: string) => void;
  onDiaryKeywordAdd: (id: number, keyword: string) => void;
  onDiaryKeywordRemove: (id: number, keyword: string) => void;
  onDeleteDiary: (id: number) => void;
  scanKeywords: (keywords: string[], depth?: number) => boolean;
}

// 取得日記標題（title 欄位優先；fallback 解析 text 第一行 ## ...）
function getDiaryTitle(entry: DiaryEntry): string {
  if (entry.title !== undefined && entry.title !== '') return entry.title;
  const firstLine = (entry.text || '').split('\n')[0].trim();
  if (firstLine.startsWith('## ')) return firstLine.slice(3).trim();
  if (firstLine.startsWith('[') && firstLine.endsWith(']')) return firstLine.slice(1, -1).trim();
  return '';
}

// 取得日記正文（排除 title 行，如果 title 是從 text 解析出來的）
function getDiaryBody(entry: DiaryEntry): string {
  // 若有獨立 title 欄位，text 本身就是純內文
  if (entry.title !== undefined) return entry.text || '';
  // fallback：從 text 去掉第一行（舊格式）
  const lines = (entry.text || '').split('\n');
  const firstLine = lines[0].trim();
  if (firstLine.startsWith('## ') || (firstLine.startsWith('[') && firstLine.endsWith(']'))) {
    return lines.slice(1).join('\n').replace(/^\n+/, '');
  }
  return entry.text || '';
}

export const DiaryModal: React.FC<DiaryModalProps> = ({
  isOpen,
  onClose,
  diaryEntries,
  onAddDiary,
  onGenerateDiary,
  onMergeDiary,
  onToggleDiary,
  onDiaryChange,
  onDiaryTitleChange,
  onDiaryKeywordAdd,
  onDiaryKeywordRemove,
  onDeleteDiary,
  scanKeywords,
}) => {
  const [editingDiaryId, setEditingDiaryId] = useState<number | null>(null);
  const [expandedIds, setExpandedIds] = useState<number[]>([]);
  const [isDiaryMergeMode, setIsDiaryMergeMode] = useState(false);
  const [diaryMergeSelection, setDiaryMergeSelection] = useState<number[]>([]);
  const [isDiaryGenerating, setIsDiaryGenerating] = useState(false);
  const [expandedMergedIds, setExpandedMergedIds] = useState<number[]>([]);
  const [diarySearch, setDiarySearch] = useState('');

  if (!isOpen) return null;

  const handleAddClick = () => {
    const newId = onAddDiary();
    setEditingDiaryId(newId);
    setExpandedIds(prev => [...prev, newId]);
  };

  const handleGenerateClick = async () => {
    setIsDiaryGenerating(true);
    await onGenerateDiary();
    setIsDiaryGenerating(false);
  };

  const handleMergeClick = async () => {
    if (diaryMergeSelection.length < 2) return;
    setIsDiaryGenerating(true);
    await onMergeDiary(diaryMergeSelection);
    setDiaryMergeSelection([]);
    setIsDiaryMergeMode(false);
    setIsDiaryGenerating(false);
  };

  const toggleExpand = (id: number) => {
    setExpandedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const panelBg = 'color-mix(in srgb, var(--bg-elevated) 70%, transparent)';
  const panelBgLight = 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)';
  const panelBgDim = 'color-mix(in srgb, var(--bg-elevated) 30%, transparent)';

  const filteredEntries = diaryEntries.filter(entry => !entry.isMerged).filter(entry => {
    if (!diarySearch.trim()) return true;
    const q = diarySearch.toLowerCase();
    const title = getDiaryTitle(entry).toLowerCase();
    return (
      title.includes(q) ||
      entry.text?.toLowerCase().includes(q) ||
      entry.keywords?.some(k => k.toLowerCase().includes(q))
    );
  });

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div
        className="backdrop-blur-xl w-full max-w-2xl rounded-[8px] shadow-[0_0_40px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden border border-white/10 relative z-[61] h-[80vh]"
        style={{ background: panelBg, color: 'var(--text-body)' }}
      >
        {/* ── Header ── */}
        <div
          className="p-4 border-b border-white/5 flex justify-between items-center"
          style={{ background: panelBgLight }}
        >
          <div className="flex items-center">
            <h2 className="text-lg font-bold flex items-center" style={{ color: 'var(--text-primary)' }}>
              <Book className="w-5 h-5 mr-2" style={{ color: 'var(--text-primary)' }} /> 日記與記憶
            </h2>
            <span className="ml-4 text-xs" style={{ color: 'var(--text-muted)' }}>
              勾選的項目將會被 AI 讀取並帶入遊戲記憶中
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="搜尋..."
                value={diarySearch}
                onChange={e => setDiarySearch(e.target.value)}
                className="h-7 pl-7 pr-3 rounded-[16px] text-xs outline-none border border-white/10 w-36 transition"
                style={{ background: 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)', color: 'var(--text-body)' }}
              />
            </div>
            <button
              className="transition"
              style={{ color: 'var(--text-muted)' }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-body)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; }}
              onClick={onClose}
            >
              ✕
            </button>
          </div>
        </div>

        {/* ── Action buttons ── */}
        <div className="px-4 pt-3 pb-0 border-b border-white/5" style={{ background: panelBgLight }}>
          <div
            className="flex border border-white/10 rounded-t-[8px] overflow-hidden"
            style={{ background: 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)' }}
          >
            <button
              onClick={handleAddClick}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-bold transition"
              style={{ background: 'transparent', color: 'var(--text-tab)' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--btn-primary-hover)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            >
              <span>新增日記</span>
            </button>

            <button
              onClick={handleGenerateClick}
              disabled={isDiaryGenerating}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-bold transition"
              style={{
                background: isDiaryGenerating ? 'var(--btn-primary)' : 'transparent',
                color: 'var(--text-tab)',
                cursor: isDiaryGenerating ? 'not-allowed' : 'pointer',
                opacity: isDiaryGenerating ? 0.6 : 1,
              }}
              onMouseEnter={e => { if (!isDiaryGenerating) e.currentTarget.style.background = 'var(--btn-primary-hover)'; }}
              onMouseLeave={e => { if (!isDiaryGenerating) e.currentTarget.style.background = 'transparent'; }}
            >
              <span className={`text-base ${isDiaryGenerating ? 'animate-spin' : ''}`}>{isDiaryGenerating ? '⏳' : '🔮'}</span>
              <span>魔法日記</span>
            </button>

            <button
              onClick={() => {
                if (isDiaryMergeMode) { setIsDiaryMergeMode(false); setDiaryMergeSelection([]); }
                else setIsDiaryMergeMode(true);
              }}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-bold transition"
              style={{
                background: isDiaryMergeMode ? 'var(--color-violet)' : 'transparent',
                color: 'var(--text-tab)',
                boxShadow: isDiaryMergeMode ? '0 0 12px rgba(167,139,250,0.35)' : 'none',
              }}
              onMouseEnter={e => { if (!isDiaryMergeMode) e.currentTarget.style.background = 'color-mix(in srgb, var(--color-violet) 25%, var(--bg-elevated))'; }}
              onMouseLeave={e => { if (!isDiaryMergeMode) e.currentTarget.style.background = 'transparent'; }}
            >
              <span className="text-base">💫</span>
              <span>融合日記</span>
            </button>
          </div>
        </div>

        {/* ── 融合模式控制列 ── */}
        {isDiaryMergeMode && (
          <div
            className="px-4 py-2 flex items-center justify-between border-b border-white/5"
            style={{ background: panelBgDim }}
          >
            <span className="text-xs" style={{ color: 'var(--text-body)' }}>
              已選 {diaryMergeSelection.length} 條{diaryMergeSelection.length >= 2 ? '，可融合' : '，請選 2 條以上'}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => { setIsDiaryMergeMode(false); setDiaryMergeSelection([]); }}
                className="text-xs px-3 py-1.5 rounded-xl border border-white/10 transition"
                style={{ background: 'color-mix(in srgb, var(--bg-elevated) 60%, transparent)', color: 'var(--text-body)' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'color-mix(in srgb, var(--bg-elevated) 80%, transparent)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'color-mix(in srgb, var(--bg-elevated) 60%, transparent)'; }}
              >
                取消
              </button>
              <button
                onClick={handleMergeClick}
                disabled={diaryMergeSelection.length < 2}
                className="text-xs px-3 py-1.5 rounded-xl transition"
                style={
                  diaryMergeSelection.length >= 2
                    ? { background: 'var(--color-violet)', color: 'var(--text-tab)', boxShadow: '0 0 15px rgba(167,139,250,0.4)', cursor: 'pointer' }
                    : { background: 'color-mix(in srgb, var(--bg-elevated) 40%, transparent)', color: 'var(--border-default)', cursor: 'not-allowed', border: '1px solid rgba(255,255,255,0.05)' }
                }
                onMouseEnter={e => { if (diaryMergeSelection.length >= 2) e.currentTarget.style.background = 'color-mix(in srgb, var(--color-violet) 80%, white)'; }}
                onMouseLeave={e => { if (diaryMergeSelection.length >= 2) e.currentTarget.style.background = 'var(--color-violet)'; }}
              >
                確認融合
              </button>
            </div>
          </div>
        )}

        {/* ── 日記列表 ── */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {filteredEntries.map(entry => {
            const title = getDiaryTitle(entry);
            const body  = getDiaryBody(entry);
            const isExpanded = expandedIds.includes(entry.id);
            const isEditing  = editingDiaryId === entry.id;
            const isMergedEntry = entry.source === 'merged' && entry.mergedFrom && entry.mergedFrom.length > 0;
            const isMergedExpanded = expandedMergedIds.includes(entry.id);
            const sourceDiaries = isMergedEntry
              ? diaryEntries.filter(e => entry.mergedFrom?.includes(e.id))
              : [];

            return (
              <React.Fragment key={entry.id}>
                <div
                  className="border rounded-[8px] transition-colors"
                  style={{
                    background: panelBgLight,
                    borderColor: isEditing ? 'var(--border-accent)' : 'var(--border-default)',
                  }}
                  onMouseEnter={e => { if (!isEditing) (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-accent)'; }}
                  onMouseLeave={e => { if (!isEditing) (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-default)'; }}
                >
                  {isEditing ? (
                    /* ── 編輯模式 ── */
                    <div className="p-4 flex flex-col gap-3">
                      {/* 標題輸入 */}
                      <input
                        type="text"
                        value={entry.title ?? ''}
                        onChange={e => onDiaryTitleChange(entry.id, e.target.value)}
                        placeholder="日記標題..."
                        className="w-full outline-none text-sm font-bold px-2.5 py-1.5 rounded-[8px] border transition"
                        style={{
                          background: 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)',
                          borderColor: 'var(--border-accent)',
                          color: 'var(--text-primary)',
                        }}
                        autoFocus
                      />
                      {/* 內文輸入 */}
                      <textarea
                        value={body}
                        onChange={e => onDiaryChange(entry.id, e.target.value)}
                        placeholder="寫下你想讓 AI 記住的事件或設定..."
                        className="w-full outline-none text-sm min-h-[100px] p-2.5 rounded-[8px] border transition resize-y"
                        style={{
                          background: 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)',
                          borderColor: 'var(--border-accent)',
                          color: 'var(--text-main)',
                        }}
                      />

                      {/* 關鍵字區塊 */}
                      <div className="rounded-[8px] p-3 border" style={{ background: panelBgLight, borderColor: 'var(--border-default)' }}>
                        <div className="text-xs mb-2 uppercase tracking-wider" style={{ color: 'var(--text-tab)' }}>
                          觸發關鍵字 <span className="normal-case">（空白 = 勾選後永遠注入）</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {(entry.keywords || []).map((kw: string) => (
                            <span
                              key={kw}
                              className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border"
                              style={{
                                background: 'color-mix(in srgb, var(--bg-sys-tag) 50%, transparent)',
                                borderColor: 'color-mix(in srgb, var(--text-muted) 40%, transparent)',
                                color: 'var(--text-body)',
                              }}
                            >
                              {kw}
                              <button
                                onClick={() => onDiaryKeywordRemove(entry.id, kw)}
                                className="leading-none transition"
                                style={{ color: 'var(--text-muted)' }}
                                onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-danger)'; }}
                                onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; }}
                              >×</button>
                            </span>
                          ))}
                        </div>
                        <input
                          type="text"
                          placeholder="輸入關鍵字後按 Enter..."
                          className="w-full border border-white/10 rounded-[8px] px-3 py-1.5 text-xs outline-none transition"
                          style={{ background: 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)', color: 'var(--text-main)' }}
                          onKeyDown={e => {
                            if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                              onDiaryKeywordAdd(entry.id, e.currentTarget.value.trim());
                              e.currentTarget.value = '';
                            }
                          }}
                        />
                      </div>

                      {/* 底部按鈕 */}
                      <div className="flex justify-between items-center pt-1">
                        <button
                          onClick={() => { onDeleteDiary(entry.id); setEditingDiaryId(null); }}
                          className="text-sm flex items-center px-2 py-1.5 rounded-[8px] gap-1 transition border"
                          style={{ color: 'var(--text-muted)', borderColor: 'var(--border-default)' }}
                          onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-danger)'; e.currentTarget.style.borderColor = 'var(--text-danger)'; }}
                          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border-default)'; }}
                        >
                          <Trash2 className="w-3.5 h-3.5" /> 刪除
                        </button>
                        <button
                          onClick={() => setEditingDiaryId(null)}
                          className="text-sm px-3 py-1.5 rounded-[8px] transition"
                          style={{ background: 'var(--btn-primary)', color: 'var(--text-tab)', boxShadow: 'var(--shadow)' }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'var(--btn-primary-hover)'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'var(--btn-primary)'; }}
                        >
                          完成
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* ── 閱覽模式（卡片） ── */
                    <div>
                      {/* 卡片 Header：標題 + 右側按鈕群 */}
                      <div
                        className="flex items-center gap-2 px-4 py-3 cursor-pointer select-none"
                        onClick={() => !isDiaryMergeMode && toggleExpand(entry.id)}
                      >
                        {/* 展開箭頭 */}
                        {!isDiaryMergeMode && (
                          <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
                            {isExpanded
                              ? <ChevronDown className="w-3.5 h-3.5" />
                              : <ChevronRight className="w-3.5 h-3.5" />
                            }
                          </span>
                        )}

                        {/* 標題 */}
                        <span
                          className="flex-1 text-sm font-bold truncate"
                          style={{ color: title ? 'var(--text-primary)' : 'var(--text-muted)' }}
                        >
                          {title || '（未命名日記）'}
                        </span>

                        {/* 右側：融合勾選 or AI 勾選框 */}
                        {isDiaryMergeMode ? (
                          <button
                            className="shrink-0 transition"
                            onClick={e => {
                              e.stopPropagation();
                              setDiaryMergeSelection(prev =>
                                prev.includes(entry.id) ? prev.filter(id => id !== entry.id) : [...prev, entry.id]
                              );
                            }}
                            title="選取以融合"
                            style={{ color: diaryMergeSelection.includes(entry.id) ? 'var(--color-violet)' : 'var(--text-muted)' }}
                          >
                            {diaryMergeSelection.includes(entry.id) ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                          </button>
                        ) : (
                          <button
                            className="shrink-0 transition"
                            onClick={e => { e.stopPropagation(); onToggleDiary(entry.id); }}
                            title={entry.isActive ? 'AI 將會讀取此記憶' : 'AI 不會讀取此記憶'}
                            style={{ color: entry.isActive ? 'var(--text-primary)' : 'var(--text-muted)' }}
                          >
                            {entry.isActive ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                          </button>
                        )}
                      </div>

                      {/* 內文預覽（摺疊時顯示 2 行） */}
                      {!isExpanded && body && (
                        <div
                          className="px-4 pb-3 text-xs cursor-pointer"
                          style={{
                            color: 'var(--text-muted)',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                          }}
                          onClick={() => toggleExpand(entry.id)}
                        >
                          {body}
                        </div>
                      )}

                      {/* 關鍵字標籤（摺疊時也顯示） */}
                      {(entry.keywords || []).length > 0 && !isExpanded && (
                        <div className="px-4 pb-3 flex flex-wrap gap-1">
                          {(entry.keywords || []).map((kw: string) => (
                            <span
                              key={kw}
                              className="text-xs px-1.5 py-0.5 rounded-full border flex-shrink-0"
                              style={
                                scanKeywords([kw])
                                  ? { background: 'color-mix(in srgb, var(--bg-sys-tag) 60%, transparent)', borderColor: 'color-mix(in srgb, var(--text-primary) 50%, transparent)', color: 'var(--text-body)' }
                                  : { background: 'color-mix(in srgb, var(--bg-elevated) 60%, transparent)', borderColor: 'color-mix(in srgb, var(--border-default) 40%, transparent)', color: 'var(--text-muted)' }
                              }
                            >
                              {kw}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* 展開後完整內容 */}
                      {isExpanded && (
                        <div className="px-4 pb-4 flex flex-col gap-3">
                          {/* 關鍵字 */}
                          {(entry.keywords || []).length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {(entry.keywords || []).map((kw: string) => (
                                <span
                                  key={kw}
                                  className="text-xs px-1.5 py-0.5 rounded-full border flex-shrink-0"
                                  style={
                                    scanKeywords([kw])
                                      ? { background: 'color-mix(in srgb, var(--bg-sys-tag) 60%, transparent)', borderColor: 'color-mix(in srgb, var(--text-primary) 50%, transparent)', color: 'var(--text-body)' }
                                      : { background: 'color-mix(in srgb, var(--bg-elevated) 60%, transparent)', borderColor: 'color-mix(in srgb, var(--border-default) 40%, transparent)', color: 'var(--text-muted)' }
                                  }
                                >
                                  {kw}
                                </span>
                              ))}
                            </div>
                          )}

                          {/* 完整內文 */}
                          <div className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: 'var(--text-body)' }}>
                            {body || <span className="italic" style={{ color: 'var(--text-muted)' }}>尚無內容...</span>}
                          </div>

                          {/* 底部列：融合來源 + 編輯按鈕 */}
                          <div className="flex items-center justify-between pt-1">
                            <div>
                              {isMergedEntry && (
                                <button
                                  onClick={() => setExpandedMergedIds(prev =>
                                    prev.includes(entry.id) ? prev.filter(id => id !== entry.id) : [...prev, entry.id]
                                  )}
                                  className="flex items-center text-xs transition"
                                  style={{ color: 'var(--text-muted)' }}
                                  onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-body)'; }}
                                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; }}
                                >
                                  {isMergedExpanded ? <ChevronDown className="w-3 h-3 mr-1" /> : <ChevronRight className="w-3 h-3 mr-1" />}
                                  {isMergedExpanded ? '收起來源' : '檢視來源'}
                                </button>
                              )}
                            </div>
                            <button
                              onClick={() => setEditingDiaryId(entry.id)}
                              className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-[8px] border transition"
                              style={{ color: 'var(--text-muted)', borderColor: 'var(--border-default)' }}
                              onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-body)'; e.currentTarget.style.borderColor = 'var(--border-accent)'; }}
                              onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border-default)'; }}
                            >
                              <Pencil className="w-3 h-3" /> 編輯
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* 融合來源展開 */}
                {isMergedEntry && isMergedExpanded && sourceDiaries.length > 0 && (
                  <div className="ml-8 pl-4 border-l-2 space-y-2" style={{ borderLeftColor: 'var(--border-accent)' }}>
                    {sourceDiaries.map(sourceEntry => (
                      <div
                        key={`source-${sourceEntry.id}`}
                        className="rounded-xl p-3 border border-white/5 opacity-60"
                        style={{ background: panelBgDim }}
                      >
                        {getDiaryTitle(sourceEntry) && (
                          <div className="text-xs font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
                            {getDiaryTitle(sourceEntry)}
                          </div>
                        )}
                        <div className="text-xs whitespace-pre-wrap" style={{ color: 'var(--text-body)' }}>
                          {getDiaryBody(sourceEntry)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </React.Fragment>
            );
          })}

          {diaryEntries.length === 0 && (
            <div className="text-center py-10 italic" style={{ color: 'var(--text-muted)' }}>
              目前沒有任何日記。<br />點擊上方按鈕新增，或使用水晶球自動生成。
            </div>
          )}
          {diaryEntries.length > 0 && diarySearch.trim() !== '' && filteredEntries.length === 0 && (
            <div className="text-center py-10 italic" style={{ color: 'var(--text-muted)' }}>
              找不到符合「{diarySearch}」的日記。
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
