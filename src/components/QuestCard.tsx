import React from 'react';
import { Clock, Coins, AlertCircle, Check, Ban } from 'lucide-react';
import { Quest } from '../types';

/**
 * 任務卡片——`QuestModal` 與左欄任務面板**共用的唯一渲染**。
 *
 * ⚠️ 先前兩邊各寫一份 JSX，而且長得不一樣：Modal 有委託人、獎勵、接受日期，
 * 面板只有標題與描述（待回報的卡連委託人都沒有）。玩家看到的資訊因此取決於
 * 他從哪個入口打開，同一筆任務在兩個地方呈現不同——實際回報的
 * 「任務沒有寫委託人跟獎勵」就是這樣來的：資料在，只是那個入口沒渲染。
 *
 * 兩邊一律走這裡。`compact` 只調整密度，**不減少欄位**。
 */

export type QuestVisual = 'pending' | 'active' | 'completed' | 'failed';

interface QuestCardProps {
  quest: Quest;
  /** 剩餘天數字串（`剩 4 天`）；無期限傳 null。由呼叫端算，卡片不碰遊戲時間 */
  remaining: string | null;
  compact?: boolean;
  /** 手動回報完成。不給就不顯示按鈕 */
  onComplete?: (quest: Quest) => void;
  /** 手動放棄。不給就不顯示按鈕 */
  onAbandon?: (quest: Quest) => void;
}

const VISUAL: Record<QuestVisual, { bg: string; border: string; label: string; color: string }> = {
  pending:   { bg: 'var(--bg-quest-pending)', border: 'var(--border-quest-pending)', label: '待回報', color: 'var(--color-amber)' },
  active:    { bg: 'var(--bg-quest-active)',  border: 'var(--border-quest-active)',  label: '進行中', color: 'var(--color-success)' },
  completed: { bg: 'transparent',             border: 'color-mix(in srgb, var(--border-default) 30%, transparent)', label: '完成',     color: 'var(--color-sky)' },
  failed:    { bg: 'var(--bg-quest-failed)',  border: 'var(--border-quest-failed)',  label: '期限超過', color: 'var(--color-taupe)' },
};

export function questVisual(q: Quest): QuestVisual {
  if (q.status === 'completed') return 'completed';
  if (q.status === 'failed') return 'failed';
  return q.isGoalMet ? 'pending' : 'active';
}

export function formatReward(q: Quest): string {
  const parts: string[] = [];
  if (q.reward?.gold) parts.push(`${q.reward.gold} 銅`);
  if (q.reward?.items?.length) parts.push(...q.reward.items);
  return parts.length > 0 ? parts.join('、') : '無';
}

export const QuestCard: React.FC<QuestCardProps> = ({
  quest: q, remaining, compact = false, onComplete, onAbandon,
}) => {
  const visual = questVisual(q);
  const v = VISUAL[visual];
  const done = visual === 'completed' || visual === 'failed';
  const showActions = !done && (onComplete || onAbandon);

  const badgeText =
    visual === 'active' ? (remaining !== null ? `剩 ${remaining}` : '無期限')
    : visual === 'completed' ? `完成 ${q.completedAt ?? ''}`.trim()
    : v.label;

  const BadgeIcon = visual === 'pending' ? AlertCircle : Clock;

  return (
    <div
      className={`rounded-[8px] ${compact ? 'p-3 text-sm' : 'p-4'} ${done ? 'opacity-60' : ''}`}
      style={{ background: v.bg, border: `1px solid ${v.border}` }}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <h3
          className={`font-bold leading-snug ${visual === 'completed' ? 'line-through' : ''}`}
          style={{ color: done ? 'var(--text-muted)' : 'var(--text-title)' }}
        >
          {q.title}
        </h3>
        <span
          className="flex-shrink-0 flex items-center gap-1 text-xs px-2 py-0.5 rounded-full whitespace-nowrap"
          style={{
            color: v.color,
            background: `color-mix(in srgb, ${v.color} 15%, transparent)`,
            border: `1px solid color-mix(in srgb, ${v.color} 30%, transparent)`,
          }}
        >
          {!done && <BadgeIcon className="w-3 h-3" />}
          {badgeText}
        </span>
      </div>

      {/* 委託人與獎勵在四種狀態都顯示——已完成的任務「誰委託的、拿了什麼」
          正是玩家事後最會想查的兩件事 */}
      <p className="text-xs mb-2" style={{ color: 'color-mix(in srgb, var(--color-amber) 80%, transparent)' }}>
        委託：{q.giver || '—'}
      </p>

      {q.description && (
        <div className="flex items-start gap-2">
          <span className="mt-0.5 flex-shrink-0" style={{ color: q.isGoalMet ? 'var(--text-primary)' : 'var(--text-body)' }}>
            {q.isGoalMet || visual === 'completed' ? '☑' : '☐'}
          </span>
          <p
            className={`text-sm leading-relaxed ${done ? 'line-through' : ''}`}
            style={{ color: done ? 'var(--text-muted)' : 'var(--text-body)' }}
          >
            {q.description}
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-y-1 mt-3">
        <span className="flex items-center gap-1 text-xs" style={{ color: done ? 'var(--text-muted)' : 'var(--text-body)' }}>
          <Coins className="w-3 h-3" style={{ color: 'var(--text-primary)' }} />
          {formatReward(q)}
        </span>
        <div className="flex items-center gap-3 text-xs" style={{ color: done ? 'var(--text-muted)' : 'var(--text-body)' }}>
          {!done && remaining !== null && (
            <span className="flex items-center gap-1 whitespace-nowrap">
              <Clock className="w-3 h-3" />
              剩 {remaining}
            </span>
          )}
          <span className="whitespace-nowrap">接受：{q.createdAt}</span>
        </div>
      </div>

      {/*
        手動結案／放棄。
        AI 漏掉 QUEST_COMPLETE 時任務會永遠掛在「進行中」，玩家先前完全沒有
        辦法自己收掉——短 ID 讓 AI 更容易指對任務，但指令沒輸出時仍需要人工出口。
      */}
      {showActions && (
        <div className="flex items-center gap-2 mt-3 pt-3" style={{ borderTop: '1px solid var(--tint-line)' }}>
          {onComplete && (
            <button
              onClick={() => onComplete(q)}
              className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-[8px] transition"
              style={{ color: 'var(--color-success)', background: 'color-mix(in srgb, var(--color-success) 12%, transparent)' }}
            >
              <Check className="w-3.5 h-3.5" /> 回報完成
            </button>
          )}
          {onAbandon && (
            <button
              onClick={() => onAbandon(q)}
              className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-[8px] transition"
              style={{ color: 'var(--text-danger)' }}
            >
              <Ban className="w-3.5 h-3.5" /> 放棄
            </button>
          )}
        </div>
      )}
    </div>
  );
};

QuestCard.displayName = 'QuestCard';
