// @vitest-environment jsdom
import '../../test/setupDom';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
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
