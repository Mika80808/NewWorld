import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { RefreshCw, ScrollText, ChevronDown, ChevronRight } from 'lucide-react';

interface GoalsPanelProps {
  currentGoals: string[];
  adventureLog: string[];
  isUpdatingLog: boolean;
  summaryCollapsed: boolean;
  onToggleSummary: () => void;
}

/**
 * 便條紙樣式的「當前目標 + 冒險摘要」面板。
 * 桌面左欄與手機左抽屜共用（原本兩邊各有一份幾乎相同的 JSX）。
 */
export const GoalsPanel: React.FC<GoalsPanelProps> = ({
  currentGoals,
  adventureLog,
  isUpdatingLog,
  summaryCollapsed,
  onToggleSummary,
}) => (
  <div
    className="rounded-[8px] overflow-hidden relative"
    style={{
      background: 'rgba(248,242,226,0.90)',
      border: '1px solid rgba(185,165,130,0.55)',
      backdropFilter: 'blur(24px) saturate(180%)',
      WebkitBackdropFilter: 'blur(24px) saturate(180%)',
      boxShadow: '2px 2px 0 0 rgba(235,225,205,0.92), 4px 4px 0 0 rgba(220,210,190,0.82), 0 10px 28px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.55)',
    }}
  >
    {/* 橫向格線 */}
    <div className="absolute inset-0 pointer-events-none" style={{
      backgroundImage: 'repeating-linear-gradient(transparent 0, transparent 27px, rgba(140,110,70,0.09) 27px, rgba(140,110,70,0.09) 28px)',
      backgroundPosition: '0 52px',
      zIndex: 0,
    }} />
    {/* 左側邊界線 */}
    <div className="absolute top-0 bottom-0 pointer-events-none" style={{
      left: '38px', width: '1px',
      background: 'linear-gradient(to bottom, transparent 8%, rgba(188,55,55,0.16) 16%, rgba(188,55,55,0.16) 84%, transparent 92%)',
      zIndex: 0,
    }} />
    {/* 內容層 */}
    <div className="relative" style={{ zIndex: 1 }}>
      <div className="px-4 pt-3 pb-1 flex items-center">
        <h3 className="flex items-center font-bold text-lg" style={{ color: 'var(--text-note)' }}>
          <ScrollText className="w-4 h-4 mr-2" style={{ color: 'var(--text-note)' }} /> 當前目標
          {isUpdatingLog && <RefreshCw className="w-3 h-3 ml-2 animate-spin opacity-50" style={{ color: 'var(--text-note)' }} />}
        </h3>
      </div>
      <ul className="px-4 pb-2 space-y-1.5">
        {currentGoals.length > 0 ? currentGoals.map((goal, i) => (
          <li key={i} className="text-sm leading-relaxed flex items-start gap-2">
            <span className="flex-shrink-0 mt-0.5 text-xs" style={{ color: 'rgba(120,90,50,0.40)' }}>○</span>
            <span style={{ color: 'var(--text-note)' }}>{goal}</span>
          </li>
        )) : (
          <li className="text-sm" style={{ color: 'var(--text-note-muted)' }}>暫無明確目標...</li>
        )}
      </ul>
      <button className="w-full px-4 py-2 flex items-center transition-all" onClick={onToggleSummary} style={{ background: 'transparent' }}>
        {summaryCollapsed
          ? <ChevronRight className="w-3.5 h-3.5 mr-1.5 flex-shrink-0" style={{ color: 'var(--text-note)' }} />
          : <ChevronDown className="w-3.5 h-3.5 mr-1.5 flex-shrink-0" style={{ color: 'var(--text-note)' }} />}
        <span className="text-sm font-bold" style={{ color: 'var(--text-note)' }}>冒險摘要</span>
      </button>
      <AnimatePresence>
        {!summaryCollapsed && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
            <div className="px-4 pb-3">
              {adventureLog.length > 0 ? (
                <div className="text-sm leading-relaxed flex items-start gap-2">
                  <span className="flex-shrink-0 mt-0.5 text-xs" style={{ color: 'rgba(120,90,50,0.35)' }}>∵</span>
                  <span style={{ color: 'var(--text-note)', opacity: 0.85 }}>{adventureLog[0]}</span>
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

GoalsPanel.displayName = 'GoalsPanel';
