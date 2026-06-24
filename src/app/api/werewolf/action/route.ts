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

// 难度提示词 = 战略风格 (v2.0 §9.2 升级为3种打法风格)
// easy → 激进型 / normal → 均衡型 / hard → 老练型
function difficultyHint(difficulty: string, myRole: string): string {
  if (difficulty === 'easy') {
    // 激进型 (Aggressive)
    return `【激进型打法】你打牌大胆直接，喜欢制造冲突和快节奏。
- 狼人：主动悍跳预言家/女巫/猎人等神职，强势带节奏，点名攻击具体好人；冲锋狼直接怼真预言家逼其露馅，倒钩狼也敢反咬同伴降低怀疑。
- 好人：敢于强硬站边，对跳预言家时直接断言真假；对怀疑对象穷追猛打，宁错杀不放过；预言家必须强势跳身份报查验+警徽流。`
  }
  if (difficulty === 'normal') {
    // 均衡型 (Balanced)
    return `【均衡型打法】你采用标准逻辑狼人杀策略，平衡进攻与防守。
- 狼人：分配角色(1人悍跳预言家报查验+警徽流，1人冲锋怼对跳，其余倒钩装好人)；制造合理怀疑带偏好人思路；保留同伴暗中推动局势。
- 好人：综合分析死亡、查验、发言逻辑；跟随真预言家金水/查杀归票；女巫/守卫在关键夜晚保护神职；不轻易穿神衣服。`
  }
  // hard - 老练型 (Veteran)
  return `【老练型打法】你深谙心理博弈与轮次计算，发言滴水不漏。
- 狼人：深水狼刻意站边真预言家降低怀疑，倒钩狼装铁好人；制造平安夜骗女巫解药；通过分析票型反推狼坑位误导好人；保留轮次优势。
- 好人：通过票型盘狼坑位，主动穿衣服挡刀；猎人隐藏直到关键时刻；守卫盲守关键位；能识别"过度站边"的可疑发言，关注轮次得失与投票收益。`
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
    const killedText = killed.length > 0
      ? killed.map((id) => {
          const p = info.publicInfo.find((pp) => pp.id === id)
          return `${id}号${p ? `(${p.name})` : ''}`
        }).join('、')
      : '无人（平安夜）'

    // 识别已跳预言家的玩家，便于 AI 针对性回应
    const seerClaims = speeches
      .filter((s) => /我是预言家|我跳预言家|预言家/.test(s.content))
      .map((s) => s.playerId)
    const seerClaimText = seerClaims.length > 0
      ? `\n⚠️ 注意：${seerClaims.map((id) => `${id}号`).join('、')}已经跳预言家，你必须对其真伪表明立场。`
      : ''

    // 角色专属策略(按难度风格区分)
    let roleHint = ''
    if (isWolfRole(myRole)) {
      const teammates = info.wolfTeammates || []
      const teammateText = teammates.length > 0
        ? `\n你的狼同伴是：${teammates.map((id) => `${id}号`).join('、')}(暗中保护、不要互踩)`
        : ''
      if (difficulty === 'easy') {
        roleHint = `你是狼人(激进型)，要主动出击：悍跳神职(预言家/女巫/猎人)压制好人，或强势点名攻击某位具体好人(给出怀疑理由)转移视线。发言要狠、要直接，敢于带节奏。${teammateText}`
      } else if (difficulty === 'normal') {
        roleHint = `你是狼人(均衡型)，混合战术：若已有同伴悍跳预言家则你冲锋怼对跳或装好人倒钩；否则可考虑自己悍跳。发言制造合理怀疑，暗中保护同伴，不露破绽。${teammateText}`
      } else {
        roleHint = `你是狼人(老练型)，深水/倒钩战术：刻意站边真预言家降低怀疑，用逻辑分析带偏好人思路，制造平安夜骗女巫解药。发言要有理有据、不轻易露怯。${teammateText}`
      }
    } else if (myRole === 'seer') {
      const seerHist = info.seerHistory || []
      const lastCheck = seerHist.length > 0 ? seerHist[seerHist.length - 1] : null
      const histText = seerHist.length > 0
        ? `\n你的全部查验历史：\n${seerHist.map((h) => `第${h.day}夜查验${h.targetId}号(${h.targetName}) = ${h.result === 'wolf' ? '狼人' : '好人'}`).join('\n')}`
        : '\n（你尚未查验过任何人）'
      const checkedIds = seerHist.map((h) => h.targetId)
      const nextTargets = info.publicInfo.filter((p) => p.alive && p.id !== info.myId && !checkedIds.includes(p.id))
      const nextTarget = nextTargets[0]
      const badgeFlowText = lastCheck && nextTarget
        ? `\n警徽流：今晚我将验${nextTarget.id}号，若我死了撕${nextTarget.id}号警徽(验${nextTarget.id}撕${nextTarget.id})。`
        : nextTarget
          ? `\n警徽流：今晚验${nextTarget.id}号，若死撕${nextTarget.id}号警徽。`
          : '\n警徽流：将根据今晚查验情况决定。'
      roleHint = `你是真预言家，必须清晰跳身份并报出查验结果+警徽流，争取好人信任：${histText}\n最新查验：${lastCheck ? `${lastCheck.targetId}号是${lastCheck.result === 'wolf' ? '狼人(查杀！)' : '好人(金水)'}` : '尚无查验'}${badgeFlowText}\n发言模板参考："我是预言家，昨晚验了X号是金水/查杀，今晚验Y号，警徽流验Y撕Z。"，然后给出对场上局势的判断。`
    } else if (myRole === 'witch') {
      if (difficulty === 'easy') {
        roleHint = `你是女巫(激进型)，可强势暗示自己有信息压制可疑玩家，必要时拍身份自证；表达明确的怀疑对象和理由。`
      } else if (difficulty === 'normal') {
        roleHint = `你是女巫(均衡型)，低调分析局势，不轻易跳身份；若被怀疑可适当透露救人/毒人信息以自证；给出基于你信息的判断。`
      } else {
        roleHint = `你是女巫(老练型)，隐藏身份观察狼人刀法，分析谁是被刀目标推断狼人意图；保留药剂到关键轮次；发言逻辑严密不暴露药剂状态。`
      }
    } else if (myRole === 'hunter') {
      if (difficulty === 'easy') {
        roleHint = `你是猎人(激进型)，强势暗示自己有开枪能力威慑狼人，被推时拍身份自证并威胁开枪带走可疑玩家。`
      } else if (difficulty === 'normal') {
        roleHint = `你是猎人(均衡型)，适度暗示身份威慑狼人，不轻易拍身份；被推时果断拍身份自证；给出你的怀疑分析。`
      } else {
        roleHint = `你是猎人(老练型)，隐藏身份直到关键时刻，避免成为狼人首刀目标；通过分析发言锁定可疑狼人作为开枪目标。`
      }
    } else if (myRole === 'guard') {
      if (difficulty === 'easy') {
        roleHint = `你是守卫(激进型)，可强势分析刀法、点名可疑玩家，必要时跳身份报守护信息排坑。`
      } else if (difficulty === 'normal') {
        roleHint = `你是守卫(均衡型)，低调分析，必要时跳身份报守护信息帮助好人排狼坑；不轻易暴露守位规律。`
      } else {
        roleHint = `你是守卫(老练型)，深藏身份，通过分析狼人刀法推断其意图，盲守关键位置；发言逻辑严密不暴露守位规律。`
      }
    } else if (myRole === 'villager') {
      if (difficulty === 'easy') {
        roleHint = `你是平民(激进型)，敢于强硬站边真预言家，穷追猛打可疑玩家；不主动穿神衣服但敢于表态归票。`
      } else if (difficulty === 'normal') {
        roleHint = `你是平民(均衡型)，通过观察分析发言逻辑，跟随预言家金水/查杀归票；不主动穿神衣服。`
      } else {
        roleHint = `你是平民(老练型)，主动穿神衣服挡刀保护真神职，分析票型盘狼坑位，关注轮次得失。`
      }
    }

    const analysisHints = `发言要点(必须包含至少2项)：
- 针对昨晚死亡情况分析(当前：${killedText})：狼人刀法意图？被刀者是神职还是平民？平安夜说明守卫/女巫发挥了作用。
- 回应前序发言中的关键信息(尤其是预言家对跳/查验结果/警徽流)，表明你的立场(信谁/不信谁)。
- 给出具体怀疑对象+理由(不要泛泛而谈"我觉得有狼")。
- 表达你的归票倾向或站边立场。
- 避免每次都用"我觉得"开头，尝试多样化表达：如"我注意到了"、"刚才X号的发言"、"从昨晚的刀法看"、"我站X号预言家"、"X号这条逻辑不成立"等。`

    // 发言位置感知 + 反重复机制
    const speechCount = speeches.length
    const totalAlive = info.publicInfo.filter((p) => p.alive).length
    const myPosition = speechCount + 1 // 我是第几个发言
    let positionHint = ''
    if (myPosition === 1) {
      positionHint = `\n【你是第一个发言】你需要定调：分析死亡情况、表达初步立场、点名怀疑对象。为后续讨论设定方向。`
    } else if (myPosition < totalAlive) {
      // 提取前序发言的关键观点, 强制AI不重复
      const prevPoints = speeches.slice(-3).map((s) => `${s.playerId}号观点：${s.content.slice(0, 40)}...`).join('\n')
      positionHint = `\n【你是第${myPosition}个发言(共${totalAlive}人)】前面已有人说的话：
${prevPoints}

⚠️ 严禁重复上述观点！你必须带来新的角度：
- 如果同意某人，说"我同意X号说的Y"然后补充新理由
- 如果不同意，明确反驳"X号说的Y我不认同，因为..."
- 或者提出一个前人完全没提到的新疑点/新分析
- 每个人的发言必须独特，不能像复读机一样说相同的话`
    } else {
      positionHint = `\n【你是最后一个发言(第${myPosition}个，共${totalAlive}人)】你需要总结性发言：梳理全场关键分歧点，给出你的最终判断和归票方向。不要重复前面的分析，而是做判断和总结。`
    }

    // 个性化视角种子 (基于玩家ID分配不同分析风格, 增加多样性)
    const personalityStyles = ['逻辑缜密型(注重推理链)', '直觉敏锐型(关注微表情和发言状态)', '激进冲锋型(直接点名要归票)', '稳健保守型(先观察再表态)']
    const myPersonality = personalityStyles[info.myId % personalityStyles.length]

    return `${base}

昨晚死亡：${killedText}${seerClaimText}

之前的发言记录：
${speechText}

${roleHint}

${analysisHints}
${positionHint}

【你的发言风格】${myPersonality}。请以此风格发言，与场上其他玩家形成差异化。

请以 ${info.myId}号(${me?.name}) 的身份发言，60-150字以内，自然口语化但要有实质内容(分析、判断、立场)。你的发言必须与前序玩家明显不同，展现你独有的观察和推理。
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
      const teammateText = `你的狼同伴是${teammates.map((t) => `${t}号`).join('、') || '无'}。绝对不能投自己人！`
      if (difficulty === 'easy') {
        roleHint = `你是狼人(激进型)：${teammateText}果断投票，绝不弃票；投威胁最大的好人(明预言家/明女巫/强势平民)。`
      } else if (difficulty === 'normal') {
        roleHint = `你是狼人(均衡型)：${teammateText}跟风好人票型避免暴露，或投真预言家抗推；不要带头跳票。`
      } else {
        roleHint = `你是狼人(老练型)：${teammateText}考虑轮次得失，可能临票改票/分票制造平票局面拖轮次；投最有威胁的好人。`
      }
    } else if (myRole === 'seer') {
      const hist = info.seerHistory || []
      const wolfFound = [...hist].reverse().find((h) => h.result === 'wolf')
      roleHint = `你是预言家${wolfFound ? `，你查验到${wolfFound.targetId}号是狼人，必须投他(查杀目标)！` : '，根据发言逻辑投你怀疑的狼人'}。`
    } else {
      if (difficulty === 'easy') {
        roleHint = `你是${myRoleName}(激进型)：果断投票不弃票，投你怀疑的对象，宁错杀不放过。`
      } else if (difficulty === 'normal') {
        roleHint = `你是${myRoleName}(均衡型)：跟随真预言家的查杀归票，或投发言有重大漏洞的可疑玩家。`
      } else {
        roleHint = `你是${myRoleName}(老练型)：综合分析票型盘狼坑位，考虑轮次得失；可战略性投票(如保留关键神职、保护明好人)。`
      }
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
    const otherCandidates = candidates
      .filter((id) => id !== info.myId)
      .map((id) => {
        const p = info.publicInfo.find((pp) => pp.id === id)
        return `${id}号${p ? `(${p.name})` : ''}`
      })
      .join('、') || '暂无'

    let roleStrategy = ''
    if (isWolfRole(myRole)) {
      if (difficulty === 'easy') {
        roleStrategy = `你是狼人(激进型悍跳)：必须悍跳预言家，编造昨晚查验结果(说某位好人是查杀或某位狼同伴是金水)，并报出警徽流(如"验X撕Y")。发言要自信、坚定，争取警徽压制真预言家。`
      } else if (difficulty === 'normal') {
        roleStrategy = `你是狼人(均衡型)：可选择悍跳预言家(报假查验+警徽流)，或假装好人上警说明自己能带节奏、能分析。若已有狼同伴悍跳则你做冲锋或倒钩。`
      } else {
        roleStrategy = `你是狼人(老练型)：考虑悍跳预言家报合理查验+警徽流，或作为"深水好人"上警博取信任后暗中带偏好人。`
      }
    } else if (myRole === 'seer') {
      const seerHist = info.seerHistory || []
      const lastCheck = seerHist.length > 0 ? seerHist[seerHist.length - 1] : null
      const checkedIds = seerHist.map((h) => h.targetId)
      const nextTargets = info.publicInfo.filter((p) => p.alive && p.id !== info.myId && !checkedIds.includes(p.id))
      const nextTarget = nextTargets[0]
      roleStrategy = `你是真预言家！必须清晰声明：
1. "我是预言家"
2. 报出昨晚查验结果：${lastCheck ? `${lastCheck.targetId}号是${lastCheck.result === 'wolf' ? '狼人(查杀)' : '好人(金水)'}` : '(根据你的查验历史报)'}
3. 报出警徽流：${nextTarget ? `今晚验${nextTarget.id}号，若我死了撕${nextTarget.id}号警徽(验${nextTarget.id}撕${nextTarget.id})` : '根据场上情况决定'}
争取警徽，让好人归票有据。`
    } else if (myRole === 'witch') {
      roleStrategy = `你是女巫上警：说明你有判断信息、能保护神职，争取警徽带领好人。不轻易暴露身份但展现领导力。`
    } else if (myRole === 'hunter') {
      roleStrategy = `你是猎人上警：暗示你有开枪能力威慑狼人，说明你能带领好人逻辑归票。`
    } else if (myRole === 'guard') {
      roleStrategy = `你是守卫上警：说明你能分析刀法、保护关键位置，争取警徽。`
    } else {
      roleStrategy = `你是平民上警：说明你能站边真预言家、能逻辑分析找狼，争取警徽。`
    }

    return `${base}

今天是第一天，正在进行警长竞选。你已上警，需要发表竞选演讲。
其他候选人：${otherCandidates}

${roleStrategy}

发言要求：40-100字，明确表明你的立场和能力；若跳预言家必须报查验结果+警徽流；发言要自信有说服力。
只返回发言文本。`
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
    let roleStrategy = ''
    if (isWolfRole(myRole)) {
      if (difficulty === 'easy') {
        roleStrategy = `你是狼人遗言(激进型)：可硬刚到底坚称自己是好人、指控特定玩家是狼；或反咬同伴以混淆视听。`
      } else if (difficulty === 'normal') {
        roleStrategy = `你是狼人遗言(均衡型)：可继续误导好人，或将矛头指向可疑的好人；视情况暴露假信息。`
      } else {
        roleStrategy = `你是狼人遗言(老练型)：深水误导，制造混乱让好人内讧；或暴露队友位置换取轮次优势(战略性)。`
      }
    } else if (myRole === 'seer') {
      const seerHist = info.seerHistory || []
      const lastCheck = seerHist.length > 0 ? seerHist[seerHist.length - 1] : null
      const histText = seerHist.length > 0
        ? `\n你的全部查验历史：\n${seerHist.map((h) => `第${h.day}夜查验${h.targetId}号(${h.targetName}) = ${h.result === 'wolf' ? '狼人' : '好人'}`).join('\n')}`
        : '\n（你尚未查验过任何人）'
      const checkedIds = seerHist.map((h) => h.targetId)
      const nextTargets = info.publicInfo.filter((p) => p.alive && p.id !== info.myId && !checkedIds.includes(p.id))
      const nextTarget = nextTargets[0]
      roleStrategy = `你是预言家遗言：必须清晰报出全部查验结果+最终警徽流推荐！${histText}\n最新查验：${lastCheck ? `${lastCheck.targetId}号是${lastCheck.result === 'wolf' ? '狼人(查杀！)' : '好人(金水)'}` : '尚无查验'}\n${nextTarget ? `警徽流建议：将警徽给${nextTarget.id}号(我接下来会验他)` : '请根据场上信任的玩家移交警徽'}\n让好人有据可依，找出真狼人。`
    } else if (myRole === 'witch') {
      roleStrategy = `你是女巫遗言：可透露你的救人/毒人信息帮助好人排坑；表达你对场上局势的最终判断。`
    } else if (myRole === 'hunter') {
      roleStrategy = `你是猎人遗言：可暗示你的开枪目标(若被推/被刀可带走)，威慑狼人；表达你的怀疑对象。`
    } else if (myRole === 'guard') {
      roleStrategy = `你是守卫遗言：可透露你的守护信息帮助好人排狼坑；表达你的最终怀疑。`
    } else {
      roleStrategy = `你是平民遗言：表达你的最终怀疑和分析，祝福好人找出真狼人。`
    }

    return `${base}

你已死亡，现在发表临终遗言。
${roleStrategy}

发言要求：40-120字，留下对好人最有价值的信息。预言家务必报查验+警徽流；其他角色给出你的判断和怀疑对象。
只返回发言文本。`
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
