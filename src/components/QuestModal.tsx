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
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#24282d]/95 backdrop-blur-xl w-full max-w-2xl max-h-[85vh] rounded-[8px] shadow-[0_0_50px_rgba(0,0,0,0.6)] border border-white/10 flex flex-col overflow-hidden text-[#fbf5e4]">

        {/* Header */}
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <Book className="w-5 h-5 text-[#fde68a]" />
            <h2 className="text-lg font-bold text-[#fde68a]">任務日誌</h2>
          </div>

          {/* Status counts — 4 kinds */}
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
              <span className="text-emerald-400 font-medium">{activeQuests.length}</span>
              <span className="text-[#e8e8e9]">進行中</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
              <span className="text-[#fde68a] font-medium">{pendingQuests.length}</span>
              <span className="text-[#e8e8e9]">待回報</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-[var(--text3)] inline-block" />
              <span className="text-[#e8e8e9] font-medium">{completedQuests.length}</span>
              <span className="text-[#e8e8e9]">已完成</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
              <span className="text-red-400 font-medium">{failedQuests.length}</span>
              <span className="text-[#e8e8e9]">失敗</span>
            </span>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-[#132540] hover:bg-[#132540] text-[var(--text3)] hover:text-[#fbf5e4] transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Quest list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">

          {/* Pending (goalMet) quests — amber, shown first */}
          {pendingQuests.map(q => {
            const remaining = getRemaining(q);
            return (
              <div key={q.id} className="border border-amber-500/40 bg-amber-950/20 rounded-[8px] p-4">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h3 className="font-bold text-[#fbf5e4] leading-snug">{q.title}</h3>
                  <span className="flex-shrink-0 flex items-center gap-1 text-xs text-amber-300 bg-amber-900/40 border border-amber-700/30 px-2 py-0.5 rounded-full">
                    <AlertCircle className="w-3 h-3" />
                    待回報
                  </span>
                </div>
                <p className="text-xs text-amber-300/80 mb-2">委託：{q.giver || '—'}</p>
                <div className="flex items-start gap-2">
                  <span className="text-[#fde68a] mt-0.5 flex-shrink-0">☑</span>
                  <p className="text-sm text-[#e8e8e9] leading-relaxed">{q.description}</p>
                </div>
                <div className="flex items-center justify-between mt-3">
                  <span className="flex items-center gap-1 text-xs text-[#e8e8e9]">
                    <Coins className="w-3 h-3 text-[#fde68a]" />
                    {renderReward(q)}
                  </span>
                  <div className="flex items-center gap-3 text-xs text-[#e8e8e9]">
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

          {/* Active (not yet goalMet) quests — green */}
          {activeQuests.map(q => {
            const remaining = getRemaining(q);
            return (
              <div key={q.id} className="border border-emerald-500/30 bg-emerald-950/20 rounded-[8px] p-4">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h3 className="font-bold text-[#fbf5e4] leading-snug">{q.title}</h3>
                  <span className="flex-shrink-0 flex items-center gap-1 text-xs text-emerald-300 bg-emerald-900/40 border border-emerald-700/30 px-2 py-0.5 rounded-full">
                    <Clock className="w-3 h-3" />
                    {remaining !== null ? `剩 ${remaining}` : '無期限'}
                  </span>
                </div>
                <p className="text-xs text-amber-300/80 mb-2">委託：{q.giver || '—'}</p>
                <div className="flex items-start gap-2">
                  <span className="text-[#e8e8e9] mt-0.5 flex-shrink-0">☐</span>
                  <p className="text-sm text-[#e8e8e9] leading-relaxed">{q.description}</p>
                </div>
                <div className="flex items-center justify-between mt-3">
                  <span className="flex items-center gap-1 text-xs text-[#e8e8e9]">
                    <Coins className="w-3 h-3 text-[#fde68a]" />
                    {renderReward(q)}
                  </span>
                  <span className="text-xs text-[#e8e8e9]">接受：{q.createdAt}</span>
                </div>
              </div>
            );
          })}

          {/* Completed quests */}
          {completedQuests.map(q => (
            <div key={q.id} className="border border-[#283b57]/20 bg-[#132540]/20 rounded-[8px] p-4 opacity-65">
              <div className="flex items-start justify-between gap-2 mb-1">
                <h3 className="font-bold text-[var(--text3)] line-through leading-snug">{q.title}</h3>
                <span className="flex-shrink-0 flex items-center gap-1 text-xs text-emerald-500 bg-emerald-900/20 border border-emerald-800/30 px-2 py-0.5 rounded-full">
                  <CheckCircle className="w-3 h-3" />
                  完成 {q.completedAt || ''}
                </span>
              </div>
              <p className="text-xs text-[#283b57] mb-2">委託：{q.giver || '—'}</p>
              <div className="flex items-start gap-2">
                <span className="text-[#283b57] mt-0.5 flex-shrink-0">☑</span>
                <p className="text-sm text-[var(--text3)] leading-relaxed line-through">{q.description}</p>
              </div>
              <div className="flex items-center justify-between mt-3">
                <span className="flex items-center gap-1 text-xs text-[#283b57]">
                  <Coins className="w-3 h-3" />
                  {renderReward(q)}
                </span>
                <span className="text-xs text-[#283b57]">接受：{q.createdAt}</span>
              </div>
            </div>
          ))}

          {/* Failed quests */}
          {failedQuests.map(q => (
            <div key={q.id} className="border border-red-900/30 bg-red-950/10 rounded-[8px] p-4 opacity-55">
              <div className="flex items-start justify-between gap-2 mb-1">
                <h3 className="font-bold text-[var(--text3)] line-through leading-snug">{q.title}</h3>
                <span className="flex-shrink-0 flex items-center gap-1 text-xs text-red-400 bg-red-900/20 border border-red-800/30 px-2 py-0.5 rounded-full">
                  <XCircle className="w-3 h-3" />
                  期限超過
                </span>
              </div>
              <p className="text-xs text-[#283b57] mb-2">委託：{q.giver || '—'}</p>
              <div className="flex items-start gap-2">
                <span className="text-[#283b57] mt-0.5 flex-shrink-0">☐</span>
                <p className="text-sm text-[var(--text3)] leading-relaxed line-through">{q.description}</p>
              </div>
              <div className="flex items-center justify-between mt-3">
                <span className="flex items-center gap-1 text-xs text-[#283b57]">
                  <Coins className="w-3 h-3" />
                  {renderReward(q)}
                </span>
                <span className="text-xs text-[#283b57]">接受：{q.createdAt}</span>
              </div>
            </div>
          ))}

          {quests.length === 0 && (
            <div className="text-center text-[#e8e8e9] py-16">
              <Book className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>尚無任何任務記錄</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
