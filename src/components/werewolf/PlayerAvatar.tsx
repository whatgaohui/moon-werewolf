'use client'

import { Player } from '@/lib/werewolf/types'
import { ROLES, isWolf } from '@/lib/werewolf/roles'
import { cn } from '@/lib/utils'

interface PlayerAvatarProps {
  player: Player
  size?: 'sm' | 'md' | 'lg'
  showRole?: boolean      // 是否显示真实角色（游戏结束或自己）
  isUser?: boolean        // 是否高亮为用户
  selectable?: boolean
  selected?: boolean
  dimmed?: boolean        // 不可选择时变暗
  badge?: string          // 附加标记文字
  badgeColor?: string
  onClick?: () => void
  highlightRing?: 'gold' | 'red' | 'green' | null
}

const SIZE_MAP = {
  sm: { box: 'w-12 h-12', emoji: 'text-xl', name: 'text-[10px]' },
  md: { box: 'w-16 h-16', emoji: 'text-2xl', name: 'text-xs' },
  lg: { box: 'w-20 h-20', emoji: 'text-3xl', name: 'text-sm' },
}

export function PlayerAvatar({
  player,
  size = 'md',
  showRole = false,
  isUser = false,
  selectable = false,
  selected = false,
  dimmed = false,
  badge,
  badgeColor = 'bg-amber-400',
  onClick,
  highlightRing = null,
}: PlayerAvatarProps) {
  const s = SIZE_MAP[size]
  const role = ROLES[player.role]
  const dead = !player.isAlive

  const ringClass = selected
    ? 'selected-ring'
    : highlightRing === 'red'
    ? 'danger-ring'
    : highlightRing === 'gold'
    ? 'ring-2 ring-amber-300 ring-offset-2 ring-offset-background'
    : highlightRing === 'green'
    ? 'ring-2 ring-emerald-400 ring-offset-2 ring-offset-background'
    : ''

  return (
    <button
      type="button"
      disabled={!selectable}
      onClick={onClick}
      className={cn(
        'relative flex flex-col items-center gap-1 transition-all',
        selectable && 'cursor-pointer active:scale-95',
        !selectable && 'cursor-default',
        dimmed && 'opacity-30',
      )}
    >
      <div className="relative">
        {/* 头像主体 */}
        <div
          className={cn(
            s.box,
            'rounded-2xl flex items-center justify-center relative overflow-hidden',
            'bg-gradient-to-br',
            showRole ? role.color : 'from-slate-600/60 to-slate-800/60',
            isUser && 'ring-2 ring-amber-300 ring-offset-1 ring-offset-background',
            ringClass,
            dead && 'player-dead',
          )}
        >
          {/* 内部装饰 */}
          <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent" />
          
          {/* 头像emoji */}
          <span className={cn(s.emoji, 'relative z-10 drop-shadow-lg')}>
            {player.avatar}
          </span>

          {/* 死亡标记 */}
          {dead && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
              <span className="text-2xl">💀</span>
            </div>
          )}

          {/* 用户标记 */}
          {isUser && !dead && (
            <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-amber-400 flex items-center justify-center shadow-lg border border-amber-200">
              <span className="text-[9px]">🙂</span>
            </div>
          )}

          {/* 编号 */}
          <div className="absolute top-0.5 left-0.5 px-1 rounded bg-black/40 text-[9px] text-white/90 font-mono">
            {player.id}
          </div>
        </div>

        {/* 角色角标（仅showRole时） */}
        {showRole && (
          <div className={cn(
            'absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-gradient-to-br flex items-center justify-center text-xs border-2 border-background',
            role.color,
          )}>
            {role.emoji}
          </div>
        )}

        {/* 自定义badge */}
        {badge && (
          <div className={cn(
            'absolute -top-2 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded-full text-[9px] font-bold text-amber-950 whitespace-nowrap shadow-lg',
            badgeColor,
          )}>
            {badge}
          </div>
        )}
      </div>

      {/* 名字 */}
      <div className="flex flex-col items-center -space-y-0.5">
        <span className={cn(s.name, 'font-medium text-amber-100/90 max-w-[4.5rem] truncate')}>
          {player.name}
        </span>
        {showRole && (
          <span className={cn(s.name, 'text-amber-100/50')}>
            {role.name}
          </span>
        )}
      </div>
    </button>
  )
}
