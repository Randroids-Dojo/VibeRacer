import { describe, expect, it } from 'vitest'
import {
  FLAT_PROFILE,
  bakeProfileIntoPath,
  heightAt,
  profileLength,
  slopeAt,
  verticalProfileFromNormalized,
} from '@/game/dragVerticalProfile'

describe('vertical profile helpers', () => {
  it('returns zero height and zero slope for a flat profile everywhere', () => {
    for (const s of [-10, 0, 0.25, 0.5, 0.99, 1, 5]) {
      expect(heightAt(FLAT_PROFILE, s)).toBe(0)
      expect(slopeAt(FLAT_PROFILE, s)).toBe(0)
    }
  })

  it('clamps queries outside the profile to the endpoints', () => {
    const profile = verticalProfileFromNormalized(100, [
      { sFrac: 0, height: 0 },
      { sFrac: 1, height: 4 },
    ])
    expect(heightAt(profile, -50)).toBe(0)
    expect(heightAt(profile, 200)).toBe(4)
  })

  it('produces zero slope at every keyframe (smoothstep joins are flat)', () => {
    const profile = verticalProfileFromNormalized(200, [
      { sFrac: 0, height: 0 },
      { sFrac: 0.5, height: 5 },
      { sFrac: 1, height: 0 },
    ])
    for (const k of profile) {
      expect(Math.abs(slopeAt(profile, k.s))).toBeLessThan(1e-9)
    }
  })

  it('rises monotonically across a single ascending segment', () => {
    const profile = verticalProfileFromNormalized(100, [
      { sFrac: 0, height: 0 },
      { sFrac: 1, height: 6 },
    ])
    const samples = Array.from({ length: 21 }, (_, i) =>
      heightAt(profile, (i / 20) * 100),
    )
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]).toBeGreaterThanOrEqual(samples[i - 1] - 1e-9)
    }
    expect(samples[0]).toBe(0)
    expect(samples[samples.length - 1]).toBeCloseTo(6, 6)
  })

  it('produces positive slope on uphill and negative slope on downhill', () => {
    const uphill = verticalProfileFromNormalized(100, [
      { sFrac: 0, height: 0 },
      { sFrac: 1, height: 6 },
    ])
    const downhill = verticalProfileFromNormalized(100, [
      { sFrac: 0, height: 0 },
      { sFrac: 1, height: -6 },
    ])
    expect(slopeAt(uphill, 50)).toBeGreaterThan(0)
    expect(slopeAt(downhill, 50)).toBeLessThan(0)
  })

  it('crosses zero twice on a sine-like profile', () => {
    const profile = verticalProfileFromNormalized(100, [
      { sFrac: 0, height: 0 },
      { sFrac: 0.25, height: 2 },
      { sFrac: 0.5, height: 0 },
      { sFrac: 0.75, height: -2 },
      { sFrac: 1, height: 0 },
    ])
    let zeroCrossings = 0
    let prev = heightAt(profile, 0)
    for (let i = 1; i <= 200; i++) {
      const s = (i / 200) * 100
      const h = heightAt(profile, s)
      if ((prev > 0 && h <= 0) || (prev < 0 && h >= 0)) zeroCrossings++
      prev = h
    }
    expect(zeroCrossings).toBeGreaterThanOrEqual(2)
  })

  it('returns finite values across many queries on every profile shape', () => {
    const shapes = [
      FLAT_PROFILE,
      verticalProfileFromNormalized(100, [
        { sFrac: 0, height: 0 },
        { sFrac: 1, height: 6 },
      ]),
      verticalProfileFromNormalized(100, [
        { sFrac: 0, height: 0 },
        { sFrac: 0.85, height: -4 },
        { sFrac: 1, height: -3.6 },
      ]),
    ]
    for (const profile of shapes) {
      for (let i = 0; i <= 50; i++) {
        const s = (i / 50) * 100
        expect(Number.isFinite(heightAt(profile, s))).toBe(true)
        expect(Number.isFinite(slopeAt(profile, s))).toBe(true)
      }
    }
  })

  it('bakes y and pitch into a path of (x, z) samples', () => {
    const profile = verticalProfileFromNormalized(40, [
      { sFrac: 0, height: 0 },
      { sFrac: 1, height: 4 },
    ])
    const flatPath = [
      { x: 0, z: 0 },
      { x: 0, z: -10 },
      { x: 0, z: -20 },
      { x: 0, z: -30 },
      { x: 0, z: -40 },
    ]
    const baked = bakeProfileIntoPath(flatPath, profile)
    expect(baked).toHaveLength(5)
    expect(baked[0].y).toBe(0)
    expect(baked[baked.length - 1].y).toBeCloseTo(4, 6)
    for (const p of baked) {
      expect(Number.isFinite(p.y!)).toBe(true)
      expect(Number.isFinite(p.pitch!)).toBe(true)
    }
  })

  it('reports the correct profile length', () => {
    const profile = verticalProfileFromNormalized(800, [
      { sFrac: 0, height: 0 },
      { sFrac: 1, height: 0 },
    ])
    expect(profileLength(profile)).toBe(800)
  })
})
