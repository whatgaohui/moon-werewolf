import { GameConfig } from './types'

// 游戏套餐配置
export const GAME_CONFIGS: GameConfig[] = [
  {
    id: 'novice',
    name: '新手局',
    description: '6人快速对局，适合入门体验',
    playerCount: 6,
    roles: ['wolf', 'wolf', 'seer', 'witch', 'villager', 'villager'],
    difficulty: 'easy',
    badge: '推荐入门',
  },
  {
    id: 'standard',
    name: '标准局',
    description: '9人经典配置，狼人预言家女巫猎人',
    playerCount: 9,
    roles: ['wolf', 'wolf', 'wolf', 'seer', 'witch', 'hunter', 'villager', 'villager', 'villager'],
    difficulty: 'normal',
    badge: '经典',
  },
  {
    id: 'classic',
    name: '经典局',
    description: '12人完整配置，加入守卫守护',
    playerCount: 12,
    roles: [
      'wolf', 'wolf', 'wolf', 'wolf',
      'seer', 'witch', 'hunter', 'guard',
      'villager', 'villager', 'villager', 'villager',
    ],
    difficulty: 'hard',
    badge: '热门',
  },
  {
    id: 'advanced',
    name: '进阶局',
    description: '12人进阶配置，白狼王自爆玩法',
    playerCount: 12,
    roles: [
      'wolf', 'wolf', 'wolf', 'white-wolf',
      'seer', 'witch', 'hunter', 'guard',
      'villager', 'villager', 'villager', 'villager',
    ],
    difficulty: 'hard',
    badge: '挑战',
  },
]

export function getConfig(id: string): GameConfig | undefined {
  return GAME_CONFIGS.find((c) => c.id === id)
}

// 根据角色列表统计
export function countRoles(roles: string[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const r of roles) {
    counts[r] = (counts[r] || 0) + 1
  }
  return counts
}
