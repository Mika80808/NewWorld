# CLAUDE.md — 專案上下文（AI 自動讀取）

> 這份文件供 Claude Code 自動讀取。
> 設計相關請見 SKILL.md。
> 詳細開發歷史請見 CHANGELOG.md，待做任務請見 TODO.md。
---

## 專案簡介

LLM 擔任 GM 的開放式世界文字冒險 RPG，玩家以自由文字輸入推進劇情。
具有單機遊戲的道具、金錢、好感度、地圖等數據化功能。
後期規劃玩家可登入 Google 帳號跨裝置同步存檔。

---

## 技術棧

- **框架**：React 19 + TypeScript + Vite
- **樣式**：Tailwind CSS v4
- **AI**：Google Gemini（`@google/genai`），透過 `callAI` 封裝層呼叫，不直接散落在各處
- **儲存**：localStorage（未來規劃 Firebase 或 SQLite 等技術）
- **主要邏輯檔案**：`src/App.tsx`（所有邏輯集中此處，不新增其他邏輯檔案）
- **自訂 Hooks**：`src/hooks/useGameStore.ts`（state）、`src/hooks/useCommandParser.ts`（指令解析）
- **組件**：`src/components/`（純 UI，只接收 props 和 callback）

---

## 架構規則

- `App.tsx` 只保留：state、handlers、`buildPrompt`、API 呼叫、主介面三欄 JSX
- `src/components/` 純 UI 組件，不持有業務 state
- **所有 AI 呼叫統一走 `callAI` 函數**，不直接 `new GoogleGenAI(...)` 散落在各地
- State 更新一律用 functional update：`setState(prev => ...)`

---

## 顏色系統強制規則 ⚠️

**以下規則優先於所有其他考量，違反將導致主題不一致。**

### 禁止事項
1. **禁止硬編碼色碼** — 不得出現 `text-[#fde68a]`、`bg-[#24282d]`、`style={{ color: '#ff0000' }}` 等
2. **禁止使用 Tailwind 內建顏色 class 於 UI 顏色** — 不得使用 `bg-gray-900`、`text-blue-400`、`bg-indigo-900` 等
3. **禁止在 `@theme` 覆寫 Tailwind 顏色** — 舊的 `--color-emerald-400`、`--color-rose-400` 覆寫已全部移除，不得重新加入

### 正確做法
```tsx
// ✅ 顏色一律用 CSS Variables
<div style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)' }}>

// ✅ Tailwind 只用於排版、間距、字體、圓角
<div className="flex flex-col gap-2 p-4 rounded-[8px]"
     style={{ background: 'var(--bg-elevated)' }}>

// ❌ 禁止
<div className="bg-[#24282d] text-[#fde68a]">
<div className="bg-gray-900 text-amber-400">
```

### 唯一例外
- `affectionColor()` 函數回傳的 CSS 變數字串，用於 `style={{ color }}` — **這是唯一允許的動態顏色**

---

## CSS Variables 完整清單（`src/index.css`）

```css
:root {
/* ── 背景層次 ──────────────────────────────────────────── */
  --bg-base:         #0c0d0d;   /* 最外層背景 */
  --bg-elevated:     #282929;   /* 左右側欄、Modal 底色 */
  --bg-ui-card:      #353434;   /* Modal 內部二次容器（讓 A/B 區塊易於區別） */
  --bg-overlay:      rgba(0, 0, 0, 0.2);
  --bg-mark:         #ff637e;   /* 新日記亮點「通知」 */

  /* ── 邊框 ───────────────────────────────────────────────── */
  --border-default:  #4e4e4e;   /* 所有邊框 */
  --border-width:    0.5px;
  --border-accent:   #7e7c72;   /* 選中狀態邊框 */

  /* ── 文字 ───────────────────────────────────────────────── */
  --text-primary:    #e9d69e;   /* 左右欄功能名稱、Modal 名稱（暖黃） */
  --text-title:      #ff11d7;   /* 欄位名稱、地名 */
  --text-tab:        #fff7e2;   /* 分頁標題（如：人物、怪物） */
  --text-body:       #fffaf1;   /* 地點介紹、一般段落 */
  --text-main:       #e8e8e9;   /* 輸入文字 */
  --text-muted:      #acacac;   /* 提示文字、時間戳、placeholder */
  --text-stat-label: #bdb394;   /* 狀態名稱（HP、MP、金幣等標籤） */
  --text-stat-value: #fafafa;   /* 狀態數值（HP、MP、金幣等數字） */
  --text-danger:     #ff5757;   /* 危險動作文字（刪除、重置） */

  /* ── 分頁 ───────────────────────────────────────────────── */
  --tab-active:      #0069a8;   /* 選中分頁標籤底色 */
  --tab-inactive:    #282929;   /* 未選中分頁標籤底色 */

  /* ── 按鈕：Primary（新增、儲存）───────────────────────── */
  --btn--text:           #ffffff;   /* 預設 */
  --btn-primary:         #00598a;   /* 預設 */
  --btn-primary-hover:   #006aa3;   /* 懸停 */
  --btn-primary-active:  #007dbe;   /* 按下 */

  /* ── 按鈕：Secondary（取消）────────────────────────────── */
  --btn-secondary:         #a0a0a1;   /* 預設 */
  --btn-secondary-hover:   #7d8694;   /* 懸停 */
  --btn-secondary-active:  #a1a1a1;   /* 按下 */

  /* ── 陰影 ───────────────────────────────────────────────── */
  --shadow:          0 4px 12px rgba(16, 68, 171, 0.2);

  /* ── 表單 ───────────────────────────────────────────────── */
  --bg-sys-field:    #454545;   /* 輸入框底色 */
  --bg-sys-tag:      #0092cc;   /* 關鍵字膠囊底色 */

  /* ── 對話視窗 ───────────────────────────────────────────── */
  --bg-bubble-self:    rgba(117, 117, 117, 0.15);  /* 玩家對話泡泡 */
  --bg-bubble-npc:     rgba(68, 68, 68, 0.45);    /* NPC 對話泡泡 */
  --bg-dialog-input:   #282929;                 /* 玩家輸入框 */
  --text-dialog-main:  #fafafa;                 /* 對話台詞 */
  --text-dialog-muted: #d1d1d1;                 /* 敘述描寫 */

  /* ── 語意色（Tailwind 對應，取代 @theme 覆寫） ─────────── */
  --color-rose:    #ff2222;   /* 刪除／危險動作 */
  --color-emerald: #fb7185;   /* 好感度愛心（粉紅） */
  --color-amber:   #ffd037;   /* 警告／稀有 */
  --color-blue:    #5f93d3;   /* 連結／資訊 */
  --color-violet:  #7008e7;   /* 魔法／特殊 */
  --color-success: #4ade80;   /* 成功／進行中 */
  --color-sky:     #30b1d8;   /* 已完成 */  
  --color-taupe:   #ac9f9a;   /* 失敗／負面 */

  /* ── 好感度顏色（固定語意色，不隨主題變動） ────────────── */
  --affection-max:     #ff2d2d;   /* ≥ 100 */
  --affection-high:    #ff7967;   /* ≥ 80  */
  --affection-mid:     #ffaa83;   /* ≥ 50  */
  --affection-low:     #acacac;   /* ≥ 0   */
  --affection-hostile: #928366;   /* < 0（敵對） */

  /* ── 任務卡片背景 ─────────────────────────────────────── */
  --bg-quest-active:      rgba(22, 101, 52, 0.12);
  --border-quest-active:  rgba(34, 197, 94, 0.30);
  --bg-quest-pending:     rgba(120, 53, 15, 0.12);
  --border-quest-pending: rgba(245, 158, 11, 0.40);
  --bg-quest-failed:      rgba(69, 10, 10, 0.10);
  --border-quest-failed:  rgba(153, 27, 27, 0.30);
}
```

### 按鈕使用標準

```tsx
// Primary 按鈕（新增、儲存、確認）
<button style={{
  background: 'var(--btn-primary)',
  boxShadow: 'var(--shadow)'
}}
onMouseEnter={e => e.currentTarget.style.background = 'var(--btn-primary-hover)'}
onMouseLeave={e => e.currentTarget.style.background = 'var(--btn-primary)'}
>

// 危險動作（刪除、重置）→ 用紅色文字，不用紅色按鈕
<button style={{ color: 'var(--text-danger)' }}>刪除</button>
```

---

## API 設定架構

玩家 API 設定**不隨存檔匯出/匯入**，單獨存在 localStorage：

```
localStorage key: 'mainGM_config'   → 主 GM 設定
localStorage key: 'subGM_config'    → 助理 GM 設定
```

**callAI 簽名：**
```typescript
callAI(prompt: string, options?: { role?: 'main' | 'sub'; maxTokens?: number }): Promise<string>
// role 預設 'sub'
// handleSendMessage 傳 { role: 'main' }
// updateAdventureState / NPC 記憶融合 傳 { role: 'sub' }（預設，可省略）
```

**Gemini 靜態模型清單：**
```typescript
const GEMINI_MODELS = [
  { value: 'gemini-2.0-flash',       label: 'Gemini 2.0 Flash（快速／輕量）' },
  { value: 'gemini-2.0-flash-lite',  label: 'Gemini 2.0 Flash Lite（最省費）' },
  { value: 'gemini-2.5-pro-preview', label: 'Gemini 2.5 Pro（最強／較慢）' },
  { value: 'gemini-1.5-pro',         label: 'Gemini 1.5 Pro（穩定版）' },
  { value: 'gemini-1.5-flash',       label: 'Gemini 1.5 Flash（穩定輕量）' },
]
```

---

## 核心資料結構

### memories[]（統一記憶陣列）
```typescript
interface MemoryEntry {
  id: string                          // `mem_${Date.now()}_${random}`
  type: 'world' | 'region' | 'scene' | 'npc'
  importance: 'critical' | 'normal' | 'flavor'
  content: string
  tags: {
    locations: string[]
    npcs: string[]
    factions: string[]
    keywords: string[]
  }
  trigger: {
    scanDepth: number                 // 掃最近 N 則對話，預設 5
    probability: number               // 觸發機率 0~100，預設 100
    sticky: number                    // 觸發後持續 N 則，預設 0
    cooldown: number                  // 冷卻 N 則，預設 0
  }
  isActive: boolean
  source: 'manual' | 'ai_generated'
  createdAt: string
  expiresAt?: string
}
```

### lorebookEntries[]（設定集）
```typescript
interface LorebookEntry {
  id: number
  title: string
  category: '地點' | 'NPC' | '怪物' | '物品' | '歷史' | string
  content: string
  isActive: boolean
  // NPC 類專用
  gender?: string
  job?: string
  appearance?: string
  personality?: string
  backstory?: string                  // 好感度 ≥ 20 永久解鎖顯示
  other?: string
  homeLocation?: string
  roamLocations?: string[]            // 滑動窗口，最多 3 個
  // 地點類專用
  mapX?: number
  mapY?: number
  mapStatus?: 'heard' | 'known'
  cartFare?: number                   // 由 AI 指令寫入，玩家 UI 不顯示
  adjacentTo?: string[]
  locationType?: 'town' | 'wilderness' | 'building'
  // 觸發控制（共用）
  keywords: string[]
  selective: boolean
  secondaryKeys: string[]
  insertionOrder: number              // 預設 100
}
```

### Npc[]（NPC 執行狀態）
```typescript
interface Npc {
  id: number
  name: string
  job: string
  affection: number
  affectionLabel: string
  appearance: string
  personality: string
  other?: string
  relationship?: string
  location?: string
  lastSeenLocation?: string
  lastSeenDate?: string
  thoughts?: { text: string; createdAt: string }[]  // 最多 10 則，滿了寫入 memories
  isPinned?: boolean
  memories: NpcMemory[]
}

interface NpcMemory {
  id: string
  text: string
  createdAt: string
  source: 'manual' | 'pre_merge' | 'merged'
  importance: 'core' | 'normal'
  isMerged?: boolean
  mergedFrom?: string[]
  isNew?: boolean
}
```

---

## NPC 兩階段注入架構

**Phase 1（buildPrompt 入口）**：依地點篩選候選名單
- `homeLocation === currentLocation` 或 `roamLocations.includes(currentLocation)` 的 NPC 列入候選
- 上限：`locationType === 'town'` → 8 人，其他 → 3 人
- 只輸出輕量名單給 AI，AI 決定誰真正出場

**Phase 2（handleSendMessage 後）**：AI 回應出現 `[出場:姓名]` 標記後完整注入
- 更新 `appearingNpcs`，下一輪 `buildPrompt` 才注入完整 NPC 資料
- 防呆：`matchAll` 收集所有標記並去重

**NPC 注入資格（Phase 2 後）**：
1. `appearingNpcs` 裡的 NPC
2. `isPinned === true` 的 NPC
3. 候選名單內 `affection >= 60` 的 NPC

---

## AI 回應格式約定

```
<<COMMANDS>>
HP:-10
MP:+5
GOLD:+100
AFFINITY:芬里爾:+5
LOCATION:月湖鎮
TIME:+2h
ITEM_ADD:草藥:1:回復 20 HP:heal:20
ITEM_REMOVE:草藥:1
ITEM_USE:草藥
NPC_NEW:芬里爾:精靈:男:獵人:銀髮高挑:冷靜寡言:深山出身的獨行獵人。
NPC_HOME:芬里爾:迷霧森林
NPC_LOCATION:芬里爾:月湖鎮
NPC_THOUGHT:芬里爾:覺得玩家值得信任
NPC_RELATIONSHIP:芬里爾:盟友
QUEST_GOAL_MET:任務ID
QUEST_COMPLETE:任務ID
MEMORY_ADD:region:normal:迷霧森林昨日大火:locations=迷霧森林:keywords=大火:sticky=3
<</COMMANDS>>
```

**COMMANDS 區塊在串流結束後才解析**，不要在串流中途觸發。

---

## 重要設計決策

| 決策 | 原因 |
|---|---|
| HP / MP 無上限 | 支援升級後成長感 |
| 所有邏輯在 App.tsx | 維持簡單，避免跨檔依賴 |
| localStorage 儲存 | 先做 UI，Firebase 之後再加 |
| API Key 不進存檔 | 安全性考量 |
| callAI 封裝層 | 未來換 API 服務只需改一處 |
| 記憶四層架構 | world / region / scene / npc，依影響範圍分層注入 |
| CSS Variables 統一顏色 | 主題切換只需改 Variables，不動 className |
| 顏色禁止硬編碼 | 維護性，未來多主題支援 |
| NPC 兩階段注入 | 避免全體 NPC 塞滿 prompt |
| 好感度顏色固定 | 語意色不隨主題變動 |
| `cartFare` 僅 AI 寫入 | 玩家 UI 不顯示馬車費用欄位 |

---

## ⚠️ 注意事項（踩過的坑）

1. **State 更新必須用 functional update**
   ```typescript
   // ✅ 正確
   setProfile(prev => ({ ...prev, hp: prev.hp - 10 }))
   // ❌ 錯誤（stale closure 風險）
   setProfile({ ...profile, hp: profile.hp - 10 })
   ```

2. **不要直接 `new GoogleGenAI(...)` 散落在各處**，統一走 `callAI`

3. **lorebookEntries 的 NPC 類**注入條件與其他類不同：需在 Phase 2 出場名單、釘選、或候選名單內好感 ≥ 60，才進入 `relevantLorebook`

4. **memories 取代了舊的三個陣列**（`worldMemory` / `factionMemory` / `locationMemory`），不要重新加回去

5. **`package.json` 的 dev script 綁定 `0.0.0.0:3000`**，不要改動

6. **NPC `thoughts[]` 滿 10 則時自動串接寫入 `memories[]`**（source: `pre_merge`）並清空，不要改變這個閾值

7. **`[出場:]` 標記用 `matchAll` 收集並去重**，不要改回單次 `match`

8. **`pinnedNpcs` 已在 `relevantLorebook` 去重**，不要讓同一 NPC 出現兩次於 prompt

9. **`backstory` 解鎖條件是好感度 ≥ 20，永久解鎖**（不因好感度下降而隱藏）

10. **好感度顏色一律使用 CSS 變數**（`var(--affection-*)`），`affectionColor()` 是唯一判斷入口

11. **顏色禁止硬編碼，禁止使用 Tailwind 內建顏色 class**，一律用 CSS Variables（見上方「顏色系統強制規則」）

12. **`@theme` 區塊只保留字體定義**，不得覆寫任何顏色

---

## 關鍵函數索引

| 函數 / 位置 | 說明 |
|---|---|
| `App.tsx` `buildPrompt(userInput, messages)` | 組裝送給主 GM 的完整 prompt |
| `App.tsx` `handleSendMessage()` | 主要對話送出與 AI 串流邏輯 |
| `App.tsx` `callAI(prompt, options)` | 統一 AI 呼叫入口（主/助理 GM 分流） |
| `App.tsx` `updateAdventureState(history, newItems)` | 觸發助理 GM 整理摘要與目標 |
| `App.tsx` `handleGenerateDiary()` | 水晶球日記：AI 自動生成日記 |
| `App.tsx` `handleMergeDiary(ids)` | 融合多條日記 |
| `useCommandParser` `parseAndExecuteCommands(text)` | 解析並執行 COMMANDS 區塊 |
| `useCommandParser` `applyItemEffect(item, qty)` | 道具數值效果套用 |
| `useCommandParser` `scanKeywords(keywords, depth)` | 掃描最近 N 則對話是否含關鍵字 |
| `useCommandParser` `isMemoryTriggered(mem, input, loc)` | 判斷記憶是否應該注入 |
| `useCommandParser` `tickMemoryCounters(triggeredIds)` | 每回合更新 sticky/cooldown |
| `useCommandParser` `triggerNpcMemoryMerge(npc)` | 呼叫助理 GM 融合 NPC 舊記憶 |
| `useGameStore` `saveToStorage(snapshot?)` | 統一存檔入口（key: `rpworld_save`）|
| `useGameStore` `loadFromData(data)` | 匯入存檔並自動 migrate 舊格式 |
| `NpcModal.tsx` `affectionColor(affection)` | 回傳好感度對應 CSS 變數字串 |
