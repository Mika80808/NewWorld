import React, { useState } from 'react';
import { BookOpen, Plus, Search, CheckSquare, Square, Trash2, Heart } from 'lucide-react';

import { LorebookEntry, Npc } from '../types';

function affectionColor(affection: number): string {
  if (affection < 0)   return 'var(--affection-hostile)';
  if (affection < 50)  return 'var(--affection-low)';
  if (affection < 80)  return 'var(--affection-mid)';
  if (affection < 100) return 'var(--affection-high)';
  return 'var(--affection-max)';
}

interface LorebookModalProps {
  isOpen: boolean;
  onClose: () => void;
  lorebookEntries: LorebookEntry[];
  npcs: Npc[];
  onAddLorebook: (category: string) => number;
  onUpdateLorebook: (id: number, updates: Partial<LorebookEntry>) => void;
  onDeleteLorebook: (id: number) => void;
  onLorebookKeywordAdd: (id: number, field: 'keywords' | 'secondaryKeys', keyword: string) => void;
  onLorebookKeywordRemove: (id: number, field: 'keywords' | 'secondaryKeys', keyword: string) => void;
  onSelectNpc: (npc: Npc) => void;
  showToast: (msg: string) => void;
}

export const LorebookModal: React.FC<LorebookModalProps> = ({
  isOpen,
  onClose,
  lorebookEntries,
  npcs,
  onAddLorebook,
  onUpdateLorebook,
  onDeleteLorebook,
  onLorebookKeywordAdd,
  onLorebookKeywordRemove,
  onSelectNpc,
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
      <div className="bg-[#24282d]/70 backdrop-blur-xl w-full max-w-3xl rounded-[8px] shadow-[0_0_40px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden text3-[#b7b4ae] border border-white/10 relative h-[85vh]">
        <div className="p-4 border-b border-white/5 flex justify-between items-center bg-[#24282d]/50">
          <div className="flex items-center">
            <h2 className="text-lg font-bold flex items-center text-[#fde68a]"><BookOpen className="w-5 h-5 mr-2 text-[#fde68a]" /> 世界觀與設定集</h2>
            <span className="ml-4 text-xs text3-[#b7b4ae]">勾選的項目將會被 AI 讀取並作為背景知識</span>
          </div>
          <button 
            className="text-[var(--text3)] hover:text-[#fbf5e4] transition"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        
        <div className="px-4 pt-3 pb-0 border-b border-white/5 bg-[#24282d]/30 space-y-2">
          {/* 第一行：搜尋欄（左）＋ +新增（右） */}
          <div className="flex gap-2 items-center">
            <div className="flex-1 relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-[var(--text3)]" />
              <input
                type="text"
                placeholder="搜尋..."
                value={lorebookSearch}
                onChange={(e) => setLorebookSearch(e.target.value)}
                className="w-full bg-[#24282d]/50 backdrop-blur-sm border border-white/10 rounded-[8px] h-9 pl-9 pr-3 text-sm text3-[#fbf5e4] focus:border-[#fde68a]/50 outline-none transition"
              />
            </div>
            <button
              onClick={handleAdd}
              className="bg-[#1044ab] hover:bg-[#1a56db] active:bg-[#2563eb] backdrop-blur-sm border border-white/10 hover:border-white/20 text-[#fbf5e4] px-4 h-9 rounded-[8px] flex items-center gap-1.5 transition shadow-[0_4px_12px_rgba(16,68,171,0.2)] shrink-0"
            >
              <Plus className="w-4 h-4" /> 新增
            </button>
          </div>
          {/* 第二行：分類 tabs */}
          <div className="flex bg-[#24282d]/50 border border-white/10 rounded-t-[8px] overflow-hidden">
            {['地點', 'NPC', '怪物', '物品', '歷史', '其他'].map((cat) => (
              <button
                key={cat}
                onClick={() => setLorebookFilter(cat)}
                className={`flex-1 px-3 py-2 text-[13px] leading-[13px] transition ${
                  lorebookFilter === cat
                    ? 'bg-[#1044ab] text-[#fbf5e4] shadow-[0_4px_12px_rgba(16,68,171,0.2)]'
                    : 'text-[var(--text3)] hover:bg-[#1a56db] hover:text-[#fbf5e4]'
                }`}
              >
                {cat === 'NPC' ? '人物' : cat}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">

          {/* ── NPC 人物：2 欄卡片 Grid ── */}
          {lorebookFilter === 'NPC' ? (() => {
            const filtered = lorebookEntries
              .filter(e => e.category === 'NPC')
              .filter(e => {
                if (!lorebookSearch.trim()) return true;
                const s = lorebookSearch.toLowerCase();
                return (
                  (e.title && e.title.toLowerCase().includes(s)) ||
                  (e.job && e.job.toLowerCase().includes(s)) ||
                  (e.race && e.race.toLowerCase().includes(s)) ||
                  (e.gender && e.gender.toLowerCase().includes(s)) ||
                  (e.appearance && e.appearance.toLowerCase().includes(s)) ||
                  (e.personality && e.personality.toLowerCase().includes(s)) ||
                  (e.backstory && e.backstory.toLowerCase().includes(s)) ||
                  (e.other && e.other.toLowerCase().includes(s))
                );
              });

            if (filtered.length === 0) {
              return <div className="text-center text-[var(--text3)] py-10 italic">此分類尚無設定</div>;
            }

            return (
              <div className="grid grid-cols-2 gap-3">
                {filtered.map(entry => {
                  const npcData = npcs.find(n => n.name === entry.title);
                  const affection = npcData?.affection ?? 0;
                  const relationship = npcData?.relationship ?? '';

                  const handleCardClick = () => {
                    const target = npcData ?? {
                      id: -(entry.id),
                      name: entry.title,
                      job: entry.job ?? '',
                      affection: 0,
                      affectionLabel: '陌生人',
                      appearance: entry.appearance ?? '',
                      personality: entry.personality ?? '',
                      gender: entry.gender,
                      race: entry.race,
                      backstory: entry.backstory,
                      category: 'NPC',
                      isActive: entry.isActive,
                      memories: [],
                      thoughts: [],
                    };
                    onSelectNpc(target as Npc);
                  };

                  return (
                    <div
                      key={entry.id}
                      onClick={handleCardClick}
                      className="bg2-[#303438]/70 border border-white/10 rounded-[8px] px-4 py-3 cursor-pointer hover:bg2-[#303438] hover:border-white/20 transition-colors shadow-sm select-none"
                    >
                      {/* 第一行：名字 + 種族性別 + 愛心好感度 + 勾選框 */}
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div className="flex items-baseline gap-1.5 flex-1 min-w-0">
                          <span className="text-[17px] font-bold text-[#fbf5e4] leading-tight" style={{ fontFamily: 'Georgia, serif' }}>
                            {entry.title || '未命名'}
                          </span>
                          {(entry.race || entry.gender) && (
                            <span className="text-[11px] text-[var(--text3)] shrink-0 leading-tight">
                              {[entry.race, entry.gender].filter(Boolean).join(' ')}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span
                            className="flex items-center gap-0.5 text-sm font-semibold"
                            style={{ color: affectionColor(affection) }}
                          >
                            <Heart className="w-3.5 h-3.5 fill-current" />
                            {affection}
                          </span>
                          <button
                            onClick={(e) => { e.stopPropagation(); onUpdateLorebook(entry.id, { isActive: !entry.isActive }); }}
                            className="transition"
                            title={entry.isActive ? 'AI 將讀取此設定' : 'AI 不讀取此設定'}
                          >
                            {entry.isActive
                              ? <CheckSquare className="w-4 h-4 text-[#fde68a]" />
                              : <Square className="w-4 h-4 text-[var(--text3)]" />}
                          </button>
                        </div>
                      </div>

                      {/* 第二行：職業（左）＋關係（右） */}
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-[var(--text2)]">{entry.job ?? npcData?.job ?? ''}</span>
                        <span className="text-xs text-[var(--text3)]">{relationship}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })() : lorebookFilter === '地點' ? (() => {
            const filtered = lorebookEntries
              .filter(e => e.category === '地點')
              .filter(e => {
                if (!lorebookSearch.trim()) return true;
                const s = lorebookSearch.toLowerCase();
                return (
                  (e.title && e.title.toLowerCase().includes(s)) ||
                  (e.content && e.content.toLowerCase().includes(s))
                );
              });

            if (filtered.length === 0) {
              return <div className="text-center text-[var(--text3)] py-10 italic">此分類尚無設定</div>;
            }

            return (
              <div className="grid grid-cols-2 gap-3">
                {filtered.map(entry => {
                  const isEditing = editingLorebookId === entry.id;

                  if (isEditing) {
                    return (
                      <div key={entry.id} className="col-span-2 bg-[#24282d]/60 border border-[#fde68a]/30 rounded-[8px] p-4 space-y-3">
                        {/* 地名 */}
                        <input
                          type="text"
                          value={entry.title}
                          onChange={(e) => onUpdateLorebook(entry.id, { title: e.target.value })}
                          className="w-full bg2-[#303438]/60 border border-white/10 rounded-[8px] p-2.5 text-sm font-bold text-[#fbf5e4] focus:border-[#fde68a]/50 outline-none transition"
                          placeholder="地點名稱..."
                        />
                        {/* 簡介 */}
                        <textarea
                          value={entry.content}
                          onChange={(e) => onUpdateLorebook(entry.id, { content: e.target.value })}
                          className="w-full bg2-[#303438]/60 border border-white/10 rounded-[8px] p-2.5 text-sm text-[#fbf5e4] focus:border-[#fde68a]/50 outline-none transition resize-none min-h-[80px]"
                          placeholder="一句簡介（例：湖畔小鎮，商旅往來頻繁。）"
                          autoFocus
                        />
                        {/* 關鍵字 */}
                        <div className="bg2-[#303438]/50 rounded-[8px] p-3 border border-white/5 space-y-2">
                          <div className="text-[11px] text-[var(--text3)] uppercase tracking-wider">主關鍵字</div>
                          <div className="flex flex-wrap gap-1.5">
                            {(entry.keywords || []).map((kw: string) => (
                              <span key={kw} className="flex items-center gap-1 bg-indigo-900/50 border border-[#fde68a]/40 text-[#e8e8e9] text-xs px-2 py-0.5 rounded-full">
                                {kw}
                                <button onClick={() => onLorebookKeywordRemove(entry.id, 'keywords', kw)} className="text-[#fde68a] hover:text-[var(--text3)] transition leading-none">×</button>
                              </span>
                            ))}
                          </div>
                          <input type="text" placeholder="輸入後按 Enter..."
                            className="w-full bg-[#24282d]/50 border border-white/10 rounded-[8px] px-3 py-1.5 text-xs text-[#fbf5e4] outline-none focus:border-[#fde68a]/50 transition"
                            onKeyDown={(e) => { if (e.key === 'Enter') { onLorebookKeywordAdd(entry.id, 'keywords', e.currentTarget.value); e.currentTarget.value = ''; }}} />
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-[var(--text3)] uppercase tracking-wider whitespace-nowrap">注入順序</span>
                            <input
                              type="number" min={0} max={999}
                              value={entry.insertionOrder ?? 100}
                              onChange={(e) => onUpdateLorebook(entry.id, { insertionOrder: parseInt(e.target.value) || 0 })}
                              className="w-16 bg-[#24282d]/50 border border-white/10 rounded-[8px] px-2 py-1 text-xs text-[#fbf5e4] outline-none focus:border-[#fde68a]/50 transition text-center"
                            />
                            <span className="text-[11px] text-[var(--text3)]">數字越小越先注入</span>
                          </div>
                        </div>
                        {/* 操作列 */}
                        <div className="flex justify-between items-center">
                          <button
                            onClick={() => handleDelete(entry.id)}
                            className="text-xs text-[var(--text3)] hover:text-[var(--danger)] transition flex items-center gap-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> 刪除
                          </button>
                          <button
                            onClick={() => { setEditingLorebookId(null); showToast('已儲存設定'); }}
                            className="text-xs bg-[#1044ab] hover:bg-[#1a56db] active:bg-[#2563eb] text-[#fbf5e4] px-4 py-1.5 rounded-[8px] transition shadow-[0_4px_12px_rgba(16,68,171,0.2)]"
                          >
                            儲存
                          </button>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={entry.id}
                      onClick={() => setEditingLorebookId(entry.id)}
                      className="bg2-[#303438]/70 border border-white/10 rounded-[8px] px-4 py-3 cursor-pointer hover:bg2-[#303438] hover:border-white/20 transition-colors shadow-sm select-none"
                    >
                      {/* 第一行：地名 + 勾選框 */}
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="text-[16px] font-bold text-[#fbf5e4] leading-tight truncate" style={{ fontFamily: 'Georgia, serif' }}>
                          {entry.title || '未命名地點'}
                        </span>
                        <button
                          onClick={(e) => { e.stopPropagation(); onUpdateLorebook(entry.id, { isActive: !entry.isActive }); }}
                          className="transition shrink-0"
                          title={entry.isActive ? 'AI 將讀取此設定' : 'AI 不讀取此設定'}
                        >
                          {entry.isActive
                            ? <CheckSquare className="w-4 h-4 text-[#fde68a]" />
                            : <Square className="w-4 h-4 text-[var(--text3)]" />}
                        </button>
                      </div>
                      {/* 第二行：一句簡介 */}
                      <p className="text-xs text-[var(--text2)] leading-relaxed line-clamp-2">
                        {entry.content || <span className="italic text-[var(--text3)]">點擊以新增簡介...</span>}
                      </p>
                    </div>
                  );
                })}
              </div>
            );
          })() : (
          <div className="space-y-3">
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
                (entry.other && entry.other.toLowerCase().includes(searchLower)) ||
                (entry.race && entry.race.toLowerCase().includes(searchLower)) ||
                (entry.backstory && entry.backstory.toLowerCase().includes(searchLower))
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
                          value={entry.gender || ''}
                          onChange={(e) => onUpdateLorebook(entry.id, { gender: e.target.value })}
                          className="w-full bg-[#24282d]/50 backdrop-blur-sm border border-white/10 rounded-[8px] p-3 text-sm text-[#fbf5e4] focus:border-[#fde68a]/50 focus:shadow-[0_0_15px_rgba(99,102,241,0.2)] outline-none transition"
                          placeholder="性別（男、女、無性別、不明⋯）"
                        />
                        <input
                          type="text"
                          value={entry.race || ''}
                          onChange={(e) => onUpdateLorebook(entry.id, { race: e.target.value })}
                          className="w-full bg-[#24282d]/50 backdrop-blur-sm border border-white/10 rounded-[8px] p-3 text-sm text-[#fbf5e4] focus:border-[#fde68a]/50 focus:shadow-[0_0_15px_rgba(99,102,241,0.2)] outline-none transition"
                          placeholder="種族（人類、精靈、獸人⋯）"
                        />
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
                          value={entry.backstory || ''}
                          onChange={(e) => onUpdateLorebook(entry.id, { backstory: e.target.value })}
                          className="w-full bg-[#24282d]/50 backdrop-blur-sm border border-white/10 rounded-[8px] p-3 text-sm text-[#fbf5e4] focus:border-[#fde68a]/50 focus:shadow-[0_0_15px_rgba(99,102,241,0.2)] outline-none transition resize-none h-20"
                          placeholder="背景故事（50 字以內）..."
                        />
                        <textarea
                          value={entry.other || ''}
                          onChange={(e) => onUpdateLorebook(entry.id, { other: e.target.value })}
                          className="w-full bg-[#24282d]/50 backdrop-blur-sm border border-white/10 rounded-[8px] p-3 text-sm text-[#fbf5e4] focus:border-[#fde68a]/50 focus:shadow-[0_0_15px_rgba(99,102,241,0.2)] outline-none transition resize-none h-20"
                          placeholder="其他備註..."
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
                          className="w-full bg2-[#303438]/50 border border-white/10 rounded-[8px] px-3 py-1.5 text-xs text-[#fbf5e4] outline-none focus:border-[#fde68a]/50 transition"
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
                              className="w-full bg2-[#303438]/50 border border-white/10 rounded-[8px] px-3 py-1.5 text-xs text-[#e8e8e9] outline-none focus:border-amber-500/50 transition"
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
                          className="w-20 bg2-[#303438]/50 border border-white/10 rounded-[8px] px-2 py-1 text-xs text-[#fbf5e4] outline-none focus:border-[#fde68a]/50 transition text-center"
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
                        'bg2-[#303438] text-[#e8e8e9]'
                      }`}>
                        {entry.category}
                      </span>
                      <h3 className={`font-bold ${!entry.isActive ? 'text-[var(--text3)]' : 'text-[#fbf5e4]'}`}>{entry.title || '未命名設定'}</h3>
                    </div>
                    {entry.category === 'NPC' ? (
                      <div className={`text-sm leading-relaxed whitespace-pre-wrap p-2 rounded-[8px] group-hover:bg-white/5 transition space-y-1 ${!entry.isActive ? 'text-[#e8e8e9]' : 'text-[#e8e8e9]'}`}>
                        {entry.gender && <div><span className="font-medium text-[#e8e8e9]">性別：</span>{entry.gender}</div>}
                        {entry.race && <div><span className="font-medium text-[#e8e8e9]">種族：</span>{entry.race}</div>}
                        {entry.job && <div><span className="font-medium text-[#e8e8e9]">職業：</span>{entry.job}</div>}
                        {entry.appearance && <div><span className="font-medium text-[#e8e8e9]">外貌：</span>{entry.appearance}</div>}
                        {entry.personality && <div><span className="font-medium text-[#e8e8e9]">個性：</span>{entry.personality}</div>}
                        {entry.backstory && <div><span className="font-medium text-[#e8e8e9]">背景：</span>{entry.backstory}</div>}
                        {entry.other && <div><span className="font-medium text-[#e8e8e9]">其他：</span>{entry.other}</div>}
                        {!entry.gender && !entry.race && !entry.job && !entry.appearance && !entry.personality && !entry.backstory && !entry.other && <span className="text-[#283b57] italic">雙擊以新增內容...</span>}
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
                          <span className="text-xs px-1.5 py-0.5 rounded-full bg2-[#303438] border border-[#283b57]/40 text-[#e8e8e9]">#{entry.insertionOrder}</span>
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
          )}
        </div>
      </div>
    </div>
  );
};
