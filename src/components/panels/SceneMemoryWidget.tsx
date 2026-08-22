import React from 'react';
import { MapPin } from 'lucide-react';
import { MemoryEntry } from '../../types';

interface SceneMemoryWidgetProps {
  memories: MemoryEntry[];
  currentLocation: string;
}

/**
 * 右欄 Widget 3：場景 & 區域記憶（區域 / 場景 兩段）。
 * 桌面右欄與手機右抽屜共用。
 *
 * ⚠️ 這裡刻意不顯示 `type === 'npc'` 的記憶。這個 Widget 講的是「你現在站的地方」，
 * 而 NPC 記憶沒有地點條件（先前那一段完全不過濾 currentLocation），
 * 於是跨場景的角色對話會一路累積在這裡，把真正的場景記憶擠掉。
 * 角色相關的內容看 NPC 卡片的記憶庫；npc 記憶本身照常存在、照常注入 prompt。
 */
export const SceneMemoryWidget: React.FC<SceneMemoryWidgetProps> = ({ memories, currentLocation }) => {
  // 單趟走訪分兩類，取代原本連續兩次 memories.filter
  const regionMems: MemoryEntry[] = [];
  const sceneMems: MemoryEntry[] = [];
  for (const m of memories) {
    if (!m.isActive) continue;
    const locs = m.tags?.locations || [];
    if (m.type === 'region') {
      if (locs.length === 0 || locs.some(l => l === currentLocation)) regionMems.push(m);
    } else if (m.type === 'scene') {
      if (locs.some(l => l === currentLocation)) sceneMems.push(m);
    }
  }

  return (
    <div
      className="rounded-[8px] border border-[color:var(--tint-line)] backdrop-blur-md p-4 shadow-xl transition-all duration-300"
      style={{ background: 'var(--bg-ui-card)' }}
      onMouseEnter={e => (e.currentTarget.style.boxShadow = 'var(--ring-accent), var(--shadow-float)')}
      onMouseLeave={e => (e.currentTarget.style.boxShadow = 'var(--shadow-float)')}
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
      <div>
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
    </div>
  );
};

SceneMemoryWidget.displayName = 'SceneMemoryWidget';
