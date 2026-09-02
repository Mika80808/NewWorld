import React, { useState } from 'react';
import { Clock, X } from 'lucide-react';
import { WEATHER_VALUES, Weather } from '../utils/weather';
import { Z_INDEX } from '../constants';

/**
 * 時間與天氣的手動校準。
 *
 * 玩家回報：「故事是早上，可是狀態列裡面是半夜；天氣也沒有改變，沒有辦法校準。」
 *
 * 兩個成因都在資料端修掉了（AI 現在有 `TIME|set=` 與 `WEATHER` 兩個指令），
 * 但那只讓 AI **有能力**校準，不保證它會做。時鐘一旦跑歪，玩家沒有出口就只能
 * 一路歪下去——而時間會注入 prompt，歪掉的時鐘會持續把敘事往錯的時段拉。
 * 這裡是那個人工出口，與任務的「強制結案」同一個原則：AI 漏掉時人要收得掉。
 *
 * ⚠️ 這裡允許把時鐘**往回撥**，AI 的 `TIME|set=` 不允許。
 * 差別在於誰在操作：AI 是每回合自動輸出，往回撥會讓時間在自己的敘事裡反覆橫跳；
 * 玩家是看著錯誤的數字手動修，「現在其實是早上七點」就該是早上七點。
 * 日期不開放編輯——任務期限、日記時序都以天數為準，改日期會連帶動到那些。
 */

interface TimeWeatherPopoverProps {
  hour: number;
  minute: number;
  weather: string;
  onApply: (next: { hour: number; minute: number; weather: string }) => void;
  onClose: () => void;
}

/** 常用時段。手打 07:00 太慢，玩家要的多半就是「把它撥到早上」 */
const PRESETS: { label: string; hour: number }[] = [
  { label: '清晨', hour: 6 },
  { label: '早上', hour: 9 },
  { label: '中午', hour: 12 },
  { label: '午後', hour: 15 },
  { label: '傍晚', hour: 18 },
  { label: '夜晚', hour: 21 },
  { label: '深夜', hour: 0 },
];

const clamp = (n: number, max: number) => Math.max(0, Math.min(max, n));

export const TimeWeatherPopover: React.FC<TimeWeatherPopoverProps> = ({
  hour, minute, weather, onApply, onClose,
}) => {
  const [h, setH] = useState(hour);
  const [m, setM] = useState(minute);
  const [w, setW] = useState(weather);

  const changed = h !== hour || m !== minute || w !== weather;

  const numberInputStyle: React.CSSProperties = {
    background: 'var(--bg-sys-field)',
    color: 'var(--text-main)',
    border: '1px solid var(--tint-line)',
  };

  return (
    <>
      {/* 點外面關閉。與 Modal 的遮罩不同，這裡刻意不加暗色——
          校準時要看得見底下狀態列的原始數值才對得起來 */}
      <div className="fixed inset-0" style={{ zIndex: Z_INDEX.POPOVER - 1 }} onClick={onClose} />

      <div
        className="absolute bottom-full mb-2 left-0 w-[min(20rem,calc(100vw-2rem))] rounded-[8px] p-3"
        style={{
          zIndex: Z_INDEX.POPOVER,
          background: 'var(--bg-elevated)',
          border: '1px solid var(--tint-line-strong)',
          boxShadow: 'var(--shadow-float)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <span className="flex items-center gap-1.5 text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
            <Clock className="w-3.5 h-3.5" /> 校準時間與天氣
          </span>
          <button onClick={onClose} className="p-0.5 rounded" style={{ color: 'var(--text-muted)' }} aria-label="關閉">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* 時刻 */}
        <div className="flex items-center gap-2 mb-2">
          <input
            type="number" min={0} max={23} value={h} aria-label="小時"
            onChange={e => setH(clamp(parseInt(e.target.value) || 0, 23))}
            className="w-14 px-2 py-1 rounded-[6px] text-sm font-mono text-center"
            style={numberInputStyle}
          />
          <span style={{ color: 'var(--text-muted)' }}>:</span>
          <input
            type="number" min={0} max={59} value={m} aria-label="分鐘"
            onChange={e => setM(clamp(parseInt(e.target.value) || 0, 59))}
            className="w-14 px-2 py-1 rounded-[6px] text-sm font-mono text-center"
            style={numberInputStyle}
          />
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            目前 {String(hour).padStart(2, '0')}:{String(minute).padStart(2, '0')}
          </span>
        </div>

        <div className="flex flex-wrap gap-1 mb-3">
          {PRESETS.map(p => (
            <button
              key={p.label}
              onClick={() => { setH(p.hour); setM(0); }}
              className="px-2 py-0.5 rounded-full text-xs transition"
              style={{
                background: h === p.hour && m === 0 ? 'var(--tint-surface-hover)' : 'var(--tint-surface)',
                color: h === p.hour && m === 0 ? 'var(--text-primary)' : 'var(--text-body)',
                border: '1px solid var(--tint-line)',
              }}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* 天氣 */}
        <div className="flex flex-wrap gap-1 mb-3">
          {WEATHER_VALUES.map((value: Weather) => (
            <button
              key={value}
              onClick={() => setW(value)}
              className="px-2.5 py-1 rounded-full text-xs transition"
              style={{
                background: w === value ? 'var(--tint-surface-hover)' : 'var(--tint-surface)',
                color: w === value ? 'var(--text-primary)' : 'var(--text-body)',
                border: `1px solid ${w === value ? 'var(--border-accent)' : 'var(--tint-line)'}`,
              }}
            >
              {value}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-2.5 py-1 rounded-[6px] text-xs" style={{ color: 'var(--text-muted)' }}>
            取消
          </button>
          <button
            onClick={() => onApply({ hour: h, minute: m, weather: w })}
            disabled={!changed}
            className="px-3 py-1 rounded-[6px] text-xs transition disabled:opacity-40"
            style={{ background: 'var(--btn-primary)', color: 'var(--btn--text)', boxShadow: 'var(--shadow)' }}
          >
            套用
          </button>
        </div>
      </div>
    </>
  );
};

TimeWeatherPopover.displayName = 'TimeWeatherPopover';
