import { Player, GameConfig, Faction, NightAction, RoleId } from './types'
import { ROLES, isWolf, AI_NAMES, AI_AVATARS } from './roles'

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
    // 完全随机：洗牌角色，用户拿任意一个
    roles = shuffle(config.roles)
  } else if (preferredRole === 'wolf') {
    // 偏好狼人阵营：把狼人角色优先放到用户位置
    const wolfRoles = config.roles.filter((r) => isWolf(r as RoleId))
    const otherRoles = config.roles.filter((r) => !isWolf(r as RoleId))
    // 随机选一个狼人角色给用户
    const userWolf = shuffle(wolfRoles)[0]
    const remainingWolves = wolfRoles.filter((_, i) => i !== wolfRoles.indexOf(userWolf))
    // 重新组合并洗牌剩余位置
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
    // 偏好好人阵营
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
    // 指定具体角色（如 'seer'）
    const targetRole = preferredRole as RoleId
    const hasRole = config.roles.includes(targetRole)
    if (hasRole) {
      const sameRoles = config.roles.filter((r) => r === targetRole)
      const otherRoles = config.roles.filter((r) => r !== targetRole)
      // 取一个目标角色给用户
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
      // 该配置没有此角色，回退随机
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
  }))
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

// 胜负判定
export function checkWinner(players: Player[]): Faction | null {
  const wolves = aliveWolves(players)
  const goods = players.filter((p) => p.isAlive && ROLES[p.role].faction === 'good')
  if (wolves.length === 0) return 'good'
  if (wolves.length >= goods.length) return 'wolf'
  return null
}

// 结算夜晚行动
export function resolveNight(
  players: Player[],
  action: NightAction,
  lastGuardTarget: number | null,
): { deaths: number[]; players: Player[]; newLastGuard: number | null } {
  const updated = players.map((p) => ({ ...p, protected: false, saved: false, poisoned: false }))
  const deaths = new Set<number>()

  // 守卫守护
  if (action.guardTarget !== undefined) {
    const g = updated.find((p) => p.id === action.guardTarget)
    if (g && g.isAlive) g.protected = true
  }

  // 狼人击杀
  if (action.wolfTarget !== undefined) {
    const t = updated.find((p) => p.id === action.wolfTarget)
    if (t && t.isAlive) {
      // 同守同救 = 死亡 (空刀情况)
      const savedByWitch = action.witchSave === true
      if (t.protected && savedByWitch) {
        // 同守同救，死亡
        deaths.add(t.id)
        t.deathReason = '被狼人杀害（同守同救）'
      } else if (t.protected || savedByWitch) {
        // 被守护或被救，存活
      } else {
        deaths.add(t.id)
        t.deathReason = '被狼人杀害'
      }
    }
  }

  // 女巫毒杀
  if (action.witchPoisonTarget !== undefined) {
    const t = updated.find((p) => p.id === action.witchPoisonTarget)
    if (t && t.isAlive) {
      deaths.add(t.id)
      t.poisoned = true
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
): { winnerId: number | null; tie: boolean; counts: Record<number, number> } {
  const counts: Record<number, number> = {}
  for (const v of votes) {
    if (v.targetId !== null) {
      counts[v.targetId] = (counts[v.targetId] || 0) + 1
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
