import React, { useMemo } from 'react';
import { Users, Heart } from 'lucide-react';
import { Npc, LorebookEntry } from '../../types';
import { affectionColor } from '../../utils/affectionColor';
import { resolveNpcProfile } from '../../utils/npcProfile';

const MAX_DISPLAYED = 8;

interface SceneNpcsWidgetProps {
  npcs: Npc[];
  appearingNpcs: string[];
  currentLocation: string;
  lorebookEntries: LorebookEntry[];
  onSelectNpc: (npc: Npc) => void;
}

/**
 * 右欄 Widget 2：當前場景人物。
 * 桌面右欄與手機右抽屜共用。
 */
export const SceneNpcsWidget: React.FC<SceneNpcsWidgetProps> = ({
  npcs,
  appearingNpcs,
  currentLocation,
  lorebookEntries,
  onSelectNpc,
}) => {
  const sceneNpcs = npcs.filter(n =>
    appearingNpcs.includes(n.name) ||
    n.location === currentLocation ||
    n.isPinned
  );
  const hiddenCount = Math.max(0, sceneNpcs.length - MAX_DISPLAYED);
  const displayedNpcs = sceneNpcs.slice(0, MAX_DISPLAYED);

  // NPC 設定集查表：取代每個 NPC 各跑一次 lorebookEntries.find 的 O(n×m)
  const npcLoreByTitle = useMemo(() => {
    const map = new Map<string, LorebookEntry>();
    for (const e of lorebookEntries) {
      if (e.category === 'NPC') map.set(e.title, e);
    }
    return map;
  }, [lorebookEntries]);

  return (
    <div
      className="rounded-[8px] border border-white/10 backdrop-blur-md p-4 shadow-xl transition-all duration-300"
      style={{ background: 'rgba(10,15,10,0.55)' }}
      onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 0 0 1px rgba(180,255,180,0.12), 0 8px 32px rgba(0,0,0,0.5)')}
      onMouseLeave={e => (e.currentTarget.style.boxShadow = '0 10px 32px rgba(0,0,0,0.4)')}
    >
      <div className="flex items-center gap-2 mb-4">
        <Users className="w-4 h-4 shrink-0" style={{ color: 'var(--text-title)' }} />
        <span className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>當前場景人物</span>
      </div>

      <div className="space-y-2">
        {sceneNpcs.length === 0 ? (
          <p className="text-xs pl-1" style={{ color: 'var(--text-muted)' }}>此處目前沒有人...</p>
        ) : (
          <>
            {displayedNpcs.map(npc => {
              const lore = npcLoreByTitle.get(npc.name);
              // 走共用入口：設定集條目沒填時退回 Npc 那份（與角色卡、prompt 一致）
              const { job: displayJob, gender: displayGender } = resolveNpcProfile(npc, lore);
              return (
                <div
                  key={npc.id}
                  className="backdrop-blur-md border border-white/5 p-2.5 rounded-[4px] flex justify-between items-center cursor-pointer transition-all duration-300 shadow-lg group/npc overflow-hidden relative hover:border-white/15"
                  onClick={() => onSelectNpc(npc)}
                >
                  <div className="absolute top-0 left-0 w-1 h-full opacity-0 group-hover/npc:opacity-40 transition-opacity" style={{ background: 'linear-gradient(to bottom, transparent, var(--bg-elevated), transparent)' }} />
                  <div className="flex flex-col">
                    <span className="text-sm font-medium" style={{ color: 'var(--text-title)' }}>{npc.name}</span>
                    <span className="text-xs uppercase tracking-tighter" style={{ color: 'var(--text-body)' }}>
                      {displayGender ? `${displayGender}・${displayJob}` : displayJob}
                    </span>
                  </div>
                  <div className="text-xs flex items-center px-2 py-1 rounded-full bg-black/20 border border-white/5" style={{ color: affectionColor(npc.affection) }}>
                    <Heart className="w-3 h-3 mr-1 fill-current" />
                    <span className="font-mono">{npc.affection}</span>
                  </div>
                </div>
              );
            })}
            {hiddenCount > 0 && (
              <div className="text-xs pl-1" style={{ color: 'var(--text-muted)' }}>
                ✦ 還有 {hiddenCount} 人未顯示...
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

SceneNpcsWidget.displayName = 'SceneNpcsWidget';
