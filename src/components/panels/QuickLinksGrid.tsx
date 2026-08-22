import React from 'react';

interface QuickLinksGridProps {
  onOpenProfile: () => void;
  onOpenLorebook: () => void;
  onOpenSettings: () => void;
  onOpenSystemPrompt: () => void;
}

/**
 * 底部 2×2 快捷入口（個人資訊 / 故事集 / 系統 / Prompt）。
 * 桌面左欄與手機左抽屜共用。
 */
export const QuickLinksGrid: React.FC<QuickLinksGridProps> = ({
  onOpenProfile,
  onOpenLorebook,
  onOpenSettings,
  onOpenSystemPrompt,
}) => {
  const links = [
    { label: '個人資訊', action: onOpenProfile },
    { label: '故事集', action: onOpenLorebook },
    { label: '系統', action: onOpenSettings },
    { label: 'Prompt', action: onOpenSystemPrompt },
  ];

  return (
    <div
      className="rounded-[8px] p-2 mt-auto"
      style={{
        background: 'var(--bg-ui-card)',
        backdropFilter: 'blur(20px) saturate(150%)',
        WebkitBackdropFilter: 'blur(20px) saturate(150%)',
        border: '1px solid var(--tint-line)',
        boxShadow: 'var(--shadow-float)',
      }}
    >
      <div className="grid grid-cols-2 gap-1.5">
        {links.map(item => (
          <div
            key={item.label}
            className="p-1.5 rounded-[5px] cursor-pointer transition-all flex items-center justify-center"
            style={{ background: 'var(--tint-surface)', border: '1px solid var(--tint-line)' }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'var(--tint-surface-hover)';
              e.currentTarget.style.border = '1px solid var(--tint-line-strong)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'var(--tint-surface)';
              e.currentTarget.style.border = '1px solid var(--tint-line)';
            }}
            onClick={item.action}
          >
            <span className="flex items-center text-xs" style={{ color: 'var(--text-main)' }}>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

QuickLinksGrid.displayName = 'QuickLinksGrid';
