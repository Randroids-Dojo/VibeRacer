import { describe, it, expect } from 'vitest'
import {
  AI_TUNING,
  INITIAL_AI_STATE,
  followDistanceCap,
  launchBlend,
  racingLineOffset,
  targetSpeedAt,
  tickAi,
  type AiCarView,
  type AiCarStats,
  type AiState,
  type AiTrackView,
} from '@/game/worldTourAi'

const FLAT_STRAIGHT: AiTrackView = {
  centerXAt: () => 0,
  curveAt: () => 0,
}

function rightCurve(strength: number): AiTrackView {
  return {
    centerXAt: () => 0,
    curveAt: () => strength,
  }
}

const STATS: AiCarStats = { topSpeed: 40 }

function carAt(over: Partial<AiCarView> = {}): AiCarView {
  return { x: 0, z: 0, heading: 0, speed: 0, ...over }
}

describe('launchBlend', () => {
  it('returns 0 at the start of the lap (full lane hold)', () => {
    expect(launchBlend(0)).toBe(0)
  })

  it('returns 1 past LAUNCH_LANE_HOLD_M (full racing line)', () => {
    expect(launchBlend(AI_TUNING.LAUNCH_LANE_HOLD_M)).toBe(1)
    expect(launchBlend(AI_TUNING.LAUNCH_LANE_HOLD_M + 50)).toBe(1)
  })

  it('blends linearly inside the window', () => {
    const half = AI_TUNING.LAUNCH_LANE_HOLD_M / 2
    expect(launchBlend(half)).toBeCloseTo(0.5)
  })
})

describe('racingLineOffset', () => {
  it('is zero on a straight regardless of blend', () => {
    expect(racingLineOffset(0, 0)).toBe(0)
    expect(racingLineOffset(0, 1)).toBe(0)
  })

  it('is zero during the launch hold (blend = 0)', () => {
    expect(racingLineOffset(1, 0)).toBe(0)
  })

  it('biases toward the inside of the curve when the blend is full', () => {
    const offsetRight = racingLineOffset(1, 1)
    expect(offsetRight).toBeCloseTo(AI_TUNING.MAX_RACING_LINE_OFFSET)
    const offsetLeft = racingLineOffset(-1, 1)
    expect(offsetLeft).toBeCloseTo(-AI_TUNING.MAX_RACING_LINE_OFFSET)
  })
})

describe('targetSpeedAt', () => {
  it('returns the chassis top speed on a flat straight', () => {
    expect(targetSpeedAt(FLAT_STRAIGHT, STATS, 0)).toBe(STATS.topSpeed)
  })

  it('cuts the target speed in a corner', () => {
    const target = targetSpeedAt(rightCurve(0.5), STATS, 0)
    expect(target).toBeLessThan(STATS.topSpeed)
    expect(target).toBeGreaterThan(AI_TUNING.MIN_AI_SPEED)
  })

  it('floors at MIN_AI_SPEED on a brutal corner', () => {
    expect(targetSpeedAt(rightCurve(1), STATS, 0)).toBeGreaterThanOrEqual(
      AI_TUNING.MIN_AI_SPEED,
    )
  })
})

describe('followDistanceCap', () => {
  // The rail-aligned heading convention: 0 = +X (east), PI/2 = -Z
  // (north). All follow-distance scenarios below assume the AI faces
  // PI/2 (north); the leader sits at a negative z (further north).
  const NORTH = Math.PI / 2

  it('returns null when no peer is in the window', () => {
    expect(followDistanceCap(carAt(), [])).toBeNull()
  })

  it('returns the leader speed minus the buffer for a same-lane close peer', () => {
    // AI at origin, facing north. Leader at z = -10 is 10 m ahead in
    // the heading-aligned forward direction.
    const cap = followDistanceCap(carAt({ heading: NORTH }), [
      { x: 0, z: -10, heading: NORTH, speed: 30 },
    ])
    expect(cap).not.toBeNull()
    expect(cap!).toBeCloseTo(30 - AI_TUNING.FOLLOW_SPEED_BUFFER_M_PER_S)
  })

  it('ignores a distant leader past FOLLOW_DISTANCE_METERS', () => {
    const cap = followDistanceCap(carAt({ heading: NORTH }), [
      {
        x: 0,
        z: -(AI_TUNING.FOLLOW_DISTANCE_METERS + 5),
        heading: NORTH,
        speed: 30,
      },
    ])
    expect(cap).toBeNull()
  })

  it('ignores an adjacent-lane leader outside the lane band', () => {
    const cap = followDistanceCap(carAt({ heading: NORTH }), [
      {
        x: AI_TUNING.FOLLOW_LANE_THRESHOLD_METERS + 1,
        z: -10,
        heading: NORTH,
        speed: 30,
      },
    ])
    expect(cap).toBeNull()
  })

  it('ignores a peer behind the AI even at close range', () => {
    const cap = followDistanceCap(carAt({ heading: NORTH }), [
      { x: 0, z: 5, heading: NORTH, speed: 30 },
    ])
    expect(cap).toBeNull()
  })
})

describe('tickAi (launch hold)', () => {
  it('emits zero steer at progress 0 for an off-center car (lane hold dominates)', () => {
    const state: AiState = { ...INITIAL_AI_STATE, progress: 0 }
    const result = tickAi(
      state,
      carAt({ x: 2.5 }),
      STATS,
      rightCurve(0.5),
      { others: [], dt: 0 },
    )
    // Inside the launch hold the lane target is the car's current x, so
    // the lateral error is zero.
    expect(result.input.steer).toBeCloseTo(0)
  })

  it('starts following the racing line once past LAUNCH_LANE_HOLD_M', () => {
    const state: AiState = {
      ...INITIAL_AI_STATE,
      racedDistance: AI_TUNING.LAUNCH_LANE_HOLD_M + 1,
    }
    const result = tickAi(
      state,
      carAt({ x: 0 }),
      STATS,
      rightCurve(0.5),
      { others: [], dt: 0 },
    )
    // Curve points right (+), so the racing-line target is to the right
    // (+x). Positive steer means LEFT in the VibeRacer convention, so the
    // controller must emit a NEGATIVE steer to head toward +x.
    expect(result.input.steer).toBeLessThan(0)
  })
})

describe('tickAi (throttle)', () => {
  it('asks for full throttle on a straight when below the target speed', () => {
    const result = tickAi(
      { ...INITIAL_AI_STATE, progress: 1000, racedDistance: 1000 },
      carAt({ speed: 5 }),
      STATS,
      FLAT_STRAIGHT,
      { others: [], dt: 0 },
    )
    expect(result.input.throttle).toBeCloseTo(1)
  })

  it('asks for a brake (negative throttle) when above the target speed', () => {
    const result = tickAi(
      { ...INITIAL_AI_STATE, progress: 1000, racedDistance: 1000 },
      carAt({ speed: 200 }),
      STATS,
      FLAT_STRAIGHT,
      { others: [], dt: 0 },
    )
    expect(result.input.throttle).toBeLessThan(0)
  })

  it('caps the target speed when a close same-lane leader is ahead', () => {
    // Heading PI/2 = north; the leader at z = -8 sits 8 m ahead in
    // the AI's forward direction.
    const NORTH = Math.PI / 2
    const result = tickAi(
      { ...INITIAL_AI_STATE, progress: 1000, racedDistance: 1000 },
      carAt({ heading: NORTH, speed: 30 }),
      STATS,
      FLAT_STRAIGHT,
      {
        others: [{ x: 0, z: -8, heading: NORTH, speed: 15 }],
        dt: 0,
      },
    )
    expect(result.nextAiState.targetSpeed).toBeLessThanOrEqual(
      15 - AI_TUNING.FOLLOW_SPEED_BUFFER_M_PER_S + 0.0001,
    )
    // Trailing too fast: AI brakes.
    expect(result.input.throttle).toBeLessThan(0)
  })

  it('ignores a peer in an adjacent lane and keeps top speed on a straight', () => {
    const NORTH = Math.PI / 2
    const result = tickAi(
      { ...INITIAL_AI_STATE, progress: 1000, racedDistance: 1000 },
      carAt({ heading: NORTH, speed: 30 }),
      STATS,
      FLAT_STRAIGHT,
      {
        others: [
          {
            x: AI_TUNING.FOLLOW_LANE_THRESHOLD_METERS + 1,
            z: -8,
            heading: NORTH,
            speed: 15,
          },
        ],
        dt: 0,
      },
    )
    expect(result.nextAiState.targetSpeed).toBe(STATS.topSpeed)
  })
})

describe('tickAi (countdown)', () => {
  it('returns neutral input when racing is false', () => {
    const result = tickAi(
      INITIAL_AI_STATE,
      carAt(),
      STATS,
      FLAT_STRAIGHT,
      { others: [], dt: 0.016, racing: false },
    )
    expect(result.input.throttle).toBe(0)
    expect(result.input.steer).toBe(0)
    expect(result.input.handbrake).toBe(false)
  })
})

describe('tickAi (determinism)', () => {
  it('produces identical outputs for identical inputs', () => {
    const state: AiState = { ...INITIAL_AI_STATE, seed: 42 }
    const a = tickAi(state, carAt({ speed: 10 }), STATS, FLAT_STRAIGHT, {
      others: [],
      dt: 0.016,
    })
    const b = tickAi(state, carAt({ speed: 10 }), STATS, FLAT_STRAIGHT, {
      others: [],
      dt: 0.016,
    })
    expect(a.input).toEqual(b.input)
    expect(a.nextAiState).toEqual(b.nextAiState)
  })

  it('integrates progress from speed and dt', () => {
    const result = tickAi(
      { ...INITIAL_AI_STATE, progress: 100 },
      carAt({ speed: 10 }),
      STATS,
      FLAT_STRAIGHT,
      { others: [], dt: 0.1 },
    )
    expect(result.nextAiState.progress).toBeCloseTo(101)
  })
})

describe('tickAi (track-local frame)', () => {
  // Track view that pretends the road is a north-pointing straight at
  // world x = 0 (centerline heading PI/2 in the rail convention so the
  // right-of-travel perpendicular maps to +x). When a track view
  // exposes `centerlineAt`, the AI must use the track frame instead of
  // the world x axis.
  function northStraight(centerX: number = 0): {
    centerXAt: () => number
    curveAt: () => number
    centerlineAt: (progress: number) => { x: number; z: number; heading: number }
  } {
    return {
      centerXAt: () => centerX,
      curveAt: () => 0,
      centerlineAt: (progress: number) => ({
        x: centerX,
        z: -progress,
        heading: Math.PI / 2,
      }),
    }
  }

  it('steers toward the centerline when the car is off-center on a north straight', () => {
    const view = northStraight(0)
    const state: AiState = {
      ...INITIAL_AI_STATE,
      progress: AI_TUNING.LAUNCH_LANE_HOLD_M + 1,
      racedDistance: AI_TUNING.LAUNCH_LANE_HOLD_M + 1,
    }
    // Car at +x is offset right of the north centerline. Forward at
    // heading PI/2 is (cos PI/2, -sin PI/2) = (0, -1) (pure north),
    // so the car needs to point partly toward -x to converge to the
    // centerline. From north the closer way to start pointing toward
    // -x is to rotate CCW (north toward west), which is a positive
    // steer in VibeRacer's convention.
    const right = tickAi(state, carAt({ x: 3, z: -200, heading: Math.PI / 2 }), STATS, view, {
      others: [],
      dt: 0,
    })
    expect(right.input.steer).toBeGreaterThan(0)
    // Symmetry: a car at -x should steer the other way.
    const left = tickAi(state, carAt({ x: -3, z: -200, heading: Math.PI / 2 }), STATS, view, {
      others: [],
      dt: 0,
    })
    expect(left.input.steer).toBeLessThan(0)
  })

  it('steers to recover a heading drift on a straight', () => {
    const view = northStraight(0)
    const state: AiState = {
      ...INITIAL_AI_STATE,
      progress: AI_TUNING.LAUNCH_LANE_HOLD_M + 1,
      racedDistance: AI_TUNING.LAUNCH_LANE_HOLD_M + 1,
    }
    // Car centered on the rail but pointed at 0.5 radians off CCW
    // from the centerline heading. The heading-tracking term must
    // wind it back: pose.heading < car.heading, so the heading error
    // is negative, and the controller emits a negative steer.
    const result = tickAi(
      state,
      carAt({ x: 0, z: -200, heading: Math.PI / 2 + 0.5 }),
      STATS,
      view,
      { others: [], dt: 0 },
    )
    expect(result.input.steer).toBeLessThan(0)
  })

  it('emits near-zero steer when aligned on the centerline', () => {
    const view = northStraight(0)
    const state: AiState = {
      ...INITIAL_AI_STATE,
      progress: AI_TUNING.LAUNCH_LANE_HOLD_M + 1,
      racedDistance: AI_TUNING.LAUNCH_LANE_HOLD_M + 1,
    }
    const result = tickAi(
      state,
      carAt({ x: 0, z: -200, heading: Math.PI / 2 }),
      STATS,
      view,
      { others: [], dt: 0 },
    )
    expect(Math.abs(result.input.steer)).toBeLessThan(0.05)
  })
})
