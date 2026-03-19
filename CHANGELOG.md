# CHANGELOG.md — 開發日誌

> 純歷史紀錄，對開發者友好。待做任務請見 TODO.md。
> 每次 AI 改完功能，請在對應版本區塊補上一條記錄。

---

### B0 API 設定重構 2026-03-20 [Claude Sonnet 4.6]

**B0-1**：移除 `geminiApiKey`/`maxTokens` state，新增 `mainGMConfig`/`subGMConfig`（`src/App.tsx` line ~172）。App 啟動時一次性 migrate 舊 `gemini_api_key` → `mainGM_config`，不再隨存檔匯出。`types.ts` 新增 `GMConfig`/`SubGMConfig` 介面。

**B0-2**：`callAI` 加入 `role`/`maxTokens`/`onChunk` 參數，依 role 讀對應 config，`onChunk` 存在時走 streaming，否則走一次性 generateContent（`src/App.tsx` line ~330）。

**B0-3**：`handleGenerateDiary`/`handleMergeDiary` 改走 `callAI({ role: 'main' })`；`handleSendMessage` 不再直接建 `GoogleGenAI`，改走 `callAI({ role: 'main', onChunk: () => {} })`。移除 `vite.config.ts` 的 `GEMINI_API_KEY` define 與 `.env.example` 對應說明。

**B0-4**：`SettingsModal.tsx` 全面改版，新增雙 GM 設定區塊（主 GM / 助理 GM）、模型下拉選單（5 個 Gemini 模型）、Token 數字輸入框、`useSameKey` toggle、「儲存設定」按鈕（點擊才寫 localStorage）、API Key 顯示/隱藏切換。

---

### 串流顯示策略（延遲顯示）2026-03-20 [Claude code]

  主 GM 採用**延遲顯示**而非即時串流，避免 `<<COMMANDS>>` 原始指令短暫顯示在對話框造成出戲感。

  **執行順序**
  ```
  玩家送出訊息
    → buildPrompt 組裝主 GM Prompt
    → 主 GM 串流回覆（背景接收，不顯示）
    → 串流結束，parseAndExecuteCommands 執行
    → 解析 [出場:] 標記，更新 appearingNpcs
    → setMessages 顯示最終 narrative（一次性呈現）
    → 判斷是否觸發 GM 助理
        → 若觸發：Sub GM 輸出 JSON，更新摘要與目標
        → 若 diary_worthy 為 true：觸發水晶球日記，UI 亮點提示
    → 自動存檔
  ```
---

### 串流等待動畫：✦ 異世界正在回應 2026-03-19 [Claude Sonnet 4.6]

玩家送出訊息後、AI 第一個字元抵達前，對話泡泡顯示金色動畫省略號，避免白屏誤以為當機。

- `src/index.css`：新增 `@keyframes blink-dot`（0%/80%/100% opacity 0.2 translateY 0 → 40% opacity 1 translateY -4px）。
- `src/App.tsx`（訊息渲染區）：新增判斷分支：當 `msg.role === 'assistant'`、`msg.text === ''`、`isLoading === true`、且為最後一則訊息時，渲染「`✦ 異世界正在回應`」文字 + 3 顆金色小圓點（`w-1 h-1 rounded-full bg-[#e6bf55]`），各自套用 `blink-dot` 動畫並以 0 / 200 / 400ms stagger 錯開；串流首字元到達後 text 非空，自動切回 `renderMarkdown` 正常渲染。

---

### NPC 出場流程優化 2026-03-18 [Claude Sonnet 4.6]

補強兩階段 NPC 注入架構的時序缺口，新增地點類型欄位控制候選名單上限，並修正 Pinned NPC 重複注入問題。

- `src/types.ts`：`LorebookEntry` 新增 `locationType?: 'town' | 'wilderness' | 'building'`。
- `src/constants.ts`：15 個初始地點條目補上 `locationType`（月湖鎮 → `town`；驛站、公寓、詩社、市集 → `building`；其餘 → `wilderness`）。
- `src/hooks/useCommandParser.ts`（`LOCATION_DISCOVER`）：新增 `inferLocationType(name)` 純函式，AI 新增地點時自動推斷 `locationType`（建築關鍵字優先，避免「月湖鎮酒館」誤判為 town）。玩家可在 LorebookModal 手動覆蓋。
- `src/App.tsx`（`buildPrompt`）：
  - Phase 1 候選名單上限動態化：`town` → 8，其他 → 3（原本硬寫 5）。
  - Phase 2 完整注入加入「候選名單內好感度 ≥ 60」條件（`isHighAffectionCandidate`），限定在 `npcCandidates` 範圍，不全體掃描。
  - `pinnedNpcs` 去重：已在 `[Scene Lorebook]` 注入的 NPC 不再重複出現於 `[Pinned NPCs]`。右欄「✦ 關注」UI 不受影響。
- `src/App.tsx`（`handleSendMessage`）：`[出場:]` 改用 `matchAll` 收集，去重後再 `setAppearingNpcs`，防止重複標記造成重複注入。
- `src/components/LorebookModal.tsx`：地點編輯表單新增 `locationType` 下拉選單（自動推斷 / 城鎮 / 野外 / 建築）。

### NPC 記憶庫系統 2026-03-18 [Claude Sonnet 4.6]

升級 NPC memories 從純字串陣列為結構化物件，實作 thoughts 自動轉寫與 AI 融合機制。

- **`src/types.ts`**：新增 `NpcMemory` interface（id / text / createdAt / source / importance / isMerged / mergedFrom）；`Npc.memories` 型別從 `string[]` 升級為 `NpcMemory[]`。
- **`src/hooks/useGameStore.ts`**（`npcs` 初始化）：存檔讀入時自動 migrate 舊 `string[]` → `NpcMemory[]`（source: 'manual', importance: 'normal'）。
- **`src/hooks/useCommandParser.ts`**：
  - `CommandParserDeps` 新增 `callAI: (prompt: string) => Promise<string>`，移除對特定 API 的直接依賴。
  - `NPC_THOUGHT` 邏輯升級：thoughts 滿 5 則時自動串接寫入 `memories[]`（source: 'pre_merge'）並清空 thoughts；未融合記憶超過 8 則時自動呼叫 `triggerNpcMemoryMerge`。
  - 新增 `triggerNpcMemoryMerge`：透過 `callAI` 呼叫 Sub GM 融合舊記憶，生成摘要寫入 memories（source: 'merged'），原始記錄標記 `isMerged: true` 保留不注入。
- **`src/App.tsx`**：
  - 新增 `callAI` 封裝函數（`useCallback`），統一所有內部 AI 呼叫入口，不綁定特定 API 服務，未來換 API 只需改此處。
  - `updateAdventureState` 改用 `callAI`，移除直接 `new GoogleGenAI(...)` 呼叫。
  - `handleAddNpcMemory` 升級：接收 `importance` 參數，寫入完整 `NpcMemory` 物件。
  - `handleRemoveNpcMemory` 改為用 `memId: string` 刪除（原本用 index）。
  - 新增 `handleUpdateNpcMemory`：支援直接編輯記憶文字與 importance 切換。
  - `buildPrompt` `[Scene Lorebook]` NPC 區塊加入記憶庫注入（好感度 ≥ 60 才注入，截斷規則：core 全部 / normal 最近 5 則 / merged 最近 2 則 / 超過 300 字縮到 3 則）。
  - `[Pinned NPCs]` 區塊同步套用相同的記憶庫注入格式。
- **`src/components/NpcModal.tsx`**（完整改寫）：
  - 加入 Tab 切換（資料 / 記憶庫），避免 Modal 過長。
  - 記憶庫 Tab：好感度 ≥ 60 才顯示；每筆記憶顯示日期、來源標籤（手動 / 想法 / 摘要）、★ 切換 core/normal、可直接編輯文字、可刪除。
  - `isMerged: true` 的封存記錄摺疊於「查看已封存的原始記錄」。


## [2026-03-17] v15

### 清單虛擬化與訊息快取 2026-03-17 [Codex]

- 訊息區、Lorebook、NPC 導入 virtualized list，對話採 session chunk。
- 先做顯示層截斷（只影響 UI render，state 保持完整），避免影響 AI context。`session chunk` 必須明確區分顯示層截斷與 AI context 管理（後者由 `buildPrompt` 的 `SLIDING_WINDOW` 處理）。
- 觸發條件採可執行基準值：`scroll long task > 50ms`（後續量測可調整）；訊息數與 DOM 節點數僅作為觀察值。三個清單分開決策：訊息區優先，Lorebook/NPC 依量測再決定。

### 系統檔案修復 2026-03-17 [Gemini]

- 從 GitHub 儲存庫恢復了遺失的核心檔案與組件（`main.tsx`, `index.css`, `types.ts`, `constants.ts`, `useGameStore.ts` 以及所有 Modal 組件），解決了 Vite 建置失敗的問題。
- 新增 `sync.ps1` 腳本，方便使用者將下載的 ZIP 檔自動解壓縮並推送到本機的 `E:\MIKA\RP-world` 專案中。

### Bug 修正與優化 2026-03-17 [Gemini]

- 左側 UI 瘦身：將 [個人資訊]、[設定集]、[Prompt]、[設定] 四個功能按鈕，從原本佔據多行的大按鈕簡化為兩行並列的 2x2 網格，節省左側欄位空間。
- 存檔匯出優化：導入 `File System Access API` (`window.showSaveFilePicker`)。現在點擊「匯出存檔」時，支援的瀏覽器會彈出視窗讓玩家自訂存檔路徑與檔名；若瀏覽器不支援，則自動退回原本的直接下載模式。
- 道具與消耗品欄位改版：將原本會撐爆版面的手風琴折疊清單，改為點擊後向右展開的絕對定位懸浮面板 (Popover)，並加入關閉按鈕與毛玻璃特效，大幅優化左側空間利用率。
- 移除 GitHub 備份功能：因應需求，移除了設定面板中的 GitHub PAT (Gist) 備份功能及相關 UI。
- 修復訊息刪除與編輯失效：修正了玩家對話框的 [刪除] 與 [編輯] 功能，現在變更會立即寫入 localStorage，避免重新整理後恢復原狀。同時發送新訊息時也會立即存檔。

### Bug 修正與地圖調整

- 修正 `TIME:+...` 在同回合多次出現時的累加覆蓋問題：改為先累計 `timeDeltaMinutes`，在解析完命令後一次套用時間，並以最終時間統一檢查任務期限。
- 修正匯入存檔遺漏 `appearingNpcs` 的狀態還原：在 `loadFromData` 補上 `setAppearingNpcs(...)`。
- 修正馬車旅行可能扣到負金幣：旅行前檢查 `profile.gold < fare`，不足時顯示提示並中止扣款。
- 地圖優化（`MapModal.tsx`）：
  - 新增「當前位置」脈衝圈與徽章強化辨識。
  - 新增節點標籤偏移（label offset）降低文字重疊。
  - 新增路線層（route segments）連線，並高亮目前位置相連路徑。

署名：GPT-5.2-Codex

### 主介面全站深藍金主題重設計

完整的視覺主題升級，將現有 stone 深色系全面替換為深海藍 × 金色手稿風。

- `src/index.css`：新增 CSS Variables 定義深藍金色票（`--bg0` ~ `--danger`）
- `src/App.tsx`：
  - 替換所有 Tailwind stone-* 類為新色票（#0a1628 ~ #c9a84c）
  - 字體改為 Georgia, serif
  - 「✦ 關注」标题（移除 Heart icon）
  - 記憶卡片左邊線統一為金色
  - Markdown 引用區塊邊線改為金色
  - 金幣金額文字改為金色
  - 所有邊框、按鈕、輸入框顏色更新
- 組件文件（DiaryModal / LorebookModal / NpcModal / QuestModal）：
  - 批量替換 stone-* / indigo-* / amber-* 顏色
  - 確保所有 Modal UI 與主介面視覺統一

### 系統設定與世界觀設定介面優化

優化 `SystemPromptModal` 與 `LorebookModal` 介面，提升視覺一致性與操作體驗。

- `src/components/SystemPromptModal.tsx`：
  - 移除「世界觀前提」、「扮演規則」、「文筆風格」標題前的圖示。
  - 實作 textarea 自動高度調整，確保內容完整顯示且無內部捲軸。
  - 將功能說明文字合併至標題行，減少垂直空間佔用。
- `src/components/LorebookModal.tsx`：
  - 統一「新增設定」按鈕與搜尋框圓角為 `rounded-[8px]`。
  - 優化分類過濾按鈕樣式，增加特定分類的視覺強調。
  - 為前三項設定卡片增加 `rounded-[8px]` 與 `border-2` 強調，區分重要性。
  - 編輯狀態下的容器增加圓角處理。

---

## [2026-03-15] v14

### 地圖六項細節調整

針對使用體驗問題進行修正，包含視覺、互動與資訊架構。

- `src/components/MapModal.tsx`：
  - 刪除右欄底部圖例（你在這裡 / 已知地點 / 未踏足）
  - 選取目標節點改為圓型發光（移除外框線，改用 Gaussian blur 半透明填充圓）
  - 移除節點 hover tooltip（懸停不再彈出資訊框）
  - 月湖鎮 + 異鄉人公寓合併為單一地圖節點（座標距離閾值 20 自動分群），點擊後浮現兩個可點選地名標籤，選中者金底深藍字
  - 前往方式固定在右欄底部（`shrink-0`，不隨內容捲動）
  - 區域記憶獨立為中間固定分區，無記憶時顯示「暫無區域記憶」
  - 修正 Rules of Hooks 違反（三個 useCallback 移至 early return 前）
  - 修正 discovered 節點選取無視覺反饋（選取時顯示深紅外圈光暈）
  - 修正搜尋欄未篩選「未踏足」清單

---

## [2026-03-14] v13

### 世界地圖視覺重寫（深藍金風格）

完整翻新 MapModal.tsx 視覺設計，石板灰圓形節點 → 深海藍底 × 金色手稿風格。

- `src/components/MapModal.tsx`（完整視覺重寫）：
  - 整體底色 `#0a1628`（深海藍），容器背景 `#0d1f3c`，金色頂邊線 `#c9a84c`
  - 節點形狀：`known`/`current`/`selected` → 八角星芒 `<polygon>`（`starPoints()` helper）；`discovered` → 虛線圓形 + `?`
  - 節點色：currentLocation 金色 `#c9a84c` 三層暈光；selected 深紅 `#cc4422` 三層暈光；known 藍色 `#4a7ac9`
  - Bezier 曲線改為金色虛線（`stroke: #c9a84c`, `strokeDasharray: 5 3`）
  - SVG 裝飾：細格線紋理 + 暗角 radialGradient + 四角 L 型金色裝飾線
  - 羅盤（左下角絕對定位）：八角星芒底盤 + 指北針金色 / 其餘藍色，點擊重置視角 + Toast
  - Header 搜尋欄：深藍底、金色底邊線，即時篩選右欄地點列表
  - 右欄重設計：`✦ 【地點名稱】` 標題、菱形分隔線、金色左邊線區域記憶、兩段式旅行選擇（選模式 → 啟程金底按鈕）
  - 無選取狀態：顯示已知/未踏足地點列表（可點擊跳至該節點）
  - 圖例移至右欄底部小字
- `src/App.tsx`：MapModal JSX 新增 `showToast={showToast}` prop

---

## [2026-03-14] v12

### 世界地圖完整重寫：lorebookEntries 資料源 + 旅行系統

將地圖架構從獨立 WorldMap state 遷移至 lorebookEntries，並實作坐馬車/徒步旅行邏輯。

- `src/types.ts`：`LorebookEntry` 新增 5 個可選欄位：`mapX`, `mapY`, `cartFare`, `mapStatus?: 'discovered' | 'known'`, `adjacentTo`。
- `src/constants.ts`：`INITIAL_LOREBOOK_ENTRIES` 所有 15 個 `category='地點'` 條目補上座標（沿用 INITIAL_WORLD_MAP 數值）、cartFare（依地點危險度設定 0–80 銅）、mapStatus（月湖鎮/異鄉人公寓 `'known'`，其餘 `'discovered'`）。
- `src/hooks/useCommandParser.ts`：
  - `CommandParserDeps` 新增 `lorebookEntries: LorebookEntry[]`
  - `LOCATION_DISCOVER` 完整重寫：已在 lorebook 的地點 → 改 `mapStatus='known'`；未知地點 → 新增 lorebook entry（`mapStatus='discovered'`，無座標）。移除對 `setWorldMap` 的依賴。
- `src/components/MapModal.tsx`（完整重寫）：
  - 資料來源從 `WorldMap` 改為 `lorebookEntries`（category='地點' AND mapX 已設）
  - 節點統一使用圓形，依狀態視覺區分：玩家所在（綠色微發光）/ 已知（石板灰）/ 未踏足（半透明+問號）
  - 點選節點 → 右欄顯示地點名稱、content 說明、區域記憶、旅行按鈕
  - 旅行按鈕：🐴 坐馬車（cartFare > 0 才顯示，金不夠顯示「阮囊羞澀」）/ 🚶 徒步前往
  - 選擇不同節點時顯示 cubic bezier 曲線連接玩家所在地與目標
  - 無座標地點（LOCATION_DISCOVER 新增）顯示於「旅途發現」列表
- `src/App.tsx`：
  - 新增 `handleTravel(destName, byCarriage)`：扣除馬車費、更新 currentLocation、將目的地標記 `mapStatus='known'`、關閉地圖、送訊息給 AI
  - `useCommandParser` 增加 `lorebookEntries` 傳入
  - 移除 `mapOrigin`、`mapDestination` state 及 `calculateTravelTime` 函數
  - MapModal 改用新 props（lorebookEntries / currentLocation / profile / memories / onTravel）

---

## [2026-03-14] v11

### 任務系統規格升級：兩階段完成流程 + QUEST_GOAL_MET

實作「目標達成 → 回報領賞」的兩階段任務流程，讓任務完成更沉浸、更符合 RPG 邏輯。

- `src/types.ts`：Quest 介面新增 `isGoalMet: boolean` 欄位，表示目標是否已達成但尚未回報；`buildPrompt` 型別安全修正（`currentMessages` 改為 `Message[]`，補 `Message` import）。
- `src/hooks/useCommandParser.ts`：
  - `QUEST_ADD` 建立任務時預設 `isGoalMet: false`
  - 新增 `QUEST_GOAL_MET:任務名` 指令解析：將任務標記為目標已達成，Toast「🎯 任務目標達成：XX（請向委託人回報）」
- `src/hooks/useGameStore.ts`：存檔載入時自動 migrate 舊任務（補 `isGoalMet: false` 預設值）。
- `src/App.tsx`（`buildPrompt`）：進行中任務注入依 `isGoalMet` 狀態輸出不同格式（目標已達成顯示「目標已達成，待玩家回報」）；COMMAND FORMAT 新增 `QUEST_GOAL_MET` 範例與說明。
- `src/components/QuestModal.tsx`：
  - 頂部狀態計數擴充為四種（進行中 / 待回報 / 已完成 / 失敗）
  - 每張任務卡前方加勾選框（☐ 進行中 / ☑ 待回報與已完成）
  - 待回報任務：琥珀色邊框，右上角「待回報」標籤，勾選框顯示 ☑
  - 待回報任務排在進行中任務前面顯示

---

## [2026-03-14] v10

### App.tsx 狀態管理重構 + 型別安全全面修正
將 App.tsx 從「大雜燴」重構為純 UI 容器，邏輯完全由自訂 Hooks 驅動。

- `src/hooks/useGameStore.ts`（新增）：集中管理所有遊戲狀態（timeState, profile, systemPrompt, npcs, memories, quests, diaryEntries, lorebookEntries, inventory, consumables, messages, quickOptions, worldMap 等）。提供 `saveToStorage()` 統一存檔入口（key 固定為 `rpworld_save`），以及 `loadFromData()` 匯入舊存檔並自動 migrate 舊格式（worldMemory / factionMemory / locationMemory）。
- `src/hooks/useCommandParser.ts`（新增）：封裝 `parseAndExecuteCommands`、`applyItemEffect`、`scanKeywords`、`isMemoryTriggered`、`tickMemoryCounters`，接受 store 切面作為依賴，透過 `onNewQuest` callback 解耦 UI 狀態。
- `src/App.tsx`：移除 509 行遊戲邏輯，僅保留 UI state（Modal 開關、輸入、loading）、`buildPrompt`、`handleSendMessage` 及 JSX。存檔/匯入/重置改呼叫 hook 提供的函數，避免重複邏輯。
- `src/types.ts`：修正 `DiaryEntry`（對應實際 `text/isActive/keywords` 欄位）；新增 `MemoryEntry`、`InventoryItem`、`ConsumableItem` 完整型別定義，消除 `any`。
- `src/main.tsx` + `src/index.css`（重建）：補回被 GitHub 版本刪除的兩個入口檔案。
- TypeScript 編譯零錯誤，`npx tsc --noEmit` 通過。

---

## [2026-03-14] v9

### 型別與常數提取重構
為了提升程式碼的可維護性與一致性，進行了大規模的型別與常數提取重構。
- 統一型別定義：建立 `src/types.ts`，將散落在各組件中的 `Profile`, `Npc`, `Quest`, `LorebookEntry`, `SystemPrompt`, `TimeState`, `WorldMap`, `Message`, `DiaryEntry` 等核心型別統一管理。
- 靜態資料提取：建立 `src/constants.ts`，將 `MONTHS_DATA`, `INITIAL_SYSTEM_PROMPT`, `INITIAL_LOREBOOK_ENTRIES`, `INITIAL_WORLD_MAP`, `TOKEN_OPTIONS` 等靜態資料從 `App.tsx` 移出。
- 組件重構：更新 `App.tsx` 及所有 Modal 組件（`ProfileModal`, `NpcModal`, `QuestModal`, `LorebookModal`, `SystemPromptModal`, `MapModal`, `DiaryModal`, `SettingsModal`），移除本地重複的型別與常數定義，改為引用統一的檔案。
- 狀態初始化優化：更新 `App.tsx` 中的狀態初始值，確保使用正確的型別與預設常數。

### 存檔 Icon 修正
- 修正「匯出存檔」與「匯入存檔」圖示相反的問題：匯出改為 `Upload` (向上)，匯入改為 `Download` (向下)。

---

## [2026-03-13] v8

### NPC 出沒系統 + 兩階段注入
讓 NPC 根據劇情自然累積出沒地點，前端依地點篩選候選名單，AI 決定誰真正出場，避免 NPC 無限膨脹也保留生活感。
- 資料結構：LorebookEntry 新增 `homeLocation`（主場地點）與 `roamLocations`（滑動窗口，保留最近 3 個非主場地點）。
- 指令：新增 `NPC_NEW`（建立新 NPC lorebookEntry）、`NPC_HOME`（首次登場寫入主場，唯寫一次）、`NPC_LOCATION`（記錄巡遊地點）。
- 第一階段注入：進入地點時，篩選 homeLocation 或 roamLocations 符合的 NPC（最多 5 個），以輕量格式（名字＋職業）注入 Prompt 候選名單。
- 第二階段注入：AI 在對話內文輸出 `[出場:姓名]` 標記後，前端偵測並注入完整 NPC 資料（外貌、個性、thoughts），同時觸發上次見面地點與日期自動更新，並從顯示文字移除標記。
- UI：LorebookModal 新增 homeLocation / roamLocations 欄位顯示與編輯。

### 道具 effect 前端處理
消耗品新增 `effect` 欄位（hp / mp / gold / status），由 AI 透過 `ITEM_ADD` 建立時一併寫入，前端直接套用，不需 AI 介入計算。
- 函數：新增 `applyItemEffect(itemName)` 共用函數，處理兩種觸發方式（按鈕 / AI 指令）。
- 指令：新增 `ITEM_USE:道具名`，AI 判斷玩家在對話中使用消耗品時輸出，`parseAndExecuteCommands` 呼叫 `applyItemEffect`。
- UI：道具欄「使用」按鈕直接呼叫 `applyItemEffect`，同時送出訊息讓 AI 接續描述場景。
- Toast：依實際 effect 內容動態產生，例如「🧪 草藥：HP +30」。

### 新增 NPC「角色想法」功能
實作 NPC 內心想法系統，讓 AI 在後續對話中能維持該 NPC 的態度與立場。
- 資料結構：新增 `relationship`、`lastSeenLocation`、`lastSeenDate` 與 `thoughts` 欄位。
- 指令解析：新增 `NPC_THOUGHT` 指令，AI 可動態寫入 NPC 的內心想法（最多保留 5 則）。
- 自動更新：對話結束後，自動更新有被提及的 NPC 的「上次見面地點與日期」。
- Prompt 注入：在 `buildPrompt` 中將 NPC 的近期想法注入給 AI 參考。
- UI 改版：更新 `NpcModal` 介面，新增關係、上次見面資訊，以及底部漸層透明度的「💭 角色想法」卡片區塊。

### 任務系統動態化
新增 `QUEST_ADD` 與 `QUEST_COMPLETE` 指令，讓 AI 能動態發布與完成任務。任務狀態（進行中、已完成）將同步顯示於任務面板中。

### Prompt 記憶寫入規則
在 `buildPrompt` 的 COMMAND FORMAT 說明裡，加入「AI 何時應輸出 MEMORY_ADD」的規則，包含五種情境（世界事件、區域事件、場景狀態改變、NPC 情報、玩家重要事件），並特別規定當 AI 回應裡出現 `[ ]` 布告欄內容時，必定觸發 `MEMORY_ADD:region`。

### Scrollbar 樣式統一
在 `src/index.css` 新增全域捲軸樣式，使用 `::-webkit-scrollbar` 自訂滾動條，配合現有黑色系 UI，提升整體視覺一致性。

---

## [2026-03-13] v7

### 本機開發環境建立
安裝 Node.js 與 GitHub CLI（`gh`），設定 `.claude/launch.json` 讓 Claude Code 可直接啟動 Vite dev server（port 3001）並即時預覽。

### 頁面自動載入存檔進度
所有遊戲 state（profile、messages、memories、currentLocation、timeState 等）改用 lazy initializer，啟動時直接從 `rpworld_save` 讀取，無需手動匯入，重整頁面即還原進度。

### timeState 納入存檔
快捷存檔、匯出存檔、匯入存檔一併處理遊戲時間（年月日時分天氣），避免重整後時間回到預設值。

### 匯出 / 匯入 Icon 交換
匯出存檔改用 ↓ Download icon，匯入存檔改用 ↑ Upload icon，語意更直覺。

### 匯出檔名加入玩家名稱
格式改為 `RPworld-{玩家名}-{日期}-{hr}-{mi}.json`，特殊字元自動替換為 `_`，方便辨識存檔歸屬。

### Markdown Parser（renderMarkdown）
新增 `renderMarkdown(text)` 與 `renderInline(text, keyPrefix)` 兩個函數，放在 component 外部。
處理順序：按 `\n` 切行 → 判斷行類型（`>` 引用、`---` 分隔線、一般段落）→ 行內語法替換（`` `code` ``、`bold`、`*italic*`）。
連續 `>` 行自動合併成同一引用區塊，正確呈現信件格式。
只有 `msg.role !== 'user'` 時才呼叫 renderMarkdown，玩家訊息維持 `whitespace-pre-wrap`。

---

## [2026-03-13] v6

### MaxTokens 輸出長度設定
在系統設定 Modal 新增 16K / 32K / 64K 三段切換按鈕，控制 Gemini API 的 `maxOutputTokens`。選擇儲存至 `localStorage('gemini_max_tokens')`，預設 32K。三個 API 呼叫（串流對話、水晶球日記、融合日記）均套用此設定。

### 清除 Lorebook 預設 NPC 資料
移除 `lorebookEntries` 初始陣列中全部 21 筆 NPC 資料（芬里爾至魔王，id 18–39）。地點 14 筆保留不動。新遊戲／重置後 NPC 設定集為空白，由玩家自行填入。

---

## [2026-03-12] v4（當前版本）

### 統一記憶資料結構（重大架構變更）
移除三個分散的記憶陣列（`worldMemory` / `factionMemory` / `locationMemory`），合併為統一的 `memories[]`。每條記憶有完整欄位：type、importance、content、tags、trigger、source、createdAt、expiresAt。舊存檔讀入時自動 migrate，不會破壞現有進度。

新增 `stickyCounters` 與 `cooldownCounters`，讓記憶可以在觸發後持續 N 則、冷卻 N 則後才能再觸發，仿 SillyTavern 的 sticky / cooldown 機制。

### MEMORY_ADD 指令升級
從簡單的 `MEMORY_ADD:type:content:tag` 升級為支援完整 tags 的格式。AI 現在可以精確指定地點、NPC、陣營、關鍵字，以及 sticky 持續則數和臨時記憶的過期時間。

### Lorebook 觸發升級
新增 `secondaryKeys`（次要關鍵字）和 `selective`（AND 邏輯開關）。開啟 AND 邏輯後，必須主關鍵字和次要關鍵字都命中才觸發，避免條目被無關對話誤觸發。新增 `insertionOrder` 控制多條目同時觸發時的注入順序。

### Gemini API Key 輸入
在系統設定 Modal 加入 API Key 輸入欄，儲存至 localStorage，不需要環境變數也能使用。

### 開發環境
建立 GitHub repo（`Mika80808/RP-world`）。建立 `sync.ps1` Windows 腳本，自動解壓縮 zip 並 push 到 GitHub。確認 Claude Code 桌面版可讀取 repo，未來可直接操作本地檔案。

---

## [2026-03-12] v3

### 前端 COMMANDS 解析器
AI 回應末尾的 `<<COMMANDS>>...<</COMMANDS>>` 區塊由前端攔截解析，不顯示給玩家。支援：HP / MP / 金幣增減、NPC 好感度更新、地點移動、時間推進、道具新增移除、記憶寫入。數值變化依序彈出 Toast 通知。

### buildPrompt 場景條件注入
Lorebook 改為只注入與當前地點相關的條目。對話記錄只送最近 20 則（滑動窗口）節省 token。

### 日記關鍵字觸發
日記條目新增 `keywords` 欄位。空陣列 = 永遠注入，有值 = 掃最近 5 則對話才注入。

---

## [2026-03-12] v1 / v2（初始版本）

### 核心功能建立
三欄遊戲介面、任務 Modal、個人資訊 Modal、系統設定 Modal、日記系統、Lorebook 設定集、NPC 詳情、世界地圖、存檔匯出匯入重置、訊息泡泡操作、道具管理、狀態列、月份雅稱系統。

AI 串接 Google Gemini 2.0 Flash，世界觀資料約 NPC 30+ 筆、地點 14+ 筆。

### 架構決策
HP / MP 無上限（支援升級成長感）。資料儲存用 localStorage。技術棧 React + TypeScript + Vite。

---

## [2026-03-12] v5

### 介面與提示詞優化
1. 增加了編輯訊息時的文字框高度（`min-h-[200px]`），方便編輯長篇內容。
2. 更新了給 AI 的 Prompt，限制快捷選項（`<<OPTIONS>>`）必須在 10 個字以內，且以簡單動作為主。
3. 修改了對話視窗底部的毛玻璃效果，使用 `mask-image` 實作往上淡出的漸層模糊效果。
4. 修改了初始訊息（ID 1），提供更具沉浸感的開場白。

### 個人資訊與數值系統調整
1. 個人資訊的職業預設為「異鄉人」。
2. 補充了個人資訊各欄位的提示文字（Placeholder），引導玩家填寫。
3. 預設 MP、金錢為 0。
4. 移除了 HP / MP 的上限設定（`maxHp` / `maxMp`），現在數值可以無上限成長，並同步更新了介面顯示與給 AI 的 Prompt。

### 快捷選項與重新生成功能修復
修復了快捷選項點擊無效的問題，並將其改為動態生成。AI 現在可以透過 `<<OPTIONS>>` 區塊輸出建議的行動選項，前端會解析並更新快捷選項按鈕。
同時實作了 `handleRegenerate` 函數，修復了 AI 回覆訊息旁的「重新生成」按鈕，點擊後會刪除該 AI 訊息及之後的所有訊息，並重新發送最後一次的玩家訊息。
修復了 AI 輸出 `</OPTIONS>>` 或忘記閉合標籤導致解析失敗的問題，並過濾掉選項前面的數字編號。

### 日記系統升級（水晶球日記 + 融合日記）

UI 重構： 日記 Modal 頂部由單一「新增日記條目」按鈕，改為三個並排 icon 按鈕：📝 新增日記 / 🔮 水晶球日記 / 💫 融合日記，各附小字說明。

DiaryEntry 新增欄位： `source`（`'manual' | 'ai_generated' | 'merged'`）、`mergedFrom?: number[]`（融合來源 id 陣列）、`isMerged?: boolean`（已被融合，退休標記）。

🔮 水晶球日記： 點擊後送獨立 API 請求（`gemini-2.0-flash`），掃最近 20 則對話，使用第二種 prompt 格式（含關鍵事件節點、詳細內容、故事路線等章節）生成日記。生成中顯示 loading，完成後 Toast 通知「🔮 水晶球日記已生成」，isActive 預設 false，玩家可自行勾選是否給 AI 讀。

💫 融合日記： 點擊進入融合模式，日記列表每條出現第二個勾選框（左下方，與 isActive 勾選框上下分離）。勾選 2 條以上後確認按鈕亮起。確認後送 API 將多條合併壓縮，新日記標題自動加 💫，isActive 預設 false。原始條目標記 `isMerged=true`，列表中淡化顯示並標記「已融合」。融合日記可點擊展開顯示來源條目（灰字）。底部有「取消」按鈕退出融合模式。
