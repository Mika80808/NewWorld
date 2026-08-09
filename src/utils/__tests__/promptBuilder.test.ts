import { describe, it, expect } from 'vitest';
import { buildPrompt, BuildPromptDeps } from '../promptBuilder';
import { MemoryEntry, Message, Npc, LorebookEntry } from '../../types';

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
  summaryPool: [],
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

  it('沒有記憶觸發時回傳空陣列，World Memory 區塊整段省略', () => {
    const { prompt, triggeredMemoryIds } = buildPrompt(
      deps([mem('m1', 'A')], () => false),
      '測試輸入',
      messages,
    );

    expect(triggeredMemoryIds).toEqual([]);
    expect(prompt).not.toContain('[🌍 World Memory]');
  });
});

// B-1：靜態層（世界觀／玩家設定／指令規格）必須排在所有變動內容之前。
// Gemini 的 context caching 是前綴匹配，COMMAND FORMAT 這塊約 1.5k tokens 的固定
// 內容先前排在 Recent Chat 之後，永遠不可能命中快取。
describe('buildPrompt — 靜態前綴排序', () => {
  const prompt = () => buildPrompt(deps([], () => false), '測試輸入', messages).prompt;

  it('COMMAND FORMAT 排在 Recent Chat 之前', () => {
    const p = prompt();
    expect(p.indexOf('[COMMAND FORMAT')).toBeLessThan(p.indexOf('[Recent Chat'));
  });

  it('System Context 是整份 prompt 的開頭', () => {
    expect(prompt().startsWith('[System Context]')).toBe(true);
  });

  it('靜態三段依序在最前：System Context → Player → COMMAND FORMAT', () => {
    const p = prompt();
    expect(p.indexOf('[System Context]')).toBeLessThan(p.indexOf('[Player]'));
    expect(p.indexOf('[Player]')).toBeLessThan(p.indexOf('[COMMAND FORMAT'));
  });

  // 動作指示留在最後，模型才知道「讀完以上，現在輪到你」
  it('Please respond as the DM. 仍在最末', () => {
    expect(prompt().trimEnd().endsWith('Please respond as the DM.')).toBe(true);
  });

  // 靜態前綴必須逐回合逐字一致，否則快取每回合都失效
  it('不同回合的靜態前綴完全相同（含不同地點、時間、輸入）', () => {
    const prefixOf = (p: string) => p.slice(0, p.indexOf('[Current State]'));
    const a = buildPrompt(deps([], () => false), '第一次輸入', messages).prompt;
    const b = buildPrompt(
      { ...deps([], () => false), timeState: { year: 1025, month: 9, day: 2, hour: 3, minute: 30, weather: '暴雨' } },
      '完全不同的輸入',
      [...messages, { id: 2, role: 'assistant', text: '後續劇情' }],
      '迷霧森林',
    ).prompt;
    expect(prefixOf(a)).toBe(prefixOf(b));
  });
});

// AI 先前把新地點全建在原點附近（±10），整批疊在月湖鎮(0,0)：
// 靜態的 COMMAND FORMAT 只給得起「月湖鎮=0,0」一個參考點，模型沒有尺度概念。
describe('buildPrompt — 地圖尺規', () => {
  const locs: LorebookEntry[] = [
    { id: 1, title: '月湖鎮', content: '', category: '地點', isActive: true, mapX: 0, mapY: 0 },
    { id: 2, title: '迷霧森林', content: '', category: '地點', isActive: true, mapX: 100, mapY: 50 },
    { id: 3, title: '沒座標的地方', content: '', category: '地點', isActive: true },
    { id: 4, title: '芬里爾', content: '', category: 'NPC', isActive: true },
  ];
  const build = (entries: LorebookEntry[]) =>
    buildPrompt({ ...deps([], () => false), lorebookEntries: entries }, '測試輸入', messages).prompt;

  // 指令規格那段會提到「下方 [已知地點座標]」指路，比對時要用完整標題才不會抓到它
  const HEADER = '[已知地點座標（世界地圖尺規';

  it('注入已知地點的實際座標當尺規', () => {
    const p = build(locs);
    expect(p).toContain(HEADER);
    expect(p).toContain('月湖鎮(0,0)');
    expect(p).toContain('迷霧森林(100,50)');
  });

  it('沒有座標的地點與非地點條目不列入', () => {
    const p = build(locs);
    expect(p).not.toContain('沒座標的地方');
    expect(p).not.toContain('芬里爾(');
  });

  it('一個有座標的地點都沒有時整段省略', () => {
    expect(build([locs[2], locs[3]])).not.toContain(HEADER);
  });

  // 尺規會隨新地點變動，放進靜態前綴會讓每次探索都打掉 context caching
  it('尺規排在靜態前綴之後', () => {
    const p = build(locs);
    expect(p.indexOf('[Current State]')).toBeLessThan(p.indexOf(HEADER));
  });

  it('指令規格要求 type 並警告座標尺度', () => {
    const p = build(locs);
    expect(p).toContain('LOCATION_DISCOVER|name=地點名稱|x=110|y=70|type=wilderness');
    expect(p).toContain('只有常駐地點');
    expect(p).toMatch(/不要輸出 -10~10 的小數字/);
  });
});

// B-5：空區塊整段省略，不留「（無）」佔位（Minimal Viable Context）
describe('buildPrompt — 空區塊省略', () => {
  it('全空時不出現任何「（無）」佔位', () => {
    expect(buildPrompt(deps([], () => false), '測試輸入', messages).prompt).not.toContain('（無）');
  });

  it('沒有任務／裝備／狀態時，相關區塊標題不出現', () => {
    const { prompt } = buildPrompt(deps([], () => false), '測試輸入', messages);
    for (const title of ['[進行中任務]', '[Inventory]', '[Active Diary]', '[Pinned NPCs]', '[Scene Lorebook]', 'Status Effects:']) {
      expect(prompt).not.toContain(title);
    }
  });

  it('有內容時區塊照常出現', () => {
    const { prompt } = buildPrompt(
      {
        ...deps([], () => false),
        quests: [{
          id: 'q1', title: '護送商隊', giver: '鎮長', description: '', reward: {},
          status: 'active', isGoalMet: false, createdAt: '4/15', createdAtTotalDays: 0,
        }],
      },
      '測試輸入',
      messages,
    );
    expect(prompt).toContain('[進行中任務]');
    expect(prompt).toContain('護送商隊');
  });

  // 「無已知角色在附近」是給 AI 的指示（可自由創造新角色），不是佔位符——
  // 被當成空區塊刪掉的話，AI 會不敢生成新角色
  it('「當前場景可能出現的角色」在沒有候選時仍保留指示句', () => {
    const { prompt } = buildPrompt(deps([], () => false), '測試輸入', messages);
    expect(prompt).toContain('[當前場景可能出現的角色]');
    expect(prompt).toContain('無已知角色在附近。若故事需要新角色請自由創造。');
  });
});

// 回歸：summaryPool 是助理 GM 產出的中期記憶，先前只流向日記、從不進 buildPrompt，
// 導致「最近 20 則對話」與「日記」之間整段對主 GM 不存在。
describe('buildPrompt — 前情提要（summaryPool）', () => {
  const withPool = (summaryPool: string[]) =>
    buildPrompt({ ...deps([], () => false), summaryPool }, '測試輸入', messages).prompt;

  it('池子有內容時逐條注入', () => {
    const prompt = withPool(['主角在月湖鎮接下了護衛委託', '主角於迷霧森林擊退了狼群']);
    expect(prompt).toContain('- 主角在月湖鎮接下了護衛委託');
    expect(prompt).toContain('- 主角於迷霧森林擊退了狼群');
  });

  it('池子為空時整段省略（不留標題與佔位文字）', () => {
    expect(withPool([])).not.toContain('[前情提要');
  });

  // 順序是語意的一部分：前情提要必須在最近對話之前，模型才會把它讀成「更早的事」
  it('前情提要排在 Recent Chat 之前', () => {
    const prompt = withPool(['較早的事件']);
    expect(prompt.indexOf('[前情提要')).toBeLessThan(prompt.indexOf('[Recent Chat'));
  });
});

// 回歸：systemPrompt 三段是模板，內含 {{user}} 指代玩家，但先前沒有任何替換步驟，
// 模型收到的是字面上的「{{user}}」。預設文案還有一處誤植成 {{userr}}。
describe('buildPrompt — {{user}} 佔位符替換', () => {
  const withSystemPrompt = (tpl: string) => buildPrompt(
    {
      ...deps([], () => false),
      systemPrompt: { worldPremise: tpl, roleplayRules: tpl, writingStyle: tpl },
    },
    '測試輸入',
    messages,
  ).prompt;

  it('替換為玩家名字', () => {
    const prompt = withSystemPrompt('{{user}}踏入了異世界');
    expect(prompt).toContain('測試者踏入了異世界');
    expect(prompt).not.toContain('{{user}}');
  });

  it('容忍多餘空白與誤植的 {{userr}}', () => {
    const prompt = withSystemPrompt('{{ user }}與{{userr}}');
    expect(prompt).toContain('測試者與測試者');
    expect(prompt).not.toContain('{{');
  });
});

// 回歸：出場 NPC 那行原本只給外貌／個性／背景／勢力／想法／記憶，
// 完全沒有好感度或關係——NPC 沒有依據判斷該怎麼對待玩家。
describe('buildPrompt — NPC 對玩家的態度', () => {
  const npc = (over: Partial<Npc> = {}): Npc => ({
    id: 1, name: '芬里爾', job: '獵人', affection: 90,
    appearance: '銀髮高挑', personality: '冷靜寡言',
    category: 'NPC', isActive: true, memories: [],
    ...over,
  });

  const loreNpc: LorebookEntry = {
    id: 1, title: '芬里爾', category: 'NPC', content: '',
    isActive: true, insertionOrder: 100,
    selective: false, secondaryKeys: [], keywords: [],
    job: '獵人', appearance: '銀髮高挑', personality: '冷靜寡言',
    homeLocation: '月湖鎮',
  };

  const build = (n: Npc) => buildPrompt(
    {
      ...deps([], () => false),
      npcs: [n],
      appearingNpcs: ['芬里爾'],
      lorebookEntries: [loreNpc],
    },
    '測試輸入',
    messages,
  ).prompt;

  it('出場 NPC 注入好感度與推導標籤', () => {
    expect(build(npc())).toContain('對玩家：信賴（好感度 90）');
  });

  it('有明確 relationship 時以它為準', () => {
    expect(build(npc({ relationship: '旅伴' }))).toContain('對玩家：旅伴（好感度 90）');
  });

  it('敵對好感度如實注入', () => {
    expect(build(npc({ affection: -40 }))).toContain('對玩家：敵對（好感度 -40）');
  });

  it('Pinned NPC 也帶語意標籤而非裸數字', () => {
    const prompt = buildPrompt(
      {
        ...deps([], () => false),
        npcs: [npc({ isPinned: true, affection: 55 })],
        appearingNpcs: [],
        lorebookEntries: [],
      },
      '測試輸入',
      messages,
    ).prompt;
    expect(prompt).toContain('對玩家：友好（好感度 55）');
  });
});
