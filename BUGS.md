# BUG 清單（2026-03-19 掃描，2026-03-19 全數修正）

> 嚴重度：🔴 CRITICAL → 🟠 HIGH → 🟡 MEDIUM → 🟢 LOW

---

## 🔴 CRITICAL（會導致執行期崩潰或功能完全失效）

### BUG-01：`sceneMems` 重複宣告（編譯錯誤）
- **檔案：** `src/App.tsx` 第 818–819 行
- **問題：** `const sceneMems` 宣告兩次，TypeScript 會報 "Cannot redeclare block-scoped variable"
- **修法：** 刪除第 819 行（完全重複）

```typescript
// 819 行刪掉這行：
const sceneMems    = filterByImportance(triggeredMemories.filter(m => m.type === 'scene'), 5, 2);
```

---

### BUG-02：`inventory` / `consumables` 變數未定義
- **檔案：** `src/App.tsx` 第 580、855–856、1362 行
- **問題：** 這兩個變數在 App.tsx 的 scope 內從未宣告。實際狀態已重構為 `equipment`（裝備）和 `items`（道具），但舊名稱沒清乾淨
- **影響：** 匯出存檔時 crash（`ReferenceError`）、buildPrompt crash、背包 UI 顯示 crash
- **修法：**

| 位置 | 舊 | 新 |
|------|----|----|
| 第 580 行 saveData | `inventory, consumables,` | `equipment, items,` |
| 第 855 行 buildPrompt | `inventory.length > 0 ? inventory.map(...)` | `equipment.length > 0 ? equipment.map(...)` |
| 第 856 行 buildPrompt | `consumables.length > 0 ? consumables.map(...)` | `items.length > 0 ? items.map(...)` |
| 第 1362 行 JSX | `consumables.reduce(...)` | `items.reduce(...)` |

---

### BUG-03：`setSelectedItemEntry` 函數不存在
- **檔案：** `src/App.tsx` 第 1332、1410、1422 行
- **問題：** 呼叫了從未宣告的 `setSelectedItemEntry`，正確的 setter 是 `setSelectedInventoryItem`（裝備）和 `setSelectedConsumableItem`（道具）
- **影響：** 按丟棄/使用按鈕時 crash（`ReferenceError`）
- **修法：**

| 行 | 上下文 | 舊 | 新 |
|----|--------|----|----|
| 1332 | items 丟棄按鈕 | `setSelectedItemEntry(null)` | `setSelectedInventoryItem(null)` |
| 1410 | consumables 使用按鈕 | `setSelectedItemEntry(null)` | `setSelectedConsumableItem(null)` |
| 1422 | consumables 丟棄按鈕 | `setSelectedItemEntry(null)` | `setSelectedConsumableItem(null)` |

---

## 🟠 HIGH（功能受損或有潛在資料遺失）

### BUG-04：`useEffect` 內 `saveToStorage` stale closure 風險
- **檔案：** `src/App.tsx` 第 567–574 行
- **問題：** `saveToStorage` 被呼叫於 useEffect 內，但未列入 dependency array，並以 `// eslint-disable` 繞過警告
- **影響：** 若 `saveToStorage` 的 closure 捕捉到舊狀態，可能存入過時資料
- **修法：** 將 `saveToStorage` 改為 `useCallback` 並加入正確 deps，或改寫為直接讀 state 存檔

---

### BUG-05：`setEquipment` 在 `setItems` functional update 內部呼叫（巢狀 setState）
- **檔案：** `src/App.tsx` 第 134–140 行（`updateAdventureState`）
- **問題：**
  ```typescript
  setItems(prev => {
    const moving = prev.filter(...);
    setEquipment(eq => { ... });  // ← 在另一個 setter 的 updater 內呼叫 setter
    return prev.filter(...);
  });
  ```
  React 不保證巢狀 setter 的執行順序，可能在 StrictMode 或 concurrent mode 下行為異常
- **修法：** 先計算好兩邊的新值，再分別 `setItems(...)` 和 `setEquipment(...)`

---

## 🟡 MEDIUM（邏輯瑕疵，可能導致部分功能錯誤）

### BUG-06：NPC 名稱用子字串比對（可能誤中其他 NPC）
- **檔案：** `src/hooks/useCommandParser.ts`
- **問題：** 比對 NPC 使用 `npc.name.includes(name)` 邏輯，若多個 NPC 名稱有重疊（如「芬里爾」和「芬妮」），AI 指令可能同時修改到兩個 NPC
- **修法：** 優先用完全比對（`===`），找不到時才降級到子字串

---

### BUG-07：MEMORY_ADD 解析過於脆弱
- **檔案：** `src/hooks/useCommandParser.ts`
- **問題：** `rest.split(':')` 分割後若 content 本身含有 `:` 字元（如「停火：協議」）會拆錯
- **修法：** 改用具名捕捉群組或只 split 第一個 `:` 來隔離 content 與 tags

---

### BUG-08：地點切換後 memory sticky/cooldown 計數器未重置
- **檔案：** `src/hooks/useCommandParser.ts`
- **問題：** 玩家移動到新地點後，scene-type memory 的 sticky/cooldown 計數仍在跑，可能讓舊場景的記憶殘留在新場景
- **修法：** `LOCATION` 指令執行時，對 `type === 'scene'` 且不含新地點 tag 的記憶重置計數器

---

## 🟢 LOW（細節問題，不影響主要功能）

### BUG-09：匯出存檔結構包含舊欄位名
- **檔案：** `src/App.tsx` 第 578–582 行
- **問題：** BUG-02 修完後，存檔會改以 `equipment`/`items` 輸出，舊存檔（含 `inventory`/`consumables`）仍可向下相容（`useGameStore.ts` 有 migrate 邏輯），但文件應更新說明
- **修法：** CLAUDE.md 的資料結構欄位備註同步更新

---

### BUG-10：`affectionLabel` 與 `affection` 數值可能不同步
- **問題：** `affectionLabel` 是獨立儲存的字串欄位，若 AI 只更新數值而沒更新 label，兩者會不一致
- **修法：** 改為 computed（根據數值動態計算 label），不儲存 label

---

## 修復優先順序

```
BUG-01 → BUG-02 → BUG-03  （CRITICAL，立即修）
BUG-05 → BUG-04            （HIGH，下一輪）
BUG-06 → BUG-07 → BUG-08  （MEDIUM，規劃修）
BUG-09 → BUG-10            （LOW，有空再說）
```
