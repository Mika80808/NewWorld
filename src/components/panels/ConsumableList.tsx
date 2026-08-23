import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ItemEntry, ItemCatalog } from '../../types';
import { describeItem } from '../../utils/itemCatalog';

interface ConsumableListProps {
  /** 道具說明的唯一來源（實例上不再有 description，見 types.ts） */
  itemCatalog: ItemCatalog;
  items: ItemEntry[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  onUse: (item: ItemEntry) => void;
  onDrop: (item: ItemEntry) => void;
}

const actionBtn = 'flex-1 border text-sm py-1.5 rounded-[8px] transition font-medium';
const useBg = 'color-mix(in srgb, var(--color-emerald) 10%, transparent)';
const useBgHover = 'color-mix(in srgb, var(--color-emerald) 20%, transparent)';
const dropBg = 'color-mix(in srgb, var(--color-rose) 10%, transparent)';
const dropBgHover = 'color-mix(in srgb, var(--color-rose) 20%, transparent)';

/**
 * 消耗品清單內容（不含外框）。
 * 桌面浮動面板與手機 inline 展開共用——兩邊只有外層容器不同。
 */
export const ConsumableList: React.FC<ConsumableListProps> = ({
  itemCatalog,
  items,
  selectedId,
  onSelect,
  onUse,
  onDrop,
}) => {
  if (items.length === 0) {
    return <div className="text-center text-sm py-8" style={{ color: 'var(--text-muted)' }}>沒有任何消耗品...</div>;
  }

  return (
    <>
      {items.map(item => (
        <div
          key={item.id}
          className="p-2.5 rounded-[8px] border cursor-pointer transition-all"
          style={{ borderColor: 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)' }}
          onClick={() => onSelect(selectedId === item.id ? null : item.id)}
        >
          <div className="flex justify-between items-center mb-1">
            <span className="text-sm font-medium" style={{ color: 'var(--text-title)' }}>{item.name}</span>
            <span className="text-sm font-mono px-1.5 py-0.5 rounded-[8px]" style={{ background: 'var(--bg-elevated)', color: 'var(--text-body)' }}>x{item.quantity}</span>
          </div>
          <div className="text-sm leading-relaxed" style={{ color: 'color-mix(in srgb, var(--text-body) 80%, transparent)' }}>{describeItem(itemCatalog, item.name)}</div>
          <AnimatePresence>
            {selectedId === item.id && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="flex space-x-2 mt-2.5 pt-2.5 overflow-hidden"
                style={{ borderTop: '1px solid color-mix(in srgb, var(--bg-elevated) 50%, transparent)' }}
              >
                <button
                  className={actionBtn}
                  style={{ background: useBg, color: 'var(--color-emerald)', borderColor: useBgHover }}
                  onMouseEnter={e => e.currentTarget.style.background = useBgHover}
                  onMouseLeave={e => e.currentTarget.style.background = useBg}
                  onClick={e => { e.stopPropagation(); onSelect(null); onUse(item); }}
                >
                  使用
                </button>
                <button
                  className={actionBtn}
                  style={{ background: dropBg, color: 'var(--text-danger)', borderColor: dropBgHover }}
                  onMouseEnter={e => e.currentTarget.style.background = dropBgHover}
                  onMouseLeave={e => e.currentTarget.style.background = dropBg}
                  onClick={e => { e.stopPropagation(); onDrop(item); onSelect(null); }}
                >
                  丟棄
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ))}
    </>
  );
};

ConsumableList.displayName = 'ConsumableList';
