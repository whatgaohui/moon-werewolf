'use client'

import { useState } from 'react'
import { loadStats, getWinRate, getRoleWinRate, clearStats, GameStats } from '@/lib/werewolf/stats'
import { ROLES } from '@/lib/werewolf/roles'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Trophy, Trash2, TrendingUp, Heart, Skull } from 'lucide-react'
import { cn } from '@/lib/utils'

interface StatsDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
}

export function StatsDialog({ open, onOpenChange }: StatsDialogProps) {
  const [stats, setStats] = useState<GameStats | null>(null)
  const [prevOpen, setPrevOpen] = useState(open)
  // 打开时加载最新数据（渲染期间调整状态，React推荐模式）
  if (open && open !== prevOpen) {
    setPrevOpen(open)
    setStats(loadStats())
  } else if (!open && open !== prevOpen) {
    setPrevOpen(open)
  }

  if (!stats) return null

  const winRate = getWinRate(stats)
  const surviveRate = stats.totalGames > 0 ? Math.round((stats.survivedCount / stats.totalGames) * 100) : 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] glass-card-strong border-amber-200/20">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-100">
            <Trophy className="w-5 h-5 text-amber-300" />
            我的战绩
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[70vh] pr-2">
          <div className="space-y-4">
            {/* 总览 */}
            <div className="grid grid-cols-3 gap-2">
              <div className="glass-card rounded-2xl p-3 text-center">
                <div className="text-2xl font-black text-amber-200">{stats.totalGames}</div>
                <div className="text-[10px] text-amber-100/50 mt-0.5">总场次</div>
              </div>
              <div className="glass-card rounded-2xl p-3 text-center">
                <div className="text-2xl font-black text-emerald-300">{winRate}%</div>
                <div className="text-[10px] text-amber-100/50 mt-0.5">胜率</div>
              </div>
              <div className="glass-card rounded-2xl p-3 text-center">
                <div className="text-2xl font-black text-sky-300">{surviveRate}%</div>
                <div className="text-[10px] text-amber-100/50 mt-0.5">存活率</div>
              </div>
            </div>

            {/* 胜负统计 */}
            <div className="glass-card rounded-2xl p-3">
              <h4 className="text-xs font-bold text-amber-200 mb-2 flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5" />
                胜负统计
              </h4>
              <div className="flex gap-2">
                <div className="flex-1 bg-emerald-500/10 rounded-xl p-2 text-center">
                  <Heart className="w-4 h-4 text-emerald-300 mx-auto mb-1" />
                  <div className="text-lg font-bold text-emerald-300">{stats.wins}</div>
                  <div className="text-[10px] text-amber-100/50">胜利</div>
                </div>
                <div className="flex-1 bg-rose-500/10 rounded-xl p-2 text-center">
                  <Skull className="w-4 h-4 text-rose-300 mx-auto mb-1" />
                  <div className="text-lg font-bold text-rose-300">{stats.losses}</div>
                  <div className="text-[10px] text-amber-100/50">失败</div>
                </div>
              </div>
            </div>

            {/* 角色统计 */}
            {Object.keys(stats.roleCount).length > 0 && (
              <div className="glass-card rounded-2xl p-3">
                <h4 className="text-xs font-bold text-amber-200 mb-2">角色使用统计</h4>
                <div className="space-y-1.5">
                  {Object.entries(stats.roleCount)
                    .sort(([, a], [, b]) => b - a)
                    .map(([role, count]) => {
                      const r = ROLES[role as keyof typeof ROLES]
                      if (!r) return null
                      const roleWin = getRoleWinRate(stats, role)
                      return (
                        <div key={role} className="flex items-center gap-2">
                          <div className={cn('w-8 h-8 rounded-lg bg-gradient-to-br flex items-center justify-center text-base shrink-0', r.color)}>
                            {r.emoji}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-amber-100">{r.name}</span>
                              <span className="text-[10px] text-amber-100/50">{count}场</span>
                            </div>
                            <div className="mt-0.5 h-1.5 bg-amber-200/10 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-emerald-400 to-teal-500 rounded-full"
                                style={{ width: `${roleWin}%` }}
                              />
                            </div>
                          </div>
                          <span className="text-[10px] text-emerald-300 font-bold w-8 text-right">{roleWin}%</span>
                        </div>
                      )
                    })}
                </div>
              </div>
            )}

            {/* 最近对局 */}
            {stats.recent.length > 0 && (
              <div className="glass-card rounded-2xl p-3">
                <h4 className="text-xs font-bold text-amber-200 mb-2">最近对局</h4>
                <div className="space-y-1.5 max-h-40 overflow-y-auto scrollbar-thin">
                  {stats.recent.slice(0, 10).map((rec) => {
                    const r = ROLES[rec.role as keyof typeof ROLES]
                    return (
                      <div key={rec.id} className="flex items-center gap-2 text-xs">
                        <span className={cn('w-6 h-6 rounded-md bg-gradient-to-br flex items-center justify-center text-xs shrink-0', r?.color || 'from-slate-500 to-slate-700')}>
                          {r?.emoji || '❓'}
                        </span>
                        <div className="flex-1 min-w-0">
                          <span className="text-amber-100/80">{rec.configName}</span>
                          <span className="text-amber-100/40 ml-1">·{rec.roleName}</span>
                        </div>
                        {rec.survived && <span className="text-[9px] text-emerald-300">存活</span>}
                        <Badge variant="secondary" className={cn('text-[9px] px-1.5 py-0', rec.won ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300')}>
                          {rec.won ? '胜' : '负'}
                        </Badge>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {stats.totalGames === 0 && (
              <div className="text-center py-8 text-amber-100/40 text-sm">
                <Trophy className="w-12 h-12 mx-auto mb-2 opacity-30" />
                还没有对局记录<br />开始你的第一局游戏吧！
              </div>
            )}

            {stats.totalGames > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  clearStats()
                  setStats(loadStats())
                }}
                className="w-full h-9 text-xs text-rose-300/70 border-rose-400/20 hover:bg-rose-500/10"
              >
                <Trash2 className="w-3 h-3 mr-1" />
                清除战绩
              </Button>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
