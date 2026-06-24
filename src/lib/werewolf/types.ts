// 狼人杀游戏核心类型定义 (v2.0 - 1vsAI 版)
// 依据《狼人杀手机 App 游戏规则与判定细则 v2.0》设计

// 角色阵营
export type Faction = 'wolf' | 'good'

// 角色ID
export type RoleId =
  | 'wolf'        // 普通狼人
  | 'white-wolf'  // 白狼王
  | 'seer'        // 预言家
  | 'witch'       // 女巫
  | 'hunter'      // 猎人
  | 'guard'       // 守卫
  | 'villager'    // 平民
// 注：v2.0 默认主板子为 12 人预女猎守白狼王局，不含骑士/白痴/狼美人等扩展角色

// 角色定义
export interface RoleDef {
  id: RoleId
  name: string         // 中文名
  emoji: string        // 表情图标
  faction: Faction
  category: 'wolf' | 'god' | 'villager'  // 分类（用于屠边判定）
  color: string        // 主题色 (tailwind gradient)
  description: string  // 能力描述
  nightAction: boolean // 夜晚是否有行动
  actionPrompt?: string // 行动提示文案
}

// AI 难度等级（v2.0 §9.2）
export type Difficulty = 'easy' | 'normal' | 'hard'

// 死因类型（v2.0 §6.2）
export type DeathCause =
  | 'wolf-kill'        // 被狼人刀
  | 'witch-poison'     // 被女巫毒
  | 'hunter-shot'      // 被猎人开枪
  | 'voted-out'        // 被投票放逐
  | 'white-wolf-bomb'  // 被白狼王自爆带走
  | 'guard-save-conflict' // 同守同救死亡
  | 'self-destruct'    // 白狼王自爆自身

// 玩家
export interface Player {
  id: number
  name: string
  avatar: string       // emoji 头像
  role: RoleId
  isAlive: boolean
  isUser: boolean
  // 死亡相关
  deathCause?: DeathCause  // 死因（决定能否开枪/有遗言）
  deathReason?: string     // 死亡原因文案
  deathDay?: number        // 死亡天数
  // 夜间状态标记（每次夜晚开始时重置）
  protected?: boolean   // 本夜被守卫守护
  saved?: boolean       // 本夜被女巫解药救
  poisoned?: boolean    // 本夜被女巫毒杀（用于猎人开枪判定）
  hunted?: boolean      // 被猎人射杀
  // AI 专属（v2.0 §10.2）
  aiConfig?: {
    difficulty: Difficulty
    trustScores: Record<number, number> // 对其他玩家的信任度 0-100
  }
}

// 游戏配置（套餐）
export interface GameConfig {
  id: string
  name: string
  description: string
  playerCount: number
  roles: RoleId[]      // 角色列表
  difficulty: Difficulty // AI 难度（v2.0 §5.2）
  ruleSet: 'tu-bian' | 'tu-cheng' // 胜利规则：屠边 / 屠城（默认屠边）
  enableSheriff: boolean // 是否开启警长
  witchFirstNightSelfSave: boolean // 女巫首夜可自救
  sameGuardSaveDeath: boolean // 同守同救死亡
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

// 游戏阶段（v2.0 §10.1 状态机）
export type GamePhase =
  | 'role-reveal'      // 发牌/身份确认
  | 'night-start'      // 入夜
  | 'night-guard'      // 守卫行动
  | 'night-wolf'       // 狼人行动
  | 'night-witch'      // 女巫行动
  | 'night-seer'       // 预言家行动
  | 'night-end'        // 夜间结算
  | 'day-sheriff-announce'  // 警长竞选公告（仅第一天）
  | 'day-sheriff-campaign'  // 警上发言
  | 'day-sheriff-vote'      // 警长投票
  | 'day-announce'     // 天亮公布死讯
  | 'day-lastwords'    // 遗言
  | 'day-discuss'      // 白天发言
  | 'day-self-destruct' // 白狼王自爆带人
  | 'day-vote'         // 放逐投票
  | 'day-result'       // 放逐结算
  | 'hunter-shoot'     // 猎人开枪
  | 'sheriff-transfer' // 警徽移交
  | 'game-over'        // 游戏结束

// 夜晚行动记录（v2.0 §6.2 核心字段）
export interface NightAction {
  day: number
  wolfTarget?: number         // 狼刀目标
  guardTarget?: number        // 守护目标
  witchSave?: boolean         // 女巫解药
  witchPoisonTarget?: number  // 女巫毒药目标
  seerTarget?: number         // 预言家查验目标
  seerResult?: 'wolf' | 'good'
  deaths: number[]            // 当晚死亡玩家
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
  speakStartIdx: number | null   // 本轮发言起始索引
  speakCount: number             // 本轮已发言人数
  winner: Faction | null
  winnerCause: string | null     // 胜负原因（屠民/屠神/屠狼）
  // 临时状态
  witchAntidoteUsed: boolean  // 女巫解药已用
  witchPoisonUsed: boolean    // 女巫毒药已用
  witchActionThisNight: 'save' | 'poison' | null // 本夜已用动作（v2.0 同晚单药）
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
  sheriffTransferPending: number | null // 待移交警徽的死亡警长id
  lastWordsPending: number[]         // 待发表遗言的玩家id队列
  _aiSheriffDecided: boolean         // 用户上警决定已收集
  _aiSheriffCollected: boolean       // AI上警决定已收集
  // 白狼王自爆相关
  whiteWolfSelfDestructPending: number | null // 待自爆的白狼王id
  // 弹窗/提示状态
  seerResultPending: { targetId: number; targetName: string; result: 'wolf' | 'good' } | null
  toast: { id: string; content: string; type: 'info' | 'success' | 'danger' } | null
  // 投票超时
  voteDeadline: number | null        // 投票截止时间戳（用户30秒未投票自动弃票）
}
