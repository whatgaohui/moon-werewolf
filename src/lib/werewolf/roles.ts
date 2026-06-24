import { RoleDef, RoleId } from './types'

// 角色定义表
export const ROLES: Record<RoleId, RoleDef> = {
  wolf: {
    id: 'wolf',
    name: '狼人',
    emoji: '🐺',
    faction: 'wolf',
    category: 'wolf',
    color: 'from-red-500 to-rose-700',
    description: '每晚与同伴一起选择一名玩家击杀。白天伪装成好人，误导投票。',
    nightAction: true,
    actionPrompt: '请选择今晚要击杀的玩家',
  },
  'white-wolf': {
    id: 'white-wolf',
    name: '白狼王',
    emoji: '👑',
    faction: 'wolf',
    category: 'wolf',
    color: 'from-rose-600 to-red-900',
    description: '拥有狼人能力。白天可自爆带走一名玩家，并立即进入黑夜。',
    nightAction: true,
    actionPrompt: '请选择今晚要击杀的玩家',
  },
  seer: {
    id: 'seer',
    name: '预言家',
    emoji: '🔮',
    faction: 'good',
    category: 'god',
    color: 'from-violet-500 to-purple-700',
    description: '每晚可查验一名玩家的身份，得知其是好人还是狼人。',
    nightAction: true,
    actionPrompt: '请选择今晚要查验的玩家',
  },
  witch: {
    id: 'witch',
    name: '女巫',
    emoji: '🧪',
    faction: 'good',
    category: 'god',
    color: 'from-emerald-500 to-teal-700',
    description: '拥有一瓶解药和一瓶毒药。解药可救活当晚被杀者，毒药可毒杀一名玩家。',
    nightAction: true,
    actionPrompt: '是否使用药剂？',
  },
  hunter: {
    id: 'hunter',
    name: '猎人',
    emoji: '🏹',
    faction: 'good',
    category: 'god',
    color: 'from-amber-500 to-orange-700',
    description: '被狼人杀死或被投票出局时，可开枪带走一名玩家。被女巫毒杀则无法开枪。',
    nightAction: false,
  },
  guard: {
    id: 'guard',
    name: '守卫',
    emoji: '🛡️',
    faction: 'good',
    category: 'god',
    color: 'from-sky-500 to-blue-700',
    description: '每晚守护一名玩家，使其免受狼人袭击。不能连续两晚守护同一人。',
    nightAction: true,
    actionPrompt: '请选择今晚要守护的玩家',
  },
  knight: {
    id: 'knight',
    name: '骑士',
    emoji: '⚔️',
    faction: 'good',
    category: 'god',
    color: 'from-cyan-500 to-sky-700',
    description: '白天可随时亮明身份挑战一名玩家。若对方是狼人则其死亡，否则骑士殉职。',
    nightAction: false,
  },
  villager: {
    id: 'villager',
    name: '平民',
    emoji: '👨‍🌾',
    faction: 'good',
    category: 'villager',
    color: 'from-slate-400 to-slate-600',
    description: '没有特殊能力。依靠白天的观察和投票找出狼人。',
    nightAction: false,
  },
}

// 角色顺序（夜晚行动顺序）
export const NIGHT_ACTION_ORDER: RoleId[] = ['guard', 'wolf', 'seer', 'witch']

// 好人神职列表
export const GOD_ROLES: RoleId[] = ['seer', 'witch', 'hunter', 'guard', 'knight']

// AI 玩家昵称池
export const AI_NAMES = [
  '星辰', '月影', '清风', '晓月', '寒霜', '流云', '青松', '墨白',
  '苏沐', '叶舟', '林溪', '南风', '北辰', '安歌', '折桂', '听雪',
  '观潮', '望舒', '惊鸿', '照夜', '司南', '怀瑾', '揽月', '逐光',
]

// AI 玩家头像 emoji 池
export const AI_AVATARS = [
  '🦊', '🐰', '🐯', '🦁', '🐻', '🐼', '🐨', '🦝',
  '🐹', '🦔', '🐧', '🦉', '🦢', '🐲', '🦄', '🐙',
]

export function getRole(id: RoleId): RoleDef {
  return ROLES[id]
}

export function isWolf(role: RoleId): boolean {
  return role === 'wolf' || role === 'white-wolf'
}
