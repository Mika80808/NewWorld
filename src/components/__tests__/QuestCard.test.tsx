// @vitest-environment jsdom
import '../../test/setupDom';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QuestCard, questVisual, formatReward } from '../QuestCard';
import { Quest } from '../../types';

const quest = (over: Partial<Quest> = {}): Quest => ({
  id: 'q1', shortId: 'k3p', title: '找回失竊的聖遺物', giver: '神殿祭司',
  description: '有人在昨夜闖進神殿。', reward: { gold: 500, items: ['祝福藥水'] },
  deadline: 12, status: 'active', isGoalMet: false,
  createdAt: '4/12', createdAtTotalDays: 102, ...over,
});

describe('questVisual', () => {
  it.each([
    [{ status: 'active' as const, isGoalMet: false }, 'active'],
    [{ status: 'active' as const, isGoalMet: true }, 'pending'],
    [{ status: 'completed' as const, isGoalMet: true }, 'completed'],
    [{ status: 'failed' as const, isGoalMet: false }, 'failed'],
  ])('%o → %s', (over, expected) => {
    expect(questVisual(quest(over))).toBe(expected);
  });
});

describe('formatReward', () => {
  it('金幣與物品串在一起', () => {
    expect(formatReward(quest())).toBe('500 銅、祝福藥水');
  });

  it('只有金幣', () => {
    expect(formatReward(quest({ reward: { gold: 80 } }))).toBe('80 銅');
  });

  /** 沒有獎勵時顯示「無」而不是空白——空白看起來像是壞掉 */
  it('完全沒有獎勵時顯示「無」', () => {
    expect(formatReward(quest({ reward: {} }))).toBe('無');
  });
});

/**
 * 玩家回報「任務沒有寫委託人跟獎勵」。資料其實在，是左欄任務面板那份
 * 自己寫的 JSX 沒渲染——它比 QuestModal 少了委託人（待回報的卡）與獎勵（四種
 * 狀態全都沒有）。兩邊改共用這個組件之後，同一筆任務在哪個入口看都一樣。
 */
describe('QuestCard 欄位', () => {
  it.each(['active', 'pending', 'completed', 'failed'] as const)(
    '%s 狀態一樣顯示委託人與獎勵',
    (visual) => {
      const over: Partial<Quest> =
        visual === 'pending' ? { isGoalMet: true }
        : visual === 'completed' ? { status: 'completed', completedAt: '4/20' }
        : visual === 'failed' ? { status: 'failed' }
        : {};
      render(<QuestCard quest={quest(over)} remaining="4 天" />);
      expect(screen.getByText(/委託：神殿祭司/)).toBeInTheDocument();
      expect(screen.getByText(/500 銅、祝福藥水/)).toBeInTheDocument();
      expect(screen.getByText(/接受：4\/12/)).toBeInTheDocument();
    }
  );

  it('沒有委託人時顯示破折號，不是空白', () => {
    render(<QuestCard quest={quest({ giver: '' })} remaining={null} />);
    expect(screen.getByText(/委託：—/)).toBeInTheDocument();
  });

  it('無期限時不顯示剩餘天數', () => {
    render(<QuestCard quest={quest({ deadline: null })} remaining={null} />);
    expect(screen.getByText('無期限')).toBeInTheDocument();
    expect(screen.queryByText(/剩 /)).toBeNull();
  });
});

/**
 * AI 漏掉 `QUEST_COMPLETE` 時任務會永遠掛在「進行中」，玩家先前完全沒有辦法
 * 自己收掉。短 ID 讓 AI 更容易指對任務，但它沒輸出指令時仍需要人工出口。
 */
describe('QuestCard 手動操作', () => {
  it('進行中的任務有回報完成與放棄', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    const onAbandon = vi.fn();
    const q = quest();
    render(<QuestCard quest={q} remaining="4 天" onComplete={onComplete} onAbandon={onAbandon} />);

    await user.click(screen.getByText('回報完成'));
    expect(onComplete).toHaveBeenCalledWith(q);

    await user.click(screen.getByText('放棄'));
    expect(onAbandon).toHaveBeenCalledWith(q);
  });

  it('待回報的任務同樣可以手動收掉', () => {
    render(<QuestCard quest={quest({ isGoalMet: true })} remaining={null} onComplete={vi.fn()} />);
    expect(screen.getByText('回報完成')).toBeInTheDocument();
  });

  /** 已結案的任務不該再出現操作鈕 */
  it.each(['completed', 'failed'] as const)('%s 的任務沒有操作鈕', (status) => {
    render(
      <QuestCard quest={quest({ status })} remaining={null} onComplete={vi.fn()} onAbandon={vi.fn()} />
    );
    expect(screen.queryByText('回報完成')).toBeNull();
    expect(screen.queryByText('放棄')).toBeNull();
  });

  it('沒傳 callback 時完全不顯示操作列', () => {
    render(<QuestCard quest={quest()} remaining="4 天" />);
    expect(screen.queryByText('回報完成')).toBeNull();
    expect(screen.queryByText('放棄')).toBeNull();
  });
});
