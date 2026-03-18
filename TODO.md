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

## 群組 A｜Prompt 品質
> 直接影響每次 AI 回應，改動風險低，優先處理。

- [ ] Prompt 效率優化 / COMMAND FORMAT 壓縮
  - COMMAND FORMAT 區塊永遠硬寫在 `buildPrompt` 函數結尾，與玩家可編輯的 `systemPrompt` 完全隔離，玩家看不到也改不了。
  - 壓縮目標：縮短這段硬寫內容的字數，不是移動位置。

- [ ] Prompt 記憶寫入規則（再次確認）
  - 在 `buildPrompt` 的 COMMAND FORMAT 說明裡，加入「AI 何時應輸出 MEMORY_ADD」的規則。
  - 包含五種情境：世界事件 / 區域事件 / 場景狀態改變 / NPC 情報 / 玩家重要事件。
  - 特別規則：AI 回應裡出現 `[ ]` 布告欄內容時，必定觸發 `MEMORY_ADD:region`。

- [ ] 記憶系統分層（注入條件精確化）

  記憶分為四層，每層的注入條件不同：

  **world（世界記憶）**
  - 目前只要 `isActive` 就全部注入，建議加入 `importance` 加權截斷：`critical` 無上限，`normal` 最多 8 條，`flavor` 最多 3 條。
  - 【防呆】同一回合 world 類型寫入數量硬上限 2 條，避免 AI 一次產生大量世界事件。

  **region（區域記憶）**
  - 地點比對改為精確相等，避免「月湖鎮」誤觸發「月湖鎮酒館」。
  - 別名管理集中在 `LorebookEntry` 的地點資料，加入 `aliases` 欄位，記憶本身保持乾淨。
  - 【防呆】透過 `aliases` 處理漏觸發，例如「酒館」對應到「月湖鎮酒館」。

  **scene（場景記憶）**
  - 同樣需要精確地點比對，非字串包含比對。
  - 【防呆】超出上限時優先保留最近建立的紀錄。

  **npc（NPC 記憶）**
  - 目前任何場景都注入所有 NPC 記憶，建議配合出場狀態篩選。
  - 【防呆】未出場 NPC 記憶禁止注入；Pinned 或高好感 NPC 例外保留 1–2 條關鍵記憶。

  整體篩選三道關卡：
  1. 排除過期記憶
  2. 精確地點或關鍵字比對
  3. 依 `importance` 截斷數量

  - 【防呆】記憶過多無法篩選時，降級策略：只注入 `importance=critical`。

- [ ] 模型選擇設計
  - 玩家可分別設定主 GM 和 GM 助理的模型與 token 上限。
  - API Key：GM 助理預設共用主 GM 的 Key，UI 提供「使用同一組 API Key」勾選框（預設勾選），取消後開放獨立輸入。
  - 設定存 `localStorage`，與遊戲存檔分開，不隨存檔匯出匯入。
  - 模型使用下拉選單，避免打錯名稱導致靜默失敗。
  - 【防呆】UI 顯示「最後更新時間」與「當前生效值」，避免玩家誤以為切換後已生效但未保存。

---

## 群組 B｜GM 助理（Sub GM）系統
> 依賴 Prompt 品質穩定後再實作，各子任務有執行順序。

- [ ] 整體架構分工（Sub GM 基礎）

  兩個 AI 角色協同運作：

  - **主 GM（Main GM）**：面向玩家，負責場景敘事、NPC 對話、劇情推進、數值指令輸出。使用較強模型，token 消耗大。
  - **GM 助理（Sub GM）**：後台資料整理，不直接面向玩家。負責整理冒險摘要、更新目標、判斷是否自動生成日記。使用輕量模型節省費用。

  觸發條件：主 GM 回覆達到一定字數，或發生任務新增、地點移動、世界記憶寫入等重要指令時才啟動。
  - 【防呆】加入冷卻與節流：每 3 回合最多觸發一次；若上一回合已觸發且本回合無關鍵事件，跳過。

- [ ] GM 助理輸出格式

  每次執行輸出固定 JSON，三個欄位：
  - `summary`：一句話總結剛發生的事，用於左欄冒險摘要
  - `goals`：短期目標陣列，用於左欄當前目標
  - `diary_worthy`：布林值，判斷本輪是否值得觸發自動日記生成

  三個任務合併成一次 API 呼叫。只有 `diary_worthy: true` 時才再發起水晶球日記呼叫。
  - 【防呆】`diary_worthy` 加冷卻：5 回合內最多 `true` 一次，避免連續觸發成本暴增。

- [ ] 串流顯示策略（延遲顯示）

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

- [ ] 等待串流期間的視覺呈現
  串流進行中顯示金色動畫省略號 `✦ 異世界正在回應···`，讓玩家知道 AI 正在思考，避免誤以為當機。

- [ ] GM 助理自動生成日記
  - GM 助理在符合條件時主動觸發，生成後不彈出提示。
  - 只在左欄「日記與記憶」卡片標題處顯示亮點提示【新日記】，玩家點開即消除。
  - 玩家是否勾選日記完全自主，未勾選不注入。

- [ ] 日記機制確認
  - 日記維持「關鍵字觸發」機制，只有命中關鍵字才注入，需保留。
  - 不讓 GM 助理自動新增關鍵字，保持玩家主控記憶焦點。

---

## 群組 C｜前端數值與 UI
> 各項目互相獨立，可並行或逐一完成。

- [x] 道具 effect 前端處理
  2026-03-18 [Claude Sonnet 4.6]: types.ts ConsumableItem 已有 effect 欄位；useCommandParser applyItemEffect 修正 race condition（parts 移出 setter callback）與負值防呆（Math.max(0,...)）；ITEM_ADD 解析已支援 effect 寫入；ITEM_USE 指令已解析並呼叫 applyItemEffect；App.tsx 道具欄「使用」按鈕已呼叫 applyItemEffect 並送訊息給 AI。

- [ ] 道具資訊分層注入（buildPrompt 優化）
  - 帶有 effect 的消耗品和數量 > 1 的道具完整傳送，其餘只傳名字和數量。
  - 【防呆】道具欄超過上限時，僅保留最近變動的道具完整資訊。

- [ ] 更多前端處理項目
  - 時間系統視覺化（日夜循環 icon / 天空漸層背景）
  - HP/MP 動態條動畫（數字跳動、條縮短）

- [ ] 多配色主題
  - 用 `data-theme` + CSS variables 切換主題。
  - 設定 Modal 加色塊選擇器，儲存至 `localStorage`。

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
  - 手機瀏覽器可正常開啟、操作、存檔，不做 App/PWA。
  - 優先確保 safe-area、輸入區、基本訊息載入策略可用。

- [ ] P1｜任務鏈與後果分歧
  - 任務加入部分完成、被他人捷足先登等中間態，增加世界演化感。
  - 尚未進一步細化。

- [ ] P3｜指令 DSL 版本化
  - 例如 `COMMANDS v2`，維護向下相容 parser。

- [ ] P3｜事件溯源（Event Sourcing）輕量化
  - 儲存事件而非只儲存最終 state（如 `QuestAccepted`、`GoldSpent`）。

- [ ] P3｜內容安全與邊界控制
  - 內容等級（PG-13 / 成人向）與禁忌主題開關。

- [ ] 對話摘要壓縮
  - 超過 N 輪後，舊對話壓縮成摘要節省 token。
  - 建議：保留最近 20 則原文，更早的壓縮成 200 字摘要。

- [ ] 向量語意搜尋記憶
  - 進階記憶檢索，以語意相似度取代關鍵字判斷是否注入。

- [ ] Firebase 雲端儲存
  - 取代 localStorage，支援跨裝置同步。（目前已決定暫緩）

- [ ] Scrollbar 樣式統一
  - 用 `::-webkit-scrollbar` CSS 自訂滾動條，配合現有石板/棕色系 UI。

---

## ✅ 已完成

- [x] NPC 出場流程
  2026-03-18 [Claude Sonnet 4.6]: buildPrompt npcCandidates 上限動態化、relevantLorebook 加入 affection≥60 條件（限候選名單內）、pinnedNpcs 去重、handleSendMessage [出場:] 改用 matchAll；types.ts 加 locationType；constants.ts 15 筆地點補值；useCommandParser LOCATION_DISCOVER 加 inferLocationType；LorebookModal 加地點類型下拉

- [x] NPC 記憶庫設計
  好感度達到 60 時解鎖，屬於永久性功能，不會因好感度下降而關閉。NPC_THOUGHT 跟 memories 優化。只有當 NPC 出現在 appearingNpcs 或 isPinned 時，才注入其記憶庫內容。當記憶庫累積到一定數量時，由助理 GM 主動觸發融合。

- [x] 道具 effect 前端處理
  2026-03-18 [Claude Sonnet 4.6]: types.ts ConsumableItem 已有 effect 欄位；useCommandParser applyItemEffect 修正 race condition 與負值防呆；ITEM_ADD / ITEM_USE 指令完整支援；App.tsx 道具欄「使用」按鈕整合完成。

- [x] 指令執行結果顯示一致化（toastQueue → notifyCommandResult）
  2026-03-18 [Claude Sonnet 4.6]: App.tsx 新增 notifyCommandResult（自適應間隔：≤3 條 700ms、4–6 條 500ms、7+ 條 350ms）、toastTimerRef 統一管理 timer；useCommandParser 局部變數改名 cmdResults，移除硬編碼 setTimeout 排隊，改呼叫 notifyCommandResult。

- [x] Bug 修復：月份/年份進位溢出
  2026-03-18 [Claude Sonnet 4.6]: useCommandParser.ts TIME 計算加入日/月/年進位邏輯（每月 30 天、每年 12 月），setTimeState 同步更新 month/year，newTotalDays 改用進位後數值。

- [x] Bug 修復：applyItemEffect race condition
  2026-03-18 [Claude Sonnet 4.6]: parts 陣列移出 setProfile setter callback，改在 callback 外預先計算，確保 showToast 呼叫時 effectDesc 已填入。
