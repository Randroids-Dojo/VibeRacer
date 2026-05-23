import { describe, expect, it } from 'vitest'
import { Color } from 'three'
import {
  WORN_COLOR_TARGET,
  WORN_ROUGHNESS_TARGET,
  wornColor,
  wornRoughness,
} from '@/game/destruction/wear'

describe('wornRoughness', () => {
  it('returns the original at fraction 1', () => {
    expect(wornRoughness(0.4, 1)).toBeCloseTo(0.4, 6)
  })
  it('returns the worn target at fraction 0', () => {
    expect(wornRoughness(0.4, 0)).toBeCloseTo(WORN_ROUGHNESS_TARGET, 6)
  })
  it('interpolates linearly between 0 and 1', () => {
    const mid = wornRoughness(0.4, 0.5)
    const expected = 0.4 + (WORN_ROUGHNESS_TARGET - 0.4) * 0.5
    expect(mid).toBeCloseTo(expected, 6)
  })
  it('clamps fractions outside [0, 1]', () => {
    expect(wornRoughness(0.4, -1)).toBeCloseTo(WORN_ROUGHNESS_TARGET, 6)
    expect(wornRoughness(0.4, 2)).toBeCloseTo(0.4, 6)
  })
})

describe('wornColor', () => {
  it('returns the original at fraction 1', () => {
    const out = wornColor(0xff5544, 1)
    const original = new Color(0xff5544)
    expect(out.r).toBeCloseTo(original.r, 6)
    expect(out.g).toBeCloseTo(original.g, 6)
    expect(out.b).toBeCloseTo(original.b, 6)
  })
  it('returns the worn target at fraction 0', () => {
    const out = wornColor(0xff5544, 0)
    const target = new Color(WORN_COLOR_TARGET)
    expect(out.r).toBeCloseTo(target.r, 6)
    expect(out.g).toBeCloseTo(target.g, 6)
    expect(out.b).toBeCloseTo(target.b, 6)
  })
  it('drives the color darker as fraction drops', () => {
    const a = wornColor(0xff5544, 0.9)
    const b = wornColor(0xff5544, 0.4)
    // Average luminance of `a` should exceed `b`.
    const lumA = a.r + a.g + a.b
    const lumB = b.r + b.g + b.b
    expect(lumA).toBeGreaterThan(lumB)
  })
})
