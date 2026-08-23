import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { RefreshCw, ScrollText, ChevronDown, ChevronRight, Pencil, Check, X, Plus } from 'lucide-react';

/**
 * 色碼例外：便條紙的獨立調色盤。
 *
 * 這裡**刻意**不跟著佈景主題走，理由與 `MapModal` 的 `MAP_PALETTE` 相同：
 * 便條紙在兩個主題底下都該是「一張淺色紙」——文字色也因此走
 * `--text-note`（深色紙上用，與一般文字色相反）。若讓它跟著夜色主題翻黑，
 * 格線、紅色裝訂線、堆疊紙邊這些擬物細節就全部失去意義了。
 *
 * 紙面本身仍讀 `--bg-note-paper`，主題想微調紙色時有調整餘地。
 */
const NOTE_PAPER = {
  edge1:    'rgba(235,225,205,0.92)',  /* 下方第一張紙的邊 */
  edge2:    'rgba(220,210,190,0.82)',  /* 第二張 */
  border:   'rgba(185,165,130,0.55)',  /* 紙的外緣 */
  rule:     'rgba(140,110,70,0.09)',   /* 橫向格線 */
  margin:   'rgba(188,55,55,0.16)',    /* 左側紅色裝訂線 */
  highlight:'rgba(255,255,255,0.55)',  /* 紙面頂端的反光 */
  bullet:   'rgba(120,90,50,0.40)',    /* 目標項目的圓點 */
  bulletDim:'rgba(120,90,50,0.35)',    /* 摘要項目的符號 */
} as const;

interface GoalsPanelProps {
  currentGoals: string[];
  /** 冒險摘要：`summaryPool` 的最後一則（同一份資料，不再另存一份） */
  summary: string;
  isUpdatingLog: boolean;
  summaryCollapsed: boolean;
  onToggleSummary: () => void;
  /** 手動改寫目標；不給就是唯讀 */
  onEditGoals?: (goals: string[]) => void;
  /** 手動改寫摘要（會一併改到 AI 讀的那份，因為只有一份） */
  onEditSummary?: (summary: string) => void;
}

/**
 * 便條紙樣式的「當前目標 + 冒險摘要」面板。
 * 桌面左欄與手機左抽屜共用（原本兩邊各有一份幾乎相同的 JSX）。
 */
export const GoalsPanel: React.FC<GoalsPanelProps> = ({
  currentGoals,
  summary,
  isUpdatingLog,
  summaryCollapsed,
  onToggleSummary,
  onEditGoals,
  onEditSummary,
}) => {
  const [editingGoals, setEditingGoals] = useState(false);
  const [draftGoals, setDraftGoals] = useState<string[]>(currentGoals);
  const [editingSummary, setEditingSummary] = useState(false);
  const [draftSummary, setDraftSummary] = useState(summary);

  // 草稿不跟外部值同步：非編輯狀態下顯示的是 currentGoals / summary 本身，
  // 草稿只有進入編輯時才有意義，而按下鉛筆就會重新播種（見下方 onClick）。
  // 先前這裡掛了兩個 useEffect 做同步，是多餘的，還會觸發 set-state-in-effect。

  const iconBtn = 'p-1 rounded transition';
  const inputStyle: React.CSSProperties = {
    background: 'transparent',
    color: 'var(--text-note)',
    borderBottom: `1px solid ${NOTE_PAPER.rule}`,
  };

  const commitGoals = () => {
    onEditGoals?.(draftGoals.map(g => g.trim()).filter(Boolean));
    setEditingGoals(false);
  };

  return (
  <div
    className="rounded-[8px] overflow-hidden relative"
    style={{
      background: 'var(--bg-note-paper)',
      border: `1px solid ${NOTE_PAPER.border}`,
      backdropFilter: 'blur(24px) saturate(180%)',
      WebkitBackdropFilter: 'blur(24px) saturate(180%)',
      boxShadow: `2px 2px 0 0 ${NOTE_PAPER.edge1}, 4px 4px 0 0 ${NOTE_PAPER.edge2}, var(--shadow-float), inset 0 1px 0 ${NOTE_PAPER.highlight}`,
    }}
  >
    {/* 橫向格線 */}
    <div className="absolute inset-0 pointer-events-none" style={{
      backgroundImage: `repeating-linear-gradient(transparent 0, transparent 27px, ${NOTE_PAPER.rule} 27px, ${NOTE_PAPER.rule} 28px)`,
      backgroundPosition: '0 52px',
      zIndex: 0,
    }} />
    {/* 左側邊界線 */}
    <div className="absolute top-0 bottom-0 pointer-events-none" style={{
      left: '38px', width: '1px',
      background: `linear-gradient(to bottom, transparent 8%, ${NOTE_PAPER.margin} 16%, ${NOTE_PAPER.margin} 84%, transparent 92%)`,
      zIndex: 0,
    }} />
    {/* 內容層 */}
    <div className="relative" style={{ zIndex: 1 }}>
      <div className="px-4 pt-3 pb-1 flex items-center">
        <h3 className="flex items-center font-bold text-lg" style={{ color: 'var(--text-note)' }}>
          <ScrollText className="w-4 h-4 mr-2" style={{ color: 'var(--text-note)' }} /> 當前目標
          {isUpdatingLog && <RefreshCw className="w-3 h-3 ml-2 animate-spin opacity-50" style={{ color: 'var(--text-note)' }} />}
        </h3>
        {onEditGoals && (
          <div className="ml-auto flex items-center gap-1">
            {editingGoals ? (
              <>
                <button className={iconBtn} aria-label="取消編輯目標"
                  style={{ color: 'var(--text-note-muted)' }}
                  onClick={() => { setDraftGoals(currentGoals); setEditingGoals(false); }}>
                  <X className="w-4 h-4" />
                </button>
                <button className={iconBtn} aria-label="儲存目標"
                  style={{ color: 'var(--text-note)' }} onClick={commitGoals}>
                  <Check className="w-4 h-4" />
                </button>
              </>
            ) : (
              <button className={iconBtn} aria-label="編輯目標"
                style={{ color: 'var(--text-note-muted)' }}
                onClick={() => { setDraftGoals(currentGoals); setEditingGoals(true); }}>
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {editingGoals ? (
        <ul className="px-4 pb-2 space-y-1.5">
          {draftGoals.map((goal, i) => (
            <li key={i} className="text-sm leading-relaxed flex items-center gap-2">
              <span className="flex-shrink-0 text-xs" style={{ color: NOTE_PAPER.bullet }}>○</span>
              <input
                className="flex-1 min-w-0 text-sm outline-none py-0.5"
                style={inputStyle}
                value={goal}
                aria-label={`目標 ${i + 1}`}
                onChange={e => setDraftGoals(prev => prev.map((g, j) => j === i ? e.target.value : g))}
              />
              <button className={iconBtn} aria-label={`刪除目標 ${i + 1}`}
                style={{ color: 'var(--text-note-muted)' }}
                onClick={() => setDraftGoals(prev => prev.filter((_, j) => j !== i))}>
                <X className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
          <li>
            <button className="text-sm flex items-center gap-1.5 py-1"
              style={{ color: 'var(--text-note-muted)' }}
              onClick={() => setDraftGoals(prev => [...prev, ''])}>
              <Plus className="w-3.5 h-3.5" /> 新增目標
            </button>
          </li>
        </ul>
      ) : (
        <ul className="px-4 pb-2 space-y-1.5">
          {currentGoals.length > 0 ? currentGoals.map((goal, i) => (
            <li key={i} className="text-sm leading-relaxed flex items-start gap-2">
              <span className="flex-shrink-0 mt-0.5 text-xs" style={{ color: NOTE_PAPER.bullet }}>○</span>
              <span style={{ color: 'var(--text-note)' }}>{goal}</span>
            </li>
          )) : (
            <li className="text-sm" style={{ color: 'var(--text-note-muted)' }}>暫無明確目標...</li>
          )}
        </ul>
      )}
      <div className="w-full px-4 py-2 flex items-center">
        <button className="flex items-center transition-all" onClick={onToggleSummary} style={{ background: 'transparent' }}>
          {summaryCollapsed
            ? <ChevronRight className="w-3.5 h-3.5 mr-1.5 flex-shrink-0" style={{ color: 'var(--text-note)' }} />
            : <ChevronDown className="w-3.5 h-3.5 mr-1.5 flex-shrink-0" style={{ color: 'var(--text-note)' }} />}
          <span className="text-sm font-bold" style={{ color: 'var(--text-note)' }}>冒險摘要</span>
        </button>
        {onEditSummary && !summaryCollapsed && (
          <div className="ml-auto flex items-center gap-1">
            {editingSummary ? (
              <>
                <button className={iconBtn} aria-label="取消編輯摘要"
                  style={{ color: 'var(--text-note-muted)' }}
                  onClick={() => { setDraftSummary(summary); setEditingSummary(false); }}>
                  <X className="w-4 h-4" />
                </button>
                <button className={iconBtn} aria-label="儲存摘要"
                  style={{ color: 'var(--text-note)' }}
                  onClick={() => { onEditSummary(draftSummary.trim()); setEditingSummary(false); }}>
                  <Check className="w-4 h-4" />
                </button>
              </>
            ) : (
              <button className={iconBtn} aria-label="編輯摘要"
                style={{ color: 'var(--text-note-muted)' }}
                onClick={() => { setDraftSummary(summary); setEditingSummary(true); }}>
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>
      <AnimatePresence>
        {!summaryCollapsed && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
            <div className="px-4 pb-3">
              {editingSummary ? (
                <textarea
                  className="w-full text-sm leading-relaxed outline-none resize-none py-1"
                  style={{ ...inputStyle, minHeight: '72px' }}
                  aria-label="冒險摘要"
                  value={draftSummary}
                  onChange={e => setDraftSummary(e.target.value)}
                />
              ) : summary ? (
                <div className="text-sm leading-relaxed flex items-start gap-2">
                  <span className="flex-shrink-0 mt-0.5 text-xs" style={{ color: NOTE_PAPER.bulletDim }}>∵</span>
                  <span style={{ color: 'var(--text-note)', opacity: 0.85 }}>{summary}</span>
                </div>
              ) : (
                <div className="text-sm" style={{ color: 'var(--text-note-muted)' }}>等待冒險展開...</div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  </div>
  );
};

GoalsPanel.displayName = 'GoalsPanel';
