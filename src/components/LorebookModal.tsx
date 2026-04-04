import React, { useState, useMemo, useEffect } from 'react';
import { BookOpen, Plus, Search, CheckSquare, Square, Trash2, Heart, MoreHorizontal } from 'lucide-react';
import { LorebookEntry, Npc, Faction } from '../types';
import { debounce } from '../utils/debounce';

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
  onAddNpc: () => void;
  onUpdateLorebook: (id: number, updates: Partial<LorebookEntry>) => void;
  onDeleteLorebook: (id: number) => void;
  onLorebookKeywordAdd: (id: number, field: 'keywords' | 'secondaryKeys', keyword: string) => void;
  onLorebookKeywordRemove: (id: number, field: 'keywords' | 'secondaryKeys', keyword: string) => void;
  onSelectNpc: (npc: Npc) => void;
  showToast: (msg: string) => void;
  factions?: Faction[];
  onAddFaction?: (faction: Faction) => void;
  onUpdateFaction?: (id: number, updates: Partial<Faction>) => void;
  onUpdateFactionMembers?: (factionId: number, newNpcIds: number[]) => void;
}

const FACTION_PALETTE = ['#7F77DD', '#E24B4A', '#1D9E75', '#EF9F27', '#5f93d3', '#C47D3E', '#FF637E'];
function autoFactionColor(index: number) { return FACTION_PALETTE[index % FACTION_PALETTE.length]; }

type FactionFormData = { name: string; type: Faction['type']; description: string; color: string; homeId: string; };
const EMPTY_FACTION_FORM: FactionFormData = { name: '', type: 'guild', description: '', color: '#7F77DD', homeId: '' };

export const LorebookModal: React.FC<LorebookModalProps> = ({
  isOpen,
  onClose,
  lorebookEntries,
  npcs,
  onAddLorebook,
  onAddNpc,
  onUpdateLorebook,
  onDeleteLorebook,
  onLorebookKeywordAdd,
  onLorebookKeywordRemove,
  onSelectNpc,
  showToast,
  factions = [],
  onAddFaction,
  onUpdateFaction,
  onUpdateFactionMembers,
}) => {
  const [editingLorebookId, setEditingLorebookId] = useState<number | null>(null);
  const [lorebookFilter, setLorebookFilter] = useState<string>('地點');
  const [lorebookSearch, setLorebookSearch] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  // Faction tab state
  const [factionAction, setFactionAction] = useState<'add' | number | null>(null); // 'add' or faction.id for edit
  const [factionForm, setFactionForm] = useState<FactionFormData>(EMPTY_FACTION_FORM);
  const [factionMenuId, setFactionMenuId] = useState<number | null>(null); // three-dot menu
  const [pendingEditFactionId, setPendingEditFactionId] = useState<number | null>(null);

  useEffect(() => {
    if (pendingEditFactionId === null) return;
    const found = factions.find(f => f.id === pendingEditFactionId);
    if (found) {
      setFactionForm({
        name: found.name, type: found.type,
        description: found.description, color: found.color ?? '#7F77DD',
        homeId: found.homeId ? String(found.homeId) : '',
      });
      setFactionAction(pendingEditFactionId);
      setPendingEditFactionId(null);
    }
  }, [factions, pendingEditFactionId]);

  // ─── Phase 3: Debounced search (300ms delay) ─────────────────────────────────
  const debouncedSetSearch = useMemo(
    () => debounce((query: string) => {
      setDebouncedSearch(query);
    }, 300),
    []
  );

  const handleSearchChange = (query: string) => {
    setLorebookSearch(query);
    debouncedSetSearch(query);
  };

  if (!isOpen) return null;

  const handleAdd = () => {
    if (lorebookFilter === 'NPC') { onAddNpc(); return; }
    if (lorebookFilter === '勢力') {
      setFactionForm({ ...EMPTY_FACTION_FORM, color: autoFactionColor(factions.length) });
      setFactionAction('add');
      return;
    }
    const newId = onAddLorebook(lorebookFilter);
    setEditingLorebookId(newId);
  };

  const handleDelete = (id: number) => {
    onDeleteLorebook(id);
    if (editingLorebookId === id) setEditingLorebookId(null);
  };

  const inputStyle: React.CSSProperties = {
    background: 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)',
    borderColor: 'rgba(255,255,255,0.1)',
    color: 'var(--text-main)',
  };

  // ── 共用：關鍵字標籤 ────────────────────────────────────────────────────────
  const renderKeywordTag = (kw: string, onRemove: () => void, variant: 'primary' | 'amber') => {
    const bg = 'color-mix(in srgb, var(--bg-sys-tag) 30%, transparent)';
    const borderColor = 'color-mix(in srgb, var(--bg-sys-tag) 50%, transparent)';
    const removeColor = 'var(--btn--text)';

    return (
      <span
        key={kw}
        className="flex items-center gap-1 px-2 py-0.5 rounded-full border"
        style={{ fontSize: '12px', background: bg, borderColor, color: 'var(--text-body)' }}
      >
        {variant === 'amber' ? `+${kw}` : kw}
        <button
          onClick={onRemove}
          className="leading-none transition"
          style={{ color: removeColor }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-rose)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = removeColor; }}
        >
          ×
        </button>
      </span>
    );
  };

  // ── 共用：編輯底部操作 ──────────────────────────────────────────────────────
  const renderEditActions = (id: number) => (
    <div className="flex justify-between items-center pt-1">
      <button
        onClick={() => handleDelete(id)}
        className="text-sm flex items-center px-2 py-1.5 rounded-[8px] gap-1 transition border-1"
        style={{ color: 'var(--text-muted)', borderColor: 'var(--text-muted)' }}
        onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-danger)'; e.currentTarget.style.borderColor = 'var(--text-danger)'; }}
        onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--text-muted)'; }}
      >
        <Trash2 className="w-3.5 h-3.5" /> 刪除
      </button>
      <button
        onClick={() => setEditingLorebookId(null)}
        className="text-sm px-3 py-1.5 rounded-[8px] transition"
        style={{ background: 'var(--btn-primary)', color: 'var(--btn--text)' }}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--btn-primary-hover)'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'var(--btn-primary)'; }}
      >
        完成
      </button>
    </div>
  );

  // ── 共用：關鍵字區 ──────────────────────────────────────────────────────────
  const renderKeywordsSection = (entry: LorebookEntry, hint: string) => (
    <div>
      <div className="text-sm ml-3 mb-1.5 uppercase tracking-wider" style={{ color: 'var(--text-body)' }}>
        主關鍵字
        <span className="normal-case ml-1" style={{ color: 'var(--text-body)' }}>
          {hint}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5 mb-1.5">
        {(entry.keywords || []).map((kw: string) =>
          renderKeywordTag(kw, () => onLorebookKeywordRemove(entry.id, 'keywords', kw), 'primary')
        )}
      </div>
      <input
        type="text"
        placeholder="輸入後按 Enter..."
        className="w-full border border-white/10 rounded-[8px] px-3 py-1.5 text-sm outline-none transition"
        style={inputStyle}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            onLorebookKeywordAdd(entry.id, 'keywords', e.currentTarget.value);
            e.currentTarget.value = '';
          }
        }}
      />
    </div>
  );

  // ── 共用：AND 次要關鍵字區 ──────────────────────────────────────────────────
  const renderAndSection = (entry: LorebookEntry) => (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <button
          onClick={() => onUpdateLorebook(entry.id, { selective: !entry.selective })}
          className="text-[12px] px-2 py-0.5 rounded-full border transition"
          style={{
            background: entry.selective
              ? 'var(--btn-primary)'
              : 'color-mix(in srgb, var(--btn-primary) 50%, transparent)',
            borderColor: entry.selective
              ? 'var(--btn-primary-hover)'
              : 'color-mix(in srgb, var(--border-default) 40%, transparent)',
            color: 'var(--text-body)',
          }}
        >
          AND 邏輯 {entry.selective ? '✓' : '✗'}
        </button>
        <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
          次要關鍵字（AND 開啟時，主+次都需命中）
        </span>
      </div>
      {entry.selective && (
        <>
          <div className="flex flex-wrap gap-1.5 mb-1.5">
            {(entry.secondaryKeys || []).map((kw: string) =>
              renderKeywordTag(kw, () => onLorebookKeywordRemove(entry.id, 'secondaryKeys', kw), 'amber')
            )}
          </div>
          <input
            type="text"
            placeholder="輸入後按 Enter..."
            className="w-full border border-white/10 rounded-[8px] px-3 py-1.5 text-sm outline-none transition"
            style={inputStyle}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                onLorebookKeywordAdd(entry.id, 'secondaryKeys', e.currentTarget.value);
                e.currentTarget.value = '';
              }
            }}
          />
        </>
      )}
    </div>
  );

  // ── 通用 Grid 卡片（地點 / 怪物 / 物品 / 歷史 / 其他 共用） ──────────────
  const renderGenericGrid = (category: string) => {
    const filtered = lorebookEntries
      .filter(e => e.category === category)
      .filter(e => {
        if (!debouncedSearch.trim()) return true;
        const s = debouncedSearch.toLowerCase();
        return (
          (e.title   && e.title.toLowerCase().includes(s)) ||
          (e.content && e.content.toLowerCase().includes(s))
        );
      });

    if (filtered.length === 0) {
      return (
        <div className="text-center py-10 italic" style={{ color: 'var(--text-muted)' }}>
          此分類尚無設定
        </div>
      );
    }

    return (
      <div className="grid grid-cols-2 gap-3">
        {filtered.map(entry => {
          const isEditing = editingLorebookId === entry.id;
          const allKeywords = [
            ...(entry.keywords || []),
            ...(entry.selective ? (entry.secondaryKeys || []) : []),
          ];

          // ── 編輯模式（展開佔兩欄） ──────────────────────────────────────
          if (isEditing) {
            return (
              <div
                key={entry.id}
                className="col-span-2 rounded-[8px] p-4 space-y-3 border"
                style={{
                  background: 'color-mix(in srgb, var(--bg-elevated) 60%, transparent)',
                  borderColor: 'var(--border-accent)',
                }}
              >
                {/* 標題 + 分類 */}
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={entry.title}
                    onChange={e => onUpdateLorebook(entry.id, { title: e.target.value })}
                    className="flex-1 border border-white/10 rounded-[8px] p-2.5 text-sm font-bold outline-none transition"
                    style={inputStyle}
                    placeholder="設定標題..."
                  />
                  <select
                    value={entry.category}
                    onChange={e => onUpdateLorebook(entry.id, { category: e.target.value })}
                    className="border border-white/10 rounded-[8px] p-2.5 text-sm font-bold outline-none transition w-28"
                    style={inputStyle}
                  >
                    <option value="地點">地點</option>
                    <option value="NPC">NPC</option>
                    <option value="怪物">怪物</option>
                    <option value="物品">物品</option>
                    <option value="歷史">歷史</option>
                    <option value="其他">其他</option>
                  </select>
                </div>

                {/* 描述 */}
                <textarea
                  value={entry.content}
                  onChange={e => onUpdateLorebook(entry.id, { content: e.target.value })}
                  className="w-full border border-white/10 rounded-[8px] p-2.5 text-sm outline-none transition resize-y min-h-[80px]"
                  style={inputStyle}
                  placeholder="設定內容..."
                />

                {renderKeywordsSection(entry, '（OR，任一命中即觸發；空白 = 永遠注入）')}
                {renderAndSection(entry)}

                {/* 注入順序 */}
                <div className="flex items-center gap-2">
                  <span className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>注入順序</span>
                  <input
                    type="number"
                    value={entry.insertionOrder ?? 100}
                    onChange={e => onUpdateLorebook(entry.id, { insertionOrder: parseInt(e.target.value) || 100 })}
                    className="w-20 border border-white/10 rounded-[8px] px-2 py-1 text-sm outline-none transition"
                    style={inputStyle}
                  />
                  <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>（數字越小越先注入，預設 100）</span>
                </div>

                {renderEditActions(entry.id)}
              </div>
            );
          }

          // ── 檢視模式卡片 ─────────────────────────────────────────────────
          return (
            <div
              key={entry.id}
              onClick={() => setEditingLorebookId(entry.id)}
              className="backdrop-blur-sm rounded-[8px] p-3 cursor-pointer transition-colors border relative"
              style={{
                background: 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)',
                borderColor: 'var(--border-default)',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-accent)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-default)'; }}
            >
              {/* 左側內容：標題 + 關鍵字 + 敍述（預留右邊空間給勾選框） */}
              <div className="pr-8">
                {/* 標題（20px） */}
                <span className="text-lg font-bold leading-snug" style={{ color: 'var(--text-title)' }}>
                  {entry.title || '未命名'}
                </span>

                {/* 關鍵字膠囊（12px，有才顯示） */}
                {allKeywords.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1 mb-1.5">
                    {(entry.keywords || []).map(kw => (
                      <span
                        key={kw}
                        className="px-1.5 py-0.5 rounded-full border"
                        style={{
                          fontSize: '12px',
                          background: 'color-mix(in srgb, var(--bg-sys-tag) 30%, transparent)',
                          borderColor: 'color-mix(in srgb, var(--bg-sys-tag) 50%, transparent)',
                          color: 'var(--text-body)',
                        }}
                      >
                        {kw}
                      </span>
                    ))}
                    {entry.selective && (entry.secondaryKeys || []).map(kw => (
                      <span
                        key={kw}
                        className="px-1.5 py-0.5 rounded-full border"
                        style={{
                          fontSize: '12px',
                          background: 'color-mix(in srgb, var(--bg-sys-tag) 30%, transparent)',
                          borderColor: 'color-mix(in srgb, var(--bg-sys-tag) 50%, transparent)',
                          color: 'var(--text-body)',
                        }}
                      >
                        +{kw}
                      </span>
                    ))}
                  </div>
                )}

                {/* 描述文字（16px） */}
                <p className="leading-relaxed line-clamp-2 text-base" style={{ color: 'var(--text-body)' }}>
                  {entry.content || (
                    <span className="italic" style={{ color: 'var(--text-muted)' }}>點擊以新增簡介...</span>
                  )}
                </p>
              </div>

              {/* 右上角：勾選框（絕對定位） */}
              <button
                onClick={e => {
                  e.stopPropagation();
                  onUpdateLorebook(entry.id, { isActive: !entry.isActive });
                }}
                className="absolute top-3 right-3 shrink-0 transition"
                style={{ color: entry.isActive ? 'var(--text-primary)' : 'var(--text-muted)' }}
                title={entry.isActive ? 'AI 將讀取此設定' : 'AI 不讀取此設定'}
              >
                {entry.isActive
                  ? <CheckSquare className="w-4 h-4" />
                  : <Square className="w-4 h-4" />}
              </button>
            </div>
          );
        })}
      </div>
    );
  };

  // ── 地點 Grid ────────────────────────────────────────────────────────────────
  const renderLocationGrid = () => {
    const filtered = lorebookEntries
      .filter(e => e.category === '地點')
      .filter(e => {
        if (!lorebookSearch.trim()) return true;
        const s = lorebookSearch.toLowerCase();
        return (
          (e.title   && e.title.toLowerCase().includes(s)) ||
          (e.content && e.content.toLowerCase().includes(s))
        );
      });

    if (filtered.length === 0) {
      return (
        <div className="text-center py-10 italic" style={{ color: 'var(--text-muted)' }}>
          此分類尚無設定
        </div>
      );
    }

    return (
      <div className="grid grid-cols-2 gap-3">
        {filtered.map(entry => {
          const isEditing = editingLorebookId === entry.id;
          const allKeywords = [
            ...(entry.keywords || []),
            ...(entry.selective ? (entry.secondaryKeys || []) : []),
          ];

          if (isEditing) {
            return (
              <div
                key={entry.id}
                className="col-span-2 rounded-[8px] p-4 space-y-3 border"
                style={{
                  background: 'color-mix(in srgb, var(--bg-elevated) 60%, transparent)',
                  borderColor: 'var(--border-accent)',
                }}
              >
                {/* 地名 */}
                <input
                  type="text"
                  value={entry.title}
                  onChange={e => onUpdateLorebook(entry.id, { title: e.target.value })}
                  className="w-full border border-white/10 rounded-[8px] p-2.5 text-sm font-bold outline-none transition"
                  style={inputStyle}
                  placeholder="地點名稱..."
                />

                {/* 地點描述 */}
                <textarea
                  value={entry.content}
                  onChange={e => onUpdateLorebook(entry.id, { content: e.target.value })}
                  className="w-full border border-white/10 rounded-[8px] p-2.5 text-sm outline-none transition resize-y min-h-[80px]"
                  style={inputStyle}
                  placeholder="地點簡介..."
                />

                {/* 地點專屬欄位 */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="text-sm ml-3 mb-1 uppercase tracking-wider" style={{ color: 'var(--text-body)' }}>地圖狀態</div>
                    <select
                      value={entry.mapStatus ?? 'heard'}
                      onChange={e => onUpdateLorebook(entry.id, { mapStatus: e.target.value as 'heard' | 'known' })}
                      className="w-full border border-white/10 rounded-[8px] px-2 py-1.5 text-sm outline-none transition"
                      style={inputStyle}
                    >
                      <option value="heard">聽說過</option>
                      <option value="known">已造訪</option>
                    </select>
                  </div>
                  <div>
                    <div className="text-sm ml-3 mb-1 uppercase tracking-wider" style={{ color: 'var(--text-body)' }}>地點類型</div>
                    <select
                      value={entry.locationType ?? 'wilderness'}
                      onChange={e => onUpdateLorebook(entry.id, { locationType: e.target.value as 'town' | 'wilderness' | 'building' })}
                      className="w-full border border-white/10 rounded-[8px] px-2 py-1.5 text-sm outline-none transition"
                      style={inputStyle}
                    >
                      <option value="town">城鎮</option>
                      <option value="wilderness">野外</option>
                      <option value="building">建築</option>
                    </select>
                  </div>
                </div>

                {renderKeywordsSection(entry, '（OR，任一命中即觸發；空白 = 依地點規則）')}

                {renderEditActions(entry.id)}
              </div>
            );
          }

          // 檢視卡片
          return (
            <div
              key={entry.id}
              onClick={() => setEditingLorebookId(entry.id)}
              className="backdrop-blur-sm rounded-[8px] p-3 cursor-pointer transition-colors border relative"
              style={{
                background: 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)',
                borderColor: 'var(--border-default)',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-accent)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-default)'; }}
            >
              {/* 左側內容：標題 + 關鍵字 + 敍述（預留右邊空間給勾選框） */}
              <div className="pr-8">
                {/* 標題 */}
                <span className="font-bold leading-snug text-lg" style={{ color: 'var(--text-title)' }}>
                  {entry.title || '未命名'}
                </span>

                {/* 關鍵字（有才顯示） */}
                {allKeywords.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1 mb-1.5">
                    {allKeywords.map(kw => (
                      <span
                        key={kw}
                        className="px-1.5 py-0.5 rounded-full border"
                        style={{
                          fontSize: '12px',
                          background: 'color-mix(in srgb, var(--bg-sys-tag) 30%, transparent)',
                          borderColor: 'color-mix(in srgb, var(--bg-sys-tag) 50%, transparent)',
                          color: 'var(--text-body)',
                        }}
                      >
                        {kw}
                      </span>
                    ))}
                  </div>
                )}

                {/* 描述 */}
                <p className="leading-relaxed line-clamp-2 text-base" style={{ color: 'var(--text-body)' }}>
                  {entry.content || (
                    <span className="italic" style={{ color: 'var(--text-muted)' }}>點擊以新增簡介...</span>
                  )}
                </p>
              </div>

              {/* 右上角：勾選框（絕對定位） */}
              <button
                onClick={e => {
                  e.stopPropagation();
                  onUpdateLorebook(entry.id, { isActive: !entry.isActive });
                }}
                className="absolute top-3 right-3 shrink-0 transition"
                style={{ color: entry.isActive ? 'var(--text-primary)' : 'var(--text-muted)' }}
                title={entry.isActive ? 'AI 將讀取此設定' : 'AI 不讀取此設定'}
              >
                {entry.isActive
                  ? <CheckSquare className="w-4 h-4" />
                  : <Square className="w-4 h-4" />}
              </button>
            </div>
          );
        })}
      </div>
    );
  };

  // ── NPC Grid ─────────────────────────────────────────────────────────────────
  const renderNpcGrid = () => {
    const filtered = lorebookEntries
      .filter(e => e.category === 'NPC')
      .filter(e => {
        if (!lorebookSearch.trim()) return true;
        const s = lorebookSearch.toLowerCase();
        return (
          (e.title       && e.title.toLowerCase().includes(s))       ||
          (e.job         && e.job.toLowerCase().includes(s))          ||
          (e.race        && e.race.toLowerCase().includes(s))         ||
          (e.gender      && e.gender.toLowerCase().includes(s))       ||
          (e.appearance  && e.appearance.toLowerCase().includes(s))   ||
          (e.personality && e.personality.toLowerCase().includes(s))  ||
          (e.backstory   && e.backstory.toLowerCase().includes(s))    ||
          (e.other       && e.other.toLowerCase().includes(s))
        );
      });

    if (filtered.length === 0) {
      return (
        <div className="text-center py-10 italic" style={{ color: 'var(--text-muted)' }}>
          此分類尚無設定
        </div>
      );
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
              other: entry.other ?? '',
              isPinned: false,
              memories: [],
              thoughts: [],
            };
            onSelectNpc(target as Npc);
          };

          return (
            <div
              key={entry.id}
              onClick={handleCardClick}
              className="backdrop-blur-sm rounded-[8px] p-3 cursor-pointer transition-colors border relative"
              style={{ background: 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)', borderColor: 'var(--border-default)' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-accent)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-default)'; }}
            >
              {/* 左側內容（預留右邊空間給勾選框） */}
              <div className="pr-8">
                {/* 第一行：名字 + 職業 + 好感度 */}
                <div className="flex items-center gap-2 mb-1.5">
                  {/* 左：姓名 */}
                  <span className="font-bold text-lg leading-tight shrink-0" style={{ color: 'var(--text-title)' }}>
                    {entry.title}
                  </span>

                  {/* 中：職業 */}
                  <span className="text-sm overflow-hidden flex-1 whitespace-nowrap text-ellipsis" style={{ color: 'var(--text-main)' }}>
                    {entry.job ?? npcData?.job ?? ''}
                  </span>

                  {/* 右：好感度 */}
                  <div className="flex items-center gap-0.5 shrink-0" style={{ color: affectionColor(affection) }}>
                    <Heart className={`w-4 h-4 ${affection >= 50 ? 'fill-current' : ''}`} />
                    <span className="text-sm font-bold font-mono">{affection}</span>
                  </div>
                </div>

                {/* 第二行：種族性別（左）+ 關係（右） */}
                <div className="flex items-center gap-2">
                  <span className="text-sm shrink-0" style={{ color: 'var(--text-main)' }}>
                    {(entry.race || entry.gender || entry.age) ? [entry.race, entry.gender, entry.age].filter(Boolean).join(' · ') : ''}
                  </span>
                  <div className="flex-1" />
                  <span className="text-sm shrink-0" style={{ color: 'var(--color-emerald)' }}>
                    {relationship || npcData?.affectionLabel || '陌生人'}
                  </span>
                </div>
              </div>

              {/* 右上角：勾選框（絕對定位） */}
              <button
                onClick={e => {
                  e.stopPropagation();
                  onUpdateLorebook(entry.id, { isActive: !entry.isActive });
                }}
                className="absolute top-3 right-3 shrink-0 transition"
                style={{ color: entry.isActive ? 'var(--text-primary)' : 'var(--text-muted)' }}
                title={entry.isActive ? 'AI 將讀取此設定' : 'AI 不讀取此設定'}
              >
                {entry.isActive
                  ? <CheckSquare className="w-4 h-4" />
                  : <Square className="w-4 h-4" />}
              </button>
            </div>
          );
        })}
      </div>
    );
  };

  // ── 勢力 Tab ──────────────────────────────────────────────────────────────────
  const renderFactionTab = () => {
    const locationEntries = lorebookEntries.filter(e => e.category === '地點');
    const factionInputStyle: React.CSSProperties = {
      background: 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)',
      borderColor: 'rgba(255,255,255,0.1)',
      color: 'var(--text-main)',
    };

    const renderFactionForm = (isEdit: boolean, existing?: Faction) => (
      <div className="col-span-2 rounded-[8px] p-4 space-y-3 border"
        style={{ background: 'color-mix(in srgb, var(--bg-elevated) 60%, transparent)', borderColor: 'var(--border-accent)' }}>
        <div className="flex items-center gap-2 mb-1">
          <div style={{ width: 12, height: 12, borderRadius: '50%', background: factionForm.color, border: '1px solid var(--border-default)', flexShrink: 0 }} />
          <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{isEdit ? '編輯勢力' : '新增勢力'}</span>
        </div>
        {/* Name */}
        <input type="text" placeholder="勢力名稱（必填）" value={factionForm.name}
          onChange={e => setFactionForm(p => ({ ...p, name: e.target.value }))}
          className="w-full border border-white/10 rounded-[8px] p-2.5 text-sm font-bold outline-none transition"
          style={factionInputStyle} />
        {/* Type + Color */}
        <div className="flex gap-2">
          <select value={factionForm.type}
            onChange={e => setFactionForm(p => ({ ...p, type: e.target.value as Faction['type'] }))}
            className="flex-1 border border-white/10 rounded-[8px] px-2.5 py-2 text-sm outline-none transition"
            style={factionInputStyle}>
            <option value="guild">公會</option>
            <option value="nation">國家</option>
            <option value="race">種族</option>
            <option value="religion">宗教</option>
            <option value="criminal">犯罪</option>
            <option value="other">其他</option>
          </select>
          <div className="flex items-center gap-2 border border-white/10 rounded-[8px] px-2.5"
            style={{ background: 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)' }}>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>顏色</span>
            <input type="color" value={factionForm.color}
              onChange={e => setFactionForm(p => ({ ...p, color: e.target.value }))}
              className="w-8 h-7 rounded cursor-pointer border-0 bg-transparent" />
          </div>
        </div>
        {/* Description */}
        <textarea placeholder="勢力描述..." value={factionForm.description}
          onChange={e => setFactionForm(p => ({ ...p, description: e.target.value }))}
          className="w-full border border-white/10 rounded-[8px] p-2.5 text-sm outline-none transition resize-y min-h-[60px]"
          style={factionInputStyle} />
        {/* Home location */}
        <div>
          <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>根據地（地圖上的主場地點）</div>
          <select value={factionForm.homeId}
            onChange={e => setFactionForm(p => ({ ...p, homeId: e.target.value }))}
            className="w-full border border-white/10 rounded-[8px] px-2.5 py-2 text-sm outline-none transition"
            style={factionInputStyle}>
            <option value="">— 未設定 —</option>
            {locationEntries.map(e => <option key={e.id} value={String(e.id)}>{e.title}</option>)}
          </select>
        </div>
        {/* Member checkboxes — 編輯時直接顯示；新增時不顯示（新增後 useEffect 自動切換到編輯模式）*/}
        {isEdit && existing && npcs.length > 0 && (
          <div>
            <div className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>成員</div>
            <div className="grid grid-cols-2 gap-1 max-h-32 overflow-y-auto">
              {npcs.map(npc => {
                const isMember = (existing.npcIds ?? []).includes(npc.id)
                  || (npc.factionIds ?? []).includes(existing.id);
                return (
                  <label key={npc.id} className="flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer text-sm"
                    style={{ color: isMember ? 'var(--text-primary)' : 'var(--text-muted)' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
                    <input type="checkbox" checked={isMember} onChange={() => {
                      if (!onUpdateFactionMembers) return;
                      const cur = existing.npcIds ?? npcs.filter(n => (n.factionIds ?? []).includes(existing.id)).map(n => n.id);
                      const next = isMember ? cur.filter(id => id !== npc.id) : [...cur, npc.id];
                      onUpdateFactionMembers(existing.id, next);
                    }} className="w-3 h-3 accent-blue-500" />
                    {npc.name}
                  </label>
                );
              })}
            </div>
          </div>
        )}
        {/* Actions */}
        <div className="flex justify-between items-center pt-1">
          {isEdit && existing ? (
            <button onClick={() => {
              if (onUpdateFaction) onUpdateFaction(existing.id, { isActive: false });
              setFactionAction(null);
            }} className="text-sm flex items-center px-2 py-1.5 rounded-[8px] gap-1 transition border"
              style={{ color: 'var(--text-muted)', borderColor: 'var(--text-muted)' }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-danger)'; e.currentTarget.style.borderColor = 'var(--text-danger)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--text-muted)'; }}
            ><Trash2 className="w-3.5 h-3.5" /> 刪除</button>
          ) : <div />}
          <div className="flex gap-2">
            <button onClick={() => setFactionAction(null)}
              className="text-sm px-3 py-1.5 rounded-[8px] transition"
              style={{ background: 'var(--btn-secondary)', color: 'var(--btn--text)' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--btn-secondary-hover)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--btn-secondary)'; }}
            >取消</button>
            <button
              disabled={!factionForm.name.trim()}
              onClick={() => {
                if (!factionForm.name.trim()) return;
                const homeIdNum = factionForm.homeId ? parseInt(factionForm.homeId) : undefined;
                if (isEdit && existing) {
                  onUpdateFaction?.(existing.id, {
                    name: factionForm.name, type: factionForm.type,
                    description: factionForm.description, color: factionForm.color,
                    homeId: homeIdNum,
                  });
                  setFactionAction(null);
                  showToast('✓ 勢力已更新');
                } else {
                  const newId = Math.max(0, ...factions.map(f => f.id)) + 1;
                  onAddFaction?.({
                    id: newId, name: factionForm.name, type: factionForm.type,
                    description: factionForm.description, color: factionForm.color,
                    isActive: true, homeId: homeIdNum, npcIds: [], relations: [],
                  });
                  setPendingEditFactionId(newId);
                  showToast('✓ 勢力已新增，請繼續選擇成員');
                }
              }}
              className="text-sm px-3 py-1.5 rounded-[8px] transition"
              style={{ background: 'var(--btn-primary)', color: 'var(--btn--text)',
                opacity: factionForm.name.trim() ? 1 : 0.5 }}
              onMouseEnter={e => { if (factionForm.name.trim()) e.currentTarget.style.background = 'var(--btn-primary-hover)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--btn-primary)'; }}
            >{isEdit ? '儲存' : '新增'}</button>
          </div>
        </div>
      </div>
    );

    if (factions.length === 0 && factionAction !== 'add') {
      return (
        <div className="text-center py-10">
          <p className="italic mb-4" style={{ color: 'var(--text-muted)' }}>尚無勢力，新增第一個勢力</p>
          <button onClick={() => { setFactionForm({ ...EMPTY_FACTION_FORM }); setFactionAction('add'); }}
            className="px-4 py-2 rounded-[8px] text-sm flex items-center gap-1.5 mx-auto transition"
            style={{ background: 'var(--btn-primary)', color: 'var(--btn--text)' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--btn-primary-hover)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--btn-primary)'; }}
          ><Plus className="w-4 h-4" /> 新增勢力</button>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-2 gap-3">
        {/* Add form */}
        {factionAction === 'add' && renderFactionForm(false)}

        {/* Faction cards */}
        {factions.map((faction, fi) => {
          const fc = faction.color ?? autoFactionColor(fi);
          const memberCount = npcs.filter(n =>
            (n.factionIds ?? []).includes(faction.id) || (faction.npcIds ?? []).includes(n.id)
          ).length;
          const isEditing = factionAction === faction.id;

          if (isEditing) return renderFactionForm(true, faction);

          return (
            <div key={faction.id}
              className="rounded-[8px] p-3 border flex items-center gap-3 relative"
              style={{ background: 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)', borderColor: 'var(--border-default)' }}
            >
              {/* Color bar */}
              <div style={{ width: 4, minHeight: 40, borderRadius: 2, background: fc, flexShrink: 0 }} />
              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>{faction.name}</span>
                  <span className="text-[11px] px-1.5 py-0.5 rounded-full"
                    style={{ background: fc + '33', color: fc, border: `1px solid ${fc}66` }}>
                    {faction.type === 'race' ? '種族' : faction.type === 'guild' ? '公會' :
                     faction.type === 'nation' ? '國家' : faction.type === 'religion' ? '宗教' :
                     faction.type === 'criminal' ? '犯罪' : '其他'}
                  </span>
                </div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {memberCount > 0 ? `${memberCount} 名成員` : '暫無成員'}
                </div>
              </div>
              {/* Three-dot menu */}
              <div className="relative">
                <button onClick={() => setFactionMenuId(factionMenuId === faction.id ? null : faction.id)}
                  className="w-7 h-7 flex items-center justify-center rounded transition"
                  style={{ color: 'var(--text-muted)' }}
                  onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'transparent'; }}
                ><MoreHorizontal className="w-4 h-4" /></button>
                {factionMenuId === faction.id && (
                  <div className="absolute right-0 top-8 z-10 rounded-[8px] border overflow-hidden shadow-lg"
                    style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-default)', minWidth: 90 }}>
                    <button onClick={() => {
                      setFactionForm({
                        name: faction.name, type: faction.type,
                        description: faction.description, color: faction.color ?? autoFactionColor(fi),
                        homeId: faction.homeId != null ? String(faction.homeId) : '',
                      });
                      setFactionAction(faction.id);
                      setFactionMenuId(null);
                    }} className="w-full text-left px-3 py-2 text-sm transition"
                      style={{ color: 'var(--text-body)' }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                    >編輯</button>
                    <button onClick={() => {
                      if (onUpdateFaction) onUpdateFaction(faction.id, { isActive: false });
                      setFactionMenuId(null);
                      showToast('勢力已停用');
                    }} className="w-full text-left px-3 py-2 text-sm transition"
                      style={{ color: 'var(--text-danger)' }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,0,0,0.06)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                    >刪除</button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // ── 決定渲染哪個 Grid ─────────────────────────────────────────────────────────
  const renderContent = () => {
    if (lorebookFilter === 'NPC')   return renderNpcGrid();
    if (lorebookFilter === '地點')  return renderLocationGrid();
    if (lorebookFilter === '勢力')  return renderFactionTab();
    return renderGenericGrid(lorebookFilter);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div
        className="backdrop-blur-xl w-full max-w-3xl rounded-[8px] shadow-[0_0_40px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden border border-white/10 relative h-[85vh]"
        style={{ background: 'color-mix(in srgb, var(--bg-elevated) 70%, transparent)' }}
      >

        {/* ── Header ── */}
        <div
          className="p-4 border-b border-white/5 flex justify-between items-center"
          style={{ background: 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)' }}
        >
          <div className="flex items-center">
            <h2 className="text-lg font-bold flex items-center" style={{ color: 'var(--text-primary)' }}>
              <BookOpen className="w-5 h-5 mr-2" style={{ color: 'var(--text-primary)' }} />
              世界觀與設定集
            </h2>
            <span className="ml-4 text-sm" style={{ color: 'var(--text-muted)' }}>
              勾選的項目將會被 AI 讀取並作為背景知識
            </span>
          </div>
          <button
            className="transition"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-title)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; }}
            onClick={() => {
              setEditingLorebookId(null);
              onClose();
            }}
          >
            ✕
          </button>
        </div>

        {/* ── 搜尋 + Tabs ── */}
        <div
          className="px-4 pt-3 pb-0 border-b border-white/5 space-y-2"
          style={{ background: 'color-mix(in srgb, var(--bg-elevated) 30%, transparent)' }}
        >
          {/* 第一行：搜尋欄 + 新增按鈕 */}
          <div className="flex gap-2 items-center">
            <div className="flex-1 relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="搜尋..."
                value={lorebookSearch}
                onChange={e => handleSearchChange(e.target.value)}
                className="w-full backdrop-blur-sm border border-white/10 rounded-[16px] h-9 pl-9 pr-3 text-sm outline-none transition"
                style={{ background: 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)', color: 'var(--text-body)' }}
              />
            </div>
            <button
              onClick={handleAdd}
              className="backdrop-blur-sm border border-white/10 px-10 h-8 rounded-[16px] flex items-center gap-1.5 transition shrink-0"
              style={{ background: 'var(--btn-primary)', color: 'var(--btn--text)', boxShadow: 'var(--shadow)' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--btn-primary-hover)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--btn-primary)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
            >
              <Plus className="w-4 h-4" /> 新增
            </button>
          </div>

          {/* 第二行：分類 Tabs */}
          <div
            className="flex border border-white/10 rounded-t-[8px] overflow-hidden"
            style={{ background: 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)' }}
          >
            {['地點', 'NPC', '怪物', '物品', '歷史', '其他', '勢力'].map(cat => {
              const isActive = lorebookFilter === cat;
              return (
                <button
                  key={cat}
                  onClick={() => { setLorebookFilter(cat); setEditingLorebookId(null); setFactionAction(null); setFactionMenuId(null); }}
                  className="flex-1 px-2 py-2 text-sm font-bold leading-[13px] transition"
                  style={{
                    background: isActive ? 'var(--btn-primary)' : 'transparent',
                    color: 'var(--text-tab)',
                    boxShadow: isActive ? 'var(--shadow)' : 'none',
                  }}
                  onMouseEnter={e => {
                    if (!isActive) {
                      e.currentTarget.style.background = 'var(--btn-primary-hover)';
                      e.currentTarget.style.color = 'var(--text-tab)';
                    }
                  }}
                  onMouseLeave={e => {
                    if (!isActive) {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = 'var(--text-muted)';
                    }
                  }}
                >
                  {cat === 'NPC' ? '人物' : cat}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── 內容區 ── */}
        <div className="flex-1 overflow-y-auto p-4">
          {renderContent()}
        </div>

      </div>
    </div>
  );
};
