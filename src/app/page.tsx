'use client'

import { useWerewolfStore } from '@/lib/werewolf/store'
import { MenuScreen } from '@/components/werewolf/MenuScreen'
import { SetupScreen } from '@/components/werewolf/SetupScreen'
import { RoleRevealScreen } from '@/components/werewolf/RoleRevealScreen'
import { GameScreen } from '@/components/werewolf/GameScreen'
import { ResultScreen } from '@/components/werewolf/ResultScreen'

export default function Home() {
  const view = useWerewolfStore((s) => s.view)

  return (
    <main className="relative min-h-screen w-full overflow-x-hidden">
      {view === 'menu' && <MenuScreen />}
      {view === 'setup' && <SetupScreen />}
      {view === 'role-reveal' && <RoleRevealScreen />}
      {view === 'game' && <GameScreen />}
      {view === 'result' && <ResultScreen />}
    </main>
  )
}
