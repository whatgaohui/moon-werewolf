import { GameConfig } from './types'

// 游戏套餐配置 (v2.0)
// 默认主板子：12 人预女猎守白狼王局 (4 平民 + 4 神职 + 3 普通狼 + 1 白狼王)
// 所有配置默认采用：屠边规则 / 开启警长 / 女巫首夜可自救 / 同守同救死亡

export const GAME_CONFIGS: GameConfig[] = [
  {
    id: 'novice',
    name: '新手局',
    description: '6人快速对局，2狼+预言家+女巫+2民，适合入门体验',
    playerCount: 6,
    roles: ['wolf', 'wolf', 'seer', 'witch', 'villager', 'villager'],
    difficulty: 'easy',
    ruleSet: 'tu-bian',
    enableSheriff: true,
    witchFirstNightSelfSave: true,
    sameGuardSaveDeath: true,
    badge: '推荐入门',
  },
  {
    id: 'standard',
    name: '标准局',
    description: '9人经典配置，3狼+预言家+女巫+猎人+3民',
    playerCount: 9,
    roles: ['wolf', 'wolf', 'wolf', 'seer', 'witch', 'hunter', 'villager', 'villager', 'villager'],
    difficulty: 'normal',
    ruleSet: 'tu-bian',
    enableSheriff: true,
    witchFirstNightSelfSave: true,
    sameGuardSaveDeath: true,
    badge: '经典',
  },
  {
    id: 'classic',
    name: '经典守卫局',
    description: '12人完整配置，4狼+预言家+女巫+猎人+守卫+4民',
    playerCount: 12,
    roles: [
      'wolf', 'wolf', 'wolf', 'wolf',
      'seer', 'witch', 'hunter', 'guard',
      'villager', 'villager', 'villager', 'villager',
    ],
    difficulty: 'normal',
    ruleSet: 'tu-bian',
    enableSheriff: true,
    witchFirstNightSelfSave: true,
    sameGuardSaveDeath: true,
    badge: '热门',
  },
  {
    id: 'advanced',
    name: '预女猎守白狼王',
    description: 'v2.0 默认主板子：3普狼+白狼王+预女猎守+4民（屠边规则）',
    playerCount: 12,
    roles: [
      'wolf', 'wolf', 'wolf', 'white-wolf',
      'seer', 'witch', 'hunter', 'guard',
      'villager', 'villager', 'villager', 'villager',
    ],
    difficulty: 'hard',
    ruleSet: 'tu-bian',
    enableSheriff: true,
    witchFirstNightSelfSave: true,
    sameGuardSaveDeath: true,
    badge: 'v2.0 主板子',
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
