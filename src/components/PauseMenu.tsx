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
  // Lifetime PB-progression view for this (slug, version). Mounting
  // `onPbHistory` opts the row in; pbHistoryCount drives a small badge that
  // surfaces how many PBs the player has logged here so the entry reads as a
  // long-running record rather than an empty pane.
  onPbHistory?: () => void
  pbHistoryCount?: number
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
  // Favorite (star) toggle. Mounting `onToggleFavorite` opts the row in;
  // omit when the host has no notion of a favorite (e.g. SSR-rendered routes
  // that never gained the storage). `isFavorite` drives the label and a
  // gold star glyph so the row reads as "starred" at a glance.
  onToggleFavorite?: () => void
  isFavorite?: boolean
  // Short label describing the active track-author mood (e.g. "Sunset, Foggy")
  // when the player is racing under a baked-in author mood. Renders as a
  // small caption above the Esc hint so the player understands why the scene
  // looks different from their own picks. Omit / pass null when no track
  // mood is active.
  trackMoodLabel?: string | null
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
  onPbHistory,
  pbHistoryCount,
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
  onToggleFavorite,
  isFavorite,
  trackMoodLabel,
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
        {onPbHistory ? (
          <MenuButton
            onClick={onPbHistory}
            title="See every personal best you have ever set on this version of the layout."
          >
            {pbHistoryCount && pbHistoryCount > 0
              ? `PB History (${pbHistoryCount})`
              : 'PB History'}
          </MenuButton>
        ) : null}
        <MenuButton onClick={onStats}>Stats</MenuButton>
        <MenuButton onClick={onAchievements}>
          Achievements ({achievementCount}/{achievementTotal})
        </MenuButton>
        <MenuButton onClick={onTuning}>Setup</MenuButton>
        <MenuButton onClick={onSettings}>Settings</MenuButton>
        <MenuButton onClick={onHowToPlay}>How to play</MenuButton>
        <MenuButton onClick={onPhotoMode}>Photo mode</MenuButton>
        <MenuButton onClick={onShare}>{shareLabel ?? 'Share track'}</MenuButton>
        {onToggleFavorite ? (
          <MenuButton
            onClick={onToggleFavorite}
            title={
              isFavorite
                ? 'Remove this track from your home-page favorites.'
                : 'Pin this track to a Favorites section on the home page.'
            }
          >
            {isFavorite ? 'Unstar track' : 'Star track'}
          </MenuButton>
        ) : null}
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
        {trackMoodLabel ? (
          <div
            style={{
              fontSize: 11,
              opacity: 0.7,
              textAlign: 'center',
              marginTop: 8,
              padding: '6px 10px',
              border: '1px solid rgba(154, 216, 255, 0.35)',
              borderRadius: 6,
              background: 'rgba(154, 216, 255, 0.08)',
              color: '#9ad8ff',
              letterSpacing: 0.6,
            }}
            title="The track author baked in this mood. Turn off Respect track mood in Settings to use your own picks."
          >
            Track mood: {trackMoodLabel}
          </div>
        ) : null}
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
