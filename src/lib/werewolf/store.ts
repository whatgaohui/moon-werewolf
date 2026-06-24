import { create } from 'zustand'
import {
  WerewolfGameState,
  GameConfig,
  Player,
  GamePhase,
  LogEntry,
  NightAction,
  Speech,
  VoteRecord,
  RoleId,
} from './types'
import { ROLES, isWolf } from './roles'
import {
  initPlayers,
  alivePlayers,
  aliveWolves,
  checkWinner,
  resolveNight,
  tallyVotes,
  logId,
  shuffle,
  randomPick,
} from './engine'
import { countRoles } from './configs'
import { play as playSfx } from './sfx'
import { recordGame } from './stats'

interface WerewolfStore extends WerewolfGameState {
  // 视图导航
  goToSetup: () => void
  goToMenu: () => void
  startGame: (config: GameConfig, preferredRole?: string) => void
  confirmRoleReveal: () => void
  restart: () => void

  // 日志
  addLog: (entry: Omit<LogEntry, 'id' | 'timestamp'>) => void
  showToast: (content: string, type?: 'info' | 'success' | 'danger') => void
  clearToast: () => void
  confirmSeerResult: () => void

  // 夜晚行动（用户）
  userNightAction: (action: Partial<NightAction>) => Promise<void>

  // 白天发言（用户）
  userSpeak: (content: string) => Promise<void>
  skipSpeak: () => Promise<void>

  // 投票（用户）
  userVote: (targetId: number | null) => Promise<void>

  // 猎人开枪
  userHunterShoot: (targetId: number | null) => Promise<void>

  // 推进流程
  proceedNightPhase: () => Promise<void>
  proceedDayPhase: () => Promise<void>

  // 内部
  _setProcessing: (v: boolean) => void
  _setPhase: (p: GamePhase) => void
}

const initialState: WerewolfGameState = {
  view: 'menu',
  config: null,
  players: [],
  userPlayerId: 0,
  phase: 'role-reveal',
  day: 0,
  log: [],
  nightAction: null,
  speeches: [],
  votes: [],
  currentSpeaker: null,
  winner: null,
  witchAntidoteUsed: false,
  witchPoisonUsed: false,
  lastGuardTarget: null,
  hunterPending: null,
  killedThisNight: [],
  speaking: false,
  processing: false,
  seerResultPending: null,
  toast: null,
}

// 调用AI后端
async function callAI(body: any): Promise<any> {
  try {
    const res = await fetch('/api/werewolf/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const txt = await res.text()
      console.error('AI API error', res.status, txt)
      return null
    }
    return await res.json()
  } catch (e) {
    console.error('AI call failed', e)
    return null
  }
}

// 等待
function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

// 游戏结束处理（记录战绩+音效）
function finishGame(winner: 'wolf' | 'good', day: number) {
  const state = get()
  const user = state.players.find((p) => p.id === state.userPlayerId)
  if (user && state.config) {
    const userWon = ROLES[user.role].faction === winner
    playSfx(userWon ? 'victory' : 'defeat')
    // 记录战绩
    recordGame({
      configId: state.config.id,
      configName: state.config.name,
      playerCount: state.config.playerCount,
      role: user.role,
      roleName: ROLES[user.role].name,
      won: userWon,
      survived: user.isAlive,
      day,
    })
  }
  set({ winner, phase: 'game-over', processing: false })
  setTimeout(() => set({ view: 'result' }), 1200)
}

export const useWerewolfStore = create<WerewolfStore>((set, get) => ({
  ...initialState,

  goToSetup: () => set({ view: 'setup' }),
  goToMenu: () => set({ ...initialState }),

  startGame: (config, preferredRole = 'random') => {
    const players = initPlayers(config, preferredRole)
    const user = players.find((p) => p.isUser)!
    const roleCount = countRoles(config.roles as string[])

    const log: LogEntry[] = [
      {
        id: logId(),
        type: 'system',
        day: 0,
        phase: 'role-reveal',
        content: `游戏开始！本局配置：${config.name}，共${config.playerCount}人。你的身份偏好：${preferredRole === 'random' ? '随机' : preferredRole === 'good' ? '好人阵营' : preferredRole === 'wolf' ? '狼人阵营' : ROLES[preferredRole as RoleId]?.name || preferredRole}`,
        timestamp: Date.now(),
      },
    ]

    set({
      ...initialState,
      view: 'role-reveal',
      config,
      players,
      userPlayerId: user.id,
      phase: 'role-reveal',
      day: 0,
      log,
      winner: null,
    })
  },

  confirmRoleReveal: () => {
    set({ view: 'game', phase: 'night-start', day: 1 })
    // 自动进入夜晚流程
    setTimeout(() => {
      get().proceedNightPhase()
    }, 600)
  },

  restart: () => set({ ...initialState, view: 'menu' }),

  addLog: (entry) =>
    set((s) => ({
      log: [...s.log, { ...entry, id: logId(), timestamp: Date.now() }],
    })),

  showToast: (content, type = 'info') => {
    const id = logId()
    set({ toast: { id, content, type } })
    // 3秒后自动清除
    setTimeout(() => {
      const cur = get().toast
      if (cur && cur.id === id) set({ toast: null })
    }, 3000)
  },

  clearToast: () => set({ toast: null }),

  confirmSeerResult: () => {
    // 用户确认查验结果后，推进夜晚流程
    set({ seerResultPending: null })
    const state = get()
    const nextPhase: Record<string, GamePhase> = {
      'night-guard': 'night-wolf',
      'night-wolf': 'night-seer',
      'night-seer': 'night-witch',
      'night-witch': 'night-end',
    }
    const np = nextPhase['night-seer']
    set({ phase: np, processing: false })
    setTimeout(() => {
      get().proceedNightPhase()
    }, 300)
  },

  _setProcessing: (v) => set({ processing: v }),
  _setPhase: (p) => set({ phase: p }),

  // ========== 夜晚流程 ==========
  proceedNightPhase: async () => {
    const state = get()
    if (state.processing) return
    set({ processing: true })

    let phase = state.phase
    const day = state.day
    const players = state.players

    // 初始化夜晚行动记录
    if (phase === 'night-start') {
      get().addLog({
        type: 'night',
        day,
        phase: 'night-start',
        content: `🌙 第 ${day} 夜降临，天黑请闭眼...`,
      })
      playSfx('night')
      set({
        nightAction: { day, deaths: [] },
        killedThisNight: [],
      })
      // 清除上轮标记
      set({
        players: players.map((p) => ({
          ...p,
          protected: false,
          saved: false,
          poisoned: false,
        })),
      })
      phase = 'night-guard'
    }

    // ---- 守卫 ----
    if (phase === 'night-guard') {
      const guard = state.players.find((p) => p.isAlive && p.role === 'guard')
      if (guard) {
        get().addLog({
          type: 'night',
          day,
          phase: 'night-guard',
          content: '🛡️ 守卫请睁眼，选择今晚守护的玩家...',
        })
        if (guard.isUser) {
          // 等待用户输入
          set({ phase: 'night-guard', processing: false })
          return
        } else {
          // AI 守卫决策
          const aiRes = await callAI({
            action: 'night-guard',
            playerId: guard.id,
            players: get().players.map((p) => ({
              id: p.id,
              name: p.name,
              avatar: p.avatar,
              alive: p.isAlive,
              isUser: p.isUser,
              role: p.role, // AI自己知道自己角色；后端会基于此模拟
            })),
            lastGuardTarget: get().lastGuardTarget,
            day,
          })
          const target = aiRes?.targetId ?? randomPick(alivePlayers(get().players).filter((p) => p.id !== guard.id && p.id !== get().lastGuardTarget))?.id
          set((s) => ({
            nightAction: { ...(s.nightAction as NightAction), guardTarget: target },
          }))
          await delay(500)
        }
      }
      phase = 'night-wolf'
    }

    // ---- 狼人 ----
    if (phase === 'night-wolf') {
      const wolves = aliveWolves(get().players)
      if (wolves.length > 0) {
        get().addLog({
          type: 'night',
          day,
          phase: 'night-wolf',
          content: '🐺 狼人请睁眼，选择今晚击杀的玩家...',
          secret: true,
        })
        const userWolf = wolves.find((w) => w.isUser)
        if (userWolf) {
          // 用户是狼人，等待选择
          set({ phase: 'night-wolf', processing: false })
          return
        } else {
          // AI 狼人决策
          const targets = alivePlayers(get().players).filter((p) => !isWolf(p.role))
          const leader = wolves[0]
          const aiRes = await callAI({
            action: 'night-wolf',
            playerId: leader.id,
            players: get().players.map((p) => ({
              id: p.id,
              name: p.name,
              avatar: p.avatar,
              alive: p.isAlive,
              isUser: p.isUser,
              role: p.role,
            })),
            day,
          })
          const target = aiRes?.targetId ?? randomPick(targets)?.id
          set((s) => ({
            nightAction: { ...(s.nightAction as NightAction), wolfTarget: target },
          }))
          await delay(500)
        }
      }
      phase = 'night-seer'
    }

    // ---- 预言家 ----
    if (phase === 'night-seer') {
      const seer = get().players.find((p) => p.isAlive && p.role === 'seer')
      if (seer) {
        get().addLog({
          type: 'night',
          day,
          phase: 'night-seer',
          content: '🔮 预言家请睁眼，选择今晚查验的玩家...',
          secret: true,
        })
        if (seer.isUser) {
          set({ phase: 'night-seer', processing: false })
          return
        } else {
          const targets = alivePlayers(get().players).filter((p) => p.id !== seer.id)
          const aiRes = await callAI({
            action: 'night-seer',
            playerId: seer.id,
            players: get().players.map((p) => ({
              id: p.id,
              name: p.name,
              avatar: p.avatar,
              alive: p.isAlive,
              isUser: p.isUser,
              role: p.role,
            })),
            day,
          })
          const target = aiRes?.targetId ?? randomPick(targets)?.id
          if (target !== undefined) {
            const targetPlayer = get().players.find((p) => p.id === target)
            const result = targetPlayer && isWolf(targetPlayer.role) ? 'wolf' : 'good'
            set((s) => ({
              nightAction: {
                ...(s.nightAction as NightAction),
                seerTarget: target,
                seerResult: result,
              },
            }))
          }
          await delay(500)
        }
      }
      phase = 'night-witch'
    }

    // ---- 女巫 ----
    if (phase === 'night-witch') {
      const witch = get().players.find((p) => p.isAlive && p.role === 'witch')
      if (witch) {
        get().addLog({
          type: 'night',
          day,
          phase: 'night-witch',
          content: '🧪 女巫请睁眼...',
          secret: true,
        })
        if (witch.isUser) {
          set({ phase: 'night-witch', processing: false })
          return
        } else {
          // AI 女巫决策
          const wolfTarget = get().nightAction?.wolfTarget
          const canSave = !get().witchAntidoteUsed
          const canPoison = !get().witchPoisonUsed
          const aiRes = await callAI({
            action: 'night-witch',
            playerId: witch.id,
            players: get().players.map((p) => ({
              id: p.id,
              name: p.name,
              avatar: p.avatar,
              alive: p.isAlive,
              isUser: p.isUser,
              role: p.role,
            })),
            wolfTarget,
            canSave,
            canPoison,
            day,
          })
          const witchSave = canSave && aiRes?.save && day === 1 // 简化：AI女巫首夜可救
          const poisonTarget = canPoison && aiRes?.poisonTarget ? aiRes.poisonTarget : undefined
          set((s) => ({
            nightAction: {
              ...(s.nightAction as NightAction),
              witchSave,
              witchPoisonTarget: poisonTarget,
            },
          }))
          await delay(500)
        }
      }
      phase = 'night-end'
    }

    // ---- 夜晚结算 ----
    if (phase === 'night-end') {
      const action = get().nightAction as NightAction
      const result = resolveNight(get().players, action, get().lastGuardTarget)

      // 标记死亡天数
      const finalPlayers = result.players.map((p) => {
        if (!p.isAlive && p.deathDay === undefined && result.deaths.includes(p.id)) {
          return { ...p, deathDay: day }
        }
        return p
      })

      // 更新药剂状态
      const antidoteUsed = get().witchAntidoteUsed || (action.witchSave === true)
      const poisonUsed = get().witchPoisonUsed || (action.witchPoisonTarget !== undefined)

      set({
        players: finalPlayers,
        lastGuardTarget: result.newLastGuard,
        witchAntidoteUsed: antidoteUsed,
        witchPoisonUsed: poisonUsed,
        killedThisNight: result.deaths,
      })

      get().addLog({
        type: 'night',
        day,
        phase: 'night-end',
        content:
          result.deaths.length === 0
            ? `☀️ 第 ${day} 天天亮了，昨晚平安夜，无人死亡。`
            : `☀️ 第 ${day} 天天亮了，昨晚 ${result.deaths.length} 号玩家死亡。`,
      })

      // 关键事件 Toast 提示 + 音效
      if (result.deaths.length === 0) {
        get().showToast('☀️ 昨晚平安夜，无人死亡', 'success')
        playSfx('day')
      } else {
        playSfx('death')
        const userDied = result.deaths.includes(get().userPlayerId)
        if (userDied) {
          get().showToast('💀 你在昨晚被击杀了！', 'danger')
        } else {
          get().showToast(`☀️ 昨晚 ${result.deaths.map((d) => d + '号').join('、')} 死亡`, 'info')
          setTimeout(() => playSfx('day'), 600)
        }
      }

      // 检查猎人
      const huntersDied = finalPlayers.filter(
        (p) => !p.isAlive && result.deaths.includes(p.id) && p.role === 'hunter' && !p.poisoned,
      )
      if (huntersDied.length > 0) {
        const hunter = huntersDied[0]
        set({ hunterPending: hunter.id, phase: 'hunter-shoot', processing: false })
        if (hunter.isUser) {
          // 等待用户开枪
          return
        } else {
          // AI猎人开枪
          const targets = alivePlayers(finalPlayers)
          const aiRes = await callAI({
            action: 'hunter-shoot',
            playerId: hunter.id,
            players: get().players.map((p) => ({
              id: p.id,
              name: p.name,
              avatar: p.avatar,
              alive: p.isAlive,
              isUser: p.isUser,
              role: p.role,
            })),
            day,
          })
          const target = aiRes?.targetId ?? (targets.length > 0 ? randomPick(targets)?.id : null)
          await get().userHunterShoot(target ?? null)
          return
        }
      }

      // 检查胜负
      const winner = checkWinner(finalPlayers)
      if (winner) {
        get().addLog({
          type: 'result',
          day,
          phase: 'game-over',
          content: winner === 'good' ? '🎉 好人阵营胜利！所有狼人已被消灭。' : '🌙 狼人阵营胜利！',
        })
        finishGame(winner, day)
        return
      }

      // 进入白天
      set({ phase: 'day-announce', processing: false, speeches: [], currentSpeaker: null })
      await delay(800)
      get().proceedDayPhase()
      return
    }

    set({ processing: false })
  },

  // 用户夜晚行动
  userNightAction: async (action) => {
    const state = get()
    set((s) => ({
      nightAction: { ...(s.nightAction as NightAction), ...action },
    }))

    // 记录日志
    const phase = state.phase
    if (phase === 'night-guard') {
      get().addLog({
        type: 'action',
        day: state.day,
        phase,
        playerId: state.userPlayerId,
        playerName: '你',
        content: action.guardTarget !== undefined ? `你守护了 ${action.guardTarget} 号玩家` : '你今晚空守',
      })
    } else if (phase === 'night-wolf') {
      get().addLog({
        type: 'action',
        day: state.day,
        phase,
        playerId: state.userPlayerId,
        playerName: '你',
        content: action.wolfTarget !== undefined ? `你选择了击杀 ${action.wolfTarget} 号玩家` : '你今晚空刀',
      })
    } else if (phase === 'night-seer') {
      if (action.seerTarget !== undefined) {
        const t = state.players.find((p) => p.id === action.seerTarget)
        const result = t && isWolf(t.role) ? '狼人' : '好人'
        action.seerResult = t && isWolf(t.role) ? 'wolf' : 'good'
        playSfx('seerScan')
        get().addLog({
          type: 'action',
          day: state.day,
          phase,
          playerId: state.userPlayerId,
          playerName: '你',
          content: `你查验了 ${action.seerTarget} 号玩家，结果是【${result}】`,
        })
        // 设置待展示的查验结果，暂停流程等用户确认
        set({
          seerResultPending: {
            targetId: action.seerTarget,
            targetName: t?.name || '',
            result: action.seerResult!,
          },
          nightAction: { ...(get().nightAction as NightAction), seerTarget: action.seerTarget, seerResult: action.seerResult },
        })
        return // 不立即推进，等用户查看结果后调用 confirmSeerResult
      }
    } else if (phase === 'night-witch') {
      if (action.witchSave) {
        get().addLog({
          type: 'action',
          day: state.day,
          phase,
          content: '你使用了解药救人',
        })
      }
      if (action.witchPoisonTarget !== undefined) {
        get().addLog({
          type: 'action',
          day: state.day,
          phase,
          content: `你毒杀了 ${action.witchPoisonTarget} 号玩家`,
        })
      }
      if (!action.witchSave && action.witchPoisonTarget === undefined) {
        get().addLog({
          type: 'action',
          day: state.day,
          phase,
          content: '你今晚没有使用任何药剂',
        })
      }
    }

    // 推进到下一阶段
    const nextPhase: Record<string, GamePhase> = {
      'night-guard': 'night-wolf',
      'night-wolf': 'night-seer',
      'night-seer': 'night-witch',
      'night-witch': 'night-end',
    }
    const np = nextPhase[phase]
    // 注意：必须设置 processing: false，否则 proceedNightPhase 开头的
    // if(state.processing) return 会直接退出，导致流程卡死
    set({ phase: np, processing: false })
    await delay(400)
    // 继续夜晚流程
    get().proceedNightPhase()
  },

  // ========== 白天流程 ==========
  proceedDayPhase: async () => {
    const state = get()
    if (state.processing) return
    const day = state.day

    if (state.phase === 'day-announce') {
      const deaths = state.killedThisNight
      if (deaths.length === 0) {
        get().addLog({
          type: 'day',
          day,
          phase: 'day-announce',
          content: `📋 昨晚平安夜，无人死亡。现在开始自由讨论。`,
        })
      } else {
        const names = deaths.map((id) => `${id}号`).join('、')
        get().addLog({
          type: 'day',
          day,
          phase: 'day-announce',
          content: `📋 昨晚 ${names} 玩家死亡。现在开始自由讨论，找出狼人！`,
        })
      }
      set({ phase: 'day-discuss', speeches: [], currentSpeaker: null, processing: false })
      await delay(600)
      get().proceedDayPhase()
      return
    }

    if (state.phase === 'day-discuss') {
      // 按顺序发言：存活玩家从某个起始点开始
      const alive = alivePlayers(state.players)
      if (state.currentSpeaker === null) {
        // 第一位发言者：随机选一个存活玩家
        const startIdx = Math.floor(Math.random() * alive.length)
        set({ currentSpeaker: alive[startIdx].id })
      }

      const currentId = get().currentSpeaker
      if (currentId === null) {
        // 所有人发言完毕，进入投票
        set({ phase: 'day-vote', currentSpeaker: null, votes: [], processing: false })
        await delay(500)
        get().proceedDayPhase()
        return
      }

      const speaker = get().players.find((p) => p.id === currentId)
      if (!speaker || !speaker.isAlive) {
        // 跳到下一个
        const idx = alive.findIndex((p) => p.id === currentId)
        const next = idx >= 0 && idx < alive.length - 1 ? alive[idx + 1].id : null
        set({ currentSpeaker: next })
        get().proceedDayPhase()
        return
      }

      if (speaker.isUser) {
        // 等待用户发言
        set({ processing: false })
        return
      }

      // AI 发言
      set({ speaking: true, processing: true })
      const aiRes = await callAI({
        action: 'day-speak',
        playerId: speaker.id,
        players: get().players.map((p) => ({
          id: p.id,
          name: p.name,
          avatar: p.avatar,
          alive: p.isAlive,
          isUser: p.isUser,
          role: p.role,
        })),
        speeches: get().speeches,
        day,
        killedThisNight: get().killedThisNight,
      })
      const content = aiRes?.content || '我暂时没有线索，先听听大家的。'
      const speech: Speech = {
        playerId: speaker.id,
        playerName: speaker.name,
        content,
        isUser: false,
      }
      set((s) => ({
        speeches: [...s.speeches, speech],
        speaking: false,
      }))
      get().addLog({
        type: 'speech',
        day,
        phase: 'day-discuss',
        playerId: speaker.id,
        playerName: speaker.name,
        content: `${speaker.name}(${speaker.id}号)：${content}`,
      })
      await delay(800)

      // 下一个发言者
      const idx = alive.findIndex((p) => p.id === currentId)
      const next = idx >= 0 && idx < alive.length - 1 ? alive[idx + 1].id : null
      set({ currentSpeaker: next, processing: false })
      if (next === null) {
        // 发言结束，进入投票
        set({ phase: 'day-vote', votes: [], processing: false })
        await delay(500)
        get().proceedDayPhase()
        return
      }
      get().proceedDayPhase()
      return
    }

    if (state.phase === 'day-vote') {
      const alive = alivePlayers(state.players)
      // 收集AI投票
      const existingVotes = get().votes
      const votedIds = new Set(existingVotes.map((v) => v.voterId))
      const userVoted = votedIds.has(state.userPlayerId)
      const userAlive = alive.some((p) => p.id === state.userPlayerId)

      // 如果用户存活且未投票，等待用户
      if (userAlive && !userVoted) {
        set({ processing: false })
        return
      }

      // 收集所有AI存活玩家的投票
      set({ processing: true })
      for (const p of alive) {
        if (p.isUser) continue
        if (votedIds.has(p.id)) continue
        const aiRes = await callAI({
          action: 'day-vote',
          playerId: p.id,
          players: get().players.map((pp) => ({
            id: pp.id,
            name: pp.name,
            avatar: pp.avatar,
            alive: pp.isAlive,
            isUser: pp.isUser,
            role: pp.role,
          })),
          speeches: get().speeches,
          day,
        })
        const targetId = aiRes?.targetId ?? null
        const target = targetId !== null ? get().players.find((pp) => pp.id === targetId) : null
        const vote: VoteRecord = {
          voterId: p.id,
          voterName: p.name,
          targetId,
          targetName: target ? target.name : null,
        }
        set((s) => ({ votes: [...s.votes, vote] }))
        votedIds.add(p.id)
        await delay(150)
      }

      // 统计投票
      const votes = get().votes
      const tally = tallyVotes(votes.map((v) => ({ voterId: v.voterId, targetId: v.targetId })))
      get().addLog({
        type: 'vote',
        day,
        phase: 'day-result',
        content:
          tally.winnerId === null
            ? tally.tie
              ? `投票平票，无人出局。`
              : `全员弃票，无人出局。`
            : `${tally.winnerId}号玩家被投票放逐！`,
      })

      // 投票结果 Toast + 音效
      if (tally.winnerId !== null) {
        playSfx('death')
        if (tally.winnerId === get().userPlayerId) {
          get().showToast('出局 你被投票放逐了！', 'danger')
        } else {
          get().showToast(`🗳️ ${tally.winnerId}号被投票放逐`, 'info')
        }
      } else {
        get().showToast('🗳️ 投票平票，无人出局', 'info')
      }

      // 投票详情日志
      const detail = votes
        .map((v) => `${v.voterName}→${v.targetName || '弃票'}`)
        .join('，')
      get().addLog({
        type: 'vote',
        day,
        phase: 'day-result',
        content: `投票详情：${detail}`,
      })

      let finalPlayers = get().players
      if (tally.winnerId !== null) {
        finalPlayers = get().players.map((p) =>
          p.id === tally.winnerId
            ? { ...p, isAlive: false, deathReason: '被投票放逐', deathDay: day }
            : p,
        )
        set({ players: finalPlayers })
      }

      // 检查猎人（被投票出局）
      const outHunter = finalPlayers.find(
        (p) => !p.isAlive && p.id === tally.winnerId && p.role === 'hunter',
      )
      if (outHunter) {
        set({ hunterPending: outHunter.id, phase: 'hunter-shoot', processing: false })
        if (outHunter.isUser) {
          return
        } else {
          const targets = alivePlayers(finalPlayers)
          const aiRes = await callAI({
            action: 'hunter-shoot',
            playerId: outHunter.id,
            players: get().players.map((p) => ({
              id: p.id,
              name: p.name,
              avatar: p.avatar,
              alive: p.isAlive,
              isUser: p.isUser,
              role: p.role,
            })),
            day,
          })
          const target = aiRes?.targetId ?? (targets.length > 0 ? randomPick(targets)?.id : null)
          await get().userHunterShoot(target ?? null)
          return
        }
      }

      // 检查胜负
      const winner = checkWinner(finalPlayers)
      if (winner) {
        get().addLog({
          type: 'result',
          day,
          phase: 'game-over',
          content: winner === 'good' ? '🎉 好人阵营胜利！' : '🌙 狼人阵营胜利！',
        })
        finishGame(winner, day)
        return
      }

      // 进入下一夜
      set({
        phase: 'night-start',
        day: day + 1,
        speeches: [],
        votes: [],
        currentSpeaker: null,
        killedThisNight: [],
        processing: false,
      })
      await delay(800)
      get().proceedNightPhase()
      return
    }
  },

  userSpeak: async (content) => {
    const state = get()
    const speaker = state.players.find((p) => p.id === state.userPlayerId)
    if (!speaker) return
    const speech: Speech = {
      playerId: speaker.id,
      playerName: speaker.name,
      content,
      isUser: true,
    }
    set((s) => ({ speeches: [...s.speeches, speech] }))
    get().addLog({
      type: 'speech',
      day: state.day,
      phase: 'day-discuss',
      playerId: speaker.id,
      playerName: speaker.name,
      content: `${speaker.name}(${speaker.id}号)：${content}`,
    })
    // 下一个发言者
    const alive = alivePlayers(get().players)
    const idx = alive.findIndex((p) => p.id === speaker.id)
    const next = idx >= 0 && idx < alive.length - 1 ? alive[idx + 1].id : null
    set({ currentSpeaker: next, processing: false })
    if (next === null) {
      set({ phase: 'day-vote', votes: [], processing: false })
      await delay(500)
      get().proceedDayPhase()
      return
    }
    get().proceedDayPhase()
  },

  skipSpeak: async () => {
    const state = get()
    const speaker = state.players.find((p) => p.id === state.userPlayerId)
    if (!speaker) return
    get().addLog({
      type: 'speech',
      day: state.day,
      phase: 'day-discuss',
      playerId: speaker.id,
      playerName: speaker.name,
      content: `${speaker.name}(${speaker.id}号)：我暂时没什么要说的。`,
    })
    const alive = alivePlayers(get().players)
    const idx = alive.findIndex((p) => p.id === speaker.id)
    const next = idx >= 0 && idx < alive.length - 1 ? alive[idx + 1].id : null
    set({ currentSpeaker: next, processing: false })
    if (next === null) {
      set({ phase: 'day-vote', votes: [], processing: false })
      await delay(500)
      get().proceedDayPhase()
      return
    }
    get().proceedDayPhase()
  },

  userVote: async (targetId) => {
    const state = get()
    const voter = state.players.find((p) => p.id === state.userPlayerId)
    if (!voter) return
    const target = targetId !== null ? state.players.find((p) => p.id === targetId) : null
    const vote: VoteRecord = {
      voterId: voter.id,
      voterName: voter.name,
      targetId,
      targetName: target ? target.name : null,
    }
    set((s) => ({ votes: [...s.votes, vote] }))
    get().addLog({
      type: 'vote',
      day: state.day,
      phase: 'day-vote',
      playerId: voter.id,
      playerName: voter.name,
      content: target ? `你投票给 ${target.name}(${target.id}号)` : '你弃票',
    })
    set({ processing: false })
    get().proceedDayPhase()
  },

  userHunterShoot: async (targetId) => {
    const state = get()
    const hunter = state.players.find((p) => p.id === state.hunterPending)
    if (!hunter) return
    if (targetId !== null) {
      const target = state.players.find((p) => p.id === targetId)
      playSfx('shoot')
      set((s) => ({
        players: s.players.map((p) =>
          p.id === targetId
            ? { ...p, isAlive: false, deathReason: '被猎人射杀', deathDay: state.day, hunted: true }
            : p,
        ),
      }))
      get().addLog({
        type: 'action',
        day: state.day,
        phase: 'hunter-shoot',
        playerId: hunter.id,
        playerName: hunter.name,
        content: `🏹 ${hunter.name} 开枪带走了 ${target?.name}！`,
      })
    } else {
      get().addLog({
        type: 'action',
        day: state.day,
        phase: 'hunter-shoot',
        playerId: hunter.id,
        playerName: hunter.name,
        content: `🏹 ${hunter.name} 没有开枪。`,
      })
    }
    set({ hunterPending: null })

    // 检查胜负
    const winner = checkWinner(get().players)
    if (winner) {
      get().addLog({
        type: 'result',
        day: state.day,
        phase: 'game-over',
        content: winner === 'good' ? '🎉 好人阵营胜利！' : '🌙 狼人阵营胜利！',
      })
      finishGame(winner, state.day)
      return
    }

    // 如果是夜晚结算后的猎人，继续白天
    const prevPhase = state.phase
    if (state.day > 0 && (prevPhase === 'hunter-shoot')) {
      // 判断来自夜晚还是白天：根据当前killedThisNight
      set({ phase: 'day-announce', processing: false })
      await delay(600)
      get().proceedDayPhase()
      return
    }
  },
}))
