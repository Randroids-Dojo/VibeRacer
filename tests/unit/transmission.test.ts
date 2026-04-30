import { describe, expect, it } from 'vitest'
import { DEFAULT_CAR_PARAMS } from '@/game/physics'
import {
  DEFAULT_MANUAL_GEAR,
  DEFAULT_TRANSMISSION,
  MANUAL_GEAR_MAX,
  MANUAL_GEAR_MIN,
  TRANSMISSION_MODES,
  carParamsForTransmission,
  clampManualGear,
  isTransmissionMode,
  manualGearSpec,
  shiftManualGear,
} from '@/game/transmission'

describe('transmission helpers', () => {
  it('keeps automatic as the legacy default', () => {
    expect(DEFAULT_TRANSMISSION).toBe('automatic')
    expect(TRANSMISSION_MODES).toEqual(['automatic', 'manual'])
  })

  it('guards transmission mode values', () => {
    expect(isTransmissionMode('automatic')).toBe(true)
    expect(isTransmissionMode('manual')).toBe(true)
    expect(isTransmissionMode('stick')).toBe(false)
    expect(isTransmissionMode(null)).toBe(false)
  })

  it('clamps manual gears to the supported range', () => {
    expect(clampManualGear(-10)).toBe(MANUAL_GEAR_MIN)
    expect(clampManualGear(3.4)).toBe(3)
    expect(clampManualGear(99)).toBe(MANUAL_GEAR_MAX)
    expect(clampManualGear(Number.NaN)).toBe(DEFAULT_MANUAL_GEAR)
  })

  it('shifts one gear at a time without leaving range', () => {
    expect(shiftManualGear(1, 'down')).toBe(1)
    expect(shiftManualGear(1, 'up')).toBe(2)
    expect(shiftManualGear(5, 'up')).toBe(5)
    expect(shiftManualGear(5, 'down')).toBe(4)
  })

  it('makes low gears quick but speed-limited and high gears slower but fast', () => {
    const first = manualGearSpec(1)
    const fifth = manualGearSpec(5)
    expect(first.maxSpeedFactor).toBeLessThan(fifth.maxSpeedFactor)
    expect(first.accelFactor).toBeGreaterThan(fifth.accelFactor)
  })

  it('leaves car params untouched in automatic mode', () => {
    expect(carParamsForTransmission(DEFAULT_CAR_PARAMS, 'automatic', 1)).toBe(
      DEFAULT_CAR_PARAMS,
    )
  })

  it('derives manual gear params from the base tuning', () => {
    const first = carParamsForTransmission(DEFAULT_CAR_PARAMS, 'manual', 1)
    const fifth = carParamsForTransmission(DEFAULT_CAR_PARAMS, 'manual', 5)
    expect(first.maxSpeed).toBeLessThan(fifth.maxSpeed)
    expect(first.accel).toBeGreaterThan(fifth.accel)
    expect(fifth.maxSpeed).toBeCloseTo(DEFAULT_CAR_PARAMS.maxSpeed)
  })
})
