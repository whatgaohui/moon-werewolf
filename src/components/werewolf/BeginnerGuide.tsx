'use client'

import { useMemo, useState, useSyncExternalStore } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, X, EyeOff } from 'lucide-react'
import { useWerewolfStore } from '@/lib/werewolf/store'
import { GamePhase, Player, RoleId } from '@/lib/werewolf/types'
import { cn } from '@/lib/utils'

// ============================================================================
// 引导文案映射表（按 阶段[+角色] 索引）
// ============================================================================
type GuideContent = { title: string; body: string; icon?: string }

const GUIDE_CONTENT: Record<string, GuideContent> = {
  'role-reveal': {
    title: '身份确认',
    body: '这是你的身份牌。记住自己的角色能力！点击下方按钮开始游戏，第一夜将由系统自动按顺序执行各角色行动。',
    icon: '🎴',
  },
  'night-guard:user:guard': {
    title: '守卫行动',
    body: '你是守卫🛡️。每夜选择一名玩家守护，被守护的玩家免疫狼刀。注意：不能连续两晚守护同一人（连守限制）。',
    icon: '🛡️',
  },
  'night-wolf:user:wolf': {
    title: '狼人行动',
    body: '你是狼人🐺。和同伴一起选择今晚要击杀的目标。选中目标后点击确认。所有狼人共享一个击杀目标。',
    icon: '🐺',
  },
  'night-wolf:user:white-wolf': {
    title: '白狼王行动',
    body: '你是白狼王🐺。夜晚和普通狼人一起刀人；白天任意时刻可点顶部"自爆"按钮发动技能，自爆带走一人后立即进入黑夜。',
    icon: '👑',
  },
  'night-seer:user:seer': {
    title: '预言家行动',
    body: '你是预言家🔮。每夜查验一名玩家的身份，结果会以弹窗展示"好人/狼人"。白天可跳身份报警徽流引导好人投票。',
    icon: '🔮',
  },
  'night-witch:user:witch': {
    title: '女巫行动',
    body: '你是女巫🧪。拥有一瓶解药和一瓶毒药，每夜只能用一瓶。解药可救当晚被刀的人，毒药可毒杀任意玩家。首夜可自救。',
    icon: '🧪',
  },
  'day-sheriff-announce': {
    title: '警长竞选',
    body: '是否上警？警长拥有1.5票投票权，并决定发言顺序。神职（尤其预言家）通常会上警抢归票位。',
    icon: '👑',
  },
  'day-sheriff-campaign:user': {
    title: '竞选发言',
    body: '你已上警，请发表竞选演讲。说明你为什么适合当警长，预言家可在此跳身份报警徽流。',
    icon: '🎤',
  },
  'day-discuss:user': {
    title: '白天讨论',
    body: '从警长右边开始依次发言。点击头像可标记金水/查杀（待实现）。发言结束后进入投票阶段。',
    icon: '💬',
  },
  'day-vote:user': {
    title: '投票放逐',
    body: '选择你认为是狼人的玩家投票。30秒未投票自动弃票。平票会进入PK环节。',
    icon: '🗳️',
  },
  'hunter-shoot:user:hunter': {
    title: '猎人开枪',
    body: '你已死亡🏹。如果是被狼刀/被投票放逐（非被毒），可开枪带走一名玩家。被毒杀则无法开枪。',
    icon: '🏹',
  },
  'sheriff-transfer:user': {
    title: '警徽移交',
    body: '你（警长）已死亡👑。选择一名存活玩家移交警徽（继承1.5票权），或撕毁警徽（本局无警长）。',
    icon: '👑',
  },
}

// ============================================================================
// 阶段 -> 引导 key 映射
// - role-reveal / day-sheriff-announce: 仅 phase
// - day-sheriff-campaign / day-discuss / day-vote / sheriff-transfer: phase:user
// - night-guard / night-wolf / night-seer / night-witch / hunter-shoot: phase:user:role
// ============================================================================
function buildGuideKey(
  phase: GamePhase,
  user: Player | undefined,
): string | null {
  if (!user) return null
  const role = user.role

  // 仅 phase 的引导
  if (phase === 'role-reveal' || phase === 'day-sheriff-announce') {
    return phase
  }

  // phase:user 引导（不限角色）
  if (
    phase === 'day-sheriff-campaign' ||
    phase === 'day-discuss' ||
    phase === 'day-vote' ||
    phase === 'sheriff-transfer'
  ) {
    // 用户必须存活（sheriff-transfer 例外：警长死亡触发移交）
    if (phase !== 'sheriff-transfer' && !user.isAlive) return null
    return `${phase}:user`
  }

  // phase:user:role 引导
  const roleSpecific: Partial<Record<GamePhase, RoleId[]>> = {
    'night-guard': ['guard'],
    'night-wolf': ['wolf', 'white-wolf'],
    'night-seer': ['seer'],
    'night-witch': ['witch'],
    'hunter-shoot': ['hunter'],
  }

  const allowedRoles = roleSpecific[phase]
  if (allowedRoles && allowedRoles.includes(role)) {
    return `${phase}:user:${role}`
  }

  return null
}

// ============================================================================
// "不再提示" localStorage 开关 —— 使用 useSyncExternalStore 同步
// ============================================================================
const DISABLE_KEY = 'werewolf_guide_disabled'

function readDisabled(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(DISABLE_KEY) === '1'
  } catch {
    return false
  }
}

function writeDisabled(v: boolean) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(DISABLE_KEY, v ? '1' : '0')
    // 触发同窗口的 storage 订阅（storage 事件默认不会在同窗口触发）
    window.dispatchEvent(new StorageEvent('storage', { key: DISABLE_KEY }))
  } catch {
    // ignore
  }
}

function subscribeDisabled(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener('storage', callback)
  return () => window.removeEventListener('storage', callback)
}

function getDisabledSnapshot(): boolean {
  return readDisabled()
}

function getDisabledServerSnapshot(): boolean {
  return false
}

// ============================================================================
// 主组件
// ============================================================================
export function BeginnerGuide() {
  const phase = useWerewolfStore((s) => s.phase)
  const view = useWerewolfStore((s) => s.view)
  const players = useWerewolfStore((s) => s.players)
  const userPlayerId = useWerewolfStore((s) => s.userPlayerId)
  const seenGuide = useWerewolfStore((s) => s.seenGuide)
  const markGuideSeen = useWerewolfStore((s) => s.markGuideSeen)

  // 全局"不再提示"开关 —— 通过 useSyncExternalStore 订阅 localStorage
  const globallyDisabled = useSyncExternalStore(
    subscribeDisabled,
    getDisabledSnapshot,
    getDisabledServerSnapshot,
  )

  const user = useMemo(
    () => players.find((p) => p.id === userPlayerId),
    [players, userPlayerId],
  )

  // 本轮已手动关闭的 key（防止在 markGuideSeen 写入 store 期间的瞬间闪烁）
  const [dismissedKey, setDismissedKey] = useState<string | null>(null)

  // 派生：当前应该展示的引导 key（不使用 effect，直接在 render 中计算）
  const activeKey = useMemo<string | null>(() => {
    // 仅在 role-reveal / game 视图内显示
    if (view !== 'game' && view !== 'role-reveal') return null
    if (globallyDisabled) return null

    const key = buildGuideKey(phase, user)
    if (!key) return null
    if (seenGuide[key]) return null
    if (dismissedKey === key) return null
    return key
  }, [view, phase, user, globallyDisabled, seenGuide, dismissedKey])

  const content: GuideContent | null = activeKey
    ? GUIDE_CONTENT[activeKey] ?? null
    : null

  // 关闭单条引导
  const handleDismiss = () => {
    if (!activeKey) return
    markGuideSeen(activeKey)
    setDismissedKey(activeKey)
  }

  // 一键全关（写入 localStorage + 当前已展示的所有 key）
  const handleDisableAll = () => {
    writeDisabled(true)
    if (activeKey) {
      markGuideSeen(activeKey)
      setDismissedKey(activeKey)
    }
  }

  return (
    <AnimatePresence>
      {content && (
        <motion.div
          key="bg-mask"
          className="fixed inset-0 z-[60] flex items-end justify-center pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          {/* 半透明遮罩（不阻挡底层点击，仅视觉聚焦） */}
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-[2px] pointer-events-auto"
            onClick={handleDismiss}
            aria-hidden
          />

          {/* 引导卡片 */}
          <motion.div
            key="guide-card"
            className={cn(
              'relative pointer-events-auto',
              'mb-[calc(env(safe-area-inset-bottom,0px)+1.25rem)]',
              'mx-3 w-full max-w-md',
              'rounded-2xl p-4 glass-card-strong',
              'border border-amber-300/30',
              'shadow-[0_8px_32px_rgba(0,0,0,0.45)]',
            )}
            initial={{ opacity: 0, y: 40, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 280, damping: 26 }}
            role="dialog"
            aria-modal="false"
            aria-label={content.title}
          >
            {/* 顶部装饰条 */}
            <div className="absolute -top-px left-6 right-6 h-px bg-gradient-to-r from-transparent via-amber-300/70 to-transparent" />

            {/* 关闭 X 按钮 */}
            <button
              type="button"
              onClick={handleDismiss}
              aria-label="关闭引导"
              className={cn(
                'absolute top-2.5 right-2.5 z-10',
                'w-7 h-7 rounded-full grid place-items-center',
                'bg-white/5 hover:bg-white/10 active:scale-95 transition',
                'text-amber-200/70 hover:text-amber-100',
              )}
            >
              <X className="w-3.5 h-3.5" />
            </button>

            {/* 标题 */}
            <div className="flex items-center gap-2 mb-2 pr-8">
              <span className="text-xl leading-none">{content.icon ?? '💡'}</span>
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                <h3 className="text-sm font-semibold text-amber-100 tracking-wide">
                  新手引导 · {content.title}
                </h3>
              </div>
            </div>

            {/* 正文 */}
            <p className="text-[13px] leading-relaxed text-amber-100/85 mb-3.5 whitespace-pre-wrap">
              {content.body}
            </p>

            {/* 按钮区 */}
            <div className="flex items-center justify-between gap-2">
              {/* 不再提示 */}
              <button
                type="button"
                onClick={handleDisableAll}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg',
                  'text-[11px] text-violet-200/80 hover:text-violet-100',
                  'bg-violet-500/10 hover:bg-violet-500/20',
                  'border border-violet-400/20 transition active:scale-95',
                )}
                aria-label="不再显示任何新手引导"
              >
                <EyeOff className="w-3 h-3" />
                不再提示
              </button>

              {/* 知道了 */}
              <button
                type="button"
                onClick={handleDismiss}
                className={cn(
                  'flex-1 max-w-[60%] py-2 rounded-lg',
                  'text-[13px] font-semibold text-slate-900',
                  'bg-gradient-to-r from-amber-300 to-amber-400',
                  'hover:from-amber-200 hover:to-amber-300',
                  'shadow-md shadow-amber-500/20',
                  'active:scale-[0.98] transition',
                )}
              >
                知道了
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default BeginnerGuide
