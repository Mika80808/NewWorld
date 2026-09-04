// @vitest-environment jsdom
import '../../test/setupDom';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SceneMemoryWidget } from '../panels/SceneMemoryWidget';
import { MemoryEntry } from '../../types';

const mem = (over: Partial<MemoryEntry> & Pick<MemoryEntry, 'type' | 'content'>): MemoryEntry => ({
  id: `m_${over.content}`,
  importance: 'normal',
  tags: { locations: [], npcs: [], factions: [], keywords: [] },
  trigger: { scanDepth: 5, probability: 100, sticky: 0, cooldown: 0 },
  isActive: true,
  source: 'ai_generated',
  createdAt: '4/15',
  ...over,
});

const atHere = (locations: string[]): Pick<MemoryEntry, 'tags'> => ({
  tags: { locations, npcs: [], factions: [], keywords: [] },
});

describe('SceneMemoryWidget', () => {
  const here = '霧光花園';

  it('顯示本地點的區域與場景記憶', () => {
    render(<SceneMemoryWidget currentLocation={here} memories={[
      mem({ type: 'region', content: '區域記憶內容', ...atHere([here]) }),
      mem({ type: 'scene', content: '場景記憶內容', ...atHere([here]) }),
    ]} />);
    expect(screen.getByText('區域記憶內容')).toBeTruthy();
    expect(screen.getByText('場景記憶內容')).toBeTruthy();
  });

  // 這個 Widget 講的是「你現在站的地方」。NPC 記憶沒有地點條件，
  // 全部塞進來會把真正的場景記憶擠掉——角色的事看 NPC 卡片的記憶庫
  it('不顯示 NPC 記憶，連 NPC 標題都不出現', () => {
    render(<SceneMemoryWidget currentLocation={here} memories={[
      mem({ type: 'scene', content: '場景記憶內容', ...atHere([here]) }),
      mem({
        type: 'npc', content: '艾蘿雯提到此地是為異鄉人準備的「緩衝區」。',
        tags: { locations: [], npcs: ['艾蘿雯'], factions: [], keywords: [] },
      }),
    ]} />);
    expect(screen.getByText('場景記憶內容')).toBeTruthy();
    expect(screen.queryByText(/緩衝區/)).toBeNull();
    expect(screen.queryByText('[艾蘿雯]')).toBeNull();
    expect(screen.queryByText('NPC')).toBeNull();
  });

  it('只有 NPC 記憶時顯示「此場景尚無記憶」', () => {
    render(<SceneMemoryWidget currentLocation={here} memories={[
      mem({ type: 'npc', content: '角色的事', tags: { locations: [], npcs: ['艾蘿雯'], factions: [], keywords: [] } }),
    ]} />);
    expect(screen.getByText('此場景尚無記憶...')).toBeTruthy();
  });

  it('別的地點的場景記憶不會混進來', () => {
    render(<SceneMemoryWidget currentLocation={here} memories={[
      mem({ type: 'scene', content: '別處的事', ...atHere(['月湖鎮']) }),
    ]} />);
    expect(screen.queryByText('別處的事')).toBeNull();
  });

  // 沒有標地點的區域記憶視為全域，這是既有行為，不要被這次改動帶走
  it('沒有標地點的區域記憶視為全域', () => {
    render(<SceneMemoryWidget currentLocation={here} memories={[
      mem({ type: 'region', content: '全域區域記憶' }),
    ]} />);
    expect(screen.getByText('全域區域記憶')).toBeTruthy();
  });

  it('isActive 為 false 的不顯示', () => {
    render(<SceneMemoryWidget currentLocation={here} memories={[
      mem({ type: 'scene', content: '停用的記憶', isActive: false, ...atHere([here]) }),
    ]} />);
    expect(screen.queryByText('停用的記憶')).toBeNull();
  });
});

// 玩家回報：「開放修改場景記憶，AI 不會刪除的話會變得很長一串。」
// 這個 Widget 先前完全唯讀——沒有編輯也沒有刪除入口，而 AI 只會 MEMORY_ADD。
describe('SceneMemoryWidget — 玩家編輯與刪除', () => {
  const here = '霧光花園';
  const sceneMem = (content: string, over: Partial<MemoryEntry> = {}) =>
    mem({ type: 'scene', content, ...atHere([here]), ...over });

  it('編輯後把新內容交給 onUpdateMemory', async () => {
    const onUpdateMemory = vi.fn();
    render(<SceneMemoryWidget
      currentLocation={here}
      memories={[sceneMem('原本的內容')]}
      onUpdateMemory={onUpdateMemory}
    />);

    await userEvent.click(screen.getByTitle('編輯記憶'));
    const box = screen.getByLabelText('編輯記憶內容');
    await userEvent.clear(box);
    await userEvent.type(box, '改過的內容');
    await userEvent.click(screen.getByTitle('確認'));

    expect(onUpdateMemory).toHaveBeenCalledWith('m_原本的內容', '改過的內容');
  });

  it('取消編輯不寫回，內容維持原樣', async () => {
    const onUpdateMemory = vi.fn();
    render(<SceneMemoryWidget
      currentLocation={here}
      memories={[sceneMem('原本的內容')]}
      onUpdateMemory={onUpdateMemory}
    />);

    await userEvent.click(screen.getByTitle('編輯記憶'));
    await userEvent.click(screen.getByTitle('取消'));

    expect(onUpdateMemory).not.toHaveBeenCalled();
    expect(screen.getByText('原本的內容')).toBeTruthy();
  });

  it('刪除呼叫 onDeleteMemory', async () => {
    const onDeleteMemory = vi.fn();
    render(<SceneMemoryWidget
      currentLocation={here}
      memories={[sceneMem('要刪掉的內容')]}
      onDeleteMemory={onDeleteMemory}
    />);

    await userEvent.click(screen.getByTitle('刪除記憶'));
    expect(onDeleteMemory).toHaveBeenCalledWith('m_要刪掉的內容');
  });

  // 唯讀情境（沒接 handler）不該長出按鈕
  it('沒傳 handler 時不顯示編輯／刪除鈕', () => {
    render(<SceneMemoryWidget currentLocation={here} memories={[sceneMem('內容')]} />);
    expect(screen.queryByTitle('編輯記憶')).toBeNull();
    expect(screen.queryByTitle('刪除記憶')).toBeNull();
  });
});

describe('SceneMemoryWidget — 融合鈕', () => {
  const here = '霧光花園';
  const sceneMem = (content: string, over: Partial<MemoryEntry> = {}) =>
    mem({ type: 'scene', content, ...atHere([here]), ...over });
  const findMerge = () => screen.queryByText(/^融合 \d+$/);

  // 把兩句話併成一句沒有意義，所以少於 MIN_MERGE_CANDIDATES 條時不顯示
  it('可融合記憶不足時不顯示', () => {
    render(<SceneMemoryWidget
      currentLocation={here}
      memories={[sceneMem('A'), sceneMem('B')]}
      onMergeMemories={vi.fn()}
    />);
    expect(findMerge()).toBeNull();
  });

  it('達到門檻時顯示並帶出可融合條數', () => {
    render(<SceneMemoryWidget
      currentLocation={here}
      memories={[sceneMem('A'), sceneMem('B'), sceneMem('C')]}
      onMergeMemories={vi.fn()}
    />);
    expect(findMerge()?.textContent).toContain('融合 3');
  });

  /**
   * 計數必須排除不可融合的那些，否則玩家會看到「融合 5」卻只併了 3 條。
   * 手寫與 critical 的豁免理由見 memoryStore 的 isSceneMergeable。
   */
  it('條數不計入玩家手寫與 critical', () => {
    render(<SceneMemoryWidget
      currentLocation={here}
      memories={[
        sceneMem('A'), sceneMem('B'), sceneMem('C'),
        sceneMem('D', { source: 'manual' }),
        sceneMem('E', { importance: 'critical' }),
      ]}
      onMergeMemories={vi.fn()}
    />);
    expect(findMerge()?.textContent).toContain('融合 3');
  });

  it('點擊時帶出所屬層級', async () => {
    const onMergeMemories = vi.fn();
    render(<SceneMemoryWidget
      currentLocation={here}
      memories={[sceneMem('A'), sceneMem('B'), sceneMem('C')]}
      onMergeMemories={onMergeMemories}
    />);
    await userEvent.click(screen.getByText(/^融合 3$/));
    expect(onMergeMemories).toHaveBeenCalledWith('scene');
  });

  it('融合進行中時停用，避免重複送出', () => {
    render(<SceneMemoryWidget
      currentLocation={here}
      memories={[sceneMem('A'), sceneMem('B'), sceneMem('C')]}
      onMergeMemories={vi.fn()}
      mergingType="scene"
    />);
    expect(screen.getByText(/^融合 3$/).closest('button')).toBeDisabled();
  });
});
