import React from 'react';
import { Book, X, CheckCircle, XCircle, Clock, Coins, AlertCircle } from 'lucide-react';

import { Quest } from '../types';

interface QuestModalProps {
  isOpen: boolean;
  onClose: () => void;
  quests: Quest[];
  currentTotalDays: number;
}

export const QuestModal: React.FC<QuestModalProps> = ({ isOpen, onClose, quests, currentTotalDays }) => {
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

  const renderReward = (q: Quest) => {
    const parts: string[] = [];
    if (q.reward?.gold) parts.push(`${q.reward.gold} 銅`);
    if (q.reward?.items?.length) parts.push(...q.reward.items);
    return parts.length > 0 ? parts.join('、') : '無';
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div className="backdrop-blur-xl w-full max-w-2xl max-h-[85vh] rounded-[8px] shadow-[0_0_50px_rgba(0,0,0,0.6)] border border-white/10 flex flex-col overflow-hidden relative z-[61]" style={{ background: 'color-mix(in srgb, var(--bg-elevated) 95%, transparent)', color: 'var(--text-title)' }}>

        {/* Header */}
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <Book className="w-5 h-5" style={{ color: 'var(--text-primary)' }} />
            <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>任務日誌</h2>
          </div>

          {/* Status counts */}
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full inline-block" style={{ background: 'var(--color-success)' }} />
              <span className="font-medium" style={{ color: 'var(--color-success)' }}>{activeQuests.length}</span>
              <span style={{ color: 'var(--color-success)' }}>進行中</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full inline-block" style={{ background: 'var(--color-amber)' }} />
              <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{pendingQuests.length}</span>
              <span style={{ color: 'var(--color-amber)' }}>待回報</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full inline-block" style={{ background: 'var(--color-sky)' }} />
              <span className="font-medium" style={{ color: 'var(--color-sky)' }}>{completedQuests.length}</span>
              <span style={{ color: 'var(--color-sky)' }}>已完成</span>
            </span>
            <span className="flex items-center gap-1">
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

        {/* Quest list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">

          {/* Pending (goalMet) quests — amber */}
          {pendingQuests.map(q => {
            const remaining = getRemaining(q);
            return (
              <div key={q.id} className="rounded-[8px] p-4" style={{ background: 'var(--bg-quest-pending)', border: `1px solid var(--border-quest-pending)` }}>
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h3 className="font-bold leading-snug" style={{ color: 'var(--text-title)' }}>{q.title}</h3>
                  <span className="flex-shrink-0 flex items-center gap-1 text-xs px-2 py-0.5 rounded-full" style={{ color: 'var(--color-amber)', background: 'color-mix(in srgb, var(--color-amber) 15%, transparent)', border: `1px solid color-mix(in srgb, var(--color-amber) 30%, transparent)` }}>
                    <AlertCircle className="w-3 h-3" />
                    待回報
                  </span>
                </div>
                <p className="text-xs mb-2" style={{ color: 'color-mix(in srgb, var(--color-amber) 80%, transparent)' }}>委託：{q.giver || '—'}</p>
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 flex-shrink-0" style={{ color: 'var(--text-primary)' }}>☑</span>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--text-body)' }}>{q.description}</p>
                </div>
                <div className="flex items-center justify-between mt-3">
                  <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-body)' }}>
                    <Coins className="w-3 h-3" style={{ color: 'var(--text-primary)' }} />
                    {renderReward(q)}
                  </span>
                  <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--text-body)' }}>
                    {remaining !== null && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        剩 {remaining}
                      </span>
                    )}
                    <span>接受：{q.createdAt}</span>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Active quests — green */}
          {activeQuests.map(q => {
            const remaining = getRemaining(q);
            return (
              <div key={q.id} className="rounded-[8px] p-4" style={{ background: 'var(--bg-quest-active)', border: `1px solid var(--border-quest-active)` }}>
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h3 className="font-bold leading-snug" style={{ color: 'var(--text-title)' }}>{q.title}</h3>
                  <span className="flex-shrink-0 flex items-center gap-1 text-xs px-2 py-0.5 rounded-full" style={{ color: 'var(--color-success)', background: 'color-mix(in srgb, var(--color-success) 15%, transparent)', border: `1px solid color-mix(in srgb, var(--color-success) 30%, transparent)` }}>
                    <Clock className="w-3 h-3" />
                    {remaining !== null ? `剩 ${remaining}` : '無期限'}
                  </span>
                </div>
                <p className="text-xs mb-2" style={{ color: 'color-mix(in srgb, var(--color-amber) 80%, transparent)' }}>委託：{q.giver || '—'}</p>
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 flex-shrink-0" style={{ color: 'var(--text-body)' }}>☐</span>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--text-body)' }}>{q.description}</p>
                </div>
                <div className="flex items-center justify-between mt-3">
                  <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-body)' }}>
                    <Coins className="w-3 h-3" style={{ color: 'var(--text-primary)' }} />
                    {renderReward(q)}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--text-body)' }}>接受：{q.createdAt}</span>
                </div>
              </div>
            );
          })}

          {/* Completed quests */}
          {completedQuests.map(q => (
            <div key={q.id} className="rounded-[8px] p-4 opacity-65" style={{ border: `1px solid color-mix(in srgb, var(--border-default) 20%, transparent)`, background: 'color-mix(in srgb, var(--bg-elevated) 20%, transparent)' }}>
              <div className="flex items-start justify-between gap-2 mb-1">
                <h3 className="font-bold line-through leading-snug" style={{ color: 'var(--text-muted)' }}>{q.title}</h3>
                <span className="flex-shrink-0 flex items-center gap-1 text-xs px-2 py-0.5 rounded-full" style={{ color: 'var(--color-success)', background: 'color-mix(in srgb, var(--color-success) 10%, transparent)', border: `1px solid color-mix(in srgb, var(--color-success) 20%, transparent)` }}>
                  <CheckCircle className="w-3 h-3" />
                  完成 {q.completedAt || ''}
                </span>
              </div>
              <p className="text-xs mb-2" style={{ color: 'var(--border-default)' }}>委託：{q.giver || '—'}</p>
              <div className="flex items-start gap-2">
                <span className="mt-0.5 flex-shrink-0" style={{ color: 'var(--border-default)' }}>☑</span>
                <p className="text-sm leading-relaxed line-through" style={{ color: 'var(--text-muted)' }}>{q.description}</p>
              </div>
              <div className="flex items-center justify-between mt-3">
                <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--border-default)' }}>
                  <Coins className="w-3 h-3" />
                  {renderReward(q)}
                </span>
                <span className="text-xs" style={{ color: 'var(--border-default)' }}>接受：{q.createdAt}</span>
              </div>
            </div>
          ))}

          {/* Failed quests */}
          {failedQuests.map(q => (
            <div key={q.id} className="rounded-[8px] p-4 opacity-55" style={{ background: 'var(--bg-quest-failed)', border: `1px solid var(--border-quest-failed)` }}>
              <div className="flex items-start justify-between gap-2 mb-1">
                <h3 className="font-bold line-through leading-snug" style={{ color: 'var(--text-muted)' }}>{q.title}</h3>
                <span className="flex-shrink-0 flex items-center gap-1 text-xs px-2 py-0.5 rounded-full" style={{ color: 'var(--color-rose)', background: 'color-mix(in srgb, var(--color-rose) 10%, transparent)', border: `1px solid color-mix(in srgb, var(--color-rose) 20%, transparent)` }}>
                  <XCircle className="w-3 h-3" />
                  期限超過
                </span>
              </div>
              <p className="text-xs mb-2" style={{ color: 'var(--border-default)' }}>委託：{q.giver || '—'}</p>
              <div className="flex items-start gap-2">
                <span className="mt-0.5 flex-shrink-0" style={{ color: 'var(--border-default)' }}>☐</span>
                <p className="text-sm leading-relaxed line-through" style={{ color: 'var(--text-muted)' }}>{q.description}</p>
              </div>
              <div className="flex items-center justify-between mt-3">
                <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--border-default)' }}>
                  <Coins className="w-3 h-3" />
                  {renderReward(q)}
                </span>
                <span className="text-xs" style={{ color: 'var(--border-default)' }}>接受：{q.createdAt}</span>
              </div>
            </div>
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
