import { describe, it, expect } from 'vitest';
import { isNpcOnStage, updateNpcFootprints } from '../npcPresence';

// 場上名單的唯一真相是 appearingNpcs（AI 每回應輸出的 [出場:] 標記）。
// 先前右欄「當前場景人物」還會認 `n.location === currentLocation`，
// 而那個欄位是**足跡**、退場時從不清除——角色只要在月湖鎮出現過一次，
// 之後玩家還在月湖鎮就永遠留在清單裡，明明已經被 [出場:] 請下台了。
describe('isNpcOnStage', () => {
  it('在名單上就是在場', () => {
    expect(isNpcOnStage('芬里爾', ['芬里爾', '萊尼'])).toBe(true);
  });

  it('不在名單上就是不在場', () => {
    expect(isNpcOnStage('凱爾', ['芬里爾'])).toBe(false);
  });

  /** 與 promptBuilder 的 inScene 判定一致：AI 可能只輸出部分名字 */
  it('前後包含都算（凱爾 ↔ 凱爾·溫德）', () => {
    expect(isNpcOnStage('凱爾·溫德', ['凱爾'])).toBe(true);
    expect(isNpcOnStage('凱爾', ['凱爾·溫德'])).toBe(true);
  });

  /** 空名單是「現場無人」，不是「所有人都在」 */
  it('空名單一律不在場', () => {
    expect(isNpcOnStage('芬里爾', [])).toBe(false);
  });
});

// 玩家回報的相鄰問題：NPC 只要在敘事裡**被提到**就會被記成在場。
// `App.tsx` 先前除了依 [出場:] 名單更新足跡之外，還多跑一次
// `narrative.includes(npc.name)`，於是「你聽說芬里爾去了北境」會把芬里爾的
// 「最後出現於」寫成當前地點——而那個欄位會注入 prompt。
describe('updateNpcFootprints', () => {
  const npc = (name: string, over: Record<string, unknown> = {}) => ({
    name, location: '', lastSeenLocation: '', lastSeenDate: '', ...over,
  });

  it('出場的角色寫入足跡', () => {
    const out = updateNpcFootprints([npc('芬里爾')], ['芬里爾'], '月湖鎮', '4/15');
    expect(out[0]).toMatchObject({
      location: '月湖鎮', lastSeenLocation: '月湖鎮', lastSeenDate: '4/15',
    });
  });

  it('不在名單上的角色完全不動', () => {
    const before = npc('萊尼', { lastSeenLocation: '北境哨站', lastSeenDate: '4/1' });
    const out = updateNpcFootprints([npc('芬里爾'), before], ['芬里爾'], '月湖鎮', '4/15');
    expect(out[1]).toBe(before);
    expect(out[1].lastSeenLocation).toBe('北境哨站');
  });

  /** 名單以外的名字出現在敘事裡是常態（轉述、回憶），不該被當成在場 */
  it('只被提到、不在名單上的角色不會被寫入足跡', () => {
    const out = updateNpcFootprints([npc('芬里爾')], ['萊尼'], '月湖鎮', '4/15');
    expect(out[0].lastSeenLocation).toBe('');
  });

  /** 與 promptBuilder、右欄「當前場景人物」同一套前後包含規則 */
  it('AI 只給了部分名字時仍比得到（凱爾 → 凱爾·溫德）', () => {
    const out = updateNpcFootprints([npc('凱爾·溫德')], ['凱爾'], '月湖鎮', '4/15');
    expect(out[0].lastSeenLocation).toBe('月湖鎮');
  });

  /**
   * 空的 [出場:] 是「現場無人」，不是「更新所有人」。
   * 而且無變更時要回傳原 reference，否則每回合都產生新陣列，
   * 存檔的髒標記會永遠為髒（與 memoryStore 的 pruneMemories 同理）。
   */
  it('名單為空時原樣回傳同一個陣列', () => {
    const list = [npc('芬里爾')];
    expect(updateNpcFootprints(list, [], '月湖鎮', '4/15')).toBe(list);
  });

  it('沒有任何人比中時也回傳原陣列', () => {
    const list = [npc('芬里爾')];
    expect(updateNpcFootprints(list, ['完全不相干的人'], '月湖鎮', '4/15')).toBe(list);
  });

  it('不改動傳入的陣列與物件（純函數）', () => {
    const original = npc('芬里爾');
    const list = [original];
    updateNpcFootprints(list, ['芬里爾'], '月湖鎮', '4/15');
    expect(original.lastSeenLocation).toBe('');
    expect(list[0]).toBe(original);
  });
});
