// @vitest-environment jsdom
import '../../test/setupDom';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TimeWeatherPopover } from '../TimeWeatherPopover';
import { WEATHER_VALUES } from '../../utils/weather';

const setup = (over: Partial<React.ComponentProps<typeof TimeWeatherPopover>> = {}) => {
  const onApply = vi.fn();
  const onClose = vi.fn();
  render(
    <TimeWeatherPopover hour={2} minute={14} weather="晴朗" onApply={onApply} onClose={onClose} {...over} />
  );
  return { onApply, onClose };
};

/**
 * 玩家回報：「時間跟天氣他現在抓不準，故事是早上可是狀態列裡面是半夜，
 * 天氣也沒有改變，他沒有辦法校準。」
 *
 * AI 那邊補了 `TIME|set=` 與 `WEATHER` 指令，但那只是讓 AI **有能力**校準。
 * 這張卡是玩家自己的出口——與任務的「強制結案」同一個原則：AI 漏掉時人要收得掉。
 */
describe('TimeWeatherPopover', () => {
  it('開啟時帶入目前的時刻與天氣', () => {
    setup();
    expect((screen.getByLabelText('小時') as HTMLInputElement).value).toBe('2');
    expect((screen.getByLabelText('分鐘') as HTMLInputElement).value).toBe('14');
    expect(screen.getByText('目前 02:14')).toBeInTheDocument();
  });

  it('五種天氣都選得到', () => {
    setup();
    for (const w of WEATHER_VALUES) expect(screen.getByText(w)).toBeInTheDocument();
  });

  /** 手打 07:00 太慢，玩家要的多半就是「把它撥到早上」 */
  it('時段快捷鍵一鍵撥到整點', async () => {
    const user = userEvent.setup();
    const { onApply } = setup();
    await user.click(screen.getByText('早上'));
    await user.click(screen.getByText('套用'));
    expect(onApply).toHaveBeenCalledWith({ hour: 9, minute: 0, weather: '晴朗' });
  });

  it('選了天氣後一起套用', async () => {
    const user = userEvent.setup();
    const { onApply } = setup();
    await user.click(screen.getByText('下雨'));
    await user.click(screen.getByText('套用'));
    expect(onApply).toHaveBeenCalledWith({ hour: 2, minute: 14, weather: '下雨' });
  });

  /**
   * 這裡允許往回撥，AI 的 TIME|set= 不允許——差別在誰在操作：
   * AI 是每回合自動輸出，往回撥會讓時間在自己的敘事裡反覆橫跳；
   * 玩家是看著錯誤的數字手動修。
   */
  it('允許把時鐘往回撥', async () => {
    const user = userEvent.setup();
    const { onApply } = setup({ hour: 22, minute: 0 });
    const box = screen.getByLabelText('小時');
    await user.clear(box);
    await user.type(box, '7');
    await user.click(screen.getByText('套用'));
    expect(onApply).toHaveBeenCalledWith({ hour: 7, minute: 0, weather: '晴朗' });
  });

  it('沒有任何改動時套用鈕停用', () => {
    setup();
    expect(screen.getByText('套用')).toBeDisabled();
  });

  it('取消不套用', async () => {
    const user = userEvent.setup();
    const { onApply, onClose } = setup();
    await user.click(screen.getByText('下雨'));
    await user.click(screen.getByText('取消'));
    expect(onApply).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  /** 超出範圍的輸入直接夾住，不要讓 25:99 傳出去 */
  it.each([
    ['小時', '99', 23],
    ['分鐘', '80', 59],
  ])('%s 超出範圍時夾在上限', async (label, typed, expected) => {
    const user = userEvent.setup();
    const { onApply } = setup();
    const box = screen.getByLabelText(label);
    await user.clear(box);
    await user.type(box, typed);
    await user.click(screen.getByText('套用'));
    const arg = onApply.mock.calls[0][0];
    expect(label === '小時' ? arg.hour : arg.minute).toBe(expected);
  });
});
