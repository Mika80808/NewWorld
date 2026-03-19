# CLAUDE.md — 專案上下文（AI 自動讀取）

> 這份文件供 Claude Code 自動讀取。
> 詳細開發歷史請見 CHANGELOG.md，待做任務請見 TODO.md。
> 以下為初始架構，僅供參考。
---

## 專案簡介

LLM 擔任 GM 的開放式世界文字冒險 RPG，玩家以自由文字輸入推進劇情。
具有單機遊戲的道具、金錢、好感度、地圖等等數據化功能。
後期需要跨裝置設定，讓玩家可登入google帳號同步遊戲存檔。

---

## 技術棧

- **框架**：React 19 + TypeScript + Vite
- **樣式**：Tailwind CSS v4
- **AI**：Google Gemini 2.0 Flash（`@google/genai`）
- **儲存**：localStorage（未來規劃 Firebase）
- **主要檔案**：`src/App.tsx`（所有邏輯集中在單一檔案）

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
  // NPC 類專用欄位
  job?: string
  appearance?: string
  personality?: string
  other?: string
  // 觸發控制
  isActive: boolean
  keywords: string[]                  // 主關鍵字（OR）
  selective: boolean                  // true = AND 邏輯
  secondaryKeys: string[]             // 次要關鍵字（selective=true 時使用）
  insertionOrder: number              // 數字越小越先注入，預設 100
}
```

### diaryEntries[]（日記）
```typescript
interface DiaryEntry {
  id: number
  text: string
  isActive: boolean
  keywords: string[]                  // 空陣列 = 永遠注入；有值 = 關鍵字觸發
}
```

---

## AI 回應格式約定

AI（Gemini）的回應會包含一個指令區塊，**前端攔截解析，不顯示給玩家**：

```
<<COMMANDS>>
HP:-10
MP:+5
GOLD:+100
AFFINITY:芬里爾:+5
LOCATION:月湖鎮
TIME:+2h
ITEM_ADD:草藥:1:回復 20 HP
ITEM_REMOVE:草藥:1
MEMORY_ADD:region:normal:迷霧森林昨日大火:locations=迷霧森林:factions=黑牙氏族:keywords=大火:sticky=3
MEMORY_ADD:scene:normal:酒館暫時關閉:locations=月湖鎮酒館:expires=明日
MEMORY_ADD:npc:normal:芬里爾透露停火協議內幕:npcs=芬里爾:keywords=停火,協議
MEMORY_ADD:world:critical:魔王宣戰:keywords=魔王,宣戰
<</COMMANDS>>
```

**MEMORY_ADD 完整格式：**
```
MEMORY_ADD:type:importance:content:locations=x,y:npcs=a:factions=b:keywords=c,d:sticky=N:expires=日期
```
- `scene` / `region` 若未指定 `locations`，自動使用當前地點
- 簡化格式也支援：`MEMORY_ADD:scene:內容`

---

## 深藍金主題 CSS Variables（v8+）

在 `src/index.css` 中定義的 CSS 色票：

```css
:root {
  --bg0:     #0a1628;   /* 最外層背景（三欄底色）*/
  --bg1:     #0d1f3c;   /* 左右側欄背景 */
  --bg2:     #132540;   /* 卡片、輸入框、對話泡泡背景 */
  --bg3:     #1a2e50;   /* NPC chip、次要卡片 */
  --border:  #2a4a7f;   /* 所有邊框（0.5px solid）*/
  --text1:   #e2eaf8;   /* 主要文字 */
  --text2:   #8ab4e8;   /* 次要文字、標籤 */
  --text3:   #3a5a8a;   /* 提示文字、時間戳 */
  --accent:  #e6bf55;   /* 金色強調（按鈕、標題、邊線）*/
  --accent2: #fde68a;   /* 金色高亮（玩家節點中心、hover）*/
  --danger:  #ff8866;   /* 危險/HP 警示、目標節點 */
}
```

- **字體**：`body { font-family: Georgia, serif; }`
- **圓角規格**：最外框 8px / 卡片 5px / 膠囊 20px / 對話角 3px

---

## 重要設計決策

| 決策 | 原因 |
|---|---|
| HP / MP 無上限 | 支援升級後成長感，不 clamp 到 maxHp/maxMp |
| 所有邏輯在 App.tsx | 早期開發階段，維持簡單 |
| localStorage 儲存 | 先做 UI，Firebase 之後再加 |
| Gemini 2.0 Flash | 速度與成本平衡 |
| 記憶四層架構 | world / region / scene / npc，依影響範圍分層注入 |
| Lorebook 關鍵字觸發 | 仿 SillyTavern，支援 AND/OR 邏輯 |
| 深藍金主題 v8 | 統一 UI 視覺語言，石英 → 深海藍 × 金色手稿風 |

---

## ⚠️ 注意事項（踩過的坑）

1. **State 更新必須用 functional update**
   ```typescript
   // ✅ 正確
   setProfile(prev => ({ ...prev, hp: prev.hp - 10 }))
   // ❌ 錯誤（會有無限迴圈風險）
   setProfile({ ...profile, hp: profile.hp - 10 })
   ```

2. **COMMANDS 解析在串流結束後才執行**，不要在串流中途觸發

3. **lorebookEntries 的 NPC 類**注入條件與其他類不同：需要釘選或在當前場景，才會進入 relevantLorebook

4. **memories 取代了舊的三個陣列**（`worldMemory` / `factionMemory` / `locationMemory`），不要重新加回去

5. **`package.json` 的 dev script 綁定 `0.0.0.0:3000`**，不要改動這個設定

---

## 關鍵函數索引

| 函數 | 說明 |
|---|---|
| `buildPrompt(userInput)` | 組裝送給 Gemini 的完整 prompt |
| `parseAndExecuteCommands(text)` | 解析並執行 COMMANDS 區塊 |
| `scanKeywords(keywords, depth, extra)` | 掃描最近 N 則對話是否包含關鍵字 |
| `isMemoryTriggered(mem, userInput)` | 判斷記憶是否應該注入（含 sticky/cooldown）|
| `tickMemoryCounters(triggeredIds)` | 每次 AI 回應後更新 sticky/cooldown 計數器 |
| `lorebookHitsKeywords(entry)` | 判斷 Lorebook 條目是否觸發（含 AND 邏輯）|
| `handleSendMessage()` | 主要的對話送出與 AI 串流邏輯 |
