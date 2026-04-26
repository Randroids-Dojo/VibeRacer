import { describe, expect, it } from 'vitest'
import {
  WRONG_WAY_ANGLE_THRESHOLD,
  WRONG_WAY_ENTER_TICKS,
  WRONG_WAY_EXIT_TICKS,
  WRONG_WAY_MIN_SPEED,
  angleBetween,
  expectedTangent,
  headingToVector,
  initWrongWayDetector,
  isWrongWayInstant,
  updateWrongWayDetector,
} from '@/game/wrongWay'
import { buildTrackPath, type OrderedPiece } from '@/game/trackPath'
import { DEFAULT_TRACK_PIECES } from '@/lib/defaultTrack'

function approx(a: number, b: number, tol = 1e-6) {
  expect(Math.abs(a - b)).toBeLessThanOrEqual(tol)
}

describe('headingToVector', () => {
  it('east heading 0 maps to +X', () => {
    const v = headingToVector(0)
    approx(v.dx, 1)
    approx(v.dz, 0)
  })

  it('north heading PI/2 maps to -Z', () => {
    const v = headingToVector(Math.PI / 2)
    approx(v.dx, 0)
    approx(v.dz, -1)
  })

  it('south heading -PI/2 maps to +Z', () => {
    const v = headingToVector(-Math.PI / 2)
    approx(v.dx, 0)
    approx(v.dz, 1)
  })

  it('west heading PI maps to -X', () => {
    const v = headingToVector(Math.PI)
    approx(v.dx, -1)
    approx(v.dz, 0)
  })
})

describe('angleBetween', () => {
  it('returns 0 for parallel vectors', () => {
    expect(angleBetween(1, 0, 1, 0)).toBeCloseTo(0)
    expect(angleBetween(2, 0, 5, 0)).toBeCloseTo(0)
  })

  it('returns PI for opposite vectors', () => {
    expect(angleBetween(1, 0, -1, 0)).toBeCloseTo(Math.PI)
    expect(angleBetween(0, 1, 0, -3)).toBeCloseTo(Math.PI)
  })

  it('returns PI/2 for perpendicular vectors', () => {
    expect(angleBetween(1, 0, 0, 1)).toBeCloseTo(Math.PI / 2)
  })

  it('returns 0 on zero-length input', () => {
    expect(angleBetween(0, 0, 1, 0)).toBe(0)
    expect(angleBetween(1, 0, 0, 0)).toBe(0)
  })

  it('returns 0 on non-finite input', () => {
    expect(angleBetween(Number.NaN, 0, 1, 0)).toBe(0)
    expect(angleBetween(1, 0, Number.POSITIVE_INFINITY, 0)).toBe(0)
  })

  it('clamps acos input to avoid NaN at the boundary', () => {
    // Slightly over 1 due to floating-point should still return 0, not NaN.
    const result = angleBetween(1, 0, 1.0000001, 0)
    expect(Number.isFinite(result)).toBe(true)
    expect(result).toBeCloseTo(0)
  })
})

describe('expectedTangent on a straight piece', () => {
  it('points entry-to-exit regardless of car position', () => {
    // Default track piece 0 is a south-piece straight that traverses south
    // to north. Entry at southern edge, exit at northern edge.
    const path = buildTrackPath(DEFAULT_TRACK_PIECES)
    const op = path.order[0]
    expect(op.arcCenter).toBeNull()
    expect(op.samples).toBeNull()
    const t = expectedTangent(op, op.center.x, op.center.z)
    const expectedDx = op.exit.x - op.entry.x
    const expectedDz = op.exit.z - op.entry.z
    const len = Math.hypot(expectedDx, expectedDz)
    approx(t.dx, expectedDx / len)
    approx(t.dz, expectedDz / len)
  })
})

describe('expectedTangent on a corner piece', () => {
  // Find a corner in the default track.
  const path = buildTrackPath(DEFAULT_TRACK_PIECES)
  const corner = path.order.find(
    (op) => op.arcCenter !== null,
  ) as OrderedPiece
  it('default track has at least one corner', () => {
    expect(corner).toBeDefined()
  })

  it('returns a unit vector', () => {
    const t = expectedTangent(corner, corner.entry.x, corner.entry.z)
    approx(Math.hypot(t.dx, t.dz), 1)
  })

  it('at the entry point, tangent points roughly toward the exit', () => {
    const t = expectedTangent(corner, corner.entry.x, corner.entry.z)
    // Chord from entry to exit. The tangent at entry should have a positive
    // dot with the chord direction (it begins moving along the chord).
    const cdx = corner.exit.x - corner.entry.x
    const cdz = corner.exit.z - corner.entry.z
    const dot = t.dx * cdx + t.dz * cdz
    expect(dot).toBeGreaterThan(0)
  })

  it('at the exit point, tangent points roughly along the chord', () => {
    const t = expectedTangent(corner, corner.exit.x, corner.exit.z)
    const cdx = corner.exit.x - corner.entry.x
    const cdz = corner.exit.z - corner.entry.z
    const dot = t.dx * cdx + t.dz * cdz
    expect(dot).toBeGreaterThan(0)
  })
})

describe('expectedTangent on an S-curve piece', () => {
  // Inject an S-curve into a small loop. We can build a 4-piece loop:
  // straight S-N at (0,0), scurve S-N at (-1, 0)... but that's hard to
  // construct without breaking the loop. Easier: synthesize an OrderedPiece
  // with handcrafted samples.
  it('uses the closest segment on the polyline', () => {
    const samples = [
      { x: 0, z: 10, heading: Math.PI / 2 },
      { x: 0, z: 0, heading: Math.PI / 2 },
      { x: 0, z: -10, heading: Math.PI / 2 },
    ]
    const op: OrderedPiece = {
      piece: { row: 0, col: 0, type: 'scurve', rotation: 0 },
      entryDir: 2,
      exitDir: 0,
      center: { x: 0, y: 0, z: 0 },
      entry: { x: 0, y: 0, z: 10 },
      exit: { x: 0, y: 0, z: -10 },
      arcCenter: null,
      samples,
    }
    const t = expectedTangent(op, 0, 5)
    // Heading from sample[0] to sample[1] is straight north (-Z).
    approx(t.dx, 0)
    approx(t.dz, -1)
  })
})

describe('isWrongWayInstant', () => {
  // Travel direction north (heading PI/2 in game frame, so vector (0, -1)).
  const expected = { dx: 0, dz: -1 }

  it('returns false when the car is moving in the expected direction', () => {
    expect(isWrongWayInstant(Math.PI / 2, 10, expected)).toBe(false)
  })

  it('returns true when the car is moving the opposite direction', () => {
    // Heading south (-PI/2), positive speed = moving south.
    expect(isWrongWayInstant(-Math.PI / 2, 10, expected)).toBe(true)
  })

  it('returns true when reversing into the right-way direction (drives backward)', () => {
    // Heading north but speed negative = moving south (against expected).
    expect(isWrongWayInstant(Math.PI / 2, -10, expected)).toBe(true)
  })

  it('returns false when reversing against the right-way direction (drives forward in expected dir)', () => {
    // Heading south but speed negative = moving north (with expected).
    expect(isWrongWayInstant(-Math.PI / 2, -10, expected)).toBe(false)
  })

  it('returns false below the minimum speed even when pointed wrong', () => {
    expect(
      isWrongWayInstant(-Math.PI / 2, WRONG_WAY_MIN_SPEED - 0.1, expected),
    ).toBe(false)
  })

  it('returns false on non-finite inputs', () => {
    expect(isWrongWayInstant(Number.NaN, 10, expected)).toBe(false)
    expect(isWrongWayInstant(Math.PI / 2, Number.POSITIVE_INFINITY, expected)).toBe(false)
  })

  it('respects a custom angle threshold', () => {
    // Slight misalignment, well under the default threshold.
    const slightly = Math.PI / 2 + 0.3
    expect(isWrongWayInstant(slightly, 10, expected)).toBe(false)
    // Same input flipped wrong-way under a tight 10-degree threshold.
    const tight = (10 * Math.PI) / 180
    expect(isWrongWayInstant(slightly, 10, expected, tight)).toBe(true)
  })
})

describe('updateWrongWayDetector', () => {
  it('initializes inactive with zero streaks', () => {
    const s = initWrongWayDetector()
    expect(s.active).toBe(false)
    expect(s.enterStreak).toBe(0)
    expect(s.exitStreak).toBe(0)
  })

  it('does not flip on the first wrong-way frame', () => {
    let s = initWrongWayDetector()
    s = updateWrongWayDetector(s, true)
    expect(s.active).toBe(false)
    expect(s.enterStreak).toBe(1)
  })

  it('flips active after enterTicks consecutive wrong-way frames', () => {
    let s = initWrongWayDetector()
    for (let i = 0; i < WRONG_WAY_ENTER_TICKS - 1; i++) {
      s = updateWrongWayDetector(s, true)
    }
    expect(s.active).toBe(false)
    s = updateWrongWayDetector(s, true)
    expect(s.active).toBe(true)
  })

  it('resets the enter streak on the first right-way frame', () => {
    let s = initWrongWayDetector()
    s = updateWrongWayDetector(s, true)
    s = updateWrongWayDetector(s, true)
    s = updateWrongWayDetector(s, false)
    expect(s.active).toBe(false)
    expect(s.enterStreak).toBe(0)
  })

  it('keeps active after a brief right-way blip', () => {
    let s = initWrongWayDetector()
    for (let i = 0; i < WRONG_WAY_ENTER_TICKS; i++) {
      s = updateWrongWayDetector(s, true)
    }
    expect(s.active).toBe(true)
    // One frame of right-way: still active (exit streak 1).
    s = updateWrongWayDetector(s, false)
    expect(s.active).toBe(true)
    expect(s.exitStreak).toBe(1)
    // Another wrong-way frame resets the exit streak.
    s = updateWrongWayDetector(s, true)
    expect(s.active).toBe(true)
    expect(s.exitStreak).toBe(0)
  })

  it('clears active after exitTicks consecutive right-way frames', () => {
    let s = initWrongWayDetector()
    for (let i = 0; i < WRONG_WAY_ENTER_TICKS; i++) {
      s = updateWrongWayDetector(s, true)
    }
    expect(s.active).toBe(true)
    for (let i = 0; i < WRONG_WAY_EXIT_TICKS - 1; i++) {
      s = updateWrongWayDetector(s, false)
    }
    expect(s.active).toBe(true)
    s = updateWrongWayDetector(s, false)
    expect(s.active).toBe(false)
    expect(s.enterStreak).toBe(0)
    expect(s.exitStreak).toBe(0)
  })

  it('honors custom enter / exit tick overrides', () => {
    let s = initWrongWayDetector()
    s = updateWrongWayDetector(s, true, 2, 1)
    expect(s.active).toBe(false)
    s = updateWrongWayDetector(s, true, 2, 1)
    expect(s.active).toBe(true)
    s = updateWrongWayDetector(s, false, 2, 1)
    expect(s.active).toBe(false)
  })

  it('default threshold is sane (~120 degrees)', () => {
    // 2*PI/3 = 120 degrees, more than 90 (perpendicular) and less than 180.
    expect(WRONG_WAY_ANGLE_THRESHOLD).toBeGreaterThan(Math.PI / 2)
    expect(WRONG_WAY_ANGLE_THRESHOLD).toBeLessThan(Math.PI)
  })
})
