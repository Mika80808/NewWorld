// @vitest-environment jsdom
import '../../test/setupDom';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GoalsPanel } from '../panels/GoalsPanel';

const noop = () => {};

const renderPanel = (props: Partial<React.ComponentProps<typeof GoalsPanel>> = {}) =>
  render(
    <GoalsPanel
      currentGoals={['找到失蹤的商隊', '把信送到北境哨站']}
      summary="陸星辰在月湖鎮的酒館醒來，身上少了一半的金幣。"
      isUpdatingLog={false}
      summaryCollapsed={false}
      onToggleSummary={noop}
      {...props}
    />
  );

describe('GoalsPanel 顯示', () => {
  it('列出目標與摘要', () => {
    renderPanel();
    expect(screen.getByText('找到失蹤的商隊')).toBeInTheDocument();
    expect(screen.getByText(/身上少了一半的金幣/)).toBeInTheDocument();
  });

  /** 摘要現在是 summaryPool 的最後一則（字串），不再是獨立的 adventureLog 陣列 */
  it('沒有摘要時顯示等待文案', () => {
    renderPanel({ summary: '' });
    expect(screen.getByText('等待冒險展開...')).toBeInTheDocument();
  });

  it('沒給 onEdit* 時不顯示編輯入口（唯讀）', () => {
    renderPanel();
    expect(screen.queryByLabelText('編輯目標')).toBeNull();
    expect(screen.queryByLabelText('編輯摘要')).toBeNull();
  });
});

describe('GoalsPanel 編輯目標', () => {
  it('改字後按確認會帶著整份清單回呼', async () => {
    const user = userEvent.setup();
    const onEditGoals = vi.fn();
    renderPanel({ onEditGoals });

    await user.click(screen.getByLabelText('編輯目標'));
    const first = screen.getByLabelText('目標 1');
    await user.clear(first);
    await user.type(first, '找到商隊的下落');
    await user.click(screen.getByLabelText('儲存目標'));

    expect(onEditGoals).toHaveBeenCalledWith(['找到商隊的下落', '把信送到北境哨站']);
  });

  it('可以刪掉一項', async () => {
    const user = userEvent.setup();
    const onEditGoals = vi.fn();
    renderPanel({ onEditGoals });

    await user.click(screen.getByLabelText('編輯目標'));
    await user.click(screen.getByLabelText('刪除目標 1'));
    await user.click(screen.getByLabelText('儲存目標'));

    expect(onEditGoals).toHaveBeenCalledWith(['把信送到北境哨站']);
  });

  it('可以新增一項', async () => {
    const user = userEvent.setup();
    const onEditGoals = vi.fn();
    renderPanel({ onEditGoals });

    await user.click(screen.getByLabelText('編輯目標'));
    await user.click(screen.getByText('新增目標'));
    await user.type(screen.getByLabelText('目標 3'), '查出誰翻了我的行囊');
    await user.click(screen.getByLabelText('儲存目標'));

    expect(onEditGoals).toHaveBeenCalledWith([
      '找到失蹤的商隊', '把信送到北境哨站', '查出誰翻了我的行囊',
    ]);
  });

  /** 空白項目是「新增後沒填」的殘留，不該存進去變成一顆空的圓點 */
  it('空白項目會被丟掉', async () => {
    const user = userEvent.setup();
    const onEditGoals = vi.fn();
    renderPanel({ onEditGoals });

    await user.click(screen.getByLabelText('編輯目標'));
    await user.click(screen.getByText('新增目標'));
    await user.click(screen.getByLabelText('儲存目標'));

    expect(onEditGoals).toHaveBeenCalledWith(['找到失蹤的商隊', '把信送到北境哨站']);
  });

  it('取消不會回呼，也不留下改動', async () => {
    const user = userEvent.setup();
    const onEditGoals = vi.fn();
    renderPanel({ onEditGoals });

    await user.click(screen.getByLabelText('編輯目標'));
    await user.clear(screen.getByLabelText('目標 1'));
    await user.click(screen.getByLabelText('取消編輯目標'));

    expect(onEditGoals).not.toHaveBeenCalled();
    expect(screen.getByText('找到失蹤的商隊')).toBeInTheDocument();
  });
});

describe('GoalsPanel 編輯摘要', () => {
  it('改完按確認會回呼新內容', async () => {
    const user = userEvent.setup();
    const onEditSummary = vi.fn();
    renderPanel({ onEditSummary });

    await user.click(screen.getByLabelText('編輯摘要'));
    const box = screen.getByLabelText('冒險摘要');
    await user.clear(box);
    await user.type(box, '陸星辰在酒館醒來，金幣被偷了一半。');
    await user.click(screen.getByLabelText('儲存摘要'));

    expect(onEditSummary).toHaveBeenCalledWith('陸星辰在酒館醒來，金幣被偷了一半。');
  });

  /** 摘要收合時編輯鈕不該出現——按下去也看不到要編輯什麼 */
  it('摘要收合時不顯示編輯鈕', () => {
    renderPanel({ onEditSummary: noop, summaryCollapsed: true });
    expect(screen.queryByLabelText('編輯摘要')).toBeNull();
  });

  it('取消不會回呼', async () => {
    const user = userEvent.setup();
    const onEditSummary = vi.fn();
    renderPanel({ onEditSummary });

    await user.click(screen.getByLabelText('編輯摘要'));
    await user.clear(screen.getByLabelText('冒險摘要'));
    await user.click(screen.getByLabelText('取消編輯摘要'));

    expect(onEditSummary).not.toHaveBeenCalled();
  });
});
