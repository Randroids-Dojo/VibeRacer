'use client'

import { MenuButton, MenuOverlay, MenuPanel, MenuTitle } from './MenuUI'

interface PauseMenuProps {
  onResume: () => void
  onRestart: () => void
  onEditTrack: () => void
  onLeaderboards: () => void
  onSettings: () => void
  onTuning: () => void
  onExit: () => void
}

export function PauseMenu({
  onResume,
  onRestart,
  onEditTrack,
  onLeaderboards,
  onSettings,
  onTuning,
  onExit,
}: PauseMenuProps) {
  return (
    <MenuOverlay zIndex={100}>
      <MenuPanel>
        <MenuTitle>PAUSED</MenuTitle>
        <MenuButton variant="primary" click="confirm" onClick={onResume}>
          Resume
        </MenuButton>
        <MenuButton click="confirm" onClick={onRestart}>
          Restart
        </MenuButton>
        <MenuButton onClick={onEditTrack}>Edit Track</MenuButton>
        <MenuButton onClick={onLeaderboards}>Leaderboards</MenuButton>
        <MenuButton onClick={onTuning}>Setup</MenuButton>
        <MenuButton onClick={onSettings}>Settings</MenuButton>
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
