'use client'

import { MenuButton, MenuOverlay, MenuPanel, MenuTitle } from './MenuUI'

interface PauseMenuProps {
  onResume: () => void
  onRestart: () => void
  // Restart only the current lap. Preserves session PB, lap count, and lap
  // history; abandons the in-flight checkpoint progress and resets the lap
  // timer. Renders only when the player has a lap in progress (no point
  // restarting an empty lap on the first frame).
  onRestartLap: () => void
  onEditTrack: () => void
  onLeaderboards: () => void
  onLapHistory: () => void
  // Number of laps completed this session. Drives the count badge on the
  // Laps button so the player can see at a glance how many entries are queued.
  lapCount: number
  onSettings: () => void
  onTuning: () => void
  onShare: () => void
  shareLabel?: string
  onExit: () => void
}

export function PauseMenu({
  onResume,
  onRestart,
  onRestartLap,
  onEditTrack,
  onLeaderboards,
  onLapHistory,
  lapCount,
  onSettings,
  onTuning,
  onShare,
  shareLabel,
  onExit,
}: PauseMenuProps) {
  return (
    <MenuOverlay zIndex={100}>
      <MenuPanel>
        <MenuTitle>PAUSED</MenuTitle>
        <MenuButton variant="primary" click="confirm" onClick={onResume}>
          Resume
        </MenuButton>
        <MenuButton click="confirm" onClick={onRestartLap}>
          Restart Lap
        </MenuButton>
        <MenuButton click="confirm" onClick={onRestart}>
          Restart
        </MenuButton>
        <MenuButton onClick={onEditTrack}>Edit Track</MenuButton>
        <MenuButton onClick={onLeaderboards}>Leaderboards</MenuButton>
        <MenuButton onClick={onLapHistory}>
          {lapCount > 0 ? `Laps (${lapCount})` : 'Laps'}
        </MenuButton>
        <MenuButton onClick={onTuning}>Setup</MenuButton>
        <MenuButton onClick={onSettings}>Settings</MenuButton>
        <MenuButton onClick={onShare}>{shareLabel ?? 'Share track'}</MenuButton>
        <MenuButton click="back" onClick={onExit}>
          Exit to title
        </MenuButton>
        <div
          style={{
            fontSize: 11,
            opacity: 0.55,
            textAlign: 'center',
            marginTop: 4,
            letterSpacing: 1.2,
          }}
        >
          Esc to resume
        </div>
      </MenuPanel>
    </MenuOverlay>
  )
}
