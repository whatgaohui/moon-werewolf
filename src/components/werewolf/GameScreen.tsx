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
  Shield, Crosshair, Eye, FlaskConical, Target, Loader2, ChevronUp,
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
  'day-announce': { label: '公布死讯', icon: Sun, desc: '天亮了', isNight: false },
  'day-discuss': { label: '白天讨论', icon: ScrollText, desc: '依次发言', isNight: false },
  'day-vote': { label: '投票放逐', icon: Target, desc: '请投票', isNight: false },
  'day-result': { label: '投票结果', icon: Sun, desc: '公布结果', isNight: false },
  'hunter-shoot': { label: '猎人开枪', icon: Crosshair, desc: '猎人请开枪', isNight: false },
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

  const phaseInfo = PHASE_INFO[phase]
  const isNight = phaseInfo.isNight

  // 重置选择当阶段切换（渲染期间调整状态，React推荐模式）
  const [prevPhase, setPrevPhase] = useState<GamePhase>(phase)
  if (phase !== prevPhase) {
    setPrevPhase(phase)
    setSelectedTarget(null)
    setWitchSave(null)
    setWitchPoison(null)
    setSpeakText('')
  }

  // 判断用户是否需要行动
  const userAction = useMemo(() => {
    if (!user || !user.isAlive) return null
    if (phase === 'night-guard' && user.role === 'guard') return 'guard'
    if (phase === 'night-wolf' && isWolf(user.role)) return 'wolf'
    if (phase === 'night-seer' && user.role === 'seer') return 'seer'
    if (phase === 'night-witch' && user.role === 'witch') return 'witch'
    if (phase === 'day-discuss' && currentSpeaker === user.id) return 'speak'
    if (phase === 'day-vote') return 'vote'
    if (phase === 'hunter-shoot' && state.hunterPending === user.id) return 'hunter'
    return null
  }, [phase, user, currentSpeaker, state.hunterPending])

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
      // 毒杀目标
      return alive.filter((p) => p.id !== user.id)
    }
    if (userAction === 'vote') {
      return alive.filter((p) => p.id !== user.id)
    }
    if (userAction === 'hunter') {
      return alive
    }
    return []
  }, [userAction, players, user, lastGuardTarget])

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
    } else if (userAction === 'vote') {
      state.userVote(selectedTarget)
    } else if (userAction === 'hunter') {
      state.userHunterShoot(selectedTarget)
    }
  }

  const handleSpeak = () => {
    const text = speakText.trim()
    if (!text) return
    state.userSpeak(text)
    setSpeakText('')
  }

  const canConfirm = useMemo(() => {
    if (userAction === 'guard' || userAction === 'wolf' || userAction === 'seer' || userAction === 'vote' || userAction === 'hunter') {
      return selectedTarget !== null
    }
    if (userAction === 'witch') {
      return witchSave !== null
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
            {speaking && <span className="text-xs text-violet-300 animate-pulse">AI思考中...</span>}
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
                  badge={isCurrentSpeaker ? '发言中' : isWolfTeammate ? '同伴' : undefined}
                  badgeColor={isCurrentSpeaker ? 'bg-amber-400' : 'bg-red-500'}
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

          {/* 白天讨论区 */}
          {(phase === 'day-discuss' || phase === 'day-vote' || phase === 'day-result' || phase === 'day-announce') && (
            <div className="mt-3 glass-card rounded-2xl p-2 max-h-52 overflow-hidden">
              <div className="flex items-center justify-between px-1 pb-1.5">
                <span className="text-xs text-amber-200/70 flex items-center gap-1">
                  <ScrollText className="w-3 h-3" />
                  讨论记录
                </span>
                <span className="text-[10px] text-amber-100/40">{speeches.length}条发言</span>
              </div>
              <ScrollArea className="h-40 scrollbar-thin">
                <div className="space-y-1.5 px-1">
                  {speeches.length === 0 && phase === 'day-discuss' && (
                    <div className="text-center text-xs text-amber-100/40 py-4">
                      {speaker ? `${speaker.name}(${speaker.id}号) 即将发言...` : '等待发言...'}
                    </div>
                  )}
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
                  {processing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-amber-300" />
                      <span>正在处理...</span>
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
                </div>
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
