import { RoleDef, RoleId } from './types'

// 角色定义表 (v2.0 §8 职业规则详解)
export const ROLES: Record<RoleId, RoleDef> = {
  wolf: {
    id: 'wolf',
    name: '普通狼人',
    emoji: '🐺',
    faction: 'wolf',
    category: 'wolf',
    color: 'from-red-500 to-rose-700',
    description: '每晚与同伴一起选择一名玩家击杀。白天可自爆终止白天流程并进入黑夜。',
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
    description: '拥有狼人能力。白天可主动自爆带走一名存活玩家，并立即进入黑夜（仅白天自爆有效）。',
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
    description: '每晚查验一名玩家阵营（好人/狼人），不返回具体职业。AI 预言家首日上警并报查验+警徽流。',
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
    description: '一瓶解药救狼刀目标，一瓶毒药毒人。首夜可自救。同一晚默认只能使用一瓶药。',
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
    description: '被狼刀或被投票放逐死亡时可开枪带走一人。被女巫毒杀、被白狼王自爆带走等方式死亡时不能开枪。',
    nightAction: false,
  },
  guard: {
    id: 'guard',
    name: '守卫',
    emoji: '🛡️',
    faction: 'good',
    category: 'god',
    color: 'from-sky-500 to-blue-700',
    description: '每晚守护一人免于狼刀，可守自己可空守，不能连续两晚守同一人。同守同救=死亡。',
    nightAction: true,
    actionPrompt: '请选择今晚要守护的玩家',
  },
  villager: {
    id: 'villager',
    name: '平民',
    emoji: '👨‍🌾',
    faction: 'good',
    category: 'villager',
    color: 'from-slate-400 to-slate-600',
    description: '无技能，通过发言和投票找狼。AI 平民不主动穿神衣服（除非高级局挡刀）。',
    nightAction: false,
  },
}

// 夜晚行动顺序 (v2.0 §6.1)：狼人 → 守卫 → 女巫 → 预言家
export const NIGHT_ACTION_ORDER: RoleId[] = ['wolf', 'guard', 'witch', 'seer']

// 好人神职列表（用于屠神判定）
export const GOD_ROLES: RoleId[] = ['seer', 'witch', 'hunter', 'guard']

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
