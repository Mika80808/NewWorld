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

// ─── NPC 性別注入 ─────────────────────────────────────────────────────────────
// 玩家回報「人物設定寫女的，故事裡變成男的」。兩個獨立成因，各釘一條。
describe('buildPrompt NPC 性別注入', () => {
  const npc = (over: Partial<Npc> = {}): Npc => ({
    id: 1, name: '凱爾', job: '嚮導', affection: 10,
    appearance: '', personality: '', category: 'NPC', isActive: true, memories: [], ...over,
  });
  const loreNpc = (over: Partial<LorebookEntry> = {}): LorebookEntry => ({
    id: 1, title: '凱爾', content: '', category: 'NPC', isActive: true,
    homeLocation: '月湖鎮', ...over,
  });
  const build = (over: Partial<BuildPromptDeps>) =>
    buildPrompt({ ...deps([], () => false), ...over }, '測試輸入', messages).prompt;

  /**
   * Phase 1 的候選名單先前只給「名字（職業）」。完整設定要等 AI 輸出
   * `[出場:名字]` 之後的下一輪才注入，所以角色**首次登場那一回合**模型
   * 手上沒有性別，只能自己猜——猜錯就寫進對話歷史，後面全歪。
   */
  it('候選名單帶上性別（角色首次登場那回合唯一的性別來源）', () => {
    const prompt = build({
      npcs: [npc()],
      lorebookEntries: [loreNpc({ gender: '女', race: '人類' })],
    });
    expect(prompt).toContain('[當前場景可能出現的角色]');
    expect(prompt).toContain('凱爾（女・人類・嚮導）');
  });

  it('候選名單在完全沒有身分資訊時只印名字，不留空括號', () => {
    const prompt = build({
      npcs: [npc({ job: '' })],
      lorebookEntries: [loreNpc()],
    });
    expect(prompt).toContain('凱爾\n以上為可能在場的角色');
    expect(prompt).not.toContain('凱爾（）');
  });

  /**
   * 第二個成因：[Scene Lorebook] 先前只讀設定集條目的 gender，
   * 而角色卡顯示時會退回 Npc.gender——玩家看到「女」，AI 拿到空字串。
   */
  it('[Scene Lorebook] 在設定集沒填性別時退回 Npc.gender', () => {
    const prompt = build({
      npcs: [npc({ gender: '女' })],
      appearingNpcs: ['凱爾'],
      lorebookEntries: [loreNpc({ gender: '' })],
    });
    expect(prompt).toContain('[NPC] 凱爾｜性別：女');
  });

  it('[Pinned NPCs] 同樣會退回 Npc.gender', () => {
    const prompt = build({
      npcs: [npc({ gender: '女', isPinned: true })],
      lorebookEntries: [],
    });
    expect(prompt).toContain('[Pinned NPCs]');
    expect(prompt).toContain('凱爾（女・嚮導）');
  });
});

// ─── NPC 設定集注入的斷鏈 ────────────────────────────────────────────────────
// 玩家回報「GM AI 讀不到故事集」（NPC 類）。
//
// homeLocation / roamLocations 在整個 UI 裡都沒有編輯入口，只有 AI 的
// NPC_HOME 寫得到，而 NPC_NEW 建檔時也不寫。缺了它，角色就永遠進不了
// Phase 1 候選名單 → AI 不知道有這個人 → 不輸出 [出場:] → 設定集條目
// 永遠過不了 inScene → GM 讀不到那個角色的任何設定。
describe('buildPrompt NPC 候選名單的來源', () => {
  const npc = (over: Partial<Npc> = {}): Npc => ({
    id: 1, name: '凱爾', job: '嚮導', affection: 10,
    appearance: '', personality: '', category: 'NPC', isActive: true, memories: [], ...over,
  });
  const loreNpc = (over: Partial<LorebookEntry> = {}): LorebookEntry => ({
    id: 1, title: '凱爾', content: '', category: 'NPC', isActive: true, ...over,
  });
  const build = (over: Partial<BuildPromptDeps>) =>
    buildPrompt({ ...deps([], () => false), ...over }, '測試輸入', messages).prompt;

  it('有 homeLocation 時進候選名單', () => {
    const prompt = build({
      npcs: [npc()],
      lorebookEntries: [loreNpc({ homeLocation: '月湖鎮' })],
    });
    expect(prompt).toContain('凱爾');
  });

  /**
   * 這條釘住斷鏈的修復：設定集條目沒有 homeLocation（玩家手動建立的角色、
   * 或 AI 忘了補 NPC_HOME），但 Npc.location 的足跡指向當前地點時，
   * 仍應列入候選名單。
   */
  it('沒有 homeLocation 但足跡在當前地點時仍進候選名單', () => {
    const prompt = build({
      npcs: [npc({ location: '月湖鎮' })],
      lorebookEntries: [loreNpc()],
    });
    expect(prompt).toContain('[當前場景可能出現的角色]');
    expect(prompt).toContain('凱爾');
    expect(prompt).not.toContain('無已知角色在附近');
  });

  it('足跡在別的地點時不進候選名單', () => {
    const prompt = build({
      npcs: [npc({ location: '迷霧森林' })],
      lorebookEntries: [loreNpc()],
    });
    expect(prompt).toContain('無已知角色在附近');
  });

  /**
   * 修復後的完整鏈路：角色進了候選名單，AI 輸出 [出場:] 之後，
   * 設定集條目要真的把外貌／個性帶進 [Scene Lorebook]。
   */
  it('出場後設定集的外貌與個性確實注入', () => {
    const prompt = build({
      npcs: [npc({ location: '月湖鎮' })],
      appearingNpcs: ['凱爾'],
      lorebookEntries: [loreNpc({ appearance: '淺棕色短髮', personality: '活潑好動' })],
    });
    expect(prompt).toContain('淺棕色短髮');
    expect(prompt).toContain('活潑好動');
  });
});

// ─── 助理 GM 的設定集提示 ────────────────────────────────────────────────────
// 規則比對（homeLocation === loc、標題相等、關鍵字 includes）只要字串差一個字
// 就整條漏掉。助理 GM 做語意判斷補這個洞，結果與規則取聯集。
describe('buildPrompt 助理 GM 設定集提示（loreHints）', () => {
  const entry = (id: number, over: Partial<LorebookEntry> = {}): LorebookEntry => ({
    id, title: `條目${id}`, content: `內容${id}`, category: '歷史',
    isActive: true, keywords: ['不會命中的關鍵字'], ...over,
  });
  const build = (over: Partial<BuildPromptDeps>) =>
    buildPrompt({ ...deps([], () => false), ...over }, '測試輸入', messages).prompt;

  it('助理挑中的條目即使規則沒命中也會注入', () => {
    const e = entry(7);
    expect(build({ lorebookEntries: [e] })).not.toContain('內容7');
    expect(build({ lorebookEntries: [e], loreHints: [7] })).toContain('內容7');
  });

  it('規則命中的條目不受影響（聯集，不是取代）', () => {
    const ruled = entry(1, { keywords: [] });          // 無關鍵字 → 規則本來就會過
    const hinted = entry(2);
    const prompt = build({ lorebookEntries: [ruled, hinted], loreHints: [2] });
    expect(prompt).toContain('內容1');
    expect(prompt).toContain('內容2');
  });

  /**
   * isActive 是玩家明確關掉的意思，助理提示不得凌駕——否則玩家停用的設定
   * 會被 AI 自己撿回來，而且玩家完全無從得知。
   */
  it('停用的條目即使被助理挑中也不注入', () => {
    const e = entry(3, { isActive: false });
    expect(build({ lorebookEntries: [e], loreHints: [3] })).not.toContain('內容3');
  });

  it('NPC 類被助理挑中時可繞過出場判定', () => {
    const npcEntry = entry(4, { category: 'NPC', title: '凱爾', appearance: '淺棕色短髮', keywords: [] });
    expect(build({ lorebookEntries: [npcEntry] })).not.toContain('淺棕色短髮');
    expect(build({ lorebookEntries: [npcEntry], loreHints: [4] })).toContain('淺棕色短髮');
  });

  it('提示數量超過上限時只取前 10 筆，不會把整本設定集倒進來', () => {
    const many = Array.from({ length: 20 }, (_, i) => entry(100 + i));
    const prompt = build({ lorebookEntries: many, loreHints: many.map(e => e.id) });
    const hit = many.filter(e => prompt.includes(e.content)).length;
    expect(hit).toBe(10);
  });

  it('沒有提示時行為與先前完全一致', () => {
    const e = entry(5, { keywords: [] });
    expect(build({ lorebookEntries: [e] })).toBe(build({ lorebookEntries: [e], loreHints: [] }));
  });
});
