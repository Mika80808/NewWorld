import React from 'react';
import { motion, AnimatePresence } from 'motion/react';

/**
 * 背包／消耗品清單的卡片外殼。
 *
 * `EquipmentList` 與 `ConsumableList` 先前各寫一份完全相同的殼：
 * 邊框、點一下展開、名稱列、說明文字、展開動畫與分隔線。兩者真正的差別只有
 * 右上角的數量徽章（只有消耗品有）與展開後的那排按鈕，都收成 props / children。
 */
interface ItemCardProps {
  name: string;
  /** 只有消耗品有數量，裝備不顯示 */
  quantity?: number;
  description: string;
  isSelected: boolean;
  onToggle: () => void;
  /** 展開後的操作按鈕 */
  children: React.ReactNode;
}

export const ItemCard: React.FC<ItemCardProps> = ({
  name,
  quantity,
  description,
  isSelected,
  onToggle,
  children,
}) => (
  <div
    className="p-2.5 rounded-[8px] border cursor-pointer transition-all"
    style={{ borderColor: 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)' }}
    onClick={onToggle}
  >
    <div className="flex justify-between items-center mb-1">
      <span className="text-sm font-medium" style={{ color: 'var(--text-title)' }}>{name}</span>
      {quantity != null && (
        <span
          className="text-sm font-mono px-1.5 py-0.5 rounded-[8px]"
          style={{ background: 'var(--bg-elevated)', color: 'var(--text-body)' }}
        >
          x{quantity}
        </span>
      )}
    </div>
    <div
      className="text-sm leading-relaxed"
      style={{ color: 'color-mix(in srgb, var(--text-body) 80%, transparent)' }}
    >
      {description}
    </div>
    <AnimatePresence>
      {isSelected && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="flex space-x-2 mt-2.5 pt-2.5 overflow-hidden"
          style={{ borderTop: '1px solid color-mix(in srgb, var(--bg-elevated) 50%, transparent)' }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  </div>
);

/**
 * 卡片展開後的操作按鈕（裝備／卸下／使用／丟棄）。
 *
 * 五顆按鈕先前各自重寫一次 hover 的 onMouseEnter/onMouseLeave 配對——
 * 這種成對的 inline handler 最容易只改一邊而留下 hover 卡住的顏色。
 *
 * `bordered` 是原本就有的差異：裝備／卸下沒有邊框，會變動狀態的
 * 使用／丟棄有邊框，用來提示這一顆按下去會真的改到東西。
 */
interface ItemActionButtonProps {
  label: string;
  /** 底色與其懸停態，一律走 CSS 變數的 color-mix */
  bg: string;
  bgHover: string;
  color: string;
  bordered?: boolean;
  onClick: (e: React.MouseEvent) => void;
}

export const ItemActionButton: React.FC<ItemActionButtonProps> = ({
  label, bg, bgHover, color, bordered = false, onClick,
}) => (
  <button
    className={`flex-1 text-sm py-1.5 rounded-[8px] transition font-medium${bordered ? ' border' : ''}`}
    style={{ background: bg, color, ...(bordered ? { borderColor: bgHover } : {}) }}
    onMouseEnter={e => e.currentTarget.style.background = bgHover}
    onMouseLeave={e => e.currentTarget.style.background = bg}
    onClick={onClick}
  >
    {label}
  </button>
);
