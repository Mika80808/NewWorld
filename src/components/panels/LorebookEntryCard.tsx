import React from 'react';
import { CheckSquare, Square } from 'lucide-react';
import { LorebookEntry } from '../../types';

/**
 * 設定集的唯讀卡片（點一下進入編輯）。
 *
 * 「通用 Grid」與「地點 Grid」先前各寫一份幾乎逐字相同的 75 行，
 * 而且已經漂開了一處：通用版把次要關鍵字加上 `+` 前綴以示區別，
 * 地點版把主要與次要混在一起、看不出差異。這裡統一採用**通用版**的做法——
 * `selective` 的次要關鍵字要能一眼看出來，否則玩家分不清哪些是「必須同時命中」的。
 */
interface LorebookEntryCardProps {
  entry: LorebookEntry;
  onEdit: (id: number) => void;
  onToggleActive: (id: number, isActive: boolean) => void;
}

/** 關鍵字膠囊。次要關鍵字（selective）以 `+` 前綴標示 */
const KeywordChip: React.FC<{ text: string }> = ({ text }) => (
  <span
    className="px-1.5 py-0.5 rounded-full border"
    style={{
      fontSize: '12px',
      background: 'color-mix(in srgb, var(--bg-sys-tag) 30%, transparent)',
      borderColor: 'color-mix(in srgb, var(--bg-sys-tag) 50%, transparent)',
      color: 'var(--text-body)',
    }}
  >
    {text}
  </span>
);

export const LorebookEntryCard: React.FC<LorebookEntryCardProps> = ({
  entry,
  onEdit,
  onToggleActive,
}) => {
  const primary = entry.keywords || [];
  const secondary = entry.selective ? (entry.secondaryKeys || []) : [];

  return (
    <div
      onClick={() => onEdit(entry.id)}
      className="backdrop-blur-sm rounded-[8px] p-3 cursor-pointer transition-colors border relative"
      style={{
        background: 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)',
        borderColor: 'var(--border-default)',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-accent)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-default)'; }}
    >
      {/* 左側內容：標題 + 關鍵字 + 敍述（預留右邊空間給勾選框） */}
      <div className="pr-8">
        {/* 標題（20px） */}
        <span className="text-lg font-bold leading-snug" style={{ color: 'var(--text-title)' }}>
          {entry.title || '未命名'}
        </span>

        {/* 關鍵字膠囊（12px，有才顯示） */}
        {primary.length + secondary.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1 mb-1.5">
            {primary.map(kw => <KeywordChip key={kw} text={kw} />)}
            {secondary.map(kw => <KeywordChip key={`+${kw}`} text={`+${kw}`} />)}
          </div>
        )}

        {/* 描述文字（16px） */}
        <p className="leading-relaxed line-clamp-2 text-base" style={{ color: 'var(--text-body)' }}>
          {entry.content || (
            <span className="italic" style={{ color: 'var(--text-muted)' }}>點擊以新增簡介...</span>
          )}
        </p>
      </div>

      {/* 右上角：勾選框（絕對定位） */}
      <button
        onClick={e => {
          e.stopPropagation();
          onToggleActive(entry.id, !entry.isActive);
        }}
        className="absolute top-3 right-3 shrink-0 transition"
        style={{ color: entry.isActive ? 'var(--text-primary)' : 'var(--text-muted)' }}
        title={entry.isActive ? 'AI 將讀取此設定' : 'AI 不讀取此設定'}
      >
        {entry.isActive
          ? <CheckSquare className="w-4 h-4" />
          : <Square className="w-4 h-4" />}
      </button>
    </div>
  );
};
