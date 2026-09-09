import React from 'react';
import { EquipmentItem, ItemCatalog } from '../../types';
import { describeItem } from '../../utils/itemCatalog';
import { ItemCard, ItemActionButton } from './ItemCard';

interface EquipmentListProps {
  /** 道具說明的唯一來源（實例上不再有 description，見 types.ts） */
  itemCatalog: ItemCatalog;
  equipment: EquipmentItem[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  onEquip: (item: EquipmentItem) => void;
  onUnequip: (item: EquipmentItem) => void;
  onDrop: (item: EquipmentItem) => void;
}

const neutralBg = 'color-mix(in srgb, var(--bg-elevated) 30%, transparent)';
const neutralBgHover = 'color-mix(in srgb, var(--bg-elevated) 60%, transparent)';
const dangerBg = 'color-mix(in srgb, var(--color-rose) 10%, transparent)';
const dangerBgHover = 'color-mix(in srgb, var(--color-rose) 20%, transparent)';

/**
 * 裝備清單內容（不含外框）。
 * 桌面浮動面板與手機 inline 展開共用——兩邊只有外層容器不同。
 * 卡片外殼與按鈕走 ItemCard，與消耗品清單同一份。
 */
export const EquipmentList: React.FC<EquipmentListProps> = ({
  itemCatalog,
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
        <ItemCard
          key={item.id}
          name={item.name}
          description={describeItem(itemCatalog, item.name)}
          isSelected={selectedId === item.id}
          onToggle={() => onSelect(selectedId === item.id ? null : item.id)}
        >
          <ItemActionButton
            label="裝備"
            bg={neutralBg} bgHover={neutralBgHover} color="var(--text-title)"
            onClick={e => { e.stopPropagation(); onEquip(item); onSelect(null); }}
          />
          <ItemActionButton
            label="卸下"
            bg={neutralBg} bgHover={neutralBgHover} color="var(--text-title)"
            onClick={e => { e.stopPropagation(); onUnequip(item); onSelect(null); }}
          />
          <ItemActionButton
            label="丟棄" bordered
            bg={dangerBg} bgHover={dangerBgHover} color="var(--text-danger)"
            onClick={e => { e.stopPropagation(); onDrop(item); onSelect(null); }}
          />
        </ItemCard>
      ))}
    </>
  );
};

EquipmentList.displayName = 'EquipmentList';
