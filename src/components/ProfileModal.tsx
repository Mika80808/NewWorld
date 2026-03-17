import React from 'react';
import { User, Save } from 'lucide-react';

import { Profile } from '../types';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: Profile;
  setProfile: (profile: Profile) => void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({
  isOpen,
  onClose,
  profile,
  setProfile,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#0d1f3c]/70 backdrop-blur-xl w-full max-w-md rounded-[8px] shadow-[0_0_40px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden text-[#e2eaf8] border border-white/10 relative">
        <div className="p-4 border-b border-white/5 flex justify-between items-center bg-[#0d1f3c]/50">
          <h2 className="text-lg font-bold flex items-center text-[#e6bf55]"><User className="w-5 h-5 mr-2 text-[#e6bf55]" /> 個人資訊</h2>
          <button 
            className="text-[#3a5a8a] hover:text-[#e2eaf8] transition"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        
        <div className="p-6 space-y-4 overflow-y-auto max-h-[70vh]">
          <div>
            <label className="block text-xs text-[#8ab4e8] mb-1 uppercase tracking-wider ml-3">姓名</label>
            <input 
              type="text" 
              value={profile.name}
              onChange={(e) => setProfile({...profile, name: e.target.value})}
              placeholder="未知"
              className="w-full bg-[#0d1f3c]/50 backdrop-blur-sm border-2 border-white/10 rounded-[8px] p-3 text-sm text-[#e2eaf8] focus:border-[#e6bf55]/50 focus:shadow-[0_0_15px_rgba(99,102,241,0.2)] outline-none transition"
            />
          </div>
          <div>
            <label className="block text-xs text-[#8ab4e8] mb-1 uppercase tracking-wider ml-3">職業</label>
            <input 
              type="text" 
              value={profile.job}
              onChange={(e) => setProfile({...profile, job: e.target.value})}
              placeholder="例如：異鄉人、劍士、魔法師"
              className="w-full bg-[#0d1f3c]/50 backdrop-blur-sm border border-white/10 rounded-[8px] p-3 text-sm text-[#e2eaf8] focus:border-[#e6bf55]/50 focus:shadow-[0_0_15px_rgba(99,102,241,0.2)] outline-none transition"
            />
          </div>
          <div>
            <label className="block text-xs text-[#8ab4e8] mb-1 uppercase tracking-wider ml-3">外貌</label>
            <textarea 
              value={profile.appearance}
              onChange={(e) => setProfile({...profile, appearance: e.target.value})}
              placeholder="例如：性別、年齡、穿著。"
              className="w-full bg-[#0d1f3c]/50 backdrop-blur-sm border border-white/10 rounded-[8px] p-3 text-sm text-[#e2eaf8] focus:border-[#e6bf55]/50 focus:shadow-[0_0_15px_rgba(99,102,241,0.2)] outline-none transition resize-none h-20"
            />
          </div>
          <div>
            <label className="block text-xs text-[#8ab4e8] mb-1 uppercase tracking-wider ml-3">個性</label>
            <textarea 
              value={profile.personality}
              onChange={(e) => setProfile({...profile, personality: e.target.value})}
              placeholder="例如：務實、謹慎、對陌生人抱有戒心。"
              className="w-full bg-[#0d1f3c]/50 backdrop-blur-sm border border-white/10 rounded-[8px] p-3 text-sm text-[#e2eaf8] focus:border-[#e6bf55]/50 focus:shadow-[0_0_15px_rgba(99,102,241,0.2)] outline-none transition resize-none h-20"
            />
          </div>
          <div>
            <label className="block text-xs text-[#8ab4e8] mb-1 uppercase tracking-wider ml-3">其他</label>
            <textarea 
              value={profile.other}
              onChange={(e) => setProfile({...profile, other: e.target.value})}
              placeholder="例如：喜惡、習慣。"
              className="w-full bg-[#0d1f3c]/50 backdrop-blur-sm border border-white/10 rounded-[8px] p-3 text-sm text-[#e2eaf8] focus:border-[#e6bf55]/50 focus:shadow-[0_0_15px_rgba(99,102,241,0.2)] outline-none transition resize-none h-20"
            />
          </div>
        </div>

        <div className="p-4 border-t-0 border-white/5 bg-[#0d1f3c]/50 flex justify-end">
          <button 
            className="bg-[#1044ab] hover:bg-[#1a56db] active:bg-[#2563eb] backdrop-blur-sm text-[#e2eaf8] rounded-[8px] flex items-center justify-center transition text-[14px] shadow-[0_4px_12px_rgba(16,68,171,0.2)] leading-[16px] w-[96px] h-[36px] px-[20px] py-[6px] mr-[14px]"
            onClick={onClose}
          >
            儲存
          </button>
        </div>
      </div>
    </div>
  );
};
