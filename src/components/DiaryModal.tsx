import React, { useState } from 'react';
import { Book, CheckSquare, Square, Trash2, ChevronDown, ChevronRight, Search } from 'lucide-react';

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
  onDiaryKeywordAdd: (id: number, keyword: string) => void;
  onDiaryKeywordRemove: (id: number, keyword: string) => void;
  onDeleteDiary: (id: number) => void;
  scanKeywords: (keywords: string[]) => boolean;
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
  onDiaryKeywordAdd,
  onDiaryKeywordRemove,
  onDeleteDiary,
  scanKeywords,
}) => {
  const [editingDiaryId, setEditingDiaryId] = useState<number | null>(null);
  const [isDiaryMergeMode, setIsDiaryMergeMode] = useState(false);
  const [diaryMergeSelection, setDiaryMergeSelection] = useState<number[]>([]);
  const [isDiaryGenerating, setIsDiaryGenerating] = useState(false);
  const [expandedMergedIds, setExpandedMergedIds] = useState<number[]>([]);
  const [diarySearch, setDiarySearch] = useState('');

  if (!isOpen) return null;

  const handleAddClick = () => {
    const newId = onAddDiary();
    setEditingDiaryId(newId);
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

  const panelBg = 'color-mix(in srgb, var(--bg-elevated) 70%, transparent)';
  const panelBgLight = 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)';
  const panelBgDim = 'color-mix(in srgb, var(--bg-elevated) 30%, transparent)';

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div
        className="backdrop-blur-xl w-full max-w-2xl rounded-[8px] shadow-[0_0_40px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden border border-white/10 relative h-[80vh]"
        style={{ background: panelBg, color: 'var(--text-body' }}
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
            {/* 搜尋欄 */}
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

        {/* ── Action buttons（分頁樣式，同 LorebookModal） ── */}
        <div
          className="px-4 pt-3 pb-0 border-b border-white/5"
          style={{ background: panelBgLight }}
        >
          <div
            className="flex border border-white/10 rounded-t-[8px] overflow-hidden"
            style={{ background: 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)' }}
          >
            {/* 新增日記 */}
            <button
              onClick={handleAddClick}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-bold transition"
              style={{ background: 'transparent', color: 'var(--text-tab)', boxShadow: 'none' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--btn-primary-hover)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            >
              <span>新增日記</span>
            </button>

            {/* 魔法日記 */}
            <button
              onClick={handleGenerateClick}
              disabled={isDiaryGenerating}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-bold transition"
              style={{
                background: isDiaryGenerating ? 'var(--btn-primary)' : 'transparent',
                color: 'var(--text-tab)',
                cursor: isDiaryGenerating ? 'not-allowed' : 'pointer',
                opacity: isDiaryGenerating ? 0.6 : 1,
                boxShadow: isDiaryGenerating ? 'var(--shadow)' : 'none',
              }}
              onMouseEnter={e => { if (!isDiaryGenerating) e.currentTarget.style.background = 'var(--btn-primary-hover)'; }}
              onMouseLeave={e => { if (!isDiaryGenerating) e.currentTarget.style.background = 'transparent'; }}
            >
              <span className={`text-base ${isDiaryGenerating ? 'animate-spin' : ''}`}>{isDiaryGenerating ? '⏳' : '🔮'}</span>
              <span>魔法日記</span>
            </button>

            {/* 融合日記 */}
            <button
              onClick={() => {
                if (isDiaryMergeMode) {
                  setIsDiaryMergeMode(false);
                  setDiaryMergeSelection([]);
                } else {
                  setIsDiaryMergeMode(true);
                }
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
                    ? {
                        background: 'var(--color-violet)',
                        color: 'var(--text-tab)',
                        boxShadow: '0 0 15px rgba(167,139,250,0.4)',
                        cursor: 'pointer',
                      }
                    : {
                        background: 'color-mix(in srgb, var(--bg-elevated) 40%, transparent)',
                        color: 'var(--border-default)',
                        cursor: 'not-allowed',
                        border: '1px solid rgba(255,255,255,0.05)',
                      }
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
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {diaryEntries.filter(entry => !entry.isMerged).filter(entry => {
            if (!diarySearch.trim()) return true;
            const q = diarySearch.toLowerCase();
            return (
              entry.content?.toLowerCase().includes(q) ||
              entry.keywords?.some(k => k.toLowerCase().includes(q))
            );
          }).map(entry => {
            const isMergedEntry = entry.source === 'merged' && entry.mergedFrom && entry.mergedFrom.length > 0;
            const isExpanded = expandedMergedIds.includes(entry.id);
            const sourceDiaries = isMergedEntry
              ? diaryEntries.filter(e => entry.mergedFrom?.includes(e.id))
              : [];

            return (
              <React.Fragment key={entry.id}>
                <div
                  className="backdrop-blur-sm border rounded-[8px] p-4 flex flex-col transition-colors relative"
                  style={{
                    background: panelBgLight,
                    borderColor: editingDiaryId === entry.id ? 'var(--border-accent)' : 'var(--border-default)',
                  }}
                  onMouseEnter={e => { if (editingDiaryId !== entry.id) e.currentTarget.style.borderColor = 'var(--border-accent)'; }}
                  onMouseLeave={e => { if (editingDiaryId !== entry.id) e.currentTarget.style.borderColor = 'var(--border-default)'; }}
                >
                  {editingDiaryId === entry.id ? (
                    /* ── 編輯模式 ── */
                    <div className="flex flex-col gap-3">
                      <textarea
                        value={entry.text}
                        onChange={(e) => onDiaryChange(entry.id, e.target.value)}
                        placeholder="寫下你想讓 AI 記住的事件或設定..."
                        className="w-full outline-none text-sm min-h-[80px] p-2.5 rounded-[8px] border transition resize-y"
                        style={{
                          background: 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)',
                          borderColor: 'var(--border-accent)',
                          color: 'var(--text-main)',
                        }}
                        autoFocus
                      />

                      {/* 關鍵字區塊 */}
                      <div
                        className="rounded-[8px] p-3 border"
                        style={{ background: panelBgLight, borderColor: 'var(--border-default)' }}
                      >
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
                          style={{
                            background: 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)',
                            color: 'var(--text-main)',
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                              onDiaryKeywordAdd(entry.id, e.currentTarget.value.trim());
                              e.currentTarget.value = '';
                            }
                          }}
                        />
                      </div>

                      {/* 底部按鈕列：刪除 ｜ 完成 */}
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
                    /* ── 閱覽模式 ── */
                    <>
                      {/* 右上角：融合選取 or AI 勾選框 */}
                      {isDiaryMergeMode ? (
                        <button
                          className="absolute top-3 right-3 shrink-0 transition"
                          onClick={() => setDiaryMergeSelection(prev =>
                            prev.includes(entry.id) ? prev.filter(id => id !== entry.id) : [...prev, entry.id]
                          )}
                          title="選取以融合"
                          style={{ color: diaryMergeSelection.includes(entry.id) ? 'var(--color-violet)' : 'var(--text-muted)' }}
                        >
                          {diaryMergeSelection.includes(entry.id) ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                        </button>
                      ) : (
                        <button
                          className="absolute top-3 right-3 shrink-0 transition"
                          onClick={() => onToggleDiary(entry.id)}
                          title={entry.isActive ? 'AI 將會讀取此記憶' : 'AI 不會讀取此記憶'}
                          style={{ color: entry.isActive ? 'var(--text-primary)' : 'var(--text-muted)' }}
                        >
                          {entry.isActive ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                        </button>
                      )}

                      {/* 內容區（pr-8 確保文字不蓋到右上角按鈕） */}
                      <div
                        className="pr-8 cursor-text"
                        onDoubleClick={() => setEditingDiaryId(entry.id)}
                        title="雙擊以編輯"
                      >
                        {/* 關鍵字標籤 */}
                        {(entry.keywords || []).length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-2">
                            {(entry.keywords || []).map((kw: string) => (
                              <span
                                key={kw}
                                className="text-xs px-1.5 py-0.5 rounded-full border flex-shrink-0"
                                style={
                                  scanKeywords([kw])
                                    ? {
                                        background: 'color-mix(in srgb, var(--bg-sys-tag) 60%, transparent)',
                                        borderColor: 'color-mix(in srgb, var(--text-primary) 50%, transparent)',
                                        color: 'var(--text-body)',
                                      }
                                    : {
                                        background: 'color-mix(in srgb, var(--bg-elevated) 60%, transparent)',
                                        borderColor: 'color-mix(in srgb, var(--border-default) 40%, transparent)',
                                        color: 'var(--text-body)',
                                      }
                                }
                              >
                                {kw}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* 日記內容 */}
                        <div className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text-body)' }}>
                          {entry.text || (
                            <span className="italic" style={{ color: 'var(--text-muted)' }}>雙擊以新增內容...</span>
                          )}
                        </div>
                      </div>

                      {/* 融合來源展開按鈕 */}
                      {isMergedEntry && (
                        <button
                          onClick={() => setExpandedMergedIds(prev =>
                            prev.includes(entry.id) ? prev.filter(id => id !== entry.id) : [...prev, entry.id]
                          )}
                          className="flex items-center text-xs mt-2 transition"
                          style={{ color: 'var(--text-muted)' }}
                          onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-body)'; }}
                          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; }}
                        >
                          {isExpanded ? <ChevronDown className="w-3 h-3 mr-1" /> : <ChevronRight className="w-3 h-3 mr-1" />}
                          {isExpanded ? '收起來源' : '檢視來源'}
                        </button>
                      )}
                    </>
                  )}
                </div>

                {isMergedEntry && isExpanded && sourceDiaries.length > 0 && (
                  <div
                    className="ml-8 pl-4 border-l-2 space-y-2"
                    style={{ borderLeftColor: 'var(--border-accent)' }}
                  >
                    {sourceDiaries.map(sourceEntry => (
                      <div
                        key={`source-${sourceEntry.id}`}
                        className="rounded-xl p-3 border border-white/5 opacity-60"
                        style={{ background: panelBgDim }}
                      >
                        <div className="text-xs whitespace-pre-wrap" style={{ color: 'var(--text-body)' }}>
                          {sourceEntry.text}
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
              目前沒有任何日記。<br/>點擊上方按鈕新增，或使用水晶球自動生成。
            </div>
          )}
          {diaryEntries.length > 0 && diarySearch.trim() !== '' &&
            diaryEntries.filter(e => !e.isMerged).filter(e => {
              const q = diarySearch.toLowerCase();
              return e.content?.toLowerCase().includes(q) || e.keywords?.some(k => k.toLowerCase().includes(q));
            }).length === 0 && (
            <div className="text-center py-10 italic" style={{ color: 'var(--text-muted)' }}>
              找不到符合「{diarySearch}」的日記。
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
