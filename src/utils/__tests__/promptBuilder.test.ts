import { describe, it, expect } from 'vitest';
import { buildPrompt, BuildPromptDeps } from '../promptBuilder';

const deps = (): BuildPromptDeps => ({
  profile: { name: '玩家', job: '異鄉人', appearance: '', personality: '', other: '', hp: 50, mp: 20, gold: 100 },
  systemPrompt: { worldPremise: '奇幻世界', roleplayRules: '規則', writingStyle: '風格' },
  npcs: [],
  appearingNpcs: [],
  lorebookEntries: [],
  memories: [],
  equipment: [],
  items: [{ id: 1, name: '草藥', quantity: 2, description: '回復 20 HP' }],
  itemCatalog: { 草藥: { name: '草藥', description: '回復 20 HP', createdAt: '4/1', lastUsedAt: 1 } },
  quests: [],
  timeState: { year: 1024, month: 4, day: 15, hour: 12, minute: 0, weather: '晴朗' },
  currentLocation: '月湖鎮',
  diaryEntries: [],
  statusEffects: [],
  factions: [],
  scanKeywords: () => false,
  isMemoryTriggered: () => false,
});

describe('buildPrompt — 隱式快取排版（穩定前綴在前，動態內容在後）', () => {
  it('COMMAND FORMAT（靜態）在 Current State（動態）之前', () => {
    const prompt = buildPrompt(deps(), '你好', []);
    const formatIdx = prompt.indexOf('[COMMAND FORMAT');
    const stateIdx = prompt.indexOf('[Current State]');
    expect(formatIdx).toBeGreaterThan(-1);
    expect(stateIdx).toBeGreaterThan(-1);
    expect(formatIdx).toBeLessThan(stateIdx);
  });

  it('System Context 是 prompt 開頭', () => {
    const prompt = buildPrompt(deps(), '你好', []);
    expect(prompt.startsWith('[System Context]')).toBe(true);
  });

  it('玩家輸入在 prompt 尾端（COMMAND FORMAT 之後）', () => {
    const prompt = buildPrompt(deps(), '我去藥草店', []);
    const inputIdx = prompt.lastIndexOf('Player: 我去藥草店');
    const formatIdx = prompt.indexOf('[COMMAND FORMAT');
    expect(inputIdx).toBeGreaterThan(formatIdx);
  });

  it('已知物品切片注入名稱清單', () => {
    const prompt = buildPrompt(deps(), '你好', []);
    expect(prompt).toContain('[已知物品');
    expect(prompt).toContain('草藥');
  });
});
