'use client'

import { useWerewolfStore } from '@/lib/werewolf/store'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * 高风险操作二次确认弹窗
 *
 * 监听 store.confirmDialog 状态：
 *  - danger=true  红色警示主题（女巫毒药/猎人开枪/白狼王自爆）
 *  - danger=false amber 警告主题（普通二次确认）
 *
 * 取消 → closeConfirmDialog()
 * 确认 → 调用 onConfirm() 后 closeConfirmDialog()
 *
 * 视觉参考 SeerResultDialog，采用 framer-motion + fixed 定位实现，
 * 以满足「scale + opacity 入场动画」与「bg-black/60 加深遮罩」两项要求。
 */
export function ConfirmDialog() {
  const confirmDialog = useWerewolfStore((s) => s.confirmDialog)
  const closeConfirmDialog = useWerewolfStore((s) => s.closeConfirmDialog)

  const isDanger = confirmDialog?.danger ?? false

  const handleConfirm = () => {
    if (!confirmDialog) return
    // 先取出回调再关闭，避免 closeConfirmDialog 触发的状态变化影响 onConfirm 内部读取
    const onConfirm = confirmDialog.onConfirm
    closeConfirmDialog()
    onConfirm()
  }

  // 遮罩点击 = 取消（语义友好）
  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) closeConfirmDialog()
  }

  return (
    <AnimatePresence>
      {confirmDialog && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={handleOverlayClick}
          className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-dialog-title"
          aria-describedby="confirm-dialog-desc"
        >
          <motion.div
            initial={{ scale: 0.85, opacity: 0, y: 16 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.85, opacity: 0, y: 16 }}
            transition={{ type: 'spring', duration: 0.38, bounce: 0.32 }}
            className="w-full max-w-xs"
          >
            <div
              className={cn(
                'relative rounded-2xl overflow-hidden border-2 shadow-2xl',
                isDanger ? 'border-red-400/60' : 'border-amber-400/60',
              )}
            >
              {/* 背景渐变层 */}
              <div
                className={cn(
                  'absolute inset-0 -z-10',
                  isDanger
                    ? 'bg-gradient-to-br from-red-950/95 via-rose-950/92 to-background'
                    : 'bg-gradient-to-br from-amber-950/95 via-orange-950/92 to-background',
                )}
              />
              {/* 警示光效 */}
              <div
                className={cn(
                  'absolute -top-16 -right-16 w-36 h-36 rounded-full blur-3xl -z-10',
                  isDanger ? 'bg-red-500/35' : 'bg-amber-500/30',
                )}
              />

              <div className="relative p-5">
                {/* 标题区：图标 + 标题 */}
                <div className="flex items-start gap-3 mb-3">
                  <div
                    className={cn(
                      'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
                      isDanger ? 'bg-red-500/25' : 'bg-amber-500/25',
                    )}
                  >
                    {isDanger ? (
                      <AlertTriangle className="w-5 h-5 text-red-300" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-amber-300" />
                    )}
                  </div>
                  <h3
                    id="confirm-dialog-title"
                    className={cn(
                      'text-base font-bold leading-tight pt-1.5',
                      isDanger ? 'text-red-200' : 'text-amber-100',
                    )}
                  >
                    {confirmDialog.title}
                  </h3>
                </div>

                {/* 描述 */}
                <p
                  id="confirm-dialog-desc"
                  className="text-xs leading-relaxed whitespace-pre-wrap break-words text-amber-100/75 mb-5 pl-[3.25rem]"
                >
                  {confirmDialog.desc}
                </p>

                {/* 操作按钮 */}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={closeConfirmDialog}
                    className="flex-1 h-11 rounded-xl text-xs font-medium glass-card border border-amber-200/20 text-amber-100/80 hover:bg-amber-200/10 active:scale-95 transition"
                  >
                    {confirmDialog.cancelText ?? '取消'}
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirm}
                    className={cn(
                      'flex-1 h-11 rounded-xl text-xs font-bold text-white border-0 active:scale-95 transition shadow-lg',
                      isDanger
                        ? 'bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 shadow-red-900/40'
                        : 'bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 shadow-amber-900/40',
                    )}
                  >
                    {confirmDialog.confirmText ?? '确认'}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
