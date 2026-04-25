import { describe, it, expect } from 'vitest'
import {
  MAX_REPLAY_SAMPLES,
  REPLAY_SAMPLE_MS,
  ReplaySchema,
  interpolateGhostPose,
  shortestArcLerp,
  type Replay,
} from '@/lib/replay'

function makeReplay(samples: Array<[number, number, number]>): Replay {
  return { lapTimeMs: Math.max(1, samples.length * REPLAY_SAMPLE_MS), samples }
}

describe('shortestArcLerp', () => {
  it('takes the short way around when crossing PI', () => {
    const result = shortestArcLerp(Math.PI - 0.1, -Math.PI + 0.1, 0.5)
    // The midpoint of a tiny arc straddling +/- PI should be right at PI (or
    // equivalently -PI). Either is acceptable; we just need the magnitude to
    // be close to PI rather than near 0.
    expect(Math.abs(Math.abs(result) - Math.PI)).toBeLessThan(0.05)
  })

  it('returns endpoints for k=0 and k=1', () => {
    expect(shortestArcLerp(1, 2, 0)).toBeCloseTo(1)
    expect(shortestArcLerp(1, 2, 1)).toBeCloseTo(2)
  })
})

describe('interpolateGhostPose', () => {
  const replay = makeReplay([
    [0, 0, 0],
    [10, 0, Math.PI / 2],
    [20, 5, Math.PI],
  ])

  it('returns the first sample for t<=0', () => {
    expect(interpolateGhostPose(replay, -100)).toEqual({ x: 0, z: 0, heading: 0 })
    expect(interpolateGhostPose(replay, 0)).toEqual({ x: 0, z: 0, heading: 0 })
  })

  it('returns the last sample for t past the end', () => {
    const last = interpolateGhostPose(replay, 999_999)
    expect(last).toEqual({ x: 20, z: 5, heading: Math.PI })
  })

  it('lerps positions linearly between adjacent samples', () => {
    const mid = interpolateGhostPose(replay, REPLAY_SAMPLE_MS / 2)!
    expect(mid.x).toBeCloseTo(5)
    expect(mid.z).toBeCloseTo(0)
  })

  it('lerps heading along the shortest arc', () => {
    const mid = interpolateGhostPose(replay, REPLAY_SAMPLE_MS / 2)!
    expect(mid.heading).toBeCloseTo(Math.PI / 4)
  })

  it('lands exactly on a sample when t is a multiple of the period', () => {
    const at1 = interpolateGhostPose(replay, REPLAY_SAMPLE_MS)!
    expect(at1.x).toBeCloseTo(10)
    expect(at1.heading).toBeCloseTo(Math.PI / 2)
  })
})

describe('ReplaySchema', () => {
  it('accepts a minimal valid replay', () => {
    const ok = ReplaySchema.safeParse({
      lapTimeMs: 1234,
      samples: [[0, 0, 0]],
    })
    expect(ok.success).toBe(true)
  })

  it('rejects empty sample arrays', () => {
    const fail = ReplaySchema.safeParse({ lapTimeMs: 1000, samples: [] })
    expect(fail.success).toBe(false)
  })

  it('rejects non-finite sample values', () => {
    const fail = ReplaySchema.safeParse({
      lapTimeMs: 1000,
      samples: [[0, Number.POSITIVE_INFINITY, 0]],
    })
    expect(fail.success).toBe(false)
  })

  it('rejects sample arrays that exceed the cap', () => {
    const samples: Array<[number, number, number]> = []
    for (let i = 0; i <= MAX_REPLAY_SAMPLES; i++) samples.push([0, 0, 0])
    const fail = ReplaySchema.safeParse({ lapTimeMs: 1, samples })
    expect(fail.success).toBe(false)
  })

  it('rejects non-positive lap times', () => {
    expect(
      ReplaySchema.safeParse({ lapTimeMs: 0, samples: [[0, 0, 0]] }).success,
    ).toBe(false)
    expect(
      ReplaySchema.safeParse({ lapTimeMs: -1, samples: [[0, 0, 0]] }).success,
    ).toBe(false)
  })
})
