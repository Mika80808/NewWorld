# NewWorld UI 設計規範
> 版本 1.0 · 依據 `LorebookModal.tsx` 整理 · 2026-03-24

---

## 目錄
1. [CSS 變數體系](#一css-變數體系)
2. [圓角規範](#二圓角規範)
3. [排版與佈局](#三排版與佈局)
4. [互動行為](#四互動行為)
5. [字體大小規範](#五字體大小規範)
6. [視覺層次效果](#六視覺層次效果)
7. [元件規則](#七元件規則)
8. [響應式設計](#八響應式設計)
9. [程式規範](#九程式規範)

---

## 一、CSS 變數體系

所有顏色、陰影皆使用 CSS 變數，**禁止寫死色碼（hardcode）**。

### 1-1 背景層級

| 變數 | 用途 |
|---|---|
| `--bg-elevated` | 元件底層背景（modal、card）|
| `--bg-sys-tag` | 關鍵字標籤底色 |

背景一律搭配 `color-mix(in srgb, var(--bg-elevated) XX%, transparent)` 製造透明層次感：

| 透明度 | 適用元件 |
|---|---|
| `70%` | Modal 主容器 |
| `60%` | 編輯展開卡片 |
| `50%` | 一般 Card、搜尋欄、新增按鈕 |
| `30%` | Tab 列底層、輸入欄背景 |

```css
/* 範例 */
background: color-mix(in srgb, var(--bg-elevated) 50%, transparent);
```

---

### 1-2 文字色

| 變數 | 用途 |
|---|---|
| `--text-title` | 主標題、Card 標題（粗體） |
| `--text-primary` | 強調文字、active 狀態圖示 |
| `--text-main` | 一般正文 |
| `--text-body` | 次要文字、欄位標籤 |
| `--text-muted` | 灰色提示、placeholder、關閉按鈕 |
| `--text-danger` | hover 時刪除警告色 |
| `--text-tab` | Tab 標籤文字 |

---

### 1-3 按鈕色

| 變數 | 用途 |
|---|---|
| `--btn-primary` | 主要按鈕底色（新增、完成、active Tab）|
| `--btn-primary-hover` | hover 狀態底色 |
| `--btn--text` | 按鈕上的文字色 |

---

### 1-4 邊框

| 變數／值 | 用途 |
|---|---|
| `--border-default` | Card 預設邊框 |
| `--border-accent` | Card hover 或編輯中邊框 |
| `rgba(255,255,255,0.1)` | 輸入框、全域細線邊框 |
| `rgba(255,255,255,0.05)` | Header / 區塊分隔線 |

---

### 1-5 功能色

| 變數 | 用途 |
|---|---|
| `--color-emerald` | 正向標籤（關係狀態、成功） |
| `--color-rose` | hover 刪除 × 按鈕 |
| `--shadow` | Box shadow 統一變數 |

---

### 1-6 好感度色

| 變數 | 觸發條件 |
|---|---|
| `--affection-hostile` | affection < 0 |
| `--affection-low` | 0 ≤ affection < 50 |
| `--affection-mid` | 50 ≤ affection < 80 |
| `--affection-high` | 80 ≤ affection < 100 |
| `--affection-max` | affection ≥ 100 |

```ts
function affectionColor(affection: number): string {
  if (affection < 0)   return 'var(--affection-hostile)';
  if (affection < 50)  return 'var(--affection-low)';
  if (affection < 80)  return 'var(--affection-mid)';
  if (affection < 100) return 'var(--affection-high)';
  return 'var(--affection-max)';
}
```

---

## 二、圓角規範

| 元件類型 | border-radius | Tailwind class |
|---|---|---|
| Modal、Card、輸入框、Textarea、Select | `8px` | `rounded-[8px]` |
| 搜尋欄、新增按鈕 | `16px` | `rounded-[16px]` |
| 關鍵字膠囊標籤、AND 邏輯按鈕 | 完全圓角 | `rounded-full` |

> ⚠️ 不使用 Tailwind 預設圓角（`rounded-lg`、`rounded-md`），一律寫明數值。

---

## 三、排版與佈局

### 3-1 Modal 結構

```
Fixed overlay
  bg-black/60  backdrop-blur-sm  z-50
  flex items-center justify-center  p-4
  └── Modal 容器
        backdrop-blur-xl  w-full  max-w-3xl
        rounded-[8px]  h-[85vh]  flex flex-col  overflow-hidden
        border border-white/10
        shadow-[0_0_40px_rgba(0,0,0,0.5)]
        ├── Header          (p-4, border-b border-white/5)
        ├── 搜尋 + Tab 列   (px-4 pt-3 pb-0, border-b border-white/5)
        └── 內容區          (flex-1, overflow-y-auto, p-4)
```

---

### 3-2 Grid 卡片系統

```
grid grid-cols-2 gap-3
  ├── 一般卡片     → 佔 1 欄
  └── 編輯展開卡   → col-span-2（佔滿整列）
```

空狀態（無資料）：
```tsx
<div className="text-center py-10 italic" style={{ color: 'var(--text-muted)' }}>
  此分類尚無設定
</div>
```

---

### 3-3 卡片內部佈局原則

- 主內容區右側預留 `pr-8`，讓右上角絕對定位按鈕不與文字重疊
- 右上角操作（勾選框等）使用 `absolute top-3 right-3`
- 標題 → 標籤（有才顯示）→ 描述，垂直依序排列

```tsx
<div className="relative ...">
  <div className="pr-8">
    {/* 標題 */}
    {/* 標籤 */}
    {/* 描述（line-clamp-2） */}
  </div>
  <button className="absolute top-3 right-3">...</button>
</div>
```

---

### 3-4 Header 佈局

```tsx
<div className="p-4 border-b border-white/5 flex justify-between items-center"
  style={{ background: 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)' }}>
  <div className="flex items-center">
    {/* 圖示 + 標題 + 說明文字 */}
  </div>
  {/* 關閉按鈕 ✕ */}
</div>
```

---

### 3-5 搜尋欄 + Tab 列

```
flex gap-2 items-center
  ├── 搜尋欄（flex-1，左側 icon absolute 定位）
  └── 新增按鈕（shrink-0，px-10 h-8）

Tab 列（flex，border rounded-t-[8px] overflow-hidden）
  └── 每個 Tab（flex-1，py-2）
```

---

### 3-6 欄位標籤規範

```tsx
<div className="text-sm ml-3 mb-1.5 uppercase tracking-wider"
  style={{ color: 'var(--text-body)' }}>
  欄位名稱
</div>
```

---

## 四、互動行為

### 4-1 Hover 效果（全部用 `onMouseEnter` / `onMouseLeave` inline）

| 元件 | 預設 | Hover |
|---|---|---|
| Card 邊框 | `--border-default` | `--border-accent` |
| 主要按鈕背景 | `--btn-primary` | `--btn-primary-hover` |
| 主要按鈕邊框 | `rgba(255,255,255,0.1)` | `rgba(255,255,255,0.2)` |
| 刪除按鈕文字 + 邊框 | `--text-muted` | `--text-danger` |
| 關閉 ✕ 文字色 | `--text-muted` | `--text-title` |
| 標籤刪除 × 色 | `--btn--text` | `--color-rose` |

```tsx
// 範例：Card
onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-accent)'; }}
onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-default)'; }}
```

---

### 4-2 雙模式卡片（檢視 / 編輯）

- **檢視模式**：緊湊顯示，點擊整張卡片進入編輯
- **編輯模式**：`col-span-2` 展開，顯示所有可編輯欄位
- 編輯中的卡片邊框改為 `--border-accent`，背景透明度提升至 `60%`

```ts
// 狀態管理
const [editingId, setEditingId] = useState<number | null>(null);
const isEditing = editingId === entry.id;
```

---

### 4-3 輸入框統一樣式（`inputStyle`）

```ts
const inputStyle: React.CSSProperties = {
  background: 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)',
  borderColor: 'rgba(255,255,255,0.1)',
  color: 'var(--text-main)',
};
```

搭配 Tailwind class：`border border-white/10 rounded-[8px] outline-none transition`

---

### 4-4 Enter 鍵提交（關鍵字輸入）

```tsx
onKeyDown={e => {
  if (e.key === 'Enter') {
    onAdd(e.currentTarget.value);
    e.currentTarget.value = '';
  }
}}
```

Placeholder 統一使用：`輸入後按 Enter...`

---

### 4-5 事件冒泡阻擋

卡片內部的獨立按鈕（如勾選框）必須呼叫 `e.stopPropagation()`，避免觸發父層卡片點擊：

```tsx
onClick={e => {
  e.stopPropagation();
  // 執行按鈕自身邏輯
}}
```

---

## 五、字體大小規範

| 元素 | 大小 | 顏色 | 其他 |
|---|---|---|---|
| Modal 標題 | `text-lg font-bold` | `--text-primary` | 搭配左側圖示 `w-5 h-5` |
| Card 主標題 | `text-lg font-bold` | `--text-title` | `leading-snug` |
| NPC 名字 | `text-lg font-bold` | `--text-title` | `leading-tight shrink-0` |
| 職業 / 次要資訊 | `text-sm` | `--text-main` | `overflow-hidden text-ellipsis whitespace-nowrap` |
| Card 描述文字 | `text-base` | `--text-body` | `line-clamp-2 leading-relaxed` |
| 輸入框、Select | `text-sm` | `--text-main` | — |
| 關鍵字膠囊標籤 | `text-xs`（inline style）| `--text-body` | — |
| 欄位 Label | `text-sm uppercase tracking-wider` | `--text-body` | — |
| Toggle 按鈕文字 | `text-sm` | `--text-body` | `rounded-full` |
| 次要說明文字 | `text-sm` | `--text-muted` | — |
| Header 說明文字 | `text-sm` | `--text-muted` | `ml-4` |

---

## 六、視覺層次效果

### 6-1 模糊效果

| 元素 | Class |
|---|---|
| Modal Overlay | `backdrop-blur-sm` |
| Modal 主體 | `backdrop-blur-xl` |
| Card | `backdrop-blur-sm` |

---

### 6-2 陰影

| 用途 | 值 |
|---|---|
| Modal 主體 | `shadow-[0_0_40px_rgba(0,0,0,0.5)]` |
| 按鈕 / active Tab | `var(--shadow)` |

---

### 6-3 z-index 層級

| 元素 | 值 |
|---|---|
| Modal Overlay | `z-50` |

---

## 七、元件規則

### 7-1 圖示庫
- **只使用 `lucide-react`**，統一圖示風格
- 常用尺寸：`w-4 h-4`（行內）、`w-5 h-5`（標題旁）
- 好感度圖示：`affection >= 50` 時加上 `fill-current`

```tsx
import { BookOpen, Plus, Search, CheckSquare, Square, Trash2, Heart } from 'lucide-react';
```

---

### 7-2 Tab 列

```tsx
// flex 平分寬度，border + overflow-hidden 模擬分隔線
<div className="flex border border-white/10 rounded-t-[8px] overflow-hidden">
  {tabs.map(tab => {
    const isActive = current === tab;
    return (
      <button
        key={tab}
        className="flex-1 px-3 py-2 text-base font-bold transition"
        style={{
          background: isActive ? 'var(--btn-primary)' : 'transparent',
          color: 'var(--text-tab)',
          boxShadow: isActive ? 'var(--shadow)' : 'none',
        }}
      >
        {tab}
      </button>
    );
  })}
</div>
```

---

### 7-3 關鍵字膠囊標籤

```tsx
<span
  className="flex items-center gap-1 px-2 py-0.5 rounded-full border"
  style={{
    fontSize: 'text-xs',
    background: 'color-mix(in srgb, var(--bg-sys-tag) 30%, transparent)',
    borderColor: 'color-mix(in srgb, var(--bg-sys-tag) 50%, transparent)',
    color: 'var(--text-body)',
  }}
>
  {keyword}
  <button onClick={onRemove} style={{ color: 'var(--btn--text)' }}
    onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-rose)'; }}
    onMouseLeave={e => { e.currentTarget.style.color = 'var(--btn--text)'; }}
  >×</button>
</span>
```

次要關鍵字（AND 邏輯）前綴 `+`，如 `+keyword`。

---

### 7-4 Toggle 按鈕（AND 邏輯）

```tsx
<button
  style={{
    background: isOn
      ? 'var(--btn-primary)'
      : 'color-mix(in srgb, var(--btn-primary) 50%, transparent)',
    borderColor: isOn
      ? 'var(--btn-primary-hover)'
      : 'color-mix(in srgb, var(--border-default) 40%, transparent)',
  }}
>
  AND 邏輯 {isOn ? '✓' : '✗'}
</button>
```

---

### 7-5 勾選框（AI 讀取開關）

```tsx
<button
  className="absolute top-3 right-3 transition"
  style={{ color: isActive ? 'var(--text-primary)' : 'var(--text-muted)' }}
  title={isActive ? 'AI 將讀取此設定' : 'AI 不讀取此設定'}
>
  {isActive ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
</button>
```

---

### 7-6 刪除按鈕（危險操作）

- 預設：低調樣式（`--text-muted` 文字 + 邊框）
- Hover：才顯示紅色（`--text-danger`），明確告知危險

```tsx
<button
  className="text-sm flex items-center px-2 py-1.5 rounded-[8px] gap-1 transition border-1"
  style={{ color: 'var(--text-muted)', borderColor: 'var(--text-muted)' }}
  onMouseEnter={e => {
    e.currentTarget.style.color = 'var(--text-danger)';
    e.currentTarget.style.borderColor = 'var(--text-danger)';
  }}
  onMouseLeave={e => {
    e.currentTarget.style.color = 'var(--text-muted)';
    e.currentTarget.style.borderColor = 'var(--text-muted)';
  }}
>
  <Trash2 className="w-3.5 h-3.5" /> 刪除
</button>
```

---

### 7-7 完成按鈕

```tsx
<button
  className="text-sm px-3 py-1.5 rounded-[8px] transition"
  style={{ background: 'var(--btn-primary)', color: 'var(--btn--text)' }}
  onMouseEnter={e => { e.currentTarget.style.background = 'var(--btn-primary-hover)'; }}
  onMouseLeave={e => { e.currentTarget.style.background = 'var(--btn-primary)'; }}
>
  完成
</button>
```

---

### 7-8 編輯底部操作列

```tsx
<div className="flex justify-between items-center pt-1">
  {/* 左：刪除按鈕 */}
  {/* 右：完成按鈕 */}
</div>
```

---

### 7-9 NPC 卡片資訊排版

```
第一行：姓名（font-bold text-lg, shrink-0）+ 職業（text-sm, flex-1, ellipsis）+ 好感度（Heart icon + 數字, shrink-0）
第二行：種族・性別・年齡（·分隔）+ 彈性空間 + 關係標籤（--color-emerald）
```

---

## 八、響應式設計

| 斷點 | Grid 變化 |
|---|---|
| 預設（≥ md） | `grid-cols-2` |
| 手機（< sm） | 建議降為 `grid-cols-1` |

- Modal 容器：`w-full max-w-3xl`，在手機上搭配 `p-4` padding 留白
- Modal 高度：`h-[85vh]`，確保不超出視口
- 搜尋欄：`flex-1` 自動填充，新增按鈕 `shrink-0` 不壓縮

---

## 九、程式規範

### 9-1 State 更新

```ts
// ✅ 正確：functional update
setState(prev => ({ ...prev, key: newValue }));

// ❌ 錯誤：直接賦值
setState({ ...state, key: newValue });
```

---

### 9-2 邏輯集中原則

- 所有業務邏輯集中於 `src/App.tsx`
- 子元件（如 `LorebookModal`）只接收 props 與回呼，**不持有業務邏輯**

---

### 9-3 Inline Style vs Tailwind

| 使用場景 | 方式 |
|---|---|
| 使用 CSS 變數 | `style={{ color: 'var(--text-title)' }}` |
| hover 狀態 | `onMouseEnter/Leave` inline |
| 靜態排版（間距、flex、grid）| Tailwind class |
| 固定數值圓角 | `rounded-[8px]`（Tailwind arbitrary） |

---

### 9-4 條件渲染

```tsx
// 空狀態
if (list.length === 0) return <EmptyState />;

// 編輯 / 檢視切換
if (isEditing) return <EditCard />;
return <ViewCard />;
```

---

*本規範依據 `LorebookModal.tsx` 實際程式碼整理，適用於 NewWorld 專案所有 UI 元件。*
*如有新增元件或設計變更，請同步更新本文件。*
