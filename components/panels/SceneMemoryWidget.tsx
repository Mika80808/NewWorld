import React from 'react';
import { MapPin } from 'lucide-react';
import { MemoryEntry } from '../../types';

interface SceneMemoryWidgetProps {
  memories: MemoryEntry[];
  currentLocation: string;
}

/**
 * 右欄 Widget 3：場景 & 區域記憶（區域 / 場景 / NPC 三段）。
 * 桌面右欄與手機右抽屜共用。
 */
export const SceneMemoryWidget: React.FC<SceneMemoryWidgetProps> = ({ memories, currentLocation }) => {
  // 單趟走訪分三類，取代原本連續三次 memories.filter
  const regionMems: MemoryEntry[] = [];
  const sceneMems: MemoryEntry[] = [];
  const npcMems: MemoryEntry[] = [];
  for (const m of memories) {
    if (!m.isActive) continue;
    const locs = m.tags?.locations || [];
    if (m.type === 'region') {
      if (locs.length === 0 || locs.some(l => l === currentLocation)) regionMems.push(m);
    } else if (m.type === 'scene') {
      if (locs.some(l => l === currentLocation)) sceneMems.push(m);
    } else if (m.type === 'npc') {
      npcMems.push(m);
    }
  }

  return (
    <div
      className="rounded-[8px] border border-white/10 backdrop-blur-md p-4 shadow-xl transition-all duration-300"
      style={{ background: 'rgba(15,10,5,0.55)' }}
      onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 0 0 1px rgba(253,200,100,0.14), 0 8px 32px rgba(0,0,0,0.5)')}
      onMouseLeave={e => (e.currentTarget.style.boxShadow = '0 10px 32px rgba(0,0,0,0.4)')}
    >
      <div className="flex items-center gap-2 mb-4">
        <MapPin className="w-4 h-4 shrink-0" style={{ color: 'var(--color-amber)' }} />
        <span className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>場景記憶</span>
      </div>

      {/* 區域記憶 */}
      {regionMems.length > 0 && (
        <div className="mb-3">
          <p className="text-[0.625rem] uppercase tracking-widest mb-1.5 font-semibold" style={{ color: 'var(--text-muted)' }}>區域</p>
          <ul className="space-y-1.5">
            {regionMems.map(mem => (
              <li key={mem.id} className="flex items-start gap-2 text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                <span className="mt-1.5 w-1 h-1 rounded-full shrink-0" style={{ background: 'var(--color-amber)', opacity: 0.7 }} />
                <span>{mem.content}{mem.expiresAt && <em className="ml-1 opacity-60">（至 {mem.expiresAt}）</em>}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 場景記憶 */}
      <div className="mb-3">
        <p className="text-[0.625rem] uppercase tracking-widest mb-1.5 font-semibold" style={{ color: 'var(--text-muted)' }}>場景</p>
        {sceneMems.length > 0 ? (
          <ul className="space-y-1.5">
            {sceneMems.map(mem => (
              <li key={mem.id} className="flex items-start gap-2 text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                <span className="mt-1.5 w-1 h-1 rounded-full shrink-0" style={{ background: 'var(--color-sky)', opacity: 0.7 }} />
                <span>{mem.content}{mem.source === 'ai_generated' && <em className="ml-1 text-[0.625rem] opacity-50">AI</em>}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs pl-1" style={{ color: 'var(--text-muted)' }}>此場景尚無記憶...</p>
        )}
      </div>

      {/* NPC 記憶 */}
      {npcMems.length > 0 && (
        <div>
          <p className="text-[0.625rem] uppercase tracking-widest mb-1.5 font-semibold" style={{ color: 'var(--text-muted)' }}>NPC</p>
          <ul className="space-y-1.5">
            {npcMems.map(mem => (
              <li key={mem.id} className="flex items-start gap-2 text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                <span className="mt-1.5 w-1 h-1 rounded-full shrink-0" style={{ background: 'var(--color-emerald)', opacity: 0.7 }} />
                <span>
                  {mem.tags?.npcs?.length > 0 && (
                    <strong className="mr-1" style={{ color: 'var(--text-title)' }}>[{mem.tags.npcs.join(',')}]</strong>
                  )}
                  {mem.content}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

SceneMemoryWidget.displayName = 'SceneMemoryWidget';
