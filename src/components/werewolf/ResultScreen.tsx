'use client'

import { useWerewolfStore } from '@/lib/werewolf/store'
import { ROLES, isWolf } from '@/lib/werewolf/roles'
import { Player } from '@/lib/werewolf/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Home, RotateCcw, Trophy, Skull } from 'lucide-react'
import { motion } from 'framer-motion'

export function ResultScreen() {
  const players = useWerewolfStore((s) => s.players)
  const userPlayerId = useWerewolfStore((s) => s.userPlayerId)
  const winner = useWerewolfStore((s) => s.winner)
  const config = useWerewolfStore((s) => s.config)
  const restart = useWerewolfStore((s) => s.restart)
  const goToMenu = useWerewolfStore((s) => s.goToMenu)

  const user = players.find((p) => p.id === userPlayerId)
  if (!user || !winner) return null

  const userWon = ROLES[user.role].faction === winner
  const userRole = ROLES[user.role]

  const wolves = players.filter((p) => isWolf(p.role))
  const goods = players.filter((p) => !isWolf(p.role))

  return (
    <div className="relative min-h-screen w-full flex flex-col overflow-hidden starry-bg">
      <div
        className="absolute inset-0 z-0 bg-cover bg-center opacity-50"
        style={{ backgroundImage: 'url(/werewolf/victory-bg.png)' }}
      />
      <div className={`absolute inset-0 z-0 ${userWon ? 'bg-gradient-to-b from-amber-900/30 via-background/60 to-background' : 'bg-gradient-to-b from-slate-900/60 via-background/70 to-background'}`} />

      <div className="relative z-10 flex flex-col min-h-screen px-6 py-8 safe-top safe-bottom overflow-y-auto scrollbar-thin">
        {/* 胜负标题 */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8, y: -20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: 'spring', duration: 0.7 }}
          className="flex flex-col items-center mt-6 mb-6"
        >
          <div className="text-7xl mb-3 animate-float">
            {userWon ? '🏆' : '💔'}
          </div>
          <h1 className={`text-4xl font-black text-glow-strong ${userWon ? 'text-amber-200' : 'text-rose-300'}`}>
            {userWon ? '胜利！' : '失败...'}
          </h1>
          <div className={`mt-2 px-4 py-1.5 rounded-full ${winner === 'good' ? 'bg-emerald-500/20 text-emerald-200' : 'bg-red-500/20 text-red-200'} text-sm font-bold`}>
            {winner === 'good' ? '✨ 好人阵营胜利' : '🐺 狼人阵营胜利'}
          </div>
        </motion.div>

        {/* 玩家身份回顾 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="glass-card-strong rounded-3xl p-4 mb-4"
        >
          <h3 className="text-sm font-bold text-amber-200 mb-3 flex items-center gap-1.5">
            <Trophy className="w-4 h-4" />
            玩家身份揭晓
          </h3>
          <div className="grid grid-cols-3 gap-2">
            {players.map((p) => {
              const r = ROLES[p.role]
              const isUser = p.id === userPlayerId
              return (
                <div
                  key={p.id}
                  className={`relative flex flex-col items-center p-2 rounded-xl ${isUser ? 'bg-amber-400/15 ring-1 ring-amber-300/40' : 'bg-amber-200/5'}`}
                >
                  <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${r.color} flex items-center justify-center text-lg mb-1 ${!p.isAlive ? 'player-dead' : ''}`}>
                    {p.avatar}
                  </div>
                  <div className="text-[10px] text-amber-100/60">{p.id}号</div>
                  <div className="text-xs font-bold text-amber-100 truncate max-w-full">{p.name}</div>
                  <div className="text-[10px] text-amber-100/50 mt-0.5">{r.emoji} {r.name}</div>
                  {!p.isAlive && (
                    <div className="absolute -top-1 -right-1 text-xs">💀</div>
                  )}
                </div>
              )
            })}
          </div>
        </motion.div>

        {/* 阵营统计 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="grid grid-cols-2 gap-3 mb-6"
        >
          <div className="glass-card rounded-2xl p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <span className="text-base">🐺</span>
              <span className="text-xs font-bold text-rose-200">狼人阵营</span>
            </div>
            <div className="space-y-1">
              {wolves.map((p) => (
                <div key={p.id} className="flex items-center justify-between text-[11px]">
                  <span className="text-amber-100/70">{p.name}</span>
                  <span className={p.isAlive ? 'text-emerald-300' : 'text-rose-300'}>
                    {p.isAlive ? '存活' : '出局'}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="glass-card rounded-2xl p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <span className="text-base">✨</span>
              <span className="text-xs font-bold text-emerald-200">好人阵营</span>
            </div>
            <div className="space-y-1 max-h-32 overflow-y-auto scrollbar-thin">
              {goods.map((p) => (
                <div key={p.id} className="flex items-center justify-between text-[11px]">
                  <span className="text-amber-100/70 truncate">{p.name}</span>
                  <span className={p.isAlive ? 'text-emerald-300' : 'text-rose-300'}>
                    {p.isAlive ? '存活' : '出局'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* 我的角色总结 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className={`glass-card-strong rounded-2xl p-4 mb-6 ${userWon ? 'ring-1 ring-amber-300/40' : ''}`}
        >
          <div className="flex items-center gap-3">
            <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${userRole.color} flex items-center justify-center text-3xl ${!user.isAlive ? 'player-dead' : ''}`}>
              {userRole.emoji}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold text-amber-100">{userRole.name}</span>
                {userWon ? (
                  <Badge className="bg-amber-400 text-amber-950 text-xs">胜利</Badge>
                ) : (
                  <Badge variant="secondary" className="bg-rose-500/20 text-rose-200 text-xs">失败</Badge>
                )}
              </div>
              <div className="text-xs text-amber-100/60 mt-0.5">
                {user.isAlive ? '存活到结尾' : `第${user.deathDay || '?'}天出局 · ${user.deathReason || ''}`}
              </div>
            </div>
          </div>
        </motion.div>

        {/* 操作按钮 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="flex flex-col gap-3 mt-auto"
        >
          <Button
            onClick={restart}
            size="lg"
            className="h-14 text-base font-bold rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 text-amber-950 shadow-lg shadow-amber-500/30 active:scale-95 transition-all"
          >
            <RotateCcw className="w-5 h-5 mr-2" />
            再来一局
          </Button>
          <Button
            onClick={goToMenu}
            variant="outline"
            size="lg"
            className="h-12 rounded-2xl glass-card border-amber-200/20 text-amber-100 hover:bg-amber-200/10"
          >
            <Home className="w-4 h-4 mr-2" />
            返回主页
          </Button>
        </motion.div>
      </div>
    </div>
  )
}
