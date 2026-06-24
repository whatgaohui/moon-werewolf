'use client'

import { useState, useRef, useCallback } from 'react'
import { Mic, Square, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface VoiceInputProps {
  onTranscript: (text: string) => void
  disabled?: boolean
}

type Status = 'idle' | 'recording' | 'processing'

export function VoiceInput({ onTranscript, disabled }: VoiceInputProps) {
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)

  const startRecording = useCallback(async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mr = new MediaRecorder(stream)
      chunksRef.current = []
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      mr.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        // 转成 wav 简化：直接发webm，后端读base64
        streamRef.current?.getTracks().forEach((t) => t.stop())
        await processAudio(blob)
      }
      mr.start()
      mediaRecorderRef.current = mr
      setStatus('recording')
    } catch (e: any) {
      console.error('录音失败', e)
      setError('无法访问麦克风，请检查权限')
      setStatus('idle')
    }
  }, [])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
  }, [])

  const processAudio = async (blob: Blob) => {
    setStatus('processing')
    try {
      const formData = new FormData()
      formData.append('audio', blob, 'recording.webm')
      const res = await fetch('/api/werewolf/asr', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (data.success && data.text) {
        onTranscript(data.text)
      } else {
        setError('识别失败，请重试或直接输入文字')
      }
    } catch (e: any) {
      console.error('ASR失败', e)
      setError('语音识别失败')
    } finally {
      setStatus('idle')
    }
  }

  if (status === 'recording') {
    return (
      <Button
        type="button"
        variant="destructive"
        size="icon"
        onClick={stopRecording}
        disabled={disabled}
        className="rounded-full w-11 h-11 shadow-lg animate-pulse-glow shrink-0"
        title="停止录音"
      >
        <Square className="w-4 h-4 fill-white" />
      </Button>
    )
  }

  if (status === 'processing') {
    return (
      <Button
        type="button"
        variant="secondary"
        size="icon"
        disabled
        className="rounded-full w-11 h-11 shadow-lg shrink-0"
        title="识别中"
      >
        <Loader2 className="w-4 h-4 animate-spin" />
      </Button>
    )
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      onClick={startRecording}
      disabled={disabled}
      className="rounded-full w-11 h-11 glass-card border-amber-300/30 text-amber-200 hover:bg-amber-300/10 shrink-0"
      title="语音发言"
    >
      <Mic className="w-4 h-4" />
    </Button>
  )
}
