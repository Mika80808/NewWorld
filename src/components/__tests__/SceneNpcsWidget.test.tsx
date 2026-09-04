// @vitest-environment jsdom
import '../../test/setupDom';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SceneNpcsWidget } from '../panels/SceneNpcsWidget';
import { Npc } from '../../types';

const npc = (name: string, over: Partial<Npc> = {}): Npc => ({
  id: Math.floor(Math.random() * 1e6),
  name,
  affection: 30,
  category: 'NPC',
  isActive: true,
  memories: [],
  ...over,
});

const renderWidget = (npcs: Npc[], appearingNpcs: string[]) =>
  render(
    <SceneNpcsWidget
      npcs={npcs}
      appearingNpcs={appearingNpcs}
      lorebookEntries={[]}
      onSelectNpc={vi.fn()}
    />
  );

describe('SceneNpcsWidget 當前場景人物', () => {
  it('顯示 appearingNpcs 裡的角色', () => {
    renderWidget([npc('凱爾'), npc('芬里爾')], ['凱爾']);
    expect(screen.getByText('凱爾')).toBeInTheDocument();
    expect(screen.queryByText('芬里爾')).not.toBeInTheDocument();
  });

  /**
   * 這條釘住玩家回報的 bug：已退場的 NPC 還留在「當前場景人物」裡。
   *
   * 成因是舊的篩選條件 or 了 `n.location === currentLocation`。
   * `Npc.location` 是**足跡**——出場時寫入、退場時從不清除——所以角色只要在
   * 月湖鎮出現過一次，之後玩家只要還在月湖鎮就永遠留在清單裡，即使
   * `[出場:]` 空標記已經把他請下台。
   */
  it('足跡仍指向當前地點、但已不在 appearingNpcs 的角色不再顯示', () => {
    renderWidget([npc('凱爾', { location: '月湖鎮' })], []);
    expect(screen.queryByText('凱爾')).not.toBeInTheDocument();
    expect(screen.getByText('此處目前沒有人...')).toBeInTheDocument();
  });

  /**
   * 另一條同樣會讓人賴著不走的條件：`n.isPinned`。
   * 釘選的角色不管身在哪個城鎮都會被算成「在場」，
   * 而釘選角色本來就有獨立的 PinnedNpcsWidget 在顯示。
   */
  it('釘選但不在場的角色不再顯示', () => {
    renderWidget([npc('芬里爾', { isPinned: true, location: '迷霧森林' })], []);
    expect(screen.queryByText('芬里爾')).not.toBeInTheDocument();
  });

  it('釘選且在場時照常顯示', () => {
    renderWidget([npc('芬里爾', { isPinned: true })], ['芬里爾']);
    expect(screen.getByText('芬里爾')).toBeInTheDocument();
  });

  /**
   * 隨行同伴（`isCompanion`）是「不在 appearingNpcs 也算在場」的**唯一**例外，
   * 而且是玩家明確設定的例外：他常駐在玩家身邊、跟著玩家走。
   *
   * ⚠️ 這與上面被拔掉的 `isPinned` 不同。釘選只是把人釘到右欄方便追蹤好感度，
   * 人可能還待在另一座城；隨行是「他此刻就跟你站在一起」。prompt 那頭也是
   * 這樣算的（buildPrompt 的 onStageNpcs），兩邊必須一致，否則會出現
   * 「GM 當他在場、UI 說此處沒有人」的分歧。
   */
  it('隨行同伴不在 appearingNpcs 也照常顯示', () => {
    renderWidget([npc('引路者', { isCompanion: true, location: '起始神殿' })], []);
    expect(screen.getByText('引路者')).toBeInTheDocument();
  });

  it('取消隨行後就不再顯示', () => {
    renderWidget([npc('引路者', { isCompanion: false })], []);
    expect(screen.queryByText('引路者')).not.toBeInTheDocument();
    expect(screen.getByText('此處目前沒有人...')).toBeInTheDocument();
  });

  /**
   * 比對規則與 promptBuilder 的 inScene 一致（前後包含而非嚴格相等）：
   * AI 可能只寫「凱爾」而角色全名是「凱爾·溫德」。兩邊若用不同規則，
   * 會出現「prompt 當他在場、UI 說他不在」的分歧。
   */
  it('AI 只給簡稱時仍對得上全名', () => {
    renderWidget([npc('凱爾·溫德')], ['凱爾']);
    expect(screen.getByText('凱爾·溫德')).toBeInTheDocument();
  });
});
