import { describe, expect, it } from 'vitest'
import {
  dragGearHighSpeed,
  dragGearLowSpeed,
  dragTachFraction,
  TACH_RED_ZONE_VISUAL_START,
  TACH_REDLINE_FRACTION,
} from '@/lib/dragTachometer'
import {
  DRAG_MANUAL_GEAR_MAX,
  DRAG_MANUAL_GEAR_SPECS,
} from '@/game/dragTick'

const MAX = 30

describe('dragGearLowSpeed', () => {
  it('gear 1 starts at zero so the dial begins at empty', () => {
    expect(dragGearLowSpeed(1, MAX)).toBe(0)
  })

  it('every other gear starts at the previous gear cap', () => {
    for (let g = 2; g <= DRAG_MANUAL_GEAR_MAX; g++) {
      const prevCap = DRAG_MANUAL_GEAR_SPECS[g - 2].maxSpeedFactor * MAX
      expect(dragGearLowSpeed(g, MAX)).toBeCloseTo(prevCap, 6)
    }
  })

  it('out of range gears clamp into the valid table', () => {
    expect(dragGearLowSpeed(0, MAX)).toBe(0)
    expect(dragGearLowSpeed(99, MAX)).toBeCloseTo(
      DRAG_MANUAL_GEAR_SPECS[DRAG_MANUAL_GEAR_MAX - 2].maxSpeedFactor * MAX,
      6,
    )
  })

  it('returns zero for non-positive max speed', () => {
    expect(dragGearLowSpeed(3, 0)).toBe(0)
    expect(dragGearLowSpeed(3, -5)).toBe(0)
    expect(dragGearLowSpeed(3, Number.NaN)).toBe(0)
  })
})

describe('dragGearHighSpeed', () => {
  it('matches the gear cap from the spec table', () => {
    for (let g = 1; g <= DRAG_MANUAL_GEAR_MAX; g++) {
      const cap = DRAG_MANUAL_GEAR_SPECS[g - 1].maxSpeedFactor * MAX
      expect(dragGearHighSpeed(g, MAX)).toBeCloseTo(cap, 6)
    }
  })

  it('returns zero for non-positive max speed', () => {
    expect(dragGearHighSpeed(3, 0)).toBe(0)
    expect(dragGearHighSpeed(3, Number.NaN)).toBe(0)
  })
})

describe('dragTachFraction', () => {
  it('reads zero when the car is stationary in gear 1', () => {
    expect(dragTachFraction(0, 1, MAX)).toBe(0)
  })

  it('clamps negative speed (reverse) to zero', () => {
    expect(dragTachFraction(-5, 1, MAX)).toBe(0)
  })

  it('sweeps to 1.0 at the current gear cap', () => {
    for (let g = 1; g <= DRAG_MANUAL_GEAR_MAX; g++) {
      const cap = DRAG_MANUAL_GEAR_SPECS[g - 1].maxSpeedFactor * MAX
      expect(dragTachFraction(cap, g, MAX)).toBe(1)
    }
  })

  it('drops back to zero on every upshift', () => {
    // The whole point of the tach: at the moment of a perfect shift,
    // speed equals the old gear cap, which is the bottom of the new
    // gear band, so the fraction snaps from 1 to 0.
    for (let g = 1; g < DRAG_MANUAL_GEAR_MAX; g++) {
      const shiftSpeed = DRAG_MANUAL_GEAR_SPECS[g - 1].maxSpeedFactor * MAX
      expect(dragTachFraction(shiftSpeed, g, MAX)).toBe(1)
      expect(dragTachFraction(shiftSpeed, g + 1, MAX)).toBe(0)
    }
  })

  it('reads the mid-gear band linearly', () => {
    // Gear 2 spans [0.22, 0.36] of max. The midpoint of that band
    // should report 0.5 on the dial.
    const lowFactor = DRAG_MANUAL_GEAR_SPECS[0].maxSpeedFactor
    const highFactor = DRAG_MANUAL_GEAR_SPECS[1].maxSpeedFactor
    const mid = ((lowFactor + highFactor) / 2) * MAX
    expect(dragTachFraction(mid, 2, MAX)).toBeCloseTo(0.5, 6)
  })

  it('clamps past the gear cap (downshift overrun) to 1.0', () => {
    // Player slams into gear 1 while moving at gear-3 speeds. The dial
    // should pin to redline, not overshoot.
    const speed = DRAG_MANUAL_GEAR_SPECS[2].maxSpeedFactor * MAX
    expect(dragTachFraction(speed, 1, MAX)).toBe(1)
  })

  it('shrugs off non-finite inputs', () => {
    expect(dragTachFraction(Number.NaN, 1, MAX)).toBe(0)
    expect(dragTachFraction(5, 1, Number.NaN)).toBe(0)
    expect(dragTachFraction(5, 1, 0)).toBe(0)
  })

  it('redline visual band is wider than the precise threshold', () => {
    // The red arc on the dial should be readable from across the
    // screen, so the visual zone starts well before the precise
    // bog-detector trigger.
    expect(TACH_RED_ZONE_VISUAL_START).toBeLessThan(TACH_REDLINE_FRACTION)
    expect(TACH_REDLINE_FRACTION).toBeLessThanOrEqual(1)
    expect(TACH_RED_ZONE_VISUAL_START).toBeGreaterThan(0.5)
  })
})
