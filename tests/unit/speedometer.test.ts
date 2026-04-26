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
  topSpeedFraction,
  unitLabel,
  updateTopSpeed,
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

describe('updateTopSpeed', () => {
  it('seeds the peak from the first positive frame', () => {
    const result = updateTopSpeed(0, 12.5)
    expect(result.topUs).toBe(12.5)
    expect(result.becameTop).toBe(true)
  })

  it('advances the peak only when the live magnitude exceeds the prior best', () => {
    const first = updateTopSpeed(0, 10)
    const same = updateTopSpeed(first.topUs, 10)
    const slower = updateTopSpeed(first.topUs, 9.5)
    const faster = updateTopSpeed(first.topUs, 14.7)
    expect(same.topUs).toBe(10)
    expect(same.becameTop).toBe(false)
    expect(slower.topUs).toBe(10)
    expect(slower.becameTop).toBe(false)
    expect(faster.topUs).toBe(14.7)
    expect(faster.becameTop).toBe(true)
  })

  it('treats reverse driving as its absolute speed', () => {
    const result = updateTopSpeed(0, -8)
    expect(result.topUs).toBe(8)
    expect(result.becameTop).toBe(true)
    const next = updateTopSpeed(result.topUs, -7)
    expect(next.topUs).toBe(8)
    expect(next.becameTop).toBe(false)
  })

  it('refuses to advance the peak from a non-finite live frame', () => {
    const a = updateTopSpeed(15, NaN)
    const b = updateTopSpeed(15, Infinity)
    const c = updateTopSpeed(15, -Infinity)
    expect(a).toEqual({ topUs: 15, becameTop: false })
    expect(b).toEqual({ topUs: 15, becameTop: false })
    expect(c).toEqual({ topUs: 15, becameTop: false })
  })

  it('repairs a non-finite or non-positive prior peak before comparing', () => {
    expect(updateTopSpeed(NaN, 12).topUs).toBe(12)
    expect(updateTopSpeed(Infinity, 12).topUs).toBe(12)
    expect(updateTopSpeed(-5, 12).topUs).toBe(12)
    expect(updateTopSpeed(0, 0).topUs).toBe(0)
    expect(updateTopSpeed(0, 0).becameTop).toBe(false)
  })

  it('keeps the prior peak through a momentary slowdown', () => {
    let top = 0
    for (const sample of [4, 9, 18, 22, 21.9, 18, 0]) {
      top = updateTopSpeed(top, sample).topUs
    }
    expect(top).toBe(22)
  })
})

describe('topSpeedFraction', () => {
  it('is zero when no peak has been recorded yet', () => {
    expect(topSpeedFraction(0, 26)).toBe(0)
  })

  it('mirrors speedFraction across the dial range', () => {
    expect(topSpeedFraction(13, 26)).toBeCloseTo(0.5, 6)
    expect(topSpeedFraction(26, 26)).toBe(1)
    expect(topSpeedFraction(40, 26)).toBe(1)
  })

  it('is defensive against bad inputs', () => {
    expect(topSpeedFraction(NaN, 26)).toBe(0)
    expect(topSpeedFraction(Infinity, 26)).toBe(0)
    expect(topSpeedFraction(-5, 26)).toBe(0)
    expect(topSpeedFraction(10, 0)).toBe(0)
    expect(topSpeedFraction(10, -1)).toBe(0)
    expect(topSpeedFraction(10, NaN)).toBe(0)
  })
})
