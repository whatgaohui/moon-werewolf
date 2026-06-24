// 游戏音效系统 - 使用 Web Audio API 生成程序化音效，无需音频文件

let audioCtx: AudioContext | null = null

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
    } catch (e) {
      console.warn('AudioContext not supported')
      return null
    }
  }
  return audioCtx
}

// 播放一个简单的音调
function playTone(freq: number, duration: number, type: OscillatorType = 'sine', volume = 0.15, delay = 0) {
  const ctx = getCtx()
  if (!ctx) return
  if (ctx.state === 'suspended') ctx.resume()

  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = type
  osc.frequency.value = freq
  gain.gain.setValueAtTime(0, ctx.currentTime + delay)
  gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + delay + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + duration)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(ctx.currentTime + delay)
  osc.stop(ctx.currentTime + delay + duration)
}

// 播放和弦（多个音调叠加）
function playChord(freqs: number[], duration: number, type: OscillatorType = 'sine', volume = 0.1) {
  freqs.forEach((f) => playTone(f, duration, type, volume))
}

// 音效定义
export const sfx = {
  // 点击/选择
  click: () => playTone(800, 0.08, 'sine', 0.12),
  select: () => {
    playTone(600, 0.06, 'sine', 0.1)
    playTone(900, 0.08, 'sine', 0.1, 0.04)
  },
  // 确认
  confirm: () => {
    playTone(523, 0.1, 'sine', 0.12) // C5
    playTone(659, 0.1, 'sine', 0.12, 0.08) // E5
    playTone(784, 0.15, 'sine', 0.12, 0.16) // G5
  },
  // 夜晚降临
  night: () => {
    playTone(220, 0.6, 'sine', 0.15)
    playTone(165, 0.8, 'sine', 0.12, 0.1)
  },
  // 白天到来
  day: () => {
    playTone(523, 0.15, 'triangle', 0.12)
    playTone(659, 0.15, 'triangle', 0.12, 0.1)
    playTone(784, 0.2, 'triangle', 0.12, 0.2)
  },
  // 死亡
  death: () => {
    playTone(440, 0.15, 'sawtooth', 0.12)
    playTone(330, 0.2, 'sawtooth', 0.1, 0.1)
    playTone(220, 0.4, 'sawtooth', 0.08, 0.2)
  },
  // 投票
  vote: () => playTone(500, 0.1, 'square', 0.08),
  // 胜利
  victory: () => {
    const notes = [523, 659, 784, 1047] // C E G C
    notes.forEach((n, i) => playTone(n, 0.3, 'triangle', 0.15, i * 0.12))
  },
  // 失败
  defeat: () => {
    playTone(440, 0.3, 'sawtooth', 0.12)
    playTone(330, 0.4, 'sawtooth', 0.1, 0.15)
    playTone(220, 0.6, 'sawtooth', 0.08, 0.3)
  },
  // 查验结果
  reveal: () => {
    playTone(880, 0.1, 'sine', 0.1)
    playTone(1100, 0.15, 'sine', 0.1, 0.08)
  },
  // 狼人睁眼
  wolfWake: () => {
    playTone(150, 0.3, 'sawtooth', 0.1)
    playTone(120, 0.4, 'sawtooth', 0.08, 0.1)
  },
  // 预言家查验
  seerScan: () => {
    playTone(660, 0.1, 'sine', 0.1)
    playTone(880, 0.1, 'sine', 0.1, 0.08)
    playTone(1100, 0.15, 'sine', 0.1, 0.16)
  },
  // 女巫药水
  potion: () => {
    playTone(500, 0.15, 'triangle', 0.1)
    playTone(700, 0.2, 'triangle', 0.1, 0.1)
  },
  // 猎人开枪
  shoot: () => {
    playTone(1000, 0.05, 'square', 0.15)
    playTone(200, 0.3, 'sawtooth', 0.12, 0.02)
  },
  // 提示音
  tip: () => playTone(700, 0.06, 'sine', 0.08),
  // 错误
  error: () => {
    playTone(300, 0.1, 'square', 0.1)
    playTone(250, 0.15, 'square', 0.1, 0.08)
  },
}

// 音效开关（存localStorage）
let _enabled = true
export function isSfxEnabled() {
  if (typeof window === 'undefined') return true
  if (_enabled === null) {
    _enabled = localStorage.getItem('werewolf-sfx') !== 'off'
  }
  return _enabled
}
let _initialized = false
export function setSfxEnabled(on: boolean) {
  _enabled = on
  if (typeof window !== 'undefined') {
    localStorage.setItem('werewolf-sfx', on ? 'on' : 'off')
  }
}

// 安全播放（检查开关）
export function play(name: keyof typeof sfx) {
  if (!_initialized) {
    _initialized = true
    if (typeof window !== 'undefined') {
      _enabled = localStorage.getItem('werewolf-sfx') !== 'off'
    }
  }
  if (!_enabled) return
  try {
    sfx[name]()
  } catch (e) {
    // 忽略音频错误
  }
}
