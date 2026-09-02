import React from 'react';
import { Book, X } from 'lucide-react';

import { Quest } from '../types';
import { QuestCard } from './QuestCard';

interface QuestModalProps {
  isOpen: boolean;
  onClose: () => void;
  quests: Quest[];
  currentTotalDays: number;
  /** 手動回報完成（AI 漏掉 QUEST_COMPLETE 時的人工出口） */
  onCompleteQuest?: (quest: Quest) => void;
  /** 手動放棄 */
  onAbandonQuest?: (quest: Quest) => void;
}

export const QuestModal: React.FC<QuestModalProps> = ({
  isOpen, onClose, quests, currentTotalDays, onCompleteQuest, onAbandonQuest,
}) => {
  if (!isOpen) return null;

  const activeQuests    = quests.filter(q => q.status === 'active' && !q.isGoalMet);
  const pendingQuests   = quests.filter(q => q.status === 'active' && q.isGoalMet);
  const completedQuests = quests.filter(q => q.status === 'completed');
  const failedQuests    = quests.filter(q => q.status === 'failed');

  const getRemaining = (q: Quest): string | null => {
    if (q.deadline == null) return null;
    const elapsed = currentTotalDays - q.createdAtTotalDays;
    const left = q.deadline - elapsed;
    return left > 0 ? `${left} 天` : '0 天';
  };

  // 待回報排最前：那是等著玩家去交差的，最需要被看到
  const ordered = [...pendingQuests, ...activeQuests, ...completedQuests, ...failedQuests];

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div className="backdrop-blur-xl w-full max-w-2xl max-h-[85vh] rounded-[8px] shadow-[var(--shadow-modal)] border border-[color:var(--tint-line)] flex flex-col overflow-hidden relative z-[61]" style={{ background: 'color-mix(in srgb, var(--bg-elevated) 95%, transparent)', color: 'var(--text-title)' }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        {/* 標題列在 390px 寬的手機上原本被壓成「一字一行」：這一列是不換行的
            flex，標題與四個計數器一起被擠到 min-content，中文於是逐字斷行。
            改成整列可換行、每個項目 whitespace-nowrap，窄螢幕時計數器整組掉到
            下一行，而不是被壓扁。 */}
        <div className="px-6 py-4 border-b border-[color:var(--tint-line)] flex flex-wrap items-center justify-between gap-y-2 flex-shrink-0">
          <div className="flex items-center gap-2 shrink-0">
            <Book className="w-5 h-5 shrink-0" style={{ color: 'var(--text-primary)' }} />
            <h2 className="text-lg font-bold whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>任務日誌</h2>
          </div>

          {/* Status counts */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs order-last sm:order-none w-full sm:w-auto">
            <span className="flex items-center gap-1 whitespace-nowrap">
              <span className="w-2 h-2 rounded-full inline-block" style={{ background: 'var(--color-success)' }} />
              <span className="font-medium" style={{ color: 'var(--color-success)' }}>{activeQuests.length}</span>
              <span style={{ color: 'var(--color-success)' }}>進行中</span>
            </span>
            <span className="flex items-center gap-1 whitespace-nowrap">
              <span className="w-2 h-2 rounded-full inline-block" style={{ background: 'var(--color-amber)' }} />
              <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{pendingQuests.length}</span>
              <span style={{ color: 'var(--color-amber)' }}>待回報</span>
            </span>
            <span className="flex items-center gap-1 whitespace-nowrap">
              <span className="w-2 h-2 rounded-full inline-block" style={{ background: 'var(--color-sky)' }} />
              <span className="font-medium" style={{ color: 'var(--color-sky)' }}>{completedQuests.length}</span>
              <span style={{ color: 'var(--color-sky)' }}>已完成</span>
            </span>
            <span className="flex items-center gap-1 whitespace-nowrap">
              <span className="w-2 h-2 rounded-full inline-block" style={{ background: 'var(--color-taupe)' }} />
              <span className="font-medium" style={{ color: 'var(--color-taupe)' }}>{failedQuests.length}</span>
              <span style={{ color: 'var(--color-taupe)' }}>失敗</span>
            </span>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full transition"
            style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-title)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 卡片與左欄任務面板共用 QuestCard——兩邊不再各寫一份 JSX */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {ordered.map(q => (
            <QuestCard
              key={q.id}
              quest={q}
              remaining={getRemaining(q)}
              onComplete={onCompleteQuest}
              onAbandon={onAbandonQuest}
            />
          ))}

          {quests.length === 0 && (
            <div className="text-center py-16" style={{ color: 'var(--text-muted)' }}>
              <Book className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>尚無任何任務記錄</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
