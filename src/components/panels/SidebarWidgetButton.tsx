import React from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * 左欄的 Widget 開關按鈕（裝備／消耗品）。
 *
 * 同一顆按鈕先前在 App.tsx 出現四次——桌機側欄兩顆、手機抽屜兩顆，
 * 每一份都完整抄了一遍底色／邊框／hover／徽章的樣式，改一個顏色要改四個地方。
 *
 * 兩種版面只差兩件事，都收成 props：
 *   - 桌機要 `ref` 量位置好把浮動面板貼在按鈕旁邊（手機是就地展開，不需要）
 *   - 手機在右側多一個展開箭頭（桌機的面板在旁邊，箭頭沒有意義）
 */
interface SidebarWidgetButtonProps {
  icon: React.ReactNode;
  label: string;
  /** 徽章數字，0 或負數不顯示 */
  count: number;
  isOpen: boolean;
  onClick: () => void;
  /** 手機的就地展開版本顯示箭頭 */
  showChevron?: boolean;
}

/** 開啟與關閉兩種底色，hover 一律用開啟時那一階 */
const bg = (open: boolean) =>
  open
    ? 'color-mix(in srgb, var(--bg-elevated) 95%, transparent)'
    : 'color-mix(in srgb, var(--bg-elevated) 80%, transparent)';

export const SidebarWidgetButton = React.forwardRef<HTMLButtonElement, SidebarWidgetButtonProps>(
  function SidebarWidgetButton({ icon, label, count, isOpen, onClick, showChevron = false }, ref) {
    return (
      <button
        ref={ref}
        onClick={onClick}
        className="w-full rounded-[8px] px-4 py-3 shadow-xl flex items-center gap-3 transition-all"
        style={{
          background: bg(isOpen),
          border: `1px solid ${isOpen ? 'var(--border-accent)' : 'color-mix(in srgb, var(--border-default) 60%, transparent)'}`,
          backdropFilter: 'blur(24px) saturate(160%)',
          WebkitBackdropFilter: 'blur(24px) saturate(160%)',
        }}
        onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = bg(true)}
        onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = bg(isOpen)}
      >
        <div className="relative shrink-0">
          {icon}
          {count > 0 && (
            <span
              className="absolute -top-1.5 -right-2 text-[0.625rem] font-bold px-1 min-w-[16px] text-center rounded-full"
              style={{ background: 'var(--tab-active)', color: 'var(--btn--text)', lineHeight: '16px' }}
            >
              {count}
            </span>
          )}
        </div>
        <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{label}</span>
        {showChevron && (
          <ChevronDown
            className="w-3.5 h-3.5 ml-auto"
            style={{
              color: 'var(--text-muted)',
              transform: isOpen ? 'rotate(180deg)' : 'none',
              transition: 'transform 0.2s',
            }}
          />
        )}
      </button>
    );
  }
);
