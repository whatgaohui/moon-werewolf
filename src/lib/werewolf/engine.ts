import { Player, GameConfig, Faction, NightAction, RoleId, DeathCause } from './types'
import { ROLES, isWolf, GOD_ROLES, AI_NAMES, AI_AVATARS } from './roles'

// 洗牌
export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// 初始化游戏：分配角色，玩家为用户
// preferredRole: 用户偏好角色 - 'random' 随机, 'wolf' 狼人阵营, 'good' 好人阵营, 或具体角色id
export function initPlayers(config: GameConfig, preferredRole: string = 'random'): Player[] {
  const namePool = shuffle(AI_NAMES).slice(0, config.playerCount)
  const avatarPool = shuffle(AI_AVATARS).slice(0, config.playerCount)
  const userIndex = Math.floor(Math.random() * config.playerCount)

  let roles = config.roles

  if (preferredRole === 'random') {
    roles = shuffle(config.roles)
  } else if (preferredRole === 'wolf') {
    const wolfRoles = config.roles.filter((r) => isWolf(r as RoleId))
    const otherRoles = config.roles.filter((r) => !isWolf(r as RoleId))
    const userWolf = shuffle(wolfRoles)[0]
    const remainingWolves = wolfRoles.filter((_, i) => i !== wolfRoles.indexOf(userWolf))
    const remaining = shuffle([...remainingWolves, ...otherRoles])
    roles = []
    for (let i = 0; i < config.playerCount; i++) {
      if (i === userIndex) {
        roles.push(userWolf)
      } else {
        roles.push(remaining.shift() as RoleId)
      }
    }
  } else if (preferredRole === 'good') {
    const goodRoles = config.roles.filter((r) => !isWolf(r as RoleId))
    const wolfRoles = config.roles.filter((r) => isWolf(r as RoleId))
    const userGood = shuffle(goodRoles)[0]
    const remainingGoods = goodRoles.filter((_, i) => i !== goodRoles.indexOf(userGood))
    const remaining = shuffle([...remainingGoods, ...wolfRoles])
    roles = []
    for (let i = 0; i < config.playerCount; i++) {
      if (i === userIndex) {
        roles.push(userGood)
      } else {
        roles.push(remaining.shift() as RoleId)
      }
    }
  } else {
    const targetRole = preferredRole as RoleId
    const hasRole = config.roles.includes(targetRole)
    if (hasRole) {
      const sameRoles = config.roles.filter((r) => r === targetRole)
      const otherRoles = config.roles.filter((r) => r !== targetRole)
      const remaining = shuffle([...sameRoles.slice(1), ...otherRoles])
      roles = []
      for (let i = 0; i < config.playerCount; i++) {
        if (i === userIndex) {
          roles.push(targetRole)
        } else {
          roles.push(remaining.shift() as RoleId)
        }
      }
    } else {
      roles = shuffle(config.roles)
    }
  }

  const players: Player[] = roles.map((role, i) => ({
    id: i,
    name: i === userIndex ? '你' : namePool[i],
    avatar: i === userIndex ? '🙂' : avatarPool[i],
    role: role as RoleId,
    isAlive: true,
    isUser: i === userIndex,
    // 初始化 AI 配置：信任度全员 50（v2.0 §9.1）
    aiConfig: i === userIndex ? undefined : {
      difficulty: config.difficulty,
      trustScores: {},
    },
  }))

  // 初始化 AI 信任度（对其他玩家默认 50）
  for (const p of players) {
    if (p.aiConfig) {
      for (const other of players) {
        if (other.id !== p.id) {
          p.aiConfig.trustScores[other.id] = 50
        }
      }
    }
  }

  return players
}

// 获取存活玩家
export function alivePlayers(players: Player[]): Player[] {
  return players.filter((p) => p.isAlive)
}

// 获取某阵营存活玩家
export function aliveByFaction(players: Player[], faction: Faction): Player[] {
  return players.filter((p) => p.isAlive && ROLES[p.role].faction === faction)
}

// 获取某角色存活玩家
export function aliveByRole(players: Player[], role: RoleId): Player[] {
  return players.filter((p) => p.isAlive && p.role === role)
}

// 获取狼人存活玩家
export function aliveWolves(players: Player[]): Player[] {
  return players.filter((p) => p.isAlive && isWolf(p.role))
}

// 获取存活平民
export function aliveVillagers(players: Player[]): Player[] {
  return players.filter((p) => p.isAlive && p.role === 'villager')
}

// 获取存活神职
export function aliveGods(players: Player[]): Player[] {
  return players.filter((p) => p.isAlive && GOD_ROLES.includes(p.role))
}

// 胜负判定 (v2.0 §3.3 - 屠边规则)
// 返回 { faction, cause } 或 null
export function checkWinner(
  players: Player[],
  ruleSet: 'tu-bian' | 'tu-cheng' = 'tu-bian',
): { faction: Faction; cause: string } | null {
  const wolves = aliveWolves(players)
  const villagers = aliveVillagers(players)
  const gods = aliveGods(players)

  // 1. 狼人全死 → 好人胜
  if (wolves.length === 0) {
    return { faction: 'good', cause: '屠狼成功：所有狼人已死亡' }
  }

  // 2. 屠边：平民全死 OR 神职全死 → 狼人胜
  if (ruleSet === 'tu-bian') {
    if (villagers.length === 0) {
      return { faction: 'wolf', cause: '屠民成功：所有平民已死亡' }
    }
    if (gods.length === 0) {
      return { faction: 'wolf', cause: '屠神成功：所有神职已死亡' }
    }
  } else {
    // 屠城：好人全死 → 狼人胜
    if (villagers.length === 0 && gods.length === 0) {
      return { faction: 'wolf', cause: '屠城成功：所有好人已死亡' }
    }
  }

  return null
}

// 猎人能否开枪 (v2.0 §8.5)
// 被狼刀/被投票放逐 → 可开枪
// 被女巫毒/被白狼王自爆带走 → 不能开枪
export function canHunterShoot(player: Player): boolean {
  if (player.role !== 'hunter') return false
  if (player.isAlive) return false
  if (player.deathCause === 'witch-poison') return false
  if (player.deathCause === 'white-wolf-bomb') return false
  if (player.deathCause === 'hunter-shot') return false // 二级死亡不再触发
  return true
}

// 玩家是否有遗言权 (v2.0 §7.1)
// 第一晚死亡 → 有遗言
// 白天被放逐 → 有遗言
// 被毒/被枪击 → 无遗言
// 后续夜晚死亡 → 无遗言
export function hasLastWords(player: Player, day: number, isNightDeath: boolean): boolean {
  if (!player.deathCause) return false
  if (player.deathCause === 'witch-poison') return false
  if (player.deathCause === 'hunter-shot') return false
  if (player.deathCause === 'white-wolf-bomb') return false
  if (player.deathCause === 'self-destruct') return false // 白狼王自爆无遗言
  if (isNightDeath) {
    // 夜间死亡：仅第一夜有遗言
    return day === 1
  }
  // 白天被放逐 → 有遗言
  return player.deathCause === 'voted-out'
}

// 结算夜晚行动 (v2.0 §6.2 严格按效果计算)
// 行动顺序：狼刀 → 守卫 → 女巫救/毒 → 预言家查验（无死亡效果）
// 同守同救 = 死亡
export function resolveNight(
  players: Player[],
  action: NightAction,
  lastGuardTarget: number | null,
  sameGuardSaveDeath: boolean = true,
): { deaths: number[]; players: Player[]; newLastGuard: number | null } {
  const updated = players.map((p) => ({
    ...p,
    protected: false,
    saved: false,
    poisoned: false,
  }))
  const deaths = new Set<number>()

  // 1. 守卫守护
  if (action.guardTarget !== undefined && action.guardTarget !== null) {
    const g = updated.find((p) => p.id === action.guardTarget)
    if (g && g.isAlive) g.protected = true
  }

  // 2. 狼人击杀
  if (action.wolfTarget !== undefined && action.wolfTarget !== null) {
    const t = updated.find((p) => p.id === action.wolfTarget)
    if (t && t.isAlive) {
      const savedByWitch = action.witchSave === true
      // 同守同救 = 死亡
      if (t.protected && savedByWitch && sameGuardSaveDeath) {
        deaths.add(t.id)
        t.deathCause = 'guard-save-conflict'
        t.deathReason = '同守同救死亡'
      } else if (t.protected || savedByWitch) {
        // 被守护或被救，存活
      } else {
        deaths.add(t.id)
        t.deathCause = 'wolf-kill'
        t.deathReason = '被狼人杀害'
      }
    }
  }

  // 3. 女巫毒杀
  if (action.witchPoisonTarget !== undefined && action.witchPoisonTarget !== null) {
    const t = updated.find((p) => p.id === action.witchPoisonTarget)
    if (t && t.isAlive) {
      deaths.add(t.id)
      t.poisoned = true
      t.deathCause = 'witch-poison'
      t.deathReason = '被女巫毒杀'
    }
  }

  // 标记死亡
  for (const id of deaths) {
    const p = updated.find((pp) => pp.id === id)
    if (p) {
      p.isAlive = false
    }
  }

  return {
    deaths: Array.from(deaths),
    players: updated,
    newLastGuard: action.guardTarget ?? lastGuardTarget,
  }
}

// 统计投票
export function tallyVotes(
  votes: { voterId: number; targetId: number | null }[],
  sheriffId: number | null = null,
): { winnerId: number | null; tie: boolean; counts: Record<number, number> } {
  const counts: Record<number, number> = {}
  for (const v of votes) {
    if (v.targetId !== null) {
      // 警长票计 1.5 票 (v2.0 §7.4)
      const weight = v.voterId === sheriffId ? 1.5 : 1
      counts[v.targetId] = (counts[v.targetId] || 0) + weight
    }
  }
  const entries = Object.entries(counts).map(([id, c]) => ({ id: Number(id), count: c }))
  if (entries.length === 0) return { winnerId: null, tie: false, counts }
  entries.sort((a, b) => b.count - a.count)
  if (entries.length > 1 && entries[0].count === entries[1].count) {
    return { winnerId: null, tie: true, counts }
  }
  return { winnerId: entries[0].id, tie: false, counts }
}

// 生成日志id
export function logId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

// 随机选择 (用于AI简单决策回退)
export function randomPick<T>(arr: T[]): T | undefined {
  if (arr.length === 0) return undefined
  return arr[Math.floor(Math.random() * arr.length)]
}

// ============ AI 视角隔离的工具函数 (v2.0 §1.1.2) ============

// 构建给 AI 的"公开信息"玩家视图：只包含公开可见的字段，绝不含 role
export interface PublicPlayerInfo {
  id: number
  name: string
  avatar: string
  alive: boolean
  isUser: boolean
  deathDay?: number
  deathReason?: string // 公开的死因文案（如"被狼人杀害"）
  isSheriff?: boolean
}

export function buildPublicPlayerInfo(
  players: Player[],
  sheriffId: number | null,
  hideRoles: boolean = true,
): PublicPlayerInfo[] {
  return players.map((p) => ({
    id: p.id,
    name: p.name,
    avatar: p.avatar,
    alive: p.isAlive,
    isUser: p.isUser,
    deathDay: p.deathDay,
    deathReason: p.deathReason,
    isSheriff: p.id === sheriffId,
    // 注意：role 字段绝对不暴露给 AI（v2.0 §1.1.2 视角隔离）
  }))
}

// 构建狼人 AI 的可见信息：公开信息 + 自己的狼人同伴
export function buildWolfView(
  players: Player[],
  viewerId: number,
  sheriffId: number | null,
): { teammates: PublicPlayerInfo[]; publicInfo: PublicPlayerInfo[] } {
  const publicInfo = buildPublicPlayerInfo(players, sheriffId)
  const me = players.find((p) => p.id === viewerId)
  const teammates: PublicPlayerInfo[] = []
  if (me && isWolf(me.role)) {
    for (const p of players) {
      if (p.id !== viewerId && isWolf(p.role)) {
        teammates.push({
          id: p.id,
          name: p.name,
          avatar: p.avatar,
          alive: p.isAlive,
          isUser: p.isUser,
          deathDay: p.deathDay,
          deathReason: p.deathReason,
          isSheriff: p.id === sheriffId,
        })
      }
    }
  }
  return { teammates, publicInfo }
}
