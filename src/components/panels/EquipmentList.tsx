import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { EquipmentItem } from '../../types';

interface EquipmentListProps {
  equipment: EquipmentItem[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  onEquip: (item: EquipmentItem) => void;
  onUnequip: (item: EquipmentItem) => void;
  onDrop: (item: EquipmentItem) => void;
}

const actionBtn = 'flex-1 text-sm py-1.5 rounded-[8px] transition font-medium';
const neutralBg = 'color-mix(in srgb, var(--bg-elevated) 30%, transparent)';
const neutralBgHover = 'color-mix(in srgb, var(--bg-elevated) 60%, transparent)';
const dangerBg = 'color-mix(in srgb, var(--color-rose) 10%, transparent)';
const dangerBgHover = 'color-mix(in srgb, var(--color-rose) 20%, transparent)';

/**
 * 裝備清單內容（不含外框）。
 * 桌面浮動面板與手機 inline 展開共用——兩邊只有外層容器不同。
 */
export const EquipmentList: React.FC<EquipmentListProps> = ({
  equipment,
  selectedId,
  onSelect,
  onEquip,
  onUnequip,
  onDrop,
}) => {
  if (equipment.length === 0) {
    return <div className="text-center text-sm py-8" style={{ color: 'var(--text-muted)' }}>背包空空如也...</div>;
  }

  return (
    <>
      {equipment.map(item => (
        <div
          key={item.id}
          className="p-2.5 rounded-[8px] border cursor-pointer transition-all"
          style={{ borderColor: 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)' }}
          onClick={() => onSelect(selectedId === item.id ? null : item.id)}
        >
          <div className="flex justify-between items-center mb-1">
            <span className="text-sm font-medium" style={{ color: 'var(--text-title)' }}>{item.name}</span>
          </div>
          <div className="text-sm leading-relaxed" style={{ color: 'color-mix(in srgb, var(--text-body) 80%, transparent)' }}>{item.description}</div>
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
                  style={{ background: neutralBg, color: 'var(--text-title)' }}
                  onMouseEnter={e => e.currentTarget.style.background = neutralBgHover}
                  onMouseLeave={e => e.currentTarget.style.background = neutralBg}
                  onClick={e => { e.stopPropagation(); onEquip(item); onSelect(null); }}
                >
                  裝備
                </button>
                <button
                  className={actionBtn}
                  style={{ background: neutralBg, color: 'var(--text-title)' }}
                  onMouseEnter={e => e.currentTarget.style.background = neutralBgHover}
                  onMouseLeave={e => e.currentTarget.style.background = neutralBg}
                  onClick={e => { e.stopPropagation(); onUnequip(item); onSelect(null); }}
                >
                  卸下
                </button>
                <button
                  className={`border ${actionBtn}`}
                  style={{ background: dangerBg, color: 'var(--text-danger)', borderColor: dangerBgHover }}
                  onMouseEnter={e => e.currentTarget.style.background = dangerBgHover}
                  onMouseLeave={e => e.currentTarget.style.background = dangerBg}
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

EquipmentList.displayName = 'EquipmentList';
