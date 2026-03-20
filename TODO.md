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

---

## 群組 B｜GM 助理（Sub GM）系統

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

- [ ] **新增 NPC 欄位 gender、backstory**

 
  找到右欄遍歷 `appearingNpcs` 渲染卡片的程式碼，將靜態欄位的來源改為 `lorebookEntries`：

  ```tsx
  // 修改前（靜態資料從 npcs[] 讀）
  appearingNpcs.map(npcName => {
    const npc = npcs.find(n => n.name === npcName)
    // npc.job, npc.appearance, npc.personality...
  })

  // 修改後（靜態資料從 lorebookEntries 讀，動態資料仍從 npcs[] 讀）
  appearingNpcs.map(npcName => {
    const npc  = npcs.find(n => n.name === npcName)
    const lore = lorebookEntries.find(
      e => e.category === 'NPC' && e.title === npcName
    )
    const displayData = {
      name:           npcName,
      // 靜態資料：優先 lorebookEntries，fallback npcs[]
      gender:         lore?.gender       ?? '',
      job:            lore?.job          ?? npc?.job          ?? '',
      appearance:     lore?.appearance   ?? npc?.appearance   ?? '',
      personality:    lore?.personality  ?? npc?.personality  ?? '',
      backstory:      lore?.backstory    ?? '',
      other:          lore?.other        ?? npc?.other        ?? '',
      // 動態資料：只從 npcs[] 讀
      affection:      npc?.affection     ?? 0,
      affectionLabel: npc?.affectionLabel ?? '',
      thoughts:       npc?.thoughts      ?? [],
      memories:       npc?.memories      ?? [],
      isPinned:       npc?.isPinned      ?? false,
    }
    // 用 displayData 渲染卡片（gender 顯示在卡片上，與 job 並列）
  })
  ```

  **注意事項**
  - `NPC_NEW` 寫入 `npcs[]` 的 job/appearance 等欄位**不需要移除**，保留作為 fallback（向下相容舊存檔）
  - `lorebookEntries` 的 NPC 判斷條件是 `category === 'NPC'`，`title` 對應 NPC 名字
  - 設定集本身的卡片直接顯示 `lorebookEntries`，確認沒有經過 `npcs[]` 即可，不需要改
  - 只改右欄的**讀取邏輯**，不改任何資料結構
  - **`gender` 與 `backstory` 需同步補在以下四個地方：**
    1. `types.ts` — `LorebookEntry` 介面加 `gender?: string`、`backstory?: string`
    2. 設定集 NPC 編輯表單 — 加 gender 自由文字輸入欄、backstory 文字輸入欄（50 字上限）
    3. backstory 於好感度 ≥ 20 後永久解鎖顯示；角色記憶於好感度 ≥ 60 後永久解鎖顯示
    4. `buildPrompt` — NPC 資料注入 AI 時把 `gender` 與 `backstory` 帶入

---
- [ ] **新增 NPC 種族（race）欄位**

  **改動範圍**

  1. `types.ts` — `LorebookEntry` 與 `Npc` 介面加 `race?: string`

  2. `displayData` 區塊 — 新增一行，並做舊存檔 migration fallback：
     ```ts
     race: lore?.race ?? lore?.other ?? npc?.other ?? '',
     ```
     fallback 順序：`lore.race` → `lore.other`（舊存檔 migration）→ `npc.other` → `''`

  3. `useCommandParser.ts` — `NPC_NEW` 解析後 race 存入 `race` 欄位，不再存 `other`

  4. `App.tsx` — `handleRecordNpc` 建立 lorebook 條目時帶入 `race: npc.race`

  5. `buildPrompt` — NPC 注入格式加入種族，找到這行：
     ```ts
     return `[NPC] ${e.title}｜職業：...｜備註：${e.other || ''}...`
     ```
     改為在職業前插入 `種族：${e.race || e.other || ''}`

  6. LorebookModal NPC 編輯表單 — 在職業欄上方新增種族輸入欄
     - placeholder：`例：人類、精靈、狼族`

  7. NPC 縮略卡與 Modal header — 名字右側顯示 `種族 性別`（小字，color: var(--text2)）

  **注意事項**
  - `NPC_NEW` 寫入 `npcs[]` 的舊欄位不需要移除，保留作為 fallback（向下相容）
  - `other` 欄位保留不刪，migration 只是讀取時優先用 `race`

---

- [ ] **NPC thoughts 閾值調整（5 → 10）**
 
  目前 `useCommandParser` 的 `NPC_THOUGHT` 邏輯在 thoughts 滿 5 則時觸發融合，改為 10 則。
 
  - 第 1–5 條：正常顯示於 NpcModal
  - 第 6–10 條：資料保留，UI 隱藏（不渲染）
  - 滿 10 條：觸發助理 GM 融合，生成新角色記憶，thoughts 清空
  - 融合產生的記憶寫入時帶 `isNew: true`
  - NpcModal 角色記憶區塊標題顯示粉紅點（`#FF6B8A`），玩家點開後自動清除（`isNew: false`）
 
  **需修改的地方：**
  1. `useCommandParser.ts` — `NPC_THOUGHT` 的 `thoughts.length >= 5` 改為 `>= 10`；
     `pre_merge` 寫入時機同步調整
  2. `types.ts` — `NpcMemory` 介面加 `isNew?: boolean`
  3. `NpcModal.tsx` — 渲染 thoughts 時只取前 5 條（`thoughts.slice(0, 5)`）；
     角色記憶標題旁判斷 `memories.some(m => m.isNew)` 顯示粉紅點；
     Modal 開啟後執行清除標記（`isNew: false`）
---

- [ ] **NPC 卡片 UI 重製（依設計圖）**

  > 依賴上方「BUG 修復」項目完成後執行（資料來源要先對）。

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
  │ [☑]  芬里爾  狼族 男          ♥ 5 [...] │  ← 勾選框＋名字＋種族性別＋好感度＋三點選單(編輯\刪除角色)
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

- [ ] **好感度顏色系統統一（affectionColor）**

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

- [x] 等待串流期間的視覺呈現
  2026-03-19 [Claude Sonnet 4.6]: index.css 新增 `@keyframes blink-dot`；App.tsx 訊息渲染區判斷「最後一則 assistant 訊息 text 為空且 isLoading 為 true」時，顯示金色 `✦ 異世界正在回應` + 3 顆依序彈跳的金色小圓點（stagger 0 / 200 / 400ms），串流第一個字元到來後自動切回正常文字渲染。

- [x] 道具 effect 前端處理
  2026-03-18 [Claude Sonnet 4.6]: types.ts ConsumableItem 已有 effect 欄位；useCommandParser applyItemEffect 修正 race condition 與負值防呆；ITEM_ADD / ITEM_USE 指令完整支援；App.tsx 道具欄「使用」按鈕整合完成。

- [x] 串流顯示策略（延遲顯示）

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

- [x] B0-2｜callAI 重構：支援 mainGM / subGM 分流
  2026-03-20 [Claude Sonnet 4.6]: callAI 加入 role/maxTokens/onChunk 參數，onChunk 存在走 streaming，否則走 generateContent

- [x] B0-1｜State 升級：geminiApiKey → mainGMConfig / subGMConfig
  2026-03-20 [Claude Sonnet 4.6]: types.ts 新增 GMConfig/SubGMConfig；App.tsx 以 mainGMConfig/subGMConfig state 取代 geminiApiKey/maxTokens，useState 初始化時執行 migrate

- [x] B0-3｜移除 Gemini 硬綁定
  2026-03-20 [Claude Sonnet 4.6]: handleGenerateDiary/handleMergeDiary 改走 callAI({role:'main'})；handleSendMessage 改走 callAI({role:'main',onChunk:()=>{}})；vite.config.ts 移除 define；.env.example 更新

- [x] **視覺主題統一（CSS Variables 落地）**

  規格已定義在 CLAUDE.md，待實作到 `index.css` 與全專案 className：

  | 項目 | 規格 | 狀態 |
  |---|---|---|
  | `--text3` 更新 | `#cec9c0` → `#b7b4ae`，全專案 `text-[#cec9c0]` 換成 `var(--text3)` | ⬜ |
  | `--text4` 新增 | `#e6d6bf`，狀態數值（HP/MP/金幣數字）專用 | ⬜ |
  | Tailwind 語意色 | rose-400/emerald-400/amber-400/blue-400/violet-400 覆寫 | ⬜ |
  | 圓角統一 | 大圓角 10px / 其餘一律 8px，掃全專案 `rounded-[Npx]` | ⬜ |

  > 藍色按鈕標準（`#1044ab` / `#1a56db` / `#2563eb`）已完成（2026-03-20）。
