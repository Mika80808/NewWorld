import React from 'react';
import { Sparkles, Calendar } from 'lucide-react';
import { MemoryEntry } from '../../types';

interface WorldMemoryWidgetProps {
  memories: MemoryEntry[];
  monthElegant: string;
  monthDesc: string;
}

/**
 * 右欄 Widget 1：世界記憶（月份事件卡 + world 類記憶列表）。
 * 桌面右欄與手機右抽屜共用。
 */
export const WorldMemoryWidget: React.FC<WorldMemoryWidgetProps> = ({ memories, monthElegant, monthDesc }) => {
  const worldMems = memories.filter(m => m.type === 'world' && m.isActive);

  return (
    <div
      className="rounded-[8px] border border-[color:var(--tint-line)] backdrop-blur-md p-4 shadow-xl transition-all duration-300 group/wm"
      style={{ background: 'var(--bg-ui-card)' }}
      onMouseEnter={e => (e.currentTarget.style.boxShadow = 'var(--ring-accent), var(--shadow-float)')}
      onMouseLeave={e => (e.currentTarget.style.boxShadow = 'var(--shadow-float)')}
    >
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="w-4 h-4 shrink-0" style={{ color: 'var(--color-amber)' }} />
        <span className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>世界記憶</span>
      </div>

      {/* 月份事件卡 */}
      <div className="rounded-[4px] border border-[color:var(--tint-line)] shadow-[var(--shadow-float)] backdrop-blur-md relative overflow-hidden mb-3" style={{ background: 'linear-gradient(135deg, color-mix(in srgb, var(--color-violet) 40%, var(--bg-elevated)), var(--bg-elevated))' }}>
        <div className="absolute -right-6 -bottom-6 opacity-10 group-hover/wm:opacity-20 transition-all duration-700 rotate-12 group-hover/wm:scale-110">
          <Sparkles className="w-[72px] h-[72px]" style={{ color: 'var(--text-body)' }} />
        </div>
        <div className="absolute top-0 left-0 w-full h-[1px]" style={{ background: 'linear-gradient(to right, transparent, var(--tint-line-strong), transparent)' }} />
        <div className="px-4 py-2.5 relative z-10">
          <div className="flex items-center gap-2 mb-1.5">
            <div className="p-1.5 rounded-[8px] border border-[color:var(--tint-line)]" style={{ background: 'var(--tint-surface)' }}>
              <Calendar className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />
            </div>
            <span className="text-xs font-bold tracking-[0.15em] uppercase" style={{ color: 'var(--text-body)' }}>{monthElegant}</span>
          </div>
          <p className="text-xs leading-relaxed font-light pl-1" style={{ color: 'color-mix(in srgb, var(--text-body) 85%, transparent)', borderLeft: '1px solid var(--tint-line-strong)' }}>
            {monthDesc}
          </p>
        </div>
      </div>

      {/* world 記憶列表 */}
      <div className="space-y-1.5">
        {worldMems.map(mem => (
          <div key={mem.id} className="flex items-start gap-2 text-xs leading-relaxed py-1 pl-2" style={{ borderLeft: '2px solid var(--border-default)' }}>
            {mem.importance === 'critical' && <Sparkles className="w-3 h-3 mt-0.5 shrink-0" style={{ color: 'var(--color-amber)' }} />}
            <span style={{ color: 'var(--text-muted)' }}>{mem.content}</span>
          </div>
        ))}
        {worldMems.length === 0 && (
          <p className="text-xs pl-1" style={{ color: 'var(--text-muted)' }}>尚無世界記憶</p>
        )}
      </div>
    </div>
  );
};

WorldMemoryWidget.displayName = 'WorldMemoryWidget';
