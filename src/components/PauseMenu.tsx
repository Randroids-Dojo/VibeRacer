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
  onStats: () => void
  onAchievements: () => void
  // Lifetime unlocks count and total. Drives the "x/y" badge on the
  // Achievements button so the player sees their progress at a glance from
  // the menu without opening the pane.
  achievementCount: number
  achievementTotal: number
  onSettings: () => void
  onTuning: () => void
  onHowToPlay: () => void
  onPhotoMode: () => void
  onShare: () => void
  shareLabel?: string
  // Friend challenge entry. Renders only when the player has a submitted PB
  // ghost on this (slug, version) so the link points at a real recorded lap.
  // The handler builds the challenge URL and routes through the same Web
  // Share / clipboard flow as the regular share button.
  onChallenge?: () => void
  // True when a submitted PB exists locally so the button can be enabled and
  // a brief explanatory hint can describe what will happen on click.
  challengeAvailable?: boolean
  challengeLabel?: string
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
  onStats,
  onAchievements,
  achievementCount,
  achievementTotal,
  onSettings,
  onTuning,
  onHowToPlay,
  onPhotoMode,
  onShare,
  shareLabel,
  onChallenge,
  challengeAvailable,
  challengeLabel,
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
        <MenuButton onClick={onStats}>Stats</MenuButton>
        <MenuButton onClick={onAchievements}>
          Achievements ({achievementCount}/{achievementTotal})
        </MenuButton>
        <MenuButton onClick={onTuning}>Setup</MenuButton>
        <MenuButton onClick={onSettings}>Settings</MenuButton>
        <MenuButton onClick={onHowToPlay}>How to play</MenuButton>
        <MenuButton onClick={onPhotoMode}>Photo mode</MenuButton>
        <MenuButton onClick={onShare}>{shareLabel ?? 'Share track'}</MenuButton>
        {onChallenge ? (
          <MenuButton
            onClick={onChallenge}
            disabled={!challengeAvailable}
            title={
              challengeAvailable
                ? 'Send a friend a link that races them against your PB ghost.'
                : 'Set a personal best on this track first to unlock challenges.'
            }
          >
            {challengeLabel ?? 'Challenge a friend'}
          </MenuButton>
        ) : null}
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
