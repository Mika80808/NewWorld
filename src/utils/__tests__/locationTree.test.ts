import { describe, it, expect } from 'vitest';
import { rootLocationOf, isSameCity, childLocationsOf, MAX_LOCATION_DEPTH } from '../locationTree';
import { LorebookEntry } from '../../types';

const loc = (title: string, over: Partial<LorebookEntry> = {}): LorebookEntry => ({
  id: Math.floor(Math.random() * 1e6), title, content: '',
  category: '地點', isActive: true, ...over,
});

// 月湖鎮
//  ├ 醉醺醺酒館
//  └ 鐵匠鋪
// 迷霧森林（獨立）
const town = () => [
  loc('月湖鎮', { locationType: 'town' }),
  loc('醉醺醺酒館', { locationType: 'building', parentLocation: '月湖鎮' }),
  loc('鐵匠鋪', { locationType: 'building', parentLocation: '月湖鎮' }),
  loc('迷霧森林', { locationType: 'wilderness' }),
];

describe('rootLocationOf', () => {
  it('城內建築往上找到城鎮', () => {
    expect(rootLocationOf(town(), '醉醺醺酒館')).toBe('月湖鎮');
  });

  it('沒有母地點的地點 root 是自己', () => {
    expect(rootLocationOf(town(), '月湖鎮')).toBe('月湖鎮');
    expect(rootLocationOf(town(), '迷霧森林')).toBe('迷霧森林');
  });

  it('多層往上一路找到頂', () => {
    const entries = [
      loc('王國'),
      loc('月湖鎮', { parentLocation: '王國' }),
      loc('醉醺醺酒館', { parentLocation: '月湖鎮' }),
    ];
    expect(rootLocationOf(entries, '醉醺醺酒館')).toBe('王國');
  });

  /**
   * `parentLocation` 是自由填寫的名稱，玩家或 AI 完全可能寫出環。
   * 少了防線這裡會無窮迴圈把整個分頁凍住。
   */
  it('母地點成環時不會無限迴圈', () => {
    const entries = [
      loc('A', { parentLocation: 'B' }),
      loc('B', { parentLocation: 'A' }),
    ];
    expect(['A', 'B']).toContain(rootLocationOf(entries, 'A'));
  });

  it('自己指向自己時停住', () => {
    expect(rootLocationOf([loc('A', { parentLocation: 'A' })], 'A')).toBe('A');
  });

  it('超過深度上限就停在該層，不再往上', () => {
    const chain = Array.from({ length: 10 }, (_, i) =>
      loc(`L${i}`, { parentLocation: i < 9 ? `L${i + 1}` : undefined }),
    );
    expect(rootLocationOf(chain, 'L0')).toBe(`L${MAX_LOCATION_DEPTH}`);
  });

  // 查不到條目時退回「字串相等」的舊行為，而不是把查不到的地點全湊成一堆
  it('查無此地點時回傳原名', () => {
    expect(rootLocationOf(town(), '不存在的地方')).toBe('不存在的地方');
  });

  it('空字串安全', () => {
    expect(rootLocationOf(town(), '')).toBe('');
  });
});

// 玩家回報：「原本在月湖鎮裡開店的 NPC 應該會出現在月湖鎮的各個地方，
// 而不是只待在店裡。」候選名單原本是字串完全相等比對。
describe('isSameCity', () => {
  it('母子關係算同城（月湖鎮 ↔ 醉醺醺酒館）', () => {
    expect(isSameCity(town(), '醉醺醺酒館', '月湖鎮')).toBe(true);
    expect(isSameCity(town(), '月湖鎮', '醉醺醺酒館')).toBe(true);
  });

  /** 玩家說的是「月湖鎮的**各個地方**」，不是只有大街上 */
  it('兄弟關係算同城（酒館 ↔ 鐵匠鋪）', () => {
    expect(isSameCity(town(), '醉醺醺酒館', '鐵匠鋪')).toBe(true);
  });

  it('自己與自己算同城', () => {
    expect(isSameCity(town(), '月湖鎮', '月湖鎮')).toBe(true);
  });

  it('不同城不算', () => {
    expect(isSameCity(town(), '醉醺醺酒館', '迷霧森林')).toBe(false);
  });

  /** 兩個都沒有母地點的野外各自是自己的 root，不該被湊成同一座城 */
  it('兩個無母地點的獨立地點不算同城', () => {
    const entries = [loc('迷霧森林'), loc('大斷崖')];
    expect(isSameCity(entries, '迷霧森林', '大斷崖')).toBe(false);
  });

  it('空字串一律不算同城', () => {
    expect(isSameCity(town(), '', '月湖鎮')).toBe(false);
    expect(isSameCity(town(), '月湖鎮', '')).toBe(false);
  });
});

describe('childLocationsOf', () => {
  it('列出這座城底下的地點', () => {
    expect(childLocationsOf(town(), '月湖鎮')).toEqual(['醉醺醺酒館', '鐵匠鋪']);
  });

  it('只往下一層', () => {
    const entries = [
      loc('王國'),
      loc('月湖鎮', { parentLocation: '王國' }),
      loc('醉醺醺酒館', { parentLocation: '月湖鎮' }),
    ];
    expect(childLocationsOf(entries, '王國')).toEqual(['月湖鎮']);
  });

  it('停用的條目不列入', () => {
    const entries = [
      loc('月湖鎮'),
      loc('廢棄倉庫', { parentLocation: '月湖鎮', isActive: false }),
    ];
    expect(childLocationsOf(entries, '月湖鎮')).toEqual([]);
  });

  it('沒有子地點時回傳空陣列', () => {
    expect(childLocationsOf(town(), '迷霧森林')).toEqual([]);
    expect(childLocationsOf(town(), '')).toEqual([]);
  });
});
