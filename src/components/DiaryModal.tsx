import React, { useState } from 'react';
import { Book, CheckSquare, Square, Trash2, ChevronDown, ChevronRight, Edit3 } from 'lucide-react';

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
    setIsDiaryGenerating(true); // Using same loading state for simplicity
    await onMergeDiary(diaryMergeSelection);
    setDiaryMergeSelection([]);
    setIsDiaryMergeMode(false);
    setIsDiaryGenerating(false);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#0d1f3c]/70 backdrop-blur-xl w-full max-w-2xl rounded-[8px] shadow-[0_0_40px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden text-[#e2eaf8] border border-white/10 relative h-[80vh]">
        <div className="p-4 border-b border-white/5 flex justify-between items-center bg-[#0d1f3c]/50">
          <div className="flex items-center">
            <h2 className="text-lg font-bold flex items-center text-[#e6bf55]"><Book className="w-5 h-5 mr-2 text-[#e6bf55]" /> 日記與記憶</h2>
            <span className="ml-4 text-xs text-[#8ab4e8]">勾選的項目將會被 AI 讀取並帶入遊戲記憶中</span>
          </div>
          <button 
            className="text-[#3a5a8a] hover:text-[#e2eaf8] transition"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        
        <div className="p-4 border-b border-white/5 bg-[#0d1f3c]/50 flex gap-2">
          <button
            onClick={handleAddClick}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-[8px] bg-[#1e3a8a] hover:bg-[#1e40af] active:bg-[#1d4ed8] border border-white/10 transition text-sm font-medium text-[#e2eaf8] shadow-[0_4px_12px_rgba(30,58,138,0.2)]"
          >
            <span className="text-base">📝</span>
            <span>新增日記</span>
          </button>

          <button
            onClick={handleGenerateClick}
            disabled={isDiaryGenerating}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-[8px] border transition text-sm font-medium ${
              isDiaryGenerating 
                ? 'opacity-50 cursor-not-allowed bg-[#132540]/40 border-white/10' 
                : 'bg-[#312e81] hover:bg-[#3730a3] active:bg-[#4338ca] border-white/10 text-[#e2eaf8] shadow-[0_4px_12px_rgba(49,46,129,0.2)]'
            }`}
          >
            <span className={`text-base ${isDiaryGenerating ? 'animate-spin' : ''}`}>{isDiaryGenerating ? '⏳' : '🔮'}</span>
            <span>魔法日記</span>
          </button>

          <button
            onClick={() => {
              if (isDiaryMergeMode) {
                setIsDiaryMergeMode(false);
                setDiaryMergeSelection([]);
              } else {
                setIsDiaryMergeMode(true);
              }
            }}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-[8px] border transition text-sm font-medium ${
              isDiaryMergeMode 
                ? 'bg-[#2563eb] border-[#e6bf55]/50 text-[#e2eaf8] shadow-[0_0_15px_rgba(37,99,235,0.4)]' 
                : 'bg-[#1d4ed8] hover:bg-[#2563eb] active:bg-[#3b82f6] border-white/10 text-[#e2eaf8] shadow-[0_4px_12px_rgba(29,78,216,0.2)]'
            }`}
          >
            <span className="text-base">💫</span>
            <span>融合日記</span>
          </button>
        </div>

        {isDiaryMergeMode && (
          <div className="px-4 py-2 flex items-center justify-between bg-[#0d1f3c]/30 border-b border-white/5">
            <span className="text-xs text-[#8ab4e8]">
              已選 {diaryMergeSelection.length} 條{diaryMergeSelection.length >= 2 ? '，可融合' : '，請選 2 條以上'}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => { setIsDiaryMergeMode(false); setDiaryMergeSelection([]); }}
                className="text-xs px-3 py-1.5 rounded-xl bg-[#132540]/60 border border-white/10 text-[#8ab4e8] hover:bg-[#1a2e50]/60 transition"
              >
                取消
              </button>
              <button
                onClick={handleMergeClick}
                disabled={diaryMergeSelection.length < 2}
                className={`text-xs px-3 py-1.5 rounded-xl transition ${diaryMergeSelection.length >= 2 ? 'bg-[#2563eb] hover:bg-[#3b82f6] active:bg-[#60a5fa] text-[#e2eaf8] shadow-[0_0_15px_rgba(37,99,235,0.4)]' : 'bg-[#132540]/40 text-[#2a4a7f] cursor-not-allowed border border-white/5'}`}
              >
                確認融合
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {diaryEntries.filter(entry => !entry.isMerged).map(entry => {
            const isMergedEntry = entry.source === 'merged' && entry.mergedFrom && entry.mergedFrom.length > 0;
            const isExpanded = expandedMergedIds.includes(entry.id);
            const sourceDiaries = isMergedEntry
              ? diaryEntries.filter(e => entry.mergedFrom?.includes(e.id))
              : [];

            return (
            <React.Fragment key={entry.id}>
            <div className={`bg-[#0d1f3c]/50 backdrop-blur-sm border rounded-2xl p-4 flex flex-col transition-colors ${
              entry.source === 'merged' ? 'border-amber-500/30' :
              entry.isActive ? 'border-amber-500/50' : 'border-white/5'
            }`}>
              {/* Top Row: Checkbox, Keywords, and Actions */}
              <div className="flex justify-between items-center mb-3">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <button 
                    onClick={() => onToggleDiary(entry.id)}
                    className={`flex-shrink-0 ${entry.isActive ? 'text-[#e6bf55]' : 'text-[#8ab4e8] hover:text-[#8ab4e8]'}`}
                    title={entry.isActive ? "AI 將會讀取此記憶" : "AI 不會讀取此記憶"}
                  >
                    {entry.isActive ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
                  </button>
                  
                  {/* Keywords inline with checkbox */}
                  {(entry.keywords || []).length > 0 && editingDiaryId !== entry.id && (
                    <div className="flex flex-wrap gap-1 flex-1 min-w-0">
                      {(entry.keywords || []).map((kw: string) => (
                        <span key={kw} className={`text-xs px-1.5 py-0.5 rounded-full border flex-shrink-0 ${
                          scanKeywords([kw])
                            ? 'bg-indigo-900/60 border-[#e6bf55]/50 text-[#8ab4e8]'
                            : 'bg-[#132540]/60 border-[#2a4a7f]/40 text-[#8ab4e8]'
                        }`}>
                          {kw}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                
                <div className="flex items-center gap-3 flex-shrink-0 ml-2">
                  {isDiaryMergeMode && (
                    <button
                      onClick={() => setDiaryMergeSelection(prev =>
                        prev.includes(entry.id)
                          ? prev.filter(id => id !== entry.id)
                          : [...prev, entry.id]
                      )}
                      className={`${diaryMergeSelection.includes(entry.id) ? 'text-[#2563eb]' : 'text-[#2563eb] hover:text-[#8ab4e8]'}`}
                      title="選取以融合"
                    >
                      {diaryMergeSelection.includes(entry.id) ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
                    </button>
                  )}

                  {isMergedEntry && (
                    <button 
                      onClick={() => setExpandedMergedIds(prev => 
                        prev.includes(entry.id) ? prev.filter(id => id !== entry.id) : [...prev, entry.id]
                      )}
                      className="text-[#8ab4e8] hover:text-[#e6bf55] transition flex items-center text-xs"
                    >
                      {isExpanded ? <ChevronDown className="w-3 h-3 mr-1" /> : <ChevronRight className="w-3 h-3 mr-1" />}
                      {isExpanded ? '收起來源' : '檢視來源'}
                    </button>
                  )}
                  <button 
                    onClick={() => setEditingDiaryId(editingDiaryId === entry.id ? null : entry.id)}
                    className="text-[#8ab4e8] hover:text-[#e6bf55] transition"
                    title="編輯"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => onDeleteDiary(entry.id)}
                    className="text-[#8ab4e8] hover:text-rose-400 transition"
                    title="刪除"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Separator */}
              <div className="border-t border-white/5 mb-3"></div>
              
              <div className="flex-1">
                {editingDiaryId === entry.id ? (
                  <div className="flex flex-col gap-3">
                    <textarea 
                      value={entry.text}
                      onChange={(e) => onDiaryChange(entry.id, e.target.value)}
                      onInput={(e) => {
                        e.currentTarget.style.height = 'auto';
                        e.currentTarget.style.height = e.currentTarget.scrollHeight + 'px';
                      }}
                      placeholder="寫下你想讓 AI 記住的事件或設定..."
                      className={`w-full bg-[#0d1f3c]/50 backdrop-blur-sm resize-none outline-none text-sm min-h-[60px] p-3 rounded-xl border border-[#e6bf55]/50 focus:shadow-[0_0_15px_rgba(99,102,241,0.2)] transition ${entry.isActive ? 'text-[#e2eaf8]' : 'text-[#8ab4e8]'}`}
                      autoFocus
                      onFocus={(e) => {
                        e.currentTarget.style.height = 'auto';
                        e.currentTarget.style.height = e.currentTarget.scrollHeight + 'px';
                      }}
                    />

                    <div className="bg-[#0d1f3c]/50 rounded-xl p-3 border border-white/5">
                      <div className="text-xs text-[#8ab4e8] mb-2 uppercase tracking-wider">
                        觸發關鍵字 <span className="text-[#8ab4e8] normal-case">（空白 = 勾選後永遠注入）</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {(entry.keywords || []).map((kw: string) => (
                          <span key={kw} className="flex items-center gap-1 bg-indigo-900/50 border border-[#e6bf55]/40 text-[#8ab4e8] text-xs px-2 py-0.5 rounded-full">
                            {kw}
                            <button
                              onClick={() => onDiaryKeywordRemove(entry.id, kw)}
                              className="text-[#e6bf55] hover:text-rose-400 transition leading-none"
                            >×</button>
                          </span>
                        ))}
                      </div>
                      <input
                        type="text"
                        placeholder="輸入關鍵字後按 Enter..."
                        className="w-full bg-[#132540]/50 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-[#e2eaf8] outline-none focus:border-[#e6bf55]/50 transition"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                            onDiaryKeywordAdd(entry.id, e.currentTarget.value.trim());
                            e.currentTarget.value = '';
                          }
                        }}
                      />
                    </div>

                    <div className="flex justify-end">
                      <button 
                        onClick={() => {
                          setEditingDiaryId(null);
                        }}
                        className="w-24 h-9 flex items-center justify-center bg-[#1044ab] hover:bg-[#1044ab]/80 backdrop-blur-sm text-[#e2eaf8] text-sm rounded-[8px] transition shadow-[0_0_10px_rgba(16,68,171,0.2)]"
                      >
                        確認
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    onDoubleClick={() => setEditingDiaryId(entry.id)}
                    className={`w-full text-sm whitespace-pre-wrap cursor-text transition ${entry.isActive ? 'text-[#e2eaf8]' : 'text-[#8ab4e8]'}`}
                    title="雙擊以編輯"
                  >
                    {entry.text || <span className="text-[#2a4a7f] italic">雙擊以新增內容...</span>}
                  </div>
                )}
              </div>
            </div>

            {isMergedEntry && isExpanded && sourceDiaries.length > 0 && (
              <div className="ml-8 pl-4 border-l-2 border-amber-900/30 space-y-2">
                {sourceDiaries.map(sourceEntry => (
                  <div key={`source-${sourceEntry.id}`} className="bg-[#0d1f3c]/30 rounded-xl p-3 border border-white/5 opacity-60">
                    <div className="text-xs whitespace-pre-wrap text-[#8ab4e8]">
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
            <div className="text-center text-[#8ab4e8] py-10 italic">
              目前沒有任何日記。<br/>點擊上方按鈕新增，或使用水晶球自動生成。
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
