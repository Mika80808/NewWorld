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

- [x] Prompt 效率優化 / COMMAND FORMAT 壓縮
  - COMMAND FORMAT 區塊永遠硬寫在 `buildPrompt` 函數結尾，與玩家可編輯的 `systemPrompt` 完全隔離，玩家看不到也改不了。
  - 壓縮目標：縮短這段硬寫內容的字數，不是移動位置。
  2026-03-23 [Claude Sonnet 4.6]: App.tsx buildPrompt COMMAND FORMAT 區塊 83行→58行（-30%）；移除行內重複說明、合併各觸發時機為緊湊清單、壓縮字體/選項區塊說明

- [x] Prompt 記憶寫入規則（再次確認）
  - 在 `buildPrompt` 的 COMMAND FORMAT 說明裡，加入「AI 何時應輸出 MEMORY_ADD」的規則。
  - 包含五種情境：世界事件 / 區域事件 / 場景狀態改變 / NPC 情報 / 玩家重要事件。
  - 特別規則：AI 回應裡出現 `[ ]` 布告欄內容時，必定觸發 `MEMORY_ADD:region`。
  2026-03-23 [Claude Sonnet 4.6]: 已由 Gemini 在遠端實作完成（ceb2248），五種情境與布告欄特別規則均已存在於 buildPrompt

- [x] 記憶系統分層（注入條件精確化）
  2026-03-23 [Claude Sonnet 4.6]:
  - types.ts: LorebookEntry 加 aliases?: string[]
  - useCommandParser.ts isMemoryTriggered: region/scene 改精確比對（exact match + aliases from LorebookEntry），world 跳過地點限制
  - useCommandParser.ts parseAndExecuteCommands: worldMemCount 防呆，同回合 world 記憶上限 2 條
  - App.tsx buildPrompt: 加 sortByNewest()；region/scene normal/flavor 按最新優先截斷；npcMems 拆出場（全量截斷）vs 未出場 pinned/高好感（只 critical max 2）；總數 >20 降級策略（只保留 critical）

---

## 群組 B｜GM 助理（Sub GM）系統

- [x] 整體架構分工（Sub GM 基礎）
  2026-03-23 [Claude Sonnet 4.6]: updateAdventureState 加 hasKeyEvent 參數；subGMRoundsRef 節流（每 3 回合 1 次）；hasKeyEvent（QUEST_ADD/LOCATION/MEMORY_ADD:world）可跳過冷卻；handleSendMessage 偵測並傳入 hasKeyEvent

- [x] GM 助理輸出格式
  2026-03-23 [Claude Sonnet 4.6]: 加 diary_worthy 欄位至 Sub GM prompt；說明判斷標準；diaryWorthyRoundsRef 冷卻（5 次 Sub GM 呼叫後才可再次觸發）

- [x] GM 助理自動生成日記
  2026-03-23 [Claude Sonnet 4.6]: handleGenerateDiary 加 silent 參數；silent=true 時不顯示 toast、改設 hasNewDiary=true；左欄日記卡標題顯示【新日記】紅色通知，點擊開啟即消除

- [x] 日記機制確認
  2026-03-23 [Claude Sonnet 4.6]: 確認無變動——關鍵字觸發邏輯維持在 scanKeywords，Sub GM 不寫入關鍵字

---

## 群組 C｜前端數值與 UI
> 各項目互相獨立，可並行或逐一完成。



---


- [x] **NPC 卡片 UI 重製（依設計圖）**
  2026-03-21 [Claude Sonnet 4.6]: LorebookModal.tsx NPC tab 改為 2欄暖米色卡片 grid（bg-[#e2d8c4]），卡片含名字/種族性別/好感度/勾選框/職業/關係；NpcModal.tsx 全面重製：header（checkbox/名字/種族性別/好感度/pin/三點選單/關閉）、職業+關係副標題、上次見面行、資料/記憶分頁（isNew 粉紅點）、backstory 好感≥20解鎖、編輯模式、刪除二次確認；App.tsx 加 handleDeleteNpc 與相關 props
  2026-03-21 [Claude Sonnet 4.6]: 修正工具列排版：搜尋欄（左）＋「+新增」按鈕（右）獨立成第一行，分類 tabs 移至第二行（對齊截圖設計）


   **縮略卡（設定集列表）**

  版面：響應式 grid，每欄等寬（桌面 4 欄，手機 1 欄或 2 欄視寬度而定）

  每張縮略卡的結構：
  ```
  ┌─────────────────────────────────────┐
  │ 芬里爾  狼族 男        ♥ 5    [☑] │  ← 名字（粗大）＋種族＋性別（小標籤）＋愛心好感度＋勾選框
  │ 黑牙氏族首領              陌生人   │  ← 職業（左）＋關係標籤（右）
  └─────────────────────────────────────┘
  ```
  - 名字：font-size large、font-weight bold
  - 卡片底色：#132540
  - 種族＋性別：名字右側，font-size small，color: var(--text2)
  - 愛心圖示＋數字：顏色由 `affectionColor()` 決定，靠右
  - 勾選框：最右側，控制「是否注入 AI prompt」（對應 `lorebookEntry.isActive`）
  - 點擊卡片任意處（勾選框除外）→ 彈出詳細 Modal

  **地點縮略卡**
  ```
  ┌─────────────────────────────────────┐
  │ 月湖鎮                        [☑]  │  ← 地名（粗）＋勾選框
  │ 湖畔小鎮，商旅往來頻繁。             │  ← 一句簡介
  └─────────────────────────────────────┘
  ```

  **詳細 Modal（點擊縮略卡後彈出）**

  分頁(左)結構由上到下：
  ```
  ┌─────────────────────────────────────────┐
  │ [☑]  芬里爾  狼族 男          ♥ 5 [...] │  ← 勾選框＋名字（粗大）＋種族性別＋好感度（粗大）＋三點選單(編輯\刪除角色)
  │─────────────────────────────────────────│  ← 分隔線
  │ 黑牙氏族首領                     陌生人  │  ← 職業（左）＋關係標籤（右）       │
  │ 
  │ 上次見面
  │─────────────────────────────────────────│ 
  │       資料        |        記憶        ← 依照現有的分頁
  │─────────────────────────────────────────│  
  │                                      
  │ ┌──────────────────────────────────────┐ │
  │ │ 銀藍色短髮，金色眼眸⋯               │ │  ← 外貌（灰底卡片）
  │ └──────────────────────────────────────┘ │
  │ ┌──────────────────────────────────────┐ │
  │ │ Alpha。果決、聰明⋯                  │ │  ← 性格（灰底卡片）
  │ └──────────────────────────────────────┘ │
  │ ┌──────────────────────────────────────┐ │
  │ │ 深山出身的獨行獵人，曾在戰爭中⋯     │ │  ← 背景故事（灰底卡片，好感度 ≥ 20 解鎖，永久）
  │ └──────────────────────────────────────┘ │
  └─────────────────────────────────────────┘
  ```
     
  **詳細 Modal（點擊縮略卡後彈出）**

  分頁(右)結構由上到下：
  ```
  ┌─────────────────────────────────────────┐
  │ [☑]  芬里爾  狼族 男          ♥ 5 [...] │  ← 勾選框＋名字＋種族性別＋好感度＋三點選單(編輯\刪除角色)
  │─────────────────────────────────────────│  ← 分隔線
  │ 黑牙氏族首領                     陌生人  │  ← 職業（左）＋關係標籤（右） 
  │ 
  │ 上次見面
  │─────────────────────────────────────────│ 
  │       資料        |        記憶        ← 依照現有的分頁
  │─────────────────────────────────────────│  
  │ 內心想法 ────────────────────────────── │
  │   「那個人類法師又在搞些神祕兮兮的⋯」    │  ← 第1條（最新，完整顯示）
  │   「比起魔法，我更相信手中的斧頭。」      │  ← 第2條
  │   ⋯（最多顯示第1–5條，第6–10條隱藏）    │
  │ 角色記憶 ● ───────────────────[+]────  │  ← ● 為粉紅點，有新融合記憶才出現。[+]是新增記憶
  │   ☑ 記憶A   [哮月] [銀斧]  ⋯  │  ← 折疊列：勾選框＋記憶名稱＋關鍵字＋三點選單(編輯\刪除記憶)
  │     （點擊展開完整事件內容）            │
  │   ☐ 記憶B   [哮月] [銀斧]  ⋯  │
  │                               │
  └───────────────────────────────────────┘
  ```

  - 分頁(左)：外貌、個性、人物背景 backstory、其他。
  - 分頁(右)：內心想法、角色記憶。
  - `...` 三點選單：展開後顯示「編輯\刪除角色」。「編輯」：修改角色外貌、性格。「刪除」：刪除角色，點擊後出現二次確認警示
  - 修改欄位可按住右下角，拉長欄位，方便修改。
  - 內心想法：AI 自動寫入，玩家無法修改；最新排最上方；第 6–10 條資料保留但 UI 隱藏
  - 角色記憶：最新排最上方，依生成時間自然排序
  - 粉紅點（`●`）：融合產生的記憶帶 `isNew: true`，點開 Modal 後自動清除（`isNew: false`）
  - Modal 背景遮罩：`rgba(0,0,0,0.6)`
  - 好感度顏色一律使用 `affectionColor()` 回傳的 CSS 變數，不硬編碼色碼
  - 點擊右欄[當前場景人物] 時，也連結到同一個詳細 Modal。

- [x] **好感度顏色系統統一（affectionColor）**
  2026-03-21 [Claude Sonnet 4.6]: index.css 補 --affection-* 五個 CSS 變數；App.tsx import affectionColor from NpcModal；修正兩處硬編碼：釘選 NPC 卡片（text-rose-400）與場景人物卡片（三元 Tailwind class）均改用 style={{ color: affectionColor() }}

  將全專案所有好感度顏色判斷統一為 `affectionColor()` function，移除所有散落的硬編碼色碼與 Tailwind class。

  **affectionColor 規格：**
  ```ts
  function affectionColor(affection: number): string {
    if (affection < 0)   return 'var(--affection-hostile)' // 深灰，敵對
    if (affection < 50)  return 'var(--affection-low)'     // 淺灰，普通
    if (affection < 80)  return 'var(--affection-mid)'     // 粉紅 60%，友好
    if (affection < 100) return 'var(--affection-high)'    // 粉紅 80%，親密
    return 'var(--affection-max)'                          // 粉紅 100%，最高
  }
  ```

  **需要替換的位置：**
  - `NpcModal.tsx` — `affectionColor` 三元運算子
  - `App.tsx` 右欄當前場景人物卡片 — 好感度愛心顏色
  - 其他任何出現 `text-emerald-400` / `text-rose-400` / `text-[#fde68a]` 用於好感度顯示的地方

  **注意事項：**
  - function 放在 `NpcModal.tsx` 頂部（UI helper，不是業務邏輯）
  - 使用 `style={{ color: affectionColor(npc.affection) }}`，不用 className
  - CSS 變數定義在 `index.css` `:root` 區塊，參照 CLAUDE.md 規格

- [x] 道具資訊分層注入（buildPrompt 優化）
  2026-03-23 [Claude Sonnet 4.6]: App.tsx buildPrompt [Inventory] 改分層注入：quantity>1 或 description 含效果關鍵字（HP/MP/回復/治療/效果...）→完整傳送；其餘只傳名稱+數量；超過 15 件時只有最近新增 5 件保留完整說明

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
  - `:root { font-size: 16px }` 作為基準
  - 正文、標題改用 `rem`；行高、字距用 `em`；邊框、圓角、icon 保留 `px`
  - 手機版若需縮小全站字體，只需調整 `:root font-size`
 
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

- [ ] 對話摘要壓縮
  - 超過 N 輪後，舊對話壓縮成摘要節省 token。
  - 建議：保留最近 20 則原文，更早的壓縮成 200 字摘要。

- [ ] 向量語意搜尋記憶
  - 進階記憶檢索，以語意相似度取代關鍵字判斷是否注入。

- [ ] Firebase 雲端儲存
  - 取代 localStorage，支援跨裝置同步。（目前已決定暫緩）

- [ ] Scrollbar 樣式統一
  - 用 `::-webkit-scrollbar` CSS 自訂滾動條。

---

## ✅ 已完成


- [x] **視覺主題統一（CSS Variables 落地）**

  規格已定義在 CLAUDE.md，待實作到 `index.css` 與全專案 className：

  | 項目 | 規格 | 狀態 |
  |---|---|---|
  | `--text3` 更新 | `#cec9c0` → `#b7b4ae`，全專案 `text-[#cec9c0]` 換成 `var(--text3)` | ⬜ |
  | `--text4` 新增 | `#e6d6bf`，狀態數值（HP/MP/金幣數字）專用 | ⬜ |
  | Tailwind 語意色 | rose-400/emerald-400/amber-400/blue-400/violet-400 覆寫 | ⬜ |
  | 圓角統一 | 大圓角 10px / 其餘一律 8px，掃全專案 `rounded-[Npx]` | ⬜ |

  > 藍色按鈕標準（`#1044ab` / `#1a56db` / `#2563eb`）已完成（2026-03-20）。


- [x] **NPC thoughts 閾值調整（5 → 10）**
  2026-03-21 [Claude Sonnet 4.6]: useCommandParser.ts THOUGHTS_LIMIT 5→10；types.ts NpcMemory 加 isNew?；pre_merge/merged 記憶寫入帶 isNew:true；NpcModal.tsx thoughts.slice(0,5) 只顯示前5條、記憶標題粉紅點（hasNewMemory）、切到記憶頁後自動清除 isNew；App.tsx 加 handleClearNewMemories

