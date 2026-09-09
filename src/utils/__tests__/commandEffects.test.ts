import { describe, it, expect, vi } from 'vitest';
import { applyStateChanges, Setters, Callbacks } from '../commandEffects';
import { AsyncTask } from '../commandReducer';
import { Npc, NpcMemory } from '../../types';

const npcMem = (id: string, text: string, over: Partial<NpcMemory> = {}): NpcMemory => ({
  id, text, createdAt: '4/15', source: 'pre_merge', importance: 'normal', ...over,
});

const npc = (over: Partial<Npc> = {}): Npc => ({
  id: 1, name: '芬里爾', affection: 10,
  memories: [], ...over,
});

/**
 * 只有 setNpcs 會被這兩個任務用到；其餘 setter 給 noop。
 * setNpcs 收 updater 之後直接套在 `state` 上，讓測試讀得到結果。
 */
const harness = (initial: Npc[]) => {
  let state = initial;
  const setNpcs = vi.fn((updater: unknown) => {
    state = typeof updater === 'function'
      ? (updater as (p: Npc[]) => Npc[])(state)
      : (updater as Npc[]);
  });
  const noop = vi.fn();
  const setters = new Proxy({ setNpcs } as unknown as Setters, {
    get: (target, key) => (key === 'setNpcs' ? setNpcs : noop),
  });
  return { setters, getState: () => state, setNpcs };
};

const callbacksWith = (aiReply: string | Error) => {
  const callAI = vi.fn(async (_prompt: string, _role?: 'main' | 'sub') => {
    if (aiReply instanceof Error) throw aiReply;
    return aiReply;
  });
  return {
    callbacks: { showToast: vi.fn(), notifyCommandResult: vi.fn(), callAI } as unknown as Callbacks,
    callAI,
    showToast: (undefined as unknown),
  };
};

const condenseTask = (over: Partial<AsyncTask & { payload: unknown }> = {}): AsyncTask => ({
  type: 'condense_npc_thoughts',
  payload: {
    npcId: 1,
    npcName: '芬里爾',
    memoryId: 'm1', originalText: '原文',
    thoughts: [
      { text: '第一則想法', createdAt: '4/1' },
      { text: '第二則想法', createdAt: '4/3' },
    ],
  },
  ...over,
} as AsyncTask);

const run = (tasks: AsyncTask[], setters: Setters, callbacks: Callbacks) =>
  applyStateChanges({}, { toasts: [], cmdResults: [] }, tasks, setters, callbacks);

it('does not archive NPC memories edited while merging', async () => {
  const original = npcMem('m1', 'original');
  const edited = { ...original, text: 'player correction', source: 'manual' as const };
  const h = harness([npc({ memories: [edited] })]);
  const { callbacks } = callbacksWith('stale summary');
  await run([{ type: 'merge_npc_memories', payload: {
    npcId: 1, npcName: '芬里爾', memories: [original], gameDate: '4/15',
  } } as AsyncTask], h.setters, callbacks);
  expect(h.getState()[0].memories).toEqual([edited]);
});

// 玩家回報：「10 則想法大約 1000 字左右，而且劇情密度意外的高。」
// 打包同步寫入原文（保底），這個任務之後把 text 換成濃縮版。
describe('applyStateChanges — condense_npc_thoughts', () => {
  it('成功時把那條記憶的 text 換成濃縮結果', async () => {
    const h = harness([npc({ memories: [npcMem('m1', '原文')] })]);
    const { callbacks } = callbacksWith('濃縮後的回憶');
    await run([condenseTask()], h.setters, callbacks);
    expect(h.getState()[0].memories[0].text).toBe('濃縮後的回憶');
  });

  it('去掉 AI 回覆的前後空白', async () => {
    const h = harness([npc({ memories: [npcMem('m1', '原文')] })]);
    const { callbacks } = callbacksWith('\n  濃縮後的回憶  \n');
    await run([condenseTask()], h.setters, callbacks);
    expect(h.getState()[0].memories[0].text).toBe('濃縮後的回憶');
  });

  /**
   * ⚠️ callAI 在 API key 未設定時回傳**空字串**而非 throw。
   * 少了這道防護會把整條記憶清成空的——那 10 則想法就真的消失了
   * （thoughts[] 在 reducer 那步已經清空）。
   */
  it('AI 回空字串時保留原文，不清空記憶', async () => {
    const h = harness([npc({ memories: [npcMem('m1', '原文')] })]);
    const { callbacks } = callbacksWith('   ');
    await run([condenseTask()], h.setters, callbacks);
    expect(h.getState()[0].memories[0].text).toBe('原文');
  });

  it('AI 丟錯時保留原文，且不讓整批副作用炸掉', async () => {
    const h = harness([npc({ memories: [npcMem('m1', '原文')] })]);
    const { callbacks } = callbacksWith(new Error('network'));
    await expect(run([condenseTask()], h.setters, callbacks)).resolves.toBeUndefined();
    expect(h.getState()[0].memories[0].text).toBe('原文');
  });

  it('只動指定的那一條，其他記憶不受影響', async () => {
    const h = harness([npc({ memories: [npcMem('m0', '別條'), npcMem('m1', '原文'), npcMem('m2', '又一條')] })]);
    const { callbacks } = callbacksWith('濃縮後');
    await run([condenseTask()], h.setters, callbacks);
    expect(h.getState()[0].memories.map(m => m.text)).toEqual(['別條', '濃縮後', '又一條']);
  });

  it('沒有想法時完全不呼叫 AI', async () => {
    const h = harness([npc({ memories: [npcMem('m1', '原文')] })]);
    const { callbacks, callAI } = callbacksWith('濃縮後');
    await run([condenseTask({ payload: { npcId: 1, npcName: '芬里爾', memoryId: 'm1', originalText: '原文', thoughts: [] } })], h.setters, callbacks);
    expect(callAI).not.toHaveBeenCalled();
  });

  /**
   * 這段文字會寫進存檔並在之後每回合注入主 GM，語言／人稱／長度都要講死——
   * 少講一項模型就自己決定，而那個決定會沿著記憶鏈一路擴散。
   */
  it('提示詞講明繁體中文、第一人稱與字數上限', async () => {
    const h = harness([npc({ memories: [npcMem('m1', '原文')] })]);
    const { callbacks, callAI } = callbacksWith('濃縮後');
    await run([condenseTask()], h.setters, callbacks);
    const prompt = callAI.mock.calls[0][0];
    expect(prompt).toContain('繁體中文');
    expect(prompt).toContain('第一人稱');
    expect(prompt).toContain('200 字以內');
    expect(prompt).toContain('芬里爾');
  });

  it('提示詞帶上日期範圍與全部原文', async () => {
    const h = harness([npc({ memories: [npcMem('m1', '原文')] })]);
    const { callbacks, callAI } = callbacksWith('濃縮後');
    await run([condenseTask()], h.setters, callbacks);
    const prompt = callAI.mock.calls[0][0];
    expect(prompt).toContain('4/1～4/3');
    expect(prompt).toContain('第一則想法');
    expect(prompt).toContain('第二則想法');
  });

  it('走助理 GM（sub），不佔用主 GM', async () => {
    const h = harness([npc({ memories: [npcMem('m1', '原文')] })]);
    const { callbacks, callAI } = callbacksWith('濃縮後');
    await run([condenseTask()], h.setters, callbacks);
    expect(callAI.mock.calls[0][1]).toBe('sub');
  });
});


it.each([
  {source:'manual' as const, text:'玩家修正'},
  {source:'pre_merge' as const, text:'新的內容'},
  {source:'pre_merge' as const, text:'原文', isMerged:true},
  {source:'pre_merge' as const, text:'原文', importance:'core' as const},
])('濃縮結果不覆蓋已修改或封存的記憶 %j', async updates => {
  const current=npcMem('m1','原文',updates);
  const h=harness([npc({memories:[current]})]);
  const {callbacks}=callbacksWith('過時的濃縮');
  await run([condenseTask()],h.setters,callbacks);
  expect(h.getState()[0].memories).toEqual([current]);
});
