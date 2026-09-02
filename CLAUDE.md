# CLAUDE.md — 專案上下文（AI 自動讀取）

> 這份文件供 Claude Code 自動讀取。
> 設計相關請見 SKILL.md、UI_DESIGN_SPEC。
> 詳細開發歷史請見 CHANGELOG.md，待做任務請見 TODO.md。
---

## 專案簡介

LLM 擔任 GM 的開放式世界文字冒險 RPG，玩家以自由文字輸入推進劇情。
具有單機遊戲的道具、金錢、好感度、地圖等數據化功能。
玩家以 Google 帳號登入，存檔透過 Supabase 跨裝置同步（強制登入才能遊玩）。

---

## 技術棧

- **框架**：React 19 + TypeScript + Vite（`noImplicitAny` 啟用）
- **測試 / Lint**：`npm test`（vitest，純函數層測試）、`npm run lint`（tsc + eslint，含 react-hooks 規則）——改完功能請跑這兩個
- **樣式**：Tailwind CSS v4（`@tailwindcss/vite` plugin）
- **AI**：Google Gemini（`@google/genai`），透過 `callAI` 封裝層呼叫（實作在 `src/hooks/useAIRequest.ts`），不直接散落在各處
- **儲存**：Supabase 雲端存檔（Google 登入，強制登入才能遊玩）；API 設定另存 localStorage
- **主要邏輯檔案**：`src/App.tsx`（state 組裝、handlers、主介面 JSX）
- **自訂 Hooks**：`src/hooks/useGameStore.ts`（state + 存檔快照/遷移）、`src/hooks/useCommandParser.ts`（指令整合層）、`src/hooks/useAIRequest.ts`（callAI：timeout/abort/retry）、`src/hooks/useAuth.ts`（Supabase 登入與雲端存檔 CRUD）
- **純函數層**：`src/utils/`（`promptBuilder`、`commandParser` → `commandReducer` → `commandEffects` 三層、`timeUtils`、`markdownParser` 等）
- **組件**：`src/components/`（純 UI，只接收 props 和 callback）

---

## 架構規則

- `App.tsx` 只保留：state 組裝、handlers、API 呼叫接線、主介面三欄 JSX
- Prompt 組裝在 `src/utils/promptBuilder.ts`；指令解析採 parse → reduce → effects 三層（`src/utils/commandParser|commandReducer|commandEffects.ts`），`useCommandParser` 只是整合層
- `src/components/` 純 UI 組件，不持有業務 state
- **所有 AI 呼叫統一走 `callAI` 函數**（`useAIRequest`），不直接 `new GoogleGenAI(...)` 散落在各地
- State 更新一律用 functional update：`setState(prev => ...)`；updater 內不得呼叫其他 setState（updater 必須是純函數）
- async 函數在 `await` 之後不要讀取閉包捕獲的 state，改讀最新值 ref（見 `App.tsx` 的 `itemsRef` / `summaryPoolRef` / `compressCountRef`）

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

### 這條規則由測試強制執行

`src/utils/__tests__/noHardcodedColors.test.ts` 會掃過整個 `src/`，掃到未標注例外的
色碼字面值就紅。這條規則過去只寫在文件裡、沒有東西擋著，結果累積了 60 幾處寫死的色碼
——大多是 `rgba(255,255,255,0.05)` 這種「疊一層微亮」的手法，**綁死深色主題**：
白色疊在淺色紙面上等於什麼都沒發生，羊皮紙主題底下卡片、按鈕、分隔線會整片消失。

**要疊一層、要投影、要遮罩時，用下面「疊加色與陰影」那組變數，不要自己寫 rgba。**

### 明文例外（除此之外一律禁止）

例外的寫法是在宣告處上方的註解寫 `色碼例外` 並說明理由（測試據此豁免其後 30 行）；
整份檔案都是調色盤的（手繪地圖）則在檔案開頭寫 `色碼例外：整份檔案`。
目的是逼人寫下理由，不是禁止例外。

- `affectionColor()` 函數回傳的 CSS 變數字串，用於 `style={{ color }}`
- `App.tsx` `getSkyGradient()` 的天空與天氣色碼 — 場景氛圍色，隨遊戲時間變化，非 UI 主題色
- `MapModal.tsx` — 整份檔案。手繪地圖（`MAP_PALETTE`）與勢力星圖（`FACTION_SKY`）是
  「畫在紙上的道具」，不是 UI 表面，兩個主題底下都該長一樣
- `GoalsPanel.tsx` 的 `NOTE_PAPER` — 便條紙調色盤，同理；紙面本身仍讀 `--bg-note-paper`
- `Faction.color` 的自動指派調色盤（`LorebookModal` 的 `FACTION_PALETTE`、
  `commandReducer` 的 `FACTION_COLOR_PALETTE`）— 這些值會**寫進存檔**，
  換主題不該讓舊存檔裡的勢力全部改色
- Google 登入按鈕 SVG 的品牌色（Google 規範要求）

---

## CSS Variables 清單（`src/index.css`）

> ⚠️ **值以 `src/index.css` 的 `:root` 為唯一準據。**
> 這裡只列**變數名與用途**，刻意不複製色碼——過去這張表複製了完整色值後長期沒同步，
> 一度有 13 個值與實際不符（例如 `--text-title` 記成亮桃紅，實際是霧卡其），
> 反而誤導。要知道確切顏色請直接看 `index.css`；寫程式時你只需要變數名。
>
> 共 87 個變數（`:root` 內，不含 `@theme` 的兩個字體）。若在下列找不到需要的語意，**先回 `index.css` 確認**，
> 不要因為表上沒有就硬編碼色碼（那會違反上方的顏色系統強制規則）。

### 背景層次
| 變數 | 用途 |
|---|---|
| `--bg-base` | 最外層背景 |
| `--bg-elevated` | 右側欄、Modal 底色 |
| `--bg-ui-card` | Modal 內部二次容器（讓 A/B 區塊易於區別） |
| `--bg-overlay` | Modal／抽屜的遮罩（見下方「疊加色與陰影」）|
| `--bg-glass-left` / `--bg-glass-right` | 左／右欄玻璃底色 |
| `--bg-mark` | 新日記亮點「通知」 |
| `--bg-note-paper` | 便條紙背景（筆記紙 Widget） |
| `--text-note` / `--text-note-muted` | 便條紙文字（深色紙上用，與一般文字色相反） |

### 邊框
`--border-default`（所有邊框）、`--border-width`、`--border-accent`（選中狀態）

### 疊加色與陰影（`--tint-*` / `--shadow-*`）

「浮在底色上的一層」一律走這組，不要自己寫 rgba——深色主題疊白、淺色主題疊深棕，
組件端寫同一個變數兩邊都對。

| 變數 | 用途 |
|---|---|
| `--tint-surface` | 卡片／按鈕底的微亮面 |
| `--tint-surface-hover` | 上述元素的懸停態 |
| `--tint-line` | 分隔線、細邊框 |
| `--tint-line-strong` | 需要看得出來的邊框 |
| `--shadow-modal` | Modal 投影 |
| `--shadow-float` | 浮動元素（選單、Toast、右欄 Widget） |
| `--ring-accent` | 懸停時的一圈細光環，疊在 `box-shadow` 最前面 |
| `--bg-overlay` | Modal／抽屜的遮罩——**只有遮罩**，不要拿來當面板底色 |

Tailwind class 需要用到時走 arbitrary value：`border-[color:var(--tint-line)]`、
`shadow-[var(--shadow-modal)]`。

### 文字
| 變數 | 用途 |
|---|---|
| `--text-primary` | 左右欄功能名稱、Modal 名稱（暖黃） |
| `--text-title` | 欄位名稱、地名 |
| `--text-tab` | 分頁標題（如：人物、怪物） |
| `--text-body` | 地點介紹、一般段落 |
| `--text-main` | 輸入文字 |
| `--text-muted` | 提示文字、時間戳、placeholder |
| `--text-stat-label` / `--text-stat-value` | 狀態標籤／數值（HP、MP、金幣） |
| `--text-danger` | 危險動作文字（刪除、重置） |

### 分頁 / 按鈕 / 表單
- 分頁：`--tab-active`、`--tab-inactive`
- Primary 按鈕：`--btn-primary`、`--btn-primary-hover`、`--btn-primary-active`、`--btn--text`
- Secondary 按鈕（取消）：`--btn-secondary`、`--btn-secondary-hover`、`--btn-secondary-active`
- 表單：`--bg-sys-field`（輸入框底）、`--bg-sys-tag`（關鍵字膠囊底）
- 陰影：`--shadow`

### 對話視窗
`--bg-bubble-self`、`--bg-bubble-npc`、`--bg-dialog-input`、`--text-dialog-main`（台詞）、`--text-dialog-muted`（敘述描寫）

### 毛玻璃效果
`--glass-sidebar-bg`、`--glass-sidebar-blur`、`--glass-border`、`--glass-bubble-self`、`--glass-bubble-npc`、`--glass-bubble-blur`

### RPG 視覺特效（`--fx-*`）
`--fx-vignette`、`--fx-orb-amber`、`--fx-orb-violet`、`--fx-orb-sky`、`--fx-message-shadow`

### 語意色（取代 @theme 覆寫）
| 變數 | 語意 | 注意 |
|---|---|---|
| `--color-rose` | 刪除／危險動作 | |
| `--color-emerald` | 好感度愛心 | ⚠️ 實際是**粉紅**，不是綠色 |
| `--color-amber` | 警告／稀有 | |
| `--color-blue` | 連結／資訊 | |
| `--color-violet` | 魔法／特殊 | |
| `--color-success` | 成功／進行中 | |
| `--color-sky` | 已完成 | |
| `--color-taupe` | 失敗／負面 | |

### 好感度顏色（固定語意色，不隨主題變動）
`--affection-max`（≥100）、`--affection-high`（≥80）、`--affection-mid`（≥50）、`--affection-low`（≥0）、`--affection-hostile`（<0 敵對）

唯一判斷入口是 `utils/affectionColor.ts` 的 `affectionColor()`，不要在別處自行比對門檻。

**語意標籤**同理走 `utils/affectionLabel.ts`：

| 好感度 | < 0 | 0–19 | 20–49 | 50–79 | 80–99 | ≥ 100 |
|---|---|---|---|---|---|---|
| 標籤 | 敵對 | 陌生 | 相識 | 友好 | 信賴 | 摯友 |

- `affectionLabel(affection)` — 由好感度現算，**不存進存檔**（存起來只會漂移，舊的 `Npc.affectionLabel` 就是這樣爛掉的）
- `relationText(relationship, affection)` — 顯示與 prompt 注入的共用入口：有明確 `relationship` 時以它為準，沒有時退回標籤
- 門檻對齊 `affectionColor()` 的邊界，額外的 20 是 backstory 解鎖門檻；改動時兩邊要一起看（`affectionLabel.test.ts` 有一致性檢查釘著）

### 任務卡片
`--bg-quest-active` / `--border-quest-active`、`--bg-quest-pending` / `--border-quest-pending`、`--bg-quest-failed` / `--border-quest-failed`

### Z-Index 層級（數值即語意，故列出）
| 變數 | 值 | 用途 |
|---|---|---|
| `--z-bg` | 0 | 背景圖層（遊戲背景、天空梯度） |
| `--z-base` | 10 | 基礎層（欄位標籤、右欄 Lorebook） |
| `--z-hud` | 20 | 頂部 HUD / 導航欄 |
| `--z-menu` | 30 | 局部菜單（右鍵選單、下拉） |
| `--z-drawer-bg` | 40 | 手機 Drawer 遮罩 |
| `--z-drawer` | 50 | 手機 Drawer 本體 |
| `--z-modal-bg` | 60 | Modal 暗色背景 |
| `--z-modal` | 61 | Modal 本體 |
| `--z-modal-high` | 62 | Modal 內部高層（選單、彈窗） |
| `--z-toast` | 100 | 通知 Toast |
| `--z-popover` | 110 | 浮動菜單（Inventory、Consumables） |

`constants.ts` 的 `Z_INDEX` 物件與此對應，JS 端請用它而非硬寫數字。

### 字體（`@theme` 區塊，只有這兩個，不得在此加顏色）
`--font-sans`、`--font-mono`

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

**callAI 簽名（`src/hooks/useAIRequest.ts`）：**
```typescript
callAI(prompt: string, options?: {
  role?: 'main' | 'sub';
  maxTokens?: number;
  onChunk?: (chunk: string) => void;      // streaming 即時回傳
  onStreamStart?: () => void;             // 每次串流 attempt 開始（重試會再觸發），供重置累積文字
  responseJson?: boolean;                 // structured output（Gemma 模型自動略過）
}): Promise<string>
// role 預設 'sub'
// handleSendMessage 傳 { role: 'main', onChunk, onStreamStart }（streaming 即時顯示，偵測 << 停止追加）
// updateAdventureState 傳 { responseJson: true }（預設 sub）
// 內建 timeout（main 90s / sub 30s）、retry（timeout/429/500/503，指數退避）、abort
// timeout 觸發時會讓背景串流停止，不再消耗配額
```

**Gemini 靜態模型清單：**
```typescript
const GEMINI_MODELS = [
  { value: 'gemini-3.1-pro-preview',    label: 'Gemini 3.1 Pro Preview（最強推理）' },
  { value: 'gemini-3-flash-preview',    label: 'Gemini 3 Flash Preview（快速／均衡）' },
  { value: 'gemini-3.1-flash-lite-preview', label: 'Gemini 3.1 Flash Lite Preview（最省費）' },
  { value: 'gemini-2.5-pro',            label: 'Gemini 2.5 Pro（穩定最強）' },
  { value: 'gemini-2.5-flash',          label: 'Gemini 2.5 Flash（穩定快速）' },
  { value: 'gemini-2.5-flash-lite',     label: 'Gemini 2.5 Flash Lite（穩定輕量）' },
  { value: 'gemini-2.0-flash',          label: 'Gemini 2.0 Flash（舊版快速）' },
  { value: 'gemini-2.0-flash-lite',     label: 'Gemini 2.0 Flash Lite（舊版輕量）' },
  { value: 'gemma-4-31b-it',            label: 'Gemma 4 31B（開源模型）' },
]
```

---

## 核心資料結構

### itemCatalog（道具圖鑑，Master Data）
```typescript
// 道具「定義」全遊戲只存一份，背包 items[] 是實例（名稱引用＋數量）
type ItemCatalog = Record<string, ItemDef>   // key = 正規化後的道具名稱

interface ItemDef {
  name: string          // 主鍵
  description: string   // 先寫先贏：首次登錄的描述為準
  createdAt: string     // 遊戲內日期（月/日）
  lastUsedAt: number    // epoch ms，供 LOD 淘汰排序
}
```
- **去重先寫先贏**：`ITEM_ADD` 同名道具已有定義時沿用圖鑑描述，忽略 AI 重新生成的描述（`commandReducer` 內 O(1) key 查詢，AI 不參與查重）
- **LOD 淘汰**：圖鑑超過 300 條時，`pruneItemCatalog` 淘汰最久未使用且不在背包中的條目
- **Prompt 切片**：`promptBuilder` 只注入最近使用的 30 個名稱（`selectKnownItemNames`），引導 AI 沿用既有名稱，不注入整個圖鑑
- 純函數層在 `src/utils/itemCatalog.ts`

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
  lastTriggeredAt?: number            // epoch ms，供 LOD 淘汰排序
}
```
- **LOD 淘汰**：超過 300 條時 `pruneMemories` 淘汰，`flavor` 優先、最久未觸發優先；
  `critical` 與 `source === 'manual'` 豁免（前者刪掉劇情斷裂，後者是玩家手寫的）。
  可淘汰的不夠時寧可暫時超量，不動受保護的
- **LRU 時間戳**：`tickMemoryCounters` 每回合以 `touchMemories` 標記本回合觸發過的記憶。
  `createdAt` 是遊戲內日期字串（「4/15」）無法比大小，故另存 epoch ms
- ⚠️ 兩支都在無變更時回傳**原 reference**——每回合無條件產生新陣列會讓存檔髒標記永遠為髒
- 純函數層在 `src/utils/memoryStore.ts`

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

⚠️ **身分設定不在這裡**。性別／種族／年齡／職業／外貌／個性／背景／備註的唯一來源是
設定集的 NPC 條目（`LorebookEntry`），讀取一律走 `utils/npcProfile.resolveNpcProfile(lore)`，
查條目走 `findNpcLore(entries, name)`。

先前這些欄位兩邊都有，`NPC_NEW` 還會在同一個區塊裡把同一份值寫進兩邊。但**角色卡的
編輯只寫設定集那份**（`NpcModal` → `onUpdateLorebook`），所以 `Npc` 上的副本是
「建檔時寫一次、之後永遠不再更新」——與舊的 `Npc.affectionLabel` 同一個病。schema v10 移除。

```typescript
interface Npc {
  id: number
  name: string
  affection: number
  // 註：舊的 affectionLabel 欄位已移除——它只在建檔時寫入、之後永不更新。
  // 標籤改由 affectionLabel(affection) 現算，見下方「好感度顏色」段。
  relationship?: string
  location?: string
  lastSeenLocation?: string
  lastSeenDate?: string
  thoughts?: { text: string; createdAt: string }[]  // 最多 10 則，滿了寫入 memories
  isPinned?: boolean
  memories: NpcMemory[]
  factionIds?: number[]
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

**`[出場:]` 的三種語意，缺一不可**：

| AI 輸出 | 語意 | 行為 |
|---|---|---|
| `[出場:芬里爾,萊尼]` | 這些人在場 | 設為這些人，並更新足跡 |
| `[出場:]`（空） | **現場無人** | **清空 `appearingNpcs`**，不動足跡 |
| 完全沒有標記 | AI 沒照規矩 | 維持現狀（保守，避免誤清） |

⚠️ 空標記務必寫入。`appearingNpcs` 在 `buildPrompt` 裡**先於地點過濾**判定，只增不減的話
該 NPC 會無視地點跟著玩家跨城鎮，而且此狀態會存進存檔。

**NPC 注入資格（Phase 2 後）**：
1. `appearingNpcs` 裡的 NPC
2. `isPinned === true` 的 NPC
3. 候選名單內 `affection >= 60` 的 NPC

---

## AI 回應格式約定

### 結構化標籤清單（敘事內，非 COMMANDS 區塊）

| 標籤 | 用途 | 解析位置 |
|---|---|---|
| `<<COMMANDS>>…<</COMMANDS>>` | 指令區塊界定（容忍 `</COMMANDS>>`） | `commandParser.ts` |
| `COMMANDS v1` | 版本 header，解析時跳過 | `commandParser.ts` |
| `[出場:名1,名2]` | 出場 NPC（空 = 現場無人） | `App.tsx` + `APPEAR_TAG_*_PATTERN` |
| `[FONT:sans\|serif\|spell]…[/FONT]` | 字體切換，需成對 | `markdownParser.renderMarkdown` |
| `{{user}}` | systemPrompt 模板佔位符 → 玩家名字 | `promptBuilder` 的 `fillUser` |

**新增標籤時，三件事缺一不可**：① prompt 教 AI 輸出、② 前端有解析、
③ `cleanNarrative` 能清掉殘骸（含未閉合／未成對的畸形寫法）。
少了 ③ 就會直接印在故事裡給玩家看——`[重要NPC]` 就是這樣活了很久（已移除）。

出場標記的正則一律用 `markdownParser` 匯出的共用常數，不要再各寫一份
（曾散落在串流遮蔽、最終清理、名單擷取三處）。`m` flag 不可省，否則未閉合標籤
後面接換行時 `$` 不匹配。

### COMMANDS 指令格式

**格式為 COMMANDS v1：一律 `指令|key=value|key=value`**，不再使用冒號分隔。

```
<<COMMANDS>>
COMMANDS v1
STAT|field=hp|delta=-10
STAT|field=gold|delta=+100
AFFINITY|npc=芬里爾|delta=+5
LOCATION|name=月湖鎮
TIME|delta=+2h
ITEM_ADD|name=草藥|qty=1|desc=回復 20 HP
ITEM_USE|name=草藥
NPC_NEW|name=芬里爾|race=精靈|gender=男|job=獵人|appearance=銀髮高挑|personality=冷靜寡言
NPC_THOUGHT|npc=芬里爾|text=覺得玩家值得信任
QUEST_COMPLETE|title=任務名
MEMORY_ADD|type=region|importance=normal|content=迷霧森林昨日大火|locations=迷霧森林|keywords=大火|sticky=3
FACTION_NEW|name=黑牙氏族|type=criminal|desc=盤據東境的盜賊團
<</COMMANDS>>
```

⚠️ **完整指令清單以 `promptBuilder.ts` 的 `[COMMAND FORMAT]` 區塊為準**（那份才是真正送給 AI 的規格），這裡只示範格式。兩邊過去各記一份而長期不同步，不要再把完整清單複製到這裡。

### 指令參數的防衛（都是踩過的坑）

| 參數 | 規則 | 為什麼 |
|---|---|---|
| `TIME\|delta=` | `parseTimeDelta()`：支援 `h`/`m`/中文單位；**缺單位時以分鐘解讀並 warn**，不丟棄 | TIME 是每回應必須輸出的指令，丟棄＝遊戲時鐘停擺且無跡象 |
| `STAT\|field=` | 白名單 `STAT_FIELDS`（hp/mp/gold），未知欄位丟棄並 warn | 舊版 `type = field.toUpperCase()` 照單全收，未知欄位變幽靈 type 死在 reducer 的 default |
| `qty=` | `parseQty()`：非正整數退回 1 | `parseInt(x) \|\| 1` 讓**負數**原樣通過（負數是 truthy），ITEM_ADD 會變成扣庫存 |

認不得的指令在 reducer 的 `UNKNOWN` / `default` 分支會 `console.warn` 並附上原始文字。
不要把這些 warn 拿掉——指令靜默失效時，玩家只看得到「數值沒變」，沒有 log 就無從查起。

**為什麼一律用 pipe**：冒號格式無法區分分隔符與內容本身的冒號。
`MEMORY_ADD:world:critical:魔王宣布:向月湖鎮宣戰` 會被截成 `content = "魔王宣布"`，
後半段**靜默丟棄**。冒號格式僅作為舊存檔的 fallback 保留在 `commandParser.ts` 的
`default` 分支（已修正為掃描到第一個已知 meta key 才結束 content），不要在 prompt
中再教 AI 使用。

**COMMANDS 區塊在串流結束後才解析**，不要在串流中途觸發。

---

## 重要設計決策

| 決策 | 原因 |
|---|---|
| HP / MP 無上限 | 支援升級後成長感 |
| 邏輯集中：App.tsx 組裝 + utils 純函數層 | 業務邏輯可測試，App.tsx 只做接線 |
| Supabase 雲端存檔（強制登入） | 跨裝置同步；`saveDataMapper` + schema migration 統一入口 |
| API Key 不進存檔 | 安全性考量 |
| callAI 封裝層 | 未來換 API 服務只需改一處 |
| 記憶四層架構 | world / region / scene / npc，依影響範圍分層注入 |
| `summaryPool` 注入為 `[前情提要]` | 助理 GM 的中期記憶原本只流向日記、從不回主 GM，「最近 20 則」與「日記」之間整段對 AI 不存在 |
| prompt 靜態層排最前 | Gemini context caching 是前綴匹配；COMMAND FORMAT（約 2.7k 字）原本排在 Recent Chat 之後，永遠不可能命中 |
| 空區塊整段省略 | 「（無）」佔位每回合白燒 token，且模型得讀完標題才知道沒東西 |
| memories[] LOD 淘汰 | 注入端截斷只管單回合送幾條，不影響儲存量；沒有上限則存檔無限膨脹、每回合全量掃描 |
| CSS Variables 統一顏色 | 主題切換只需改 Variables，不動 className |
| 顏色禁止硬編碼 | 維護性，未來多主題支援 |
| NPC 兩階段注入 | 避免全體 NPC 塞滿 prompt |
| itemCatalog 道具圖鑑（Master Data） | 道具定義只存一份、先寫先贏去重，描述全遊戲一致且存檔不膨脹 |
| saveToCloud 髒標記 | 快照未變更時跳過整包 JSON 上傳 |
| 好感度顏色固定 | 語意色不隨主題變動 |
| `cartFare` 僅 AI 寫入 | 玩家 UI 不顯示馬車費用欄位 |
| 手動結案的獎勵閘門是 `isGoalMet` | `isGoalMet` 由 AI 的 `QUEST_GOAL_MET` 寫入、玩家改不到，是唯一「目標確實達成過」的憑據。沒有它就照發獎勵的話，接任務→按一下→領錢，任務系統變成無限金幣按鈕 |

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

6. **NPC 記憶濃縮鏈：想法滿 10 則 → 1 條記憶，可融合記憶滿 10 條 → 1 條摘要**，兩個閾值都在 `commandReducer.ts`（`THOUGHTS_LIMIT` / `MEMORY_MERGE_LIMIT`），不要改動
   - `thoughts[]` 滿 10 則串接寫入 `memories[]`（source: `pre_merge`）並清空。判斷式是 `>= 10` 不是 `> 10`，後者會在第 11 則才觸發、且打包只取最新 10 條，最舊那則隨清空一起消失
   - 可融合記憶（`pre_merge` / `merged`）滿 10 條時交助理 GM 濃縮成一條 `merged`，原文標記 `isMerged: true` 封存
   - **`source: 'manual'` 的玩家手寫記憶永不參與融合，也不計入門檻**（判斷入口 `isMergeable()`）。所有 `importance: 'core'` 都是手寫來的，因此一併受保護——玩家練到好感 60 才特地寫下的記憶被 AI 改寫掉是不可接受的

7. **`[出場:]` 標記用 `matchAll` 收集並去重**，不要改回單次 `match`；**空標記代表「現場無人」，必須寫入以清空 `appearingNpcs`**，不要再加 `length > 0` 的守衛（見上方三種語意表）

8. **`pinnedNpcs` 已在 `relevantLorebook` 去重**，不要讓同一 NPC 出現兩次於 prompt

9. **`backstory` 解鎖條件是好感度 ≥ 20，永久解鎖**（不因好感度下降而隱藏）

10. **好感度顏色一律使用 CSS 變數**（`var(--affection-*)`），`affectionColor()` 是唯一判斷入口

11. **顏色禁止硬編碼，禁止使用 Tailwind 內建顏色 class**，一律用 CSS Variables（見上方「顏色系統強制規則」）

12. **`@theme` 區塊只保留字體定義**，不得覆寫任何顏色

13. **道具去重走 `itemCatalog` 先寫先贏**：`ITEM_ADD` 遇同名道具沿用圖鑑既有描述，不要改成「後寫覆蓋」；道具名稱一律先過 `normalizeItemName()` 再當 key

14. **好感度標籤是衍生值，不要再加回存檔欄位**。舊的 `Npc.affectionLabel` 只在建檔時寫入、之後永不更新，好感度漲到 90 仍停在「陌生」，且 AI 建檔與手動建檔各寫一種預設值。一律呼叫 `relationText()` 現算

15. **出場 NPC 的 prompt 必須帶「對玩家」欄位**（`promptBuilder` 的 `[Scene Lorebook]`）。那是 NPC 決定語氣與態度的唯一依據，先前整條漏掉，模型只拿得到外貌／個性／記憶

16. **prompt 的靜態前綴順序是 `[System Context]` → `[Player]` → `[COMMAND FORMAT]`，不要打散**。三段逐回合幾乎不變，合計約 2.9k 字元；只要有任何逐回合變動的內容插進去，後面全部失去 context caching 資格。動態內容一律排在 `---` 之後（`promptBuilder` 的 `staticContext` / `commandSpec` / `dynamicSections`），`promptBuilder.test.ts` 有測試釘住順序與前綴逐字一致性

17. **空區塊用 `section()` 整段省略，不要補「（無）」佔位**。唯一例外是 `[當前場景可能出現的角色]`——沒有候選時那句「無已知角色在附近。若故事需要新角色請自由創造。」是給 AI 的**指示**，不是佔位符，刪掉 AI 會不敢生成新角色

18. **NPC 的勢力歸屬唯一來源是 `Npc.factionIds`**。`Faction.npcIds` 已於 schema v5 廢除（`migrateV4toV5` 摺進 `factionIds` 後移除欄位），不要再讀寫它。先前兩邊各寫各的：`FACTION_JOIN` 寫 `factionIds`、勢力分頁勾選寫 `npcIds`，而 `promptBuilder` 只讀 `factionIds`——玩家手動勾的成員 AI 根本看不到。UI 端一律走 `onSetNpcFactions`（故事集勾選與 NPC 卡下拉選單共用）

19. **NPC 匯出入一律以「名稱」跨檔，不存 id**。`Npc.factionIds`、`Faction.homeId`、`FactionRelation.targetFactionId` 都是各存檔自己編的流水號，跨檔必然對不上，匯出時全部轉成名稱（勢力名／地點標題）。

    **勢力與角色必須一起匯出**（`buildNpcExport` 的 `factions` 區塊）。只帶角色的話，角色身上的勢力名稱在目標存檔找不到對應，歸屬會整段掉——這正是先前的行為。匯入端 `mergeImportedFactions` 依檔案帶的定義建立缺少的勢力（連同 `homeLocation` 與關係），再把結果當成 `existingFactions` 傳給 `mergeImportedNpcs`，**順序不可顛倒**，否則角色仍會被判成查無勢力。

    只有名稱、沒有定義的勢力（舊檔案）維持原行為：收集進 `unknownFactions` 回報，不靜默丟棄、也不建立。既有同名勢力一律先寫先贏，連 `description`／`color`／`relations` 都不覆蓋——玩家調過的關係圖不該被一次匯入洗掉。地點查無時 `homeId` 留空，**不會**順手建立地點條目

20. **「把 NPC 加進遊戲」一律要建兩份資料**：`npcs[]`（好感度／記憶庫／釘選／足跡）＋ `lorebookEntries` 的 NPC 條目（注入 prompt 的靜態設定）。`NPC_NEW`、`handleAddNpc`、`mergeImportedNpcs` 三個入口都是這樣做的。只建設定集條目的話，角色進得了 prompt 但沒有好感度、開不了記憶庫；只建 `npcs[]` 的話則不會出現在 Phase 1 的地點候選名單裡，**而且身分設定無處可存**（schema v10 起 `Npc` 上沒有那些欄位）

21. **NPC 身分設定的唯一來源是設定集條目**（性別／種族／年齡／職業／外貌／個性／背景／備註）。讀取一律 `resolveNpcProfile(findNpcLore(entries, name))`，不要自己 `find(e => e.category === 'NPC' && ...)`。`Npc` 上只有執行狀態。舊的雙來源留下的教訓：角色卡的編輯只寫設定集，`Npc` 那份從建檔之後就再也沒更新過

---

## 關鍵函數索引

| 函數 / 位置 | 說明 |
|---|---|
| `utils/promptBuilder.ts` `buildPrompt(deps, userInput, messages, ...)` | 組裝送給主 GM 的完整 prompt（App.tsx 以 `buildPromptWrapper` 注入依賴） |
| `App.tsx` `handleSendMessage()` | 主要對話送出與 AI 串流邏輯 |
| `useAIRequest` `callAI(prompt, options)` | 統一 AI 呼叫入口（主/助理 GM 分流、timeout/abort/retry） |
| `App.tsx` `updateAdventureState(history, newItems, hasKeyEvent)` | 觸發助理 GM 整理摘要與目標（每 3 回合節流，關鍵事件跳過） |
| `App.tsx` `handleGenerateDiary()` | 水晶球日記：AI 自動生成日記 |
| `App.tsx` `handleMergeDiary(ids)` | 融合多條日記 |
| `useCommandParser` `parseAndExecuteCommands(text)` | 整合 parse → reduce → effects 三層，執行 COMMANDS 區塊 |
| `utils/commandParser.ts` `parseCommandsToAST(text)` | 解析 COMMANDS 區塊為 AST |
| `utils/commandReducer.ts` `reduceCommands(commands, state)` | 純函數：計算狀態變更 |
| `utils/commandEffects.ts` `applyStateChanges(...)` | 套用狀態變更與副作用 |
| `useCommandParser` `scanKeywords(keywords, depth)` | 掃描最近 N 則對話是否含關鍵字 |
| `useCommandParser` `isMemoryTriggered(mem, input, loc)` | 判斷記憶是否應該注入 |
| `useCommandParser` `tickMemoryCounters(triggeredIds)` | 每回合更新 sticky/cooldown |
| `useGameStore` `buildSaveSnapshot(partial?)` | 組裝存檔快照，供 `saveToCloud` 上傳 |
| `useGameStore` `loadFromData(data)` | 匯入存檔並自動 migrate 舊格式（`saveDataMapper` + `runMigrations`）|
| `useAuth` `saveToCloud / loadFromCloud / listCloudSaves / deleteCloudSave` | Supabase `saves` 表 CRUD |
| `utils/npcProfile.ts` `resolveNpcProfile / findNpcLore / npcIdentityBrief` | NPC 身分設定的唯一讀取入口（來源是設定集條目，`Npc` 上沒有那些欄位） |
| `utils/affectionColor.ts` `affectionColor(affection)` | 回傳好感度對應 CSS 變數字串（唯一入口） |
| `utils/affectionLabel.ts` `affectionLabel / relationText` | 好感度語意標籤（衍生值，不存檔）；`relationText` 為顯示與 prompt 注入的共用入口 |
| `utils/itemCatalog.ts` `registerItemDef / touchItemDef / pruneItemCatalog / selectKnownItemNames` | 道具圖鑑：先寫先贏登錄、更新使用時間、LOD 淘汰、prompt 名稱切片 |
| `utils/memoryStore.ts` `pruneMemories / touchMemories` | memories[] 儲存層：LOD 淘汰、LRU 時間戳（無變更時回傳原 reference） |
| `utils/npcImport.ts` `parseNpcImport / mergeImportedFactions / mergeImportedNpcs / buildNpcExport / NPC_IMPORT_TEMPLATE` | 角色＋勢力批次匯入匯出：解析 JSON、勢力先合再合角色（同名先寫先贏）、匯出（勢力／地點／關係全以名稱來回）、範本 |
| `useCommandParser` `consumeItem(name, qty?)` | 使用道具（原名 useItem，因 hook 命名慣例改名） |
