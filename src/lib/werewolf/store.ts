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

  // 警长竞选（用户）
  userJoinSheriff: (join: boolean) => void
  userSheriffVote: (targetId: number | null) => Promise<void>
  userLastWords: (content: string) => void
  skipLastWords: () => void

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
  speakStartIdx: null,
  speakCount: 0,
  winner: null,
  witchAntidoteUsed: false,
  witchPoisonUsed: false,
  lastGuardTarget: null,
  hunterPending: null,
  killedThisNight: [],
  speaking: false,
  processing: false,
  sheriffId: null,
  sheriffCandidates: [],
  sheriffVotes: [],
  sheriffCampaignIdx: 0,
  lastWordsPending: [],
  _aiSheriffDecided: false,
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
    set({ phase: 'night-witch', processing: false })
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

    try {
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
                role: p.role,
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
            if (target !== undefined && target !== null) {
              const targetPlayer = get().players.find((p) => p.id === target)
              if (targetPlayer) {
                const result = isWolf(targetPlayer.role) ? 'wolf' : 'good'
                set((s) => ({
                  nightAction: {
                    ...(s.nightAction as NightAction),
                    seerTarget: target,
                    seerResult: result,
                  },
                }))
              }
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

        // 检查猎人（夜晚死亡）
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

        // 进入白天：第一天先竞选警长，后续天直接公布
        if (day === 1) {
          set({ phase: 'day-sheriff-announce', processing: false, speeches: [], currentSpeaker: null })
        } else {
          set({ phase: 'day-announce', processing: false, speeches: [], currentSpeaker: null })
        }
        await delay(800)
        get().proceedDayPhase()
        return
      }

      set({ processing: false })
    } catch (err) {
      // 防御：任何异常都重置 processing，避免流程卡死
      console.error('[proceedNightPhase] error:', err)
      set({ processing: false, speaking: false })
    }
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
    set({ processing: true })
    const day = state.day

    try {
      // ---- 警长竞选公告（仅第一天） ----
      if (state.phase === 'day-sheriff-announce') {
        get().addLog({
          type: 'day',
          day,
          phase: 'day-sheriff-announce',
          content: '🏛️ 第一天白天，开始竞选警长！想当警长的玩家请上警。',
        })
        get().showToast('🏛️ 开始竞选警长！', 'info')
        set({
          phase: 'day-sheriff-campaign',
          sheriffCandidates: [],
          sheriffVotes: [],
          sheriffCampaignIdx: 0,
          speeches: [],
          processing: false,
        })
        await delay(800)
        get().proceedDayPhase()
        return
      }

      // ---- 警长竞选发言 ----
      if (state.phase === 'day-sheriff-campaign') {
        const alive = alivePlayers(state.players)
        const userId = state.userPlayerId
        let candidates = [...state.sheriffCandidates]

        // 收集 AI 玩家的上警决定（在用户决定后，AI 也决定）
        // 如果用户已决定（上警或不上警），且还没收集完所有 AI 决定
        const userDecided = candidates.includes(userId) || state.sheriffCampaignIdx > 0 || get()._aiSheriffDecided
        if (!userDecided) {
          // 等待用户决定是否上警
          set({ processing: false })
          return
        }

        // 一次性收集所有 AI 玩家的上警决定
        if (!get()._aiSheriffDecided) {
          set({ _aiSheriffDecided: true })
          for (const p of alive) {
            if (p.isUser) continue
            // AI 上警概率：预言家90%，狼人60%，女巫40%，猎人30%，守卫20%，平民20%
            const probMap: Record<string, number> = { seer: 0.9, wolf: 0.6, 'white-wolf': 0.6, witch: 0.4, hunter: 0.3, guard: 0.2, villager: 0.2, knight: 0.3 }
            const prob = probMap[p.role] ?? 0.2
            if (Math.random() < prob) {
              candidates.push(p.id)
              get().addLog({
                type: 'day', day, phase: 'day-sheriff-campaign',
                content: `${p.id}号(${p.name})上警！`,
              })
            }
          }
          set({ sheriffCandidates: candidates })
          await delay(400)
        }

        // 候选人依次发言
        if (state.sheriffCampaignIdx < candidates.length) {
          const candidateId = candidates[state.sheriffCampaignIdx]
          const candidate = get().players.find((p) => p.id === candidateId)
          if (candidate && candidate.isAlive) {
            if (candidate.isUser) {
              // 等待用户发言
              set({ currentSpeaker: candidateId, processing: false })
              return
            } else {
              // AI 候选人发言
              set({ speaking: true, processing: true })
              const aiRes = await callAI({
                action: 'sheriff-campaign',
                playerId: candidate.id,
                players: get().players.map((p) => ({
                  id: p.id, name: p.name, avatar: p.avatar, alive: p.isAlive, isUser: p.isUser, role: p.role,
                })),
                candidates,
                day,
              })
              const content = aiRes?.content || '我上警是为了带领大家找出狼人，请相信我。'
              const speech: Speech = { playerId: candidate.id, playerName: candidate.name, content, isUser: false }
              set((s) => ({ speeches: [...s.speeches, speech], speaking: false }))
              get().addLog({
                type: 'speech', day, phase: 'day-sheriff-campaign',
                playerId: candidate.id, playerName: candidate.name,
                content: `🏛️ ${candidate.name}(${candidate.id}号)竞选警长：${content}`,
              })
              await delay(700)
            }
          }
          set({ sheriffCampaignIdx: state.sheriffCampaignIdx + 1, processing: false })
          get().proceedDayPhase()
          return
        }

        // 所有候选人发言完毕，进入投票
        // 如果只有一个候选人，直接当选
        if (candidates.length === 1) {
          const sheriffId = candidates[0]
          set({ sheriffId, phase: 'day-announce', processing: false, currentSpeaker: null })
          get().addLog({
            type: 'day', day, phase: 'day-sheriff-campaign',
            content: `🏛️ ${sheriffId}号无人竞争，自动当选警长！`,
          })
          get().showToast(`🏛️ ${sheriffId}号当选警长`, 'success')
          await delay(800)
          get().proceedDayPhase()
          return
        }
        // 没人上警，警徽流失
        if (candidates.length === 0) {
          get().addLog({
            type: 'day', day, phase: 'day-sheriff-campaign',
            content: '🏛️ 无人竞选警长，警徽流失，本局无警长。',
          })
          get().showToast('🏛️ 无人上警，本局无警长', 'info')
          set({ sheriffId: null, phase: 'day-announce', processing: false, currentSpeaker: null })
          await delay(800)
          get().proceedDayPhase()
          return
        }
        // 多人竞选，进入投票
        get().addLog({
          type: 'day', day, phase: 'day-sheriff-campaign',
          content: `🗳️ 候选人发言完毕，未上警的玩家开始投票选出警长。`,
        })
        set({ phase: 'day-sheriff-vote', sheriffVotes: [], processing: false })
        await delay(500)
        get().proceedDayPhase()
        return
      }

      // ---- 警长竞选投票 ----
      if (state.phase === 'day-sheriff-vote') {
        const alive = alivePlayers(state.players)
        const candidates = state.sheriffCandidates
        const existingVotes = get().sheriffVotes
        const votedIds = new Set(existingVotes.map((v) => v.voterId))
        const userId = state.userPlayerId
        const userIsCandidate = candidates.includes(userId)
        const userVoted = votedIds.has(userId)
        // 未上警的玩家投票；上警的玩家不投票
        const voters = alive.filter((p) => !candidates.includes(p.id))

        // 用户未上警且未投票，等待用户
        if (!userIsCandidate && !userVoted) {
          set({ processing: false })
          return
        }

        // 收集 AI 投票
        set({ processing: true })
        for (const p of voters) {
          if (p.isUser) continue
          if (votedIds.has(p.id)) continue
          const aiRes = await callAI({
            action: 'sheriff-vote',
            playerId: p.id,
            players: get().players.map((pp) => ({
              id: pp.id, name: pp.name, avatar: pp.avatar, alive: pp.isAlive, isUser: pp.isUser, role: pp.role,
            })),
            candidates,
            speeches: get().speeches,
            day,
          })
          const targetId = aiRes?.targetId ?? randomPick(candidates.map((id) => get().players.find((pp) => pp.id === id)).filter(Boolean))?.id ?? null
          const target = targetId !== null ? get().players.find((pp) => pp.id === targetId) : null
          const vote: VoteRecord = { voterId: p.id, voterName: p.name, targetId, targetName: target ? target.name : null }
          set((s) => ({ sheriffVotes: [...s.sheriffVotes, vote] }))
          votedIds.add(p.id)
          await delay(120)
        }

        // 统计警长票
        const svotes = get().sheriffVotes
        const tally = tallyVotes(svotes.map((v) => ({ voterId: v.voterId, targetId: v.targetId })))
        let sheriffId: number | null = tally.winnerId
        if (tally.tie) sheriffId = svotes.length > 0 ? randomPick(svotes.filter((v) => v.targetId !== null).map((v) => v.targetId!)) ?? null : null
        if (sheriffId !== null) {
          get().addLog({
            type: 'day', day, phase: 'day-sheriff-vote',
            content: `🏛️ ${sheriffId}号当选警长！（得票最多）`,
          })
          get().showToast(`🏛️ ${sheriffId}号当选警长`, 'success')
        } else {
          get().addLog({
            type: 'day', day, phase: 'day-sheriff-vote',
            content: '🏛️ 警长竞选平票，警徽流失。',
          })
          get().showToast('🏛️ 警长竞选平票，无警长', 'info')
        }
        set({ sheriffId, phase: 'day-announce', processing: false, currentSpeaker: null, speeches: [] })
        await delay(800)
        get().proceedDayPhase()
        return
      }

      // ---- 公布死讯 ----
      if (state.phase === 'day-announce') {
        const deaths = state.killedThisNight
        if (deaths.length === 0) {
          get().addLog({
            type: 'day', day, phase: 'day-announce',
            content: `📋 昨晚平安夜，无人死亡。`,
          })
        } else {
          const names = deaths.map((id) => `${id}号`).join('、')
          get().addLog({
            type: 'day', day, phase: 'day-announce',
            content: `📋 昨晚 ${names} 玩家死亡。`,
          })
        }
        // 第一天夜晚死亡的玩家有遗言；后续夜晚死亡无遗言
        if (day === 1 && deaths.length > 0) {
          set({ phase: 'day-lastwords', lastWordsPending: [...deaths], processing: false, speeches: [] })
          await delay(600)
          get().proceedDayPhase()
          return
        }
        // 无遗言，直接进入讨论
        set({ phase: 'day-discuss', speeches: [], currentSpeaker: null, speakStartIdx: null, speakCount: 0, processing: false })
        await delay(600)
        get().proceedDayPhase()
        return
      }

      // ---- 死亡遗言 ----
      if (state.phase === 'day-lastwords') {
        const pending = get().lastWordsPending
        if (pending.length === 0) {
          // 遗言结束，进入讨论
          set({ phase: 'day-discuss', speeches: [], currentSpeaker: null, speakStartIdx: null, speakCount: 0, processing: false })
          await delay(500)
          get().proceedDayPhase()
          return
        }
        const dyingId = pending[0]
        const dying = get().players.find((p) => p.id === dyingId)
        if (!dying) {
          set({ lastWordsPending: pending.slice(1) })
          get().proceedDayPhase()
          return
        }
        get().addLog({
          type: 'day', day, phase: 'day-lastwords',
          playerId: dying.id, playerName: dying.name,
          content: `💬 ${dying.name}(${dying.id}号)临终遗言：`,
        })
        if (dying.isUser) {
          // 等待用户输入遗言
          set({ currentSpeaker: dyingId, processing: false })
          return
        } else {
          // AI 遗言
          set({ speaking: true, processing: true })
          const aiRes = await callAI({
            action: 'last-words',
            playerId: dying.id,
            players: get().players.map((p) => ({
              id: p.id, name: p.name, avatar: p.avatar, alive: p.isAlive, isUser: p.isUser, role: p.role,
            })),
            day,
          })
          const content = aiRes?.content || '我是好人，请大家相信我...咳咳...'
          get().addLog({
            type: 'speech', day, phase: 'day-lastwords',
            playerId: dying.id, playerName: dying.name,
            content: `"${content}"`,
          })
          set({ speaking: false })
          await delay(700)
          set({ lastWordsPending: pending.slice(1), processing: false })
          get().proceedDayPhase()
          return
        }
      }

      // ---- 白天讨论（绕回发言，所有人发言一次） ----
      if (state.phase === 'day-discuss') {
        const alive = alivePlayers(state.players)
        // 初始化起始发言者
        if (state.currentSpeaker === null) {
          // 警长决定起始：从警长右边开始；无警长则随机
          let startIdx: number
          if (state.sheriffId !== null) {
            const sheriffIdx = alive.findIndex((p) => p.id === state.sheriffId)
            startIdx = sheriffIdx >= 0 ? (sheriffIdx + 1) % alive.length : Math.floor(Math.random() * alive.length)
          } else {
            startIdx = Math.floor(Math.random() * alive.length)
          }
          set({
            currentSpeaker: alive[startIdx].id,
            speakStartIdx: startIdx,
            speakCount: 0,
          })
        }

        const currentId = get().currentSpeaker
        const startIdx = get().speakStartIdx ?? 0
        const speakCount = get().speakCount

        if (currentId === null || speakCount >= alive.length) {
          // 所有人发言完毕，进入投票
          set({ phase: 'day-vote', currentSpeaker: null, votes: [], processing: false })
          await delay(500)
          get().proceedDayPhase()
          return
        }

        const speaker = get().players.find((p) => p.id === currentId)
        if (!speaker || !speaker.isAlive) {
          // 跳到下一个（绕回）
          const idx = alive.findIndex((p) => p.id === currentId)
          const nextIdx = (idx + 1) % alive.length
          set({ currentSpeaker: alive[nextIdx].id })
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
            id: p.id, name: p.name, avatar: p.avatar, alive: p.isAlive, isUser: p.isUser, role: p.role,
          })),
          speeches: get().speeches,
          day,
          killedThisNight: get().killedThisNight,
        })
        const content = aiRes?.content || '我暂时没有线索，先听听大家的。'
        const speech: Speech = { playerId: speaker.id, playerName: speaker.name, content, isUser: false }
        set((s) => ({ speeches: [...s.speeches, speech], speaking: false }))
        get().addLog({
          type: 'speech', day, phase: 'day-discuss',
          playerId: speaker.id, playerName: speaker.name,
          content: `${speaker.name}(${speaker.id}号)：${content}`,
        })
        await delay(800)

        // 下一个发言者（绕回）
        const idx = alive.findIndex((p) => p.id === currentId)
        const nextIdx = (idx + 1) % alive.length
        const newCount = get().speakCount + 1
        set({ currentSpeaker: alive[nextIdx].id, speakCount: newCount, processing: false })
        get().proceedDayPhase()
        return
      }

      if (state.phase === 'day-vote') {
        const alive = alivePlayers(state.players)
        const existingVotes = get().votes
        const votedIds = new Set(existingVotes.map((v) => v.voterId))
        const userVoted = votedIds.has(state.userPlayerId)
        const userAlive = alive.some((p) => p.id === state.userPlayerId)

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
              id: pp.id, name: pp.name, avatar: pp.avatar, alive: pp.isAlive, isUser: pp.isUser, role: pp.role,
            })),
            speeches: get().speeches,
            day,
          })
          const targetId = aiRes?.targetId ?? null
          const target = targetId !== null ? get().players.find((pp) => pp.id === targetId) : null
          const vote: VoteRecord = { voterId: p.id, voterName: p.name, targetId, targetName: target ? target.name : null }
          set((s) => ({ votes: [...s.votes, vote] }))
          votedIds.add(p.id)
          await delay(150)
        }

        // 统计投票（警长票算1.5票）
        const votes = get().votes
        const sheriffId = get().sheriffId
        const counts: Record<number, number> = {}
        for (const v of votes) {
          if (v.targetId !== null) {
            const weight = v.voterId === sheriffId ? 1.5 : 1
            counts[v.targetId] = (counts[v.targetId] || 0) + weight
          }
        }
        const entries = Object.entries(counts).map(([id, c]) => ({ id: Number(id), count: c }))
        let winnerId: number | null = null
        let tie = false
        if (entries.length > 0) {
          entries.sort((a, b) => b.count - a.count)
          if (entries.length > 1 && entries[0].count === entries[1].count) {
            tie = true
          } else {
            winnerId = entries[0].id
          }
        }

        get().addLog({
          type: 'vote', day, phase: 'day-result',
          content: winnerId === null ? (tie ? `投票平票，无人出局。` : `全员弃票，无人出局。`) : `${winnerId}号玩家被投票放逐！`,
        })
        if (winnerId !== null) {
          playSfx('death')
          if (winnerId === get().userPlayerId) {
            get().showToast('出局 你被投票放逐了！', 'danger')
          } else {
            get().showToast(`🗳️ ${winnerId}号被投票放逐`, 'info')
          }
        } else {
          get().showToast('🗳️ 投票平票，无人出局', 'info')
        }
        const detail = votes.map((v) => `${v.voterName}${v.voterId === sheriffId ? '(警长1.5票)' : ''}→${v.targetName || '弃票'}`).join('，')
        get().addLog({ type: 'vote', day, phase: 'day-result', content: `投票详情：${detail}` })

        let finalPlayers = get().players
        if (winnerId !== null) {
          finalPlayers = get().players.map((p) =>
            p.id === winnerId ? { ...p, isAlive: false, deathReason: '被投票放逐', deathDay: day } : p,
          )
          set({ players: finalPlayers })
          // 被投票出局者有遗言
        }

        // 检查猎人（被投票出局）
        const outHunter = finalPlayers.find((p) => !p.isAlive && p.id === winnerId && p.role === 'hunter')
        if (outHunter) {
          set({ hunterPending: outHunter.id, phase: 'hunter-shoot', processing: false })
          if (outHunter.isUser) {
            return
          } else {
            const targets = alivePlayers(finalPlayers)
            const aiRes = await callAI({
              action: 'hunter-shoot', playerId: outHunter.id,
              players: get().players.map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, alive: p.isAlive, isUser: p.isUser, role: p.role })),
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
            type: 'result', day, phase: 'game-over',
            content: winner === 'good' ? '🎉 好人阵营胜利！' : '🌙 狼人阵营胜利！',
          })
          finishGame(winner, day)
          return
        }

        // 被投票出局者发表遗言
        if (winnerId !== null) {
          set({ phase: 'day-lastwords', lastWordsPending: [winnerId], processing: false })
          await delay(500)
          get().proceedDayPhase()
          return
        }

        // 进入下一夜
        set({
          phase: 'night-start', day: day + 1,
          speeches: [], votes: [], currentSpeaker: null, speakStartIdx: null, speakCount: 0,
          killedThisNight: [], processing: false,
        })
        await delay(800)
        get().proceedNightPhase()
        return
      }

      set({ processing: false })
    } catch (err) {
      console.error('[proceedDayPhase] error:', err)
      set({ processing: false, speaking: false })
    }
  },

  userSpeak: async (content) => {
    const state = get()
    const speaker = state.players.find((p) => p.id === state.userPlayerId)
    if (!speaker) return
    const speech: Speech = { playerId: speaker.id, playerName: speaker.name, content, isUser: true }
    set((s) => ({ speeches: [...s.speeches, speech] }))
    get().addLog({
      type: 'speech', day: state.day, phase: state.phase,
      playerId: speaker.id, playerName: speaker.name,
      content: `${speaker.name}(${speaker.id}号)：${content}`,
    })

    // 警长竞选发言
    if (state.phase === 'day-sheriff-campaign') {
      set({ sheriffCampaignIdx: state.sheriffCampaignIdx + 1, currentSpeaker: null, processing: false })
      await delay(300)
      get().proceedDayPhase()
      return
    }

    // 死亡遗言
    if (state.phase === 'day-lastwords') {
      const pending = get().lastWordsPending
      set({ lastWordsPending: pending.slice(1), currentSpeaker: null, processing: false })
      await delay(300)
      get().proceedDayPhase()
      return
    }

    // 白天讨论：下一个发言者（绕回）
    const alive = alivePlayers(get().players)
    const idx = alive.findIndex((p) => p.id === speaker.id)
    const nextIdx = (idx + 1) % alive.length
    const newCount = get().speakCount + 1
    set({ currentSpeaker: alive[nextIdx].id, speakCount: newCount, processing: false })
    get().proceedDayPhase()
  },

  skipSpeak: async () => {
    const state = get()
    const speaker = state.players.find((p) => p.id === state.userPlayerId)
    if (!speaker) return
    get().addLog({
      type: 'speech', day: state.day, phase: state.phase,
      playerId: speaker.id, playerName: speaker.name,
      content: state.phase === 'day-lastwords' ? `${speaker.name}(${speaker.id}号) 没有留下遗言。` : `${speaker.name}(${speaker.id}号)：我暂时没什么要说的。`,
    })

    if (state.phase === 'day-sheriff-campaign') {
      set({ sheriffCampaignIdx: state.sheriffCampaignIdx + 1, currentSpeaker: null, processing: false })
      await delay(300)
      get().proceedDayPhase()
      return
    }
    if (state.phase === 'day-lastwords') {
      const pending = get().lastWordsPending
      set({ lastWordsPending: pending.slice(1), currentSpeaker: null, processing: false })
      await delay(300)
      get().proceedDayPhase()
      return
    }

    const alive = alivePlayers(get().players)
    const idx = alive.findIndex((p) => p.id === speaker.id)
    const nextIdx = (idx + 1) % alive.length
    const newCount = get().speakCount + 1
    set({ currentSpeaker: alive[nextIdx].id, speakCount: newCount, processing: false })
    get().proceedDayPhase()
  },

  userVote: async (targetId) => {
    const state = get()
    // 警长竞选投票
    if (state.phase === 'day-sheriff-vote') {
      const voter = state.players.find((p) => p.id === state.userPlayerId)
      if (!voter) return
      const target = targetId !== null ? state.players.find((p) => p.id === targetId) : null
      const vote: VoteRecord = { voterId: voter.id, voterName: voter.name, targetId, targetName: target ? target.name : null }
      set((s) => ({ sheriffVotes: [...s.sheriffVotes, vote] }))
      get().addLog({
        type: 'vote', day: state.day, phase: 'day-sheriff-vote',
        playerId: voter.id, playerName: voter.name,
        content: target ? `你投票给 ${target.name}(${target.id}号)当警长` : '你弃票',
      })
      set({ processing: false })
      get().proceedDayPhase()
      return
    }
    // 普通投票
    const voter = state.players.find((p) => p.id === state.userPlayerId)
    if (!voter) return
    const target = targetId !== null ? state.players.find((p) => p.id === targetId) : null
    const vote: VoteRecord = { voterId: voter.id, voterName: voter.name, targetId, targetName: target ? target.name : null }
    set((s) => ({ votes: [...s.votes, vote] }))
    get().addLog({
      type: 'vote', day: state.day, phase: 'day-vote',
      playerId: voter.id, playerName: voter.name,
      content: target ? `你投票给 ${target.name}(${target.id}号)` : '你弃票',
    })
    set({ processing: false })
    get().proceedDayPhase()
  },

  // 用户决定是否上警
  userJoinSheriff: (join) => {
    const state = get()
    if (join) {
      if (!state.sheriffCandidates.includes(state.userPlayerId)) {
        set({ sheriffCandidates: [...state.sheriffCandidates, state.userPlayerId] })
        get().addLog({
          type: 'day', day: state.day, phase: 'day-sheriff-campaign',
          content: `${state.userPlayerId}号(你)上警！`,
        })
      }
    } else {
      get().addLog({
        type: 'day', day: state.day, phase: 'day-sheriff-campaign',
        content: `${state.userPlayerId}号(你)不上警。`,
      })
    }
    set({ processing: false })
    get().proceedDayPhase()
  },

  userSheriffVote: async (targetId) => {
    await get().userVote(targetId)
  },

  userLastWords: (content) => {
    get().userSpeak(content)
  },

  skipLastWords: () => {
    get().skipSpeak()
  },

  userHunterShoot: async (targetId) => {
    const state = get()
    const hunter = state.players.find((p) => p.id === state.hunterPending)
    if (!hunter) return
    const fromNight = state.killedThisNight.includes(hunter.id)
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
        type: 'action', day: state.day, phase: 'hunter-shoot',
        playerId: hunter.id, playerName: hunter.name,
        content: `🏹 ${hunter.name} 开枪带走了 ${target?.name}！`,
      })
    } else {
      get().addLog({
        type: 'action', day: state.day, phase: 'hunter-shoot',
        playerId: hunter.id, playerName: hunter.name,
        content: `🏹 ${hunter.name} 没有开枪。`,
      })
    }
    set({ hunterPending: null })

    // 检查胜负
    const winner = checkWinner(get().players)
    if (winner) {
      get().addLog({
        type: 'result', day: state.day, phase: 'game-over',
        content: winner === 'good' ? '🎉 好人阵营胜利！' : '🌙 狼人阵营胜利！',
      })
      finishGame(winner, state.day)
      return
    }

    // 猎人开枪后继续：夜晚死亡的猎人→进入白天；白天投票出局的猎人→继续下一夜
    if (fromNight) {
      // 来自夜晚结算，进入白天（第一天先警长竞选）
      if (state.day === 1) {
        set({ phase: 'day-sheriff-announce', processing: false })
      } else {
        set({ phase: 'day-announce', processing: false })
      }
    } else {
      // 来自白天投票出局，进入下一夜
      set({
        phase: 'night-start', day: state.day + 1,
        speeches: [], votes: [], currentSpeaker: null, speakStartIdx: null, speakCount: 0,
        killedThisNight: [], processing: false,
      })
    }
    await delay(600)
    if (fromNight) {
      get().proceedDayPhase()
    } else {
      get().proceedNightPhase()
    }
  },
}))
