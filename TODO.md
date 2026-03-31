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
- [ ] P3｜內容安全與邊界控制
  - 內容等級（PG-13 / 成人向）與禁忌主題開關。

- [ ] 向量語意搜尋記憶
  - 進階記憶檢索，以語意相似度取代關鍵字判斷是否注入。

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
- **完成狀態**：✅ 全 4 phases 完成，性能改進 ↓90% 訊息更新、↓95% 搜尋延遲、↓80% 記憶 DOM

- [x] P3｜玩家狀態異常（Profile.status 欄位閒置中）+ DSL COMMANDS v1 Key=Value 格式
  2026-03-31 [Claude Sonnet 4.6]: 新增 StatusEffect 型別（types.ts）、STATUS_ADD/REMOVE/CLEAR 指令（commandParser/commandReducer）、commandParser 全面改為 v1 Key=Value 格式、ProfileModal 狀態異常面板、promptBuilder 注入狀態 context 與新格式說明、useGameStore statusEffects state、App.tsx 串接（store 解構、buildPrompt deps、ProfileModal prop、桌面 HUD 標籤、useCommandParser deps）


---

- [x] 對話摘要壓縮
  - `App.tsx` `updateAdventureState` 以 `summaryPool` 累積摘要，達 10 則自動壓縮，壓縮 3 次觸發日記生成。     
---

- [x] D5｜存檔匯入/匯出 schema 正規化
  2026-03-27 [Claude Sonnet 4.5]: 新增 `CURRENT_SCHEMA=2`、`runMigrations`、`saveDataMapper`，修改 `useGameStore.ts`。

- [x] D6｜儲存層升級（localStorage → IndexedDB）
  2026-03-27 [Claude Sonnet 4.5]: 新增 `src/db/gameDB.ts`，useGameStore 非同步初始化，App.tsx 加 loading 畫面保護。

- [x] D7｜網路韌性
  2026-03-27 [Claude Sonnet 4.5]: 新增 `src/hooks/useAIRequest.ts`，timeout/retry/abort，中止按鈕，visibilitychange 處理。

---

## 群組 E｜長期功能

- [x] P1｜行動端（Mobile Web）基本可用
  2026-03-28 [Claude Code]: isMobile state、Mobile Nav Bar、HUD 橫條、左右 Drawer、safe-area、visualViewport 鍵盤處理

- [x] P2｜Supabase 強制登入 + 雲端存檔主線
  2026-03-30 [Claude Code]: 新增 useAuth.ts、supabase.ts，強制 Google 登入，存檔主線改為 Supabase

- [x] App.tsx 高價值拆分重構
  2026-03-30 [Claude Code]: 新增 markdownParser.tsx、promptBuilder.ts、SaveSlotsModal.tsx，App.tsx 從 ~3463 行降至 ~2959 行
      
