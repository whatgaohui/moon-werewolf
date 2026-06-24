// 游戏战绩统计 - localStorage 持久化

export interface GameStats {
  totalGames: number
  wins: number
  losses: number
  // 按角色统计
  roleCount: Record<string, number>  // 角色出场次数
  roleWins: Record<string, number>   // 角色胜利次数
  // 按套餐统计
  configCount: Record<string, number>
  // 存活统计
  survivedCount: number  // 存活到结尾的局数
  // 最近记录
  recent: GameRecord[]
}

export interface GameRecord {
  id: string
  date: number
  configId: string
  configName: string
  playerCount: number
  role: string
  roleName: string
  won: boolean
  survived: boolean
  day: number  // 游戏持续天数
}

const STORAGE_KEY = 'werewolf-stats'
const MAX_RECENT = 20

export function loadStats(): GameStats {
  if (typeof window === 'undefined') {
    return emptyStats()
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyStats()
    const parsed = JSON.parse(raw)
    return { ...emptyStats(), ...parsed }
  } catch {
    return emptyStats()
  }
}

export function emptyStats(): GameStats {
  return {
    totalGames: 0,
    wins: 0,
    losses: 0,
    roleCount: {},
    roleWins: {},
    configCount: {},
    survivedCount: 0,
    recent: [],
  }
}

export function saveStats(stats: GameStats) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stats))
  } catch (e) {
    console.warn('Failed to save stats', e)
  }
}

export function recordGame(record: Omit<GameRecord, 'id' | 'date'>): GameStats {
  const stats = loadStats()
  const full: GameRecord = {
    ...record,
    id: Math.random().toString(36).slice(2, 10),
    date: Date.now(),
  }
  stats.totalGames++
  if (full.won) stats.wins++
  else stats.losses++
  stats.roleCount[full.role] = (stats.roleCount[full.role] || 0) + 1
  if (full.won) {
    stats.roleWins[full.role] = (stats.roleWins[full.role] || 0) + 1
  }
  stats.configCount[full.configId] = (stats.configCount[full.configId] || 0) + 1
  if (full.survived) stats.survivedCount++
  stats.recent.unshift(full)
  if (stats.recent.length > MAX_RECENT) {
    stats.recent = stats.recent.slice(0, MAX_RECENT)
  }
  saveStats(stats)
  return stats
}

export function clearStats() {
  if (typeof window === 'undefined') return
  localStorage.removeItem(STORAGE_KEY)
}

export function getWinRate(stats: GameStats): number {
  if (stats.totalGames === 0) return 0
  return Math.round((stats.wins / stats.totalGames) * 100)
}

export function getRoleWinRate(stats: GameStats, role: string): number {
  const count = stats.roleCount[role] || 0
  const wins = stats.roleWins[role] || 0
  if (count === 0) return 0
  return Math.round((wins / count) * 100)
}
