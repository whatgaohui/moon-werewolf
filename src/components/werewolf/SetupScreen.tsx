'use client'

import { useWerewolfStore } from '@/lib/werewolf/store'
import { GAME_CONFIGS, countRoles } from '@/lib/werewolf/configs'
import { ROLES, isWolf } from '@/lib/werewolf/roles'
import { RoleId } from '@/lib/werewolf/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Check, Users, Zap, Crown, Flame, Dices, Shield } from 'lucide-react'
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'

const DIFFICULTY_ICON = {
  easy: Zap,
  normal: Crown,
  hard: Flame,
}

const DIFFICULTY_LABEL = {
  easy: '入门',
  normal: '标准',
  hard: '进阶',
}

// 身份偏好选项
type PrefOption = { id: string; label: string; emoji: string; desc: string; color: string }

export function SetupScreen() {
  const goToMenu = useWerewolfStore((s) => s.goToMenu)
  const startGame = useWerewolfStore((s) => s.startGame)
  const [selectedId, setSelectedId] = useState<string>('standard')
  const [preferredRole, setPreferredRole] = useState<string>('random')

  const selected = GAME_CONFIGS.find((c) => c.id === selectedId)!

  // 根据当前套餐生成可选角色列表（去重）
  const availableRoles: PrefOption[] = [
    { id: 'random', label: '随机', emoji: '🎲', desc: '完全随机分配', color: 'from-slate-500 to-slate-700' },
    { id: 'good', label: '好人阵营', emoji: '✨', desc: '随机神职或平民', color: 'from-emerald-500 to-teal-700' },
    { id: 'wolf', label: '狼人阵营', emoji: '🐺', desc: '当狼人卧底', color: 'from-red-500 to-rose-700' },
  ]
  // 加入套餐里有的具体角色（用 role- 前缀避免与阵营选项 id 冲突）
  const uniqueRoles = [...new Set(selected.roles)] as RoleId[]
  for (const r of uniqueRoles) {
    const def = ROLES[r]
    availableRoles.push({
      id: `role-${r}`,
      label: def.name,
      emoji: def.emoji,
      desc: def.nightAction ? '夜晚有行动' : '白天行动',
      color: def.color,
    })
  }

  return (
    <div className="relative min-h-screen w-full flex flex-col starry-bg overflow-hidden">
      <div
        className="absolute inset-0 z-0 bg-cover bg-center opacity-25"
        style={{ backgroundImage: 'url(/werewolf/menu-bg.png)' }}
      />
      <div className="absolute inset-0 z-0 bg-gradient-to-b from-background/60 via-background/80 to-background" />

      <div className="relative z-10 flex flex-col min-h-screen w-full safe-top safe-bottom">
        {/* 顶部导航 */}
        <header className="flex items-center justify-between px-4 py-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={goToMenu}
            className="rounded-full glass-card text-amber-100 hover:bg-amber-200/10"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-lg font-bold text-amber-100">选择对局配置</h1>
          <div className="w-10" />
        </header>

        {/* 套餐卡片列表 */}
        <div className="flex-1 overflow-y-auto px-4 pb-4 scrollbar-thin">
          <div className="space-y-3">
            {GAME_CONFIGS.map((config) => {
              const isSelected = config.id === selectedId
              const counts = countRoles(config.roles as string[])
              const DiffIcon = DIFFICULTY_ICON[config.difficulty]
              return (
                <button
                  key={config.id}
                  onClick={() => setSelectedId(config.id)}
                  className={cn(
                    'w-full text-left rounded-3xl p-4 transition-all active:scale-[0.98]',
                    isSelected ? 'glass-card-strong selected-ring' : 'glass-card hover:bg-amber-200/5',
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-lg font-bold text-amber-100">{config.name}</h3>
                        <Badge variant="secondary" className="bg-amber-400/15 text-amber-200 border-amber-300/20 text-xs">
                          <Users className="w-3 h-3 mr-1" />
                          {config.playerCount}人
                        </Badge>
                        <Badge variant="outline" className="border-amber-300/30 text-amber-200/80 text-xs">
                          <DiffIcon className="w-3 h-3 mr-1" />
                          {DIFFICULTY_LABEL[config.difficulty]}
                        </Badge>
                        {config.badge && (
                          <Badge className="bg-gradient-to-r from-amber-400 to-orange-500 text-amber-950 text-xs border-0">
                            {config.badge}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-amber-100/60 mt-1.5">{config.description}</p>

                      {/* 角色构成 */}
                      <div className="flex flex-wrap gap-1.5 mt-3">
                        {Object.entries(counts).map(([role, count]) => {
                          const r = ROLES[role as keyof typeof ROLES]
                          return (
                            <div
                              key={`${config.id}-${role}`}
                              className={cn('flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-gradient-to-r', r.color)}
                            >
                              <span className="opacity-90">{r.emoji}</span>
                              <span className="text-white/95 font-medium">{r.name}</span>
                              <span className="text-white/70">×{count}</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                    <div
                      className={cn(
                        'shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all',
                        isSelected ? 'bg-amber-400 border-amber-300' : 'border-amber-200/30',
                      )}
                    >
                      {isSelected && <Check className="w-4 h-4 text-amber-950" strokeWidth={3} />}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          {/* 我的身份偏好选择 - 新增 */}
          <div className="mt-4 glass-card rounded-3xl p-4">
            <h4 className="text-sm font-bold text-amber-200 mb-1 flex items-center gap-1.5">
              <Dices className="w-4 h-4" />
              我的身份偏好
            </h4>
            <p className="text-[11px] text-amber-100/50 mb-3">
              选择你想扮演的角色，或随机分配。再也不怕"每次都是狼人"啦！
            </p>
            <div className="grid grid-cols-3 gap-2">
              {availableRoles.map((opt) => {
                const isSelected = preferredRole === opt.id
                return (
                  <button
                    key={opt.id}
                    onClick={() => setPreferredRole(opt.id)}
                    className={cn(
                      'relative flex flex-col items-center p-2.5 rounded-2xl transition-all active:scale-95',
                      isSelected ? 'glass-card-strong selected-ring' : 'bg-amber-200/5 hover:bg-amber-200/10',
                    )}
                  >
                    <div className={cn('w-11 h-11 rounded-xl bg-gradient-to-br flex items-center justify-center text-2xl mb-1.5', opt.color)}>
                      {opt.emoji}
                    </div>
                    <div className="text-xs font-bold text-amber-100">{opt.label}</div>
                    <div className="text-[9px] text-amber-100/50 text-center leading-tight mt-0.5">{opt.desc}</div>
                    {isSelected && (
                      <motion.div
                        layoutId="prefCheck"
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-amber-400 flex items-center justify-center shadow-lg"
                      >
                        <Check className="w-3 h-3 text-amber-950" strokeWidth={3} />
                      </motion.div>
                    )}
                  </button>
                )
              })}
            </div>
            {/* 提示：当指定角色但套餐不含时 */}
            {preferredRole.startsWith('role-') && !selected.roles.includes(preferredRole.slice(5) as RoleId) && (
              <p className="text-[10px] text-amber-300/70 mt-2 flex items-center gap-1">
                <Shield className="w-3 h-3" />
                当前套餐不含此角色，将随机分配
              </p>
            )}
          </div>

          {/* 选中套餐的角色详情 */}
          <div className="mt-3 glass-card rounded-3xl p-4">
            <h4 className="text-sm font-bold text-amber-200 mb-3 flex items-center gap-1.5">
              <span className="text-base">{selected.name}</span>
              <span className="text-amber-100/50 font-normal text-xs">· 角色一览</span>
            </h4>
            <div className="grid grid-cols-2 gap-2">
              {selected.roles.map((role, i) => {
                const r = ROLES[role]
                return (
                  <div key={i} className="flex items-center gap-2 p-2 rounded-xl bg-amber-200/5">
                    <div className={cn('w-9 h-9 rounded-lg bg-gradient-to-br flex items-center justify-center text-lg shrink-0', r.color)}>
                      {r.emoji}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-amber-100">{r.name}</div>
                      <div className="text-[10px] text-amber-100/50 truncate">
                        {r.faction === 'wolf' ? '狼人阵营' : r.category === 'god' ? '神职' : '平民'}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* 底部开始按钮 */}
        <footer className="px-4 pt-3 pb-4 border-t border-amber-200/10 glass-card-strong">
          <Button
            onClick={() => startGame(selected, preferredRole.startsWith('role-') ? preferredRole.slice(5) : preferredRole)}
            size="lg"
            className="w-full h-14 text-base font-bold rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 text-amber-950 shadow-lg shadow-amber-500/30 active:scale-95 transition-all"
          >
            <Users className="w-4 h-4 mr-2" />
            开始 {selected.name} · {selected.playerCount}人局
          </Button>
        </footer>
      </div>
    </div>
  )
}
