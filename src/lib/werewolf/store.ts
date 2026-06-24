import { create } from 'zustand'
import {
  WerewolfGameState,
  GameConfig,
  Player,
  GamePhase,
  LogEntry,
  NightAction,
  Speech,
  SpeechRound,
  GameEvent,
  VoteRecord,
  RoleId,
  Difficulty,
  DeathCause,
  SpeechSpeed,
} from './types'
import { ROLES, isWolf, GOD_ROLES } from './roles'
import {
  initPlayers,
  alivePlayers,
  aliveWolves,
  aliveVillagers,
  aliveGods,
  checkWinner,
  canHunterShoot,
  hasLastWords,
  resolveNight,
  tallyVotes,
  logId,
  shuffle,
  randomPick,
  buildPublicPlayerInfo,
  buildWolfView,
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

  // 白狼王自爆（用户）- 白天任意时刻可主动发动
  userSelfDestruct: (targetId: number) => Promise<void>

  // 警徽移交（用户）
  userSheriffTransfer: (targetId: number | null) => Promise<void>

  // 推进流程
  proceedNightPhase: () => Promise<void>
  proceedDayPhase: () => Promise<void>

  // === Phase 1 新增 actions（竞品分析对齐） ===
  // 设置发言展示速度
  setSpeechSpeed: (speed: SpeechSpeed) => void
  // 标记某阶段新手引导已看过
  markGuideSeen: (key: string) => void
  // 打开/关闭高风险确认弹窗
  showConfirmDialog: (cfg: {
    title: string
    desc: string
    confirmText?: string
    cancelText?: string
    danger?: boolean
    onConfirm: () => void
  }) => void
  closeConfirmDialog: () => void

  // 内部
  _setProcessing: (v: boolean) => void
  _setPhase: (p: GamePhase) => void
  _addEvent: (e: Omit<GameEvent, 'id' | 'timestamp'>) => void
  _archiveSpeeches: (label: string) => void
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
  speechHistory: [],
  events: [],
  votes: [],
  currentSpeaker: null,
  speakStartIdx: null,
  speakCount: 0,
  winner: null,
  winnerCause: null,
  witchAntidoteUsed: false,
  witchPoisonUsed: false,
  witchActionThisNight: null,
  lastGuardTarget: null,
  hunterPending: null,
  killedThisNight: [],
  speaking: false,
  processing: false,
  sheriffId: null,
  sheriffCandidates: [],
  sheriffVotes: [],
  sheriffCampaignIdx: 0,
  sheriffTransferPending: null,
  lastWordsPending: [],
  _aiSheriffDecided: false,
  _aiSheriffCollected: false,
  whiteWolfSelfDestructPending: null,
  whiteWolfSkillAvailable: false,
  seerResultPending: null,
  toast: null,
  voteDeadline: null,
  // === Phase 1 新增字段初始值 ===
  speakTotal: 0,
  speechSpeed: 'normal',
  seenGuide: {},
  pkPair: null,
  pkRound: 0,
  voteRevealed: false,
  gameStartTime: 0,
  confirmDialog: null,
}

// ============ AI 视角隔离的请求构建 (v2.0 §1.1.2) ============
// 关键原则：AI 决策输入绝不包含其他玩家的真实 role 字段
interface AIVisibleInfo {
  myRole: RoleId
  myId: number
  publicInfo: ReturnType<typeof buildPublicPlayerInfo>
  // 角色专属信息（仅对相关角色可见）
  wolfTeammates?: number[] // 仅狼人可见：同伴 id 列表
  seerHistory?: { day: number; targetId: number; targetName: string; result: 'wolf' | 'good' }[] // 仅预言家可见：自己的查验历史
  witchWolfTarget?: number // 仅女巫可见：今晚被狼刀的目标
  difficulty: Difficulty
}

// 构建给 AI 的视角隔离信息
function buildAIVisibleInfo(
  state: WerewolfGameState,
  playerId: number,
  seerHistory: { day: number; targetId: number; targetName: string; result: 'wolf' | 'good' }[],
): AIVisibleInfo | null {
  const me = state.players.find((p) => p.id === playerId)
  if (!me) return null

  const publicInfo = buildPublicPlayerInfo(state.players, state.sheriffId)
  const info: AIVisibleInfo = {
    myRole: me.role,
    myId: playerId,
    publicInfo,
    difficulty: state.config?.difficulty || 'normal',
  }

  // 仅狼人可见：同伴列表
  if (isWolf(me.role)) {
    const { teammates } = buildWolfView(state.players, playerId, state.sheriffId)
    info.wolfTeammates = teammates.map((t) => t.id)
  }

  // 仅预言家可见：自己的查验历史
  if (me.role === 'seer') {
    info.seerHistory = seerHistory.filter((h) => h.targetId !== undefined)
  }

  // 仅女巫可见：今晚被狼刀的目标
  if (me.role === 'witch' && state.nightAction?.wolfTarget !== undefined) {
    info.witchWolfTarget = state.nightAction.wolfTarget
  }

  return info
}

// 维护预言家查验历史（每次查验时追加）
// 通过日志中提取（避免在 state 中加新字段）
function getSeerHistory(state: WerewolfGameState, seerId: number): { day: number; targetId: number; targetName: string; result: 'wolf' | 'good' }[] {
  // 从 nightAction 中提取？不行，每次夜晚只记录一次。
  // 改为：通过日志查询 - 找出该预言家所有"我查验了 X 号玩家，结果是【...】"的日志
  const history: { day: number; targetId: number; targetName: string; result: 'wolf' | 'good' }[] = []
  for (const log of state.log) {
    if (log.playerId === seerId && log.content.includes('你查验了')) {
      const m = log.content.match(/你查验了\s*(\d+)\s*号玩家.*?结果是【(狼人|好人)】/)
      if (m) {
        const targetId = Number(m[1])
        const targetName = state.players.find((p) => p.id === targetId)?.name || ''
        history.push({
          day: log.day,
          targetId,
          targetName,
          result: m[2] === '狼人' ? 'wolf' : 'good',
        })
      }
    }
  }
  return history
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
function finishGame(this: any, winner: 'wolf' | 'good', day: number, cause: string) {
  const state = get()
  const user = state.players.find((p) => p.id === state.userPlayerId)
  if (user && state.config) {
    const userWon = ROLES[user.role].faction === winner
    playSfx(userWon ? 'victory' : 'defeat')
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
  set({ winner, winnerCause: cause, phase: 'game-over', processing: false })
  setTimeout(() => set({ view: 'result' }), 1500)
}

// 检查胜负并返回结果（统一处理）
function checkAndFinishGame(day: number): boolean {
  const state = get()
  const result = checkWinner(state.players, state.config?.ruleSet || 'tu-bian')
  if (result) {
    get().addLog({
      type: 'result', day, phase: 'game-over',
      content: `${result.faction === 'good' ? '🎉 好人阵营胜利' : '🌙 狼人阵营胜利'}！${result.cause}。`,
    })
    finishGame.call(null, result.faction, day, result.cause)
    return true
  }
  return false
}

// 处理玩家死亡后的连锁：猎人开枪 + 警徽移交
// isNightDeath: 是否夜间死亡（影响遗言判定）
async function handleDeathChain(initialDeaths: number[], isNightDeath: boolean): Promise<'continue' | 'finish' | 'wait-user-hunter' | 'wait-user-sheriff'> {
  const state = get()
  const day = state.day

  // 检查所有死亡玩家是否为猎人 → 触发开枪
  for (const deadId of initialDeaths) {
    const dead = get().players.find((p) => p.id === deadId)
    if (!dead) continue
    if (canHunterShoot(dead)) {
      // 触发猎人开枪
      set({ hunterPending: dead.id, phase: 'hunter-shoot', processing: false })
      if (dead.isUser) {
        return 'wait-user-hunter'
      } else {
        // AI 猎人开枪
        const targets = alivePlayers(get().players)
        const aiVisible = buildAIVisibleInfo(get(), dead.id, getSeerHistory(get(), dead.id))
        const aiRes = await callAI({
          action: 'hunter-shoot',
          playerId: dead.id,
          aiVisibleInfo: aiVisible,
          speeches: get().speeches,
          day,
        })
        const target = aiRes?.targetId ?? (targets.length > 0 ? randomPick(targets)?.id : null)
        await get().userHunterShoot(target ?? null)
        if (get().phase === 'game-over') return 'finish'
        return 'continue'
      }
    }
  }

  // 检查死亡玩家中是否有警长 → 触发警徽移交
  for (const deadId of initialDeaths) {
    const dead = get().players.find((p) => p.id === deadId)
    if (!dead) continue
    if (dead.id === get().sheriffId) {
      set({ sheriffTransferPending: dead.id, phase: 'sheriff-transfer', processing: false })
      if (dead.isUser) {
        return 'wait-user-sheriff'
      } else {
        // AI 警长移交
        const candidates = alivePlayers(get().players)
        const aiVisible = buildAIVisibleInfo(get(), dead.id, getSeerHistory(get(), dead.id))
        const aiRes = await callAI({
          action: 'sheriff-transfer',
          playerId: dead.id,
          aiVisibleInfo: aiVisible,
          speeches: get().speeches,
          day,
        })
        const targetId = aiRes?.targetId ?? (candidates.length > 0 ? randomPick(candidates)?.id : null)
        await get().userSheriffTransfer(targetId ?? null)
        return 'continue'
      }
    }
  }

  return 'continue'
}

// 注：get/set 由 zustand create 闭包提供，这里通过函数参数访问
let get: () => WerewolfGameState & WerewolfStore
let set: (
  partial: Partial<WerewolfGameState> | ((s: WerewolfGameState) => Partial<WerewolfGameState>),
) => void

// 投票超时计时器（30秒未投票自动弃票）
let voteTimer: ReturnType<typeof setTimeout> | null = null

function clearVoteTimer() {
  if (voteTimer !== null) {
    clearTimeout(voteTimer)
    voteTimer = null
  }
}

// 启动投票超时计时器：30秒后用户未投票则自动弃票
function startVoteTimer() {
  clearVoteTimer()
  voteTimer = setTimeout(() => {
    voteTimer = null
    const s = get()
    if (
      (s.phase === 'day-vote' || s.phase === 'day-sheriff-vote') &&
      s.voteDeadline !== null &&
      Date.now() >= s.voteDeadline
    ) {
      // 用户未投票 → 自动弃票
      s.showToast('⏰ 投票超时，自动弃票', 'danger')
      s.userVote(null)
    }
  }, 31000)
}

export const useWerewolfStore = create<WerewolfStore>((_set, _get) => {
  get = _get as any
  set = _set as any

  return {
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
          content: `游戏开始！本局配置：${config.name}（${config.playerCount}人，难度：${config.difficulty === 'easy' ? '简单' : config.difficulty === 'normal' ? '普通' : '困难'}，规则：${config.ruleSet === 'tu-bian' ? '屠边' : '屠城'}）。你的身份偏好：${preferredRole === 'random' ? '随机' : preferredRole === 'good' ? '好人阵营' : preferredRole === 'wolf' ? '狼人阵营' : ROLES[preferredRole as RoleId]?.name || preferredRole}`,
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
        winnerCause: null,
        gameStartTime: Date.now(),  // 记录对局开始时间（用于结算页时长统计）
      })
    },

    confirmRoleReveal: () => {
      set({ view: 'game', phase: 'night-start', day: 1 })
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
      setTimeout(() => {
        const cur = get().toast
        if (cur && cur.id === id) set({ toast: null })
      }, 3000)
    },

    clearToast: () => set({ toast: null }),

    confirmSeerResult: () => {
      // 预言家是夜晚最后行动者 (顺序: 狼→守→女巫→预言家),
      // 确认查验结果后应直接进入夜晚结算 (night-end), 而非回到女巫阶段
      set({ seerResultPending: null })
      set({ phase: 'night-end', processing: false })
      setTimeout(() => {
        get().proceedNightPhase()
      }, 300)
    },

    _setProcessing: (v) => set({ processing: v }),
    _setPhase: (p) => set({ phase: p }),

    // === Phase 1 新增 actions 实现 ===
    setSpeechSpeed: (speed) => set({ speechSpeed: speed }),

    markGuideSeen: (key) =>
      set((s) => ({ seenGuide: { ...s.seenGuide, [key]: true } })),

    showConfirmDialog: (cfg) => set({ confirmDialog: cfg }),
    closeConfirmDialog: () => set({ confirmDialog: null }),

    // 归档当前轮次发言到历史（跨天保留），仅在 speeches 非空时归档
    _archiveSpeeches: (label: string) => {
      const s = get()
      if (s.speeches.length === 0) return
      const round: SpeechRound = {
        id: logId(),
        day: s.day,
        phase: s.phase,
        label,
        speeches: s.speeches,
        timestamp: Date.now(),
      }
      set({ speechHistory: [...s.speechHistory, round] })
    },

    // 添加关键事件到事件流
    _addEvent: (e) => {
      const ev: GameEvent = { ...e, id: logId(), timestamp: Date.now() }
      set((s) => ({ events: [...s.events, ev] }))
    },

    // ========== 夜晚流程 ==========
    // 行动顺序 (v2.0 §6.1)：狼人 → 守卫 → 女巫 → 预言家
    proceedNightPhase: async () => {
      const state = get()
      if (state.processing) return
      set({ processing: true })

      try {
        let phase = state.phase
        const day = state.day

        // 初始化夜晚行动记录
        if (phase === 'night-start') {
          get().addLog({
            type: 'night',
            day,
            phase: 'night-start',
            content: `🌙 第 ${day} 夜降临，天黑请闭眼...`,
          })
          get()._addEvent({
            day, category: 'phase', icon: '🌙',
            title: `第${day}夜降临`,
            detail: '天黑请闭眼',
          })
          playSfx('night')
          set({
            nightAction: { day, deaths: [] },
            killedThisNight: [],
            witchActionThisNight: null,
          })
          // 清除上轮标记
          set({
            players: state.players.map((p) => ({
              ...p,
              protected: false,
              saved: false,
              poisoned: false,
            })),
          })
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
              set({ phase: 'night-wolf', processing: false })
              return
            } else {
              // AI 狼人决策（视角隔离）
              const leader = wolves[0]
              const aiVisible = buildAIVisibleInfo(get(), leader.id, getSeerHistory(get(), leader.id))
              const aiRes = await callAI({
                action: 'night-wolf',
                playerId: leader.id,
                aiVisibleInfo: aiVisible,
                day,
              })
              // 校验：AI 不能刀自己人/已死玩家
              const validTargets = alivePlayers(get().players).filter((p) => !isWolf(p.role))
              let target = aiRes?.targetId
              if (target === undefined || target === null || !validTargets.find((p) => p.id === target)) {
                target = randomPick(validTargets)?.id
              }
              set((s) => ({
                nightAction: { ...(s.nightAction as NightAction), wolfTarget: target },
              }))
              await delay(500)
            }
          }
          phase = 'night-guard'
        }

        // ---- 守卫 ----
        if (phase === 'night-guard') {
          const guard = get().players.find((p) => p.isAlive && p.role === 'guard')
          if (guard) {
            get().addLog({
              type: 'night',
              day,
              phase: 'night-guard',
              content: '🛡️ 守卫请睁眼，选择今晚守护的玩家...',
              secret: true,
            })
            if (guard.isUser) {
              set({ phase: 'night-guard', processing: false })
              return
            } else {
              const aiVisible = buildAIVisibleInfo(get(), guard.id, getSeerHistory(get(), guard.id))
              const aiRes = await callAI({
                action: 'night-guard',
                playerId: guard.id,
                aiVisibleInfo: aiVisible,
                lastGuardTarget: get().lastGuardTarget,
                day,
              })
              // 不能连续两晚守同一人
              const validTargets = alivePlayers(get().players).filter((p) => p.id !== get().lastGuardTarget)
              let target = aiRes?.targetId
              if (target === undefined || target === null || !validTargets.find((p) => p.id === target)) {
                target = randomPick(validTargets)?.id
              }
              set((s) => ({
                nightAction: { ...(s.nightAction as NightAction), guardTarget: target },
              }))
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
              const canSave = !get().witchAntidoteUsed
              const canPoison = !get().witchPoisonUsed
              const aiVisible = buildAIVisibleInfo(get(), witch.id, getSeerHistory(get(), witch.id))
              const aiRes = await callAI({
                action: 'night-witch',
                playerId: witch.id,
                aiVisibleInfo: aiVisible,
                canSave,
                canPoison,
                day,
              })
              // v2.0 §1.2: 同一晚默认只能用一瓶药
              let witchSave = false
              let poisonTarget: number | undefined
              if (aiRes?.save && canSave) {
                witchSave = true
              } else if (aiRes?.poisonTarget !== null && aiRes?.poisonTarget !== undefined && canPoison) {
                const tgt = aiRes.poisonTarget
                const valid = alivePlayers(get().players).find((p) => p.id === tgt && p.id !== witch.id)
                if (valid) poisonTarget = tgt
              }
              set((s) => ({
                nightAction: {
                  ...(s.nightAction as NightAction),
                  witchSave,
                  witchPoisonTarget: poisonTarget,
                },
                witchActionThisNight: witchSave ? 'save' : (poisonTarget !== undefined ? 'poison' : null),
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
              const aiVisible = buildAIVisibleInfo(get(), seer.id, getSeerHistory(get(), seer.id))
              const aiRes = await callAI({
                action: 'night-seer',
                playerId: seer.id,
                aiVisibleInfo: aiVisible,
                day,
              })
              let target = aiRes?.targetId
              if (target === undefined || target === null || !targets.find((p) => p.id === target)) {
                target = randomPick(targets)?.id
              }
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
          phase = 'night-end'
        }

        // ---- 夜晚结算 ----
        if (phase === 'night-end') {
          const action = get().nightAction as NightAction
          const sameGuardSave = get().config?.sameGuardSaveDeath ?? true
          const result = resolveNight(get().players, action, get().lastGuardTarget, sameGuardSave)

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
                : `☀️ 第 ${day} 天天亮了，昨晚 ${result.deaths.map((d) => d + '号').join('、')} 死亡。`,
          })

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

          // 检查胜负
          if (checkAndFinishGame(day)) return

          // 处理死亡连锁（猎人开枪 / 警徽移交）
          if (result.deaths.length > 0) {
            const chainResult = await handleDeathChain(result.deaths, true)
            if (chainResult === 'wait-user-hunter' || chainResult === 'wait-user-sheriff') return
            if (chainResult === 'finish') return
            if (get().phase === 'hunter-shoot' || get().phase === 'sheriff-transfer') return
          }

          // 进入白天：第一天先竞选警长，后续天直接公布
          if (day === 1 && get().config?.enableSheriff) {
            set({ phase: 'day-sheriff-announce', processing: false, speeches: [], currentSpeaker: null, whiteWolfSkillAvailable: false })
          } else {
            set({ phase: 'day-announce', processing: false, speeches: [], currentSpeaker: null, whiteWolfSkillAvailable: false })
          }
          await delay(800)
          get().proceedDayPhase()
          return
        }

        set({ processing: false })
      } catch (err) {
        console.error('[proceedNightPhase] error:', err)
        set({ processing: false, speaking: false })
      }
    },

    // 用户夜晚行动
    userNightAction: async (action) => {
      const state = get()
      const phase = state.phase

      // v2.0 §1.2: 女巫同晚单药限制
      if (phase === 'night-witch') {
        const alreadyActed = get().witchActionThisNight
        if (alreadyActed === 'save' && action.witchPoisonTarget !== undefined) {
          get().showToast('同一晚只能使用一瓶药！', 'danger')
          return
        }
        if (alreadyActed === 'poison' && action.witchSave) {
          get().showToast('同一晚只能使用一瓶药！', 'danger')
          return
        }
      }

      set((s) => ({
        nightAction: { ...(s.nightAction as NightAction), ...action },
      }))

      // 记录日志
      if (phase === 'night-guard') {
        get().addLog({
          type: 'action', day: state.day, phase,
          playerId: state.userPlayerId, playerName: '你',
          content: action.guardTarget !== undefined && action.guardTarget !== null ? `你守护了 ${action.guardTarget} 号玩家` : '你今晚空守',
        })
      } else if (phase === 'night-wolf') {
        get().addLog({
          type: 'action', day: state.day, phase,
          playerId: state.userPlayerId, playerName: '你',
          content: action.wolfTarget !== undefined && action.wolfTarget !== null ? `你选择了击杀 ${action.wolfTarget} 号玩家` : '你今晚空刀',
        })
      } else if (phase === 'night-seer') {
        if (action.seerTarget !== undefined && action.seerTarget !== null) {
          const t = state.players.find((p) => p.id === action.seerTarget)
          const result = t && isWolf(t.role) ? '狼人' : '好人'
          action.seerResult = t && isWolf(t.role) ? 'wolf' : 'good'
          playSfx('seerScan')
          get().addLog({
            type: 'action', day: state.day, phase,
            playerId: state.userPlayerId, playerName: '你',
            content: `你查验了 ${action.seerTarget} 号玩家，结果是【${result}】`,
          })
          set({
            seerResultPending: {
              targetId: action.seerTarget,
              targetName: t?.name || '',
              result: action.seerResult!,
            },
            nightAction: { ...(get().nightAction as NightAction), seerTarget: action.seerTarget, seerResult: action.seerResult },
          })
          return // 等用户确认查验结果
        }
      } else if (phase === 'night-witch') {
        const actionType: 'save' | 'poison' | null = action.witchSave ? 'save' : (action.witchPoisonTarget !== undefined ? 'poison' : null)
        set({ witchActionThisNight: actionType })
        if (action.witchSave) {
          get().addLog({ type: 'action', day: state.day, phase, content: '你使用了解药救人' })
        }
        if (action.witchPoisonTarget !== undefined && action.witchPoisonTarget !== null) {
          get().addLog({ type: 'action', day: state.day, phase, content: `你毒杀了 ${action.witchPoisonTarget} 号玩家` })
        }
        if (!action.witchSave && (action.witchPoisonTarget === undefined || action.witchPoisonTarget === null)) {
          get().addLog({ type: 'action', day: state.day, phase, content: '你今晚没有使用任何药剂' })
        }
      }

      // 推进到下一阶段 (v2.0 §6.1 顺序：狼→守→巫→预)
      const nextPhase: Record<string, GamePhase> = {
        'night-wolf': 'night-guard',
        'night-guard': 'night-witch',
        'night-witch': 'night-seer',
        'night-seer': 'night-end',
      }
      const np = nextPhase[phase]
      set({ phase: np, processing: false })
      await delay(400)
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
            type: 'day', day, phase: 'day-sheriff-announce',
            content: '🏛️ 第一天白天，开始竞选警长！想当警长的玩家请上警。',
          })
          get().showToast('🏛️ 开始竞选警长！', 'info')
          set({
            phase: 'day-sheriff-campaign',
            sheriffCandidates: [],
            sheriffVotes: [],
            sheriffCampaignIdx: 0,
            speeches: [],
            _aiSheriffDecided: false,
            _aiSheriffCollected: false,
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
          const userAlive = alive.some((p) => p.id === userId)
          let candidates = [...state.sheriffCandidates]

          // 用户先决定是否上警（死亡用户视为已决定不上警）
          const userDecided = !userAlive || candidates.includes(userId) || state.sheriffCampaignIdx > 0 || get()._aiSheriffDecided
          if (!userDecided) {
            set({ processing: false })
            return
          }

          // 收集所有 AI 玩家的上警决定
          if (!get()._aiSheriffCollected) {
            set({ _aiSheriffCollected: true })
            // AI 上警概率（v2.0 §8 + §9.3）：预言家95%，狼人60%，女巫40%，猎人30%，守卫20%，平民20%
            // 预言家几乎必上警(1.5票权+警徽流)是标准狼人杀策略
            const probMap: Record<string, number> = {
              seer: 0.95, wolf: 0.6, 'white-wolf': 0.6,
              witch: 0.4, hunter: 0.3, guard: 0.2, villager: 0.2,
            }
            for (const p of alive) {
              if (p.isUser) continue
              const prob = probMap[p.role] ?? 0.2
              if (Math.random() < prob) {
                candidates.push(p.id)
                get().addLog({
                  type: 'day', day, phase: 'day-sheriff-campaign',
                  content: `${p.id}号(${p.name})上警！`,
                })
              }
            }
            // 保底机制: 若无AI上警且用户未上警, 强制至少1人上警(优先预言家, 其次随机AI)
            // 避免6人局出现0人上警的极端情况破坏游戏流程
            const aiCandidates = candidates.filter((id) => id !== userId)
            if (aiCandidates.length === 0 && !candidates.includes(userId)) {
              const seer = alive.find((p) => !p.isUser && p.role === 'seer')
              const forced = seer || alive.find((p) => !p.isUser)
              if (forced) {
                candidates.push(forced.id)
                get().addLog({
                  type: 'day', day, phase: 'day-sheriff-campaign',
                  content: `${forced.id}号(${forced.name})上警！`,
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
                set({ currentSpeaker: candidateId, processing: false })
                return
              } else {
                set({ speaking: true, processing: true })
                const aiVisible = buildAIVisibleInfo(get(), candidate.id, getSeerHistory(get(), candidate.id))
                const aiRes = await callAI({
                  action: 'sheriff-campaign',
                  playerId: candidate.id,
                  aiVisibleInfo: aiVisible,
                  candidates,
                  speeches: get().speeches,
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

          // 所有候选人发言完毕
          if (candidates.length === 1) {
            const sheriffId = candidates[0]
            const sheriffPlayer = get().players.find((p) => p.id === sheriffId)
            get()._archiveSpeeches(`第${day}天·竞选警长`)
            set({ sheriffId, phase: 'day-announce', processing: false, currentSpeaker: null, speeches: [] })
            get().addLog({
              type: 'day', day, phase: 'day-sheriff-campaign',
              content: `🏛️ ${sheriffId}号无人竞争，自动当选警长！`,
            })
            get()._addEvent({
              day, category: 'sheriff', icon: '🏛️',
              title: `${sheriffId}号 ${sheriffPlayer?.name || ''} 当选警长`,
              detail: '无人竞争，自动当选',
            })
            get().showToast(`🏛️ ${sheriffId}号当选警长`, 'success')
            await delay(800)
            get().proceedDayPhase()
            return
          }
          if (candidates.length === 0) {
            get().addLog({
              type: 'day', day, phase: 'day-sheriff-campaign',
              content: '🏛️ 无人竞选警长，警徽流失，本局无警长。',
            })
            get()._addEvent({
              day, category: 'sheriff', icon: '🏛️',
              title: '无人上警，警徽流失',
              detail: '本局无警长',
            })
            get().showToast('🏛️ 无人上警，本局无警长', 'info')
            set({ sheriffId: null, phase: 'day-announce', processing: false, currentSpeaker: null, speeches: [] })
            await delay(800)
            get().proceedDayPhase()
            return
          }
          // 多人竞选，进入投票
          get().addLog({
            type: 'day', day, phase: 'day-sheriff-campaign',
            content: `🗳️ 候选人发言完毕，未上警的玩家开始投票选出警长。`,
          })
          set({ phase: 'day-sheriff-vote', sheriffVotes: [], processing: false, voteDeadline: Date.now() + 30000 })
          startVoteTimer()
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
          const voters = alive.filter((p) => !candidates.includes(p.id))

          if (!userIsCandidate && !userVoted) {
            set({ processing: false })
            return
          }

          set({ processing: true })
          for (const p of voters) {
            if (p.isUser) continue
            if (votedIds.has(p.id)) continue
            const aiVisible = buildAIVisibleInfo(get(), p.id, getSeerHistory(get(), p.id))
            const aiRes = await callAI({
              action: 'sheriff-vote',
              playerId: p.id,
              aiVisibleInfo: aiVisible,
              candidates,
              speeches: get().speeches,
              day,
            })
            const targetId = aiRes?.targetId ?? randomPick(candidates) ?? null
            const target = targetId !== null ? get().players.find((pp) => pp.id === targetId) : null
            const vote: VoteRecord = { voterId: p.id, voterName: p.name, targetId, targetName: target ? target.name : null }
            set((s) => ({ sheriffVotes: [...s.sheriffVotes, vote] }))
            votedIds.add(p.id)
            await delay(120)
          }

          // 统计警长票（无警长时 1 票/人）
          const svotes = get().sheriffVotes
          const tally = tallyVotes(svotes.map((v) => ({ voterId: v.voterId, targetId: v.targetId })), null)
          let sheriffId: number | null = tally.winnerId
          if (tally.tie) {
            // 平票：随机选一个候选（简化处理，v2.0 应进入 PK）
            sheriffId = svotes.length > 0 ? randomPick(svotes.filter((v) => v.targetId !== null).map((v) => v.targetId!)) ?? null : null
          }
          if (sheriffId !== null) {
            const sheriffPlayer = get().players.find((p) => p.id === sheriffId)
            const voteCount = svotes.filter((v) => v.targetId === sheriffId).length
            get().addLog({
              type: 'day', day, phase: 'day-sheriff-vote',
              content: `🏛️ ${sheriffId}号当选警长！（得票最多）`,
            })
            get()._addEvent({
              day, category: 'sheriff', icon: '🏛️',
              title: `${sheriffId}号 ${sheriffPlayer?.name || ''} 当选警长`,
              detail: `得票最多（${voteCount}票）`,
            })
            get().showToast(`🏛️ ${sheriffId}号当选警长`, 'success')
          } else {
            get().addLog({
              type: 'day', day, phase: 'day-sheriff-vote',
              content: '🏛️ 警长竞选平票，警徽流失。',
            })
            get()._addEvent({
              day, category: 'sheriff', icon: '🏛️',
              title: '警长竞选平票，警徽流失',
            })
            get().showToast('🏛️ 警长竞选平票，无警长', 'info')
          }
          get()._archiveSpeeches(`第${day}天·竞选警长`)
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
            get()._addEvent({
              day, category: 'phase', icon: '☀️',
              title: `第${day}天天亮，平安夜`,
              detail: '昨晚无人死亡',
            })
          } else {
            const names = deaths.map((id) => `${id}号`).join('、')
            get().addLog({
              type: 'day', day, phase: 'day-announce',
              content: `📋 昨晚 ${names} 玩家死亡。`,
            })
            // 添加死亡事件
            for (const deadId of deaths) {
              const dead = get().players.find((p) => p.id === deadId)
              if (dead) {
                get()._addEvent({
                  day, category: 'death', icon: '💀',
                  title: `${deadId}号 ${dead.name} 夜间死亡`,
                  detail: dead.deathReason || '被狼人击杀',
                })
              }
            }
          }
          // v2.0 §7.1: 第一晚死亡有遗言；被毒/被枪击无遗言；后续夜晚死亡无遗言
          const lastWordsQueue: number[] = []
          for (const deadId of deaths) {
            const dead = get().players.find((p) => p.id === deadId)
            if (dead && hasLastWords(dead, day, true)) {
              lastWordsQueue.push(deadId)
            }
          }
          if (lastWordsQueue.length > 0) {
            set({ phase: 'day-lastwords', lastWordsPending: lastWordsQueue, processing: false, speeches: [] })
            await delay(600)
            get().proceedDayPhase()
            return
          }
          // 进入白天讨论：白狼王技能可用（白天可主动自爆）
          const aliveForDiscuss = alivePlayers(state.players)
          set({ phase: 'day-discuss', speeches: [], currentSpeaker: null, speakStartIdx: null, speakCount: 0, speakTotal: aliveForDiscuss.length, processing: false, whiteWolfSkillAvailable: true, pkPair: null, pkRound: 0, voteRevealed: false })
          await delay(600)
          get().proceedDayPhase()
          return
        }

        // ---- 死亡遗言 ----
        if (state.phase === 'day-lastwords') {
          const pending = get().lastWordsPending
          if (pending.length === 0) {
            // 判断遗言后是去讨论还是去夜晚
            // 如果是首夜遗言 → 讨论阶段（已经过警长竞选）
            // 如果是投票出局遗言 → 进入下一夜
            if (get().killedThisNight.length === 0 && get().votes.length > 0) {
              // 投票出局后的遗言结束 → 进入下一夜
              get()._archiveSpeeches(`第${day}天·遗言`)
              set({
                phase: 'night-start', day: day + 1,
                speeches: [], votes: [], currentSpeaker: null, speakStartIdx: null, speakCount: 0,
                killedThisNight: [], processing: false, whiteWolfSkillAvailable: false,
              })
              await delay(800)
              get().proceedNightPhase()
              return
            }
            get()._archiveSpeeches(`第${day}天·遗言`)
            // 进入白天讨论：白狼王技能可用
            const aliveForDiscuss2 = alivePlayers(state.players)
            set({ phase: 'day-discuss', speeches: [], currentSpeaker: null, speakStartIdx: null, speakCount: 0, speakTotal: aliveForDiscuss2.length, processing: false, whiteWolfSkillAvailable: true, pkPair: null, pkRound: 0, voteRevealed: false })
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
            set({ currentSpeaker: dyingId, processing: false })
            return
          } else {
            set({ speaking: true, processing: true })
            const aiVisible = buildAIVisibleInfo(get(), dying.id, getSeerHistory(get(), dying.id))
            const aiRes = await callAI({
              action: 'last-words',
              playerId: dying.id,
              aiVisibleInfo: aiVisible,
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
          // PK 模式：仅 pkPair 中两人发言
          const isPK = state.pkPair !== null && state.pkRound > 0
          const speakers = isPK ? alive.filter((p) => state.pkPair!.includes(p.id)) : alive
          if (state.currentSpeaker === null) {
            if (isPK) {
              // PK 模式：pkPair[0] 先发言
              set({
                currentSpeaker: state.pkPair![0],
                speakStartIdx: 0,
                speakCount: 0,
                speakTotal: 2,
              })
            } else {
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
                speakTotal: alive.length,
              })

              // AI 白狼王主动自爆评估（v2.0 §8.8 白狼王白天可发动技能）
              // 仅在第2天及以后、AI白狼王存活时评估；使用启发式避免额外LLM调用
              const aiWhiteWolf = alive.find((p) => !p.isUser && p.role === 'white-wolf')
              if (aiWhiteWolf && day >= 2) {
                // 评估条件：狼人阵营处于劣势（狼数<=神职暴露数+1）或随机触发
                const wolves = aliveWolves(alive)
                const exposedGods = alive.filter((p) =>
                  p.role !== 'wolf' && p.role !== 'white-wolf' && p.role !== 'villager' && p.isUser,
                )
                const disadvantage = wolves.length <= exposedGods.length + 1
                const rand = Math.random()
                const difficulty = state.config?.difficulty || 'normal'
                // 老练档更倾向战略性自爆
                const baseProb = difficulty === 'hard' ? 0.18 : difficulty === 'normal' ? 0.12 : 0.08
                const shouldBomb = disadvantage ? (rand < baseProb * 1.5) : (rand < baseProb * 0.5)
                if (shouldBomb) {
                  // 选择目标：优先已暴露的神职（预言家>女巫>守卫>猎人），否则随机好人
                  const targetPriority = ['seer', 'witch', 'guard', 'hunter']
                  let targetId: number | null = null
                  for (const role of targetPriority) {
                    // 优先选用户（已暴露）的神职
                    const exposed = alive.find((p) => p.role === role && p.isUser)
                    if (exposed) { targetId = exposed.id; break }
                  }
                  if (targetId === null) {
                    // 否则从好人中随机选一个非白狼王
                    const goodTargets = alive.filter((p) => p.id !== aiWhiteWolf.id && !isWolf(p.role))
                    targetId = goodTargets.length > 0 ? randomPick(goodTargets)!.id : null
                  }
                  if (targetId !== null) {
                    set({ whiteWolfSelfDestructPending: aiWhiteWolf.id, phase: 'day-self-destruct', processing: false })
                    get().showToast(`💥 ${aiWhiteWolf.name}(${aiWhiteWolf.id}号) 白狼王发动自爆！`, 'danger')
                    await delay(600)
                    get().proceedDayPhase()
                    return
                  }
                }
              }
            }
          }

          const currentId = get().currentSpeaker
          const speakCount = get().speakCount

          if (currentId === null || speakCount >= speakers.length) {
            // 进入投票阶段：白狼王技能仍可用（投票前最后一刻可自爆）
            set({ phase: 'day-vote', currentSpeaker: null, votes: [], processing: false, voteDeadline: Date.now() + 30000, whiteWolfSkillAvailable: true, voteRevealed: false })
            startVoteTimer()
            await delay(500)
            get().proceedDayPhase()
            return
          }

          const speaker = get().players.find((p) => p.id === currentId)
          if (!speaker || !speaker.isAlive) {
            const idx = speakers.findIndex((p) => p.id === currentId)
            const nextIdx = (idx + 1) % speakers.length
            set({ currentSpeaker: speakers[nextIdx].id })
            get().proceedDayPhase()
            return
          }

          if (speaker.isUser) {
            set({ processing: false })
            return
          }

          // AI 发言
          set({ speaking: true, processing: true })
          const aiVisible = buildAIVisibleInfo(get(), speaker.id, getSeerHistory(get(), speaker.id))
          const aiRes = await callAI({
            action: 'day-speak',
            playerId: speaker.id,
            aiVisibleInfo: aiVisible,
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

          const idx = speakers.findIndex((p) => p.id === currentId)
          const nextIdx = (idx + 1) % speakers.length
          const newCount = get().speakCount + 1
          set({ currentSpeaker: speakers[nextIdx].id, speakCount: newCount, processing: false })
          get().proceedDayPhase()
          return
        }

        // ---- 白狼王自爆带人 ----
        if (state.phase === 'day-self-destruct') {
          const bomberId = get().whiteWolfSelfDestructPending
          if (bomberId === null) {
            set({ processing: false })
            return
          }
          const bomber = get().players.find((p) => p.id === bomberId)
          if (!bomber) {
            set({ whiteWolfSelfDestructPending: null, processing: false })
            return
          }
          if (bomber.isUser) {
            // 等待用户选择目标
            set({ processing: false })
            return
          }
          // AI 白狼王自爆 - 选择目标
          set({ speaking: true, processing: true })
          const aiVisible = buildAIVisibleInfo(get(), bomber.id, getSeerHistory(get(), bomber.id))
          const aiRes = await callAI({
            action: 'white-wolf-self-destruct',
            playerId: bomber.id,
            aiVisibleInfo: aiVisible,
            speeches: get().speeches,
            day,
          })
          const validTargets = alivePlayers(get().players).filter((p) => p.id !== bomber.id)
          let target = aiRes?.targetId
          if (target === undefined || target === null || !validTargets.find((p) => p.id === target)) {
            target = randomPick(validTargets)?.id
          }
          await get().userSelfDestruct(target!)
          return
        }

        // ---- 投票 ----
        if (state.phase === 'day-vote') {
          const alive = alivePlayers(state.players)
          const existingVotes = get().votes
          const votedIds = new Set(existingVotes.map((v) => v.voterId))
          const userVoted = votedIds.has(state.userPlayerId)
          const userAlive = alive.some((p) => p.id === state.userPlayerId)
          // PK 模式：投票只能投 pkPair 中的玩家
          const isPK = state.pkPair !== null && state.pkRound > 0
          const pkPair = state.pkPair

          if (userAlive && !userVoted) {
            set({ processing: false })
            return
          }

          set({ processing: true })
          for (const p of alive) {
            if (p.isUser) continue
            if (votedIds.has(p.id)) continue
            // PK 候选人不参与投票（仅被投）
            if (isPK && pkPair && pkPair.includes(p.id)) {
              votedIds.add(p.id)
              continue
            }
            const aiVisible = buildAIVisibleInfo(get(), p.id, getSeerHistory(get(), p.id))
            const aiRes = await callAI({
              action: 'day-vote',
              playerId: p.id,
              aiVisibleInfo: aiVisible,
              speeches: get().speeches,
              day,
            })
            let targetId = aiRes?.targetId ?? null
            // PK 模式校验：只能投 pkPair 中的玩家
            if (isPK && pkPair) {
              if (targetId === null || !pkPair.includes(targetId)) {
                // 随机选一个 pkPair 中的目标
                targetId = pkPair[Math.floor(Math.random() * pkPair.length)]
              }
            } else {
              // 普通模式校验：不能投自己、不能投已死玩家
              const valid = targetId !== null && targetId !== p.id && alive.find((pp) => pp.id === targetId)
              targetId = valid ? targetId : null
            }
            const finalTarget = targetId
            const target = finalTarget !== null ? get().players.find((pp) => pp.id === finalTarget) : null
            const vote: VoteRecord = { voterId: p.id, voterName: p.name, targetId: finalTarget, targetName: target ? target.name : null }
            set((s) => ({ votes: [...s.votes, vote] }))
            votedIds.add(p.id)
            await delay(150)
          }

          // 统计投票（警长票 1.5 票）
          const votes = get().votes
          const sheriffId = get().sheriffId
          const tally = tallyVotes(votes.map((v) => ({ voterId: v.voterId, targetId: v.targetId })), sheriffId)
          const winnerId = tally.winnerId
          const tie = tally.tie

          // 公布投票结果（票型墙动画）
          set({ voteRevealed: true })
          await delay(1500)  // 留出票型墙展示时间

          // === 平票 PK 流程（仅首轮平票 + 存活>2人时进入PK） ===
          if (tie && winnerId === null && get().pkRound === 0 && alive.length > 2 && tally.tieCandidates && tally.tieCandidates.length >= 2) {
            const pkPair = tally.tieCandidates.slice(0, 2)
            get()._archiveSpeeches(`第${day}天·白天讨论`)
            get()._addEvent({
              day, category: 'vote', icon: '⚖️',
              title: `投票平票，进入PK`,
              detail: `${pkPair.map((id) => `${id}号`).join(' vs ')} 进行PK发言与投票`,
            })
            get().showToast(`⚖️ 平票！${pkPair[0]}号 vs ${pkPair[1]}号 进入PK`, 'info')
            set({
              phase: 'day-discuss',
              speeches: [],
              currentSpeaker: null,
              speakStartIdx: null,
              speakCount: 0,
              speakTotal: 2,  // PK 只两人发言
              votes: [],
              pkPair,
              pkRound: 1,
              voteRevealed: false,
              processing: false,
              whiteWolfSkillAvailable: true,
            })
            await delay(800)
            get().proceedDayPhase()
            return
          }

          get().addLog({
            type: 'vote', day, phase: 'day-result',
            content: winnerId === null ? (tie ? `投票平票，无人出局。` : `全员弃票，无人出局。`) : `${winnerId}号玩家被投票放逐！`,
          })
          if (winnerId !== null) {
            const outPlayer = get().players.find((p) => p.id === winnerId)
            playSfx('death')
            // 添加投票放逐事件
            get()._addEvent({
              day, category: 'vote', icon: '🗳️',
              title: `${winnerId}号 ${outPlayer?.name || ''} 被投票放逐`,
              detail: `得票最多，被放逐出局`,
            })
            if (winnerId === get().userPlayerId) {
              get().showToast('出局 你被投票放逐了！', 'danger')
            } else {
              get().showToast(`🗳️ ${winnerId}号被投票放逐`, 'info')
            }
          } else {
            get()._addEvent({
              day, category: 'vote', icon: '🗳️',
              title: tie ? '投票平票，无人出局' : '全员弃票，无人出局',
            })
            get().showToast('🗳️ 投票平票，无人出局', 'info')
          }
          const detail = votes.map((v) => `${v.voterName}${v.voterId === sheriffId ? '(警长1.5票)' : ''}→${v.targetName || '弃票'}`).join('，')
          get().addLog({ type: 'vote', day, phase: 'day-result', content: `投票详情：${detail}` })

          let finalPlayers = get().players
          if (winnerId !== null) {
            finalPlayers = get().players.map((p) =>
              p.id === winnerId ? { ...p, isAlive: false, deathCause: 'voted-out' as DeathCause, deathReason: '被投票放逐', deathDay: day } : p,
            )
            set({ players: finalPlayers })
          }

          // 检查胜负
          if (checkAndFinishGame(day)) return

          // 处理死亡连锁（猎人开枪 / 警徽移交）
          if (winnerId !== null) {
            const chainResult = await handleDeathChain([winnerId], false)
            if (chainResult === 'wait-user-hunter' || chainResult === 'wait-user-sheriff') return
            if (chainResult === 'finish') return
            if (get().phase === 'hunter-shoot' || get().phase === 'sheriff-transfer') return
          }

          // 被投票出局者发表遗言（v2.0 §7.1: 被放逐有遗言）
          if (winnerId !== null) {
            const out = get().players.find((p) => p.id === winnerId)
            if (out && hasLastWords(out, day, false)) {
              get()._archiveSpeeches(`第${day}天·白天讨论`)
              set({ phase: 'day-lastwords', lastWordsPending: [winnerId], processing: false, speeches: [], whiteWolfSkillAvailable: false })
              await delay(500)
              get().proceedDayPhase()
              return
            }
          }

          // 进入下一夜
          get()._archiveSpeeches(`第${day}天·白天讨论`)
          set({
            phase: 'night-start', day: day + 1,
            speeches: [], votes: [], currentSpeaker: null, speakStartIdx: null, speakCount: 0,
            killedThisNight: [], processing: false, whiteWolfSkillAvailable: false,
            pkPair: null, pkRound: 0, voteRevealed: false,
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
      // 用户已投票：清除超时计时器与截止时间
      clearVoteTimer()
      if (state.phase === 'day-sheriff-vote') {
        const voter = state.players.find((p) => p.id === state.userPlayerId)
        if (!voter) return
        const target = targetId !== null ? state.players.find((p) => p.id === targetId) : null
        const vote: VoteRecord = { voterId: voter.id, voterName: voter.name, targetId, targetName: target ? target.name : null }
        set((s) => ({ sheriffVotes: [...s.sheriffVotes, vote], voteDeadline: null }))
        get().addLog({
          type: 'vote', day: state.day, phase: 'day-sheriff-vote',
          playerId: voter.id, playerName: voter.name,
          content: target ? `你投票给 ${target.name}(${target.id}号)当警长` : '你弃票',
        })
        set({ processing: false })
        get().proceedDayPhase()
        return
      }
      const voter = state.players.find((p) => p.id === state.userPlayerId)
      if (!voter) return
      const target = targetId !== null ? state.players.find((p) => p.id === targetId) : null
      const vote: VoteRecord = { voterId: voter.id, voterName: voter.name, targetId, targetName: target ? target.name : null }
      set((s) => ({ votes: [...s.votes, vote], voteDeadline: null }))
      get().addLog({
        type: 'vote', day: state.day, phase: 'day-vote',
        playerId: voter.id, playerName: voter.name,
        content: target ? `你投票给 ${target.name}(${target.id}号)` : '你弃票',
      })
      set({ processing: false })
      get().proceedDayPhase()
    },

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
      // 标记用户已决定上警/不上警；AI上警决定由 proceedDayPhase 中 _aiSheriffCollected 标记控制
      set({ processing: false, _aiSheriffDecided: true })
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

    // ========== 白狼王自爆 (v2.0 §8.8) ==========
    // 用户白狼王可在白天讨论/投票阶段主动发动自爆（无需等到自己发言）
    userSelfDestruct: async (targetId) => {
      const state = get()
      // 兼容两种入口：
      // 1. 系统进入 day-self-destruct 阶段（AI触发或启发式触发），bomberId 已在 whiteWolfSelfDestructPending
      // 2. 用户在 day-discuss / day-vote 阶段主动点击自爆按钮 → 此时 bomberId 为用户自己
      let bomberId = state.whiteWolfSelfDestructPending
      if (bomberId === null) {
        // 用户主动发动：必须是白狼王本人且技能可用
        const me = state.players.find((p) => p.id === state.userPlayerId)
        if (!me || me.role !== 'white-wolf' || !me.isAlive) return
        if (!state.whiteWolfSkillAvailable) {
          get().showToast('当前阶段无法发动自爆', 'danger')
          return
        }
        bomberId = state.userPlayerId
      }
      const bomber = state.players.find((p) => p.id === bomberId)
      if (!bomber) return
      const target = state.players.find((p) => p.id === targetId)
      if (!target || !target.isAlive || target.id === bomberId) {
        get().showToast('请选择有效的目标', 'danger')
        return
      }

      // 清除投票超时计时器（若在投票阶段自爆）
      clearVoteTimer()

      playSfx('shoot')
      // 标记死亡：白狼王自爆 + 目标
      set((s) => ({
        players: s.players.map((p) => {
          if (p.id === bomberId) {
            return { ...p, isAlive: false, deathCause: 'self-destruct' as DeathCause, deathReason: '白狼王自爆', deathDay: state.day }
          }
          if (p.id === targetId) {
            return { ...p, isAlive: false, deathCause: 'white-wolf-bomb' as DeathCause, deathReason: '被白狼王自爆带走', deathDay: state.day }
          }
          return p
        }),
        whiteWolfSelfDestructPending: null,
        whiteWolfSkillAvailable: false,
      }))

      get().addLog({
        type: 'action', day: state.day, phase: 'day-self-destruct',
        playerId: bomber.id, playerName: bomber.name,
        content: `💥 ${bomber.name}(${bomber.id}号) 白狼王自爆！带走了 ${target?.name}(${target?.id}号)！立即进入黑夜。`,
      })
      get()._addEvent({
        day: state.day, category: 'skill', icon: '💥',
        title: `${bomber.id}号 ${bomber.name} 白狼王自爆`,
        detail: `带走 ${target.id}号 ${target.name}，立即进入黑夜`,
      })
      get()._addEvent({
        day: state.day, category: 'death', icon: '💀',
        title: `${target.id}号 ${target.name} 被白狼王带走`,
      })
      get().showToast(`💥 ${bomber.name} 白狼王自爆，带走 ${target?.name}！`, 'danger')

      // 检查胜负
      if (checkAndFinishGame(state.day)) return

      // 处理死亡连锁：警徽移交（白狼王若是警长）
      const deaths = [bomberId, targetId]
      const chainResult = await handleDeathChain(deaths, false)
      if (chainResult === 'wait-user-sheriff') return
      if (chainResult === 'finish') return
      if (get().phase === 'sheriff-transfer') return

      // 白狼王自爆后立即进入黑夜（v2.0 §8.8）
      // 归档当前轮发言到历史（保留白天讨论记录）
      get()._archiveSpeeches(`第${state.day}天·白天讨论`)
      set({
        phase: 'night-start', day: state.day + 1,
        speeches: [], votes: [], currentSpeaker: null, speakStartIdx: null, speakCount: 0,
        killedThisNight: [], processing: false,
      })
      await delay(800)
      get().proceedNightPhase()
    },

    // ========== 警徽移交 (v2.0 §12.2 防误操作) ==========
    userSheriffTransfer: async (targetId) => {
      const state = get()
      const dyingSheriffId = state.sheriffTransferPending
      if (dyingSheriffId === null) return
      const dying = state.players.find((p) => p.id === dyingSheriffId)
      if (!dying) {
        set({ sheriffTransferPending: null, processing: false })
        return
      }
      if (targetId !== null) {
        const successor = state.players.find((p) => p.id === targetId)
        set({ sheriffId: targetId, sheriffTransferPending: null })
        get().addLog({
          type: 'action', day: state.day, phase: 'sheriff-transfer',
          playerId: dying.id, playerName: dying.name,
          content: `🏛️ ${dying.name}(${dying.id}号) 临终将警徽移交给 ${successor?.name}(${targetId}号)！`,
        })
        get()._addEvent({
          day: state.day, category: 'sheriff', icon: '👑',
          title: `警徽移交：${targetId}号 ${successor?.name || ''} 继任`,
          detail: `${dying.id}号 ${dying.name} 临终移交`,
        })
        get().showToast(`🏛️ 警徽移交：${successor?.name} 继任警长`, 'success')
      } else {
        // 撕毁警徽
        set({ sheriffId: null, sheriffTransferPending: null })
        get().addLog({
          type: 'action', day: state.day, phase: 'sheriff-transfer',
          playerId: dying.id, playerName: dying.name,
          content: `🏛️ ${dying.name}(${dying.id}号) 撕毁了警徽！本局无警长。`,
        })
        get()._addEvent({
          day: state.day, category: 'sheriff', icon: '👑',
          title: `${dying.id}号 ${dying.name} 撕毁警徽`,
          detail: '本局无警长',
        })
        get().showToast('🏛️ 警徽被撕毁', 'info')
      }

      // 继续流程：判断来源
      // 这里需要根据上下文决定下一步：
      // 1. 如果 hunterPending 刚刚处理完（来自夜晚），返回白天公告
      // 2. 如果来自白天投票，进入下一夜
      // 简化：检查是否在猎人开枪流程中
      if (state.hunterPending !== null) {
        // 猎人开枪还没结束，回去继续
        set({ phase: 'hunter-shoot', processing: false })
        return
      }

      // 检查胜负
      if (checkAndFinishGame(state.day)) return

      // 若是夜晚死亡的警长 → 进入白天公告
      // 若是白天投票死亡的警长 → 进入下一夜
      const dyingDeath = get().players.find((p) => p.id === dyingSheriffId)
      if (dyingDeath?.deathCause === 'wolf-kill' || dyingDeath?.deathCause === 'witch-poison' || dyingDeath?.deathCause === 'guard-save-conflict') {
        // 夜间死亡
        if (state.day === 1 && state.config?.enableSheriff) {
          set({ phase: 'day-sheriff-announce', processing: false })
        } else {
          set({ phase: 'day-announce', processing: false })
        }
        await delay(500)
        get().proceedDayPhase()
      } else {
        // 白天死亡 → 进入下一夜
        get()._archiveSpeeches(`第${state.day}天·白天讨论`)
        set({
          phase: 'night-start', day: state.day + 1,
          speeches: [], votes: [], currentSpeaker: null, speakStartIdx: null, speakCount: 0,
          killedThisNight: [], processing: false, whiteWolfSkillAvailable: false,
        })
        await delay(500)
        get().proceedNightPhase()
      }
    },

    // ========== 猎人开枪 ==========
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
              ? { ...p, isAlive: false, deathCause: 'hunter-shot' as DeathCause, deathReason: '被猎人射杀', deathDay: state.day, hunted: true }
              : p,
          ),
        }))
        get().addLog({
          type: 'action', day: state.day, phase: 'hunter-shoot',
          playerId: hunter.id, playerName: hunter.name,
          content: `🏹 ${hunter.name} 开枪带走了 ${target?.name}！`,
        })
        get()._addEvent({
          day: state.day, category: 'skill', icon: '🏹',
          title: `${hunter.id}号 ${hunter.name} 猎人开枪`,
          detail: `带走 ${target?.id}号 ${target?.name}`,
        })
        get()._addEvent({
          day: state.day, category: 'death', icon: '💀',
          title: `${target?.id}号 ${target?.name} 被猎人射杀`,
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
      if (checkAndFinishGame(state.day)) return

      // 处理连锁：被猎人射杀的若是警长 → 警徽移交
      if (targetId !== null) {
        const shot = get().players.find((p) => p.id === targetId)
        if (shot && shot.id === get().sheriffId) {
          const chainResult = await handleDeathChain([targetId], false)
          if (chainResult === 'wait-user-sheriff') return
          if (chainResult === 'finish') return
          if (get().phase === 'sheriff-transfer') return
        }
      }

      // 猎人开枪后继续
      if (fromNight) {
        // 来自夜晚结算，进入白天（第一天先警长竞选）
        if (state.day === 1 && state.config?.enableSheriff) {
          set({ phase: 'day-sheriff-announce', processing: false, whiteWolfSkillAvailable: false })
        } else {
          set({ phase: 'day-announce', processing: false, whiteWolfSkillAvailable: false })
        }
        await delay(600)
        get().proceedDayPhase()
      } else {
        // 来自白天投票出局，进入下一夜
        get()._archiveSpeeches(`第${state.day}天·白天讨论`)
        set({
          phase: 'night-start', day: state.day + 1,
          speeches: [], votes: [], currentSpeaker: null, speakStartIdx: null, speakCount: 0,
          killedThisNight: [], processing: false, whiteWolfSkillAvailable: false,
        })
        await delay(600)
        get().proceedNightPhase()
      }
    },
  }
})
