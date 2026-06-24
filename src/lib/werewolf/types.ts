// 狼人杀游戏核心类型定义

// 角色阵营
export type Faction = 'wolf' | 'good'

// 角色ID
export type RoleId =
  | 'wolf'        // 狼人
  | 'white-wolf'  // 白狼王
  | 'seer'        // 预言家
  | 'witch'       // 女巫
  | 'hunter'      // 猎人
  | 'guard'       // 守卫
  | 'knight'      // 骑士
  | 'villager'    // 平民

// 角色定义
export interface RoleDef {
  id: RoleId
  name: string         // 中文名
  emoji: string        // 表情图标
  faction: Faction
  category: 'wolf' | 'god' | 'villager'  // 分类
  color: string        // 主题色 (tailwind gradient)
  description: string  // 能力描述
  nightAction: boolean // 夜晚是否有行动
  actionPrompt?: string // 行动提示文案
}

// 玩家
export interface Player {
  id: number
  name: string
  avatar: string       // emoji 头像
  role: RoleId
  isAlive: boolean
  isUser: boolean
  // 状态标记
  poisoned?: boolean   // 被女巫毒杀
  protected?: boolean  // 被守卫守护
  saved?: boolean      // 被女巫救
  hunted?: boolean     // 被猎人射杀
  deathReason?: string // 死亡原因
  deathDay?: number    // 死亡天数
}

// 游戏配置（套餐）
export interface GameConfig {
  id: string
  name: string
  description: string
  playerCount: number
  roles: RoleId[]      // 角色列表
  difficulty: 'easy' | 'normal' | 'hard'
  badge?: string
}

// 日志条目
export interface LogEntry {
  id: string
  type: 'system' | 'night' | 'day' | 'speech' | 'vote' | 'death' | 'action' | 'result'
  day: number
  phase: string
  playerId?: number
  playerName?: string
  content: string
  timestamp: number
  secret?: boolean     // 是否仅特定角色可见
}

// 游戏阶段
export type GamePhase =
  | 'role-reveal'      // 角色展示
  | 'night-start'      // 黑夜开始
  | 'night-wolf'       // 狼人行动
  | 'night-seer'       // 预言家行动
  | 'night-witch'      // 女巫行动
  | 'night-guard'      // 守卫行动
  | 'night-end'        // 黑夜结束结算
  | 'day-sheriff-announce' // 警长竞选公告（仅第一天）
  | 'day-sheriff-campaign' // 警长竞选发言
  | 'day-sheriff-vote'     // 警长竞选投票
  | 'day-announce'     // 白天公布死讯（含遗言）
  | 'day-lastwords'    // 死亡遗言
  | 'day-discuss'      // 白天讨论
  | 'day-vote'         // 白天投票
  | 'day-result'       // 投票结果
  | 'hunter-shoot'     // 猎人开枪
  | 'game-over'        // 游戏结束

// 夜晚行动记录
export interface NightAction {
  day: number
  wolfTarget?: number       // 狼人刀目标
  seerTarget?: number       // 预言家查验目标
  seerResult?: 'wolf' | 'good' // 查验结果
  witchSave?: boolean       // 女巫是否使用解药
  witchPoisonTarget?: number // 女巫毒杀目标
  guardTarget?: number      // 守卫守护目标
  deaths: number[]          // 当晚死亡玩家
}

// 讨论发言
export interface Speech {
  playerId: number
  playerName: string
  content: string
  isUser: boolean
}

// 投票记录
export interface VoteRecord {
  voterId: number
  voterName: string
  targetId: number | null  // null = 弃票
  targetName: string | null
}

// 游戏状态
export interface WerewolfGameState {
  view: 'menu' | 'setup' | 'role-reveal' | 'game' | 'result'
  config: GameConfig | null
  players: Player[]
  userPlayerId: number
  phase: GamePhase
  day: number
  log: LogEntry[]
  nightAction: NightAction | null
  speeches: Speech[]
  votes: VoteRecord[]
  currentSpeaker: number | null  // 当前发言玩家id
  speakStartIdx: number | null   // 本轮发言起始索引（用于绕回判断）
  speakCount: number             // 本轮已发言人数
  winner: Faction | null
  // 临时状态
  witchAntidoteUsed: boolean  // 女巫解药已用
  witchPoisonUsed: boolean    // 女巫毒药已用
  lastGuardTarget: number | null // 守卫上一晚守护目标
  hunterPending: number | null // 待开枪的猎人id
  killedThisNight: number[]   // 本夜死亡(结算前)
  speaking: boolean           // AI正在发言中
  processing: boolean         // 引擎处理中
  // 警长相关
  sheriffId: number | null           // 当前警长id
  sheriffCandidates: number[]        // 上警玩家id列表
  sheriffVotes: VoteRecord[]         // 警长竞选投票
  sheriffCampaignIdx: number         // 警长竞选发言进度
  lastWordsPending: number[]         // 待发表遗言的玩家id队列
  _aiSheriffDecided: boolean         // AI上警决定已收集（内部）
  // 弹窗/提示状态
  seerResultPending: { targetId: number; targetName: string; result: 'wolf' | 'good' } | null // 待展示的查验结果
  toast: { id: string; content: string; type: 'info' | 'success' | 'danger' } | null // 临时提示
}
