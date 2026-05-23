import { describe, expect, it } from 'vitest'
import {
  CARDINAL_DISTANCE,
  CARDINAL_HEIGHT,
  cardinalCameraPose,
} from '@/game/destruction/cardinalCamera'

// At heading 0 the physics integrator says forward = +X, but the
// VISIBLE car (after the inner CAR_MODEL_YAW_OFFSET rotation in the
// asset loader) faces -X. The compass uses visible directions so N
// shows the front of the car you can see, not the physics-internal
// forward.

describe('cardinalCameraPose at heading 0', () => {
  it('N places the camera in front of the visible car (-X side)', () => {
    const pose = cardinalCameraPose('N', 10, 5, 0)
    expect(pose.position.x).toBeCloseTo(10 - CARDINAL_DISTANCE, 5)
    expect(pose.position.y).toBe(CARDINAL_HEIGHT)
    expect(pose.position.z).toBeCloseTo(5, 5)
    expect(pose.lookAt.x).toBeCloseTo(10, 5)
    expect(pose.lookAt.z).toBeCloseTo(5, 5)
  })
  it('S places the camera behind the visible car (+X side)', () => {
    const pose = cardinalCameraPose('S', 10, 5, 0)
    expect(pose.position.x).toBeCloseTo(10 + CARDINAL_DISTANCE, 5)
    expect(pose.position.z).toBeCloseTo(5, 5)
  })
  it('E places the camera off the visible right side (-Z at heading 0)', () => {
    const pose = cardinalCameraPose('E', 10, 5, 0)
    expect(pose.position.x).toBeCloseTo(10, 5)
    expect(pose.position.z).toBeCloseTo(5 - CARDINAL_DISTANCE, 5)
  })
  it('W places the camera off the visible left side (+Z at heading 0)', () => {
    const pose = cardinalCameraPose('W', 10, 5, 0)
    expect(pose.position.x).toBeCloseTo(10, 5)
    expect(pose.position.z).toBeCloseTo(5 + CARDINAL_DISTANCE, 5)
  })
})

describe('cardinalCameraPose rotates with the car', () => {
  it('N at heading -PI/2 (visible nose at -Z) places camera at -Z side', () => {
    // physics forward = (cos(-pi/2), -sin(-pi/2)) = (0, 1) = +Z.
    // Visible nose is the opposite of that: -Z. The N camera is in
    // front of the visible car, so at -Z relative.
    const pose = cardinalCameraPose('N', 0, 0, -Math.PI / 2)
    expect(pose.position.x).toBeCloseTo(0, 5)
    expect(pose.position.z).toBeCloseTo(-CARDINAL_DISTANCE, 5)
  })
  it('E at heading -PI/2 places the camera off the visible right side (+X)', () => {
    // Visible right at heading -PI/2: (-sin(-pi/2), -cos(-pi/2)) =
    // (1, 0) = +X. So E camera lands at +X.
    const pose = cardinalCameraPose('E', 0, 0, -Math.PI / 2)
    expect(pose.position.x).toBeCloseTo(CARDINAL_DISTANCE, 5)
    expect(pose.position.z).toBeCloseTo(0, 5)
  })
})

describe('cardinalCameraPose maintains distance to car', () => {
  it('every direction places the camera exactly `distance` away', () => {
    for (const dir of ['N', 'S', 'E', 'W'] as const) {
      const pose = cardinalCameraPose(dir, 0, 0, 1.3, 5, 1.6)
      const r = Math.hypot(pose.position.x, pose.position.z)
      expect(r).toBeCloseTo(5, 5)
    }
  })

  it('always looks at the car center (in XZ)', () => {
    for (const dir of ['N', 'S', 'E', 'W'] as const) {
      const pose = cardinalCameraPose(dir, 12, -7, 0.4)
      expect(pose.lookAt.x).toBeCloseTo(12, 5)
      expect(pose.lookAt.z).toBeCloseTo(-7, 5)
    }
  })
})
