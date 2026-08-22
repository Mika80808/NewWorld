// @vitest-environment jsdom
import '../../test/setupDom';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { QuestModal } from '../QuestModal';
import { DiaryModal } from '../DiaryModal';
import { Quest, DiaryEntry } from '../../types';

const noop = () => {};

const quests: Quest[] = [
  { id: 'q1', title: '找回失竊的聖遺物', giver: '神殿祭司', description: '', reward: { gold: 500 }, deadline: 12, status: 'active', isGoalMet: true, createdAt: '4/12', createdAtTotalDays: 102 },
];

const diary: DiaryEntry[] = [
  { id: 1, title: '月湖鎮的第一夜', text: '我在酒館醒來。', isActive: true, keywords: [], source: 'manual' },
];

/**
 * 這兩條釘住的是一個實際壞掉過的行為：Modal 標題列原本是一條**不換行**的
 * flex（`flex items-center justify-between`），標題、說明文字與計數器擠在
 * 同一列。在 390px 寬的手機上它們一起被壓到 min-content，中文於是逐字斷行
 * ——「任務日誌」變成直排的「任務日／誌」，四個狀態計數器各自變成一個
 * 一字寬的直條，整個標題列讀不出來。
 *
 * jsdom 不會套用真實樣式表，量不到實際寬度，所以這裡釘的是「class 契約」：
 * 標題列要能換行、標題本身不准斷字。實際視覺以瀏覽器（390×844）驗證。
 */
describe('Modal 標題列在窄螢幕的換行契約', () => {
  it('任務日誌：標題列可換行，標題本身不斷字', () => {
    const { container } = render(
      <QuestModal isOpen onClose={noop} quests={quests} currentTotalDays={110} />
    );
    const heading = container.querySelector('h2')!;
    expect(heading.className).toMatch(/whitespace-nowrap/);

    const headerRow = heading.closest('div')!.parentElement!;
    expect(headerRow.className).toMatch(/flex-wrap/);
  });

  it('日記與記憶：標題列可換行，標題本身不斷字', () => {
    const { container } = render(
      <DiaryModal
        isOpen onClose={noop} diaryEntries={diary}
        onAddDiary={() => 2} onGenerateDiary={async () => {}} onMergeDiary={async () => {}}
        onToggleDiary={noop} onDiaryChange={noop} onDiaryTitleChange={noop}
        onDiaryKeywordAdd={noop} onDiaryKeywordRemove={noop} onDeleteDiary={noop}
        scanKeywords={() => true}
      />
    );
    const heading = container.querySelector('h2')!;
    expect(heading.className).toMatch(/whitespace-nowrap/);

    const headerRow = heading.closest('div')!.parentElement!;
    expect(headerRow.className).toMatch(/flex-wrap/);
  });
});
