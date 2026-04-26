import { describe, it, expect } from 'vitest'
import {
  DEFAULT_TIME_OF_DAY_CYCLE,
  TIME_OF_DAY_CYCLE_DESCRIPTIONS,
  TIME_OF_DAY_CYCLE_LABELS,
  TIME_OF_DAY_CYCLE_MODES,
  TIME_OF_DAY_CYCLE_ORDER,
  TIME_OF_DAY_CYCLE_PERIOD_MS,
  TimeOfDayCycleModeSchema,
  activeTimeOfDayAt,
  cycleIndexFor,
  isTimeOfDayCycleMode,
} from '@/lib/timeOfDayCycle'
import { TIME_OF_DAY_NAMES } from '@/lib/lighting'

describe('TIME_OF_DAY_CYCLE_MODES', () => {
  it('lists the three documented modes in stable order', () => {
    expect(TIME_OF_DAY_CYCLE_MODES).toEqual(['off', 'slow', 'fast'])
  })

  it('has unique mode names', () => {
    expect(new Set(TIME_OF_DAY_CYCLE_MODES).size).toBe(
      TIME_OF_DAY_CYCLE_MODES.length,
    )
  })

  it('defaults to off so legacy stored payloads keep their existing screen', () => {
    expect(DEFAULT_TIME_OF_DAY_CYCLE).toBe('off')
  })

  it('exposes a non-empty label and description for every mode', () => {
    for (const mode of TIME_OF_DAY_CYCLE_MODES) {
      expect(TIME_OF_DAY_CYCLE_LABELS[mode]).toBeTruthy()
      expect(TIME_OF_DAY_CYCLE_DESCRIPTIONS[mode]).toBeTruthy()
      expect(TIME_OF_DAY_CYCLE_LABELS[mode].length).toBeGreaterThan(0)
      expect(TIME_OF_DAY_CYCLE_DESCRIPTIONS[mode].length).toBeGreaterThan(0)
    }
  })

  it('has no em-dashes in any player-facing string', () => {
    // Project-wide policy: em-dashes are banned in writing.
    for (const mode of TIME_OF_DAY_CYCLE_MODES) {
      expect(TIME_OF_DAY_CYCLE_LABELS[mode]).not.toMatch(/—/)
      expect(TIME_OF_DAY_CYCLE_DESCRIPTIONS[mode]).not.toMatch(/—/)
    }
  })

  it('has unique labels per mode so the picker reads cleanly', () => {
    const labels = TIME_OF_DAY_CYCLE_MODES.map(
      (m) => TIME_OF_DAY_CYCLE_LABELS[m],
    )
    expect(new Set(labels).size).toBe(labels.length)
  })
})

describe('TIME_OF_DAY_CYCLE_PERIOD_MS', () => {
  it("zero for 'off' so the cycle effect short-circuits", () => {
    expect(TIME_OF_DAY_CYCLE_PERIOD_MS.off).toBe(0)
  })

  it("'slow' is a positive finite number of milliseconds", () => {
    expect(Number.isFinite(TIME_OF_DAY_CYCLE_PERIOD_MS.slow)).toBe(true)
    expect(TIME_OF_DAY_CYCLE_PERIOD_MS.slow).toBeGreaterThan(0)
  })

  it("'fast' is a positive finite number of milliseconds", () => {
    expect(Number.isFinite(TIME_OF_DAY_CYCLE_PERIOD_MS.fast)).toBe(true)
    expect(TIME_OF_DAY_CYCLE_PERIOD_MS.fast).toBeGreaterThan(0)
  })

  it("'fast' is strictly faster than 'slow' so the labels read honestly", () => {
    expect(TIME_OF_DAY_CYCLE_PERIOD_MS.fast).toBeLessThan(
      TIME_OF_DAY_CYCLE_PERIOD_MS.slow,
    )
  })

  it("'slow' is at least one minute so a typical lap does not snap mid-corner", () => {
    expect(TIME_OF_DAY_CYCLE_PERIOD_MS.slow).toBeGreaterThanOrEqual(60_000)
  })
})

describe('TIME_OF_DAY_CYCLE_ORDER', () => {
  it('contains every documented time-of-day preset exactly once', () => {
    expect(TIME_OF_DAY_CYCLE_ORDER.length).toBe(TIME_OF_DAY_NAMES.length)
    for (const name of TIME_OF_DAY_NAMES) {
      expect(TIME_OF_DAY_CYCLE_ORDER).toContain(name)
    }
    expect(new Set(TIME_OF_DAY_CYCLE_ORDER).size).toBe(
      TIME_OF_DAY_CYCLE_ORDER.length,
    )
  })

  it('starts at noon so a fresh session reads as "midday"', () => {
    expect(TIME_OF_DAY_CYCLE_ORDER[0]).toBe('noon')
  })

  it('mirrors a real day so the visual pacing feels natural', () => {
    expect(TIME_OF_DAY_CYCLE_ORDER).toEqual(['noon', 'morning', 'sunset', 'night'])
  })
})

describe('TimeOfDayCycleModeSchema', () => {
  it('accepts every documented mode', () => {
    for (const mode of TIME_OF_DAY_CYCLE_MODES) {
      expect(TimeOfDayCycleModeSchema.safeParse(mode).success).toBe(true)
    }
  })

  it('rejects unknown strings', () => {
    expect(TimeOfDayCycleModeSchema.safeParse('instant').success).toBe(false)
    expect(TimeOfDayCycleModeSchema.safeParse('').success).toBe(false)
    expect(TimeOfDayCycleModeSchema.safeParse('OFF').success).toBe(false)
  })

  it('rejects non-string inputs', () => {
    expect(TimeOfDayCycleModeSchema.safeParse(0).success).toBe(false)
    expect(TimeOfDayCycleModeSchema.safeParse(null).success).toBe(false)
    expect(TimeOfDayCycleModeSchema.safeParse(undefined).success).toBe(false)
    expect(TimeOfDayCycleModeSchema.safeParse({}).success).toBe(false)
  })
})

describe('isTimeOfDayCycleMode', () => {
  it('returns true for every documented mode', () => {
    for (const mode of TIME_OF_DAY_CYCLE_MODES) {
      expect(isTimeOfDayCycleMode(mode)).toBe(true)
    }
  })

  it('returns false for unknown strings and non-string inputs', () => {
    expect(isTimeOfDayCycleMode('instant')).toBe(false)
    expect(isTimeOfDayCycleMode('')).toBe(false)
    expect(isTimeOfDayCycleMode(0)).toBe(false)
    expect(isTimeOfDayCycleMode(null)).toBe(false)
    expect(isTimeOfDayCycleMode(undefined)).toBe(false)
    expect(isTimeOfDayCycleMode({})).toBe(false)
  })
})

describe('cycleIndexFor', () => {
  it('returns the canonical index for every preset in the rotation', () => {
    expect(cycleIndexFor('noon')).toBe(0)
    expect(cycleIndexFor('morning')).toBe(1)
    expect(cycleIndexFor('sunset')).toBe(2)
    expect(cycleIndexFor('night')).toBe(3)
  })

  it('falls back to 0 (noon) for null / undefined', () => {
    expect(cycleIndexFor(null)).toBe(0)
    expect(cycleIndexFor(undefined)).toBe(0)
  })
})

describe('activeTimeOfDayAt', () => {
  it("'off' returns the base value at any time", () => {
    expect(activeTimeOfDayAt(0, 0, 'off', 'noon')).toBe('noon')
    expect(activeTimeOfDayAt(0, 99_999_999, 'off', 'sunset')).toBe('sunset')
  })

  it('returns the base value at startMs for any non-off mode', () => {
    expect(activeTimeOfDayAt(1_000, 1_000, 'slow', 'noon')).toBe('noon')
    expect(activeTimeOfDayAt(1_000, 1_000, 'fast', 'morning')).toBe('morning')
  })

  it("'fast' rotates one step every fast period from noon", () => {
    const period = TIME_OF_DAY_CYCLE_PERIOD_MS.fast
    const start = 1_000
    expect(activeTimeOfDayAt(start, start + period, 'fast', 'noon')).toBe('morning')
    expect(activeTimeOfDayAt(start, start + 2 * period, 'fast', 'noon')).toBe(
      'sunset',
    )
    expect(activeTimeOfDayAt(start, start + 3 * period, 'fast', 'noon')).toBe(
      'night',
    )
    expect(activeTimeOfDayAt(start, start + 4 * period, 'fast', 'noon')).toBe(
      'noon',
    )
  })

  it("'slow' rotates one step every slow period from a non-noon base", () => {
    const period = TIME_OF_DAY_CYCLE_PERIOD_MS.slow
    const start = 5_000
    expect(activeTimeOfDayAt(start, start + period, 'slow', 'sunset')).toBe(
      'night',
    )
    expect(activeTimeOfDayAt(start, start + 2 * period, 'slow', 'sunset')).toBe(
      'noon',
    )
  })

  it('holds the same step across the full period interior', () => {
    const period = TIME_OF_DAY_CYCLE_PERIOD_MS.fast
    const start = 0
    expect(activeTimeOfDayAt(start, period - 1, 'fast', 'noon')).toBe('noon')
    expect(activeTimeOfDayAt(start, period, 'fast', 'noon')).toBe('morning')
    expect(activeTimeOfDayAt(start, period + 1, 'fast', 'noon')).toBe('morning')
    expect(activeTimeOfDayAt(start, 2 * period - 1, 'fast', 'noon')).toBe(
      'morning',
    )
  })

  it('clamps a reversed clock (nowMs < startMs) to the base value', () => {
    expect(activeTimeOfDayAt(10_000, 5_000, 'fast', 'sunset')).toBe('sunset')
  })

  it('falls back to the base on non-finite inputs', () => {
    expect(activeTimeOfDayAt(NaN, 1_000, 'fast', 'morning')).toBe('morning')
    expect(activeTimeOfDayAt(0, Infinity, 'slow', 'morning')).toBe('morning')
    expect(activeTimeOfDayAt(0, -Infinity, 'fast', 'noon')).toBe('noon')
  })

  it('is deterministic: same inputs produce the same output', () => {
    const a = activeTimeOfDayAt(1_000, 1_000_000, 'slow', 'morning')
    const b = activeTimeOfDayAt(1_000, 1_000_000, 'slow', 'morning')
    expect(a).toBe(b)
  })

  it('after one full rotation the value returns to the base', () => {
    const period = TIME_OF_DAY_CYCLE_PERIOD_MS.fast
    const start = 0
    const fullCycle = period * TIME_OF_DAY_CYCLE_ORDER.length
    for (const base of TIME_OF_DAY_CYCLE_ORDER) {
      expect(activeTimeOfDayAt(start, start + fullCycle, 'fast', base)).toBe(base)
    }
  })

  it('every step in the cycle yields a valid TimeOfDay name', () => {
    const period = TIME_OF_DAY_CYCLE_PERIOD_MS.fast
    const start = 0
    for (let i = 0; i < 12; i++) {
      const value = activeTimeOfDayAt(start, start + i * period, 'fast', 'noon')
      expect(TIME_OF_DAY_NAMES).toContain(value)
    }
  })
})
