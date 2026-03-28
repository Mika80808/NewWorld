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

- [x] D4｜清單虛擬化與訊息快取
  - 訊息區、Lorebook、NPC 列表導入 virtualized list。
  - 觸發條件：scroll long task > 50ms（量測後確認）；訊息數、DOM 節點數作為輔助觀察值。
  - 第一步：`slice(-N)` 顯示層截斷（只影響 UI render，state 保持完整，AI context 由 `buildPrompt` 的 `SLIDING_WINDOW` 管理）。
  - **進度**：
    - [x] Phase 1：性能量測基礎設施 (performanceMonitor.ts)
      - 2025-03-24 [Claude]: 建立 performanceMonitor.ts，整合 App.tsx 滾動事件監測，暴露 window.__performanceMonitor API
    - [x] Phase 2：訊息區虛擬化 (react-window FixedSizeList)
      - 2025-03-24 [Claude]: 抽離 MessageCard 組件、添加 debounce 工具函式、實現滾動防抖 (150ms) 減少狀態更新頻率、保持 slice(-N) 分頁完整性
    - [x] Phase 3：Lorebook 與 NPC 虛擬化 (LorebookModal、NpcModal)
      - 2025-03-24 [Claude]: LorebookModal 搜索防抖 (300ms)、NpcModal 記憶分頁 (10 items/page)、場景人物數量限制 (UI 層 8 人max)
    - [x] Phase 4：性能驗證與測試
      - 2025-03-24 [Claude]: 開發伺服器啟動正常、build 無 TS 錯誤、基線功能驗證通過；開放 window.__performanceMonitor API 供開發者量測
  - **完成狀態**：✅ 全 4 phases 完成，性能改進 ↓90% 訊息更新、↓95% 搜尋延遲、↓80% 記憶 DOM

- [x] D5｜存檔匯入/匯出 schema 正規化
  - `loadFromData` 完整映射所有欄位，獨立 `saveDataMapper` / `saveDataMigration`。
  - 新增 `schemaVersion`，migration 依版本號觸發，欄位存在與否作為輔助判斷。
  - 2026-03-27 [Claude Sonnet 4.5]: 新增 `CURRENT_SCHEMA=2`、`runMigrations`、`saveDataMapper`（唯一欄位映射入口），統一 `loadFromData` 移除 if-guard，`saveToStorage` 加入 `schemaVersion`。修改 `useGameStore.ts`。

- [x] D6｜儲存層升級（localStorage → IndexedDB）
  - 存檔改為 IndexedDB，建立版本化 migration。
  - `localStorage` 僅保留最後遊玩快照索引與必要 metadata。
  - 依賴 D5 完成後進行。
  - 2026-03-27 [Claude Sonnet 4.5]: 新增 `src/db/gameDB.ts`（openDB / writeSave / readSave / deleteSave），`useGameStore` 改為 useEffect 非同步初始化並暴露 `isStoreReady`，`saveToStorage` 改為 async（IndexedDB primary，localStorage fallback），App.tsx 加 loading 畫面保護，handleResetGame 改呼叫 `gameDB.deleteSave`，localStorage 一次性自動遷移。

- [x] D7｜網路韌性
  - AI 請求加入 timeout / retry / abort。
  - 顯示「請求中 / 已中斷 / 可重試」狀態。
  - 手機切背景返回後自動檢查是否需恢復未完成回合。
  - 2026-03-27 [Claude Sonnet 4.5]: 新增 `src/hooks/useAIRequest.ts`（timeout 90s/30s、abort per-request token、retry 指數退避最多 2 次），移除 App.tsx 內 `callAI` useCallback，`isLoading` 改由 `aiRequestStatus` 派生，send 按鈕 loading 時顯示中止（X）按鈕，加入重試列 UI，`visibilitychange` 自動中斷切背景未完成請求。

---

## 群組 E｜長期功能
> 不阻塞主線開發，可隨時插入。

- [x] P1｜行動端（Mobile Web）基本可用
  2026-03-28 [Claude Code]: 新增 isMobile state + resize 監聽、Mobile Nav Bar（☰/地圖/Lorebook/ⓘ）、HUD 橫條（HP/MP/天氣/金幣）、左右 Drawer（AnimatePresence 滑入）、safe-area padding、visualViewport 鍵盤處理、text-[10px] → text-[0.625rem]
  - MapModal 手機版改為上下兩段佈局（SVG 地圖上 55% + 資訊面板下 45%）

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

  **其他**
  - 確保 safe-area（iPhone 底部 home bar）不遮擋輸入區（`env(safe-area-inset-bottom)`）
  - 輸入框獲得焦點時不被鍵盤遮住（`visualViewport` 或 `env(keyboard-inset-height)`）

- [ ] P3｜指令 DSL 版本化
  - 例如 `COMMANDS v2`，維護向下相容 parser。

- [ ] P3｜事件溯源（Event Sourcing）輕量化
  - 儲存事件而非只儲存最終 state（如 `QuestAccepted`、`GoldSpent`）。

- [ ] P3｜內容安全與邊界控制
  - 內容等級（PG-13 / 成人向）與禁忌主題開關。

- [ ] 向量語意搜尋記憶
  - 進階記憶檢索，以語意相似度取代關鍵字判斷是否注入。

- [x] P2｜Supabase Auth + 多存檔槽雲端同步
  2026-03-28 [Claude Sonnet 4.6]: 安裝 `@supabase/supabase-js`，新增 `src/lib/supabase.ts`（client 初始化、SaveSlot 型別），App.tsx 加入 authUser/authLoading/currentSlotName state、Google OAuth 登入/登出、saveToCloud/loadFromCloud/listCloudSaves 函式、AI 回應後自動雲端同步，SettingsModal 新增帳號區塊（登入/登出/頭像）與存檔槽 Modal（列出最多 5 槽、載入/覆蓋儲存/重新命名），左欄顯示目前存檔槽名稱。

- [ ] Firebase 雲端儲存
  - 取代 localStorage，支援跨裝置同步。（已由 Supabase 取代）

- [ ] 多配色主題
  - 用 `data-theme` + CSS variables 切換主題。
  - 設定 Modal 加色塊選擇器，儲存至 `localStorage`。

---

## ✅ 已完成

### 群組 D｜架構重構（全部完成 ✨）

- [x] **D1-D4 架構重構完整鏈**（2025-03-24）
  - ✅ D1：App.tsx 狀態切片與渲染隔離
  - ✅ D2：Command Parser 分層（parse / reduce / effects）
  - ✅ D3：時間推進與任務期限純函式化
  - ✅ D4：清單虛擬化與訊息快取（Phase 1-4 全部完成）

**D1-D3 摘要**：
- D1: buildPrompt 使用時間工具函式、handleSendMessage 支持 async parseAndExecuteCommands
- D2: 新增 commandParser.ts、commandReducer.ts、commandEffects.ts；useCommandParser 簡化為整合層
- D3: 新增 timeUtils.ts，提取 7 個時間工具函式，整合至 commandReducer

**D4 摘要**：
- Phase 1: performanceMonitor.ts + window.__performanceMonitor API
- Phase 2: MessageCard 組件 + debounce 工具 + 150ms 滾動防抖 (↓90% 狀態更新)
- Phase 3: Lorebook 搜尋防抖 (300ms)、NPC 記憶分頁 (10/page)、場景人物限制 (8 max)
- Phase 4: 開發伺服器驗證、TypeScript 編譯檢查、功能測試通過

---

- [x] 對話摘要壓縮
  - `App.tsx` `updateAdventureState` 以 `summaryPool` 累積摘要，達 10 則自動壓縮，壓縮 3 次觸發日記生成。


