'use client'

import { useWerewolfStore } from '@/lib/werewolf/store'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, X, Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function SeerResultDialog() {
  const pending = useWerewolfStore((s) => s.seerResultPending)
  const confirm = useWerewolfStore((s) => s.confirmSeerResult)

  return (
    <AnimatePresence>
      {pending && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/70 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.7, opacity: 0, y: 30 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.7, opacity: 0, y: 30 }}
            transition={{ type: 'spring', duration: 0.5, bounce: 0.4 }}
            className="w-full max-w-xs"
          >
            <div className={`relative rounded-3xl overflow-hidden border-2 ${
              pending.result === 'wolf' ? 'border-red-400/60' : 'border-emerald-400/60'
            }`}>
              {/* 背景渐变 */}
              <div className={`absolute inset-0 bg-gradient-to-br ${
                pending.result === 'wolf' ? 'from-red-900/80 via-rose-900/70 to-background' : 'from-emerald-900/80 via-teal-900/70 to-background'
              }`} />
              
              {/* 光效 */}
              <div className={`absolute -top-20 -right-20 w-40 h-40 rounded-full blur-3xl ${
                pending.result === 'wolf' ? 'bg-red-500/40' : 'bg-emerald-500/40'
              }`} />

              <div className="relative z-10 p-6 text-center">
                {/* 图标 */}
                <div className="flex justify-center mb-3">
                  <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${
                    pending.result === 'wolf' ? 'bg-red-500/20' : 'bg-emerald-500/20'
                  }`}>
                    <Eye className={`w-8 h-8 ${
                      pending.result === 'wolf' ? 'text-red-300' : 'text-emerald-300'
                    }`} />
                  </div>
                </div>

                <p className="text-xs text-amber-100/60 tracking-widest mb-1">SEER RESULT</p>
                <h3 className="text-lg font-bold text-amber-100 mb-4">查验结果</h3>

                {/* 目标玩家 */}
                <div className="glass-card rounded-2xl p-3 mb-4">
                  <div className="text-xs text-amber-100/50 mb-1">查验目标</div>
                  <div className="text-2xl font-bold text-amber-100">
                    {pending.targetId}号 {pending.targetName}
                  </div>
                </div>

                {/* 结果 */}
                <motion.div
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.3, type: 'spring', bounce: 0.5 }}
                  className={`rounded-2xl py-4 px-4 mb-5 ${
                    pending.result === 'wolf'
                      ? 'bg-gradient-to-r from-red-500/30 to-rose-600/30 border border-red-400/40'
                      : 'bg-gradient-to-r from-emerald-500/30 to-teal-600/30 border border-emerald-400/40'
                  }`}
                >
                  <div className="text-4xl mb-1">
                    {pending.result === 'wolf' ? '🐺' : '😇'}
                  </div>
                  <div className={`text-2xl font-black ${
                    pending.result === 'wolf' ? 'text-red-200' : 'text-emerald-200'
                  }`}>
                    {pending.result === 'wolf' ? '狼人' : '好人'}
                  </div>
                </motion.div>

                <Button
                  onClick={confirm}
                  className={`w-full h-12 rounded-xl font-bold text-white ${
                    pending.result === 'wolf'
                      ? 'bg-gradient-to-r from-red-500 to-rose-600'
                      : 'bg-gradient-to-r from-emerald-500 to-teal-600'
                  }`}
                >
                  <Check className="w-4 h-4 mr-1" />
                  我知道了
                </Button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
