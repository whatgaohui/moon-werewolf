'use client'

import { LogEntry } from '@/lib/werewolf/types'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { useEffect, useRef } from 'react'
import { Skull, Moon, Sun, MessageSquare, Vote, Crown, Settings } from 'lucide-react'

const TYPE_ICON: Record<string, any> = {
  system: Settings,
  night: Moon,
  day: Sun,
  speech: MessageSquare,
  vote: Vote,
  death: Skull,
  action: Crown,
  result: Crown,
}

const TYPE_COLOR: Record<string, string> = {
  system: 'text-amber-100/60',
  night: 'text-violet-300',
  day: 'text-amber-300',
  speech: 'text-sky-200',
  vote: 'text-rose-300',
  death: 'text-red-400',
  action: 'text-emerald-300',
  result: 'text-amber-200 font-bold',
}

interface GameLogProps {
  logs: LogEntry[]
}

export function GameLog({ logs }: GameLogProps) {
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [logs.length])

  return (
    <div className="h-full flex flex-col">
      <ScrollArea className="flex-1 scrollbar-thin">
        <div className="space-y-1.5 p-2">
          {logs.map((log) => {
            const Icon = TYPE_ICON[log.type] || Settings
            return (
              <div
                key={log.id}
                className={cn(
                  'flex items-start gap-2 text-xs leading-relaxed px-2 py-1.5 rounded-lg',
                  log.type === 'result' && 'bg-amber-400/10',
                  log.type === 'speech' && 'bg-sky-400/5',
                  log.type === 'vote' && 'bg-rose-400/5',
                )}
              >
                <Icon className={cn('w-3.5 h-3.5 mt-0.5 shrink-0', TYPE_COLOR[log.type])} />
                <span className={cn('flex-1', TYPE_COLOR[log.type])}>{log.content}</span>
              </div>
            )
          })}
          <div ref={endRef} />
        </div>
      </ScrollArea>
    </div>
  )
}
