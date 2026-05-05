'use client'

import type { Piece } from '@/lib/schemas'
import { MenuButton, MenuOverlay, MenuPanel, MenuTitle } from './MenuUI'
import { TrackDifficultyBadge } from './TrackDifficultyBadge'

interface PauseMenuProps {
  onResume: () => void
  onRestart: () => void
  // Restart only the current lap. Preserves session PB, lap count, and lap
  // history; abandons the in-flight checkpoint progress and resets the lap
  // timer. Renders only when the player has a lap in progress (no point
  // restarting an empty lap on the first frame).
  onRestartLap: () => void
  onEditTrack: () => void
  onRace: () => void
  onSettings: () => void
  // Direct shortcut to the Tuning Lab at /tune. The host owns the
  // leave-race confirm prompt so this stays presentational.
  onTuningLab: () => void
  // Re-open the pre-race setup picker. Restarts the current race from the
  // countdown so the freshly-picked setup is in effect for a clean lap.
  onChangeSetup: () => void
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
}

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
}: PauseMenuProps) {
  return (
    <MenuOverlay zIndex={100} onBack={onResume}>
      <MenuPanel>
        <MenuTitle>PAUSED</MenuTitle>
        {pieces && pieces.length > 0 ? (
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              marginTop: -4,
              marginBottom: 6,
            }}
          >
            <TrackDifficultyBadge pieces={pieces} size="md" />
          </div>
        ) : null}
        <MenuButton variant="primary" click="confirm" onClick={onResume}>
          Resume
        </MenuButton>
        <MenuButton click="confirm" onClick={onRestartLap}>
          Restart Lap
        </MenuButton>
        <MenuButton click="confirm" onClick={onRestart}>
          Restart
        </MenuButton>
        <MenuButton onClick={onRace}>Race</MenuButton>
        <MenuButton onClick={onEditTrack}>Edit Track</MenuButton>
        <MenuButton click="confirm" onClick={onChangeSetup}>
          Change car setup
        </MenuButton>
        <MenuButton click="confirm" onClick={onTuningLab}>
          Tuning Lab
        </MenuButton>
        <MenuButton onClick={onSettings}>Settings</MenuButton>
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
          Esc / B to resume
        </div>
      </MenuPanel>
    </MenuOverlay>
  )
}
