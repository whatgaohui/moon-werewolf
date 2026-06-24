'use client'

import { useWerewolfStore } from '@/lib/werewolf/store'
import { motion, AnimatePresence } from 'framer-motion'
import { Info, CheckCircle2, AlertTriangle } from 'lucide-react'

export function ToastTip() {
  const toast = useWerewolfStore((s) => s.toast)

  const config = {
    info: { icon: Info, color: 'text-sky-300', bg: 'from-sky-500/20 to-cyan-500/20', border: 'border-sky-400/30' },
    success: { icon: CheckCircle2, color: 'text-emerald-300', bg: 'from-emerald-500/20 to-teal-500/20', border: 'border-emerald-400/30' },
    danger: { icon: AlertTriangle, color: 'text-red-300', bg: 'from-red-500/20 to-rose-500/20', border: 'border-red-400/30' },
  }
  const c = toast ? config[toast.type] : config.info

  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          key={toast.id}
          initial={{ opacity: 0, y: -20, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.9 }}
          className="fixed top-16 left-1/2 -translate-x-1/2 z-50 px-4 w-full max-w-sm pointer-events-none"
        >
          <div className={`glass-card-strong rounded-2xl px-4 py-2.5 flex items-center gap-2 border ${c.border} bg-gradient-to-r ${c.bg}`}>
            <c.icon className={`w-4 h-4 shrink-0 ${c.color}`} />
            <span className="text-sm text-amber-100/90">{toast.content}</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
