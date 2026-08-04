// @vitest-environment jsdom
import '../../test/setupDom';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NpcModal } from '../NpcModal';
import { Npc, LorebookEntry } from '../../types';

const makeNpc = (overrides: Partial<Npc> = {}): Npc => ({
  id: 1,
  name: '芬里爾',
  job: '獵人',
  affection: 70,
  appearance: '銀髮高挑',
  personality: '冷靜寡言',
  category: 'NPC',
  isActive: true,
  memories: [],
  ...overrides,
});

/** 「新角色」的定義：名字是新角色，且 job / appearance 都還沒填 */
const makeBlankNpc = (overrides: Partial<Npc> = {}): Npc =>
  makeNpc({ id: 99, name: '新角色', job: '', appearance: '', personality: '', affection: 0, ...overrides });

const noopProps = {
  lorebookEntries: [] as LorebookEntry[],
  onClose: vi.fn(),
  onRecordNpc: vi.fn(),
  onTogglePinNpc: vi.fn(),
  onAddNpcMemory: vi.fn(),
  onRemoveNpcMemory: vi.fn(),
  onUpdateNpcMemory: vi.fn(),
  onUpdateLorebook: vi.fn(),
  onDeleteNpc: vi.fn(),
  onClearNewMemories: vi.fn(),
};

/** 編輯模式的判斷依據：只有編輯模式才有「姓名」輸入框與儲存鈕 */
const isEditing = () => screen.queryByPlaceholderText('角色姓名⋯') !== null;

describe('NpcModal — 切換 NPC 時的重置（render 期間比對 prevNpcId）', () => {
  it('selectedNpc 為 null 時不渲染任何東西', () => {
    const { container } = render(<NpcModal {...noopProps} selectedNpc={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  // ⚠️ 這條釘住 prevNpcId 的初始哨兵 'init'。
  // App.tsx 是 `{selectedNpc && <NpcModal/>}`，每次開啟都是全新掛載，
  // 若把初始值改成 selectedNpc?.id，掛載當下 id 就已經相等、重置區塊整段不會跑，
  // 新建角色便不會自動進入編輯模式（玩家開啟後看到一片空白的唯讀畫面）。
  it('掛載一個空白的「新角色」時自動進入編輯模式', () => {
    render(<NpcModal {...noopProps} selectedNpc={makeBlankNpc()} />);

    expect(isEditing()).toBe(true);
    expect(screen.getByPlaceholderText('角色姓名⋯')).toHaveValue('新角色');
  });

  it('掛載一般 NPC 時維持顯示模式', () => {
    render(<NpcModal {...noopProps} selectedNpc={makeNpc()} />);

    expect(isEditing()).toBe(false);
    expect(screen.getByRole('heading')).toHaveTextContent('芬里爾');
  });

  // 名字叫「新角色」但已經有資料的（例如玩家建完沒改名），不該每次開啟都跳進編輯模式
  it('名為「新角色」但已有 job／appearance 時不進入編輯模式', () => {
    render(<NpcModal {...noopProps} selectedNpc={makeBlankNpc({ job: '鐵匠' })} />);
    expect(isEditing()).toBe(false);
  });

  it('換成另一個 id 的 NPC 時 activeTab 重置回「資料」', async () => {
    const user = userEvent.setup();
    const first = makeNpc({ id: 1, name: '芬里爾', affection: 70 });
    const { rerender } = render(<NpcModal {...noopProps} selectedNpc={first} />);

    await user.click(screen.getByRole('button', { name: /記憶/ }));
    expect(screen.getByPlaceholderText(/新增與他的回憶/)).toBeInTheDocument();

    rerender(<NpcModal {...noopProps} selectedNpc={makeNpc({ id: 2, name: '萊尼', affection: 70 })} />);

    // 回到「資料」分頁：記憶分頁的輸入框消失，改為顯示背景故事卡片
    expect(screen.queryByPlaceholderText(/新增與他的回憶/)).not.toBeInTheDocument();
    expect(screen.getByText('背景故事')).toBeInTheDocument();
    expect(screen.getByRole('heading')).toHaveTextContent('萊尼');
  });

  it('換成另一個 id 的 NPC 時離開編輯模式', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<NpcModal {...noopProps} selectedNpc={makeNpc({ id: 1 })} />);

    await user.click(screen.getByTitle('編輯角色'));
    expect(isEditing()).toBe(true);

    rerender(<NpcModal {...noopProps} selectedNpc={makeNpc({ id: 2, name: '萊尼' })} />);
    expect(isEditing()).toBe(false);
  });

  // 同一個 id 只是資料更新（例如好感度變動）不該把玩家正在編輯的內容丟掉
  it('同一個 id 的資料更新不重置編輯狀態', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<NpcModal {...noopProps} selectedNpc={makeNpc({ id: 1 })} />);

    await user.click(screen.getByTitle('編輯角色'));
    await user.clear(screen.getByPlaceholderText('角色姓名⋯'));
    await user.type(screen.getByPlaceholderText('角色姓名⋯'), '改名中');

    rerender(<NpcModal {...noopProps} selectedNpc={makeNpc({ id: 1, affection: 75 })} />);

    expect(isEditing()).toBe(true);
    expect(screen.getByPlaceholderText('角色姓名⋯')).toHaveValue('改名中');
  });
});
