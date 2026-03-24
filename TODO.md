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

## 群組 D｜架構重構
> 有明確依賴順序，必須按序執行，勿跳著做。

- [ ] D1｜App.tsx 狀態切片與渲染隔離
  - `App.tsx` 拆為容器 + memoized 子區塊（聊天區、狀態列、快捷操作、側欄）。
  - 分離高頻狀態（輸入框、loading、toast）與低頻狀態（世界設定、長清單）。
  - 決議：先完成拆分，再做虛擬化，避免雙向重工。

- [ ] D2｜Command Parser 分層
  - 拆成三層：`parse`（文字→結構化指令）、`reduce`（純函式計算 state patch）、`effects`（toast、modal 等 UI side effects）。
  - 依賴 D1 完成後進行。

- [ ] D3｜時間推進與任務期限判定（純函式化）
  - `TIME:+...` 計算與逾期判斷集中為純函式 `advanceTimeAndResolveQuestDeadlines`。
  - `totalDays` 由純函式計算並回傳，`buildPrompt` 只讀取結果。
  - 依賴 D2 完成後進行。

- [ ] D4｜清單虛擬化與訊息快取
  - 訊息區、Lorebook、NPC 列表導入 virtualized list。
  - 觸發條件：scroll long task > 50ms（量測後確認）；訊息數、DOM 節點數作為輔助觀察值。
  - 第一步：`slice(-N)` 顯示層截斷（只影響 UI render，state 保持完整，AI context 由 `buildPrompt` 的 `SLIDING_WINDOW` 管理）。
  - 依賴 D1 完成後進行。

- [ ] D5｜存檔匯入/匯出 schema 正規化
  - `loadFromData` 完整映射所有欄位，獨立 `saveDataMapper` / `saveDataMigration`。
  - 新增 `schemaVersion`，migration 依版本號觸發，欄位存在與否作為輔助判斷。

- [ ] D6｜儲存層升級（localStorage → IndexedDB）
  - 存檔改為 IndexedDB，建立版本化 migration。
  - `localStorage` 僅保留最後遊玩快照索引與必要 metadata。
  - 依賴 D5 完成後進行。

- [ ] D7｜網路韌性
  - AI 請求加入 timeout / retry / abort。
  - 顯示「請求中 / 已中斷 / 可重試」狀態。
  - 手機切背景返回後自動檢查是否需恢復未完成回合。

---

## 群組 E｜長期功能
> 不阻塞主線開發，可隨時插入。

- [ ] P1｜行動端（Mobile Web）基本可用

  目標：手機瀏覽器可正常開啟、操作、存檔，不做 App／PWA。
  桌面與手機共用同一套組件，響應式切換布局。

  **主畫面**
  - 對話區全寬顯示
  - 左上角 icon → 點擊開左側抽屜（角色狀態、道具、任務）
  - 右上角 icon → 點擊開右側抽屜（記憶、關注 NPC）
  - 抽屜寬度約 80% 螢幕寬，開啟時背景變暗（`rgba(0,0,0,0.5)` overlay，點擊遮罩關閉）
  - 抽屜內容與桌面版相同，不重新分配

  **地圖頁**
  - 上半：地圖視覺
  - 下半：地點資訊欄

  **設定集（Lorebook）**
  - 桌面＋手機統一改為 Grid 卡片式，不維護兩套 UI
  - 人物：響應式 grid（桌面 2 欄，手機視寬度而定），縮略卡顯示姓名、種族性別、好感度、職業、關係
  - 地點：顯示地名＋一句簡介
  - 點擊卡片 → 開啟詳細 Modal
  - 其他分類（怪物、物品、歷史）各自對應欄位，待後續細化

  **字體**
  - `:root { font-size: 16px }` 作為基準，加入 `@media (max-width: 640px)` 縮小至 `14px`
  - App.tsx 中 2 處 `text-[9px]`（第 2190、2248 行）改為 `text-[0.5625rem]`
  - 正文、標題改用 `rem`；行高、字距用 `em`；邊框、圓角、icon 保留 `px`

  **前端視覺**
  - HP/MP 動態條動畫（數字跳動、條縮短）

  **其他**
  - 確保 safe-area（iPhone 底部 home bar）不遮擋輸入區（`env(safe-area-inset-bottom)`）
  - 輸入框獲得焦點時不被鍵盤遮住（`visualViewport` 或 `env(keyboard-inset-height)`）


- [ ] P1｜任務鏈與後果分歧
  - 任務加入部分完成、被他人捷足先登等中間態，增加世界演化感。
  - 尚未進一步細化。

- [ ] P3｜指令 DSL 版本化
  - 例如 `COMMANDS v2`，維護向下相容 parser。

- [ ] P3｜事件溯源（Event Sourcing）輕量化
  - 儲存事件而非只儲存最終 state（如 `QuestAccepted`、`GoldSpent`）。

- [ ] P3｜內容安全與邊界控制
  - 內容等級（PG-13 / 成人向）與禁忌主題開關。

- [ ] 向量語意搜尋記憶
  - 進階記憶檢索，以語意相似度取代關鍵字判斷是否注入。

- [ ] Firebase 雲端儲存
  - 取代 localStorage，支援跨裝置同步。（目前已決定暫緩）

- [ ] 多配色主題
  - 用 `data-theme` + CSS variables 切換主題。
  - 設定 Modal 加色塊選擇器，儲存至 `localStorage`。

---

## ✅ 已完成

- [x] 天空漸層背景（日夜循環）
  - `App.tsx` `getSkyGradient` 函數已實作，依時段與天氣輸出漸層，掛載於全版背景層。

- [x] Scrollbar 樣式統一
  - `index.css` 已實作 `scrollbar-width: thin` 與 `::-webkit-scrollbar` 自訂樣式。

- [x] 對話摘要壓縮
  - `App.tsx` `updateAdventureState` 以 `summaryPool` 累積摘要，達 10 則自動壓縮，壓縮 3 次觸發日記生成。
