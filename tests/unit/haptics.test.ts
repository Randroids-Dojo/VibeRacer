import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_HAPTIC_MODE,
  HAPTIC_MODES,
  HAPTIC_MODE_DESCRIPTIONS,
  HAPTIC_MODE_LABELS,
  HAPTIC_OUTCOMES,
  HAPTIC_PATTERNS,
  HAPTIC_PATTERN_MAX_MS,
  HapticModeSchema,
  fireHaptic,
  isHapticMode,
  isHapticOutcome,
  isTouchRuntime,
  patternFor,
  patternTotalMs,
  shouldHapticFire,
} from '@/lib/haptics'

describe('HAPTIC_OUTCOMES', () => {
  it('exposes exactly the three documented outcomes in stable order', () => {
    expect(HAPTIC_OUTCOMES).toEqual(['lap', 'pb', 'record'])
  })

  it('every outcome has a non-empty pattern', () => {
    for (const outcome of HAPTIC_OUTCOMES) {
      const pattern = HAPTIC_PATTERNS[outcome]
      expect(Array.isArray(pattern)).toBe(true)
      expect(pattern.length).toBeGreaterThan(0)
    }
  })

  it('every pattern entry is a non-negative finite integer-ish ms duration', () => {
    for (const outcome of HAPTIC_OUTCOMES) {
      for (const v of HAPTIC_PATTERNS[outcome]) {
        expect(Number.isFinite(v)).toBe(true)
        expect(v).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('total wall-clock budget per pattern stays under HAPTIC_PATTERN_MAX_MS', () => {
    expect(HAPTIC_PATTERN_MAX_MS).toBeGreaterThan(0)
    for (const outcome of HAPTIC_OUTCOMES) {
      const total = patternTotalMs(HAPTIC_PATTERNS[outcome])
      expect(total).toBeGreaterThan(0)
      expect(total).toBeLessThanOrEqual(HAPTIC_PATTERN_MAX_MS)
    }
  })

  it('pb pattern is at least as substantial as lap pattern (escalation)', () => {
    expect(patternTotalMs(HAPTIC_PATTERNS.pb)).toBeGreaterThan(
      patternTotalMs(HAPTIC_PATTERNS.lap),
    )
  })

  it('record pattern is at least as substantial as pb pattern (escalation)', () => {
    expect(patternTotalMs(HAPTIC_PATTERNS.record)).toBeGreaterThan(
      patternTotalMs(HAPTIC_PATTERNS.pb),
    )
  })
})

describe('isHapticOutcome', () => {
  it('accepts every documented outcome', () => {
    for (const outcome of HAPTIC_OUTCOMES) {
      expect(isHapticOutcome(outcome)).toBe(true)
    }
  })

  it('rejects unknown strings, null, undefined, numbers, and objects', () => {
    expect(isHapticOutcome('LAP')).toBe(false)
    expect(isHapticOutcome('jingle')).toBe(false)
    expect(isHapticOutcome('')).toBe(false)
    expect(isHapticOutcome(null)).toBe(false)
    expect(isHapticOutcome(undefined)).toBe(false)
    expect(isHapticOutcome(0)).toBe(false)
    expect(isHapticOutcome({})).toBe(false)
  })
})

describe('HAPTIC_MODES', () => {
  it('exposes exactly the three documented modes in stable order', () => {
    expect(HAPTIC_MODES).toEqual(['off', 'auto', 'on'])
  })

  it('default mode is one of the documented modes', () => {
    expect(HAPTIC_MODES).toContain(DEFAULT_HAPTIC_MODE)
  })

  it('default is auto so touch players opt in by default and desktop opts out', () => {
    expect(DEFAULT_HAPTIC_MODE).toBe('auto')
  })

  it('every mode has a non-empty label and description', () => {
    for (const mode of HAPTIC_MODES) {
      expect(HAPTIC_MODE_LABELS[mode]).toMatch(/\S/)
      expect(HAPTIC_MODE_DESCRIPTIONS[mode]).toMatch(/\S/)
    }
  })

  it('labels and descriptions never use em-dashes (writing rule)', () => {
    for (const mode of HAPTIC_MODES) {
      expect(HAPTIC_MODE_LABELS[mode]).not.toContain('\u2014')
      expect(HAPTIC_MODE_DESCRIPTIONS[mode]).not.toContain('\u2014')
    }
  })
})

describe('HapticModeSchema', () => {
  it('accepts every valid mode', () => {
    for (const mode of HAPTIC_MODES) {
      expect(HapticModeSchema.safeParse(mode).success).toBe(true)
    }
  })

  it('rejects unknown values', () => {
    expect(HapticModeSchema.safeParse('AUTO').success).toBe(false)
    expect(HapticModeSchema.safeParse('').success).toBe(false)
    expect(HapticModeSchema.safeParse('buzz').success).toBe(false)
    expect(HapticModeSchema.safeParse(0).success).toBe(false)
    expect(HapticModeSchema.safeParse(null).success).toBe(false)
    expect(HapticModeSchema.safeParse(undefined).success).toBe(false)
    expect(HapticModeSchema.safeParse({}).success).toBe(false)
  })
})

describe('isHapticMode', () => {
  it('mirrors HAPTIC_MODES membership', () => {
    for (const mode of HAPTIC_MODES) {
      expect(isHapticMode(mode)).toBe(true)
    }
    expect(isHapticMode('AUTO')).toBe(false)
    expect(isHapticMode('')).toBe(false)
    expect(isHapticMode(null)).toBe(false)
    expect(isHapticMode(undefined)).toBe(false)
    expect(isHapticMode(0)).toBe(false)
    expect(isHapticMode({})).toBe(false)
  })
})

describe('shouldHapticFire', () => {
  it('off always suppresses regardless of touch detection', () => {
    expect(shouldHapticFire('off', true)).toBe(false)
    expect(shouldHapticFire('off', false)).toBe(false)
  })

  it('on always fires regardless of touch detection', () => {
    expect(shouldHapticFire('on', true)).toBe(true)
    expect(shouldHapticFire('on', false)).toBe(true)
  })

  it('auto fires only when the runtime looks like a touch device', () => {
    expect(shouldHapticFire('auto', true)).toBe(true)
    expect(shouldHapticFire('auto', false)).toBe(false)
  })
})

describe('patternFor', () => {
  it('returns a defensive copy (mutating result does not poison the table)', () => {
    const a = patternFor('lap')
    a[0] = 9999
    const b = patternFor('lap')
    expect(b[0]).not.toBe(9999)
    expect(b).toEqual([...HAPTIC_PATTERNS.lap])
  })

  it('returns the documented pattern for each outcome', () => {
    for (const outcome of HAPTIC_OUTCOMES) {
      expect(patternFor(outcome)).toEqual([...HAPTIC_PATTERNS[outcome]])
    }
  })
})

describe('patternTotalMs', () => {
  it('sums numeric entries', () => {
    expect(patternTotalMs([10, 20, 30])).toBe(60)
  })

  it('returns 0 for an empty pattern (no work to schedule)', () => {
    expect(patternTotalMs([])).toBe(0)
  })

  it('returns 0 when any entry is non-finite or negative (defensive)', () => {
    expect(patternTotalMs([10, NaN])).toBe(0)
    expect(patternTotalMs([10, Infinity])).toBe(0)
    expect(patternTotalMs([10, -1])).toBe(0)
  })

  it('treats zero entries as additive (allowed; some platforms allow gap-only patterns)', () => {
    expect(patternTotalMs([0, 0, 0])).toBe(0)
    expect(patternTotalMs([10, 0, 10])).toBe(20)
  })
})

describe('isTouchRuntime', () => {
  const originalNavigator = globalThis.navigator
  const originalWindow = globalThis.window

  afterEach(() => {
    if (originalNavigator) {
      Object.defineProperty(globalThis, 'navigator', {
        value: originalNavigator,
        configurable: true,
        writable: true,
      })
    }
    if (originalWindow) {
      Object.defineProperty(globalThis, 'window', {
        value: originalWindow,
        configurable: true,
        writable: true,
      })
    }
  })

  it('returns false when window is missing (SSR)', () => {
    Object.defineProperty(globalThis, 'window', {
      value: undefined,
      configurable: true,
      writable: true,
    })
    expect(isTouchRuntime()).toBe(false)
  })

  it('returns true when matchMedia coarse pointer query matches', () => {
    Object.defineProperty(globalThis, 'window', {
      value: {
        matchMedia: () => ({ matches: true }),
      },
      configurable: true,
      writable: true,
    })
    expect(isTouchRuntime()).toBe(true)
  })

  it('returns false when matchMedia coarse pointer query does not match and no maxTouchPoints', () => {
    Object.defineProperty(globalThis, 'window', {
      value: {
        matchMedia: () => ({ matches: false }),
      },
      configurable: true,
      writable: true,
    })
    Object.defineProperty(globalThis, 'navigator', {
      value: {},
      configurable: true,
      writable: true,
    })
    expect(isTouchRuntime()).toBe(false)
  })

  it('falls back to navigator.maxTouchPoints when matchMedia is unavailable', () => {
    Object.defineProperty(globalThis, 'window', {
      value: {},
      configurable: true,
      writable: true,
    })
    Object.defineProperty(globalThis, 'navigator', {
      value: { maxTouchPoints: 5 },
      configurable: true,
      writable: true,
    })
    expect(isTouchRuntime()).toBe(true)
  })

  it('returns false on a desktop runtime with no touch points', () => {
    Object.defineProperty(globalThis, 'window', {
      value: {},
      configurable: true,
      writable: true,
    })
    Object.defineProperty(globalThis, 'navigator', {
      value: { maxTouchPoints: 0 },
      configurable: true,
      writable: true,
    })
    expect(isTouchRuntime()).toBe(false)
  })

  it('swallows a thrown matchMedia and falls back to maxTouchPoints', () => {
    Object.defineProperty(globalThis, 'window', {
      value: {
        matchMedia: () => {
          throw new Error('blocked')
        },
      },
      configurable: true,
      writable: true,
    })
    Object.defineProperty(globalThis, 'navigator', {
      value: { maxTouchPoints: 1 },
      configurable: true,
      writable: true,
    })
    expect(isTouchRuntime()).toBe(true)
  })
})

describe('fireHaptic', () => {
  const originalNavigator = globalThis.navigator

  afterEach(() => {
    if (originalNavigator) {
      Object.defineProperty(globalThis, 'navigator', {
        value: originalNavigator,
        configurable: true,
        writable: true,
      })
    }
  })

  it('returns false for an unknown outcome', () => {
    expect(fireHaptic('jingle' as never)).toBe(false)
  })

  it('returns false when navigator is missing', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: undefined,
      configurable: true,
      writable: true,
    })
    expect(fireHaptic('lap')).toBe(false)
  })

  it('returns false when navigator.vibrate is not a function (no Vibration API)', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: {},
      configurable: true,
      writable: true,
    })
    expect(fireHaptic('lap')).toBe(false)
  })

  it('passes the documented pattern to navigator.vibrate and returns its boolean result', () => {
    const calls: Array<number | number[]> = []
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        vibrate: (p: number | number[]) => {
          calls.push(p)
          return true
        },
      },
      configurable: true,
      writable: true,
    })
    expect(fireHaptic('pb')).toBe(true)
    expect(calls).toEqual([[...HAPTIC_PATTERNS.pb]])
  })

  it('passes through a falsy navigator.vibrate return as false', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        vibrate: () => false,
      },
      configurable: true,
      writable: true,
    })
    expect(fireHaptic('lap')).toBe(false)
  })

  it('swallows a thrown navigator.vibrate and returns false', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        vibrate: () => {
          throw new Error('blocked')
        },
      },
      configurable: true,
      writable: true,
    })
    expect(fireHaptic('record')).toBe(false)
  })

  it('uses a fresh pattern array per call (caller mutation cannot poison the table)', () => {
    const seen: Array<number[]> = []
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        vibrate: (p: number | number[]) => {
          if (Array.isArray(p)) {
            seen.push(p)
            p.fill(0)
          }
          return true
        },
      },
      configurable: true,
      writable: true,
    })
    fireHaptic('record')
    fireHaptic('record')
    expect(seen.length).toBe(2)
    expect(seen[0]).not.toBe(seen[1])
    // The constant table is unchanged regardless of caller mutation.
    expect(patternTotalMs(HAPTIC_PATTERNS.record)).toBeGreaterThan(0)
  })
})

// Light coverage to make sure vi remains imported for future test additions.
describe('vi sanity', () => {
  it('vi.fn is available', () => {
    const fn = vi.fn()
    fn()
    expect(fn).toHaveBeenCalled()
  })
})
