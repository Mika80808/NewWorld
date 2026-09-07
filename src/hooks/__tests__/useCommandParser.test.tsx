// @vitest-environment jsdom
import '../../test/setupDom';
import { describe, it, expect, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useCommandParser, CommandParserDeps } from '../useCommandParser';
import { Npc, ItemEntry, LorebookEntry, MemoryEntry } from '../../types';

/**
 * 釘住一個實際壞掉過的行為：`parseAndExecuteCommands` 是在 AI 回應**回來之後**
 * 才被呼叫的，而它是玩家按下送出那一次 render 產生的閉包。串流期間玩家做的
 * 任何編輯（釘選、寫記憶、改設定集、丟道具、地圖旅行）都會被 reducer 用舊快照
 * 算出來的整份 `setNpcs / setItems / setLorebookEntries` 洗掉。
 *
 * 測法：拿**第一次 render** 回傳的 `parseAndExecuteCommands`，先 rerender 換上新的
 * deps（模擬串流期間的編輯），再呼叫舊的那支函數。正確行為是 reducer 讀到的
 * 是新 deps。
 */

const npc = (over: Partial<Npc> = {}): Npc => ({
  id: 1, name: '芬里爾', affection: 10, category: 'NPC', isActive: true, memories: [], ...over,
});

const loc = (over: Partial<LorebookEntry> = {}): LorebookEntry => ({
  id: 1, title: '月湖鎮', content: '', category: '地點', isActive: true, mapStatus: 'known', ...over,
});

const makeDeps = (over: Partial<CommandParserDeps> = {}): CommandParserDeps => ({
  timeState: { year: 1024, month: 4, day: 15, hour: 12, minute: 0, weather: '晴朗' },
  profile: { name: '玩家', job: '異鄉人', appearance: '', personality: '', other: '', hp: 50, mp: 20, gold: 100 },
  currentLocation: '月湖鎮',
  quests: [], memories: [], items: [], itemCatalog: {},
  npcs: [npc()], lorebookEntries: [loc()], statusEffects: [], factions: [],
  stickyCounters: {}, cooldownCounters: {}, messages: [],
  setTimeState: vi.fn(), setProfile: vi.fn(), setCurrentLocation: vi.fn(), setQuests: vi.fn(),
  setMemories: vi.fn(), setEquipment: vi.fn(), setItems: vi.fn(), setItemCatalog: vi.fn(),
  setNpcs: vi.fn(), setLorebookEntries: vi.fn(), setQuickOptions: vi.fn(),
  setStickyCounters: vi.fn(), setCooldownCounters: vi.fn(), setStatusEffects: vi.fn(),
  setFactions: vi.fn(),
  showToast: vi.fn(), notifyCommandResult: vi.fn(),
  callAI: vi.fn(async () => ''),
  ...over,
});

const wrap = (text: string) => `<<COMMANDS>>\n${text}\n<</COMMANDS>>`;

describe('useCommandParser — parseAndExecuteCommands 讀的是最新 state，不是送出當下的閉包', () => {
  it('串流期間釘選的角色，回應到達後仍然是釘選狀態', async () => {
    const setNpcs = vi.fn();
    const initial = makeDeps({ setNpcs });
    const { result, rerender } = renderHook((d: CommandParserDeps) => useCommandParser(d), {
      initialProps: initial,
    });
    // 玩家按下送出：此時拿到的是這一次 render 的函數
    const stale = result.current.parseAndExecuteCommands;

    // 串流期間玩家開角色卡釘選了芬里爾
    rerender(makeDeps({ setNpcs, npcs: [npc({ isPinned: true })] }));

    await act(async () => {
      await stale(wrap('AFFINITY|npc=芬里爾|delta=+5'));
    });

    const written = setNpcs.mock.calls.at(-1)?.[0] as Npc[];
    expect(written[0].isPinned).toBe(true);
    expect(written[0].affection).toBe(15);
  });

  it('串流期間丟掉的道具不會被回應洗回背包', async () => {
    const setItems = vi.fn();
    const potion: ItemEntry = { id: 1, name: '草藥', quantity: 2 };
    const { result, rerender } = renderHook((d: CommandParserDeps) => useCommandParser(d), {
      initialProps: makeDeps({ setItems, items: [potion] }),
    });
    const stale = result.current.parseAndExecuteCommands;

    // 串流期間玩家把草藥丟了
    rerender(makeDeps({ setItems, items: [] }));

    await act(async () => {
      await stale(wrap('STAT|field=hp|delta=-1'));
    });

    const written = setItems.mock.calls.at(-1)?.[0] as ItemEntry[];
    expect(written).toEqual([]);
  });

  /**
   * 地圖旅行（`handleTravel`）先 `setCurrentLocation(目的地)` 再送出訊息。
   * reducer 若讀到舊地點，`NPC_NEW` 的 homeLocation 與出場足跡都會寫成出發地。
   */
  it('回傳的 location 與同批 NPC_NEW 的主場，用的是旅行後的地點', async () => {
    const setLorebookEntries = vi.fn();
    const forest = loc({ id: 2, title: '迷霧森林' });
    const { result, rerender } = renderHook((d: CommandParserDeps) => useCommandParser(d), {
      initialProps: makeDeps({ setLorebookEntries, lorebookEntries: [loc(), forest] }),
    });
    const stale = result.current.parseAndExecuteCommands;

    rerender(makeDeps({
      setLorebookEntries,
      lorebookEntries: [loc(), forest],
      currentLocation: '迷霧森林',
    }));

    let res: Awaited<ReturnType<typeof stale>> | undefined;
    await act(async () => {
      res = await stale(wrap('NPC_NEW|name=獵人'));
    });

    expect(res?.location).toBe('迷霧森林');
    const entries = setLorebookEntries.mock.calls.at(-1)?.[0] as LorebookEntry[];
    expect(entries.find(e => e.title === '獵人')?.homeLocation).toBe('迷霧森林');
  });

  it('newItems 以最新背包為基準：串流期間已入袋的道具不算新', async () => {
    const potion: ItemEntry = { id: 1, name: '草藥', quantity: 1 };
    const { result, rerender } = renderHook((d: CommandParserDeps) => useCommandParser(d), {
      initialProps: makeDeps({ items: [] }),
    });
    const stale = result.current.parseAndExecuteCommands;

    rerender(makeDeps({ items: [potion] }));

    let res: Awaited<ReturnType<typeof stale>> | undefined;
    await act(async () => {
      res = await stale(wrap('ITEM_ADD|name=草藥|qty=1|desc=回復'));
    });
    expect(res?.newItems).toEqual([]);
  });
});

/**
 * `trigger.cooldown`（冷卻 N 則）先前只有一條生效路徑：sticky 從 1 遞減到 0 時。
 * 而 stickyCounters 只有 `trigger.sticky` 為真的記憶才會被寫進去——
 * `sticky: 0, cooldown: 5`（sticky 的預設值就是 0）的記憶永遠不會出現在那裡，
 * cooldown 一次都沒生效過。玩家把冷卻設成 10，那條記憶照樣每回合注入，
 * 而且沒有任何跡象。
 */
describe('useCommandParser — tickMemoryCounters 的 cooldown', () => {
  const memOf = (over: Partial<MemoryEntry> = {}): MemoryEntry => ({
    id: 'mem_1_a', type: 'scene', importance: 'normal', content: '酒館被砸毀',
    tags: { locations: [], npcs: [], factions: [], keywords: [] },
    trigger: { scanDepth: 5, probability: 100, sticky: 0, cooldown: 0 },
    isActive: true, source: 'ai_generated', createdAt: '4/15',
    ...over,
  });

  /** setState 的 functional update 攤平成實際寫入值 */
  const applyUpdater = (
    fn: ReturnType<typeof vi.fn>,
    prev: Record<string, number>,
  ): Record<string, number> => {
    const updater = fn.mock.calls.at(-1)?.[0];
    return typeof updater === 'function' ? updater(prev) : updater;
  };

  it('sticky = 0 的記憶觸發後直接進 cooldown', () => {
    const setStickyCounters = vi.fn();
    const setCooldownCounters = vi.fn();
    const memory = memOf({ trigger: { scanDepth: 5, probability: 100, sticky: 0, cooldown: 5 } });
    const { result } = renderHook((d: CommandParserDeps) => useCommandParser(d), {
      initialProps: makeDeps({ memories: [memory], setStickyCounters, setCooldownCounters }),
    });

    act(() => { result.current.tickMemoryCounters([memory.id]); });

    // sticky 的 updater 必須先跑：cooldown 的分支讀它捕捉到的遞減前快照
    applyUpdater(setStickyCounters, {});
    expect(applyUpdater(setCooldownCounters, {})[memory.id]).toBe(5);
  });

  it('cooldown = 0 時不寫入計數器', () => {
    const setStickyCounters = vi.fn();
    const setCooldownCounters = vi.fn();
    const memory = memOf();
    const { result } = renderHook((d: CommandParserDeps) => useCommandParser(d), {
      initialProps: makeDeps({ memories: [memory], setStickyCounters, setCooldownCounters }),
    });

    act(() => { result.current.tickMemoryCounters([memory.id]); });

    applyUpdater(setStickyCounters, {});
    expect(applyUpdater(setCooldownCounters, {})[memory.id]).toBeUndefined();
  });

  it('sticky > 0 時維持原行為：撐完 sticky 才進 cooldown', () => {
    const setStickyCounters = vi.fn();
    const setCooldownCounters = vi.fn();
    const memory = memOf({ trigger: { scanDepth: 5, probability: 100, sticky: 3, cooldown: 5 } });
    const { result } = renderHook((d: CommandParserDeps) => useCommandParser(d), {
      initialProps: makeDeps({ memories: [memory], setStickyCounters, setCooldownCounters }),
    });

    // 觸發的這一回合：只設 sticky，不進 cooldown
    act(() => { result.current.tickMemoryCounters([memory.id]); });
    applyUpdater(setStickyCounters, {});
    expect(applyUpdater(setCooldownCounters, {})[memory.id]).toBeUndefined();

    // sticky 剩 1 且本回合沒再觸發 → 歸零並進 cooldown
    act(() => { result.current.tickMemoryCounters([]); });
    applyUpdater(setStickyCounters, { [memory.id]: 1 });
    expect(applyUpdater(setCooldownCounters, {})[memory.id]).toBe(5);
  });
});
