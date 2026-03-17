import React from 'react';
import { Users, BookPlus, Pin, Heart, User, Book, Trash2, Lock } from 'lucide-react';

import { Npc } from '../types';

interface NpcModalProps {
  selectedNpc: Npc | null;
  onClose: () => void;
  onRecordNpc: (npc: Npc) => void;
  onTogglePinNpc: (id: number) => void;
  onAddNpcMemory: (id: number, memory: string) => void;
  onRemoveNpcMemory: (id: number, index: number) => void;
}

export const NpcModal: React.FC<NpcModalProps> = ({
  selectedNpc,
  onClose,
  onRecordNpc,
  onTogglePinNpc,
  onAddNpcMemory,
  onRemoveNpcMemory,
}) => {
  if (!selectedNpc) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#0d1f3c]/70 backdrop-blur-xl w-full max-w-md rounded-[8px] shadow-[0_0_40px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden text-[#e2eaf8] border border-white/10 relative">
        <div className="p-4 border-b border-white/5 flex justify-between items-center bg-[#0d1f3c]/50">
          <h2 className="text-lg font-bold flex items-center text-[#e6bf55]"><Users className="w-5 h-5 mr-2 text-[#e6bf55]" /> 人物 資訊</h2>
          <div className="flex items-center space-x-3">
            <button 
              className="transition text-[#3a5a8a] hover:text-[#e6bf55]"
              onClick={() => onRecordNpc(selectedNpc)}
              title="記下此人 (加入設定集)"
            >
              <BookPlus className="w-5 h-5" />
            </button>
            <button 
              className={`transition ${selectedNpc.isPinned ? 'text-[#e6bf55] hover:text-amber-300' : 'text-[#3a5a8a] hover:text-[#8ab4e8]'}`}
              onClick={() => onTogglePinNpc(selectedNpc.id)}
              title={selectedNpc.isPinned ? "取消釘選" : "釘選至個人資訊"}
            >
              <Pin className={`w-5 h-5 ${selectedNpc.isPinned ? 'fill-current' : ''}`} />
            </button>
            <button 
              className="text-[#3a5a8a] hover:text-[#e2eaf8] transition"
              onClick={onClose}
            >
              ✕
            </button>
          </div>
        </div>
        
        <div className="p-6 space-y-6 overflow-y-auto max-h-[70vh]">
          <div className="border-b border-[#2a4a7f] pb-4 space-y-1">
            <h3 className="text-2xl font-bold text-[#e2eaf8]">
              {selectedNpc.name}
              <span className="text-[#8ab4e8] text-sm font-normal ml-2">｜ {selectedNpc.job}</span>
            </h3>
            <p className="text-[#8ab4e8] text-sm flex items-center gap-2">
              <span>{selectedNpc.relationship || '關係未知'}</span>
              <span className="text-[#2a4a7f]">｜</span>
              <span className={`flex items-center font-bold ${selectedNpc.affection >= 80 ? 'text-emerald-400' : selectedNpc.affection >= 50 ? 'text-[#8ab4e8]' : 'text-rose-400'}`}>
                <Heart className="w-3.5 h-3.5 mr-1 fill-current" /> {selectedNpc.affection}
                <span className="text-[#8ab4e8] font-normal text-xs ml-1">({selectedNpc.affectionLabel})</span>
              </span>
            </p>
            <p className="text-[#8ab4e8] text-xs">
              上次見面：{selectedNpc.lastSeenLocation || '未知地點'}・{selectedNpc.lastSeenDate || '未知日期'}
            </p>
          </div>

          <div>
            <h4 className="text-xs text-[#8ab4e8] mb-2 uppercase tracking-wider flex items-center"><User className="w-3.5 h-3.5 mr-1.5" /> 外貌特徵</h4>
            <p className="text-sm text-[#8ab4e8] leading-relaxed bg-[#0d1f3c]/40 backdrop-blur-sm p-4 rounded-2xl border border-white/5 shadow-inner break-words whitespace-pre-wrap">
              {selectedNpc.appearance}
            </p>
          </div>

          <div>
            <h4 className="text-xs text-[#8ab4e8] mb-2 uppercase tracking-wider flex items-center"><Book className="w-3.5 h-3.5 mr-1.5" /> 個性描述</h4>
            <p className="text-sm text-[#8ab4e8] leading-relaxed bg-[#0d1f3c]/40 backdrop-blur-sm p-4 rounded-2xl border border-white/5 shadow-inner break-words whitespace-pre-wrap">
              {selectedNpc.personality}
            </p>
          </div>

          {selectedNpc.other && (
            <div>
              <h4 className="text-xs text-[#8ab4e8] mb-2 uppercase tracking-wider flex items-center"><Book className="w-3.5 h-3.5 mr-1.5" /> 其他備註</h4>
              <p className="text-sm text-[#8ab4e8] leading-relaxed bg-[#0d1f3c]/40 backdrop-blur-sm p-4 rounded-2xl border border-white/5 shadow-inner break-words whitespace-pre-wrap">
                {selectedNpc.other}
              </p>
            </div>
          )}

          <div className="mt-6 border-t border-white/5 pt-6">
            <h4 className="text-xs text-[#8ab4e8] mb-4 uppercase tracking-wider flex items-center">
              <span className="mr-1.5">💭</span> 角色想法
            </h4>
            <div className="space-y-3">
              {selectedNpc.thoughts && selectedNpc.thoughts.length > 0 ? (
                selectedNpc.thoughts.map((thought, index) => {
                  const opacities = [1, 0.85, 0.7, 0.55, 0.4];
                  const opacity = opacities[Math.min(index, opacities.length - 1)];
                  return (
                    <div 
                      key={index} 
                      className="bg-[#132540]/80 p-3 rounded-r-xl border-l-2 border-rose-400 relative shadow-sm"
                      style={{ opacity }}
                    >
                      <p className="text-[#8ab4e8] text-sm italic">「{thought.text}」</p>
                      <span className="absolute bottom-1 right-2 text-xs text-[#8ab4e8]">{thought.createdAt}</span>
                    </div>
                  );
                })
              ) : (
                <div className="text-sm text-[#8ab4e8] italic bg-[#0d1f3c]/30 backdrop-blur-sm p-4 rounded-xl border border-white/10 border-dashed text-center">
                  不知道在想什麼...
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 border-t border-white/5 pt-6">
            {selectedNpc.affection > 60 ? (
              <div>
                <h4 className="text-xs text-[#e6bf55] mb-3 uppercase tracking-wider flex items-center">
                  <Book className="w-3.5 h-3.5 mr-1.5" /> 專屬記憶庫 (好感度 &gt; 60 解鎖)
                </h4>
                <div className="space-y-2 mb-3">
                  {selectedNpc.memories && selectedNpc.memories.length > 0 ? (
                    selectedNpc.memories.map((mem: string, idx: number) => (
                      <div key={idx} className="bg-[#0d1f3c]/60 backdrop-blur-sm p-3 rounded-xl border border-white/5 text-sm text-[#8ab4e8] flex justify-between items-start group shadow-sm">
                        <span className="flex-1 pr-2 whitespace-pre-wrap break-words min-w-0">{mem}</span>
                        <button 
                          onClick={() => onRemoveNpcMemory(selectedNpc.id, idx)} 
                          className="text-[#3a5a8a] hover:text-rose-400 opacity-0 group-hover:opacity-100 transition flex-shrink-0 mt-0.5"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="text-xs text-[#3a5a8a] italic bg-[#0d1f3c]/30 backdrop-blur-sm p-4 rounded-xl border border-white/10 border-dashed text-center">
                      目前還沒有特別的回憶...
                    </div>
                  )}
                </div>
                <div className="flex space-x-2">
                  <textarea 
                    id="new-npc-memory"
                    placeholder="新增與他的回憶... (Shift+Enter 換行)" 
                    className="flex-1 bg-[#0d1f3c]/50 backdrop-blur-sm border border-white/10 rounded-xl px-3 py-2 text-sm text-[#e2eaf8] focus:border-amber-500/50 focus:shadow-[0_0_15px_rgba(245,158,11,0.2)] outline-none transition resize-none"
                    rows={2}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        onAddNpcMemory(selectedNpc.id, e.currentTarget.value);
                        e.currentTarget.value = '';
                      }
                    }}
                  />
                  <button 
                    onClick={() => {
                      const input = document.getElementById('new-npc-memory') as HTMLTextAreaElement;
                      if (input && input.value) {
                        onAddNpcMemory(selectedNpc.id, input.value);
                        input.value = '';
                      }
                    }}
                    className="bg-[#132540]/60 hover:bg-[#1a2e50]/60 backdrop-blur-sm border border-white/10 px-4 rounded-xl text-sm transition text-[#e2eaf8] flex items-center justify-center"
                  >
                    新增
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-[#0d1f3c]/40 backdrop-blur-sm border border-white/5 p-6 rounded-2xl text-center flex flex-col items-center justify-center shadow-inner">
                <Lock className="w-5 h-5 text-[#2a4a7f] mb-2" />
                <p className="text-xs text-[#8ab4e8]">好感度不足，無法開啟專屬記憶庫 (需 &gt; 60)</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
