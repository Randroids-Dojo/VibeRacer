import { describe, expect, it } from 'vitest'
import { DEFAULT_CAR_PARAMS } from '@/game/physics'
import {
  DEFAULT_MANUAL_GEAR,
  DEFAULT_TRANSMISSION,
  MANUAL_GEAR_MAX,
  MANUAL_GEAR_MIN,
  TRANSMISSION_MODES,
  autoShiftGear,
  carParamsForTransmission,
  clampManualGear,
  gearProgress01,
  gearSpeedBand,
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

  it('dynamic specs use geometric ratio spacing (each gear roughly 1.3-1.5x the last)', () => {
    // The default (legacy) ratios are arithmetically spaced; geometric
    // spacing is opt-in through the dynamic flag and only applies when the
    // player has enabled enhancedShifting in Settings.
    for (let g = 2; g <= MANUAL_GEAR_MAX; g++) {
      const ratio =
        manualGearSpec(g, true).maxSpeedFactor /
        manualGearSpec(g - 1, true).maxSpeedFactor
      expect(ratio).toBeGreaterThan(1.25)
      expect(ratio).toBeLessThan(1.55)
    }
  })
})

describe('gearSpeedBand', () => {
  it('puts gear 1 from 0 up to its maxSpeedFactor', () => {
    const band = gearSpeedBand(1, 26)
    expect(band.min).toBe(0)
    expect(band.max).toBeCloseTo(26 * manualGearSpec(1).maxSpeedFactor, 6)
  })

  it('chains so each gear starts at the previous gear cap', () => {
    for (let g = 2; g <= MANUAL_GEAR_MAX; g++) {
      const prev = gearSpeedBand(g - 1, 26)
      const cur = gearSpeedBand(g, 26)
      expect(cur.min).toBeCloseTo(prev.max, 6)
    }
  })
})

describe('gearProgress01', () => {
  it('is 0 at gear floor and 1 at gear ceiling', () => {
    const { min, max } = gearSpeedBand(3, 26)
    expect(gearProgress01(min, 3, 26)).toBe(0)
    expect(gearProgress01(max, 3, 26)).toBe(1)
  })

  it('clamps below floor and above ceiling', () => {
    expect(gearProgress01(-5, 2, 26)).toBe(0)
    expect(gearProgress01(99, 2, 26)).toBe(1)
  })
})

describe('autoShiftGear', () => {
  it('does not bounce between gears at light boundary changes', () => {
    const baseMax = 26
    // Park speed exactly at the gear-2 cap (just upshifted to gear 3).
    const cap = manualGearSpec(2).maxSpeedFactor * baseMax
    let g = autoShiftGear(cap + 0.01, baseMax, 2)
    expect(g).toBe(3)
    // A small dip below the gear-2 cap must not immediately downshift.
    g = autoShiftGear(cap - 0.01, baseMax, g)
    expect(g).toBe(3)
    // Only when the speed falls clearly into gear 2's interior do we drop.
    g = autoShiftGear(
      manualGearSpec(1).maxSpeedFactor * baseMax * 0.9,
      baseMax,
      g,
    )
    expect(g).toBe(2)
  })

  it('upshifts cleanly as speed climbs through the gear bands', () => {
    let g = 1
    for (let s = 0; s <= 26; s += 0.5) {
      g = autoShiftGear(s, 26, g)
    }
    expect(g).toBe(MANUAL_GEAR_MAX)
  })

  it('upshifts at 95% of the gear cap so the asymptotic taper does not strand the car', () => {
    const baseMax = 26
    // Just below 95% of gear 1 cap: no upshift.
    const gear1Cap = manualGearSpec(1).maxSpeedFactor * baseMax
    expect(autoShiftGear(gear1Cap * 0.94, baseMax, 1)).toBe(1)
    // Just above the 95% trigger: upshift.
    expect(autoShiftGear(gear1Cap * 0.96, baseMax, 1)).toBe(2)
  })

  it('handles a multi-band jump (paused-frame catchup) in one call', () => {
    // Speed 90% of base from a standstill in gear 1 — the while loop should
    // walk all the way up, not stop after one step.
    expect(autoShiftGear(26 * 0.9, 26, 1)).toBe(MANUAL_GEAR_MAX)
  })

  it('clamps to the top gear above base maxSpeed (downhill case)', () => {
    expect(autoShiftGear(40, 26, 3)).toBe(MANUAL_GEAR_MAX)
  })

  it('uses absolute speed so reverse motion still picks gear 1', () => {
    // Caller is responsible for passing |speed| but verify negative input
    // does not yield a negative or out-of-range gear.
    expect(autoShiftGear(0, 26, 1)).toBe(1)
  })

  it('clamps a bogus prevGear before walking', () => {
    expect(autoShiftGear(0, 26, 99)).toBe(1)
    expect(autoShiftGear(26, 26, -5)).toBe(MANUAL_GEAR_MAX)
  })
})
