import { describe, it, expect } from 'vitest'
import {
  CHAIN_BONUS,
  DRIFT_ENTER_INTENSITY,
  DRIFT_EXIT_INTENSITY,
  DRIFT_GRACE_MS,
  DRIFT_MIN_SPEED,
  DRIFT_MIN_STEER,
  DRIFT_OFFTRACK_GRACE_MS,
  MAX_MULTIPLIER,
  MULTIPLIER_GROWTH_MS,
  driftIntensity,
  driftMultiplier,
  formatDriftScore,
  initDriftSession,
  stepDriftSession,
  type DriftSessionState,
} from '@/game/drift'

const MAX_SPEED = 26

function step(prev: DriftSessionState, overrides: Partial<{
  intensity: number
  steerSigned: number
  speedAbs: number
  onTrack: boolean
  dtMs: number
}>) {
  return stepDriftSession(prev, {
    intensity: overrides.intensity ?? 0,
    steerSigned: overrides.steerSigned ?? 0,
    speedAbs: overrides.speedAbs ?? 20,
    onTrack: overrides.onTrack ?? true,
    dtMs: overrides.dtMs ?? 16,
  })
}

describe('driftIntensity', () => {
  it('returns 0 when below the speed floor', () => {
    expect(driftIntensity(DRIFT_MIN_SPEED - 0.1, MAX_SPEED, 0.5)).toBe(0)
    expect(driftIntensity(0, MAX_SPEED, 1)).toBe(0)
  })

  it('returns 0 when below the steering floor', () => {
    expect(driftIntensity(20, MAX_SPEED, DRIFT_MIN_STEER - 0.01)).toBe(0)
    expect(driftIntensity(20, MAX_SPEED, 0)).toBe(0)
  })

  it('returns 0 when maxSpeed is non-positive', () => {
    expect(driftIntensity(20, 0, 0.6)).toBe(0)
    expect(driftIntensity(20, -1, 0.6)).toBe(0)
  })

  it('grows with both steer and speed ratio and clamps to 1', () => {
    const low = driftIntensity(10, MAX_SPEED, 0.4)
    const mid = driftIntensity(20, MAX_SPEED, 0.7)
    const high = driftIntensity(MAX_SPEED, MAX_SPEED, 1)
    expect(low).toBeGreaterThan(0)
    expect(mid).toBeGreaterThan(low)
    expect(high).toBeLessThanOrEqual(1)
    // The multiplier (1.6) is intentional: at max steer + max speed the
    // intensity saturates to 1 even though steer * ratio = 1.0 alone.
    expect(high).toBe(1)
  })

  it('handles non-finite speed defensively', () => {
    expect(driftIntensity(Number.NaN, MAX_SPEED, 1)).toBe(0)
    expect(driftIntensity(Number.POSITIVE_INFINITY, MAX_SPEED, 1)).toBeLessThanOrEqual(1)
  })

  it('treats negative steering input the same as positive', () => {
    const right = driftIntensity(20, MAX_SPEED, 0.7)
    const left = driftIntensity(20, MAX_SPEED, -0.7)
    expect(right).toBe(left)
  })
})

describe('driftMultiplier', () => {
  it('starts at 1 with no active time', () => {
    expect(driftMultiplier(0)).toBe(1)
  })

  it('grows linearly toward MAX over MULTIPLIER_GROWTH_MS', () => {
    const half = driftMultiplier(MULTIPLIER_GROWTH_MS / 2)
    const expected = 1 + (MAX_MULTIPLIER - 1) * 0.5
    expect(half).toBeCloseTo(expected, 5)
  })

  it('caps at MAX_MULTIPLIER even past the growth window', () => {
    expect(driftMultiplier(MULTIPLIER_GROWTH_MS)).toBe(MAX_MULTIPLIER)
    expect(driftMultiplier(MULTIPLIER_GROWTH_MS * 10)).toBe(MAX_MULTIPLIER)
  })

  it('returns 1 for non-finite input', () => {
    expect(driftMultiplier(Number.NaN)).toBe(1)
    expect(driftMultiplier(Number.POSITIVE_INFINITY)).toBe(1)
    expect(driftMultiplier(Number.NEGATIVE_INFINITY)).toBe(1)
  })

  it('is monotonically non-decreasing', () => {
    let prev = driftMultiplier(0)
    for (let t = 100; t <= MULTIPLIER_GROWTH_MS + 1000; t += 200) {
      const cur = driftMultiplier(t)
      expect(cur).toBeGreaterThanOrEqual(prev)
      prev = cur
    }
  })
})

describe('stepDriftSession', () => {
  it('stays inactive when intensity is below the enter threshold', () => {
    const init = initDriftSession()
    const r = step(init, { intensity: DRIFT_ENTER_INTENSITY - 0.05 })
    expect(r.state.active).toBe(false)
    expect(r.state.score).toBe(0)
    expect(r.delta).toBe(0)
    expect(r.ended).toBe(false)
  })

  it('activates when intensity crosses the enter threshold', () => {
    const init = initDriftSession()
    const r = step(init, {
      intensity: DRIFT_ENTER_INTENSITY + 0.1,
      steerSigned: 0.7,
      dtMs: 16,
    })
    expect(r.state.active).toBe(true)
    expect(r.state.activeMs).toBe(16)
    expect(r.state.score).toBeGreaterThan(0)
    expect(r.delta).toBeGreaterThan(0)
    expect(r.ended).toBe(false)
  })

  it('does not activate when off-track', () => {
    const init = initDriftSession()
    const r = step(init, {
      intensity: 0.7,
      steerSigned: 0.8,
      onTrack: false,
    })
    expect(r.state.active).toBe(false)
    expect(r.state.score).toBe(0)
  })

  it('accumulates score across many active frames with growing multiplier', () => {
    let s = initDriftSession()
    let lastDelta = 0
    for (let i = 0; i < 200; i++) {
      const r = step(s, {
        intensity: 0.7,
        steerSigned: 0.7,
        dtMs: 16,
      })
      s = r.state
      if (i === 0) lastDelta = r.delta
      else if (i === 199) {
        // Multiplier has grown, so the late frame's delta should be larger
        // even with identical intensity.
        expect(r.delta).toBeGreaterThan(lastDelta)
      }
    }
    expect(s.active).toBe(true)
    expect(s.score).toBeGreaterThan(0)
    expect(s.activeMs).toBeCloseTo(200 * 16, 0)
  })

  it('enters grace window when intensity drops below exit but holds active', () => {
    let s = initDriftSession()
    s = step(s, { intensity: 0.7, steerSigned: 0.7, dtMs: 16 }).state
    expect(s.active).toBe(true)
    // Intensity drops below exit, still inside grace.
    const r = step(s, {
      intensity: DRIFT_EXIT_INTENSITY - 0.05,
      dtMs: 100,
    })
    expect(r.state.active).toBe(true)
    expect(r.state.belowSinceMs).toBe(100)
    expect(r.delta).toBe(0)
    expect(r.ended).toBe(false)
  })

  it('continues the same session if intensity returns within grace', () => {
    let s = initDriftSession()
    s = step(s, { intensity: 0.7, steerSigned: 0.7, dtMs: 100 }).state
    const scoreBeforeDip = s.score
    const activeMsBeforeDip = s.activeMs
    s = step(s, { intensity: 0, dtMs: 200 }).state
    expect(s.active).toBe(true)
    // Re-engage. activeMs should accumulate forward (not reset).
    const r = step(s, { intensity: 0.7, steerSigned: 0.7, dtMs: 100 })
    expect(r.state.active).toBe(true)
    expect(r.state.activeMs).toBeGreaterThan(activeMsBeforeDip)
    expect(r.state.score).toBeGreaterThan(scoreBeforeDip)
    expect(r.state.belowSinceMs).toBe(0)
  })

  it('ends the session after the grace window expires', () => {
    let s = initDriftSession()
    s = step(s, { intensity: 0.7, steerSigned: 0.7, dtMs: 100 }).state
    expect(s.active).toBe(true)
    const r = step(s, { intensity: 0, dtMs: DRIFT_GRACE_MS + 50 })
    expect(r.ended).toBe(true)
    expect(r.state.active).toBe(false)
    expect(r.state.score).toBe(0)
    expect(r.state.activeMs).toBe(0)
  })

  it('ends after off-track grace expires even while still drifting', () => {
    let s = initDriftSession()
    s = step(s, { intensity: 0.7, steerSigned: 0.7, dtMs: 100 }).state
    // Off-track for longer than the grace window with intensity still high.
    const r = step(s, {
      intensity: 0.7,
      steerSigned: 0.7,
      onTrack: false,
      dtMs: DRIFT_OFFTRACK_GRACE_MS + 50,
    })
    expect(r.ended).toBe(true)
    expect(r.state.active).toBe(false)
  })

  it('forgives brief off-track excursions inside the grace window', () => {
    let s = initDriftSession()
    s = step(s, { intensity: 0.7, steerSigned: 0.7, dtMs: 100 }).state
    const offFrame = step(s, {
      intensity: 0.7,
      steerSigned: 0.7,
      onTrack: false,
      dtMs: 100,
    })
    expect(offFrame.ended).toBe(false)
    expect(offFrame.state.active).toBe(true)
    // Back on track resets the off-track timer.
    const onFrame = step(offFrame.state, {
      intensity: 0.7,
      steerSigned: 0.7,
      onTrack: true,
      dtMs: 16,
    })
    expect(onFrame.state.offTrackMs).toBe(0)
  })

  it('awards a chain bonus on a direction flip during an active drift', () => {
    let s = initDriftSession()
    s = step(s, { intensity: 0.7, steerSigned: 0.7, dtMs: 16 }).state
    const before = s.score
    const r = step(s, { intensity: 0.7, steerSigned: -0.7, dtMs: 16 })
    expect(r.state.chains).toBe(1)
    // The flip awards a flat CHAIN_BONUS plus the per-frame delta.
    expect(r.state.score).toBeGreaterThan(before + CHAIN_BONUS - 0.5)
  })

  it('does not award a chain bonus when the steer goes to neutral', () => {
    let s = initDriftSession()
    s = step(s, { intensity: 0.7, steerSigned: 0.7, dtMs: 16 }).state
    const r = step(s, { intensity: 0.7, steerSigned: 0, dtMs: 16 })
    expect(r.state.chains).toBe(0)
  })

  it('returns a fresh state when ending a session', () => {
    let s = initDriftSession()
    s = step(s, { intensity: 0.7, steerSigned: 0.7, dtMs: 100 }).state
    const r = step(s, { intensity: 0, dtMs: DRIFT_GRACE_MS + 50 })
    expect(r.state).toEqual(initDriftSession())
  })

  it('handles non-finite dtMs defensively', () => {
    const init = initDriftSession()
    const r = step(init, {
      intensity: 0.7,
      steerSigned: 0.7,
      dtMs: Number.NaN,
    })
    expect(Number.isFinite(r.state.score)).toBe(true)
  })
})

describe('formatDriftScore', () => {
  it('formats a zero score as 0', () => {
    expect(formatDriftScore(0)).toBe('0')
    expect(formatDriftScore(-1)).toBe('0')
  })

  it('rounds positive scores to integers', () => {
    expect(formatDriftScore(42.4)).toBe('42')
    expect(formatDriftScore(42.6)).toBe('43')
    expect(formatDriftScore(1234.5)).toBe('1235')
  })

  it('handles non-finite input defensively', () => {
    expect(formatDriftScore(Number.NaN)).toBe('0')
    expect(formatDriftScore(Number.POSITIVE_INFINITY)).toBe('0')
  })
})
