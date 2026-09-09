import React from 'react';
import { ItemEntry, ItemCatalog } from '../../types';
import { describeItem } from '../../utils/itemCatalog';
import { ItemCard, ItemActionButton } from './ItemCard';

interface ConsumableListProps {
  /** 道具說明的唯一來源（實例上不再有 description，見 types.ts） */
  itemCatalog: ItemCatalog;
  items: ItemEntry[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  onUse: (item: ItemEntry) => void;
  onDrop: (item: ItemEntry) => void;
}

const useBg = 'color-mix(in srgb, var(--color-emerald) 10%, transparent)';
const useBgHover = 'color-mix(in srgb, var(--color-emerald) 20%, transparent)';
const dropBg = 'color-mix(in srgb, var(--color-rose) 10%, transparent)';
const dropBgHover = 'color-mix(in srgb, var(--color-rose) 20%, transparent)';

/**
 * 消耗品清單內容（不含外框）。
 * 桌面浮動面板與手機 inline 展開共用——兩邊只有外層容器不同。
 * 卡片外殼與按鈕走 ItemCard，與裝備清單同一份。
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
        <ItemCard
          key={item.id}
          name={item.name}
          quantity={item.quantity}
          description={describeItem(itemCatalog, item.name)}
          isSelected={selectedId === item.id}
          onToggle={() => onSelect(selectedId === item.id ? null : item.id)}
        >
          {/* ⚠️ 先 onSelect(null) 再 onUse：使用道具會把文字寫進輸入框草稿，
              收合動作要在那之前跑完，否則展開狀態會殘留在剛被扣掉的項目上 */}
          <ItemActionButton
            label="使用" bordered
            bg={useBg} bgHover={useBgHover} color="var(--color-emerald)"
            onClick={e => { e.stopPropagation(); onSelect(null); onUse(item); }}
          />
          <ItemActionButton
            label="丟棄" bordered
            bg={dropBg} bgHover={dropBgHover} color="var(--text-danger)"
            onClick={e => { e.stopPropagation(); onDrop(item); onSelect(null); }}
          />
        </ItemCard>
      ))}
    </>
  );
};

ConsumableList.displayName = 'ConsumableList';
