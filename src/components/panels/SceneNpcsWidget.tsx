import React, { useMemo } from 'react';
import { Users, Heart } from 'lucide-react';
import { Npc, LorebookEntry } from '../../types';
import { affectionColor } from '../../utils/affectionColor';
import { resolveNpcProfile } from '../../utils/npcProfile';
import { isNpcOnStage, resolveOnStageNames } from '../../utils/npcPresence';

const MAX_DISPLAYED = 8;

interface SceneNpcsWidgetProps {
  npcs: Npc[];
  appearingNpcs: string[];
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
  lorebookEntries,
  onSelectNpc,
}) => {
  // 在場與否只認 appearingNpcs（`[出場:]` 標記）＋ 隨行同伴。
  // 先前還 or 了 `n.location === currentLocation` 與 `n.isPinned`：
  // 前者是退場時從不清除的足跡，後者不管人在哪個城鎮都成立——
  // 兩條都會讓已經下台的角色賴在「當前場景人物」裡。詳見 utils/npcPresence.ts
  //
  // 隨行同伴是例外，而且是**明確設定**的例外：玩家把人設成常駐在身邊，
  // 他就該一直在這份名單上——prompt 那頭也是這樣算的，兩邊必須一致，
  // 否則會出現「GM 當他在場、UI 說此處沒有人」的分歧
  const onStage = resolveOnStageNames(npcs, appearingNpcs);
  const sceneNpcs = npcs.filter(n => isNpcOnStage(n.name, onStage));
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
      // 底色走 CSS 變數而非硬編碼 rgba：先前寫死 rgba(10,15,10,0.55)，
      // 換主題時整塊維持深灰、文字變成深底深字完全看不見（顏色規則存在的理由）
      className="tactile-raised tactile-paper rounded-[8px] p-4 shadow-xl transition-all duration-300"
      style={{ background: 'var(--bg-glass-right)', border: 'var(--border-width) solid var(--border-default)' }}
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
              const { job: displayJob, gender: displayGender } = resolveNpcProfile(lore);
              return (
                <div
                  key={npc.id}
                  className="tactile-raised p-2.5 rounded-[8px] flex justify-between items-center cursor-pointer transition-all duration-300 group/npc relative"
                  style={{ background: 'var(--bg-ui-card)', border: 'var(--border-width) solid var(--border-default)' }}
                  onClick={() => onSelectNpc(npc)}
                >
                  <div className="absolute top-0 left-0 w-1 h-full opacity-0 group-hover/npc:opacity-40 transition-opacity" style={{ background: 'linear-gradient(to bottom, transparent, var(--bg-elevated), transparent)' }} />
                  <div className="flex flex-col">
                    <span className="text-sm font-medium" style={{ color: 'var(--text-title)' }}>{npc.name}</span>
                    <span className="text-xs uppercase tracking-tighter" style={{ color: 'var(--text-body)' }}>
                      {displayGender ? `${displayGender}・${displayJob}` : displayJob}
                    </span>
                  </div>
                  {/* 好感度做成凹陷的小井——新擬態靠凹凸區分層級，不靠色塊 */}
                  <div className="tactile-sunken text-xs flex items-center px-2.5 py-1 rounded-full shrink-0"
                    style={{ color: affectionColor(npc.affection), background: 'var(--bg-sys-field)', border: 'var(--border-width) solid var(--border-default)' }}>
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
