'use client'

import { useWerewolfStore } from '@/lib/werewolf/store'
import { ROLES, isWolf } from '@/lib/werewolf/roles'
import { Button } from '@/components/ui/button'
import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

export function RoleRevealScreen() {
  const players = useWerewolfStore((s) => s.players)
  const userPlayerId = useWerewolfStore((s) => s.userPlayerId)
  const config = useWerewolfStore((s) => s.config)
  const confirmRoleReveal = useWerewolfStore((s) => s.confirmRoleReveal)

  const user = players.find((p) => p.id === userPlayerId)
  const [revealed, setRevealed] = useState(false)
  const [showTeammates, setShowTeammates] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setRevealed(true), 600)
    return () => clearTimeout(t)
  }, [])

  if (!user || !config) return null

  const role = ROLES[user.role]
  const teammates = isWolf(user.role)
    ? players.filter((p) => isWolf(p.role) && p.id !== user.id)
    : []

  return (
    <div className="relative min-h-screen w-full flex flex-col items-center justify-center starry-bg overflow-hidden px-6 safe-top safe-bottom">
      <div
        className="absolute inset-0 z-0 bg-cover bg-center opacity-30"
        style={{ backgroundImage: 'url(/werewolf/night-bg.png)' }}
      />
      <div className="absolute inset-0 z-0 bg-gradient-to-b from-background/70 via-background/50 to-background" />

      <div className="relative z-10 flex flex-col items-center w-full max-w-sm">
        {/* 提示文字 */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-6"
        >
          <p className="text-amber-200/60 text-sm tracking-widest">YOUR ROLE</p>
          <h2 className="text-amber-100 text-lg font-bold mt-1">你的身份是</h2>
        </motion.div>

        {/* 卡牌翻转 */}
        <div className="relative w-64 h-80 mb-6" style={{ perspective: '1000px' }}>
          {/* 卡背 */}
          <div
            className={`absolute inset-0 rounded-3xl transition-transform duration-700 ${
              revealed ? 'rotate-y-180 opacity-0' : 'opacity-100'
            }`}
            style={{ transformStyle: 'preserve-3d' }}
          >
            <div className="w-full h-full rounded-3xl glass-card-strong border-2 border-amber-300/30 flex items-center justify-center">
              <div className="text-7xl animate-moon-glow">🌙</div>
            </div>
          </div>

          {/* 卡面 */}
          <AnimatePresence>
            {revealed && (
              <motion.div
                initial={{ opacity: 0, rotateY: 180, scale: 0.8 }}
                animate={{ opacity: 1, rotateY: 0, scale: 1 }}
                transition={{ duration: 0.6, type: 'spring' }}
                className="absolute inset-0"
              >
                <div className={`w-full h-full rounded-3xl bg-gradient-to-br ${role.color} p-1 shadow-2xl`}>
                  <div className="w-full h-full rounded-[1.4rem] bg-background/90 flex flex-col items-center justify-center p-6 text-center">
                    <div className="text-7xl mb-4 animate-float">{role.emoji}</div>
                    <h1 className="text-3xl font-black text-amber-100 text-glow mb-2">{role.name}</h1>
                    <div className="px-3 py-1 rounded-full bg-amber-400/15 text-amber-200 text-xs mb-4">
                      {role.faction === 'wolf' ? '🐺 狼人阵营' : role.category === 'god' ? '✨ 好人·神职' : '👨‍🌾 好人·平民'}
                    </div>
                    <p className="text-xs text-amber-100/70 leading-relaxed">{role.description}</p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* 狼人同伴提示 */}
        {revealed && isWolf(user.role) && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="w-full mb-4"
          >
            <button
              onClick={() => setShowTeammates((v) => !v)}
              className="w-full glass-card rounded-2xl p-3 text-left active:scale-[0.98] transition-transform"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xl">🐺</span>
                  <span className="text-sm text-amber-100">你的狼人同伴</span>
                </div>
                <span className="text-amber-300 text-xs">{showTeammates ? '收起' : '查看'}</span>
              </div>
              {showTeammates && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {teammates.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-500/15 border border-red-400/30"
                    >
                      <span className="text-lg">{t.avatar}</span>
                      <span className="text-sm text-amber-100">{t.name}</span>
                      <span className="text-xs text-amber-100/50">{t.id}号</span>
                    </div>
                  ))}
                </div>
              )}
            </button>
          </motion.div>
        )}

        {/* 确认按钮 */}
        {revealed && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="w-full"
          >
            <Button
              onClick={confirmRoleReveal}
              size="lg"
              className="w-full h-14 text-base font-bold rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 text-amber-950 shadow-lg shadow-amber-500/30 active:scale-95 transition-all"
            >
              记住身份，进入游戏
            </Button>
          </motion.div>
        )}
      </div>
    </div>
  )
}
