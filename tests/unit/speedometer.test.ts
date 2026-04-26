import { describe, it, expect } from 'vitest'
import {
  DEFAULT_SPEED_UNIT,
  MPS_TO_KMH,
  MPS_TO_MPH,
  SPEED_UNITS,
  SpeedUnitSchema,
  convertSpeed,
  formatSpeed,
  speedFraction,
  unitLabel,
} from '@/lib/speedometer'

describe('SPEED_UNITS', () => {
  it('exposes mph, kmh, and the raw u/s unit', () => {
    expect(SPEED_UNITS).toEqual(['mph', 'kmh', 'us'])
  })

  it('defaults to mph for new players', () => {
    expect(DEFAULT_SPEED_UNIT).toBe('mph')
  })
})

describe('SpeedUnitSchema', () => {
  it('accepts every documented unit', () => {
    for (const unit of SPEED_UNITS) {
      expect(SpeedUnitSchema.safeParse(unit).success).toBe(true)
    }
  })

  it('rejects unknown unit strings', () => {
    expect(SpeedUnitSchema.safeParse('knots').success).toBe(false)
    expect(SpeedUnitSchema.safeParse('').success).toBe(false)
  })
})

describe('convertSpeed', () => {
  it('returns the raw u/s magnitude for the us unit', () => {
    expect(convertSpeed(0, 'us')).toBe(0)
    expect(convertSpeed(12.5, 'us')).toBe(12.5)
  })

  it('treats negative speeds as their absolute value (reverse driving)', () => {
    expect(convertSpeed(-7, 'us')).toBe(7)
    expect(convertSpeed(-3, 'mph')).toBeCloseTo(3 * MPS_TO_MPH, 6)
  })

  it('converts m/s into mph and km/h with the documented constants', () => {
    expect(convertSpeed(1, 'mph')).toBeCloseTo(MPS_TO_MPH, 6)
    expect(convertSpeed(1, 'kmh')).toBeCloseTo(MPS_TO_KMH, 6)
    expect(convertSpeed(26, 'mph')).toBeCloseTo(26 * MPS_TO_MPH, 6)
    expect(convertSpeed(26, 'kmh')).toBeCloseTo(26 * MPS_TO_KMH, 6)
  })

  it('returns 0 for non-finite inputs', () => {
    expect(convertSpeed(NaN, 'mph')).toBe(0)
    expect(convertSpeed(Infinity, 'kmh')).toBe(0)
    expect(convertSpeed(-Infinity, 'us')).toBe(0)
  })
})

describe('formatSpeed', () => {
  it('rounds mph and km/h to whole numbers for legibility', () => {
    expect(formatSpeed(26, 'mph')).toBe('58')
    expect(formatSpeed(26, 'kmh')).toBe('94')
    expect(formatSpeed(0, 'mph')).toBe('0')
  })

  it('prints raw u/s with one decimal so tuning numbers stay readable', () => {
    expect(formatSpeed(12.34, 'us')).toBe('12.3')
    expect(formatSpeed(0, 'us')).toBe('0.0')
  })

  it('matches reverse magnitude in the formatted readout', () => {
    expect(formatSpeed(-12, 'mph')).toBe(formatSpeed(12, 'mph'))
  })
})

describe('unitLabel', () => {
  it('returns capitalized labels per unit', () => {
    expect(unitLabel('mph')).toBe('MPH')
    expect(unitLabel('kmh')).toBe('KM/H')
    expect(unitLabel('us')).toBe('U/S')
  })
})

describe('speedFraction', () => {
  it('clamps to [0, 1] across the dial range', () => {
    expect(speedFraction(0, 26)).toBe(0)
    expect(speedFraction(13, 26)).toBeCloseTo(0.5, 6)
    expect(speedFraction(26, 26)).toBe(1)
    expect(speedFraction(50, 26)).toBe(1)
  })

  it('returns 0 for reverse so the needle never swings under the dial', () => {
    expect(speedFraction(-5, 26)).toBe(0)
  })

  it('is defensive against invalid maxSpeed', () => {
    expect(speedFraction(10, 0)).toBe(0)
    expect(speedFraction(10, -1)).toBe(0)
    expect(speedFraction(10, NaN)).toBe(0)
  })

  it('returns 0 for non-finite raw speed', () => {
    expect(speedFraction(NaN, 26)).toBe(0)
    expect(speedFraction(Infinity, 26)).toBe(0)
  })
})
