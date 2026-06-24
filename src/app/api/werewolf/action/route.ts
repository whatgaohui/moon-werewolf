import { NextRequest, NextResponse } from 'next/server'
import ZAI from 'z-ai-web-dev-sdk'

// 简化的玩家信息（传给AI）
interface AIPlayer {
  id: number
  name: string
  avatar: string
  alive: boolean
  isUser: boolean
  role: string
}

interface RequestBody {
  action: 'night-wolf' | 'night-seer' | 'night-witch' | 'night-guard' | 'day-speak' | 'day-vote' | 'hunter-shoot' | 'sheriff-campaign' | 'sheriff-vote' | 'last-words'
  playerId: number
  players: AIPlayer[]
  day: number
  speeches?: { playerId: number; playerName: string; content: string; isUser: boolean }[]
  votes?: { voterId: number; voterName: string; targetId: number | null; targetName: string | null }[]
  killedThisNight?: number[]
  lastGuardTarget?: number | null
  wolfTarget?: number
  canSave?: boolean
  canPoison?: boolean
  candidates?: number[]
}

const ROLE_NAMES: Record<string, string> = {
  wolf: '狼人',
  'white-wolf': '白狼王',
  seer: '预言家',
  witch: '女巫',
  hunter: '猎人',
  guard: '守卫',
  knight: '骑士',
  villager: '平民',
}

function isWolfRole(role: string) {
  return role === 'wolf' || role === 'white-wolf'
}

function aliveList(players: AIPlayer[]): string {
  return players
    .filter((p) => p.alive)
    .map((p) => `${p.id}号(${p.name})`)
    .join('、')
}

function deadList(players: AIPlayer[]): string {
  return players
    .filter((p) => !p.alive)
    .map((p) => `${p.id}号(${p.name})`)
    .join('、')
}

function buildSystemPrompt(action: string, body: RequestBody): string {
  const me = body.players.find((p) => p.id === body.playerId)
  const myRole = me?.role || 'villager'
  const myRoleName = ROLE_NAMES[myRole] || '平民'

  const base = `你正在参与一局狼人杀游戏，扮演 ${body.playerId}号玩家(${me?.name})，你的身份是【${myRoleName}】。
当前是第${body.day}天。
存活玩家：${aliveList(body.players)}
死亡玩家：${deadList(body.players) || '无'}`

  if (action === 'night-wolf') {
    const teammates = body.players.filter((p) => p.alive && isWolfRole(p.role) && p.id !== body.playerId)
    const targets = body.players.filter((p) => p.alive && !isWolfRole(p.role))
    return `${base}

你的狼人同伴：${teammates.map((t) => `${t.id}号(${t.name})`).join('、') || '无（你是唯一的狼人）'}
可击杀的目标：${targets.map((t) => `${t.id}号(${t.name})`).join('、')}

作为狼人，你需要策略性地选择击杀目标。优先击杀疑似神职（预言家/女巫/猎人）或发言强势的好人。
请只返回一个JSON：{"targetId": 数字}，targetId为要击杀的玩家id。`
  }

  if (action === 'night-seer') {
    const targets = body.players.filter((p) => p.alive && p.id !== body.playerId)
    return `${base}

你是预言家，需要选择一名玩家查验其身份（好人/狼人）。
可查验目标：${targets.map((t) => `${t.id}号(${t.name})`).join('、')}

策略：优先查验发言可疑、行为异常的玩家，或自己不确定的人。
请只返回一个JSON：{"targetId": 数字}，targetId为要查验的玩家id。`
  }

  if (action === 'night-witch') {
    const wolfTarget = body.wolfTarget
    const wtPlayer = wolfTarget !== undefined ? body.players.find((p) => p.id === wolfTarget) : null
    return `${base}

你是女巫。今晚被狼人攻击的是：${wtPlayer ? `${wolfTarget}号(${wtPlayer.name})` : '无人'}
${body.canSave ? '✅ 解药可用' : '❌ 解药已用'}
${body.canPoison ? '✅ 毒药可用' : '❌ 毒药已用'}

策略：
- 首夜被刀可考虑救人保护好人
- 若有强烈怀疑对象，可使用毒药
- 药剂珍贵，谨慎使用

可毒杀目标（存活玩家，除自己外）：${body.players.filter((p) => p.alive && p.id !== body.playerId).map((t) => `${t.id}号(${t.name})`).join('、')}

请只返回一个JSON：{"save": true/false, "poisonTarget": 数字或null}
- save: 是否使用解药救人
- poisonTarget: 毒杀目标id，不用则填null`
  }

  if (action === 'night-guard') {
    const targets = body.players.filter((p) => p.alive && p.id !== body.lastGuardTarget)
    return `${base}

你是守卫。上晚你守护了：${body.lastGuardTarget !== null && body.lastGuardTarget !== undefined ? `${body.lastGuardTarget}号` : '无人（首夜）'}
注意：不能连续两晚守护同一人！

可守护目标：${targets.map((t) => `${t.id}号(${t.name})`).join('、')}

策略：守护疑似神职或自己认为重要的人，首夜可自守。
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
      roleHint = `你是狼人，需要伪装成好人发言。可以：跳预言家/女巫等神职（悍跳）、带节奏怀疑好人、保护狼同伴、混淆视听。但不要太明显。`
    } else if (myRole === 'seer') {
      roleHint = `你是预言家，应该跳出来说明身份并报查验结果（如果你昨晚查验了某人）。但要小心被狼人针对。`
    } else if (myRole === 'witch') {
      roleHint = `你是女巫，根据情况决定是否透露救人/毒人信息。一般不轻易跳身份。`
    } else if (myRole === 'hunter') {
      roleHint = `你是猎人，可暗示自己有开枪能力，威慑狼人。`
    } else if (myRole === 'guard') {
      roleHint = `你是守卫，低调发言，保护关键神职。`
    } else if (myRole === 'villager') {
      roleHint = `你是平民，通过观察分析，找出狼人。`
    }

    return `${base}

昨晚死亡：${killed.length > 0 ? killed.map((id) => `${id}号`).join('、') : '无人（平安夜）'}

之前的发言记录：
${speechText}

${roleHint}

请以 ${body.playerId}号(${me?.name}) 的身份发言，分析局势、表达观点、可能怀疑或支持某人。发言要符合你的角色身份和立场，控制在30-80字以内，自然口语化。
只返回发言文本，不要加引号或角色名前缀。`
  }

  if (action === 'day-vote') {
    const speeches = body.speeches || []
    const speechText = speeches.length > 0
      ? speeches.map((s) => `${s.playerId}号：${s.content}`).join('\n')
      : '（无发言）'
    const targets = body.players.filter((p) => p.alive && p.id !== body.playerId)

    let roleHint = ''
    if (isWolfRole(myRole)) {
      const teammates = body.players.filter((p) => p.alive && isWolfRole(p.role) && p.id !== body.playerId)
      roleHint = `你是狼人，同伴是${teammates.map((t) => `${t.id}号`).join('、') || '无'}。不要投自己人，投威胁最大的好人或跟风。`
    } else if (myRole === 'seer') {
      roleHint = `你是预言家，根据你的查验结果投票。`
    } else {
      roleHint = `你是${myRoleName}，根据发言分析投出你认为的狼人。`
    }

    return `${base}

发言记录：
${speechText}

可投票目标：${targets.map((t) => `${t.id}号(${t.name})`).join('、')}

${roleHint}

请投票。返回JSON：{"targetId": 数字或null}，null表示弃票。`
  }

  if (action === 'sheriff-campaign') {
    const candidates = body.candidates || []
    return `${base}

今天是第一天，正在进行警长竞选。你已上警，需要发表竞选演讲。
其他候选人：${candidates.filter((id) => id !== body.playerId).map((id) => `${id}号`).join('、') || '暂无'}

${isWolfRole(myRole) ? '你是狼人，上警可能是为了悍跳预言家或争夺警徽误导好人。' : myRole === 'seer' ? '你是预言家，应该跳预言家并报出昨晚查验结果，争取警徽。' : '你是好人，说明你上警的理由，争取大家信任。'}

请发表20-50字的竞选演讲，表明立场。只返回发言文本。`
  }

  if (action === 'sheriff-vote') {
    const candidates = body.candidates || []
    const candidateNames = candidates.map((id) => `${id}号(${body.players.find((p) => p.id === id)?.name})`).join('、')
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
${isWolfRole(myRole) ? '你是狼人，遗言可以误导好人或指认同伴。' : myRole === 'seer' ? '你是预言家，遗言应报出你的查验结果，帮助好人。' : '你是好人，遗言可以表达你的怀疑或祝福。'}

请发表20-60字的遗言。只返回发言文本。`
  }

  if (action === 'hunter-shoot') {
    const targets = body.players.filter((p) => p.alive)
    return `${base}

你是猎人，即将死亡，可以开枪带走一名玩家。
可射击目标：${targets.map((t) => `${t.id}号(${t.name})`).join('、')}

策略：射击你认为是狼人的玩家。如果没有把握也可以不开枪(null)。
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

function fallbackDecision(action: string, body: RequestBody): any {
  const alive = body.players.filter((p) => p.alive)
  const others = alive.filter((p) => p.id !== body.playerId)

  if (action === 'night-wolf') {
    const targets = others.filter((p) => !isWolfRole(p.role))
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
    const me = body.players.find((p) => p.id === body.playerId)
    const role = me?.role
    const speeches = body.speeches || []
    const killed = body.killedThisNight || []
    const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)]

    if (role && isWolfRole(role)) {
      const wolfLines = [
        '我觉得大家都要冷静分析，不要急于站队，我先听听更多人的发言。',
        '昨晚的死亡情况有点奇怪，我倾向认为狼人是在针对神职，我们要保护好预言家。',
        '我感觉有人一直在带节奏，大家要小心被误导，我暂时持观望态度。',
        '我是好人，希望大家不要冤枉我，我们一起找出真正的狼人。',
        '从昨晚的刀法来看，狼人应该是有经验的玩家，大家发言要更仔细地分析。',
      ]
      return { content: pick(wolfLines) }
    }
    if (role === 'seer') {
      const seerLines = [
        '我是预言家！昨晚我查验了一个人，结果让我比较意外，希望大家相信我。',
        '我跳预言家！我有查验信息，接下来会根据局势报出我的查验结果。',
        '大家好，我是预言家，昨晚验了一个人是好人，请大家跟我站队。',
      ]
      return { content: pick(seerLines) }
    }
    if (role === 'witch') {
      const witchLines = [
        '昨晚的情况我都看在眼里，有些信息我暂时不方便透露，但我心里有数。',
        '我是好人，我有自己的判断，希望大家发言时多提供一些有价值的信息。',
        '我相信预言家会跳出来的，我们先听完所有人的发言再做决定。',
      ]
      return { content: pick(witchLines) }
    }
    if (role === 'hunter') {
      const hunterLines = [
        '我是好人，如果我出局大家会看到我的价值。狼人最好别动我。',
        '我觉得我们要团结起来，把可疑的人一个个排查，我有自己的底牌。',
        '昨晚谁死了我很关注，大家发言我会仔细听，可疑的我一定投。',
      ]
      return { content: pick(hunterLines) }
    }
    // villager
    const villagerLines = [
      '目前信息不多，我倾向先观察，看看后续发言再判断。',
      '昨晚有人死了，我们要从死者的关系入手分析，谁是受益者谁就可疑。',
      '我觉得大家发言时要表明立场，含糊其辞的可能有问题。',
      '我是平民，没什么特殊信息，但我愿意跟随预言家的指引。',
      '从目前的发言来看，有几个人的逻辑不太通，我标记一下。',
      '平安夜说明守卫或女巫发挥了作用，我们要保护这些神职。',
    ]
    return { content: pick(villagerLines) }
  }
  if (action === 'day-vote') {
    return { targetId: null }
  }
  if (action === 'sheriff-vote') {
    const candidates = body.candidates || []
    const valid = candidates.filter((id) => {
      const p = body.players.find((pp) => pp.id === id)
      return p && p.alive
    })
    return { targetId: valid.length > 0 ? valid[Math.floor(Math.random() * valid.length)] : null }
  }
  if (action === 'sheriff-campaign') {
    const me = body.players.find((p) => p.id === body.playerId)
    const role = me?.role
    if (role && isWolfRole(role)) {
      return { content: '我上警是想为大家服务，希望大家支持我，我会带领好人找出狼人。' }
    }
    if (role === 'seer') {
      return { content: '我是预言家！昨晚我查验了一个人，我有重要信息要告诉大家，请把警徽给我。' }
    }
    return { content: '我上警是为了找出狼人，请大家相信我，我会认真分析每个人的发言。' }
  }
  if (action === 'last-words') {
    const me = body.players.find((p) => p.id === body.playerId)
    const role = me?.role
    if (role && isWolfRole(role)) {
      return { content: '我是好人...大家要小心，狼人很狡猾...' }
    }
    if (role === 'seer') {
      return { content: '我是预言家，我的查验结果都在发言里了，请大家相信我...咳咳...' }
    }
    return { content: '我是好人，希望大家能找出真正的狼人，替我报仇...' }
  }
  if (action === 'hunter-shoot') {
    return { targetId: null }
  }
  return null
}

export async function POST(req: NextRequest) {
  try {
    const body: RequestBody = await req.json()
    const { action, playerId, players, day } = body

    const systemPrompt = buildSystemPrompt(action, body)
    const me = players.find((p) => p.id === playerId)

    let userPrompt = ''
    if (action === 'day-speak' || action === 'sheriff-campaign' || action === 'last-words') {
      userPrompt = `请以 ${playerId}号(${me?.name}) 的身份发言，第${day}天。直接输出发言内容（自然口语）。`
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
    try {
      const completion = await zai.chat.completions.create({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        thinking: { type: 'disabled' },
      })
      content = completion.choices[0]?.message?.content || ''
    } catch (e) {
      console.error('LLM call failed', e)
      return NextResponse.json(fallbackDecision(action, body))
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
      if ('targetId' in parsed && parsed.targetId !== null) {
        const valid = players.find((p) => p.id === parsed.targetId && p.alive)
        if (!valid && action !== 'night-witch') {
          return NextResponse.json(fallbackDecision(action, body))
        }
      }
      if (action === 'night-witch') {
        if (parsed.poisonTarget !== null && parsed.poisonTarget !== undefined) {
          const valid = players.find((p) => p.id === parsed.poisonTarget && p.alive && p.id !== playerId)
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
