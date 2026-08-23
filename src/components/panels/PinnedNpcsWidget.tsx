import React from 'react';
import { Heart } from 'lucide-react';
import { Npc, LorebookEntry } from '../../types';
import { affectionColor } from '../../utils/affectionColor';
import { resolveNpcProfile, findNpcLore } from '../../utils/npcProfile';

interface PinnedNpcsWidgetProps {
  npcs: Npc[];
  /** 職業等身分欄位的唯一來源是設定集條目（schema v10），不在 Npc 上 */
  lorebookEntries: LorebookEntry[];
  onSelectNpc: (npc: Npc) => void;
}

/**
 * 「✦ 關注」：釘選 NPC 清單。無釘選時不渲染。
 * 桌面左欄與手機左抽屜共用。
 */
export const PinnedNpcsWidget: React.FC<PinnedNpcsWidgetProps> = ({ npcs, lorebookEntries, onSelectNpc }) => {
  const pinned = npcs.filter(n => n.isPinned);
  if (pinned.length === 0) return null;

  return (
    <div
      className="rounded-[8px] px-4 py-3 shadow-xl overflow-hidden"
      style={{
        background: 'color-mix(in srgb, var(--bg-elevated) 80%, transparent)',
        border: '1px solid color-mix(in srgb, var(--border-default) 60%, transparent)',
        backdropFilter: 'blur(24px) saturate(160%)',
        WebkitBackdropFilter: 'blur(24px) saturate(160%)',
      }}
    >
      <h3 className="font-bold mb-3 text-sm" style={{ color: 'var(--text-primary)' }}>✦ 關注</h3>
      <div className="space-y-2">
        {pinned.map(npc => (
          <div
            key={npc.id}
            className="backdrop-blur-md p-3 rounded-[10px] flex justify-between items-center cursor-pointer transition-all duration-300 shadow-md border border-[color:var(--tint-line)] relative overflow-hidden group/pinned"
            onClick={() => onSelectNpc(npc)}
          >
            <div className="absolute top-0 left-0 w-1 h-full opacity-40" style={{ background: 'var(--border-accent)' }} />
            <div>
              <div className="text-sm font-bold" style={{ color: 'var(--text-title)' }}>{npc.name}</div>
              <div className="text-sm uppercase tracking-tighter" style={{ color: 'var(--text-body)' }}>{resolveNpcProfile(findNpcLore(lorebookEntries, npc.name)).job}</div>
            </div>
            <div className="flex flex-col items-end">
              <div className="text-sm flex items-center bg-black/20 px-2 py-0.5 rounded-full border border-[color:var(--tint-line)]" style={{ color: affectionColor(npc.affection) }}>
                <Heart className="w-3 h-3 mr-1 fill-current" /> {npc.affection}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

PinnedNpcsWidget.displayName = 'PinnedNpcsWidget';
