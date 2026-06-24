'use client'

import { useWerewolfStore } from '@/lib/werewolf/store'
import { Player, GamePhase } from '@/lib/werewolf/types'
import { ROLES, isWolf } from '@/lib/werewolf/roles'
import { PlayerAvatar } from './PlayerAvatar'
import { GameLog } from './GameLog'
import { VoiceInput } from './VoiceInput'
import { SeerResultDialog } from './SeerResultDialog'
import { ToastTip } from './ToastTip'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { useMemo, useState } from 'react'
import {
  Moon, Sun, Skull, ScrollText, Send, SkipForward, Check, X,
  Shield, Crosshair, Eye, FlaskConical, Target, Loader2, ChevronUp, Bomb, Crown,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'

const PHASE_INFO: Record<GamePhase, { label: string; icon: any; desc: string; isNight: boolean }> = {
  'role-reveal': { label: '身份确认', icon: Moon, desc: '请查看你的身份', isNight: false },
  'night-start': { label: '黑夜降临', icon: Moon, desc: '天黑请闭眼', isNight: true },
  'night-guard': { label: '守卫行动', icon: Shield, desc: '守卫请睁眼', isNight: true },
  'night-wolf': { label: '狼人行动', icon: Crosshair, desc: '狼人请睁眼', isNight: true },
  'night-seer': { label: '预言家行动', icon: Eye, desc: '预言家请睁眼', isNight: true },
  'night-witch': { label: '女巫行动', icon: FlaskConical, desc: '女巫请睁眼', isNight: true },
  'night-end': { label: '天亮结算', icon: Sun, desc: '正在结算...', isNight: true },
  'day-sheriff-announce': { label: '警长竞选', icon: Crown, desc: '开始竞选警长', isNight: false },
  'day-sheriff-campaign': { label: '竞选发言', icon: Crown, desc: '候选人发言中', isNight: false },
  'day-sheriff-vote': { label: '警长投票', icon: Crown, desc: '投票选警长', isNight: false },
  'day-announce': { label: '公布死讯', icon: Sun, desc: '天亮了', isNight: false },
  'day-lastwords': { label: '临终遗言', icon: Skull, desc: '死者遗言', isNight: false },
  'day-discuss': { label: '白天讨论', icon: ScrollText, desc: '依次发言', isNight: false },
  'day-self-destruct': { label: '白狼王自爆', icon: Bomb, desc: '白狼王选择目标', isNight: false },
  'day-vote': { label: '投票放逐', icon: Target, desc: '请投票', isNight: false },
  'day-result': { label: '投票结果', icon: Sun, desc: '公布结果', isNight: false },
  'hunter-shoot': { label: '猎人开枪', icon: Crosshair, desc: '猎人请开枪', isNight: false },
  'sheriff-transfer': { label: '警徽移交', icon: Crown, desc: '警长移交警徽', isNight: false },
  'game-over': { label: '游戏结束', icon: Skull, desc: '', isNight: false },
}

export function GameScreen() {
  const state = useWerewolfStore()
  const {
    players, userPlayerId, phase, day, log, nightAction,
    speeches, votes, currentSpeaker, processing, speaking, winner,
    witchAntidoteUsed, witchPoisonUsed, lastGuardTarget,
  } = state

  const user = players.find((p) => p.id === userPlayerId)
  const [selectedTarget, setSelectedTarget] = useState<number | null>(null)
  const [witchSave, setWitchSave] = useState<boolean | null>(null)
  const [witchPoison, setWitchPoison] = useState<number | null>(null)
  const [speakText, setSpeakText] = useState('')
  const [showLog, setShowLog] = useState(false)
  const [selfDestructMode, setSelfDestructMode] = useState(false)

  const phaseInfo = PHASE_INFO[phase]
  const isNight = phaseInfo.isNight

  // 重置选择当阶段切换（渲染期间调整状态，React推荐模式）
  const [prevPhase, setPrevPhase] = useState<GamePhase>(phase)
  // 昼夜过渡满屏动画 (经典狼人杀"天黑请闭眼"/"天亮了")
  const [transition, setTransition] = useState<{ to: 'night' | 'day'; key: number } | null>(null)
  const [prevIsNight, setPrevIsNight] = useState(isNight)
  if (phase !== prevPhase) {
    setPrevPhase(phase)
    setSelectedTarget(null)
    setWitchSave(null)
    setWitchPoison(null)
    setSpeakText('')
    setSelfDestructMode(false)
  }
  // 检测昼夜切换: 只在 night-start(入夜) 和 day-announce(天亮) 触发
  if (isNight !== prevIsNight) {
    setPrevIsNight(isNight)
    if (phase === 'night-start' || phase === 'day-announce' || phase === 'day-sheriff-announce') {
      setTransition({ to: isNight ? 'night' : 'day', key: Date.now() })
      setTimeout(() => setTransition(null), 1800)
    }
  }

  // 判断用户是否需要行动
  const userAction = useMemo(() => {
    if (!user || !user.isAlive) {
      // 死亡用户在遗言阶段可发言
      if (phase === 'day-lastwords' && state.lastWordsPending.includes(userPlayerId)) return 'lastwords'
      return null
    }
    if (phase === 'night-guard' && user.role === 'guard') return 'guard'
    if (phase === 'night-wolf' && isWolf(user.role)) return 'wolf'
    if (phase === 'night-seer' && user.role === 'seer') return 'seer'
    if (phase === 'night-witch' && user.role === 'witch') return 'witch'
    if (phase === 'day-sheriff-campaign' && !state.sheriffCandidates.includes(userPlayerId)) {
      // 用户还没决定是否上警
      const alive = state.players.filter((p) => p.isAlive)
      const userIdx = alive.findIndex((p) => p.id === userPlayerId)
      // 简化：如果还没决定且轮到用户，显示上警选择
      if (state.sheriffCampaignIdx === 0) return 'sheriff-join'
    }
    if (phase === 'day-sheriff-campaign' && state.sheriffCandidates.includes(userPlayerId) && state.sheriffCandidates[state.sheriffCampaignIdx] === userPlayerId) return 'sheriff-speak'
    if (phase === 'day-sheriff-vote' && !state.sheriffCandidates.includes(userPlayerId)) {
      const voted = state.sheriffVotes.some((v) => v.voterId === userPlayerId)
      if (!voted) return 'sheriff-vote'
    }
    if (phase === 'day-lastwords' && state.lastWordsPending[0] === userPlayerId) return 'lastwords'
    if (phase === 'day-discuss' && currentSpeaker === user.id) return 'speak'
    // 白狼王自爆模式（用户主动触发）
    if (selfDestructMode && user.role === 'white-wolf' && phase === 'day-discuss') return 'self-destruct'
    // 系统进入白狼王自爆阶段（AI 触发后等待用户响应不会发生，但保留分支）
    if (phase === 'day-self-destruct' && state.whiteWolfSelfDestructPending === user.id) return 'self-destruct'
    if (phase === 'day-vote') return 'vote'
    if (phase === 'hunter-shoot' && state.hunterPending === user.id) return 'hunter'
    // 警徽移交
    if (phase === 'sheriff-transfer' && state.sheriffTransferPending === user.id) return 'sheriff-transfer'
    return null
  }, [phase, user, currentSpeaker, state.hunterPending, state.sheriffCandidates, state.sheriffCampaignIdx, state.sheriffVotes, state.lastWordsPending, state.whiteWolfSelfDestructPending, state.sheriffTransferPending, selfDestructMode, userPlayerId])

  // 可选择目标
  const selectableTargets = useMemo((): Player[] => {
    if (!user) return []
    const alive = players.filter((p) => p.isAlive)
    if (userAction === 'guard') {
      return alive.filter((p) => p.id !== lastGuardTarget)
    }
    if (userAction === 'wolf') {
      return alive.filter((p) => !isWolf(p.role))
    }
    if (userAction === 'seer') {
      return alive.filter((p) => p.id !== user.id)
    }
    if (userAction === 'witch') {
      return alive.filter((p) => p.id !== user.id)
    }
    if (userAction === 'vote') {
      return alive.filter((p) => p.id !== user.id)
    }
    if (userAction === 'sheriff-vote') {
      return alive.filter((p) => state.sheriffCandidates.includes(p.id))
    }
    if (userAction === 'hunter') {
      return alive
    }
    if (userAction === 'self-destruct') {
      return alive.filter((p) => p.id !== user.id)
    }
    if (userAction === 'sheriff-transfer') {
      return alive
    }
    return []
  }, [userAction, players, user, lastGuardTarget, state.sheriffCandidates])

  const canConfirm = useMemo(() => {
    if (userAction === 'guard' || userAction === 'wolf' || userAction === 'seer' || userAction === 'vote' || userAction === 'hunter' || userAction === 'sheriff-vote' || userAction === 'self-destruct') {
      return selectedTarget !== null
    }
    if (userAction === 'witch') {
      return witchSave !== null
    }
    // sheriff-transfer: 可以撕毁警徽(null)，也可以选择目标
    if (userAction === 'sheriff-transfer') {
      return true
    }
    return false
  }, [userAction, selectedTarget, witchSave])

  if (!user) return null

  // 用户被刀的目标（女巫视角）
  const witchWolfTarget = nightAction?.wolfTarget
  const witchCanSave = !witchAntidoteUsed
  const witchCanPoison = !witchPoisonUsed

  // 当前发言玩家
  const speaker = currentSpeaker !== null ? players.find((p) => p.id === currentSpeaker) : null

  // 上下文 AI 状态文案: 让用户清楚 AI 正在做什么 (v2.0 UX 优化)
  const aiStatusText = (() => {
    if (!processing && !speaking) return null
    switch (phase) {
      case 'night-wolf': return '🐺 狼人正在商议击杀目标...'
      case 'night-guard': return '🛡️ 守卫正在选择守护对象...'
      case 'night-witch': return '🧪 女巫正在考虑用药...'
      case 'night-seer': return '🔮 预言家正在查验身份...'
      case 'night-end': return '🌙 正在结算夜晚行动...'
      case 'day-sheriff-announce': return '🏛️ 玩家正在决定是否上警...'
      case 'day-sheriff-campaign': return speaker ? `🎤 ${speaker.name}正在发表竞选演讲...` : '🎤 候选人正在发言...'
      case 'day-sheriff-vote': return '🗳️ 玩家正在投票选警长...'
      case 'day-discuss': return speaker ? `🎤 ${speaker.name}(${speaker.id}号)正在发言...` : '🎤 玩家正在发言...'
      case 'day-vote': return '🗳️ 玩家正在投票...'
      case 'day-result': return '⚖️ 正在统计投票结果...'
      case 'hunter-shoot': return '🏹 猎人正在瞄准目标...'
      case 'sheriff-transfer': return '👑 警长正在移交警徽...'
      case 'day-lastwords': return speaker ? `💀 ${speaker.name}正在发表遗言...` : '💀 死者正在发表遗言...'
      default: return '⏳ 正在处理...'
    }
  })()

  const handleConfirm = () => {
    if (userAction === 'guard') {
      state.userNightAction({ guardTarget: selectedTarget ?? undefined })
    } else if (userAction === 'wolf') {
      state.userNightAction({ wolfTarget: selectedTarget ?? undefined })
    } else if (userAction === 'seer') {
      if (selectedTarget !== null) state.userNightAction({ seerTarget: selectedTarget })
    } else if (userAction === 'witch') {
      state.userNightAction({
        witchSave: witchSave === true,
        witchPoisonTarget: witchPoison ?? undefined,
      })
    } else if (userAction === 'vote' || userAction === 'sheriff-vote') {
      state.userVote(selectedTarget)
    } else if (userAction === 'hunter') {
      state.userHunterShoot(selectedTarget)
    } else if (userAction === 'self-destruct') {
      if (selectedTarget !== null) {
        state.userSelfDestruct(selectedTarget)
        setSelfDestructMode(false)
      }
    } else if (userAction === 'sheriff-transfer') {
      state.userSheriffTransfer(selectedTarget)
    }
  }

  const handleSpeak = () => {
    const text = speakText.trim()
    if (!text) return
    state.userSpeak(text)
    setSpeakText('')
  }

  const handleSheriffSpeak = () => {
    const text = speakText.trim()
    if (!text) return
    state.userSpeak(text)
    setSpeakText('')
  }

  const handleLastWords = () => {
    const text = speakText.trim()
    if (!text) return
    state.userLastWords(text)
    setSpeakText('')
  }

  return (
    <div className="relative min-h-screen flex flex-col overflow-hidden">
      {/* 预言家查验结果弹窗 */}
      <SeerResultDialog />
      {/* Toast 提示 */}
      <ToastTip />
      {/* 背景图 */}
      <div
        className={cn(
          'absolute inset-0 z-0 bg-cover bg-center transition-opacity duration-700',
          isNight ? 'opacity-50' : 'opacity-35',
        )}
        style={{ backgroundImage: `url(${isNight ? '/werewolf/night-bg.png' : '/werewolf/day-bg.png'})` }}
      />
      <div className={cn(
        'absolute inset-0 z-0 transition-colors duration-700',
        isNight ? 'bg-gradient-to-b from-violet-950/50 via-background/70 to-background' : 'bg-gradient-to-b from-amber-900/30 via-background/60 to-background'
      )} />

      {/* 昼夜过渡满屏动画 */}
      <AnimatePresence>
        {transition && (
          <motion.div
            key={transition.key}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className={cn(
              'fixed inset-0 z-50 flex items-center justify-center pointer-events-none',
              transition.to === 'night'
                ? 'bg-gradient-to-b from-violet-950 via-slate-950 to-black'
                : 'bg-gradient-to-b from-amber-200 via-orange-100 to-amber-50',
            )}
          >
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 1.2, opacity: 0 }}
              transition={{ duration: 0.5, type: 'spring' }}
              className="text-center"
            >
              {transition.to === 'night' ? (
                <>
                  <Moon className="w-16 h-16 mx-auto text-violet-300 mb-3" />
                  <div className="text-3xl font-bold text-violet-100 tracking-widest">天黑请闭眼</div>
                  <div className="text-sm text-violet-300/60 mt-2">🌙 第 {day} 夜降临</div>
                </>
              ) : (
                <>
                  <Sun className="w-16 h-16 mx-auto text-amber-500 mb-3" />
                  <div className="text-3xl font-bold text-amber-800 tracking-widest">天亮了</div>
                  <div className="text-sm text-amber-600/70 mt-2">☀️ 第 {day} 天开始</div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative z-10 flex flex-col min-h-screen safe-top">
        {/* 顶部状态栏 */}
        <header className="px-4 pt-3 pb-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className={cn(
                'w-10 h-10 rounded-xl flex items-center justify-center',
                isNight ? 'glass-card' : 'glass-card',
              )}>
                {isNight ? <Moon className="w-5 h-5 text-violet-300" /> : <Sun className="w-5 h-5 text-amber-300" />}
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-amber-100/50">第</span>
                  <span className="text-base font-bold text-amber-100">{day}</span>
                  <span className="text-xs text-amber-100/50">{isNight ? '夜' : '天'}</span>
                </div>
                <div className="text-xs text-amber-200/70">{phaseInfo.label}</div>
              </div>
            </div>

            {/* 我的身份徽章 */}
            <div className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gradient-to-r',
              ROLES[user.role].color,
            )}>
              <span className="text-sm">{ROLES[user.role].emoji}</span>
              <span className="text-xs font-bold text-white/95">{ROLES[user.role].name}</span>
            </div>

            {/* 日志按钮 */}
            <Sheet open={showLog} onOpenChange={setShowLog}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full glass-card text-amber-100 hover:bg-amber-200/10">
                  <ScrollText className="w-5 h-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[85%] sm:w-[400px] glass-card-strong border-amber-200/15 p-0">
                <SheetHeader className="px-4 py-3 border-b border-amber-200/10">
                  <SheetTitle className="flex items-center gap-2 text-amber-100">
                    <ScrollText className="w-4 h-4" />
                    游戏日志
                  </SheetTitle>
                </SheetHeader>
                <div className="h-[calc(100%-3.5rem)]">
                  <GameLog logs={log} />
                </div>
              </SheetContent>
            </Sheet>
          </div>

          {/* 阶段描述条 */}
          <div className="mt-2 flex items-center justify-center gap-2 px-3 py-1.5 rounded-full glass-card">
            {processing && <Loader2 className="w-3 h-3 animate-spin text-amber-300" />}
            <span className="text-xs text-amber-100/80">{phaseInfo.desc}</span>
            {aiStatusText && (
              <motion.span
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                className="text-xs text-violet-300 flex items-center gap-1"
              >
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
                {aiStatusText}
              </motion.span>
            )}
          </div>
        </header>

        {/* 玩家网格 */}
        <div className="flex-1 overflow-y-auto px-3 py-2 scrollbar-thin">
          <div className="grid grid-cols-4 gap-2">
            {players.map((p) => {
              const isUser = p.id === userPlayerId
              const isSelectable = selectableTargets.some((t) => t.id === p.id)
              const isSelected = selectedTarget === p.id
              const isWitchPoisonTarget = userAction === 'witch' && witchPoison === p.id
              const isCurrentSpeaker = phase === 'day-discuss' && currentSpeaker === p.id
              const isWolfTeammate = isWolf(user.role) && isWolf(p.role) && p.id !== user.id && p.isAlive

              return (
                <PlayerAvatar
                  key={p.id}
                  player={p}
                  size="sm"
                  isUser={isUser}
                  selectable={isSelectable && !processing}
                  selected={isSelected || isWitchPoisonTarget}
                  showRole={isUser || isWolfTeammate || winner !== null}
                  badge={isCurrentSpeaker ? '发言中' : p.id === state.sheriffId ? '警长' : isWolfTeammate ? '同伴' : undefined}
                  badgeColor={isCurrentSpeaker ? 'bg-amber-400' : p.id === state.sheriffId ? 'bg-violet-500' : 'bg-red-500'}
                  highlightRing={isCurrentSpeaker ? 'gold' : isSelected ? 'gold' : isWitchPoisonTarget ? 'red' : null}
                  onClick={() => {
                    if (!isSelectable || processing) return
                    if (userAction === 'witch') {
                      setWitchPoison((cur) => (cur === p.id ? null : p.id))
                    } else {
                      setSelectedTarget((cur) => (cur === p.id ? null : p.id))
                    }
                  }}
                />
              )
            })}
          </div>

          {/* 白天讨论区（含警长竞选、遗言） */}
          {(phase === 'day-discuss' || phase === 'day-vote' || phase === 'day-result' || phase === 'day-announce' || phase === 'day-sheriff-campaign' || phase === 'day-sheriff-vote' || phase === 'day-lastwords' || phase === 'day-sheriff-announce') && speeches.length > 0 && (
            <div className="mt-3 glass-card rounded-2xl p-2 max-h-52 overflow-hidden">
              <div className="flex items-center justify-between px-1 pb-1.5">
                <span className="text-xs text-amber-200/70 flex items-center gap-1">
                  <ScrollText className="w-3 h-3" />
                  {phase === 'day-lastwords' ? '遗言' : phase.startsWith('day-sheriff') ? '竞选发言' : '讨论记录'}
                </span>
                <span className="text-[10px] text-amber-100/40">{speeches.length}条</span>
              </div>
              <ScrollArea className="h-40 scrollbar-thin">
                <div className="space-y-1.5 px-1">
                  {speeches.map((s, i) => {
                    const sp = players.find((p) => p.id === s.playerId)
                    return (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={cn(
                          'flex gap-2 items-start text-xs',
                          s.isUser && 'flex-row-reverse',
                        )}
                      >
                        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-slate-600/60 to-slate-800/60 flex items-center justify-center text-base shrink-0">
                          {sp?.avatar || '🙂'}
                        </div>
                        <div className={cn(
                          'flex-1 rounded-xl px-2.5 py-1.5',
                          s.isUser ? 'bg-amber-400/15 text-amber-100' : 'glass-card text-amber-100/85',
                        )}>
                          <div className="text-[10px] text-amber-200/60 mb-0.5">
                            {s.playerName} · {s.playerId}号
                          </div>
                          <div className="leading-relaxed">{s.content}</div>
                        </div>
                      </motion.div>
                    )
                  })}
                </div>
              </ScrollArea>
            </div>
          )}

          {/* 警长竞选投票记录 */}
          {phase === 'day-sheriff-vote' && state.sheriffVotes.length > 0 && (
            <div className="mt-2 glass-card rounded-2xl p-2">
              <div className="text-xs text-amber-200/70 px-1 pb-1.5 flex items-center gap-1">
                <Target className="w-3 h-3" /> 警长投票 ({state.sheriffVotes.length})
              </div>
              <div className="flex flex-wrap gap-1">
                {state.sheriffVotes.map((v, i) => (
                  <Badge key={i} variant="secondary" className="text-[10px] glass-card">
                    {v.voterName}→{v.targetName || '弃票'}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* 投票记录展示 */}
          {phase === 'day-vote' && votes.length > 0 && (
            <div className="mt-2 glass-card rounded-2xl p-2">
              <div className="text-xs text-amber-200/70 px-1 pb-1.5 flex items-center gap-1">
                <Target className="w-3 h-3" /> 已投票 ({votes.length}/{players.filter((p) => p.isAlive).length})
              </div>
              <div className="flex flex-wrap gap-1">
                {votes.map((v, i) => (
                  <Badge key={i} variant="secondary" className="text-[10px] glass-card">
                    {v.voterName}→{v.targetName || '弃票'}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 底部操作栏 */}
        <footer className="px-3 pt-2 pb-3 border-t border-amber-200/10 glass-card-strong safe-bottom">
          <AnimatePresence mode="wait">
            {userAction === null && (
              <motion.div
                key="waiting"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center justify-center py-3"
              >
                <div className="flex items-center gap-2 text-sm text-amber-100/60">
                  {processing || speaking ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-violet-300" />
                      <span className="text-violet-200">{aiStatusText || '正在处理...'}</span>
                    </>
                  ) : phase === 'day-discuss' && speaker ? (
                    <>
                      <span className="text-lg">{speaker.avatar}</span>
                      <span>{speaker.name}({speaker.id}号) 正在发言...</span>
                    </>
                  ) : (
                    <span>等待其他玩家行动...</span>
                  )}
                </div>
              </motion.div>
            )}

            {/* 警长竞选：是否上警 */}
            {userAction === 'sheriff-join' && (
              <motion.div
                key="sheriff-join"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="space-y-2"
              >
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center">
                    <span className="text-base">🏛️</span>
                  </div>
                  <div>
                    <div className="text-sm font-bold text-amber-100">是否竞选警长？</div>
                    <div className="text-[10px] text-amber-100/50">警长拥有1.5票投票权，决定发言顺序</div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() => state.userJoinSheriff(true)}
                    disabled={processing}
                    className="flex-1 h-11 rounded-xl bg-gradient-to-r from-violet-500 to-purple-600 text-white font-bold disabled:opacity-40"
                  >
                    🏛️ 上警
                  </Button>
                  <Button
                    onClick={() => state.userJoinSheriff(false)}
                    variant="outline"
                    disabled={processing}
                    className="flex-1 h-11 rounded-xl glass-card"
                  >
                    不上警
                  </Button>
                </div>
              </motion.div>
            )}

            {/* 警长竞选发言 */}
            {userAction === 'sheriff-speak' && (
              <motion.div
                key="sheriff-speak"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="space-y-2"
              >
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center">
                    <span className="text-base">🏛️</span>
                  </div>
                  <div className="text-sm font-bold text-amber-100">请发表竞选演讲</div>
                </div>
                <div className="flex gap-2 items-end">
                  <VoiceInput
                    onTranscript={(t) => setSpeakText((cur) => (cur ? cur + ' ' : '') + t)}
                    disabled={processing}
                  />
                  <Textarea
                    value={speakText}
                    onChange={(e) => setSpeakText(e.target.value)}
                    placeholder="说明你上警的理由，表明身份..."
                    className="flex-1 min-h-[44px] max-h-24 resize-none glass-card border-amber-300/20 text-amber-100 placeholder:text-amber-100/40"
                    rows={1}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        handleSheriffSpeak()
                      }
                    }}
                  />
                  <Button
                    onClick={handleSheriffSpeak}
                    disabled={!speakText.trim() || processing}
                    size="icon"
                    className="h-11 w-11 rounded-full bg-gradient-to-r from-violet-500 to-purple-600 text-white disabled:opacity-40"
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
                <Button
                  onClick={() => state.skipSpeak()}
                  variant="ghost"
                  size="sm"
                  disabled={processing}
                  className="w-full h-8 text-xs text-amber-100/50"
                >
                  <SkipForward className="w-3 h-3 mr-1" />
                  跳过发言
                </Button>
              </motion.div>
            )}

            {/* 警长竞选投票 */}
            {userAction === 'sheriff-vote' && (
              <motion.div
                key="sheriff-vote"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center">
                      <Target className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-amber-100">投票选警长</div>
                      <div className="text-[10px] text-amber-100/50">
                        {selectedTarget !== null ? `投票给 ${selectedTarget}号` : '选择候选人'}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() => state.userSheriffVote(null)}
                    variant="outline"
                    disabled={processing}
                    className="flex-1 h-11 rounded-xl glass-card"
                  >
                    <X className="w-4 h-4 mr-1" />弃票
                  </Button>
                  <Button
                    onClick={handleConfirm}
                    disabled={!canConfirm || processing}
                    className="flex-1 h-11 rounded-xl bg-gradient-to-r from-violet-500 to-purple-600 text-white font-bold disabled:opacity-40"
                  >
                    <Check className="w-4 h-4 mr-1" />
                    确认投票
                  </Button>
                </div>
              </motion.div>
            )}

            {/* 死亡遗言 */}
            {userAction === 'lastwords' && (
              <motion.div
                key="lastwords"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="space-y-2"
              >
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-rose-500 to-red-700 flex items-center justify-center">
                    <Skull className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-amber-100">你已死亡，请发表遗言</div>
                    <div className="text-[10px] text-amber-100/50">留下最后的线索或祝福</div>
                  </div>
                </div>
                <div className="flex gap-2 items-end">
                  <VoiceInput
                    onTranscript={(t) => setSpeakText((cur) => (cur ? cur + ' ' : '') + t)}
                    disabled={processing}
                  />
                  <Textarea
                    value={speakText}
                    onChange={(e) => setSpeakText(e.target.value)}
                    placeholder="留下你的遗言..."
                    className="flex-1 min-h-[44px] max-h-24 resize-none glass-card border-amber-300/20 text-amber-100 placeholder:text-amber-100/40"
                    rows={1}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        handleLastWords()
                      }
                    }}
                  />
                  <Button
                    onClick={handleLastWords}
                    disabled={!speakText.trim() || processing}
                    size="icon"
                    className="h-11 w-11 rounded-full bg-gradient-to-r from-rose-500 to-red-600 text-white disabled:opacity-40"
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
                <Button
                  onClick={() => state.skipLastWords()}
                  variant="ghost"
                  size="sm"
                  disabled={processing}
                  className="w-full h-8 text-xs text-amber-100/50"
                >
                  <SkipForward className="w-3 h-3 mr-1" />
                  不留遗言
                </Button>
              </motion.div>
            )}

            {/* 夜晚行动 */}
            {(userAction === 'guard' || userAction === 'wolf' || userAction === 'seer') && (
              <motion.div
                key={userAction}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={cn('w-8 h-8 rounded-lg bg-gradient-to-br flex items-center justify-center', ROLES[user.role].color)}>
                      {userAction === 'guard' && <Shield className="w-4 h-4 text-white" />}
                      {userAction === 'wolf' && <Crosshair className="w-4 h-4 text-white" />}
                      {userAction === 'seer' && <Eye className="w-4 h-4 text-white" />}
                    </div>
                    <div>
                      <div className="text-sm font-bold text-amber-100">{ROLES[user.role].actionPrompt}</div>
                      <div className="text-[10px] text-amber-100/50">
                        {userAction === 'guard' && lastGuardTarget !== null && `不可选${lastGuardTarget}号(连守限制)`}
                        {userAction === 'wolf' && '选择今晚要击杀的目标'}
                        {userAction === 'seer' && '选择要查验身份的玩家'}
                      </div>
                    </div>
                  </div>
                  {selectedTarget !== null && (
                    <Badge className="bg-amber-400 text-amber-950">
                      已选 {selectedTarget}号
                    </Badge>
                  )}
                </div>
                <Button
                  onClick={handleConfirm}
                  disabled={!canConfirm || processing}
                  size="lg"
                  className="w-full h-12 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 text-amber-950 font-bold disabled:opacity-40 active:scale-95 transition-all"
                >
                  <Check className="w-4 h-4 mr-1" />
                  确认
                </Button>
              </motion.div>
            )}

            {/* 女巫行动 */}
            {userAction === 'witch' && (
              <motion.div
                key="witch"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="space-y-2"
              >
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center">
                    <FlaskConical className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-bold text-amber-100">女巫行动</div>
                    <div className="text-[10px] text-amber-100/50">
                      {witchWolfTarget !== undefined ? `今晚${witchWolfTarget}号被刀` : '今晚平安'}
                    </div>
                  </div>
                </div>

                {/* 解药 */}
                {witchCanSave && witchWolfTarget !== undefined && witchSave === null && (
                  <div className="glass-card rounded-xl p-2.5">
                    <div className="text-xs text-amber-100/80 mb-2">是否使用解药救活 {witchWolfTarget}号？</div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => setWitchSave(true)}
                        className="flex-1 h-9 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-white"
                      >
                        <Check className="w-3.5 h-3.5 mr-1" />使用解药
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setWitchSave(false)}
                        className="flex-1 h-9 rounded-lg glass-card"
                      >
                        <X className="w-3.5 h-3.5 mr-1" />不救
                      </Button>
                    </div>
                  </div>
                )}

                {/* 毒药选择 */}
                {witchCanPoison && witchSave !== null && (
                  <div className="glass-card rounded-xl p-2.5">
                    <div className="text-xs text-amber-100/80 mb-1.5">
                      {witchPoison !== null ? `将毒杀 ${witchPoison}号` : '是否使用毒药？选择目标或跳过'}
                    </div>
                    {witchPoison !== null && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setWitchPoison(null)}
                        className="h-7 text-xs text-amber-200/70 px-2"
                      >
                        取消毒药选择
                      </Button>
                    )}
                  </div>
                )}

                <Button
                  onClick={handleConfirm}
                  disabled={witchSave === null || processing}
                  size="lg"
                  className="w-full h-12 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold disabled:opacity-40 active:scale-95 transition-all"
                >
                  <Check className="w-4 h-4 mr-1" />
                  确认行动
                </Button>
              </motion.div>
            )}

            {/* 白天发言 */}
            {userAction === 'speak' && (
              <motion.div
                key="speak"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="space-y-2"
              >
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
                    <span className="text-base">🗣️</span>
                  </div>
                  <div className="text-sm font-bold text-amber-100">轮到你发言了</div>
                  {/* 白狼王自爆按钮 (v2.0 §8.8) */}
                  {user.role === 'white-wolf' && !selfDestructMode && (
                    <Button
                      onClick={() => setSelfDestructMode(true)}
                      disabled={processing}
                      size="sm"
                      className="ml-auto h-8 rounded-lg bg-gradient-to-r from-rose-600 to-red-800 text-white font-bold animate-pulse"
                    >
                      <Bomb className="w-3.5 h-3.5 mr-1" />
                      自爆
                    </Button>
                  )}
                </div>
                {selfDestructMode && user.role === 'white-wolf' ? (
                  <div className="glass-card rounded-xl p-2.5 border border-rose-400/40">
                    <div className="text-xs text-rose-200 mb-2 flex items-center gap-1">
                      <Bomb className="w-3.5 h-3.5" />
                      白狼王自爆将带走一名玩家并立即进入黑夜，你本人无遗言。请选择目标：
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => setSelfDestructMode(false)}
                        variant="outline"
                        disabled={processing}
                        className="flex-1 h-10 rounded-lg glass-card"
                      >
                        <X className="w-3.5 h-3.5 mr-1" />取消
                      </Button>
                      <Button
                        onClick={handleConfirm}
                        disabled={!canConfirm || processing}
                        className="flex-1 h-10 rounded-lg bg-gradient-to-r from-rose-600 to-red-800 text-white font-bold disabled:opacity-40"
                      >
                        <Bomb className="w-3.5 h-3.5 mr-1" />
                        确认自爆
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex gap-2 items-end">
                      <VoiceInput
                        onTranscript={(t) => setSpeakText((cur) => (cur ? cur + ' ' : '') + t)}
                        disabled={processing}
                      />
                      <Textarea
                        value={speakText}
                        onChange={(e) => setSpeakText(e.target.value)}
                        placeholder="输入你的发言，或点击麦克风语音..."
                        className="flex-1 min-h-[44px] max-h-24 resize-none glass-card border-amber-300/20 text-amber-100 placeholder:text-amber-100/40"
                        rows={1}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault()
                            handleSpeak()
                          }
                        }}
                      />
                      <Button
                        onClick={handleSpeak}
                        disabled={!speakText.trim() || processing}
                        size="icon"
                        className="h-11 w-11 rounded-full bg-gradient-to-r from-amber-400 to-orange-500 text-amber-950 disabled:opacity-40"
                      >
                        <Send className="w-4 h-4" />
                      </Button>
                    </div>
                    <Button
                      onClick={() => state.skipSpeak()}
                      variant="ghost"
                      size="sm"
                      disabled={processing}
                      className="w-full h-8 text-xs text-amber-100/50"
                    >
                      <SkipForward className="w-3 h-3 mr-1" />
                      跳过发言
                    </Button>
                  </>
                )}
              </motion.div>
            )}

            {/* 白狼王自爆（独立阶段，AI 触发或用户主动触发后） */}
            {userAction === 'self-destruct' && phase === 'day-self-destruct' && (
              <motion.div
                key="self-destruct-phase"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="space-y-2"
              >
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-rose-600 to-red-800 flex items-center justify-center animate-pulse">
                    <Bomb className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-rose-200">💥 白狼王自爆</div>
                    <div className="text-[10px] text-amber-100/60">
                      {selectedTarget !== null ? `将带走 ${selectedTarget}号，立即进入黑夜` : '选择要带走的玩家'}
                    </div>
                  </div>
                </div>
                <Button
                  onClick={handleConfirm}
                  disabled={!canConfirm || processing}
                  size="lg"
                  className="w-full h-12 rounded-xl bg-gradient-to-r from-rose-600 to-red-800 text-white font-bold disabled:opacity-40 active:scale-95 transition-all"
                >
                  <Bomb className="w-4 h-4 mr-1" />
                  确认自爆
                </Button>
              </motion.div>
            )}

            {/* 警徽移交 */}
            {userAction === 'sheriff-transfer' && (
              <motion.div
                key="sheriff-transfer"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="space-y-2"
              >
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center">
                    <Crown className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-amber-100">🏛️ 警徽移交</div>
                    <div className="text-[10px] text-amber-100/60">
                      {selectedTarget !== null ? `移交给 ${selectedTarget}号` : '选择继任者或撕毁警徽'}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() => state.userSheriffTransfer(null)}
                    variant="outline"
                    disabled={processing}
                    className="flex-1 h-11 rounded-xl glass-card"
                  >
                    <X className="w-4 h-4 mr-1" />撕毁警徽
                  </Button>
                  <Button
                    onClick={handleConfirm}
                    disabled={!canConfirm || processing || selectedTarget === null}
                    className="flex-1 h-11 rounded-xl bg-gradient-to-r from-violet-500 to-purple-700 text-white font-bold disabled:opacity-40"
                  >
                    <Check className="w-4 h-4 mr-1" />
                    移交警徽
                  </Button>
                </div>
              </motion.div>
            )}

            {/* 投票 */}
            {userAction === 'vote' && (
              <motion.div
                key="vote"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-rose-500 to-red-700 flex items-center justify-center">
                      <Target className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-amber-100">请投票放逐</div>
                      <div className="text-[10px] text-amber-100/50">
                        {selectedTarget !== null ? `投票给 ${selectedTarget}号` : '选择你认为是狼人的玩家'}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() => state.userVote(null)}
                    variant="outline"
                    disabled={processing}
                    className="flex-1 h-11 rounded-xl glass-card"
                  >
                    <X className="w-4 h-4 mr-1" />弃票
                  </Button>
                  <Button
                    onClick={handleConfirm}
                    disabled={!canConfirm || processing}
                    className="flex-1 h-11 rounded-xl bg-gradient-to-r from-rose-500 to-red-600 text-white font-bold disabled:opacity-40"
                  >
                    <Check className="w-4 h-4 mr-1" />
                    确认投票
                  </Button>
                </div>
              </motion.div>
            )}

            {/* 猎人开枪 */}
            {userAction === 'hunter' && (
              <motion.div
                key="hunter"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="space-y-2"
              >
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-700 flex items-center justify-center">
                    <Crosshair className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-amber-100">🏹 猎人开枪</div>
                    <div className="text-[10px] text-amber-100/50">
                      {selectedTarget !== null ? `将带走 ${selectedTarget}号` : '选择目标或不开枪'}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() => state.userHunterShoot(null)}
                    variant="outline"
                    disabled={processing}
                    className="flex-1 h-11 rounded-xl glass-card"
                  >
                    不开枪
                  </Button>
                  <Button
                    onClick={handleConfirm}
                    disabled={!canConfirm || processing}
                    className="flex-1 h-11 rounded-xl bg-gradient-to-r from-amber-500 to-orange-700 text-white font-bold disabled:opacity-40"
                  >
                    <Crosshair className="w-4 h-4 mr-1" />
                    开枪
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </footer>
      </div>
    </div>
  )
}
