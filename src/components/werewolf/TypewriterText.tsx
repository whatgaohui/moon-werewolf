'use client'

import { useEffect, useRef, useState } from 'react'
import { useWerewolfStore } from '@/lib/werewolf/store'
import { SpeechSpeed } from '@/lib/werewolf/types'
import { cn } from '@/lib/utils'

/**
 * AI 发言打字机效果组件
 *
 * 逐字展示文本，模拟真人发言节奏：
 *  - slow    : 60ms/字  沉浸感
 *  - normal  : 25ms/字  默认
 *  - fast    :  0ms/字  瞬间显示
 *
 * 速度档位优先取 props.speed，未传则回落到 store.speechSpeed。
 * 点击文本区域可立即跳过至完整内容。
 */

export interface TypewriterTextProps {
  text: string
  /** 打字速度，不传则使用 store.speechSpeed */
  speed?: SpeechSpeed
  /** 打字完成回调（每次 text 变化后仅触发一次） */
  onComplete?: () => void
  /** 自定义容器类名 */
  className?: string
  /** 是否显示闪烁光标，默认 true */
  showCursor?: boolean
}

const SPEED_MS: Record<SpeechSpeed, number> = {
  slow: 60,
  normal: 25,
  fast: 0,
}

export function TypewriterText({
  text,
  speed,
  onComplete,
  className,
  showCursor = true,
}: TypewriterTextProps) {
  const storeSpeed = useWerewolfStore((s) => s.speechSpeed)
  const effectiveSpeed: SpeechSpeed = speed ?? storeSpeed
  const interval = SPEED_MS[effectiveSpeed]
  const isFastMode = interval === 0

  const [displayedLength, setDisplayedLength] = useState(0)
  const [prevText, setPrevText] = useState(text)
  const completedRef = useRef(false)
  const onCompleteRef = useRef(onComplete)

  // 持有最新 onComplete 引用，避免 stale closure 导致漏触发
  useEffect(() => {
    onCompleteRef.current = onComplete
  }, [onComplete])

  // text 变化时重置：采用 React 推荐的「render 期调整 state」模式
  // 详见 https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  if (text !== prevText) {
    setPrevText(text)
    setDisplayedLength(0)
  }

  // 完成标记需在 effect 中重置（refs 不可在 render 期写入）
  // 声明在 typewriter effect 之前，确保重置先于打字判定
  useEffect(() => {
    completedRef.current = false
  }, [text])

  // fast 档位直接派生为完整长度（无需 setState，避免 effect 级联渲染）
  const visibleLength = isFastMode ? text.length : displayedLength
  const isComplete = visibleLength >= text.length

  // 递归 setTimeout 实现逐字渲染（setState 仅在异步回调中调用，符合规则）
  useEffect(() => {
    if (isComplete) {
      if (!completedRef.current) {
        completedRef.current = true
        onCompleteRef.current?.()
      }
      return
    }
    const timer = setTimeout(() => {
      setDisplayedLength((prev) => Math.min(prev + 1, text.length))
    }, interval)
    return () => clearTimeout(timer)
  }, [displayedLength, isComplete, text, interval])

  // 点击跳过：立即显示全部
  const handleSkip = () => {
    if (!isComplete && !isFastMode) setDisplayedLength(text.length)
  }

  return (
    <div
      onClick={handleSkip}
      className={cn(
        'whitespace-pre-wrap break-words leading-relaxed',
        !isComplete && 'cursor-pointer',
        className,
      )}
    >
      <span>{text.slice(0, visibleLength)}</span>
      {showCursor && !isComplete && (
        <span
          aria-hidden="true"
          className="animate-pulse text-amber-300/80 ml-0.5 font-light"
        >
          |
        </span>
      )}
    </div>
  )
}
