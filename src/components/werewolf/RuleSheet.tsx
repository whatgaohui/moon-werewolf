'use client'

import { useMemo } from 'react'
import { BookOpen, Check, Lightbulb, Moon, Sun, Crown, ScrollText } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { useWerewolfStore } from '@/lib/werewolf/store'
import { GamePhase } from '@/lib/werewolf/types'
import { cn } from '@/lib/utils'

// ============================================================================
// 规则文案表（按 phase 索引；缺失阶段使用 fallback）
// ============================================================================
type RuleEntry = {
  title: string
  rules: string[]
  tips?: string[]
}

const RULES: Record<string, RuleEntry> = {
  'role-reveal': {
    title: '发牌阶段',
    rules: [
      '本局配置的角色将随机分配给所有玩家',
      '你是唯一的人类玩家，其余为 AI',
      '记住自己的身份和能力',
    ],
  },
  'night-start': {
    title: '黑夜阶段',
    rules: [
      '天黑请闭眼，按顺序执行各角色行动',
      '行动顺序：守卫→狼人→预言家→女巫',
      '夜间信息严格隔离，仅公布夜晚结果',
    ],
  },
  'night-guard': {
    title: '守卫规则',
    rules: [
      '守卫每夜守护一名玩家，被守护者免疫狼刀',
      '不能连续两晚守护同一人',
      '同守同救（守卫+女巫解药同时作用于一人）会导致该玩家死亡',
    ],
  },
  'night-wolf': {
    title: '狼人规则',
    rules: [
      '狼人每晚共同选择一个击杀目标',
      '所有狼人共享一个目标',
      '白狼王夜晚和普通狼人一起行动，白天可自爆',
    ],
  },
  'night-seer': {
    title: '预言家规则',
    rules: [
      '每夜查验一名玩家身份，得知"好人/狼人"',
      '查验结果仅自己可见',
      '白天可跳身份报警徽流',
    ],
  },
  'night-witch': {
    title: '女巫规则',
    rules: [
      '拥有解药和毒药各一瓶',
      '每夜只能用一瓶（解药或毒药）',
      '解药救当晚被刀的人，毒药毒杀任意玩家',
      '首夜可自救，之后不可自救',
      '同守同救会导致死亡',
    ],
  },
  'day-sheriff-announce': {
    title: '警长竞选',
    rules: [
      '第一天白天进行警长竞选',
      '警长拥有1.5票投票权',
      '警长决定发言顺序（从其右边开始）',
      '上警玩家依次发言，未上警玩家投票',
      '狼人可自爆吞警徽',
    ],
  },
  'day-sheriff-campaign': {
    title: '竞选发言',
    rules: [
      '上警玩家依次发表竞选演讲',
      '预言家通常在此跳身份报警徽流',
      '未上警玩家将在发言结束后投票选警长',
      '候选人可退水（放弃竞选）',
    ],
    tips: [
      '预言家应跳身份+报查验结果',
      '狼人可能悍跳预言家搅乱视听',
    ],
  },
  'day-sheriff-vote': {
    title: '警长投票',
    rules: [
      '未上警的存活玩家投票选警长',
      '候选人不能投票',
      '警长票算1.5票（后续放逐投票时）',
      '平票则警徽流失，本局无警长',
    ],
  },
  'day-announce': {
    title: '天亮公布',
    rules: [
      '公布昨夜死亡情况',
      '死者可发表遗言（被刀/被放逐有遗言，被毒/被猎人带走无遗言）',
      '若首夜，公布后进行警长竞选',
    ],
  },
  'day-lastwords': {
    title: '临终遗言',
    rules: [
      '被刀/被放逐的玩家可发表遗言',
      '被女巫毒杀、被猎人开枪带走的玩家无遗言',
      '遗言是重要线索，好人据此分析',
    ],
  },
  'day-self-destruct': {
    title: '白狼王自爆',
    rules: [
      '白狼王白天可发动自爆技能',
      '自爆带走一名玩家后立即进入黑夜',
      '自爆者死亡，被带走者也无遗言',
      '若自爆者为警长，警徽需移交或撕毁',
    ],
  },
  'day-result': {
    title: '投票结果',
    rules: [
      '公布投票结果，得票最高者出局',
      '平票进入PK环节',
      '出局玩家可发表遗言',
    ],
  },
  'day-discuss': {
    title: '白天讨论',
    rules: [
      '从警长右边开始依次发言（无警长则随机起）',
      '每人发言一次，结束后进入投票',
      '白狼王白天可点顶部"自爆"按钮发动技能',
      '发言可标记金水/查杀/怀疑（待实现）',
    ],
    tips: [
      '预言家应跳身份报警徽流',
      '狼人会伪装身份搅乱视听',
    ],
  },
  'day-vote': {
    title: '投票放逐',
    rules: [
      '所有存活玩家投票，得票最多者出局',
      '警长票算1.5票',
      '30秒未投票自动弃票',
      '平票进入PK环节（两人重新发言+投票）',
      'PK再平票则无人出局',
    ],
  },
  'hunter-shoot': {
    title: '猎人开枪',
    rules: [
      '猎人死亡时（被狼刀/被投票）可开枪带走一人',
      '被女巫毒杀则无法开枪（封枪）',
      '开枪带走的玩家无遗言',
    ],
  },
  'sheriff-transfer': {
    title: '警徽移交',
    rules: [
      '警长死亡时需移交警徽',
      '移交：继承1.5票权 + 决定发言顺序',
      '撕毁：本局无警长',
      '警徽也可在自爆时被吞（白狼王自爆）',
    ],
  },
  'game-over': {
    title: '游戏结束',
    rules: [
      '屠边规则：狼人杀光所有神职或所有平民即胜',
      '屠城规则：狼人杀光所有好人即胜',
      '好人胜利条件：所有狼人（含白狼王）出局',
    ],
  },
}

// ============================================================================
// 阶段元数据：顶部展示用的图标 + 文案
// ============================================================================
const PHASE_META: Record<GamePhase, { label: string; icon: typeof Moon }> = {
  'role-reveal': { label: '身份确认', icon: ScrollText },
  'night-start': { label: '黑夜降临', icon: Moon },
  'night-guard': { label: '守卫行动', icon: Moon },
  'night-wolf': { label: '狼人行动', icon: Moon },
  'night-witch': { label: '女巫行动', icon: Moon },
  'night-seer': { label: '预言家行动', icon: Moon },
  'night-end': { label: '夜间结算', icon: Moon },
  'day-sheriff-announce': { label: '警长竞选', icon: Crown },
  'day-sheriff-campaign': { label: '警上发言', icon: Crown },
  'day-sheriff-vote': { label: '警长投票', icon: Crown },
  'day-announce': { label: '天亮公布', icon: Sun },
  'day-lastwords': { label: '临终遗言', icon: Sun },
  'day-discuss': { label: '白天讨论', icon: Sun },
  'day-self-destruct': { label: '白狼王自爆', icon: Sun },
  'day-vote': { label: '放逐投票', icon: Sun },
  'day-result': { label: '投票结果', icon: Sun },
  'hunter-shoot': { label: '猎人开枪', icon: Sun },
  'sheriff-transfer': { label: '警徽移交', icon: Crown },
  'game-over': { label: '游戏结束', icon: Sun },
}

function isNightPhase(p: GamePhase): boolean {
  return p.startsWith('night-')
}

// ============================================================================
// 主组件
// ============================================================================
export function RuleSheet() {
  const phase = useWerewolfStore((s) => s.phase)
  const day = useWerewolfStore((s) => s.day)

  // 优先取当前 phase 的规则；fallback 到 night-start 通用说明
  const rule: RuleEntry = useMemo(() => {
    return RULES[phase] ?? RULES['night-start'] ?? {
      title: '游戏规则',
      rules: ['请根据当前阶段操作'],
    }
  }, [phase])

  const meta = PHASE_META[phase] ?? { label: '游戏', icon: Sun }
  const PhaseIcon = meta.icon
  const isNight = isNightPhase(phase)

  return (
    <Sheet>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label="查看规则"
          className={cn(
            'inline-flex items-center justify-center',
            'w-9 h-9 rounded-full',
            'glass-card border border-amber-300/25',
            'text-amber-200 hover:text-amber-100',
            'hover:border-amber-300/50 hover:bg-amber-400/10',
            'active:scale-95 transition-all',
            'shadow-md shadow-black/20',
          )}
        >
          <BookOpen className="w-4 h-4" />
        </button>
      </SheetTrigger>

      <SheetContent
        side="right"
        className={cn(
          'w-[88%] sm:w-[420px] p-0',
          'glass-card-strong border-l border-amber-300/20',
          'bg-[oklch(0.22_0.05_280/85%)]',
        )}
      >
        {/* 顶部阶段头 */}
        <div
          className={cn(
            'px-4 pt-4 pb-3',
            'border-b border-amber-300/15',
            'bg-gradient-to-br',
            isNight
              ? 'from-violet-900/40 to-indigo-900/30'
              : 'from-amber-900/30 to-rose-900/20',
          )}
        >
          <SheetHeader className="p-0 gap-1.5">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'inline-flex items-center justify-center w-8 h-8 rounded-lg',
                  'bg-white/5 border border-white/10',
                  isNight ? 'text-violet-200' : 'text-amber-200',
                )}
              >
                <PhaseIcon className="w-4 h-4" />
              </span>
              <div className="flex flex-col">
                <span className="text-[11px] text-amber-200/60 leading-tight">
                  第 {day} 天 · {isNight ? '黑夜' : '白天'}
                </span>
                <SheetTitle className="text-base font-semibold text-amber-100 leading-tight">
                  {rule.title}
                </SheetTitle>
              </div>
            </div>
          </SheetHeader>
        </div>

        {/* 规则正文 */}
        <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-4 space-y-4">
          {/* 规则列表 */}
          <section>
            <h4 className="flex items-center gap-1.5 text-xs font-semibold text-amber-200/80 mb-2 uppercase tracking-wider">
              <Check className="w-3.5 h-3.5 text-emerald-300" />
              规则要点
            </h4>
            <ul className="space-y-2">
              {rule.rules.map((r, i) => (
                <li
                  key={i}
                  className={cn(
                    'flex items-start gap-2 text-[13px] leading-relaxed',
                    'text-amber-100/85',
                  )}
                >
                  <span
                    className={cn(
                      'shrink-0 mt-1 w-1.5 h-1.5 rounded-full',
                      'bg-gradient-to-br from-amber-300 to-amber-500',
                    )}
                  />
                  <span className="flex-1">{r}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* 提示列表（可选） */}
          {rule.tips && rule.tips.length > 0 && (
            <section>
              <h4 className="flex items-center gap-1.5 text-xs font-semibold text-violet-200/80 mb-2 uppercase tracking-wider">
                <Lightbulb className="w-3.5 h-3.5 text-violet-300" />
                小提示
              </h4>
              <ul className="space-y-2">
                {rule.tips.map((t, i) => (
                  <li
                    key={i}
                    className={cn(
                      'flex items-start gap-2 text-[13px] leading-relaxed',
                      'text-violet-100/85',
                      'px-2.5 py-2 rounded-lg',
                      'bg-violet-500/8 border border-violet-400/15',
                    )}
                  >
                    <span className="shrink-0">💡</span>
                    <span className="flex-1">{t}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* 通用玩法摘要（永远展示，新手友好） */}
          <section className="pt-2 border-t border-white/5">
            <h4 className="flex items-center gap-1.5 text-xs font-semibold text-amber-200/60 mb-2 uppercase tracking-wider">
              <BookOpen className="w-3.5 h-3.5" />
              通用流程
            </h4>
            <p className="text-[12px] leading-relaxed text-amber-100/65">
              黑夜：守卫→狼人→预言家→女巫依次行动，结算后公布死讯。
              白天：竞选警长→依次发言→投票放逐，循环直至一方达成胜利条件。
            </p>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  )
}

export default RuleSheet
