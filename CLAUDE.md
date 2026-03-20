# CLAUDE.md — 專案上下文（AI 自動讀取）

> 這份文件供 Claude Code 自動讀取。
> 詳細開發歷史請見 CHANGELOG.md，待做任務請見 TODO.md。

---

## 開始工作前的強制步驟

```
git pull origin main
```

**每次開始任何任務前都必須先執行。** Gemini 會推送檔案到 GitHub，不 pull 就動手會造成衝突。

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
- **儲存**：localStorage（未來規劃 Firebase 或 SQLite等技術）
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

## API 設定架構（B0 重構後）

> ⚠️ 目前仍在重構中（TODO 群組 B0），以下為目標狀態。重構完成前請查看 App.tsx 現況。

玩家 API 設定**不隨存檔匯出/匯入**，單獨存在 localStorage：

```
localStorage key: 'mainGM_config'   → 主 GM 設定
localStorage key: 'subGM_config'    → 助理 GM 設定
```

資料結構：
```typescript
interface GMConfig {
  provider: 'gemini'   // 目前只支援 gemini，框架預留擴充
  apiKey: string
  model: string        // 來自靜態清單，例如 'gemini-2.0-flash'
  maxTokens: number
  lastSaved: string    // ISO 時間字串
}

interface SubGMConfig extends GMConfig {
  useSameKey: boolean  // true（預設）時使用主 GM 的 apiKey
}
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
    locations: string[]               // 地點名稱，用於觸發篩選
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
  createdAt: string                   // 遊戲內時間字串
  expiresAt?: string                  // 選填，臨時記憶
}
```

### lorebookEntries[]（設定集）
```typescript
interface LorebookEntry {
  id: number
  title: string
  category: '地點' | 'NPC' | '怪物' | '物品' | '歷史' | string
  content: string                     // 非 NPC 類使用
  isActive: boolean
  // NPC 類專用
  gender?: string                     // 自由文字，例：男、女、無性別、不明
  job?: string
  appearance?: string
  personality?: string
  backstory?: string                  // 角色背景故事，50 字以內；好感度 ≥ 20 永久解鎖顯示
  other?: string
  homeLocation?: string               // NPC 主場地點（唯寫一次）
  roamLocations?: string[]            // 巡遊地點（滑動窗口，最多 3 個）
  // 地點類專用
  mapX?: number
  mapY?: number
  mapStatus?: 'discovered' | 'known'
  cartFare?: number
  adjacentTo?: string[]
  locationType?: 'town' | 'wilderness' | 'building'
  // 觸發控制（共用）
  keywords: string[]                  // 主關鍵字（OR）
  selective: boolean                  // true = AND 邏輯
  secondaryKeys: string[]             // 次要關鍵字（selective=true 時使用）
  insertionOrder: number              // 數字越小越先注入，預設 100
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
  thoughts?: { text: string; createdAt: string }[]  // 最多 5 則，滿了寫入 memories
  isPinned?: boolean
  memories: NpcMemory[]
}

interface NpcMemory {
  id: string                                // `nmem_${Date.now()}_${random}`
  text: string
  createdAt: string                         // 遊戲內時間
  source: 'manual' | 'pre_merge' | 'merged'
  // manual    = 玩家手動輸入
  // pre_merge = thoughts 自動串接（尚未 AI 融合）
  // merged    = Sub GM AI 融合後的摘要
  importance: 'core' | 'normal'
  // core   = 永遠注入 prompt
  // normal = 截斷規則：最近 5 則，超過 300 字縮到 3 則
  isMerged?: boolean                        // 已被融合，保留但不注入 prompt
  mergedFrom?: string[]
}
```

### diaryEntries[]（日記）
```typescript
interface DiaryEntry {
  id: number
  text: string
  isActive: boolean
  keywords: string[]                  // 空陣列 = 永遠注入；有值 = 關鍵字觸發
  source?: 'manual' | 'ai_generated' | 'merged'
  mergedFrom?: number[]
  isMerged?: boolean
}
```

### 道具 / 裝備
```typescript
interface EquipmentItem {             // 穿戴型，舊名 InventoryItem
  id: number; name: string; description: string; isEquipped: boolean
}
interface ItemEntry {                 // 使用型，舊名 ConsumableItem
  id: number; name: string; quantity: number; description: string
  effect?: { type: string; value: number }  // 前端直接套用的數值效果
}
```

---

## NPC 兩階段注入架構

**Phase 1（buildPrompt 入口）**：依地點篩選候選名單
- `homeLocation === currentLocation` 或 `roamLocations.includes(currentLocation)` 的 NPC 列入候選
- 上限：`locationType === 'town'` → 8 人，其他 → 3 人
- 只輸出輕量名單給 AI（`[當前場景可能出現的角色]`），AI 決定誰真正出場

**Phase 2（handleSendMessage 後）**：AI 回應出現 `[出場:姓名]` 標記後完整注入
- 更新 `appearingNpcs`，下一輪 `buildPrompt` 才注入完整 NPC 資料
- 防呆：`matchAll` 收集所有標記並去重，避免重複注入

**NPC 注入資格（Phase 2 後）**：
1. `appearingNpcs` 裡的 NPC
2. `isPinned === true` 的 NPC
3. 候選名單內 `affection >= 60` 的 NPC

---

## AI 回應格式約定

AI 回應包含指令區塊，**前端攔截解析，不顯示給玩家**：

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
NPC_NEW:芬里爾:精靈:男:獵人:銀髮高挑:冷靜寡言:深山出身的獨行獵人，曾在戰爭中失去摯友。
NPC_HOME:芬里爾:迷霧森林
NPC_LOCATION:芬里爾:月湖鎮
NPC_THOUGHT:芬里爾:覺得玩家值得信任
NPC_RELATIONSHIP:芬里爾:盟友
QUEST_GOAL_MET:任務ID
QUEST_COMPLETE:任務ID
MEMORY_ADD:region:normal:迷霧森林昨日大火:locations=迷霧森林:keywords=大火:sticky=3
MEMORY_ADD:world:critical:魔王宣戰:keywords=魔王,宣戰
<</COMMANDS>>
```

**NPC_NEW 完整格式：**
```
NPC_NEW:姓名:種族:性別:職業:外貌:性格:背景故事（50字以內）
```
- 背景故事為選填，省略時留空或不寫第 7 個參數
- AI 創建新角色時應盡量生成背景故事，寫入 `lorebookEntries` 的 `backstory` 欄位

**MEMORY_ADD 完整格式：**
```
MEMORY_ADD:type:importance:content:locations=x,y:npcs=a:factions=b:keywords=c,d:sticky=N:expires=日期
```
- `scene` / `region` 若未指定 `locations`，自動使用當前地點
- 簡化格式也支援：`MEMORY_ADD:scene:內容`

**COMMANDS 區塊在串流結束後才解析**，不要在串流中途觸發。

---

## 深藍金主題 CSS Variables

```css
:root {
  /* 主題色（可隨主題調整） */
  --bg0:     #171617;   /* 最外層背景 */
  --bg1:     #24282d;   /* 左右側欄 */
  --bg2:     #132540;   /* 卡片、輸入框、對話泡泡 */
  --border:  #2a4a7f;   /* 所有邊框（0.5px solid）*/
  --text1:   #fbf5e4;   /* 主要文字 */
  --text2:   #e8e8e9;   /* 次要文字、標籤 */
  --text3:   #b7b4ae;   /* 提示文字、時間戳（placeholder 統一用此色）*/
  --text4:   #e6d6bf;   /* 狀態數值專用（HP、MP、金幣等數字）*/
  --accent:  #fde68a;   /* 金色強調 */
  --danger:  #ff8866;   /* HP 警示 */

  /* 好感度顏色（固定語意色，不隨主題變動） */
  --affection-max:     #fb7185;               /* ≥ 100，彩度 100% */
  --affection-high:    rgba(251,113,133,0.80); /* ≥ 80，彩度 80% */
  --affection-mid:     rgba(251,113,133,0.60); /* ≥ 50，彩度 60% */
  --affection-low:     #a0a0a0;               /* ≥ 0，淺灰 */
  --affection-hostile: #505050;               /* < 0，深灰（敵對） */
}
```

**藍色按鈕標準**（全專案統一）：
```
預設：#1044ab　　hover：#1a56db　　active：#2563eb
shadow：0_4px_12px_rgba(16,68,171,0.2)
```

**Tailwind 語意色對應**（覆寫預設色票）：
```
rose-400    → #b0b0b0   （中性灰，用於刪除/危險動作）
emerald-400 → #fb7185   （粉紅，用於好感度愛心等）
amber-400   → #e8a88c   （暖橙，用於警告/稀有）
blue-400    → #5f93d3   （中藍，用於連結/信息）
violet-400  → #a78bfa   （紫，用於魔法/特殊）
```

- **字體**：`body { font-family: Georgia, serif; }`
- **圓角規格**：大圓角 10px / 全圓角（膠囊）9999px / 其餘一律 8px

---

## 重要設計決策

| 決策 | 原因 |
|---|---|
| HP / MP 無上限 | 支援升級後成長感，不 clamp 到 maxHp/maxMp |
| 所有邏輯在 App.tsx | 維持簡單，避免跨檔依賴 |
| localStorage 儲存 | 先做 UI，Firebase 之後再加 |
| API Key 不進存檔 | 安全性考量，單獨存 localStorage |
| callAI 封裝層 | 未來換 API 服務只需改一處 |
| 記憶四層架構 | world / region / scene / npc，依影響範圍分層注入 |
| Lorebook 關鍵字觸發 | 仿 SillyTavern，支援 AND/OR 邏輯 |
| 深藍金主題 | 深海藍 × 金色手稿風，統一 UI 視覺語言 |
| NPC 兩階段注入 | 避免全體 NPC 塞滿 prompt，Phase 1 輕量候選，Phase 2 出場才完整注入 |
| 日記關鍵字觸發 | 玩家主控注入，GM 助理不自動新增關鍵字 |
| 好感度顏色固定 | 語意色不隨主題變動，統一用 CSS 變數管理 |
| backstory 在 lorebookEntries | 屬於靜態角色定義，由玩家填寫或 AI 創建時生成 |

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

6. **NPC `thoughts[]` 滿 5 則時自動串接寫入 `memories[]`**（source: `pre_merge`）並清空，不要改變這個閾值

7. **`[出場:]` 標記用 `matchAll` 收集並去重**，不要改回單次 `match`

8. **`pinnedNpcs` 已在 `relevantLorebook` 去重**，不要讓同一 NPC 出現兩次於 prompt

9. **`backstory` 解鎖條件是好感度 ≥ 20，永久解鎖**（不因好感度下降而隱藏）。UI 顯示在性格欄位下方，未解鎖時顯示「？？？」或隱藏。

10. **好感度顏色一律使用 CSS 變數**（`var(--affection-*)`)，不要用 Tailwind class 或硬編碼色碼。`affectionColor()` 是唯一判斷入口。

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
| `NpcModal.tsx` `affectionColor(affection)` | 回傳好感度對應 CSS 變數字串，供 `style={{ color }}` 使用 |
