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

// Synthetic flat-straight view. A car at any (x, z) sees a centerline
// running north (heading PI/2) at world x = 0. `projectToRail` snaps
// to the car's z coord so `sampleAt(arc, lateral)` reads the right
// world position for any car along the straight.
const FLAT_STRAIGHT: AiTrackView = {
  totalLength: 100000,
  projectToRail: (_x, z) => -z,
  sampleAt: (arcLength, lateral) => ({
    x: lateral,
    z: -arcLength,
    heading: Math.PI / 2,
  }),
  curveAt: () => 0,
}

// Synthetic constant-curve view. `sampleAt` keeps the AI on a straight
// (the controller decides what to do with the curve, not the geometry),
// so this lets us exercise `targetSpeedAt` and racing-line bias without
// having to author a curved rail.
function rightCurve(strength: number): AiTrackView {
  return {
    totalLength: 100000,
    projectToRail: (_x, z) => -z,
    sampleAt: (arcLength, lateral) => ({
      x: lateral,
      z: -arcLength,
      heading: Math.PI / 2,
    }),
    curveAt: () => strength,
  }
}

const STATS: AiCarStats = { topSpeed: 40 }

function carAt(over: Partial<AiCarView> = {}): AiCarView {
  return { x: 0, z: 0, heading: Math.PI / 2, speed: 0, ...over }
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
  // 0 = +X (east), PI/2 = -Z (north). All follow-distance scenarios
  // below assume the AI faces PI/2 (north); the leader sits at a
  // negative z (further north).
  const NORTH = Math.PI / 2

  it('returns null when no peer is in the window', () => {
    expect(followDistanceCap(carAt(), [])).toBeNull()
  })

  it('returns the leader speed minus the buffer for a same-lane close peer', () => {
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
  it('emits zero steer at race-go for a car already aligned with the rail', () => {
    // Car on the straight, heading north, no racing-line bias yet
    // (racedDistance = 0 -> blend = 0). The carrot sits directly ahead
    // along the heading, so heading error is 0 and steer is 0.
    const state: AiState = { ...INITIAL_AI_STATE }
    const result = tickAi(
      state,
      carAt({ x: 0, z: 0, heading: Math.PI / 2 }),
      STATS,
      rightCurve(0.5),
      { others: [], dt: 0 },
    )
    expect(Math.abs(result.input.steer)).toBeLessThan(0.05)
  })

  it('starts following the racing line once past LAUNCH_LANE_HOLD_M', () => {
    // racedDistance past launch hold -> blend = 1 -> racing-line bias
    // is full. With a right curve, the carrot offsets to +x and the
    // car (centered, facing north) must steer right (negative) to
    // turn toward +x.
    const state: AiState = {
      ...INITIAL_AI_STATE,
      racedDistance: AI_TUNING.LAUNCH_LANE_HOLD_M + 1,
    }
    const result = tickAi(
      state,
      carAt({ x: 0, z: 0, heading: Math.PI / 2 }),
      STATS,
      rightCurve(0.5),
      { others: [], dt: 0 },
    )
    expect(result.input.steer).toBeLessThan(0)
  })
})

describe('tickAi (throttle)', () => {
  it('asks for full throttle on a straight when below the target speed', () => {
    const result = tickAi(
      { ...INITIAL_AI_STATE, racedDistance: 1000 },
      carAt({ speed: 5 }),
      STATS,
      FLAT_STRAIGHT,
      { others: [], dt: 0 },
    )
    expect(result.input.throttle).toBeCloseTo(1)
  })

  it('asks for a brake (negative throttle) when above the target speed', () => {
    const result = tickAi(
      { ...INITIAL_AI_STATE, racedDistance: 1000 },
      carAt({ speed: 200 }),
      STATS,
      FLAT_STRAIGHT,
      { others: [], dt: 0 },
    )
    expect(result.input.throttle).toBeLessThan(0)
  })

  it('caps the target speed when a close same-lane leader is ahead', () => {
    const NORTH = Math.PI / 2
    const result = tickAi(
      { ...INITIAL_AI_STATE, racedDistance: 1000 },
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
    expect(result.input.throttle).toBeLessThan(0)
  })

  it('ignores a peer in an adjacent lane and keeps top speed on a straight', () => {
    const NORTH = Math.PI / 2
    const result = tickAi(
      { ...INITIAL_AI_STATE, racedDistance: 1000 },
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

  it('skips the follow-distance cap during launch hold so the field can spread', () => {
    // Same scenario as the cap test but with racedDistance = 0. The
    // controller must NOT cap on a stationary leader because every
    // car is at speed 0 on the grid and capping would deadlock the
    // whole field.
    const NORTH = Math.PI / 2
    const result = tickAi(
      { ...INITIAL_AI_STATE },
      carAt({ heading: NORTH, speed: 0 }),
      STATS,
      FLAT_STRAIGHT,
      {
        others: [{ x: 0, z: -8, heading: NORTH, speed: 0 }],
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

  it('integrates racedDistance from speed and dt', () => {
    const result = tickAi(
      { ...INITIAL_AI_STATE, racedDistance: 100 },
      carAt({ speed: 10 }),
      STATS,
      FLAT_STRAIGHT,
      { others: [], dt: 0.1 },
    )
    expect(result.nextAiState.racedDistance).toBeCloseTo(101)
  })

  it('writes the carrot world position to telemetry every tick', () => {
    const result = tickAi(
      { ...INITIAL_AI_STATE, racedDistance: 1000 },
      carAt({ heading: Math.PI / 2, speed: 20 }),
      STATS,
      FLAT_STRAIGHT,
      { others: [], dt: 0 },
    )
    // Look-ahead at 20 m/s = 14 m, clamped to [4, 20]. Carrot is
    // 14 m ahead on the flat-north rail (centerline x = 0), so
    // carrotX = 0 and carrotZ < 0.
    expect(result.nextAiState.carrotX).toBeCloseTo(0, 5)
    expect(result.nextAiState.carrotZ).toBeLessThan(0)
  })
})

describe('tickAi (pure pursuit on a curved-rail stub)', () => {
  // Synthetic view where the centerline goes east (+x) at z = 0 with
  // heading 0. A car off-line in z must steer to bring its heading
  // toward 0 (east) so it converges back to the rail.
  function eastStraight(): AiTrackView {
    return {
      totalLength: 100000,
      projectToRail: (x) => x,
      sampleAt: (arcLength, lateral) => ({
        x: arcLength,
        // Right of travel for heading 0 = (sin 0, cos 0) = (0, 1).
        // A positive lateral shifts in +z.
        z: lateral,
        heading: 0,
      }),
      curveAt: () => 0,
    }
  }

  it('steers toward the rail when the car is offset above (north of) the east-bound rail', () => {
    // Car at z = -3 is 3 m north of the centerline, facing east. The
    // carrot (at the same arc length the car is at + look-ahead) sits
    // at z = 0 (on centerline). The angle to the carrot is south of
    // east (atan2(-3, lookAhead) negative because dz = 3 and we take
    // atan2(-dz, dx) = atan2(-3, lookAhead) < 0). Heading is 0 so
    // headingError < 0 and steer is negative (right in VibeRacer's
    // convention; visually the car curves south-east back to z = 0).
    const view = eastStraight()
    const result = tickAi(
      { ...INITIAL_AI_STATE, racedDistance: 1000 },
      { x: 0, z: -3, heading: 0, speed: 20 },
      STATS,
      view,
      { others: [], dt: 0 },
    )
    expect(result.input.steer).toBeLessThan(0)
  })

  it('emits near-zero steer when on the rail and aligned', () => {
    const view = eastStraight()
    const result = tickAi(
      { ...INITIAL_AI_STATE, racedDistance: 1000 },
      { x: 50, z: 0, heading: 0, speed: 20 },
      STATS,
      view,
      { others: [], dt: 0 },
    )
    expect(Math.abs(result.input.steer)).toBeLessThan(0.05)
  })

  it('symmetric: off below the rail steers the other way', () => {
    const view = eastStraight()
    const a = tickAi(
      { ...INITIAL_AI_STATE, racedDistance: 1000 },
      { x: 0, z: -3, heading: 0, speed: 20 },
      STATS,
      view,
      { others: [], dt: 0 },
    )
    const b = tickAi(
      { ...INITIAL_AI_STATE, racedDistance: 1000 },
      { x: 0, z: 3, heading: 0, speed: 20 },
      STATS,
      view,
      { others: [], dt: 0 },
    )
    expect(Math.sign(a.input.steer)).not.toBe(Math.sign(b.input.steer))
    expect(Math.abs(a.input.steer)).toBeCloseTo(Math.abs(b.input.steer), 3)
  })
})

describe('tickAi (off-track recovery)', () => {
  // Same east-bound straight as the curved-rail tests.
  function eastStraight(): AiTrackView {
    return {
      totalLength: 100000,
      projectToRail: (x) => x,
      sampleAt: (arcLength, lateral) => ({
        x: arcLength,
        z: lateral,
        heading: 0,
      }),
      curveAt: () => 0,
      roadHalfWidth: 4,
    }
  }

  it('brakes to MIN_AI_SPEED and widens look-ahead when far off-rail (recovery branch)', () => {
    // Half-width is 4 m; recovery braking kicks in past 1.5 * 4 = 6 m.
    // Put the car 10 m off the rail in the +z direction (= right of
    // the east-bound rail) at racing speed.
    const view = eastStraight()
    const result = tickAi(
      { ...INITIAL_AI_STATE, racedDistance: 1000 },
      { x: 50, z: 10, heading: 0, speed: 22 },
      STATS,
      view,
      { others: [], dt: 0 },
    )
    // Target speed must be the recovery floor, not topSpeed.
    expect(result.nextAiState.targetSpeed).toBe(AI_TUNING.MIN_AI_SPEED)
    // Car is going way over the recovery target, so the throttle
    // must be braking.
    expect(result.input.throttle).toBeLessThan(0)
    // Carrot is at `arcLength + lookAhead` along the rail, with
    // lookAhead boosted by lateral distance. arcLength = 50 (the
    // car's x), baseLookAhead from speed 22 = clamp(22 * 0.7, 4, 20)
    // = ~15.4, boost = 10 * 2 = 20, total ~35.4. Carrot at x ~85.
    // The key property is that the carrot is FORWARD of the car
    // (carrotX > carX), producing a wide convergent arc rather than
    // a tight sideways turn.
    expect(result.nextAiState.carrotX).toBeGreaterThan(50)
    // Carrot stays on the centerline (z = 0) because recovery
    // collapses the racing-line bias.
    expect(result.nextAiState.carrotZ).toBeCloseTo(0, 5)
  })

  it('does NOT trigger recovery when on the racing surface (within ~1 road width)', () => {
    // 3 m off-center is within the road; recovery must NOT fire.
    const view = eastStraight()
    const result = tickAi(
      { ...INITIAL_AI_STATE, racedDistance: 1000 },
      { x: 50, z: 3, heading: 0, speed: 22 },
      STATS,
      view,
      { others: [], dt: 0 },
    )
    expect(result.nextAiState.targetSpeed).toBe(STATS.topSpeed)
  })

  it('recovery exits once the car gets back near the rail (single-frame snapshot)', () => {
    const view = eastStraight()
    // Same speed, but now only 4 m off-center (= 1 road half-width,
    // just at the boundary). Recovery threshold is 6 m, so the car
    // is back inside.
    const result = tickAi(
      { ...INITIAL_AI_STATE, racedDistance: 1000 },
      { x: 50, z: 4, heading: 0, speed: 22 },
      STATS,
      view,
      { others: [], dt: 0 },
    )
    expect(result.nextAiState.targetSpeed).toBe(STATS.topSpeed)
  })
})
