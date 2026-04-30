'use client'

import {
  MenuButton,
  MenuHeader,
  MenuHint,
  MenuOverlay,
  MenuPanel,
  MenuSection,
} from './MenuUI'

interface RacePaneProps {
  onBack: () => void
  onLeaderboards?: () => void
  onLapHistory?: () => void
  lapCount?: number
  onPbHistory?: () => void
  pbHistoryCount?: number
  onStats?: () => void
  onAchievements?: () => void
  achievementCount?: number
  achievementTotal?: number
  onHowToPlay?: () => void
  onPhotoMode?: () => void
  onShare?: () => void
  shareLabel?: string
  onChallenge?: () => void
  challengeAvailable?: boolean
  challengeLabel?: string
  onToggleFavorite?: () => void
  isFavorite?: boolean
}

export function RacePane({
  onBack,
  onLeaderboards,
  onLapHistory,
  lapCount = 0,
  onPbHistory,
  pbHistoryCount,
  onStats,
  onAchievements,
  achievementCount = 0,
  achievementTotal = 0,
  onHowToPlay,
  onPhotoMode,
  onShare,
  shareLabel,
  onChallenge,
  challengeAvailable,
  challengeLabel,
  onToggleFavorite,
  isFavorite,
}: RacePaneProps) {
  return (
    <MenuOverlay zIndex={100}>
      <MenuPanel width="wide">
        <MenuHeader title="RACE" onClose={onBack} />

        <MenuSection title="Progress">
          <MenuHint>
            Lap data, leaderboard position, and milestones for this track.
          </MenuHint>
          <div style={actionGrid}>
            {onLeaderboards ? (
              <MenuButton onClick={onLeaderboards}>Leaderboards</MenuButton>
            ) : null}
            {onLapHistory ? (
              <MenuButton onClick={onLapHistory}>
                {lapCount > 0 ? `Laps (${lapCount})` : 'Laps'}
              </MenuButton>
            ) : null}
            {onPbHistory ? (
              <MenuButton
                onClick={onPbHistory}
                title="Every personal best you have set on this layout."
              >
                {pbHistoryCount && pbHistoryCount > 0
                  ? `PB History (${pbHistoryCount})`
                  : 'PB History'}
              </MenuButton>
            ) : null}
            {onStats ? <MenuButton onClick={onStats}>Stats</MenuButton> : null}
            {onAchievements ? (
              <MenuButton onClick={onAchievements}>
                Achievements ({achievementCount}/{achievementTotal})
              </MenuButton>
            ) : null}
          </div>
        </MenuSection>

        <MenuSection title="Track tools">
          <div style={actionGrid}>
            {onHowToPlay ? (
              <MenuButton onClick={onHowToPlay}>How to play</MenuButton>
            ) : null}
            {onPhotoMode ? (
              <MenuButton onClick={onPhotoMode}>Photo mode</MenuButton>
            ) : null}
            {onShare ? (
              <MenuButton onClick={onShare}>
                {shareLabel ?? 'Share track'}
              </MenuButton>
            ) : null}
            {onToggleFavorite ? (
              <MenuButton
                onClick={onToggleFavorite}
                title={
                  isFavorite
                    ? 'Remove from your home-page favorites.'
                    : 'Pin to your home-page favorites.'
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
                    ? 'Share a link that races a friend against your PB ghost.'
                    : 'Set a personal best first to unlock challenges.'
                }
              >
                {challengeLabel ?? 'Challenge a friend'}
              </MenuButton>
            ) : null}
          </div>
        </MenuSection>
      </MenuPanel>
    </MenuOverlay>
  )
}

const actionGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
  gap: 8,
}
