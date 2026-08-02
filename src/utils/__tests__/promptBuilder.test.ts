import { describe, it, expect } from 'vitest';
import { buildPrompt, BuildPromptDeps } from '../promptBuilder';
import { MemoryEntry, Message } from '../../types';

const mem = (id: string, content: string, over: Partial<MemoryEntry> = {}): MemoryEntry => ({
  id,
  type: 'world',
  importance: 'normal',
  content,
  tags: { locations: [], npcs: [], factions: [], keywords: [] },
  trigger: { scanDepth: 5, probability: 100, sticky: 0, cooldown: 0 },
  isActive: true,
  source: 'manual',
  createdAt: '4/15',
  ...over,
});

const deps = (memories: MemoryEntry[], isMemoryTriggered: BuildPromptDeps['isMemoryTriggered']): BuildPromptDeps => ({
  profile: { name: '測試者', job: '異鄉人', appearance: '', personality: '', other: '', hp: 50, mp: 0, gold: 0 },
  systemPrompt: { worldPremise: '', roleplayRules: '', writingStyle: '' },
  npcs: [],
  appearingNpcs: [],
  lorebookEntries: [],
  memories,
  equipment: [],
  items: [],
  itemCatalog: {},
  quests: [],
  timeState: { year: 1024, month: 4, day: 15, hour: 12, minute: 0, weather: '晴朗' },
  currentLocation: '月湖鎮',
  diaryEntries: [],
  statusEffects: [],
  factions: [],
  scanKeywords: () => false,
  isMemoryTriggered,
});

const messages: Message[] = [{ id: 1, role: 'user', text: '你好' }];

describe('buildPrompt 記憶觸發判定', () => {
  it('每則記憶只評估一次（isMemoryTriggered 含機率擲骰，不可重複呼叫）', () => {
    const memories = [mem('m1', 'A'), mem('m2', 'B'), mem('m3', 'C')];
    const calls: string[] = [];

    buildPrompt(deps(memories, m => { calls.push(m.id); return true; }), '測試輸入', messages);

    expect(calls).toEqual(['m1', 'm2', 'm3']);
  });

  it('triggeredMemoryIds 只包含判定為 true 的記憶', () => {
    const memories = [mem('m1', 'A'), mem('m2', 'B'), mem('m3', 'C')];

    const { triggeredMemoryIds } = buildPrompt(
      deps(memories, m => m.id !== 'm2'),
      '測試輸入',
      messages,
    );

    expect(triggeredMemoryIds).toEqual(['m1', 'm3']);
  });

  it('回報的 id 與注入 prompt 的內容一致（機率型記憶不會脫鉤）', () => {
    // 模擬 probability < 100：第一次呼叫 true、之後 false。
    // 若實作重複呼叫 isMemoryTriggered，注入內容與回報 id 就會對不上。
    const memories = [mem('m1', '只會通過一次的記憶')];
    let seen = 0;

    const { prompt, triggeredMemoryIds } = buildPrompt(
      deps(memories, () => ++seen === 1),
      '測試輸入',
      messages,
    );

    expect(seen).toBe(1);
    expect(triggeredMemoryIds).toEqual(['m1']);
    expect(prompt).toContain('只會通過一次的記憶');
  });

  it('沒有記憶觸發時回傳空陣列，World Memory 區塊顯示（無）', () => {
    const { prompt, triggeredMemoryIds } = buildPrompt(
      deps([mem('m1', 'A')], () => false),
      '測試輸入',
      messages,
    );

    expect(triggeredMemoryIds).toEqual([]);
    expect(prompt).toContain('[🌍 World Memory]\n（無）');
  });
});
