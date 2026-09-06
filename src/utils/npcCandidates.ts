/**
 * npcCandidates.ts — Phase 1 候選名單的打分排序
 *
 * ## 為什麼從布林過濾改成打分
 *
 * 候選名單原本是一串 or 起來的布林條件：主場相等、遊蕩含此地、足跡在此地、
 * 同城、不限地點。每一條都是為了修一個症狀而後加的旁路——酒館老闆娘比不中
 * 「月湖鎮」就加同城，行商綁不住就加不限地點——但底下那個「字串完全相等」
 * 的地基從頭到尾沒換過，於是旁路愈疊愈多，語意開始互相重疊，
 * 玩家得自己分辨每個開關差在哪。
 *
 * 打分把那些旁路變成權重：同一件事（這個人有多可能在這裡）只問一次，
 * 排序天然就是「本地的優先、四處跑的墊後」，上限直接砍尾巴。
 * 要調整優先序只要改一個數字，不必再往那串 or 裡插新的分支。
 *
 * ## 分數的量級是刻意拉開的
 *
 * 各層之間差 20~30 分，而好感度加成最多只有 10 分——好感度只用來**打破同層
 * 的平手**（兩個都住這裡的人，先列跟玩家熟的那個），永遠不足以讓下一層的人
 * 越級擠掉上一層。`canAppear` 給 1000 是同樣的道理：那是玩家親手指定的，
 * 不該被任何自動判定蓋過去。
 */
import { LorebookEntry, Npc } from '../types';
import { isSameNpcName } from './npcProfile';
import { isSameCity } from './locationTree';

/**
 * 各來源的基礎分。層與層之間拉開距離，讓好感度加成（最多 10）
 * 只在同層內起作用。
 */
export const CANDIDATE_SCORE = {
  /** 玩家在角色卡上勾的「可出場」：不受地點限制，永遠排在最前面 */
  canAppear: 1000,
  /** 主場就在這裡 */
  home: 100,
  /** 遊蕩地點含此地（AI 的 NPC_LOCATION 寫入） */
  roam: 80,
  /** 足跡：上次出場就在這裡（Npc.location） */
  footprint: 70,
  /** 同一座城的其他地方（月湖鎮 ↔ 醉醺醺酒館，見 locationTree） */
  sameCity: 40,
  /** 不限地點：行商、信使、遊俠 */
  anyLocation: 20,
} as const;

/** 好感度換算成分數的係數：好感 100 → 10 分，只夠在同層內打破平手 */
export const AFFECTION_WEIGHT = 0.1;

/** 好感度加成的上限（避免好感破表的角色越級擠掉本地人） */
export const MAX_AFFECTION_BONUS = 10;

export interface CandidateContext {
  /** 玩家當前所在地 */
  location: string;
  /** 整本設定集——同城判定要靠它爬 parentLocation */
  lorebookEntries: LorebookEntry[];
  /** 執行狀態：足跡、好感度、可出場旗標都在這裡 */
  npcs: Npc[];
}

export interface ScoredCandidate {
  entry: LorebookEntry;
  score: number;
  /** 這個分數主要來自哪一層，供 UI 與除錯辨識（不進 prompt） */
  reason: keyof typeof CANDIDATE_SCORE | 'none';
}

/**
 * 地點相關的基礎分——取**最大值**而不是加總。
 *
 * 加總會讓「主場在這裡」自動附帶「同城」而多拿 40 分，層與層的距離就被稀釋掉，
 * 排序意圖跟著模糊。取最大值等於「最強的那個理由決定他排在哪一層」，
 * 與原本布林版本的分層順序完全一致。
 */
function localityScore(
  entry: LorebookEntry,
  npc: Npc | undefined,
  ctx: CandidateContext,
): { score: number; reason: keyof typeof CANDIDATE_SCORE | 'none' } {
  const loc = ctx.location;
  if (entry.homeLocation === loc) return { score: CANDIDATE_SCORE.home, reason: 'home' };
  if ((entry.roamLocations || []).includes(loc)) return { score: CANDIDATE_SCORE.roam, reason: 'roam' };
  if (npc?.location === loc) return { score: CANDIDATE_SCORE.footprint, reason: 'footprint' };
  if (entry.homeLocation && isSameCity(ctx.lorebookEntries, entry.homeLocation, loc)) {
    return { score: CANDIDATE_SCORE.sameCity, reason: 'sameCity' };
  }
  if (entry.anyLocation === true) return { score: CANDIDATE_SCORE.anyLocation, reason: 'anyLocation' };
  return { score: 0, reason: 'none' };
}

/**
 * 一個設定集 NPC 條目在當前地點的候選分數。
 *
 * 回傳 0 代表「這個人不可能在這裡」，不列入候選。
 * ⚠️ 好感度加成只在已經有地點理由（或 canAppear）時才加——否則住在三座城外的
 * 摯友會因為好感度 90 而出現在每一個地方的候選名單上。
 */
export function scoreNpcCandidate(entry: LorebookEntry, ctx: CandidateContext): ScoredCandidate {
  const npc = ctx.npcs.find(n => isSameNpcName(n.name, entry.title));
  const canAppear = npc?.canAppear === true;
  const locality = localityScore(entry, npc, ctx);

  if (!canAppear && locality.score === 0) {
    return { entry, score: 0, reason: 'none' };
  }

  const affectionBonus = Math.min(
    MAX_AFFECTION_BONUS,
    Math.max(0, (npc?.affection ?? 0) * AFFECTION_WEIGHT),
  );

  return {
    entry,
    score: (canAppear ? CANDIDATE_SCORE.canAppear : 0) + locality.score + affectionBonus,
    reason: canAppear ? 'canAppear' : locality.reason,
  };
}

/**
 * Phase 1 候選名單：依分數由高到低取前 limit 個。
 *
 * 分數相同時維持設定集裡的原始順序（`Array.prototype.sort` 在現代 V8 是穩定的），
 * 讓同分角色的排列在回合之間不會跳來跳去——每回合換一批人會讓 prompt 的
 * context caching 白白失效，模型看到的「這裡有誰」也跟著飄。
 */
export function selectNpcCandidates(
  ctx: CandidateContext,
  limit: number,
): ScoredCandidate[] {
  if (limit <= 0) return [];
  return ctx.lorebookEntries
    .filter(e => e.category === 'NPC' && e.isActive)
    .map(e => scoreNpcCandidate(e, ctx))
    .filter(c => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
