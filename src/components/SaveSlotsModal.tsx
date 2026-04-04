import React from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { X } from 'lucide-react'
import { User } from '@supabase/supabase-js'
import { SaveSlot } from '../lib/supabase'

interface SaveSlotsModalProps {
  isOpen: boolean
  onClose: () => void
  cloudSaves: SaveSlot[]
  currentSlotName: string
  authUser: User | null
  onLoadSlot: (slotName: string) => Promise<void>
  onDeleteSlot: (slotName: string) => Promise<void>
  onCreateSlot: () => Promise<void>
  showToast: (msg: string) => void
}

export function SaveSlotsModal({
  isOpen,
  onClose,
  cloudSaves,
  currentSlotName,
  onLoadSlot,
  onDeleteSlot,
  onCreateSlot,
}: SaveSlotsModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="w-full max-w-sm rounded-[12px] p-5 flex flex-col gap-4"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', maxHeight: '80vh', overflowY: 'auto' }}
            initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>存檔槽管理</h2>
              <button onClick={onClose}>
                <X className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
              </button>
            </div>

            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              目前使用：<span style={{ color: 'var(--text-primary)' }}>{currentSlotName}</span>
            </p>

            {cloudSaves.length === 0 ? (
              <p className="text-xs text-center py-4" style={{ color: 'var(--text-muted)' }}>尚無雲端存檔</p>
            ) : (
              <div className="flex flex-col gap-2">
                {cloudSaves.map(slot => (
                  <div
                    key={slot.id}
                    className="rounded-[8px] p-3 flex items-center justify-between gap-2"
                    style={{
                      background: slot.slot_name === currentSlotName ? 'var(--bg-ui-card)' : 'transparent',
                      border: `1px solid ${slot.slot_name === currentSlotName ? 'var(--border-accent)' : 'var(--border-default)'}`,
                    }}
                  >
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="text-sm font-medium truncate" style={{ color: 'var(--text-body)' }}>
                        {slot.slot_name}
                      </span>
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {new Date(slot.updated_at).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      {slot.slot_name !== currentSlotName && (
                        <button
                          onClick={() => onLoadSlot(slot.slot_name)}
                          className="px-2 py-1 text-xs rounded-[6px]"
                          style={{ background: 'var(--bg-ui-card)', color: 'var(--text-body)', border: '1px solid var(--border-default)' }}
                        >
                          載入
                        </button>
                      )}
                      <button
                        onClick={() => onDeleteSlot(slot.slot_name)}
                        className="px-2 py-1 text-xs rounded-[6px]"
                        style={{ background: 'var(--bg-ui-card)', color: 'var(--text-danger)', border: '1px solid var(--border-default)' }}
                      >
                        刪除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {cloudSaves.length < 5 && (
              <button
                onClick={onCreateSlot}
                className="w-full py-2 text-xs rounded-[8px] transition"
                style={{ background: 'var(--bg-ui-card)', color: 'var(--text-muted)', border: '1px solid var(--border-default)' }}
              >
                ＋ 新增存檔槽（{cloudSaves.length}/5）
              </button>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
