import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowDown } from 'lucide-react';

/**
 * 「回到最新訊息」的浮動按鈕。
 *
 * 只在玩家往上捲離底部時出現——一直掛著會擋住故事，而且在底部時按了也沒有作用。
 * 判定與捲動都由呼叫端負責（`App.tsx` 的 `onScroll` 與 `messagesEndRef`），
 * 這裡是純 UI。
 *
 * 位置放在輸入框的右上角外側：對話區在桌機是被輸入框蓋住底部的
 * （composer 是 `absolute bottom-0`），手機則是排在流程裡。掛在輸入框上而不是
 * 用固定的 bottom 位移，兩種版面才不必各算一次高度。
 */
interface ScrollToBottomButtonProps {
  visible: boolean;
  onClick: () => void;
}

export const ScrollToBottomButton: React.FC<ScrollToBottomButtonProps> = ({ visible, onClick }) => (
  <AnimatePresence>
    {visible && (
      <motion.button
        type="button"
        onClick={onClick}
        aria-label="回到最新訊息"
        title="回到最新訊息"
        initial={{ opacity: 0, y: 8, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.9 }}
        transition={{ duration: 0.15 }}
        // 44px：手機的最小觸控目標，與 .composer-controls 的按鈕一致
        className="absolute right-2 -top-14 w-11 h-11 rounded-full flex items-center justify-center backdrop-blur-xl border border-[color:var(--tint-line)]"
        style={{ background: 'var(--bg-elevated)', boxShadow: 'var(--shadow-float)' }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--tint-surface-hover)'}
        onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
      >
        <ArrowDown className="w-5 h-5" style={{ color: 'var(--text-primary)' }} />
      </motion.button>
    )}
  </AnimatePresence>
);
