import React, { useState } from 'react';
import { BookOpen, Plus, Search, CheckSquare, Square, Trash2 } from 'lucide-react';

import { LorebookEntry } from '../types';

interface LorebookModalProps {
  isOpen: boolean;
  onClose: () => void;
  lorebookEntries: LorebookEntry[];
  onAddLorebook: (category: string) => number;
  onUpdateLorebook: (id: number, updates: Partial<LorebookEntry>) => void;
  onDeleteLorebook: (id: number) => void;
  onLorebookKeywordAdd: (id: number, field: 'keywords' | 'secondaryKeys', keyword: string) => void;
  onLorebookKeywordRemove: (id: number, field: 'keywords' | 'secondaryKeys', keyword: string) => void;
  showToast: (msg: string) => void;
}

export const LorebookModal: React.FC<LorebookModalProps> = ({
  isOpen,
  onClose,
  lorebookEntries,
  onAddLorebook,
  onUpdateLorebook,
  onDeleteLorebook,
  onLorebookKeywordAdd,
  onLorebookKeywordRemove,
  showToast,
}) => {
  const [editingLorebookId, setEditingLorebookId] = useState<number | null>(null);
  const [lorebookFilter, setLorebookFilter] = useState<string>('地點');
  const [lorebookSearch, setLorebookSearch] = useState<string>('');

  if (!isOpen) return null;

  const handleAdd = () => {
    const newId = onAddLorebook(lorebookFilter);
    setEditingLorebookId(newId);
  };

  const handleDelete = (id: number) => {
    onDeleteLorebook(id);
    if (editingLorebookId === id) setEditingLorebookId(null);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#24282d]/70 backdrop-blur-xl w-full max-w-3xl rounded-[8px] shadow-[0_0_40px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden text-[#fbf5e4] border border-white/10 relative h-[85vh]">
        <div className="p-4 border-b border-white/5 flex justify-between items-center bg-[#24282d]/50">
          <div className="flex items-center">
            <h2 className="text-lg font-bold flex items-center text-[#fde68a]"><BookOpen className="w-5 h-5 mr-2 text-[#fde68a]" /> 世界觀與設定集</h2>
            <span className="ml-4 text-xs text-[#e8e8e9]">勾選的項目將會被 AI 讀取並作為背景知識</span>
          </div>
          <button 
            className="text-[var(--text3)] hover:text-[#fbf5e4] transition"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        
        <div className="p-4 border-b border-white/5 bg-[#24282d]/30 flex gap-3 items-center">
          <button 
            onClick={handleAdd}
            className="bg-[#1044ab] hover:bg-[#1a56db] active:bg-[#2563eb] backdrop-blur-sm border border-white/10 hover:border-white/20 text-[#fbf5e4] px-4 h-8 rounded-[8px] flex items-center transition shadow-[0_4px_12px_rgba(16,68,171,0.2)]"
          >
            <Plus className="w-4 h-4 mr-2" /> 新增設定
          </button>
          
          <div className="flex-1 max-w-xs relative ml-4">
            <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-[var(--text3)]" />
            <input
              type="text"
              placeholder="搜尋設定..."
              value={lorebookSearch}
              onChange={(e) => setLorebookSearch(e.target.value)}
              className="w-full bg-[#24282d]/50 backdrop-blur-sm border border-white/10 rounded-[8px] h-8 pl-9 pr-3 text-sm text-[#fbf5e4] focus:border-[#fde68a]/50 focus:shadow-[0_0_15px_rgba(99,102,241,0.2)] outline-none transition"
            />
          </div>

          <div className="flex bg-[#24282d]/50 border border-white/10 rounded-[8px] overflow-hidden ml-auto">
            {['地點', 'NPC', '怪物', '物品', '歷史', '其他'].map((cat, idx) => {
              let customStyle = "";
              if (idx === 0) customStyle = "text-[14px] h-8 text-center font-normal leading-[14px]";
              else if (idx === 1) customStyle = "text-[14px] leading-[14px] font-normal text-[#fbf5e4]";
              else if (idx === 2) customStyle = "text-[14px] leading-[14px] font-bold text-[#fbf5e4]";
              else if (idx === 3) customStyle = "text-[14px] leading-[14px] font-bold text-[#fbf5e4]";
              else if (idx === 4) customStyle = "text-[14px] leading-[14px] text-[#fbf5e4]";
              else if (idx === 5) customStyle = "text-[14px] leading-[14px] text-[#fbf5e4]";

              return (
                <button
                  key={cat}
                  onClick={() => setLorebookFilter(cat)}
                  className={`px-4 py-2 transition ${
                    lorebookFilter === cat 
                      ? 'bg-[#1044ab] text-[#fbf5e4] shadow-[0_4px_12px_rgba(16,68,171,0.2)]'
                      : 'text-[var(--text3)] hover:bg-[#1a56db] hover:text-[#fbf5e4]'
                  } ${customStyle}`}
                >
                  {cat}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {lorebookEntries
            .filter(entry => entry.category === lorebookFilter)
            .filter(entry => {
              if (!lorebookSearch.trim()) return true;
              const searchLower = lorebookSearch.toLowerCase();
              return (
                (entry.title && entry.title.toLowerCase().includes(searchLower)) ||
                (entry.content && entry.content.toLowerCase().includes(searchLower)) ||
                (entry.job && entry.job.toLowerCase().includes(searchLower)) ||
                (entry.appearance && entry.appearance.toLowerCase().includes(searchLower)) ||
                (entry.personality && entry.personality.toLowerCase().includes(searchLower)) ||
                (entry.other && entry.other.toLowerCase().includes(searchLower))
              );
            })
            .map((entry, index) => {
              let cardStyle = "rounded-[10px]";
              if (index < 3) cardStyle = "rounded-[8px] border-2";
              
              return (
                <div key={entry.id} className={`bg-[#24282d]/50 backdrop-blur-sm border ${entry.isActive ? 'border-[#fde68a]/50' : 'border-white/5'} ${cardStyle} p-4 flex gap-3 transition-colors`}>
                  <button 
                    onClick={() => onUpdateLorebook(entry.id, { isActive: !entry.isActive })}
                    className={`mt-1 flex-shrink-0 ${entry.isActive ? 'text-[#fde68a]' : 'text-[var(--text3)] hover:text-[var(--text3)]'}`}
                    title={entry.isActive ? "AI 將會讀取此設定" : "AI 不會讀取此設定"}
                  >
                    {entry.isActive ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
                  </button>
                  
                  <div className="flex-1 flex flex-col">
                    {editingLorebookId === entry.id ? (
                      <div className="flex flex-col space-y-3 rounded-[8px]">
                        <div className="flex gap-3">
                          <input 
                            type="text"
                            value={entry.title}
                            onChange={(e) => onUpdateLorebook(entry.id, { title: e.target.value })}
                            className="flex-1 bg-[#24282d]/50 backdrop-blur-sm border border-white/10 rounded-[8px] p-2.5 text-sm text-[#fbf5e4] font-bold focus:border-[#fde68a]/50 focus:shadow-[0_0_15px_rgba(99,102,241,0.2)] outline-none transition"
                            placeholder="設定標題..."
                          />
                      <select
                        value={entry.category}
                        onChange={(e) => onUpdateLorebook(entry.id, { category: e.target.value })}
                        className="bg-[#24282d]/50 backdrop-blur-sm border border-white/10 rounded-[8px] p-2.5 text-sm text-[#fbf5e4] focus:border-[#fde68a]/50 focus:shadow-[0_0_15px_rgba(99,102,241,0.2)] outline-none transition w-32"
                      >
                        <option value="地點">地點</option>
                        <option value="NPC">NPC</option>
                        <option value="怪物">怪物</option>
                        <option value="物品">物品</option>
                        <option value="歷史">歷史</option>
                        <option value="其他">其他</option>
                      </select>
                    </div>
                    {entry.category === 'NPC' ? (
                      <div className="flex flex-col space-y-2 mt-2">
                        <input
                          type="text"
                          value={entry.job || ''}
                          onChange={(e) => onUpdateLorebook(entry.id, { job: e.target.value })}
                          className="w-full bg-[#24282d]/50 backdrop-blur-sm border border-white/10 rounded-[8px] p-3 text-sm text-[#fbf5e4] focus:border-[#fde68a]/50 focus:shadow-[0_0_15px_rgba(99,102,241,0.2)] outline-none transition"
                          placeholder="職業..."
                        />
                        <textarea
                          value={entry.appearance || ''}
                          onChange={(e) => onUpdateLorebook(entry.id, { appearance: e.target.value })}
                          className="w-full bg-[#24282d]/50 backdrop-blur-sm border border-white/10 rounded-[8px] p-3 text-sm text-[#fbf5e4] focus:border-[#fde68a]/50 focus:shadow-[0_0_15px_rgba(99,102,241,0.2)] outline-none transition resize-none h-20"
                          placeholder="外貌描述..."
                        />
                        <textarea
                          value={entry.personality || ''}
                          onChange={(e) => onUpdateLorebook(entry.id, { personality: e.target.value })}
                          className="w-full bg-[#24282d]/50 backdrop-blur-sm border border-white/10 rounded-[8px] p-3 text-sm text-[#fbf5e4] focus:border-[#fde68a]/50 focus:shadow-[0_0_15px_rgba(99,102,241,0.2)] outline-none transition resize-none h-20"
                          placeholder="個性描述..."
                        />
                        <textarea
                          value={entry.other || ''}
                          onChange={(e) => onUpdateLorebook(entry.id, { other: e.target.value })}
                          className="w-full bg-[#24282d]/50 backdrop-blur-sm border border-white/10 rounded-[8px] p-3 text-sm text-[#fbf5e4] focus:border-[#fde68a]/50 focus:shadow-[0_0_15px_rgba(99,102,241,0.2)] outline-none transition resize-none h-20"
                          placeholder="其他..."
                        />
                      </div>
                    ) : (
                      <textarea 
                        value={entry.content}
                        onChange={(e) => onUpdateLorebook(entry.id, { content: e.target.value })}
                        className="w-full bg-[#24282d]/50 backdrop-blur-sm border border-white/10 rounded-[8px] p-3 text-sm text-[#fbf5e4] focus:border-[#fde68a]/50 focus:shadow-[0_0_15px_rgba(99,102,241,0.2)] outline-none transition resize-none min-h-[100px]"
                        placeholder="寫下詳細設定內容..."
                        autoFocus
                        onFocus={(e) => {
                          e.currentTarget.style.height = 'auto';
                          e.currentTarget.style.height = e.currentTarget.scrollHeight + 'px';
                        }}
                      />
                    )}
                    {/* ── 觸發關鍵字區塊 ── */}
                    <div className="bg-[#24282d]/60 rounded-[8px] p-3 border border-white/5 space-y-3">
                      
                      <div>
                        <div className="text-[12px] text-[#e8e8e9] mb-1.5 uppercase tracking-wider">
                          主關鍵字 <span className="text-[#e8e8e9] normal-case">（OR，任一命中即觸發；空白 = 依地點/NPC規則）</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5 mb-1.5">
                          {(entry.keywords || []).map((kw: string) => (
                            <span key={kw} className="flex items-center gap-1 bg-indigo-900/50 border border-[#fde68a]/40 text-[#e8e8e9] text-xs px-2 py-0.5 rounded-full">
                              {kw}
                              <button onClick={() => onLorebookKeywordRemove(entry.id, 'keywords', kw)} className="text-[#fde68a] hover:text-rose-400 transition leading-none">×</button>
                            </span>
                          ))}
                        </div>
                        <input type="text" placeholder="輸入後按 Enter..."
                          className="w-full bg-[#132540]/50 border border-white/10 rounded-[8px] px-3 py-1.5 text-xs text-[#fbf5e4] outline-none focus:border-[#fde68a]/50 transition"
                          onKeyDown={(e) => { if (e.key === 'Enter') { onLorebookKeywordAdd(entry.id, 'keywords', e.currentTarget.value); e.currentTarget.value = ''; }}} />
                      </div>

                      <div>
                        <div className="flex items-center gap-2 mb-1.5">
                          <button
                            onClick={() => onUpdateLorebook(entry.id, { selective: !entry.selective })}
                            className={`text-[12px] px-2 py-0.5 rounded-full border transition ${entry.selective ? 'bg-[#1044ab] border-[#1a56db] text-white' : 'bg-[#1044ab]/50 border-[#283b57]/40 text-[#e8e8e9]'}`}
                          >
                            AND 邏輯 {entry.selective ? '開' : '關'}
                          </button>
                          <span className="text-[12px] text-[#e8e8e9]">開啟時，主關鍵字 AND 次要關鍵字都要命中</span>
                        </div>
                        {entry.selective && (
                          <>
                            <div className="flex flex-wrap gap-1.5 mb-1.5">
                              {(entry.secondaryKeys || []).map((kw: string) => (
                                <span key={kw} className="flex items-center gap-1 bg-amber-900/50 border border-amber-500/40 text-amber-300 text-xs px-2 py-0.5 rounded-full">
                                  {kw}
                                  <button onClick={() => onLorebookKeywordRemove(entry.id, 'secondaryKeys', kw)} className="text-[#fde68a] hover:text-rose-400 transition leading-none">×</button>
                                </span>
                              ))}
                            </div>
                            <input type="text" placeholder="次要關鍵字，輸入後按 Enter..."
                              className="w-full bg-[#132540]/50 border border-white/10 rounded-[8px] px-3 py-1.5 text-xs text-[#e8e8e9] outline-none focus:border-amber-500/50 transition"
                              onKeyDown={(e) => { if (e.key === 'Enter') { onLorebookKeywordAdd(entry.id, 'secondaryKeys', e.currentTarget.value); e.currentTarget.value = ''; }}} />
                          </>
                        )}
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="text-[12px] text-[#e8e8e9] uppercase tracking-wider whitespace-nowrap">注入順序</span>
                        <input
                          type="number" min={0} max={999}
                          value={entry.insertionOrder ?? 100}
                          onChange={(e) => onUpdateLorebook(entry.id, { insertionOrder: parseInt(e.target.value) || 0 })}
                          className="w-20 bg-[#132540]/50 border border-white/10 rounded-[8px] px-2 py-1 text-xs text-[#fbf5e4] outline-none focus:border-[#fde68a]/50 transition text-center"
                        />
                        <span className="text-[12px] text-[#e8e8e9]">數字越小越先注入（0–999）</span>
                      </div>
                    </div>

                    <div className="flex justify-end mt-2">
                      <button 
                        onClick={() => {
                          setEditingLorebookId(null);
                          showToast('已儲存設定');
                        }}
                        className="text-xs bg-[#1044ab] hover:bg-[#1a56db] active:bg-[#2563eb] backdrop-blur-sm text-[#fbf5e4] px-4 py-1.5 rounded-[8px] transition shadow-[0_4px_12px_rgba(16,68,171,0.2)]"
                      >
                        儲存
                      </button>
                    </div>
                  </div>
                ) : (
                  <div 
                    onDoubleClick={() => setEditingLorebookId(entry.id)}
                    className="cursor-pointer group"
                    title="雙擊以編輯"
                  >
                    <div className="flex items-center mb-1">
                      <span className={`text-xs px-2 py-0.5 rounded-[8px] mr-2 ${
                        entry.category === '地點' ? 'bg-zinc-900/40 text-zinc-400' :
                        entry.category === 'NPC' ? 'bg-pink-900/40 text-[#e62c6d]' :
                        entry.category === '怪物' ? 'bg-orange-900/40 text-orange-400' :
                        entry.category === '物品' ? 'bg-blue-900/40 text-blue-400' :
                        entry.category === '歷史' ? 'bg-violet-900/40 text-violet-400' :
                        'bg-[#132540] text-[#e8e8e9]'
                      }`}>
                        {entry.category}
                      </span>
                      <h3 className={`font-bold ${!entry.isActive ? 'text-[var(--text3)]' : 'text-[#fbf5e4]'}`}>{entry.title || '未命名設定'}</h3>
                    </div>
                    {entry.category === 'NPC' ? (
                      <div className={`text-sm leading-relaxed whitespace-pre-wrap p-2 rounded-[8px] group-hover:bg-white/5 transition space-y-1 ${!entry.isActive ? 'text-[#e8e8e9]' : 'text-[#e8e8e9]'}`}>
                        {entry.job && <div><span className="font-medium text-[#e8e8e9]">職業：</span>{entry.job}</div>}
                        {entry.appearance && <div><span className="font-medium text-[#e8e8e9]">外貌：</span>{entry.appearance}</div>}
                        {entry.personality && <div><span className="font-medium text-[#e8e8e9]">個性：</span>{entry.personality}</div>}
                        {entry.other && <div><span className="font-medium text-[#e8e8e9]">其他：</span>{entry.other}</div>}
                        {!entry.job && !entry.appearance && !entry.personality && !entry.other && <span className="text-[#283b57] italic">雙擊以新增內容...</span>}
                      </div>
                    ) : (
                      <div className={`text-sm leading-relaxed whitespace-pre-wrap p-2 rounded-[8px] group-hover:bg-white/5 transition ${!entry.isActive ? 'text-[#e8e8e9]' : 'text-[#e8e8e9]'}`}>
                        {entry.content || <span className="text-[#283b57] italic">雙擊以新增內容...</span>}
                      </div>
                    )}
                    {((entry.keywords || []).length > 0 || (entry.secondaryKeys || []).length > 0) && (
                      <div className="flex flex-wrap gap-1 mt-1.5 px-2">
                        {(entry.keywords || []).map((kw: string) => (
                          <span key={kw} className="text-xs px-1.5 py-0.5 rounded-full bg-indigo-900/40 border border-[#fde68a]/30 text-[#e8e8e9]">{kw}</span>
                        ))}
                        {entry.selective && (entry.secondaryKeys || []).map((kw: string) => (
                          <span key={kw} className="text-xs px-1.5 py-0.5 rounded-full bg-amber-900/40 border border-amber-500/30 text-[#e8e8e9]">+{kw}</span>
                        ))}
                        {entry.insertionOrder !== undefined && entry.insertionOrder !== 100 && (
                          <span className="text-xs px-1.5 py-0.5 rounded-full bg-[#132540] border border-[#283b57]/40 text-[#e8e8e9]">#{entry.insertionOrder}</span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
              
              <button 
                onClick={() => handleDelete(entry.id)}
                className="mt-1 text-[var(--text3)] hover:text-rose-400 transition flex-shrink-0"
                title="刪除"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          );
        })}
          {lorebookEntries.filter(entry => entry.category === lorebookFilter).length === 0 && (
            <div className="text-center text-[#e8e8e9] py-10">此分類尚無設定</div>
          )}
        </div>
      </div>
    </div>
  );
};
