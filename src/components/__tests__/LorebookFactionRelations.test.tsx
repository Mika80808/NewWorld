// @vitest-environment jsdom
import '../../test/setupDom';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LorebookModal } from '../LorebookModal';
import { Faction } from '../../types';

const faction = (id: number, name: string, over: Partial<Faction> = {}): Faction => ({
  id, name, type: 'guild', description: '', isActive: true, ...over,
});

const renderModal = (factions: Faction[], onSetFactionRelation = vi.fn()) => {
  render(
    <LorebookModal
      isOpen onClose={vi.fn()} lorebookEntries={[]} npcs={[]}
      onAddLorebook={() => 1} onAddNpc={vi.fn()}
      onUpdateLorebook={vi.fn()} onDeleteLorebook={vi.fn()}
      onLorebookKeywordAdd={vi.fn()} onLorebookKeywordRemove={vi.fn()}
      onSelectNpc={vi.fn()} showToast={vi.fn()}
      factions={factions} onSetFactionRelation={onSetFactionRelation}
    />
  );
  return onSetFactionRelation;
};

const openFactionTab = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: '勢力' }));
};

describe('LorebookModal 勢力敵友關係', () => {
  it('顯示既有關係', async () => {
    const user = userEvent.setup();
    renderModal([
      faction(1, '獵人公會', { relations: [{ targetFactionId: 2, type: 'enemy' }] }),
      faction(2, '黑牙氏族'),
    ]);
    await openFactionTab(user);
    expect(screen.getByText(/敵對：黑牙氏族/)).toBeInTheDocument();
  });

  it('關係備註會顯示出來', async () => {
    const user = userEvent.setup();
    renderModal([
      faction(1, '獵人公會', { relations: [{ targetFactionId: 2, type: 'ally', note: '共同禦敵' }] }),
      faction(2, '黑牙氏族'),
    ]);
    await openFactionTab(user);
    expect(screen.getByText(/同盟：黑牙氏族（共同禦敵）/)).toBeInTheDocument();
  });

  it('加入關係時以唯一寫入點回報，帶上對象與類型', async () => {
    const user = userEvent.setup();
    const onSet = renderModal([faction(1, '獵人公會'), faction(2, '黑牙氏族')]);
    await openFactionTab(user);

    const targets = screen.getAllByLabelText('關係對象');
    const types = screen.getAllByLabelText('關係類型');
    await user.selectOptions(targets[0], '2');
    await user.selectOptions(types[0], 'enemy');
    await user.click(screen.getAllByRole('button', { name: '加入' })[0]);

    expect(onSet).toHaveBeenCalledWith(1, 2, 'enemy', undefined);
  });

  it('備註會一起送出', async () => {
    const user = userEvent.setup();
    const onSet = renderModal([faction(1, '獵人公會'), faction(2, '黑牙氏族')]);
    await openFactionTab(user);
    await user.selectOptions(screen.getAllByLabelText('關係對象')[0], '2');
    await user.type(screen.getAllByPlaceholderText('備註（選填）')[0], '長年火拚');
    await user.click(screen.getAllByRole('button', { name: '加入' })[0]);
    expect(onSet).toHaveBeenCalledWith(1, 2, 'ally', '長年火拚');
  });

  it('解除關係時傳 null', async () => {
    const user = userEvent.setup();
    const onSet = renderModal([
      faction(1, '獵人公會', { relations: [{ targetFactionId: 2, type: 'enemy' }] }),
      faction(2, '黑牙氏族'),
    ]);
    await openFactionTab(user);
    await user.click(screen.getByLabelText('解除與 黑牙氏族 的關係'));
    expect(onSet).toHaveBeenCalledWith(1, 2, null);
  });

  it('只有一個勢力時提示需要兩個才能建立關係', async () => {
    const user = userEvent.setup();
    renderModal([faction(1, '獵人公會')]);
    await openFactionTab(user);
    expect(screen.getByText('至少要有兩個勢力才能建立關係')).toBeInTheDocument();
  });

  /** 附庸是單向的，介面要講清楚，否則玩家會以為雙方互為附庸 */
  it('選附庸時顯示單向說明', async () => {
    const user = userEvent.setup();
    renderModal([faction(1, '獵人公會'), faction(2, '黑牙氏族')]);
    await openFactionTab(user);
    await user.selectOptions(screen.getAllByLabelText('關係類型')[0], 'vassal');
    expect(screen.getByText(/獵人公會 臣屬於對方/)).toBeInTheDocument();
  });
});
