import { describe, it, expect } from 'vitest'
import {
  DEFAULT_TIME_OF_DAY,
  SUN_DISTANCE,
  TIME_OF_DAY_DESCRIPTIONS,
  TIME_OF_DAY_LABELS,
  TIME_OF_DAY_NAMES,
  TimeOfDaySchema,
  getLightingPreset,
  isTimeOfDay,
} from '@/lib/lighting'

describe('TIME_OF_DAY_NAMES', () => {
  it('is non-empty so the picker always has at least one option', () => {
    expect(TIME_OF_DAY_NAMES.length).toBeGreaterThan(0)
  })

  it('every name is unique', () => {
    const seen = new Set<string>()
    for (const n of TIME_OF_DAY_NAMES) {
      expect(seen.has(n)).toBe(false)
      seen.add(n)
    }
  })

  it('has a label and description for every name', () => {
    for (const n of TIME_OF_DAY_NAMES) {
      expect(typeof TIME_OF_DAY_LABELS[n]).toBe('string')
      expect(TIME_OF_DAY_LABELS[n].length).toBeGreaterThan(0)
      expect(typeof TIME_OF_DAY_DESCRIPTIONS[n]).toBe('string')
      expect(TIME_OF_DAY_DESCRIPTIONS[n].length).toBeGreaterThan(0)
    }
  })

  it("includes 'noon' so the legacy default round-trips", () => {
    expect((TIME_OF_DAY_NAMES as readonly string[]).includes('noon')).toBe(true)
    expect(DEFAULT_TIME_OF_DAY).toBe('noon')
  })
})

describe('TimeOfDaySchema', () => {
  it('accepts every preset name', () => {
    for (const n of TIME_OF_DAY_NAMES) {
      expect(TimeOfDaySchema.parse(n)).toBe(n)
    }
  })

  it('rejects unknown strings', () => {
    expect(() => TimeOfDaySchema.parse('overcast')).toThrow()
    expect(() => TimeOfDaySchema.parse('')).toThrow()
    expect(() => TimeOfDaySchema.parse(123)).toThrow()
  })
})

describe('isTimeOfDay', () => {
  it('returns true for known preset names', () => {
    for (const n of TIME_OF_DAY_NAMES) {
      expect(isTimeOfDay(n)).toBe(true)
    }
  })

  it('returns false for unknown values', () => {
    expect(isTimeOfDay('overcast')).toBe(false)
    expect(isTimeOfDay(null)).toBe(false)
    expect(isTimeOfDay(undefined)).toBe(false)
    expect(isTimeOfDay(0)).toBe(false)
    expect(isTimeOfDay({})).toBe(false)
  })
})

describe('getLightingPreset', () => {
  it('returns a fully-specified preset for every named slot', () => {
    for (const n of TIME_OF_DAY_NAMES) {
      const p = getLightingPreset(n)
      expect(p.skyColor).toBeGreaterThanOrEqual(0)
      expect(p.skyColor).toBeLessThanOrEqual(0xffffff)
      expect(p.groundColor).toBeGreaterThanOrEqual(0)
      expect(p.groundColor).toBeLessThanOrEqual(0xffffff)
      expect(p.ambientColor).toBeGreaterThanOrEqual(0)
      expect(p.ambientColor).toBeLessThanOrEqual(0xffffff)
      expect(p.sunColor).toBeGreaterThanOrEqual(0)
      expect(p.sunColor).toBeLessThanOrEqual(0xffffff)
      expect(p.ambientIntensity).toBeGreaterThan(0)
      expect(p.sunIntensity).toBeGreaterThan(0)
    }
  })

  it("the noon preset matches the legacy hardcoded scene exactly", () => {
    const p = getLightingPreset('noon')
    expect(p.skyColor).toBe(0x9ad8ff)
    expect(p.groundColor).toBe(0x6fb26f)
    expect(p.ambientColor).toBe(0xffffff)
    expect(p.ambientIntensity).toBeCloseTo(0.55, 6)
    expect(p.sunColor).toBe(0xffffff)
    expect(p.sunIntensity).toBeCloseTo(0.9, 6)
  })

  it('returns a unit sun direction (length 1) for every preset', () => {
    for (const n of TIME_OF_DAY_NAMES) {
      const d = getLightingPreset(n).sunDirection
      const len = Math.hypot(d.x, d.y, d.z)
      expect(len).toBeCloseTo(1, 5)
    }
  })

  it('the morning sun comes from the east (positive X) and is low (small Y)', () => {
    const d = getLightingPreset('morning').sunDirection
    expect(d.x).toBeGreaterThan(0)
    expect(d.y).toBeGreaterThan(0)
    expect(d.y).toBeLessThan(d.x)
  })

  it('the sunset sun comes from the west (negative X)', () => {
    const d = getLightingPreset('sunset').sunDirection
    expect(d.x).toBeLessThan(0)
  })

  it('the night preset is dimmer than noon', () => {
    const noon = getLightingPreset('noon')
    const night = getLightingPreset('night')
    expect(night.sunIntensity).toBeLessThan(noon.sunIntensity)
    expect(night.ambientIntensity).toBeLessThan(noon.ambientIntensity)
  })

  it('falls back to the default preset for an unknown name (defensive)', () => {
    // The signature is typed, but JS callers can sneak through. Falling back
    // beats throwing in a code path that runs every frame.
    const bogus = getLightingPreset('overcast' as never)
    const fallback = getLightingPreset(DEFAULT_TIME_OF_DAY)
    expect(bogus.skyColor).toBe(fallback.skyColor)
    expect(bogus.sunIntensity).toBe(fallback.sunIntensity)
  })

  it('returns a fresh object so callers can mutate safely', () => {
    const a = getLightingPreset('noon')
    a.sunIntensity = 0
    a.sunDirection.x = 999
    const b = getLightingPreset('noon')
    expect(b.sunIntensity).not.toBe(0)
    expect(b.sunDirection.x).not.toBe(999)
  })
})

describe('dawn and dusk presets', () => {
  it('dawn is in the canonical names list', () => {
    expect((TIME_OF_DAY_NAMES as readonly string[]).includes('dawn')).toBe(true)
  })

  it('dusk is in the canonical names list', () => {
    expect((TIME_OF_DAY_NAMES as readonly string[]).includes('dusk')).toBe(true)
  })

  it('dawn sun comes from the east (positive X) and is low (small Y)', () => {
    const d = getLightingPreset('dawn').sunDirection
    expect(d.x).toBeGreaterThan(0)
    expect(d.y).toBeGreaterThan(0)
    expect(d.y).toBeLessThan(d.x)
  })

  it('dusk sun comes from the west (negative X) and is low (small Y)', () => {
    const d = getLightingPreset('dusk').sunDirection
    expect(d.x).toBeLessThan(0)
    expect(d.y).toBeGreaterThan(0)
    // Use absolute value of x since dusk x is negative.
    expect(d.y).toBeLessThan(Math.abs(d.x))
  })

  it('dawn sits between night and morning brightness', () => {
    const dawn = getLightingPreset('dawn')
    const morning = getLightingPreset('morning')
    const night = getLightingPreset('night')
    expect(dawn.sunIntensity).toBeGreaterThan(night.sunIntensity)
    expect(dawn.sunIntensity).toBeLessThan(morning.sunIntensity)
  })

  it('dusk sits between sunset and night brightness', () => {
    const dusk = getLightingPreset('dusk')
    const sunset = getLightingPreset('sunset')
    const night = getLightingPreset('night')
    expect(dusk.sunIntensity).toBeLessThan(sunset.sunIntensity)
    expect(dusk.sunIntensity).toBeLessThanOrEqual(night.sunIntensity * 1.1)
  })
})

describe('SUN_DISTANCE', () => {
  it('is a positive scene-scale magnitude', () => {
    expect(SUN_DISTANCE).toBeGreaterThan(0)
    expect(Number.isFinite(SUN_DISTANCE)).toBe(true)
  })
})
