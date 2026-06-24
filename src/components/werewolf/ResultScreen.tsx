'use client'

import { useMemo, useState } from 'react'
import { useWerewolfStore } from '@/lib/werewolf/store'
import { ROLES, isWolf } from '@/lib/werewolf/roles'
import {
  Player,
  GameEvent,
  GameConfig,
  Difficulty,
} from '@/lib/werewolf/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Home,
  RotateCcw,
  Trophy,
  Clock,
  CalendarDays,
  Users,
  Gauge,
  ScrollText,
  Target,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

// ============================================================
// 常量映射
// ============================================================

// 事件分类配色（对齐 InfoPanel.EventItem）
const EVENT_COLOR: Record<GameEvent['category'], string> = {
  death: 'border-red-400/30 bg-red-400/5',
  vote: 'border-rose-400/30 bg-rose-400/5',
  sheriff: 'border-violet-400/30 bg-violet-400/5',
  skill: 'border-amber-400/30 bg-amber-400/5',
  phase: 'border-sky-400/30 bg-sky-400/5',
  result: 'border-emerald-400/30 bg-emerald-400/10',
}

// 时间轴节点圆点配色
const NODE_COLOR: Record<GameEvent['category'], string> = {
  death: 'bg-red-400',
  vote: 'bg-rose-400',
  sheriff: 'bg-violet-400',
  skill: 'bg-amber-400',
  phase: 'bg-sky-400',
  result: 'bg-emerald-400',
}

const DIFFICULTY_META: Record<Difficulty, { text: string; cls: string }> = {
  easy: { text: '简单', cls: 'text-emerald-200 bg-emerald-500/15 ring-1 ring-emerald-400/30' },
  normal: { text: '普通', cls: 'text-amber-200 bg-amber-500/15 ring-1 ring-amber-400/30' },
  hard: { text: '困难', cls: 'text-rose-200 bg-rose-500/15 ring-1 ring-rose-400/30' },
}

const RULESET_LABEL: Record<GameConfig['ruleSet'], string> = {
  'tu-bian': '屠边',
  'tu-cheng': '屠城',
}

// ============================================================
// 时间轴片段类型
// ============================================================

interface TimelineSection {
  id: string
  label: string // "第1夜" / "第1天"
  day: number
  isNight: boolean
  events: GameEvent[]
}

// 关键操作类型
interface KeyAction {
  id: string
  emoji: string
  title: string
  detail?: string
  tone: 'good' | 'wolf' | 'neutral'
}

// ============================================================
// 工具函数
// ============================================================

function formatDuration(start: number, end: number): string {
  if (!start) return '--:--'
  const seconds = Math.max(0, Math.floor((end - start) / 1000))
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0')
  const s = (seconds % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

// 将扁平事件流拆分为"夜 / 天"片段
function buildTimeline(events: GameEvent[]): TimelineSection[] {
  const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp)
  const sections: TimelineSection[] = []
  let current: TimelineSection | null = null

  for (const ev of sorted) {
    // phase 事件作为片段边界
    if (ev.category === 'phase') {
      if (ev.title.includes('夜降临')) {
        current = {
          id: `night-${ev.day}`,
          label: `第${ev.day}夜`,
          day: ev.day,
          isNight: true,
          events: [ev],
        }
        sections.push(current)
        continue
      }
      if (ev.title.includes('天亮')) {
        current = {
          id: `day-${ev.day}`,
          label: `第${ev.day}天`,
          day: ev.day,
          isNight: false,
          events: [ev],
        }
        sections.push(current)
        continue
      }
    }
    // 其它事件归入当前片段
    if (!current) {
      // 兜底：极少数情况下首个事件不是夜降临（如重新进入结算页时 events 已存在但首条 phase 缺失）
      current = {
        id: `misc-${ev.day}`,
        label: `第${ev.day}天`,
        day: ev.day,
        isNight: false,
        events: [],
      }
      sections.push(current)
    }
    current.events.push(ev)
  }
  return sections
}

// 从事件流提取关键操作
function extractKeyActions(events: GameEvent[], players: Player[]): KeyAction[] {
  const actions: KeyAction[] = []

  for (const ev of events) {
    // 平安夜 → 推断守卫守护成功
    if (ev.category === 'phase' && ev.title.includes('平安夜')) {
      actions.push({
        id: `ka-guard-${ev.id}`,
        emoji: '🛡️',
        title: '守卫守护成功',
        detail: `第${ev.day}夜平安夜，狼刀被挡`,
        tone: 'good',
      })
      continue
    }

    // 女巫毒中狼人（detail 或 title 含"毒"，且死者是狼阵营）
    if (
      ev.category === 'death' &&
      (ev.detail?.includes('毒') || ev.title.includes('毒'))
    ) {
      const m = ev.title.match(/^(\d+)号/)
      if (m) {
        const pid = parseInt(m[1], 10)
        const target = players.find((p) => p.id === pid)
        if (target && isWolf(target.role)) {
          actions.push({
            id: `ka-witch-${ev.id}`,
            emoji: '🧪',
            title: '女巫毒中狼人',
            detail: `${target.name}(${pid}号) 被毒杀`,
            tone: 'good',
          })
        }
      }
      continue
    }

    // 猎人开枪带走
    if (
      ev.category === 'skill' &&
      ev.icon === '🏹' &&
      ev.title.includes('猎人开枪')
    ) {
      actions.push({
        id: `ka-hunter-${ev.id}`,
        emoji: '🏹',
        title: '猎人开枪带走',
        detail: ev.detail,
        tone: 'good',
      })
      continue
    }

    // 白狼王自爆带走
    if (
      ev.category === 'skill' &&
      ev.icon === '💥' &&
      ev.title.includes('白狼王自爆')
    ) {
      actions.push({
        id: `ka-bomb-${ev.id}`,
        emoji: '💥',
        title: '白狼王自爆带走',
        detail: ev.detail,
        tone: 'wolf',
      })
      continue
    }

    // 警长当选
    if (ev.category === 'sheriff' && ev.title.includes('当选警长')) {
      actions.push({
        id: `ka-sheriff-${ev.id}`,
        emoji: '🏛️',
        title: '警长当选',
        detail: ev.detail,
        tone: 'neutral',
      })
      continue
    }

    // 警徽流执行
    if (ev.category === 'sheriff' && ev.title.includes('警徽移交')) {
      actions.push({
        id: `ka-transfer-${ev.id}`,
        emoji: '👑',
        title: '警徽流执行',
        detail: ev.detail,
        tone: 'neutral',
      })
      continue
    }

    // 平票PK
    if (ev.category === 'vote' && ev.icon === '⚖️' && ev.title.includes('平票')) {
      actions.push({
        id: `ka-pk-${ev.id}`,
        emoji: '⚖️',
        title: '投票平票PK',
        detail: ev.detail,
        tone: 'neutral',
      })
      continue
    }
  }

  return actions
}

// ============================================================
// 子组件
// ============================================================

function StatCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode
  label: string
  value: React.ReactNode
  sub?: React.ReactNode
}) {
  return (
    <div className="glass-card rounded-xl p-2.5 flex flex-col items-center text-center min-h-[68px] justify-center">
      <div className="text-amber-200/80 mb-1 flex items-center gap-1">
        {icon}
      </div>
      <div className="text-sm font-bold text-amber-100 leading-tight tabular-nums">
        {value}
      </div>
      <div className="text-[10px] text-amber-100/55 mt-0.5 flex items-center gap-1">
        {label}
        {sub}
      </div>
    </div>
  )
}

function TimelineNode({ ev }: { ev: GameEvent }) {
  return (
    <div className="relative pl-6 pb-2 last:pb-0">
      <span
        className={cn(
          'absolute left-[3px] top-[10px] w-2 h-2 rounded-full ring-2 ring-background/80',
          NODE_COLOR[ev.category],
        )}
      />
      <motion.div
        initial={{ opacity: 0, x: -6 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.25 }}
        className={cn(
          'flex items-start gap-2 px-2.5 py-2 rounded-lg border text-xs',
          EVENT_COLOR[ev.category],
        )}
      >
        <span className="text-base shrink-0 leading-none mt-0.5">{ev.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="text-amber-100/90 font-medium leading-snug break-words">
            {ev.title}
          </div>
          {ev.detail && (
            <div className="text-[10px] text-amber-200/55 mt-0.5 leading-snug break-words">
              {ev.detail}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  )
}

function TimelineSectionView({
  section,
  index,
}: {
  section: TimelineSection
  index: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 * index, duration: 0.3 }}
    >
      <div className="flex items-center gap-1.5 mb-1.5 mt-2">
        <span className="text-sm">{section.isNight ? '🌙' : '☀️'}</span>
        <span
          className={cn(
            'text-xs font-bold',
            section.isNight ? 'text-violet-200' : 'text-amber-200',
          )}
        >
          {section.label}
        </span>
        <Badge
          variant="secondary"
          className="text-[9px] h-4 px-1.5 glass-card text-amber-100/70"
        >
          {section.events.length}条
        </Badge>
        {section.isNight && (
          <span className="text-[10px] text-violet-200/50 ml-auto">夜间事件</span>
        )}
        {!section.isNight && (
          <span className="text-[10px] text-amber-200/50 ml-auto">白天事件</span>
        )}
      </div>
      <div className="relative">
        {/* 左侧竖线（仅在该片段内部连续） */}
        <span className="absolute left-[7px] top-2 bottom-2 w-px bg-gradient-to-b from-amber-200/25 via-amber-200/12 to-transparent" />
        {section.events.map((ev) => (
          <TimelineNode key={ev.id} ev={ev} />
        ))}
      </div>
    </motion.div>
  )
}

function KeyActionCard({
  action,
  index,
}: {
  action: KeyAction
  index: number
}) {
  const toneCls: Record<KeyAction['tone'], string> = {
    good: 'border-emerald-400/35 bg-emerald-400/8',
    wolf: 'border-rose-400/35 bg-rose-400/8',
    neutral: 'border-violet-400/35 bg-violet-400/8',
  }
  const iconBg: Record<KeyAction['tone'], string> = {
    good: 'bg-emerald-400/15',
    wolf: 'bg-rose-400/15',
    neutral: 'bg-violet-400/15',
  }
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{
        delay: 0.04 * index,
        type: 'spring',
        duration: 0.4,
      }}
      className={cn(
        'flex items-center gap-2 px-2.5 py-2 rounded-xl border text-xs',
        toneCls[action.tone],
      )}
    >
      <span
        className={cn(
          'w-7 h-7 rounded-lg flex items-center justify-center text-base shrink-0',
          iconBg[action.tone],
        )}
      >
        {action.emoji}
      </span>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-amber-100/90 truncate">
          {action.title}
        </div>
        {action.detail && (
          <div className="text-[10px] text-amber-200/55 truncate">
            {action.detail}
          </div>
        )}
      </div>
    </motion.div>
  )
}

// ============================================================
// 主组件
// ============================================================

export function ResultScreen() {
  const players = useWerewolfStore((s) => s.players)
  const userPlayerId = useWerewolfStore((s) => s.userPlayerId)
  const winner = useWerewolfStore((s) => s.winner)
  const winnerCause = useWerewolfStore((s) => s.winnerCause)
  const config = useWerewolfStore((s) => s.config)
  const events = useWerewolfStore((s) => s.events)
  const gameStartTime = useWerewolfStore((s) => s.gameStartTime)
  const restart = useWerewolfStore((s) => s.restart)
  const goToMenu = useWerewolfStore((s) => s.goToMenu)

  // 进入结算页即锁定"对局结束时刻"，避免持续重渲染
  const [endTime] = useState(() => Date.now())

  const user = players.find((p) => p.id === userPlayerId)
  const userWon = winner ? ROLES[user?.role ?? 'villager'].faction === winner : false

  const wolves = players.filter((p) => isWolf(p.role))
  const goods = players.filter((p) => !isWolf(p.role))

  // 对局数据
  const duration = formatDuration(gameStartTime, endTime)
  const fallbackDay = user?.deathDay || 1
  const totalDays = useMemo(() => {
    if (events.length === 0) return fallbackDay
    return Math.max(...events.map((e) => e.day))
  }, [events, fallbackDay])
  const aliveCount = players.filter((p) => p.isAlive).length
  const totalCount = players.length

  // 时间轴 + 关键操作
  const timeline = useMemo(() => buildTimeline(events), [events])
  const keyActions = useMemo(
    () => extractKeyActions(events, players),
    [events, players],
  )

  // 早退守卫：所有 hooks 已调用完毕
  if (!user || !winner) return null

  const userRole = ROLES[user.role]

  const diffMeta = config ? DIFFICULTY_META[config.difficulty] : null
  const ruleLabel = config ? RULESET_LABEL[config.ruleSet] : null

  return (
    <div className="relative min-h-screen w-full flex flex-col overflow-hidden starry-bg">
      <div
        className="absolute inset-0 z-0 bg-cover bg-center opacity-50"
        style={{ backgroundImage: 'url(/werewolf/victory-bg.png)' }}
      />
      <div
        className={`absolute inset-0 z-0 ${
          userWon
            ? 'bg-gradient-to-b from-amber-900/30 via-background/60 to-background'
            : 'bg-gradient-to-b from-slate-900/60 via-background/70 to-background'
        }`}
      />

      <div className="relative z-10 flex flex-col min-h-screen px-4 sm:px-6 py-6 safe-top safe-bottom overflow-y-auto scrollbar-thin">
        {/* ========== 胜负标题 ========== */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8, y: -20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: 'spring', duration: 0.7 }}
          className="flex flex-col items-center mt-4 mb-5"
        >
          <div className="text-7xl mb-2 animate-float">
            {userWon ? '🏆' : '💔'}
          </div>
          <h1
            className={`text-4xl font-black text-glow-strong ${
              userWon ? 'text-amber-200' : 'text-rose-300'
            }`}
          >
            {userWon ? '胜利！' : '失败...'}
          </h1>
          <div
            className={`mt-2 px-4 py-1.5 rounded-full ${
              winner === 'good'
                ? 'bg-emerald-500/20 text-emerald-200'
                : 'bg-red-500/20 text-red-200'
            } text-sm font-bold`}
          >
            {winner === 'good' ? '✨ 好人阵营胜利' : '🐺 狼人阵营胜利'}
          </div>
          {winnerCause && (
            <div className="mt-1.5 text-[11px] text-amber-100/55">
              胜负原因：{winnerCause}
            </div>
          )}
        </motion.div>

        {/* ========== 对局数据 ========== */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.35 }}
          className="glass-card-strong rounded-3xl p-3 mb-4"
        >
          <h3 className="text-sm font-bold text-amber-200 mb-2.5 flex items-center gap-1.5">
            <ScrollText className="w-4 h-4" />
            对局数据
          </h3>
          <div className="grid grid-cols-3 gap-2">
            <StatCard
              icon={<Clock className="w-3.5 h-3.5" />}
              label="对局时长"
              value={duration}
            />
            <StatCard
              icon={<CalendarDays className="w-3.5 h-3.5" />}
              label="总天数"
              value={`${totalDays}天`}
            />
            <StatCard
              icon={<Users className="w-3.5 h-3.5" />}
              label="存活/总"
              value={`${aliveCount}/${totalCount}`}
            />
            <StatCard
              icon={<Gauge className="w-3.5 h-3.5" />}
              label="AI 难度"
              value={
                diffMeta ? (
                  <span className={diffMeta.cls + ' px-1.5 py-0.5 rounded-md text-[11px]'}>
                    {diffMeta.text}
                  </span>
                ) : (
                  '-'
                )
              }
            />
            <StatCard
              icon={<Target className="w-3.5 h-3.5" />}
              label="胜利规则"
              value={ruleLabel || '-'}
            />
            <StatCard
              icon={<Trophy className="w-3.5 h-3.5" />}
              label="对局规模"
              value={config ? `${config.playerCount}人` : '-'}
            />
          </div>
        </motion.div>

        {/* ========== 玩家身份揭晓 ========== */}
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
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {players.map((p) => {
              const r = ROLES[p.role]
              const isUser = p.id === userPlayerId
              return (
                <div
                  key={p.id}
                  className={`relative flex flex-col items-center p-2 rounded-xl ${
                    isUser
                      ? 'bg-amber-400/15 ring-1 ring-amber-300/40'
                      : 'bg-amber-200/5'
                  }`}
                >
                  <div
                    className={`w-10 h-10 rounded-lg bg-gradient-to-br ${r.color} flex items-center justify-center text-lg mb-1 ${
                      !p.isAlive ? 'player-dead' : ''
                    }`}
                  >
                    {p.avatar}
                  </div>
                  <div className="text-[10px] text-amber-100/60">{p.id}号</div>
                  <div className="text-xs font-bold text-amber-100 truncate max-w-full">
                    {p.name}
                  </div>
                  <div className="text-[10px] text-amber-100/50 mt-0.5">
                    {r.emoji} {r.name}
                  </div>
                  {!p.isAlive && (
                    <div className="absolute -top-1 -right-1 text-xs">💀</div>
                  )}
                </div>
              )
            })}
          </div>
        </motion.div>

        {/* ========== 阵营统计 ========== */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="grid grid-cols-2 gap-3 mb-4"
        >
          <div className="glass-card rounded-2xl p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <span className="text-base">🐺</span>
              <span className="text-xs font-bold text-rose-200">狼人阵营</span>
              <Badge
                variant="secondary"
                className="ml-auto text-[9px] h-4 px-1.5 bg-rose-500/15 text-rose-200"
              >
                {wolves.filter((p) => p.isAlive).length}/{wolves.length} 存活
              </Badge>
            </div>
            <div className="space-y-1">
              {wolves.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between text-[11px]"
                >
                  <span className="text-amber-100/70 truncate">
                    {p.id}号 {p.name}
                  </span>
                  <span
                    className={
                      p.isAlive ? 'text-emerald-300' : 'text-rose-300'
                    }
                  >
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
              <Badge
                variant="secondary"
                className="ml-auto text-[9px] h-4 px-1.5 bg-emerald-500/15 text-emerald-200"
              >
                {goods.filter((p) => p.isAlive).length}/{goods.length} 存活
              </Badge>
            </div>
            <div className="space-y-1 max-h-32 overflow-y-auto scrollbar-thin">
              {goods.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between text-[11px]"
                >
                  <span className="text-amber-100/70 truncate">
                    {p.id}号 {p.name}
                  </span>
                  <span
                    className={
                      p.isAlive ? 'text-emerald-300' : 'text-rose-300'
                    }
                  >
                    {p.isAlive ? '存活' : '出局'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* ========== 时间轴复盘 ========== */}
        {timeline.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="glass-card-strong rounded-3xl p-4 mb-4"
          >
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm font-bold text-amber-200 flex items-center gap-1.5">
                <ScrollText className="w-4 h-4" />
                时间轴复盘
              </h3>
              <Badge
                variant="secondary"
                className="text-[9px] h-4 px-1.5 glass-card text-amber-100/70"
              >
                {events.length}条事件
              </Badge>
            </div>
            <div className="mt-1">
              {timeline.map((section, i) => (
                <TimelineSectionView
                  key={section.id}
                  section={section}
                  index={i}
                />
              ))}
            </div>
          </motion.div>
        )}

        {/* ========== 关键操作高亮 ========== */}
        {keyActions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="glass-card-strong rounded-3xl p-4 mb-4"
          >
            <div className="flex items-center justify-between mb-2.5">
              <h3 className="text-sm font-bold text-amber-200 flex items-center gap-1.5">
                <Target className="w-4 h-4" />
                关键操作
              </h3>
              <Badge
                variant="secondary"
                className="text-[9px] h-4 px-1.5 bg-amber-500/15 text-amber-200"
              >
                {keyActions.length}项
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {keyActions.map((a, i) => (
                <KeyActionCard key={a.id} action={a} index={i} />
              ))}
            </div>
          </motion.div>
        )}

        {/* ========== 我的角色总结 ========== */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className={`glass-card-strong rounded-2xl p-4 mb-4 ${
            userWon ? 'ring-1 ring-amber-300/40' : ''
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${userRole.color} flex items-center justify-center text-3xl ${
                !user.isAlive ? 'player-dead' : ''
              }`}
            >
              {userRole.emoji}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-lg font-bold text-amber-100">
                  {userRole.name}
                </span>
                {userWon ? (
                  <Badge className="bg-amber-400 text-amber-950 text-xs">
                    胜利
                  </Badge>
                ) : (
                  <Badge
                    variant="secondary"
                    className="bg-rose-500/20 text-rose-200 text-xs"
                  >
                    失败
                  </Badge>
                )}
                <span className="text-[10px] text-amber-100/45">
                  {user.id}号
                </span>
              </div>
              <div className="text-xs text-amber-100/60 mt-0.5">
                {user.isAlive
                  ? '存活到结尾'
                  : `第${user.deathDay || '?'}天出局 · ${
                      user.deathReason || ''
                    }`}
              </div>
              <div className="text-[10px] text-amber-100/45 mt-0.5 leading-snug">
                {userRole.description}
              </div>
            </div>
          </div>
        </motion.div>

        {/* ========== 操作按钮 ========== */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
          className="flex flex-col gap-3 mt-auto pt-2"
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
