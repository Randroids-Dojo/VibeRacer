'use client'
import { useEffect, useRef, useState } from 'react'
import { playCountdownBeep } from '@/game/music'

// NHRA-style staggered countdown tree. The lamp sequence reads top to
// bottom: pre-stage (white), stage (white), three amber bulbs, then a
// green bulb that fires the GO beep. The green bulb is pinned to the
// exact moment DragRace flips its race phase to 'racing' so a player
// pressing throttle the instant they see green is not falsely fouled.
// A foul flag pinned below shows the instant a pre-GO throttle press
// flips state.fouled in the rAF loop.

// Total window in ms. Must match DragRace.startCountdown's `totalMs`.
// Exposed so a future refactor that wires the countdown component into
// the parent's setTimeout cannot diverge silently.
export const DRAG_COUNTDOWN_TOTAL_MS = 2400

interface DragChristmasTreeProps {
  // Single-shot timestamp captured by the parent when the countdown
  // begins. Passed down so a parent re-render does not reset the
  // elapsed-since-start lamp progression.
  startedAt: number
  // Mirrored from stateRef.current.fouled in DragRace at low frequency.
  // When true, the JUMP-START label appears under the tree.
  fouled: boolean
}

interface Lamp {
  // Color when lit. Pre-stage and stage lamps are warm white so the
  // amber rung reads as the actual "go soon" cue.
  color: string
  // Color when not lit. Slightly translucent so the lamps read as glass
  // bulbs in a housing rather than as flat circles on black.
  unlitColor: string
  // Milliseconds since the countdown started at which this lamp lights.
  litAt: number
  // Whether this lamp triggers playCountdownBeep on lighting. The GO
  // bulb passes `true` for the high-pitched go beep; the ambers pass
  // `false` for the standard tick. Pre-stage and stage are silent.
  beepOnLight: boolean | null
  // Pass through to playCountdownBeep when beepOnLight !== null.
  isGo: boolean
}

// Green is pinned to DRAG_COUNTDOWN_TOTAL_MS so the lamp lights at the
// same moment the parent flips into the racing phase. Earlier lamps are
// stepped backwards from green at 400ms cadence.
const LAMPS: Lamp[] = [
  { color: '#f4f4f4', unlitColor: 'rgba(255,255,255,0.08)', litAt: DRAG_COUNTDOWN_TOTAL_MS - 2400, beepOnLight: null, isGo: false },
  { color: '#f4f4f4', unlitColor: 'rgba(255,255,255,0.08)', litAt: DRAG_COUNTDOWN_TOTAL_MS - 2000, beepOnLight: null, isGo: false },
  { color: '#facc15', unlitColor: 'rgba(250,204,21,0.1)', litAt: DRAG_COUNTDOWN_TOTAL_MS - 1600, beepOnLight: false, isGo: false },
  { color: '#facc15', unlitColor: 'rgba(250,204,21,0.1)', litAt: DRAG_COUNTDOWN_TOTAL_MS - 1200, beepOnLight: false, isGo: false },
  { color: '#facc15', unlitColor: 'rgba(250,204,21,0.1)', litAt: DRAG_COUNTDOWN_TOTAL_MS - 800, beepOnLight: false, isGo: false },
  { color: '#22c55e', unlitColor: 'rgba(34,197,94,0.1)', litAt: DRAG_COUNTDOWN_TOTAL_MS, beepOnLight: true, isGo: true },
]

const LAMP_LABELS = ['Pre-stage', 'Stage', 'Amber', 'Amber', 'Amber', 'GO'] as const

export function DragChristmasTree({ startedAt, fouled }: DragChristmasTreeProps) {
  // Drives the per-frame "is this lamp lit" calculation. We poll at 16ms
  // so the lamps light within one animation frame of their litAt offset
  // without burning a rAF loop.
  const [, force] = useState(0)
  // Tracks which lamps have already triggered their beep so the polling
  // loop does not re-fire the SFX every frame after the lamp is lit.
  const beepedRef = useRef<Set<number>>(new Set())

  useEffect(() => {
    beepedRef.current.clear()
    const id = window.setInterval(() => force((n) => n + 1), 16)
    return () => window.clearInterval(id)
  }, [startedAt])

  const elapsed = performance.now() - startedAt
  for (let i = 0; i < LAMPS.length; i++) {
    const lamp = LAMPS[i]
    if (
      lamp.beepOnLight !== null &&
      elapsed >= lamp.litAt &&
      !beepedRef.current.has(i)
    ) {
      beepedRef.current.add(i)
      try {
        playCountdownBeep(lamp.isGo)
      } catch {
        // Audio context may be suspended; the lamps still light, the
        // race start is still correct, so swallow.
      }
    }
  }

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 10,
          padding: '20px 22px',
          borderRadius: 12,
          background: '#161616',
          border: '1px solid #2a2a2a',
          boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        {LAMPS.map((lamp, i) => {
          const lit = elapsed >= lamp.litAt
          return (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: '50%',
                  background: lit ? lamp.color : lamp.unlitColor,
                  boxShadow: lit
                    ? `0 0 28px 4px ${lamp.color}, inset 0 4px 10px rgba(255,255,255,0.25), inset 0 -4px 10px rgba(0,0,0,0.4)`
                    : 'inset 0 4px 10px rgba(0,0,0,0.6)',
                  transition: 'background 80ms linear, box-shadow 80ms linear',
                }}
              />
              <span
                style={{
                  width: 80,
                  color: lit ? '#fff' : '#666',
                  fontSize: 12,
                  letterSpacing: 1,
                  textTransform: 'uppercase',
                }}
              >
                {LAMP_LABELS[i]}
              </span>
            </div>
          )
        })}
      </div>

      {fouled && (
        <div
          style={{
            position: 'absolute',
            bottom: '15%',
            background: 'rgba(220,38,38,0.16)',
            color: '#fda4a4',
            border: '1px solid rgba(220,38,38,0.55)',
            padding: '8px 16px',
            borderRadius: 999,
            fontWeight: 700,
            letterSpacing: 1.2,
            fontSize: 12,
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          JUMP-START. Acceleration dampened.
        </div>
      )}
    </div>
  )
}
