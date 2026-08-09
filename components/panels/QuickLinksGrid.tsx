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
        background: 'rgba(0,0,0,0.58)',
        backdropFilter: 'blur(20px) saturate(150%)',
        WebkitBackdropFilter: 'blur(20px) saturate(150%)',
        border: '1px solid rgba(255,255,255,0.07)',
        boxShadow: '0 4px 20px rgba(0,0,0,0.55)',
      }}
    >
      <div className="grid grid-cols-2 gap-1.5">
        {links.map(item => (
          <div
            key={item.label}
            className="p-1.5 rounded-[5px] cursor-pointer transition-all flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.10)';
              e.currentTarget.style.border = '1px solid rgba(255,255,255,0.12)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
              e.currentTarget.style.border = '1px solid rgba(255,255,255,0.06)';
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
