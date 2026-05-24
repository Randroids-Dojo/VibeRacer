'use client'

import type { Piece } from '@/lib/schemas'
import {
  MenuShellAction,
  MenuStageOverlay,
  MenuStartButton,
  menuTheme,
} from './MenuUI'
import { TrackDifficultyBadge } from './TrackDifficultyBadge'

interface PauseMenuProps {
  onResume: () => void
  onRestart: () => void
  // Restart only the current lap. Preserves session PB, lap count, and lap
  // history; abandons the in-flight checkpoint progress and resets the lap
  // timer. Renders only when the player has a lap in progress (no point
  // restarting an empty lap on the first frame). Omit when the host mode
  // does not support mid-lap reset (e.g. World Tour races).
  onRestartLap?: () => void
  // Free Race only. Omit in modes whose track is fixed (World Tour).
  onEditTrack?: () => void
  // Opens the Race sub-pane (leaderboards, lap history, etc.). Omit in
  // modes that do not host those panes (World Tour).
  onRace?: () => void
  onSettings?: () => void
  // Direct shortcut to the Tuning Lab at /tune. The host owns the
  // leave-race confirm prompt so this stays presentational.
  onTuningLab?: () => void
  // Re-open the pre-race setup picker. Restarts the current race from the
  // countdown so the freshly-picked setup is in effect for a clean lap.
  onChangeSetup?: () => void
  // Short label describing the active track-author mood (e.g. "Sunset, Foggy")
  // when the player is racing under a baked-in author mood. Renders as a
  // small caption above the Esc hint so the player understands why the scene
  // looks different from their own picks. Omit / pass null when no track
  // mood is active.
  trackMoodLabel?: string | null
  // Pieces of the active track. When provided we surface a small difficulty
  // badge under the PAUSED title so the player can see at a glance how
  // technical the layout they are on actually is. Optional so the pause menu
  // stays renderable when the host has no piece info handy (legacy callers).
  pieces?: Piece[] | null
  onExit: () => void
  // Label for the exit row. Defaults to "Exit to title" for Free Race;
  // World Tour overrides to "Exit to garage" since its home is the tour
  // garage, not the title screen.
  exitLabel?: string
}

// In-game pause menu. Hosted inside a MenuStageOverlay so it shares the
// sky-blue + dark-translucent shell with PreRaceSetup, the Drag Garage,
// the in-game Settings overlay, and the menu hubs. Resume is the red-pink
// CTA at the top; every other entry is a cream-card MenuShellAction.
export function PauseMenu({
  onResume,
  onRestart,
  onRestartLap,
  onEditTrack,
  onRace,
  onSettings,
  onTuningLab,
  onChangeSetup,
  trackMoodLabel,
  pieces,
  onExit,
  exitLabel = 'Exit to title',
}: PauseMenuProps) {
  const hasPieces = pieces && pieces.length > 0
  return (
    <MenuStageOverlay
      title="PAUSED"
      zIndex={100}
      onBack={onResume}
      width="narrow"
    >
      {hasPieces ? (
        <div style={badgeRowStyle}>
          <TrackDifficultyBadge pieces={pieces!} size="md" />
        </div>
      ) : null}
      <MenuStartButton onClick={onResume}>Resume</MenuStartButton>
      {onRestartLap ? (
        <MenuShellAction click="confirm" onClick={onRestartLap}>
          Restart Lap
        </MenuShellAction>
      ) : null}
      <MenuShellAction click="confirm" onClick={onRestart}>
        Restart
      </MenuShellAction>
      {onRace ? <MenuShellAction onClick={onRace}>Race</MenuShellAction> : null}
      {onEditTrack ? (
        <MenuShellAction onClick={onEditTrack}>Edit Track</MenuShellAction>
      ) : null}
      {onChangeSetup ? (
        <MenuShellAction click="confirm" onClick={onChangeSetup}>
          Change car setup
        </MenuShellAction>
      ) : null}
      {onTuningLab ? (
        <MenuShellAction click="confirm" onClick={onTuningLab}>
          Tuning Lab
        </MenuShellAction>
      ) : null}
      {onSettings ? (
        <MenuShellAction onClick={onSettings}>Settings</MenuShellAction>
      ) : null}
      <MenuShellAction click="back" onClick={onExit} style={exitBtnStyle}>
        {exitLabel}
      </MenuShellAction>
      {trackMoodLabel ? (
        <div
          style={moodStyle}
          title="The track author baked in this mood. Turn off Respect track mood in Settings to use your own picks."
        >
          Track mood: {trackMoodLabel}
        </div>
      ) : null}
      <div style={hintStyle}>Esc / B to resume</div>
    </MenuStageOverlay>
  )
}

const badgeRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
  marginTop: -2,
  marginBottom: 2,
}

// Exit-to-title gets a muted treatment so it doesn't compete with the
// confirm-style actions above it. Same cream-card silhouette, just
// drained of saturation so the visual weight stops at "Settings".
const exitBtnStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.85)',
  color: 'rgba(0,0,0,0.7)',
  boxShadow: '0 4px 0 rgba(0,0,0,0.25)',
}

const moodStyle: React.CSSProperties = {
  fontSize: 11,
  opacity: 0.85,
  textAlign: 'center',
  marginTop: 6,
  padding: '6px 10px',
  border: `1px solid ${menuTheme.pageBg}`,
  borderRadius: 6,
  background: 'rgba(154, 216, 255, 0.18)',
  color: menuTheme.pageBg,
  letterSpacing: 0.6,
}

const hintStyle: React.CSSProperties = {
  fontSize: 11,
  opacity: 0.7,
  textAlign: 'center',
  marginTop: 2,
  letterSpacing: 1.2,
  color: 'white',
}
