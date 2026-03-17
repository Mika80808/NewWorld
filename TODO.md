# TODO.md — 待開發任務

> AI 開始工作前請先讀這個檔案，確認當前優先任務。
>
> 完成任務後的規則：
> 1. 將 `[ ]` 改為 `[x]`
> 2. 在項目下方補一行完成註記，格式：
>    `YYYY-MM-DD [AI名稱]: 簡述改了什麼函數/檔案/區塊`
> 3. 同步更新 CHANGELOG.md 對應版本區塊
> 4. 當 [x] 項目累積過多時，由 User 定期清空
>
> 架構規則（重構完成後生效）：
> - `App.tsx`：只保留 state、handlers、`buildPrompt`、`parseAndExecuteCommands`、API 呼叫、主介面三欄 JSX
> - `src/components/`：純 UI 組件，只接收 props 和 callback，不持有業務 state
> - AI 改功能前必須先讀取對應組件檔案

---
## 已知BUG (需先修復)

🥇 第一階段：核心體驗與資料安全 (最優先)

- [x] 修復 AI 回覆輸出完畢後消失，只剩下「```」的問題 
  2026-03-17 [Gemini]: 修復 `useCommandParser` 中 `commandBlockRegex` 吞噬整個字串的問題。將 `COMMANDS` 區塊的處理順序移至 `OPTIONS` 之前，並在正則表達式中加入 `(?=\n\n)` 與 `(?=<<OPTIONS>>)` 作為防呆機制，避免 AI 忘記輸出結尾標籤時把後續敘事內容刪除。

- [x] 修復自動存檔功能 (清單第 2 點)
  2026-03-17 [Gemini]: 將 AI 回覆角色從 `system` 改為 `assistant` 以觸發 `useEffect`；將 `adventureLog` 與 `currentGoals` 移入 `useGameStore` 確保被納入存檔；優化 `useEffect` 依賴與觸發條件。

- [x] 修復玩家對話框的[刪除]與[編輯]功能失效問題
  2026-03-17 [Gemini]: 在 `App.tsx` 中，當玩家刪除或編輯訊息時，除了更新 React state 外，同步呼叫 `saveToStorage({ messages: newMessages })`，確保變更立即寫入 localStorage，避免重新整理後恢復原狀。同時在發送新訊息時也立即存檔。

🥈 第二階段：UI 佈局與空間優化

- [x] 3. 道具與消耗品欄位改版
  2026-03-17 [Gemini]: 於 `App.tsx` 將道具與消耗品區塊從手風琴折疊改為向右展開的絕對定位懸浮面板 (Popover)，並加入關閉按鈕與毛玻璃特效。

實作想法：如您所建議，當道具變多時，原本的列表會撐爆版面。我們可以將這兩個區塊改成 「點擊後向右展開的懸浮面板 (Popover / Drawer)」。左側只保留一個帶有數量標示的按鈕（例如：🎒 道具 (5)），點擊後才在旁邊彈出詳細清單。
效益：徹底解決物品過多導致的排版崩壞問題。

🥉 第三階段：進階邏輯與系統功能

4. 右欄位 [當前場景人物] 的動態更新 (清單第 3 點)
實作想法：這需要前後端配合。我們需要檢查 AI 的 System Prompt，確保有強制要求 AI 在每次回覆時，都要在 JSON 中輸出 currentCharacters 陣列。接著檢查前端在接收到 AI 回覆時，是否有正確將這個陣列更新到 React State 中。
優先度：中。這牽涉到 AI 的行為穩定度，可能需要反覆測試 Prompt。


## 🧭 架構討論


- [x] P1｜刪除功能: GitHub PAT (Gist 權限)
  2026-03-17 [Gemini]: 於 `SettingsModal.tsx` 移除 GitHub PAT 相關的 UI、狀態與匯出邏輯。

- [x] P1｜左側 UI 瘦身：簡化四大功能按鈕
  2026-03-17 [Gemini]: 於 `App.tsx` 將 [個人資訊]、[設定集]、[Prompt]、[設定] 改為 2x2 網格，並移除底部舊的設定按鈕。

- [x] P1｜點擊匯出檔案時，讓玩家選擇存檔路徑
  2026-03-17 [Gemini]: 於 `App.tsx` 實作 `window.showSaveFilePicker`，並加入 fallback 機制退回傳統 `<a>` 下載模式。

- [ ] P1｜任務鏈與後果分歧
  討論主題：任務加入部分完成、被他人捷足先登等中間態。
  討論過程：原文件定位為增加世界演化感的方式，尚未進一步細化。

- [ ] P1｜行動端（Mobile Web）基本可用
  討論主題：手機瀏覽器可正常開啟、可操作、可存檔，不做 App/PWA。
  討論過程：明確定位為 Mobile Web，避免先期投入 App/PWA 成本；優先確保 safe-area、輸入區、基本訊息載入策略可用。

- [ ] P2｜時間推進與任務期限判定（純函式化）
  討論主題：`TIME:+...` 計算與逾期判斷集中為純函式（如 `advanceTimeAndResolveQuestDeadlines`）。
  討論過程：針對 `totalDays` 重複計算的疑問，決議「要統一，`totalDays` 應由純函式計算並回傳，UI（`buildPrompt`）只讀取結果，避免不一致」。

- [ ] P2｜存檔匯入/匯出 schema 正規化
  討論主題：`loadFromData` 完整映射欄位（含 `appearingNpcs`）並提供 migrate 流程，獨立 `saveDataMapper` / `saveDataMigration`。
  討論過程：針對 migration 觸發條件的疑問，決議「新增 `schemaVersion`，migration 依版本號觸發，欄位存在與否只作為輔助判斷」。

- [ ] P2｜Command Parser 分層
  討論主題：拆成 `parse` / `reduce` / `effects` 三層。
  討論過程：原文件定位為提升可測試性與責任清楚的核心架構整理，尚未進一步細化。

- [ ] P2｜App.tsx 狀態切片與渲染隔離
  討論主題：`App.tsx` 拆為容器 + memoized 子區塊，分離高頻/低頻狀態。
  討論過程：針對「先拆分或並行虛擬化」的疑問，決議「先完成拆分與狀態切片，再導入虛擬化，避免雙向重工」。

- [ ] P2｜儲存層升級
  討論主題：localStorage → IndexedDB，建立版本化 migration。

- [ ] P2｜網路韌性
  討論主題：AI 請求加入 timeout/retry/abort，顯示請求狀態，背景恢復。

- [ ] P3｜指令 DSL 版本化
  討論主題：例如 `COMMANDS v2`，維護向下相容 parser。

- [ ] P3｜事件溯源（Event Sourcing）輕量化
  討論主題：儲存事件而非只儲存最終 state。

- [ ] P3｜內容安全與邊界控制
  討論主題：內容等級與禁忌主題開關。

---

## 🔴 高優先

- [ ] 道具 effect 前端處理

  功能意義：消耗品使用後由前端直接套用數值變化，不需要 AI 介入計算，減少 token 消耗並確保數值即時更新。

  資料結構異動（`consumables` 陣列每個項目）新增欄位：
  - `effect?: { hp?: number, mp?: number, gold?: number, status?: string }`
  - 數值正數為增加，負數為扣除
  - `status` 為狀態異常字串，例如 `'poisoned'`、`'blessed'`（目前前端顯示用，暫不做複雜邏輯）
  - effect 由 AI 透過 `ITEM_ADD` 指令建立消耗品時一併寫入，玩家不能修改

  抽出共用函數 `applyItemEffect(itemName: string)`（兩種觸發方式共用）：
  - 在 `consumables` 中找到對應道具
  - 套用 effect：`hp` 加入 `profile.hp`、`mp` 加入 `profile.mp`、`gold` 加入 `profile.gold`、`status` 寫入 `profile.status`
  - 數量 -1，歸零時從 `consumables` 移除
  - Toast：「🧪 使用 XX：HP +30」（依實際 effect 內容動態產生）

  觸發方式一：道具欄點擊「使用」按鈕：
  - 前端呼叫 `applyItemEffect(itemName)`
  - 同時送出訊息給 AI：「（玩家使用了 XX，效果已套用）」，讓 AI 接續描述場景反應

  觸發方式二：AI 輸出 ITEM_USE 指令：
  - 格式：`ITEM_USE:道具名`
  - 於 `parseAndExecuteCommands` 解析，呼叫 `applyItemEffect(itemName)`
  - 沉浸式玩家在對話中描述使用道具時，AI 自行判斷並輸出此指令

  buildPrompt COMMAND FORMAT 說明補充：
  - `ITEM_USE`：當玩家在對話中明確表示使用某消耗品時輸出，使用與道具欄完全相同的道具名稱

- [ ] Prompt 記憶寫入規則(再次確認)
  在 `buildPrompt` 的 COMMAND FORMAT 說明裡，加入「AI 何時應輸出 MEMORY_ADD」的規則。
  包含五種情境：世界事件 / 區域事件 / 場景狀態改變 / NPC 情報 / 玩家重要事件。
  特別規則：AI 回應裡出現 `[ ]` 布告欄內容時，必定觸發 `MEMORY_ADD:region`。


---

## 🟡 中優先

- [ ] 多配色主題
  用 `data-theme` + CSS variables 切換主題。設定 Modal 加色塊選擇器，儲存至 localStorage。


  預期效果：App.tsx 瘦身約 150–200 行，靜態世界觀資料與邏輯分離。

- [ ] 更多前端處理項目
  - 時間系統視覺化（日夜循環 icon / 天空漸層背景）
  - HP/MP 動態條動畫（數字跳動、條縮短）

---

## 🟢 之後（低優先）

- [ ] 對話摘要壓縮
  超過 N 輪後，舊對話壓縮成摘要節省 token。
  建議：保留最近 20 則原文，更早的壓縮成 200 字摘要。

- [ ] Firebase 雲端儲存
  取代 localStorage，支援跨裝置同步。（目前已決定暫緩）

- [ ] 向量語意搜尋記憶
  進階記憶檢索，不依賴關鍵字，改用語意相似度判斷是否注入。

- [ ] Scrollbar 樣式統一
  用 `::-webkit-scrollbar` CSS 自訂滾動條樣式，配合現有石板/棕色系 UI。


---

## ✅ 已完成

- [x] Bug 修正與地圖視覺優化
  2026-03-16 GPT-5.2-Codex: 修正 `TIME` 指令同回合累加覆蓋、匯入存檔遺漏 `appearingNpcs` 還原、馬車費扣款可能出現負金幣；地圖新增當前位置脈衝/徽章、節點標籤防重疊偏移、路線層連線與目前路徑高亮。

- [x] 介面與提示詞優化
  2026-03-12 Gemini: 增加編輯訊息的文字框高度、限制快捷選項在 10 字以內、對話視窗底部毛玻璃效果改為往上淡出、修改初始訊息（ID 1）開場白。

- [x] 個人資訊與數值系統調整
  2026-03-12 Gemini: 個人資訊的職業預設為「異鄉人」，補充各欄位提示文字，預設 MP、金錢為 0，並移除 HP / MP 的上限設定（`maxHp` / `maxMp`）。

- [x] 快捷選項與重新生成功能修復
  2026-03-12 Gemini: 修復快捷選項點擊無效的問題，並將其改為動態生成（AI 透過 `<<OPTIONS>>` 輸出）。實作 `handleRegenerate` 函數以支援 AI 回覆的重新生成功能。修復 AI 輸出 `</OPTIONS>>` 或忘記閉合標籤導致解析失敗的問題，並過濾掉選項前面的數字編號。

- [x] 日記系統升級（水晶球日記 + 融合日記）
  2026-03-12 Claude: 新增 `handleGenerateDiary()` / `handleMergeDiary()`，新增 state `isDiaryMergeMode` / `diaryMergeSelection` / `isDiaryGenerating` / `expandedMergedIds`。日記 Modal 按鈕區重構為三個 icon 按鈕。DiaryEntry 新增 `source` / `mergedFrom` / `isMerged` 欄位。

- [x] 前端 COMMANDS 解析器
  2026-03-12 Claude: 實作於 `parseAndExecuteCommands()`，支援 HP/MP/金幣/好感度/位置/時間/道具。串流結束後執行，Toast 間隔 600ms。

- [x] 日記關鍵字觸發系統
  2026-03-12 Claude: 新增 `keywords[]` 欄位，`scanKeywords()` 函數掃最近 5 則。UI 在日記 Modal 編輯區塊底部。

- [x] 統一記憶資料結構（world/region/scene/npc 四層）
  2026-03-12 Claude: 移除 `worldMemory` / `factionMemory` / `locationMemory`，改為 `memories[]`。新增 `isMemoryTriggered()` / `tickMemoryCounters()`。舊存檔自動 migrate。

- [x] MEMORY_ADD 指令升級
  2026-03-12 Claude: 支援完整 tags（locations/npcs/factions/keywords）+ sticky + expires。解析邏輯在 `parseAndExecuteCommands()` 的 memAddMatch 區塊。

- [x] Lorebook secondaryKeys + AND 邏輯 + insertionOrder
  2026-03-12 Claude: 新增 `lorebookHitsKeywords()` 函數，`selective` 欄位控制 AND/OR。UI 在 Lorebook Modal 編輯區塊底部，檢視模式顯示標籤。

- [x] 右側面板四層記憶顯示
  2026-03-12 Claude: 依 type 分組顯示 🌍/🗺️/🏠/👤，只顯示當前地點相關記憶。

- [x] 系統設定 Gemini API Key 輸入欄
  2026-03-12 Claude: 加在系統設定 Modal 頂部，password 類型，儲存至 `localStorage('gemini_api_key')`。API 呼叫優先使用此 Key。

- [x] 快速存檔後的紀錄顯示（bug）
  2026-03-13 Claude: 新增 `lastSavedAt` state，`handleQuickSave` 存檔後呼叫 `setLastSavedAt(new Date())`，存檔按鈕下方顯示「上次存檔 HH:MM:SS」。

- [x] 對話框 Markdown 渲染
  2026-03-13 Claude: 新增 `renderInline()` + `renderMarkdown()` 於 component 外部。支援 `` `code` ``（玫紅）、`bold`、`*italic*`（石板灰）、`>` 引用區塊（連續行合併）、`---` 分隔線。`msg.role !== 'user'` 時呼叫，玩家訊息維持 `whitespace-pre-wrap`。引用區塊樣式：`border-l-2 border-stone-500 bg-stone-800/30`。

- [x] Scrollbar 樣式統一
  2026-03-13 Gemini: 在 `src/index.css` 新增全域捲軸樣式，配合深色系 UI。

- [x] 世界地圖視覺化
  2026-03-13 Claude: 重寫 `MapModal.tsx`，改用 SVG 節點地圖；依 type 分色（town/danger/city/poi）；可滑鼠拖曳 pan；hover tooltip；地形裝飾線；節點連線；圖例；搜尋欄；undiscovered 霧化效果。

- [x] 旅途中發現地點融入故事
  2026-03-13 Claude: 在 `parseAndExecuteCommands` 新增 `LOCATION_DISCOVER` 解析；模糊比對已知地點設 discovered=true；未知地點加入 dynamic 陣列標記「待探索」；Toast 通知；Prompt 說明 AI 何時應輸出。

- [x] NPC「角色想法」功能
  2026-03-13 Gemini: 實作 NPC 角色想法功能，包含資料結構更新、UI 呈現、`NPC_THOUGHT` 指令解析、自動更新上次見面時間地點，以及 Prompt 注入。
  2026-03-13 Claude: 依新規格更新：`relationship` 改為 AI 生成，新增 `NPC_RELATIONSHIP` 指令解析與 Prompt 說明；NpcModal 標題列改為三行（第二行合併關係 ｜ 好感度）。

- [x] App.tsx 組件拆分重構
  2026-03-13 Claude: 確認所有 8 個 Modal 已獨立於 `src/components/`，App.tsx 只保留 import + `<ComponentName props />` 使用方式，無內嵌 Modal JSX。

- [x] Prompt 記憶寫入規則
  2026-03-13 Gemini: 在 `buildPrompt` 的 COMMAND FORMAT 區塊新增【AI 何時應輸出 MEMORY_ADD】說明，定義五大情境與布告欄觸發規則。

- [x] 任務系統動態化（初版）
  2026-03-13 Gemini: 新增 `quests` state，在 `parseAndExecuteCommands` 實作 `QUEST_ADD` 與 `QUEST_COMPLETE` 解析，並傳遞至 `QuestModal` 顯示進行中、可接取、已完成任務。

- [x] NPC 出沒系統 + 兩階段注入
  2026-03-13 Claude: LorebookModal.tsx 介面、App.tsx（state/parseAndExecuteCommands/buildPrompt/stream 後處理）。LorebookEntry 新增 `homeLocation`、`roamLocations`（滑動窗口最近 3 個）。COMMANDS 新增 `NPC_NEW`、`NPC_HOME`、`NPC_LOCATION`。Phase 1 注入候選名單（輕量，最多 5 個）；Phase 2 偵測 `[出場:姓名]` 後注入完整資料。

- [x] 重構 App.tsx 狀態管理
  功能意義：目前 `App.tsx` 仍持有大量與 `useGameStore` 重複的冗餘 state，且初始化邏輯不一致。
  任務內容：
  - 將 `App.tsx` 的所有遊戲狀態完全遷移至 `useGameStore`。
  - 統一 `localStorage` 鍵名，確保存檔讀取路徑唯一。
  - 確保 `App.tsx` 只作為 UI 容器，邏輯由 Hooks 驅動。
  2026-03-14 [Claude]: 建立 `src/hooks/useGameStore.ts`（所有遊戲 state + saveToStorage/loadFromData）、`src/hooks/useCommandParser.ts`（parseAndExecuteCommands/applyItemEffect/scanKeywords/isMemoryTriggered/tickMemoryCounters）。App.tsx 移除約 509 行冗餘程式碼，改為 UI 容器。修正 `src/types.ts`（DiaryEntry 欄位修正、新增 MemoryEntry/InventoryItem/ConsumableItem）。重建被刪除的 `src/main.tsx` 與 `src/index.css`。TypeScript 零錯誤，伺服器正常啟動。

    - [x] 任務系統規格升級
  2026-03-14 [Claude]: 新增 `isGoalMet` 欄位至 `Quest` 型別；`useCommandParser` 新增 `QUEST_GOAL_MET` 指令解析；`useGameStore` 舊存檔自動 migrate；`buildPrompt` 依 `isGoalMet` 狀態輸出不同格式；`QuestModal` 擴充為四狀態頭部（進行中/待回報/已完成/失敗）+ 勾選框 + 琥珀色待回報樣式。TypeScript 零錯誤。

  功能意義：實作「目標達成 → 回報領賞」的兩階段任務流程。AI 判斷目標達成時輸出隱藏指令，玩家回報後才正式結案並發放獎勵。

  資料結構（`quests` state，在現有基礎上新增 `isGoalMet`）：
```typescript
  {
    id: string,
    title: string,
    giver: string,
    description: string,
    reward: { gold?: number, items?: string[] },
    deadline?: number,
    status: 'active' | 'completed' | 'failed',
    isGoalMet: boolean,          // 新增：目標是否已達成（對應勾選框狀態）
    createdAt: string,           // 遊戲內日期 M/D
    createdAtTotalDays: number,  // 計算期限用
    completedAt?: string
  }
```

  COMMANDS 新增 / 修正指令（於 `parseAndExecuteCommands` 解析）：
  - `QUEST_ADD:任務名:委託人:目標描述:獎勵金幣:獎勵道具:期限天數`
    - 建立新任務，`status='active'`，`isGoalMet=false`，自動開啟 QuestModal
    - Toast：「📋 新任務：XX」
  - `QUEST_GOAL_MET:任務名`（新增，放在 COMMANDS 區塊，取代舊的內文標記方式）
    - 將對應任務 `isGoalMet` 設為 `true`
    - 從對話顯示文字中不做任何輸出（純靜默更新）
    - Toast：「🎯 任務目標達成：XX（請向委託人回報）」
  - `QUEST_COMPLETE:任務名`
    - 條件：玩家向委託人回報後，AI 判斷確實完成
    - 將對應任務 `status` 改為 `'completed'`
    - 自動發放獎勵：gold 加入 `profile.gold`，items 加入 `inventory`
    - Toast：「✅ 任務完成：XX，獲得 XX 銅」

  期限自動失敗：
  - 每次 `TIME_ADVANCE` 指令執行後，前端掃描所有 `status='active'` 的任務
  - 計算 `createdAtTotalDays + deadline` 是否小於當前遊戲總天數
  - 超過則自動標記 `status='failed'`
  - Toast：「❌ 任務失敗：XX」

  Prompt 注入（於 `buildPrompt`）：
  - 掃描所有 `status='active'` 的任務，依 `isGoalMet` 狀態輸出不同格式：
```
    [進行中任務]
    尋找失蹤的藥草（委託：烏爾夫，剩 3 天）
    送信給獵人公會（委託：芬里爾，目標已達成，待玩家回報）
```
  - COMMAND FORMAT 說明補充：
    - `QUEST_ADD`：NPC 委託玩家任務、或布告欄出現可接取的任務時輸出
    - `QUEST_GOAL_MET`：AI 判斷玩家已完成任務目標（但玩家尚未回報）時輸出，放在 COMMANDS 區塊
    - `QUEST_COMPLETE`：玩家向委託人回報、AI 確認結案時輸出，必須使用與 QUEST_ADD 完全相同的任務名稱

  QuestModal UI（`src/components/QuestModal.tsx`）：
  - 頂部狀態計數：進行中 / 待回報 / 已完成 / 失敗（四種）
  - 每張任務卡片顯示：任務名、委託人、目標描述（前方勾選框由前端依 `isGoalMet` 控制）、獎勵、接受日期
  - 進行中（`isGoalMet=false`）：綠色邊框，右上角顯示剩餘天數或「無期限」
  - 待回報（`isGoalMet=true`）：琥珀色邊框 + 右上角「待回報」標籤，勾選框變為 `☑`
  - 已完成：灰化＋刪除線＋綠色「✓ 完成」標籤＋完成日期
  - 失敗：灰化＋刪除線＋紅色「✗ 失敗」標籤＋「期限超過」

- [x] 修復 Profile 屬性與類型安全
  - 移除 `useCommandParser` 與 `useGameStore` 中的 `any` 類型，改用 `src/types.ts` 定義。
  2026-03-14 [Claude]: `types.ts` 補齊 DiaryEntry（修正欄位對應實際用法）、MemoryEntry、InventoryItem、ConsumableItem 型別定義。useGameStore/useCommandParser 全面使用具體型別，消除 `any`。

- [x] Prompt 靜態資料提取至 constants.ts
  2026-03-14 [Claude]: 確認已於 v9 完成。`src/constants.ts` 已匯出 MONTHS_DATA、INITIAL_SYSTEM_PROMPT、INITIAL_LOREBOOK_ENTRIES、INITIAL_WORLD_MAP、INITIAL_MESSAGES、TOKEN_OPTIONS；`useGameStore.ts` 與 `App.tsx` 均已正確 import。

  背景：`App.tsx` 中有大量靜態文字以 hardcode 方式嵌入 useState 初始值，導致檔案臃腫。`buildPrompt()` 函數本體與 COMMAND FORMAT 說明不移動（依賴 state），只搬靜態資料。

  移至 `src/constants.ts`：
  - `INITIAL_SYSTEM_PROMPT`：`systemPrompt` useState 初始值三段長文字（worldPremise / roleplayRules / writingStyle），約 60–80 行
  - `INITIAL_LOREBOOK_ENTRIES`：`lorebookEntries` useState 初始值的 14 個地點資料，約 60 行
  - `MONTHS_DATA`：App.tsx 頂部的 12 個月份雅稱陣列，約 15 行

  App.tsx 修改方式：
  ```typescript
  import { INITIAL_SYSTEM_PROMPT, INITIAL_LOREBOOK_ENTRIES, MONTHS_DATA } from './constants'

  const [systemPrompt, setSystemPrompt] = useState(() => _s?.systemPrompt || INITIAL_SYSTEM_PROMPT)
  const [lorebookEntries, setLorebookEntries] = useState(() => _s?.lorebookEntries || INITIAL_LOREBOOK_ENTRIES)
  ```

* [x] 世界地圖重寫（深藍金風格 + 旅行系統）
2026-03-14 ~ 2026-03-15 [Claude]: `types.ts` LorebookEntry 新增 mapX/mapY/cartFare/mapStatus/adjacentTo 等可選欄位；`constants.ts` 初始化地點補上座標與車資；`useCommandParser` 新增 LOCATION_DISCOVER 指令；`MapModal.tsx` 完整視覺與邏輯重寫（深海藍底色+金色手稿風格、八角星芒節點、bezier 曲線、右欄兩段式旅行選擇、羅盤、搜尋欄）；`App.tsx` 移除舊旅行計算，新增 handleTravel 與 showToast。TypeScript 零錯誤。後續修正部分 bug（v14）。
視覺設計語彙（深海藍 × 金色手稿風）：
* 整體底色：`#0a1628`（深海藍）
* 強調色：`#c9a84c`（金色）——節點星芒、標題上邊線、分隔菱形、啟程按鈕
* 次要文字色：`#8ab4e8`（淡藍）——地點描述、區域記憶、已知節點標籤
* 目標節點色：`#cc2200`（深紅）——選中目標地點
* 容器背景：`#0d1f3c`，邊框 `0.5px solid #2a4a7f`，頂邊 `1.5px solid #c9a84c`
* 字體：`Georgia, serif`（全站）
* 紙張紋理：細格線疊加層（`rgba(100,140,200,0.03)`）
* 暗角：`radial-gradient` 邊緣加深至 `rgba(5,12,28,0.7)`
* 四角 L 型裝飾線：金色 `#c9a84c`，`stroke-width: 1.2`（純裝飾）


地點狀態與節點視覺（兩狀態，移除舊有 visited）：
* discovered（預設）：尚未造訪。虛線圓圈，`stroke: #5a8fc9`，`opacity: 0.35`，標籤顯示「???」
* known：造訪後解鎖。八角星芒節點，藍色星芒 `#4a7ac9`，中心亮點 `#8ab4e8`
* 玩家所在地（currentLocation）：金色八角星芒 `#c9a84c`，三層暈光，中心 `#fde68a`
* 選中目標：深紅八角星芒 `#cc4422`，三層暈光，中心 `#ff8866`
* 地圖開啟時，自動以玩家所在節點為視覺中心。玩家抵達某地後，前端自動將該地點狀態改為 known


節點連線邏輯：
* 平時不顯示任何連線
* 點選第一個節點後再點選第二個，出現金色虛線 bezier 曲線（`stroke: #c9a84c`, `stroke-dasharray: 5 3`）
* 取消選取或關閉 Modal 時曲線消失


資料結構異動（lorebookEntries，category='地點'）新增欄位：
* `mapX: number`、`mapY: number`：節點座標，固定，手動設定
* `adjacentTo: string[]`：相鄰地點名稱陣列（保留，供未來旅行時間計算用）
* `cartFare: number`：馬車車費（銅幣），`0` 表示不可搭馬車（例如大斷崖）
* `mapStatus: 'discovered' | 'known'`：解鎖狀態，預設 `'discovered'`


地圖 UI 佈局（src/components/MapModal.tsx）：
* SVG canvas：背景 `#0a1628`，細格線 + 暗角疊加
* 羅盤（左下角）：深藍底 + 金色八角星芒，指北針為金色。點擊可重置地圖視角並觸發「視角已重置」Toast
* 搜尋欄（Header）：深藍底，佔位文字「搜尋地點...」，即時篩選右欄地點列表


右欄資訊面板（點選節點後顯示）：
* 標題列：✦ 【地點名稱】 + 狀態標籤（目標 / 當前位置）
* 菱形分隔線與地點簡述（content 欄位）
* 區域記憶：✦ 區域記憶 標題 + 金色左邊線條列。篩選 memories 中 `type === 'region'` 且 `tags.locations` 包含該地點名稱的項目
* 行動選擇（玩家不在該地點時才顯示）：
* 🚶 徒步前往（藍色邊框）
* 🐴 馬車 XXG（金色邊框，`cartFare > 0` 時才顯示）


* 啟程按鈕：金底深藍字，全寬，固定於底部


旅行邏輯：
* 坐馬車：點擊「啟程」 → 判定 `profile.gold >= cartFare`。足夠則扣除金幣、更新 currentLocation 與 mapStatus、送出訊息「你決定搭馬車前往[地點]。」讓 AI 安排情節；不足則於按鈕下方顯示「阮囊羞澀」，不執行動作。
* 徒步：點擊「啟程」 → 更新 currentLocation 與 mapStatus → 送出訊息「你決定徒步前往[地點]。」讓 AI 安排旅途事件。


COMMANDS 新增指令：
* `LOCATION_DISCOVER:地點名`：將對應地點的 `mapStatus` 改為 `'known'`；若不存在則新增一筆 `mapStatus='discovered'` 的條目
* 觸發 Toast：「🗺️ 發現新地點：XX」
* buildPrompt 補充：當玩家在旅途中路過、聽說或間接發現尚未踏足的地點時輸出此指令


* [x] 全站 UI 色碼微調
  2026-03-16 Gemini: 將所有 Modal 與主介面的欄位解說文字、次要資訊色碼從 `#3a5a8a` 統一修改為 `#8ab4e8`，提升深色主題下的閱讀清晰度。包含：QuestModal、ProfileModal、NpcModal、LorebookModal、SettingsModal、DiaryModal、SystemPromptModal 與 App.tsx。

* [x] 主介面全站深藍金主題
2026-03-16 [Claude]: `src/index.css` 新增深藍金 CSS Variables（--bg0 至 --danger）；App.tsx 及全部組件文件批量替換 stone-*/indigo-*/amber-* Tailwind 類為新色票；字體改為 Georgia, serif；「✦ 關注」標題；記憶卡片左邊線統一金色；Markdown 引用邊線金色；送出按鈕改金底深藍字；五個 Modal 組件同步色票更新。CHANGELOG v15。

- [x] 系統設定與世界觀設定介面優化
  2026-03-16 Gemini: 優化 `SystemPromptModal` 與 `LorebookModal` 介面。`SystemPromptModal` 移除標題圖示、實作輸入框自動高度、合併功能說明至標題行。`LorebookModal` 統一按鈕與輸入框圓角為 `rounded-[8px]`、優化分類按鈕樣式、為前三項設定卡片增加邊框強調。

- [x] 指令執行結果顯示一致化（toastQueue → notifyCommandResult）
  2026-03-17 [Claude]: 
    1. useCommandParser.ts

CommandParserDeps 介面新增 notifyCommandResult: (msgs: string[]) => void，並加上註解說明它與 showToast 的分工
解構時加入 notifyCommandResult
局部變數 toastQueue 改名為 cmdResults，避免與 App.tsx 的 state 同名造成混淆
結尾的 forEach + setTimeout(i * 600) 排隊邏輯整個移除，改為一行 notifyCommandResult(cmdResults)

    2. App.tsx

import 補上 useCallback
新增 toastTimerRef（useRef），統一管理所有 toast timer，避免多個 setTimeout 互相干擾
showToast 改為 useCallback，每次呼叫前先 clearTimeout 舊 timer，確保單則訊息不會被後來的計時器提早清掉
新增 getToastInterval：佇列長度 ≤ 3 用 700ms，4–6 用 500ms，7+ 用 350ms
新增 drainToastQueue：按自適應間隔逐條推進，最後一條顯示 3 秒後清除
新增 notifyCommandResult：單則直接走 showToast，多則走 drainToastQueue
useCommandParser 呼叫處補上 notifyCommandResult


- [x] P2｜清單虛擬化與訊息快取
  2026-03-17 [Codex]訊息區、Lorebook、NPC 導入 virtualized list，對話採 session chunk。先做顯示層截斷（只影響 UI render，state 保持完整），避免影響 AI context。`session chunk` 必須明確區分顯示層截斷與 AI context 管理（後者由 `buildPrompt` 的 `SLIDING_WINDOW` 處理）。觸發條件採可執行基準值：`scroll long task > 50ms`（後續量測可調整）；訊息數與 DOM 節點數僅作為觀察值。三個清單分開決策：訊息區優先，Lorebook/NPC 依量測再決定。


