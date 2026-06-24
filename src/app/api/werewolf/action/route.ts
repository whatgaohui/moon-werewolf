import { NextRequest, NextResponse } from 'next/server'
import ZAI from 'z-ai-web-dev-sdk'

// ========== v2.0 AI 视角隔离设计 (§1.1.2) ==========
// AI 决策输入严禁包含其他玩家的 role 字段
// 仅暴露：自身 role + 公开信息 + 角色专属信息

interface PublicPlayerInfo {
  id: number
  name: string
  avatar: string
  alive: boolean
  isUser: boolean
  deathDay?: number
  deathReason?: string
  isSheriff?: boolean
}

interface AIVisibleInfo {
  myRole: string
  myId: number
  publicInfo: PublicPlayerInfo[]
  wolfTeammates?: number[]
  seerHistory?: { day: number; targetId: number; targetName: string; result: 'wolf' | 'good' }[]
  witchWolfTarget?: number
  difficulty: 'easy' | 'normal' | 'hard'
}

interface RequestBody {
  action:
    | 'night-wolf' | 'night-seer' | 'night-witch' | 'night-guard'
    | 'day-speak' | 'day-vote' | 'hunter-shoot'
    | 'sheriff-campaign' | 'sheriff-vote' | 'last-words'
    | 'white-wolf-self-destruct' | 'sheriff-transfer'
  playerId: number
  aiVisibleInfo: AIVisibleInfo
  day: number
  speeches?: { playerId: number; playerName: string; content: string; isUser: boolean }[]
  votes?: { voterId: number; voterName: string; targetId: number | null; targetName: string | null }[]
  killedThisNight?: number[]
  lastGuardTarget?: number | null
  canSave?: boolean
  canPoison?: boolean
  candidates?: number[]
}

const ROLE_NAMES: Record<string, string> = {
  wolf: '普通狼人',
  'white-wolf': '白狼王',
  seer: '预言家',
  witch: '女巫',
  hunter: '猎人',
  guard: '守卫',
  villager: '平民',
}

function isWolfRole(role: string) {
  return role === 'wolf' || role === 'white-wolf'
}

function aliveList(info: PublicPlayerInfo[]): string {
  return info
    .filter((p) => p.alive)
    .map((p) => `${p.id}号(${p.name})${p.isSheriff ? '👮' : ''}`)
    .join('、')
}

function deadList(info: PublicPlayerInfo[]): string {
  return info
    .filter((p) => !p.alive)
    .map((p) => `${p.id}号(${p.name})${p.deathReason ? `[${p.deathReason}]` : ''}`)
    .join('、')
}

// 难度提示词 (v2.0 §9.2)
function difficultyHint(difficulty: string, myRole: string): string {
  if (difficulty === 'easy') {
    return `【简单难度】你的决策可以简单直接：狼人优先刀神职，女巫首夜盲救，好人易轻信首个跳预言家的玩家，投票跟随多数。`
  }
  if (difficulty === 'normal') {
    return `【普通难度】你具备基础逻辑：能识别真假预言家对跳，分析警徽流。狼人懂得分配角色（1人悍跳，2人冲锋/倒钩）。女巫解药必救预言家（若被刀），毒药留给被查杀的狼人。守卫懂得守预言家。投票会根据预言家的金水/查杀归票。`
  }
  // hard
  if (isWolfRole(myRole)) {
    return `【困难难度】你是深水狼/倒钩狼：会刻意站边真预言家降低怀疑；懂得制造平安夜骗女巫解药；白狼王自爆时机精准（带走明女巫或守卫）。临票改票、分票战术。`
  }
  return `【困难难度】你具备多轮记忆与心理博弈：通过票型反推狼坑，平民会主动穿衣服挡刀，猎人隐藏身份直到被推或被刀，守卫计算狼人刀法进行盲守。能盘"狼坑位"、"投票收益"、"轮次得失"。`
}

// 构建系统提示词（严格遵守视角隔离）
function buildSystemPrompt(action: string, body: RequestBody): string {
  const info = body.aiVisibleInfo
  const myRole = info.myRole
  const myRoleName = ROLE_NAMES[myRole] || '平民'
  const me = info.publicInfo.find((p) => p.id === info.myId)
  const difficulty = info.difficulty

  const base = `你正在参与一局狼人杀游戏（v2.0 1vsAI 规则），扮演 ${info.myId}号玩家(${me?.name})，你的身份是【${myRoleName}】。
当前是第${body.day}天。
存活玩家：${aliveList(info.publicInfo)}
死亡玩家：${deadList(info.publicInfo) || '无'}
${difficultyHint(difficulty, myRole)}`

  if (action === 'night-wolf') {
    const teammates = info.wolfTeammates || []
    const targets = info.publicInfo.filter((p) => p.alive && !teammates.includes(p.id) && p.id !== info.myId)
    return `${base}

${teammates.length > 0 ? `你的狼人同伴：${teammates.map((id) => `${id}号(${info.publicInfo.find((p) => p.id === id)?.name})`).join('、')}` : '你是唯一的狼人'}
可击杀的目标：${targets.map((t) => `${t.id}号(${t.name})`).join('、')}

作为狼人，策略性选择击杀目标（v2.0 §9.3）：
- 简单：随机刀或只找神职
- 普通：优先刀明预言家、盲救的女巫、强势平民
- 困难：制造平安夜骗女巫解药，刀法博弈

请只返回一个JSON：{"targetId": 数字}，targetId为要击杀的玩家id。`
  }

  if (action === 'night-seer') {
    const targets = info.publicInfo.filter((p) => p.alive && p.id !== info.myId)
    const historyText = info.seerHistory && info.seerHistory.length > 0
      ? `\n你之前的查验历史：\n${info.seerHistory.map((h) => `第${h.day}夜查验${h.targetId}号(${h.targetName}) = ${h.result === 'wolf' ? '狼人' : '好人'}`).join('\n')}`
      : '\n（你尚未查验过任何人）'
    return `${base}${historyText}

你是预言家，需选择一名玩家查验其阵营（好人/狼人，不返回具体职业）。
可查验目标：${targets.map((t) => `${t.id}号(${t.name})`).join('、')}

策略（v2.0 §8.3 + §9.3）：优先查验警上对跳位、警下怀疑位、沉水位。AI 预言家首日上警并报查验+警徽流，不会撒谎。
请只返回一个JSON：{"targetId": 数字}，targetId为要查验的玩家id。`
  }

  if (action === 'night-witch') {
    const wolfTarget = info.witchWolfTarget
    const wtPlayer = wolfTarget !== undefined ? info.publicInfo.find((p) => p.id === wolfTarget) : null
    return `${base}

你是女巫。今晚被狼人攻击的是：${wtPlayer ? `${wolfTarget}号(${wtPlayer.name})` : '无人'}
${body.canSave ? '✅ 解药可用' : '❌ 解药已用'}
${body.canPoison ? '✅ 毒药可用' : '❌ 毒药已用'}

【v2.0 规则】同一晚默认只能使用一瓶药！首夜被刀可自救（若开启）。

策略（v2.0 §8.4 + §9.3）：
- 简单：首夜盲救
- 普通：解药必救预言家（若被刀），毒药留给被查杀的狼人或悍跳狼
- 困难：评估目标极大概率是狼才毒，不会盲目毒人

可毒杀目标：${info.publicInfo.filter((p) => p.alive && p.id !== info.myId).map((t) => `${t.id}号(${t.name})`).join('、')}

请只返回一个JSON：{"save": true/false, "poisonTarget": 数字或null}
- save 和 poisonTarget 二选一（同晚单药规则）
- poisonTarget 不用则填null`
  }

  if (action === 'night-guard') {
    const targets = info.publicInfo.filter((p) => p.alive && p.id !== body.lastGuardTarget)
    return `${base}

你是守卫。上晚你守护了：${body.lastGuardTarget !== null && body.lastGuardTarget !== undefined ? `${body.lastGuardTarget}号` : '无人（首夜）'}
【v2.0 规则】不能连续两晚守同一人！同守同救=死亡。

可守护目标：${targets.map((t) => `${t.id}号(${t.name})`).join('、')}

策略（v2.0 §8.6 + §9.3）：
- 简单：随机守或守自己
- 普通：守明预言家、女巫，避开同守同救
- 困难：计算狼人刀法进行盲守

请只返回一个JSON：{"targetId": 数字}，targetId为要守护的玩家id。`
  }

  if (action === 'day-speak') {
    const speeches = body.speeches || []
    const speechText = speeches.length > 0
      ? speeches.map((s) => `${s.playerId}号(${s.playerName})：${s.content}`).join('\n')
      : '（尚无发言）'
    const killed = body.killedThisNight || []

    let roleHint = ''
    if (isWolfRole(myRole)) {
      roleHint = `你是狼人，需要伪装成好人发言。可：跳预言家/女巫等神职（悍跳）、带节奏怀疑好人、保护狼同伴、混淆视听。但不要太明显。
${info.wolfTeammates && info.wolfTeammates.length > 0 ? `你的狼同伴是：${info.wolfTeammates.map((id) => `${id}号`).join('、')}` : ''}`
    } else if (myRole === 'seer') {
      const histText = info.seerHistory && info.seerHistory.length > 0
        ? `你之前的查验历史：\n${info.seerHistory.map((h) => `第${h.day}夜查验${h.targetId}号(${h.targetName}) = ${h.result === 'wolf' ? '狼人' : '好人'}`).join('\n')}`
        : '（你尚未查验过任何人）'
      roleHint = `你是预言家，应该跳出来说明身份并报查验结果。${histText}`
    } else if (myRole === 'witch') {
      roleHint = `你是女巫，根据情况决定是否透露救人/毒人信息。一般不轻易跳身份。`
    } else if (myRole === 'hunter') {
      roleHint = `你是猎人，可暗示自己有开枪能力，威慑狼人。被推时可拍身份自证。`
    } else if (myRole === 'guard') {
      roleHint = `你是守卫，低调发言，必要时跳身份报守护信息排坑。`
    } else if (myRole === 'villager') {
      roleHint = `你是平民，通过观察分析找狼。不主动穿神衣服。`
    }

    return `${base}

昨晚死亡：${killed.length > 0 ? killed.map((id) => `${id}号`).join('、') : '无人（平安夜）'}

之前的发言记录：
${speechText}

${roleHint}

请以 ${info.myId}号(${me?.name}) 的身份发言，分析局势、表达观点、可能怀疑或支持某人。发言要符合你的角色身份和立场，30-80字以内，自然口语化。
只返回发言文本，不要加引号或角色名前缀。`
  }

  if (action === 'day-vote') {
    const speeches = body.speeches || []
    const speechText = speeches.length > 0
      ? speeches.map((s) => `${s.playerId}号：${s.content}`).join('\n')
      : '（无发言）'
    const targets = info.publicInfo.filter((p) => p.alive && p.id !== info.myId)

    let roleHint = ''
    if (isWolfRole(myRole)) {
      const teammates = info.wolfTeammates || []
      roleHint = `你是狼人，同伴是${teammates.map((t) => `${t}号`).join('、') || '无'}。不要投自己人，投威胁最大的好人或跟风。`
    } else if (myRole === 'seer') {
      roleHint = `你是预言家，根据你的查验结果投票（投你查出的狼人）。`
    } else {
      roleHint = `你是${myRoleName}，根据发言分析投出你认为的狼人。`
    }

    return `${base}

发言记录：
${speechText}

可投票目标：${targets.map((t) => `${t.id}号(${t.name})`).join('、')}

${roleHint}

请投票。返回JSON：{"targetId": 数字或null}，null表示弃票。不能投自己。`
  }

  if (action === 'sheriff-campaign') {
    const candidates = body.candidates || []
    return `${base}

今天是第一天，正在进行警长竞选。你已上警，需要发表竞选演讲。
其他候选人：${candidates.filter((id) => id !== info.myId).map((id) => `${id}号`).join('、') || '暂无'}

${isWolfRole(myRole) ? '你是狼人，上警可能是为了悍跳预言家或争夺警徽误导好人。' : myRole === 'seer' ? '你是预言家，应该跳预言家并报出昨晚查验结果+警徽流（验X撕Y），争取警徽。' : '你是好人，说明你上警的理由，争取大家信任。'}

请发表20-50字的竞选演讲，表明立场。只返回发言文本。`
  }

  if (action === 'sheriff-vote') {
    const candidates = body.candidates || []
    const candidateNames = candidates.map((id) => `${id}号(${info.publicInfo.find((p) => p.id === id)?.name})`).join('、')
    return `${base}

现在是警长竞选投票环节，你未上警，需要投票选出警长。
候选人：${candidateNames}

之前的竞选发言：
${(body.speeches || []).map((s) => `${s.playerId}号：${s.content}`).join('\n') || '（无发言）'}

${isWolfRole(myRole) ? '你是狼人，把票投给狼同伴或有利于狼人的候选人。' : '你是好人，把票投给你认为最可信的候选人（通常是真预言家）。'}

请返回JSON：{"targetId": 数字}，targetId为候选人id。`
  }

  if (action === 'last-words') {
    return `${base}

你已死亡，现在发表临终遗言。
${isWolfRole(myRole) ? '你是狼人，遗言可以误导好人或指认同伴。' : myRole === 'seer' ? '你是预言家，遗言应报出你的查验结果+警徽流，帮助好人。' : '你是好人，遗言可以表达你的怀疑或祝福。'}

请发表20-60字的遗言。只返回发言文本。`
  }

  if (action === 'hunter-shoot') {
    const targets = info.publicInfo.filter((p) => p.alive)
    return `${base}

你是猎人，即将死亡，可以开枪带走一名玩家。
【v2.0 §8.5】被狼刀/被投票放逐 → 可开枪；被毒/被白狼王自爆带走 → 不能开枪（但你现在是可开枪状态）。

可射击目标：${targets.map((t) => `${t.id}号(${t.name})`).join('、')}

策略：射击你认为是狼人的玩家。如果没有把握也可以不开枪(null)。
请只返回一个JSON：{"targetId": 数字或null}`
  }

  if (action === 'white-wolf-self-destruct') {
    const targets = info.publicInfo.filter((p) => p.alive && p.id !== info.myId)
    const teammates = info.wolfTeammates || []
    return `${base}

你是白狼王，决定白天自爆带走一名玩家。
【v2.0 §8.8】自爆后立即进入黑夜，自爆者本人无遗言。被带走者无遗言、猎人被带走无法开枪。

可带走目标（除自己外）：${targets.map((t) => `${t.id}号(${t.name})`).join('、')}
${teammates.length > 0 ? `你的狼同伴：${teammates.map((id) => `${id}号`).join('、')}（不要带走同伴！）` : ''}

策略：在明预言家难以被抗推，或带走某神职可直接达成屠边条件时，选择自爆带人。优先带走明女巫/守卫/预言家。
请只返回一个JSON：{"targetId": 数字}`
  }

  if (action === 'sheriff-transfer') {
    const candidates = info.publicInfo.filter((p) => p.alive)
    return `${base}

你是即将死亡的警长，需要将警徽移交给一名存活玩家，或撕毁警徽。
可移交目标：${candidates.map((t) => `${t.id}号(${t.name})`).join('、')}

策略：移交给最信任的好人（若是狼人警长则移交给狼同伴）。若无可信人选可撕毁（null）。
请只返回一个JSON：{"targetId": 数字或null}`
  }

  return base
}

function extractJSON(text: string): any | null {
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {}
  const match = text.match(/\{[\s\S]*\}/)
  if (match) {
    try {
      return JSON.parse(match[0])
    } catch {}
  }
  return null
}

// 回退决策（当 AI 调用失败时使用，严格遵守视角隔离）
function fallbackDecision(action: string, body: RequestBody): any {
  const info = body.aiVisibleInfo
  const alive = info.publicInfo.filter((p) => p.alive)
  const others = alive.filter((p) => p.id !== info.myId)
  const me = info.publicInfo.find((p) => p.id === info.myId)
  const myRole = info.myRole

  if (action === 'night-wolf') {
    const teammates = info.wolfTeammates || []
    const targets = others.filter((p) => !teammates.includes(p.id))
    return { targetId: targets[Math.floor(Math.random() * targets.length)]?.id ?? null }
  }
  if (action === 'night-seer') {
    return { targetId: others[Math.floor(Math.random() * others.length)]?.id ?? null }
  }
  if (action === 'night-witch') {
    return { save: false, poisonTarget: null }
  }
  if (action === 'night-guard') {
    const targets = others.filter((p) => p.id !== body.lastGuardTarget)
    return { targetId: targets[Math.floor(Math.random() * targets.length)]?.id ?? null }
  }
  if (action === 'day-speak') {
    const speeches = body.speeches || []
    const killed = body.killedThisNight || []
    const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)]

    if (isWolfRole(myRole)) {
      return { content: pick([
        '我觉得大家都要冷静分析，不要急于站队，我先听听更多人的发言。',
        '昨晚的死亡情况有点奇怪，我倾向认为狼人是在针对神职。',
        '我感觉有人一直在带节奏，大家要小心被误导。',
        '我是好人，希望大家不要冤枉我，我们一起找出真正的狼人。',
      ]) }
    }
    if (myRole === 'seer') {
      const hist = info.seerHistory || []
      if (hist.length > 0) {
        const last = hist[hist.length - 1]
        return { content: `我是预言家！昨晚我查验了${last.targetId}号，结果是${last.result === 'wolf' ? '狼人' : '好人'}，请大家跟我站队。` }
      }
      return { content: '我是预言家！昨晚我查验了一个人，结果让我比较意外，希望大家相信我。' }
    }
    if (myRole === 'witch') return { content: pick(['昨晚的情况我都看在眼里，有些信息我暂时不方便透露。', '我是好人，我有自己的判断。']) }
    if (myRole === 'hunter') return { content: pick(['我是好人，如果我出局大家会看到我的价值。', '昨晚谁死了我很关注，可疑的我一定投。']) }
    if (myRole === 'guard') return { content: pick(['我没什么特别信息，但我会保护好关键位置。', '从昨晚的刀法看，狼人在针对神职。']) }
    // villager
    return { content: pick([
      '目前信息不多，我倾向先观察。',
      '昨晚有人死了，我们要从死者的关系入手分析。',
      '我是平民，没什么特殊信息，但我愿意跟随预言家的指引。',
      '平安夜说明守卫或女巫发挥了作用，我们要保护这些神职。',
    ]) }
  }
  if (action === 'day-vote') {
    // 智能弃票策略: 狼人必投好人(不弃票), 预言家投查杀目标, 好人有信息则投否则弃票
    if (isWolfRole(myRole)) {
      const teammates = info.wolfTeammates || []
      const targets = others.filter((p) => !teammates.includes(p.id))
      return { targetId: targets.length > 0 ? targets[Math.floor(Math.random() * targets.length)].id : null }
    }
    if (myRole === 'seer') {
      // 预言家投最近查杀的狼人
      const hist = info.seerHistory || []
      const wolfFound = [...hist].reverse().find((h) => h.result === 'wolf')
      if (wolfFound && alive.find((p) => p.id === wolfFound.targetId)) {
        return { targetId: wolfFound.targetId }
      }
      return { targetId: null }
    }
    // 其他好人: 50% 概率跟随机票一个非自己的存活玩家, 否则弃票
    if (Math.random() < 0.5 && others.length > 0) {
      return { targetId: others[Math.floor(Math.random() * others.length)].id }
    }
    return { targetId: null }
  }
  if (action === 'sheriff-vote') {
    const candidates = body.candidates || []
    const valid = candidates.filter((id) => info.publicInfo.find((p) => p.id === id)?.alive)
    return { targetId: valid.length > 0 ? valid[Math.floor(Math.random() * valid.length)] : null }
  }
  if (action === 'sheriff-campaign') {
    if (isWolfRole(myRole)) return { content: '我上警是想为大家服务，希望大家支持我，我会带领好人找出狼人。' }
    if (myRole === 'seer') return { content: '我是预言家！昨晚我查验了一个人，请把警徽给我。' }
    return { content: '我上警是为了找出狼人，请大家相信我。' }
  }
  if (action === 'last-words') {
    if (isWolfRole(myRole)) return { content: '我是好人...大家要小心，狼人很狡猾...' }
    if (myRole === 'seer') {
      const hist = info.seerHistory || []
      if (hist.length > 0) {
        const last = hist[hist.length - 1]
        return { content: `我是预言家，最后查验${last.targetId}号是${last.result === 'wolf' ? '狼人' : '好人'}，请大家相信我...` }
      }
      return { content: '我是预言家，我的查验结果都在发言里了，请大家相信我...咳咳...' }
    }
    return { content: '我是好人，希望大家能找出真正的狼人，替我报仇...' }
  }
  if (action === 'hunter-shoot') {
    // 60% 概率开枪带走一名嫌疑玩家, 否则保留
    if (Math.random() < 0.6 && others.length > 0) {
      return { targetId: others[Math.floor(Math.random() * others.length)].id }
    }
    return { targetId: null }
  }
  if (action === 'white-wolf-self-destruct') {
    const teammates = info.wolfTeammates || []
    const targets = others.filter((p) => !teammates.includes(p.id))
    return { targetId: targets[Math.floor(Math.random() * targets.length)]?.id ?? null }
  }
  if (action === 'sheriff-transfer') {
    if (isWolfRole(myRole)) {
      const teammates = info.wolfTeammates || []
      const aliveMates = teammates.filter((id) => info.publicInfo.find((p) => p.id === id)?.alive)
      if (aliveMates.length > 0) return { targetId: aliveMates[0] }
    }
    return { targetId: null }
  }
  return null
}

// ============ AI 韧性层: 并发控制 + 429 重试 (v2.0 §9.4) ============
// 解决 dev log 中大量 429 限流导致 AI 退化为随机决策的问题

// 全局并发槽: 限制同时进行的 LLM 调用数, 避免瞬时并发触发限流
const MAX_CONCURRENT = 2
let activeCount = 0
const waitQueue: (() => void)[] = []

async function acquireSlot(): Promise<void> {
  if (activeCount < MAX_CONCURRENT) {
    activeCount++
    return
  }
  await new Promise<void>((resolve) => waitQueue.push(resolve))
  activeCount++
}

function releaseSlot(): void {
  activeCount--
  const next = waitQueue.shift()
  if (next) next()
}

// 判断是否可重试的错误 (429 限流 / 5xx 服务端错误 / 网络超时)
function isRetryable(status: number | undefined, errMsg: string): boolean {
  if (status === 429) return true
  if (status && status >= 500 && status < 600) return true
  if (/timeout|ECONNRESET|fetch failed|socket hang up/i.test(errMsg)) return true
  return false
}

// 带重试的 LLM 调用: 指数退避 (1s → 2s → 4s), 最多 3 次
async function callLLMWithRetry(
  zai: Awaited<ReturnType<typeof ZAI.create>>,
  messages: { role: string; content: string }[],
): Promise<string> {
  const maxRetries = 3
  let lastErr = ''
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const completion = await zai.chat.completions.create({
        messages: messages as any,
        thinking: { type: 'disabled' },
      })
      return completion.choices[0]?.message?.content || ''
    } catch (e: any) {
      lastErr = e?.message || String(e)
      const status = typeof e?.status === 'number' ? e.status : undefined
      const statusMatch = lastErr.match(/status (\d+)/)
      const inferredStatus = status || (statusMatch ? Number(statusMatch[1]) : undefined)
      if (attempt < maxRetries && isRetryable(inferredStatus, lastErr)) {
        // 指数退避 + 抖动, 避免重试风暴
        const backoff = Math.min(1000 * Math.pow(2, attempt), 8000)
        const jitter = Math.floor(Math.random() * 300)
        await new Promise((r) => setTimeout(r, backoff + jitter))
        continue
      }
      throw e
    }
  }
  throw new Error(lastErr)
}

export async function POST(req: NextRequest) {
  try {
    const body: RequestBody = await req.json()
    const { action, playerId, aiVisibleInfo } = body

    const systemPrompt = buildSystemPrompt(action, body)
    const me = aiVisibleInfo.publicInfo.find((p) => p.id === playerId)

    let userPrompt = ''
    if (action === 'day-speak' || action === 'sheriff-campaign' || action === 'last-words') {
      userPrompt = `请以 ${playerId}号(${me?.name}) 的身份发言，第${body.day}天。直接输出发言内容（自然口语）。`
    } else {
      userPrompt = '请返回JSON决策。'
    }

    let zai
    try {
      zai = await ZAI.create()
    } catch (e) {
      console.error('ZAI create failed', e)
      return NextResponse.json(fallbackDecision(action, body))
    }

    let content = ''
    await acquireSlot()
    try {
      content = await callLLMWithRetry(zai, [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ])
    } catch (e: any) {
      console.error('LLM call failed after retries', e?.message || e)
      return NextResponse.json(fallbackDecision(action, body))
    } finally {
      releaseSlot()
    }

    if (action === 'day-speak' || action === 'sheriff-campaign' || action === 'last-words') {
      const cleanContent = content
        .replace(/^["'""]+|["'""]+$/g, '')
        .replace(/^.*?[：:]\s*/s, '')
        .trim()
        .slice(0, 200)
      return NextResponse.json({
        content: cleanContent || fallbackDecision(action, body).content,
      })
    }

    const parsed = extractJSON(content)
    if (parsed) {
      const alive = aiVisibleInfo.publicInfo.filter((p) => p.alive)
      if ('targetId' in parsed && parsed.targetId !== null && parsed.targetId !== undefined) {
        const valid = alive.find((p) => p.id === parsed.targetId)
        if (!valid && action !== 'night-witch' && action !== 'sheriff-transfer') {
          return NextResponse.json(fallbackDecision(action, body))
        }
      }
      if (action === 'night-witch') {
        if (parsed.poisonTarget !== null && parsed.poisonTarget !== undefined) {
          const valid = alive.find((p) => p.id === parsed.poisonTarget && p.id !== playerId)
          if (!valid) parsed.poisonTarget = null
        }
      }
      return NextResponse.json(parsed)
    }

    return NextResponse.json(fallbackDecision(action, body))
  } catch (e: any) {
    console.error('werewolf action API error', e)
    return NextResponse.json(
      { error: e?.message || 'Internal error' },
      { status: 500 },
    )
  }
}
