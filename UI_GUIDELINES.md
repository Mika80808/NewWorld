# UI_GUIDELINES.md — 視覺與互動規範

> 此文件定義遊戲介面的視覺系統、間距、字體、顏色使用規則。  
> **所有 AI 執行 UI 改動前必須參照此規範。**

---

## 📐 版面結構

### 三欄布局尺寸
```tsx
<div className="flex h-screen">
  {/* 左欄 */}
  <aside className="w-52">  {/* 208px */}
    {/* 當前目標、冒險摘要、功能按鈕 */}
  </aside>

  {/* 中間對話區 */}
  <main className="flex-1">
    {/* 對話訊息、輸入框 */}
  </main>

  {/* 右欄 */}
  <aside className="w-80">  {/* 320px */}
    {/* 當前場景、NPC、記憶 */}
  </aside>
</div>
```

**尺寸理由：**
- 左欄 208px：功能按鈕文字較短，縮窄後增加中間對話區空間
- 右欄 320px：記憶卡片、NPC 資訊需要更多閱讀空間

---

## 🎨 毛玻璃效果系統

### CSS Variables 定義
```css
/* 加入 src/index.css 的 :root 區塊 */

/* ── 毛玻璃效果 ───────────────────────────────────────────── */
--glass-sidebar-bg:    rgba(12, 13, 13, 0.75);    /* 左右欄半透明底 */
--glass-sidebar-blur:  blur(16px);                /* 毛玻璃模糊度 */
--glass-border:        rgba(255, 255, 255, 0.08); /* 玻璃邊框 */

--glass-bubble-self:   rgba(20, 20, 20, 0.6);     /* 玩家對話泡泡 */
--glass-bubble-npc:    rgba(40, 40, 40, 0.7);     /* NPC 對話泡泡 */
--glass-bubble-blur:   blur(8px);                 /* 對話泡泡模糊度 */
```

### 應用方式

#### **左右欄容器**
```tsx
// 左欄
<div 
  className="w-52 flex flex-col gap-5 p-4"
  style={{
    background: 'var(--glass-sidebar-bg)',
    backdropFilter: 'var(--glass-sidebar-blur)',
    borderRight: '1px solid var(--glass-border)'
  }}
>

// 右欄
<div 
  className="w-80 flex flex-col gap-6 p-5"
  style={{
    background: 'var(--glass-sidebar-bg)',
    backdropFilter: 'var(--glass-sidebar-blur)',
    borderLeft: '1px solid var(--glass-border)'
  }}
>
```

#### **對話泡泡**
```tsx
// 玩家訊息
<div style={{
  background: 'var(--glass-bubble-self)',
  backdropFilter: 'var(--glass-bubble-blur)',
  border: '1px solid var(--glass-border)'
}}>

// NPC/GM 訊息
<div style={{
  background: 'var(--glass-bubble-npc)',
  backdropFilter: 'var(--glass-bubble-blur)',
  border: '1px solid var(--glass-border)'
}}>
```

---

## 📏 間距系統（Spacing Scale）

### Gap（區塊間距）
| Class | 尺寸 | 使用情境 |
|-------|------|----------|
| `gap-6` | 24px | Modal 內大區塊、右欄主要區塊間距 |
| `gap-5` | 20px | 左欄主要區塊間距 |
| `gap-4` | 16px | 對話區訊息間距、卡片內子區塊 |
| `gap-3` | 12px | 列表項目、小卡片內部 |
| `gap-2.5` | 10px | 左欄按鈕列表 |
| `gap-2` | 8px | 緊密元素（標籤組、徽章組） |

### Padding（內邊距）
| Class | 尺寸 | 使用情境 |
|-------|------|----------|
| `p-6` | 24px | Modal 外框容器 |
| `p-5` | 20px | 右欄容器 |
| `p-4` | 16px | 左欄容器、一般卡片 |
| `p-3` | 12px | 按鈕內邊距、小卡片 |
| `px-3 py-2.5` | 12px / 10px | 左欄功能按鈕 |

### Space-y（垂直堆疊間距）
| Class | 尺寸 | 使用情境 |
|-------|------|----------|
| `space-y-4` | 16px | 記憶卡片列表 |
| `space-y-3` | 12px | 折疊區塊內容 |
| `space-y-2.5` | 10px | 緊密按鈕列表 |
| `space-y-2` | 8px | 表單欄位 |

---

## 🔤 字體大小階梯

### 禁用規則
❌ **禁止使用 `text-xs` (12px)**  
理由：深色背景下可讀性極差，尤其是中文字體

### 字體大小對照表
| Class | 尺寸 | 使用情境 | 範例 |
|-------|------|----------|------|
| `text-2xl` | 24px | Modal 標題 | 「世界地圖」 |
| `text-xl` | 20px | 頁面大標題 | （目前未使用） |
| `text-lg` | 18px | Modal 副標題 | （目前未使用） |
| `text-base` | 16px | **對話內容、記憶卡片內文** ⭐ | 對話泡泡、記憶描述 |
| `text-sm` | 14px | 按鈕文字、標籤、小標題 | 「✦ 當前場景記憶」 |
| ~~`text-xs`~~ | ~~12px~~ | ❌ 禁用 | — |

### 字體使用規則

#### **對話區**
```tsx
// 玩家/NPC 對話內容
<p className="text-base leading-relaxed" style={{ color: 'var(--text-dialog-main)' }}>
  對話內容...
</p>

// 時間戳、系統訊息
<span className="text-sm" style={{ color: 'var(--text-muted)' }}>
  1824年 4月 15日 21:30
</span>
```

#### **左欄**
```tsx
// 功能按鈕
<button className="text-sm px-3 py-2.5">
  📖 任務日誌
</button>

// 折疊標題
<button className="text-sm font-bold">
  📋 當前目標
</button>
```

#### **右欄**
```tsx
// 區塊標題
<h3 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
  ✦ 當前場景記憶
</h3>

// 小標題（如月份名）
<h4 className="text-sm" style={{ color: 'var(--text-tab)' }}>
  📅 雙月之月
</h4>

// 記憶卡片內文 ⚠️ 重點改動
<p className="text-sm leading-relaxed" style={{ color: 'var(--text-body)' }}>
  {/* 原本是 text-xs，統一改為 text-sm */}
  月光特別明亮，彷彿被天一般...
</p>
```

#### **Modal**
```tsx
// Modal 標題
<h2 className="text-lg font-bold">世界地圖</h2>

// Modal 內文
<p className="text-base leading-relaxed">...</p>

// Modal 輔助文字
<span className="text-sm" style={{ color: 'var(--text-muted)' }}>提示資訊</span>
```

---

## 🎨 顏色使用對照表

### 背景層次
| 使用情境 | CSS Variable | Hex | 說明 |
|---------|--------------|-----|------|
| 主背景（body） | `#000000` | 純黑 | 預設全黑，未來可換背景圖 |
| 中間對話區 | `var(--bg-base)` | #0c0d0d | 極深灰（接近黑） |
| 左右欄（毛玻璃） | `var(--glass-sidebar-bg)` | rgba(12,13,13,0.75) | 半透明黑 |
| Modal 容器 | `var(--bg-elevated)` | #282929 | 深灰 |
| Modal 內卡片 | `var(--bg-ui-card)` | #353434 | 中灰 |
| 輸入框 | `var(--bg-sys-field)` | #454545 | 淺灰 |

### 文字顏色
| 使用情境 | CSS Variable | Hex | 對比度 |
|---------|--------------|-----|--------|
| 左右欄功能名稱 | `var(--text-primary)` | #e9d69e | 13.51:1 ✓ |
| Modal 標題、地名 | `var(--text-title)` | #ff11d7 | — |
| 分頁標題 | `var(--text-tab)` | #fff7e2 | — |
| 段落正文、記憶內文 | `var(--text-body)` | #fffaf1 | 11.94:1 ✓ |
| 對話內容、輸入文字 | `var(--text-main)` | #e8e8e9 | 11.91:1 ✓ |
| 提示文字、時間戳 | `var(--text-muted)` | #acacac | 8.57:1 ✓ |
| 狀態標籤（HP/MP） | `var(--text-stat-label)` | #bdb394 | 6.97:1 ✓ |
| 狀態數值 | `var(--text-stat-value)` | #fafafa | — |
| 危險動作 | `var(--text-danger)` | #ff5757 | — |

### 邊框與分隔
| 使用情境 | CSS Variable | Hex |
|---------|--------------|-----|
| 一般邊框 | `var(--border-default)` | #4e4e4e |
| 毛玻璃邊框 | `var(--glass-border)` | rgba(255,255,255,0.08) |
| 選中狀態邊框 | `var(--border-accent)` | #7e7c72 |

---

## 🔘 圓角系統

| Class | 尺寸 | 使用情境 |
|-------|------|----------|
| `rounded-[10px]` | 8px | Modal 外框、大卡片 |
| `rounded-[8px]` | 8px | 按鈕、輸入框、一般卡片 ⭐ 預設 |
| `rounded-[5px]` | 5px | 小標籤、徽章 |
| `rounded-full` | 全圓 | 圓形按鈕、頭像 |

**統一規則：**
- 所有按鈕預設 `rounded-[8px]`
- 所有卡片預設 `rounded-[8px]`
- 避免使用 `rounded-md` / `rounded-lg` 等 Tailwind 預設值

---

## 🚫 禁止事項

### 1. **顏色硬編碼**
```tsx
// ❌ 禁止
<div className="bg-[#24282d] text-[#fde68a]">
<div style={{ color: '#ff0000' }}>

// ✅ 正確
<div style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)' }}>
```

### 2. **使用 Tailwind 內建顏色 class**
```tsx
// ❌ 禁止
<div className="bg-gray-900 text-blue-400">

// ✅ 正確
<div style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)' }}>
```

### 3. **使用 text-xs**
```tsx
// ❌ 禁止
<p className="text-xs">記憶內容...</p>

// ✅ 正確
<p className="text-sm">記憶內容...</p>  // 最小使用 text-sm
<p className="text-base">記憶內容...</p>  // 主要內容使用 text-base
```

### 4. **混用間距值**
```tsx
// ❌ 避免
<div className="gap-[18px]">  // 不在階梯內的值

// ✅ 正確
<div className="gap-4">  // 使用標準階梯值
```

---

## 📋 左欄標準結構

```tsx
<div 
  className="w-52 flex flex-col gap-5 p-4"
  style={{
    background: 'var(--glass-sidebar-bg)',
    backdropFilter: 'var(--glass-sidebar-blur)',
    borderRight: '1px solid var(--glass-border)'
  }}
>
  {/* 折疊區塊 1：當前目標 */}
  <section>
    <button 
      className="w-full text-left px-3 py-2.5 text-sm rounded-[8px] flex items-center justify-between"
      style={{ background: 'var(--bg-ui-card)' }}
    >
      <span>📋 當前目標</span>
      <ChevronDown className="w-4 h-4" />
    </button>
    
    {/* 展開內容 */}
    {expanded && (
      <div className="mt-2 space-y-2 text-sm" style={{ color: 'var(--text-muted)' }}>
        {/* 目標列表 */}
      </div>
    )}
  </section>

  {/* 折疊區塊 2：冒險擷要 */}
  <section>
    {/* 同上結構 */}
  </section>

  {/* 功能按鈕列表 */}
  <div className="space-y-2.5">
    <button 
      className="w-full text-left px-3 py-2.5 text-sm rounded-[8px]"
      style={{ background: 'var(--bg-ui-card)', color: 'var(--text-primary)' }}
    >
      📖 任務日誌
    </button>
    <button className="w-full text-left px-3 py-2.5 text-sm rounded-[8px]">
      ⚔️ 裝備 (0)
    </button>
    <button className="w-full text-left px-3 py-2.5 text-sm rounded-[8px]">
      🧪 消耗品 (0)
    </button>
  </div>

  {/* 底部按鈕（推到最底） */}
  <div className="mt-auto space-y-2.5">
    <button className="w-full text-left px-3 py-2.5 text-sm rounded-[8px]">
      📔 日記
    </button>
  </div>
</div>
```

---

## 📋 右欄標準結構

```tsx
<div 
  className="w-80 flex flex-col gap-6 p-5"
  style={{
    background: 'var(--glass-sidebar-bg)',
    backdropFilter: 'var(--glass-sidebar-blur)',
    borderLeft: '1px solid var(--glass-border)'
  }}
>
  {/* 區塊 1：世界地圖 */}
  <section className="space-y-3">
    <button 
      className="w-full text-left px-4 py-3 text-base rounded-[8px] flex items-center justify-between"
      style={{ background: 'var(--bg-ui-card)', color: 'var(--text-primary)' }}
    >
      <span>🗺 世界地圖</span>
      <ExternalLink className="w-4 h-4" />
    </button>
  </section>

  {/* 區塊 2：當前場景人物 */}
  <section className="space-y-3">
    <h3 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
      ✦ 當前場景人物
    </h3>
    <p className="text-sm italic" style={{ color: 'var(--text-muted)' }}>
      此處目前沒有人...
    </p>
  </section>

  {/* 區塊 3：當前場景記憶 */}
  <section className="space-y-4">
    <h3 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
      ✦ 當前場景記憶
    </h3>

    {/* 世界記憶 */}
    <div>
      <h4 className="text-sm uppercase tracking-wider mb-3" style={{ color: 'var(--text-tab)' }}>
        ✦ 世界記憶
      </h4>
      <div 
        className="p-4 rounded-[8px]"
        style={{ 
          background: 'linear-gradient(135deg, #1e1477, var(--bg-elevated))',
          border: '1px solid rgba(255,255,255,0.1)'
        }}
      >
        <div className="flex items-start gap-2 mb-2">
          <Calendar className="w-4 h-4 shrink-0" style={{ color: 'var(--text-tab)' }} />
          <h5 className="text-sm font-bold" style={{ color: 'var(--text-tab)' }}>
            📅 雙月之月
          </h5>
        </div>
        <p className="text-sm leading-relaxed" style={{ color: 'var(--text-body)' }}>
          月光特別明亮，彷彿被天一般...
        </p>
      </div>
    </div>

    {/* 場景記憶 */}
    <div>
      <h4 className="text-sm uppercase tracking-wider mb-3" style={{ color: 'var(--text-tab)' }}>
        ✦ 場景記憶
      </h4>
      <p className="text-sm italic" style={{ color: 'var(--text-muted)' }}>
        此處暫無記憶...
      </p>
    </div>
  </section>
</div>
```

---

## 📋 對話區標準結構

```tsx
<div 
  className="flex-1 flex flex-col p-6"
  style={{ background: 'var(--bg-base)' }}
>
  {/* 訊息列表 */}
  <div className="flex-1 overflow-y-auto space-y-4 mb-6">
    {messages.map(msg => (
      <div key={msg.id} className={msg.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
        <div 
          className="max-w-[75%] px-4 py-3 rounded-[8px]"
          style={{
            background: msg.role === 'user' 
              ? 'var(--glass-bubble-self)' 
              : 'var(--glass-bubble-npc)',
            backdropFilter: 'var(--glass-bubble-blur)',
            border: '1px solid var(--glass-border)'
          }}
        >
          <p className="text-base leading-relaxed" style={{ color: 'var(--text-dialog-main)' }}>
            {msg.content}
          </p>
          <span className="text-sm mt-2 block" style={{ color: 'var(--text-muted)' }}>
            {msg.timestamp}
          </span>
        </div>
      </div>
    ))}
  </div>

  {/* 輸入區 */}
  <div className="flex gap-3">
    {/* 快捷按鈕 */}
    <button className="px-4 py-2.5 text-sm rounded-[8px]">觀察四周</button>
    <button className="px-4 py-2.5 text-sm rounded-[8px]">檢查背包</button>

    {/* 輸入框 */}
    <input 
      type="text"
      placeholder="輸入你的行動或對話..."
      className="flex-1 px-4 py-2.5 text-base rounded-[8px]"
      style={{
        background: 'var(--bg-sys-field)',
        color: 'var(--text-main)',
        border: '1px solid var(--border-default)'
      }}
    />
    
    {/* 發送按鈕 */}
    <button className="px-6 py-2.5 text-base rounded-[8px]">
      發送
    </button>
  </div>
</div>
```

---

## 🎯 改動檢查清單

執行 UI 改動時，請依序檢查：

- [ ] 顏色是否全部使用 CSS Variables？（無硬編碼、無 Tailwind color class）
- [ ] 間距是否符合標準階梯？（gap/p/space-y）
- [ ] 字體大小是否避免 text-xs？（最小 text-sm）
- [ ] 圓角是否統一使用 8px/10px/5px？（無 rounded-md/lg）
- [ ] 左欄是否為 w-52 (208px)？
- [ ] 右欄是否為 w-80 (320px)？
- [ ] 毛玻璃效果是否正確應用？（background + backdropFilter）
- [ ] 對話內容是否使用 text-base？（非 text-sm）
- [ ] 記憶卡片內文是否使用 text-base？（非 text-xs/text-sm）

---

## 📝 版本紀錄

- **2026-03-23**：初版建立
  - 定義三欄布局尺寸（左 208px / 右 320px）
  - 建立毛玻璃效果系統
  - 定義間距/字體/顏色階梯
  - 禁用 text-xs，記憶內文改為 text-base
