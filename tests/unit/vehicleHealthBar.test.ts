import { describe, expect, it } from 'vitest'
import {
  HEALTH_BAR_SPRITE_HEIGHT,
  HEALTH_BAR_SPRITE_WIDTH,
  HEALTH_BAR_TEXTURE_HEIGHT,
  HEALTH_BAR_TEXTURE_WIDTH,
  HEALTH_BAR_Y_OFFSET,
  clampHealthFraction,
  healthBarFillColor,
} from '@/game/vehicleHealthBar'

describe('vehicleHealthBar constants', () => {
  it('uses power-of-two texture dimensions', () => {
    expect(Math.log2(HEALTH_BAR_TEXTURE_WIDTH) % 1).toBe(0)
    expect(Math.log2(HEALTH_BAR_TEXTURE_HEIGHT) % 1).toBe(0)
  })

  it('sprite is wider than tall so it reads as a bar', () => {
    expect(HEALTH_BAR_SPRITE_WIDTH).toBeGreaterThan(HEALTH_BAR_SPRITE_HEIGHT)
  })

  it('floats below the ghost nameplate', () => {
    expect(HEALTH_BAR_Y_OFFSET).toBeGreaterThan(0)
    expect(HEALTH_BAR_Y_OFFSET).toBeLessThan(3.0)
  })
})

describe('healthBarFillColor', () => {
  it('returns green when health is high', () => {
    expect(healthBarFillColor(1)).toBe('#3ddc84')
    expect(healthBarFillColor(0.61)).toBe('#3ddc84')
  })

  it('drops to yellow / orange / red as health falls', () => {
    expect(healthBarFillColor(0.5)).toBe('#f5c518')
    expect(healthBarFillColor(0.2)).toBe('#f29423')
    expect(healthBarFillColor(0.05)).toBe('#e84a5f')
    expect(healthBarFillColor(0)).toBe('#e84a5f')
  })
})

describe('clampHealthFraction', () => {
  it('passes through valid fractions', () => {
    expect(clampHealthFraction(0)).toBe(0)
    expect(clampHealthFraction(0.5)).toBe(0.5)
    expect(clampHealthFraction(1)).toBe(1)
  })

  it('clamps out-of-range values', () => {
    expect(clampHealthFraction(-0.5)).toBe(0)
    expect(clampHealthFraction(2)).toBe(1)
  })

  it('defaults non-numbers and non-finite to full health', () => {
    expect(clampHealthFraction(NaN)).toBe(1)
    expect(clampHealthFraction(Infinity)).toBe(1)
    expect(clampHealthFraction('1' as unknown)).toBe(1)
    expect(clampHealthFraction(null)).toBe(1)
    expect(clampHealthFraction(undefined)).toBe(1)
  })
})
