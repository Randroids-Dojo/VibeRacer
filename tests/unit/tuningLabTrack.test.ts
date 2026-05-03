import { describe, expect, it } from 'vitest'
import { TUNING_LAB_TRACK_PIECES } from '@/lib/tuningLabTrack'
import { validateClosedLoop } from '@/game/track'
import { buildTrackPath } from '@/game/trackPath'
import { initGameState, startRace, tick } from '@/game/tick'
import { DEFAULT_CAR_PARAMS } from '@/game/physics'
import type { PieceType } from '@/lib/schemas'

describe('TUNING_LAB_TRACK_PIECES', () => {
  it('forms a valid closed loop', () => {
    const result = validateClosedLoop(TUNING_LAB_TRACK_PIECES)
    expect(result.ok).toBe(true)
  })

  it('has 8 to 16 pieces', () => {
    const n = TUNING_LAB_TRACK_PIECES.length
    expect(n).toBeGreaterThanOrEqual(8)
    expect(n).toBeLessThanOrEqual(16)
  })

  it('has the required piece-type mix', () => {
    const counts: Record<PieceType, number> = {
      straight: 0,
      left90: 0,
      right90: 0,
      scurve: 0,
      scurveLeft: 0,
      sweepRight: 0,
      sweepLeft: 0,
      megaSweepRight: 0,
      megaSweepLeft: 0,
      hairpin: 0,
      arc45: 0,
      diagonal: 0,
    }
    for (const p of TUNING_LAB_TRACK_PIECES) counts[p.type] += 1
    expect(counts.straight).toBeGreaterThanOrEqual(4)
    expect(counts.left90).toBeGreaterThanOrEqual(1)
    expect(counts.right90).toBeGreaterThanOrEqual(2)
  })

  it('contains an S-curve (right then left, or left then right, separated by exactly one straight)', () => {
    const path = buildTrackPath(TUNING_LAB_TRACK_PIECES)
    const types = path.order.map((o) => o.piece.type)
    let found = false
    for (let i = 0; i < types.length - 2; i++) {
      const a = types[i]
      const b = types[i + 1]
      const c = types[i + 2]
      if (
        b === 'straight' &&
        ((a === 'right90' && c === 'left90') ||
          (a === 'left90' && c === 'right90'))
      ) {
        found = true
        break
      }
    }
    expect(found).toBe(true)
  })

  it('starts on a straight so the spawn lands cleanly', () => {
    const path = buildTrackPath(TUNING_LAB_TRACK_PIECES)
    expect(path.order[0].piece.type).toBe('straight')
  })

  it('order length matches piece count (no broken walk)', () => {
    const path = buildTrackPath(TUNING_LAB_TRACK_PIECES)
    expect(path.order.length).toBe(TUNING_LAB_TRACK_PIECES.length)
  })

  it('completes a lap within 60 seconds at full throttle (centerline auto-pilot)', () => {
    // Drive an idealized centerline path: at each tick, point the car at the
    // exit of the current piece. This is not a physics-faithful smoke; the
    // goal is to assert the lap-detection wiring fires for this loop, which
    // only happens if every cell transition is valid.
    const path = buildTrackPath(TUNING_LAB_TRACK_PIECES)
    let state = initGameState(path)
    state = startRace(state, 0)

    let now = 0
    let lapFired = false
    const dtMs = 16
    const maxMs = 60_000
    while (now < maxMs) {
      // Find current cell's order index.
      const cellOrderIdx = pickOrderIdx(path, state.x, state.z)
      const target = path.order[(cellOrderIdx + 1) % path.order.length].entry
      const dx = target.x - state.x
      const dz = target.z - state.z
      const desiredHeading = Math.atan2(-dz, dx)
      const headingErr = wrapAngle(desiredHeading - state.heading)
      const steer = Math.max(-1, Math.min(1, headingErr * 4))
      const result = tick(
        state,
        { throttle: 1, steer, handbrake: false },
        dtMs,
        now,
        path,
        DEFAULT_CAR_PARAMS,
      )
      state = result.state
      if (result.lapComplete) {
        lapFired = true
        break
      }
      now += dtMs
    }
    expect(lapFired).toBe(true)
  })
})

function pickOrderIdx(
  path: ReturnType<typeof buildTrackPath>,
  x: number,
  z: number,
): number {
  let bestIdx = 0
  let bestDist = Infinity
  for (let i = 0; i < path.order.length; i++) {
    const c = path.order[i].center
    const d = (c.x - x) ** 2 + (c.z - z) ** 2
    if (d < bestDist) {
      bestDist = d
      bestIdx = i
    }
  }
  return bestIdx
}

function wrapAngle(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI
  while (a < -Math.PI) a += 2 * Math.PI
  return a
}
