'use client'

import { useWerewolfStore } from '@/lib/werewolf/store'
import { SpeechRound, GameEvent } from '@/lib/werewolf/types'
import { GameLog } from './GameLog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Badge } from '@/components/ui/badge'
import { useState } from 'react'
import { MessageSquare, Bell, ScrollText, ChevronDown, History } from 'lucide-react'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'

// 单条发言气泡
function SpeechBubble({
  playerId,
  playerName,
  content,
  isUser,
  avatar,
}: {
  playerId: number
  playerName: string
  content: string
  isUser: boolean
  avatar?: string
}) {
  return (
    <div className={cn('flex gap-2 items-start text-xs', isUser && 'flex-row-reverse')}>
      <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-slate-600/60 to-slate-800/60 flex items-center justify-center text-base shrink-0">
        {avatar || '🙂'}
      </div>
      <div className={cn(
        'flex-1 rounded-xl px-2.5 py-1.5',
        isUser ? 'bg-amber-400/15 text-amber-100' : 'glass-card text-amber-100/85',
      )}>
        <div className="text-[10px] text-amber-200/60 mb-0.5">
          {playerName} · {playerId}号
        </div>
        <div className="leading-relaxed whitespace-pre-wrap break-words">{content}</div>
      </div>
    </div>
  )
}

// 历史发言轮次（可折叠）
function HistoryRound({ round, players, defaultOpen }: { round: SpeechRound; players: any[]; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen)
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-xl glass-card overflow-hidden">
      <CollapsibleTrigger className="w-full flex items-center justify-between px-3 py-2 hover:bg-amber-200/5 transition-colors">
        <div className="flex items-center gap-1.5 min-w-0">
          <History className="w-3.5 h-3.5 text-violet-300 shrink-0" />
          <span className="text-xs font-medium text-amber-100/90 truncate">{round.label}</span>
          <Badge variant="secondary" className="text-[9px] h-4 px-1.5 shrink-0 glass-card">
            {round.speeches.length}条
          </Badge>
        </div>
        <ChevronDown className={cn('w-3.5 h-3.5 text-amber-200/60 transition-transform shrink-0', open && 'rotate-180')} />
      </CollapsibleTrigger>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <CollapsibleContent className="px-2.5 pb-2.5 pt-0.5 space-y-1.5">
              {round.speeches.map((s, i) => {
                const sp = players.find((p) => p.id === s.playerId)
                return (
                  <SpeechBubble
                    key={i}
                    playerId={s.playerId}
                    playerName={s.playerName}
                    content={s.content}
                    isUser={s.isUser}
                    avatar={sp?.avatar}
                  />
                )
              })}
            </CollapsibleContent>
          </motion.div>
        )}
      </AnimatePresence>
    </Collapsible>
  )
}

// 事件条目
function EventItem({ ev }: { ev: GameEvent }) {
  const colorMap: Record<string, string> = {
    death: 'border-red-400/30 bg-red-400/5',
    vote: 'border-rose-400/30 bg-rose-400/5',
    sheriff: 'border-violet-400/30 bg-violet-400/5',
    skill: 'border-amber-400/30 bg-amber-400/5',
    phase: 'border-sky-400/30 bg-sky-400/5',
    result: 'border-emerald-400/30 bg-emerald-400/10',
  }
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      className={cn('flex items-start gap-2 px-2.5 py-2 rounded-lg border text-xs', colorMap[ev.category] || 'border-amber-200/15')}
    >
      <span className="text-base shrink-0 leading-none mt-0.5">{ev.icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-amber-100/90 font-medium leading-snug">{ev.title}</div>
        {ev.detail && <div className="text-[10px] text-amber-200/55 mt-0.5 leading-snug">{ev.detail}</div>}
        <div className="text-[9px] text-amber-100/35 mt-0.5">第{ev.day}天</div>
      </div>
    </motion.div>
  )
}

export function InfoPanel() {
  const speeches = useWerewolfStore((s) => s.speeches)
  const speechHistory = useWerewolfStore((s) => s.speechHistory)
  const events = useWerewolfStore((s) => s.events)
  const log = useWerewolfStore((s) => s.log)
  const players = useWerewolfStore((s) => s.players)
  const phase = useWerewolfStore((s) => s.phase)

  // 当前轮次标签
  const currentLabel = (() => {
    if (phase === 'day-sheriff-campaign') return '竞选警长'
    if (phase === 'day-discuss') return '白天讨论'
    if (phase === 'day-lastwords') return '遗言'
    if (phase === 'day-self-destruct') return '白狼王自爆'
    return '当前轮次'
  })()

  // 事件按倒序展示（最新在上）
  const reversedEvents = [...events].reverse()

  return (
    <Tabs defaultValue="discuss" className="h-full flex flex-col">
      <TabsList className="grid grid-cols-3 mx-2 mt-2 glass-card-strong">
        <TabsTrigger value="discuss" className="text-xs gap-1 data-[state=active]:bg-amber-400/20">
          <MessageSquare className="w-3.5 h-3.5" />
          讨论
          {speeches.length > 0 && (
            <Badge variant="secondary" className="text-[9px] h-4 px-1 ml-0.5">{speeches.length}</Badge>
          )}
        </TabsTrigger>
        <TabsTrigger value="events" className="text-xs gap-1 data-[state=active]:bg-amber-400/20">
          <Bell className="w-3.5 h-3.5" />
          事件
          {events.length > 0 && (
            <Badge variant="secondary" className="text-[9px] h-4 px-1 ml-0.5">{events.length}</Badge>
          )}
        </TabsTrigger>
        <TabsTrigger value="log" className="text-xs gap-1 data-[state=active]:bg-amber-400/20">
          <ScrollText className="w-3.5 h-3.5" />
          日志
        </TabsTrigger>
      </TabsList>

      {/* 讨论Tab：当前发言 + 历史轮次 */}
      <TabsContent value="discuss" className="flex-1 mt-0 min-h-0">
        <ScrollArea className="h-full scrollbar-thin">
          <div className="space-y-2 p-2">
            {/* 当前轮次发言 */}
            <div className="rounded-xl glass-card p-2">
              <div className="flex items-center justify-between px-1 pb-1.5">
                <span className="text-xs text-amber-200/80 flex items-center gap-1 font-medium">
                  <MessageSquare className="w-3 h-3" />
                  {currentLabel}
                </span>
                <Badge variant="secondary" className="text-[9px] h-4 px-1.5 glass-card">{speeches.length}条</Badge>
              </div>
              {speeches.length === 0 ? (
                <div className="text-center text-[11px] text-amber-100/40 py-4">暂无发言</div>
              ) : (
                <div className="space-y-1.5 px-0.5">
                  {speeches.map((s, i) => {
                    const sp = players.find((p) => p.id === s.playerId)
                    return (
                      <SpeechBubble
                        key={i}
                        playerId={s.playerId}
                        playerName={s.playerName}
                        content={s.content}
                        isUser={s.isUser}
                        avatar={sp?.avatar}
                      />
                    )
                  })}
                </div>
              )}
            </div>

            {/* 历史轮次 */}
            {speechHistory.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 px-1 pt-1">
                  <History className="w-3 h-3 text-violet-300" />
                  <span className="text-[11px] text-violet-200/70 font-medium">历史发言 ({speechHistory.length}轮)</span>
                </div>
                {[...speechHistory].reverse().map((round, i) => (
                  <HistoryRound
                    key={round.id}
                    round={round}
                    players={players}
                    defaultOpen={i === 0 && speeches.length === 0}
                  />
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
      </TabsContent>

      {/* 事件Tab */}
      <TabsContent value="events" className="flex-1 mt-0 min-h-0">
        <ScrollArea className="h-full scrollbar-thin">
          <div className="space-y-1.5 p-2">
            {reversedEvents.length === 0 ? (
              <div className="text-center text-[11px] text-amber-100/40 py-8">暂无关键事件</div>
            ) : (
              reversedEvents.map((ev) => <EventItem key={ev.id} ev={ev} />)
            )}
          </div>
        </ScrollArea>
      </TabsContent>

      {/* 日志Tab */}
      <TabsContent value="log" className="flex-1 mt-0 min-h-0">
        <GameLog logs={log} />
      </TabsContent>
    </Tabs>
  )
}
