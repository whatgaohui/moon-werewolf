'use client'

import { useWerewolfStore } from '@/lib/werewolf/store'
import { GAME_CONFIGS } from '@/lib/werewolf/configs'
import { ROLES } from '@/lib/werewolf/roles'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { BookOpen, Moon, Play, Sparkles, ChevronRight, Trophy } from 'lucide-react'
import { StatsDialog } from './StatsDialog'

export function MenuScreen() {
  const goToSetup = useWerewolfStore((s) => s.goToSetup)
  const [showRules, setShowRules] = useState(false)
  const [showStats, setShowStats] = useState(false)

  return (
    <div className="relative min-h-screen w-full flex flex-col items-center starry-bg overflow-hidden">
      {/* 背景图 */}
      <div
        className="absolute inset-0 z-0 bg-cover bg-center opacity-40"
        style={{ backgroundImage: 'url(/werewolf/menu-bg.png)' }}
      />
      <div className="absolute inset-0 z-0 bg-gradient-to-b from-transparent via-background/40 to-background" />

      {/* 内容 */}
      <div className="relative z-10 flex flex-col items-center justify-between min-h-screen w-full px-6 py-10 safe-top safe-bottom">
        {/* 顶部月亮装饰 */}
        <div className="flex flex-col items-center mt-6 animate-fade-in-up">
          <div className="text-7xl animate-moon-glow mb-2">🌙</div>
          <div className="flex gap-2 text-2xl animate-float">
            <span>⭐</span>
            <span className="text-3xl">✨</span>
            <span>⭐</span>
          </div>
        </div>

        {/* 标题 */}
        <div className="flex flex-col items-center text-center animate-fade-in-up" style={{ animationDelay: '0.15s' }}>
          <div className="text-6xl mb-3 animate-float-slow">🐺</div>
          <h1 className="text-5xl font-black tracking-tight text-glow-strong bg-gradient-to-b from-amber-100 via-amber-200 to-amber-400 bg-clip-text text-transparent">
            月夜狼人杀
          </h1>
          <p className="mt-3 text-sm text-amber-100/70 tracking-widest">
            MOONLIGHT WEREWOLF
          </p>
          <div className="mt-4 flex items-center gap-2 px-4 py-1.5 rounded-full glass-card">
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span className="text-xs text-amber-100/80">与AI对手的神秘对决</span>
          </div>
        </div>

        {/* 中间角色预览 */}
        <div className="flex flex-col items-center gap-4 animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
          <div className="flex gap-3 text-4xl">
            {(['seer', 'witch', 'hunter', 'guard'] as const).map((r, i) => (
              <div
                key={r}
                className="w-14 h-14 rounded-2xl glass-card flex items-center justify-center animate-float"
                style={{ animationDelay: `${i * 0.3}s` }}
              >
                <span className="text-2xl">{ROLES[r].emoji}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-amber-100/50">多种神职 · 智斗狼人</p>
        </div>

        {/* 按钮区 */}
        <div className="w-full max-w-sm flex flex-col gap-3 animate-fade-in-up" style={{ animationDelay: '0.45s' }}>
          <Button
            onClick={goToSetup}
            size="lg"
            className="h-16 text-lg font-bold rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 text-amber-950 shadow-lg shadow-amber-500/30 border-2 border-amber-200/40 active:scale-95 transition-all"
          >
            <Play className="w-5 h-5 mr-2 fill-amber-950" />
            开始游戏
          </Button>

          <div className="grid grid-cols-3 gap-2">
            <Button
              variant="outline"
              size="lg"
              onClick={() => setShowRules(true)}
              className="h-14 rounded-2xl glass-card border-amber-200/20 text-amber-100 hover:bg-amber-200/10 active:scale-95 transition-all"
            >
              <BookOpen className="w-4 h-4 mr-1" />
              规则
            </Button>
            <Button
              variant="outline"
              size="lg"
              onClick={goToSetup}
              className="h-14 rounded-2xl glass-card border-amber-200/20 text-amber-100 hover:bg-amber-200/10 active:scale-95 transition-all"
            >
              <ChevronRight className="w-4 h-4 mr-1" />
              配置
            </Button>
            <Button
              variant="outline"
              size="lg"
              onClick={() => setShowStats(true)}
              className="h-14 rounded-2xl glass-card border-amber-200/20 text-amber-100 hover:bg-amber-200/10 active:scale-95 transition-all"
            >
              <Trophy className="w-4 h-4 mr-1" />
              战绩
            </Button>
          </div>

          {/* 套餐预览标签 */}
          <div className="flex flex-wrap justify-center gap-2 mt-2">
            {GAME_CONFIGS.map((c) => (
              <Badge
                key={c.id}
                variant="secondary"
                className="glass-card border-amber-200/15 text-amber-100/70 text-xs"
              >
                {c.name} · {c.playerCount}人
              </Badge>
            ))}
          </div>
        </div>
      </div>

      {/* 规则弹窗 */}
      <Dialog open={showRules} onOpenChange={setShowRules}>
        <DialogContent className="max-w-md max-h-[85vh] glass-card-strong border-amber-200/20">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-100">
              <Moon className="w-5 h-5 text-amber-300" />
              狼人杀游戏规则
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] pr-2">
            <div className="space-y-4 text-sm text-amber-100/80">
              <section>
                <h3 className="font-bold text-amber-200 mb-1.5">🎯 游戏目标</h3>
                <p>好人阵营找出并放逐所有狼人；狼人阵营消灭所有神职或所有平民。</p>
              </section>
              <section>
                <h3 className="font-bold text-amber-200 mb-1.5">🌙 夜晚阶段</h3>
                <ul className="space-y-1 list-disc pl-4">
                  <li><b>守卫</b>：守护一名玩家免受狼人袭击（不可连守）</li>
                  <li><b>狼人</b>：共同选择一名玩家击杀</li>
                  <li><b>预言家</b>：查验一名玩家身份</li>
                  <li><b>女巫</b>：使用解药救人或毒药杀人</li>
                </ul>
              </section>
              <section>
                <h3 className="font-bold text-amber-200 mb-1.5">☀️ 白天阶段</h3>
                <p>第一天白天先竞选警长（上警发言→投票），再公布死讯。死亡玩家依次发言讨论，随后投票放逐一人。</p>
              </section>
              <section>
                <h3 className="font-bold text-amber-200 mb-1.5">🏛️ 警长与遗言</h3>
                <ul className="space-y-1 list-disc pl-4">
                  <li><b>警长</b>：1.5票投票权，决定发言顺序</li>
                  <li><b>遗言</b>：第一天夜里死亡有遗言，被投票出局有遗言</li>
                  <li>后续夜里死亡无遗言</li>
                </ul>
              </section>
              <section>
                <h3 className="font-bold text-amber-200 mb-1.5">⚔️ 特殊角色</h3>
                <ul className="space-y-1 list-disc pl-4">
                  <li><b>猎人</b>：死亡时可开枪带走一人（被毒杀除外）</li>
                  <li><b>白狼王</b>：白天可自爆带走一人并进入黑夜</li>
                  <li><b>骑士</b>：白天可挑战一人，错则殉职</li>
                </ul>
              </section>
              <section>
                <h3 className="font-bold text-amber-200 mb-1.5">🏆 胜负判定</h3>
                <ul className="space-y-1 list-disc pl-4">
                  <li>狼人全灭 → 好人胜</li>
                  <li>狼人≥好人 → 狼人胜</li>
                </ul>
              </section>
              <section>
                <h3 className="font-bold text-amber-200 mb-1.5">🎙️ 语音发言</h3>
                <p>白天讨论时，你可以点击麦克风按钮用语音发言，系统会自动转成文字。</p>
              </section>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* 战绩弹窗 */}
      <StatsDialog open={showStats} onOpenChange={setShowStats} />
    </div>
  )
}
