import React from 'react';
import { User } from 'lucide-react';

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

  const inputClass = "w-full backdrop-blur-sm border border-white/10 rounded-[8px] p-3 text-sm outline-none transition";

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="backdrop-blur-xl w-full max-w-md rounded-[8px] shadow-[0_0_40px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden border border-white/10 relative" style={{ background: 'color-mix(in srgb, var(--bg-elevated) 70%, transparent)', color: 'var(--text-muted)' }}>
        <div className="p-4 border-b border-white/5 flex justify-between items-center" style={{ background: 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)' }}>
          <h2 className="text-lg font-bold flex items-center" style={{ color: 'var(--text-primary)' }}>
            <User className="w-5 h-5 mr-2" style={{ color: 'var(--text-primary)' }} /> 個人資訊
          </h2>
          <button
            className="transition"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--text-title)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto max-h-[70vh]">
          {([
            { key: 'name' as keyof Profile, label: '姓名', placeholder: '未知', multiline: false },
            { key: 'job' as keyof Profile, label: '職業', placeholder: '例如：異鄉人、劍士、魔法師', multiline: false },
            { key: 'appearance' as keyof Profile, label: '外貌', placeholder: '例如：性別、年齡、穿著。', multiline: true },
            { key: 'personality' as keyof Profile, label: '個性', placeholder: '例如：務實、謹慎、對陌生人抱有戒心。', multiline: true },
            { key: 'other' as keyof Profile, label: '其他', placeholder: '例如：喜惡、習慣。', multiline: true },
          ]).map(({ key, label, placeholder, multiline }) => (
            <div key={key}>
              <label className="block text-xs mb-1 uppercase tracking-wider ml-3" style={{ color: 'var(--text-body)' }}>{label}</label>
              {multiline ? (
                <textarea
                  value={(profile[key] as string) ?? ''}
                  onChange={(e) => setProfile({ ...profile, [key]: e.target.value })}
                  placeholder={placeholder}
                  className={`${inputClass} resize-none h-20`}
                  style={{ background: 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)', color: 'var(--text-main)' }}
                />
              ) : (
                <input
                  type="text"
                  value={(profile[key] as string) ?? ''}
                  onChange={(e) => setProfile({ ...profile, [key]: e.target.value })}
                  placeholder={placeholder}
                  className={inputClass}
                  style={{ background: 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)', color: 'var(--text-main)' }}
                />
              )}
            </div>
          ))}
        </div>

        <div className="p-4 flex justify-end" style={{ background: 'color-mix(in srgb, var(--bg-elevated) 50%, transparent)' }}>
          <button
            className="backdrop-blur-sm rounded-[8px] flex items-center justify-center transition shadow-[var(--shadow)] text-[14px] leading-[16px] w-[96px] h-[36px] px-[20px] py-[6px] mr-[14px]"
            style={{ background: 'var(--btn-primary)', color: 'var(--text-main)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--btn-primary-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'var(--btn-primary)'}
            onClick={onClose}
          >
            儲存
          </button>
        </div>
      </div>
    </div>
  );
};
