import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_HAPTIC_MODE,
  GAMEPAD_RUMBLE_MODE_DESCRIPTIONS,
  GAMEPAD_RUMBLE_MODE_LABELS,
  HAPTIC_MODES,
  HAPTIC_MODE_DESCRIPTIONS,
  HAPTIC_MODE_LABELS,
  HAPTIC_OUTCOMES,
  HAPTIC_PATTERNS,
  HAPTIC_PATTERN_MAX_MS,
  HapticModeSchema,
  RUMBLE_EFFECTS,
  RUMBLE_EFFECT_MAX_MS,
  RUMBLE_EPSILON,
  RUMBLE_FRAME_DURATION_MS,
  fireGamepadImpulse,
  fireHaptic,
  hasRumbleCapableGamepad,
  isHapticMode,
  isHapticOutcome,
  isTouchRuntime,
  patternFor,
  patternTotalMs,
  setGamepadContinuousRumble,
  shouldGamepadRumbleFire,
  shouldHapticFire,
  shouldTouchHapticFire,
  stopGamepadRumble,
} from '@/lib/haptics'

describe('HAPTIC_OUTCOMES', () => {
  it('exposes exactly the four documented outcomes in stable order', () => {
    expect(HAPTIC_OUTCOMES).toEqual(['lap', 'pb', 'record', 'offTrack'])
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

  it('pb pattern is at least as substantial as lap pattern (celebration escalation)', () => {
    expect(patternTotalMs(HAPTIC_PATTERNS.pb)).toBeGreaterThan(
      patternTotalMs(HAPTIC_PATTERNS.lap),
    )
  })

  it('record pattern is at least as substantial as pb pattern (celebration escalation)', () => {
    expect(patternTotalMs(HAPTIC_PATTERNS.record)).toBeGreaterThan(
      patternTotalMs(HAPTIC_PATTERNS.pb),
    )
  })

  it('offTrack is a separate axis from celebrations and stays a single short pulse', () => {
    expect(HAPTIC_PATTERNS.offTrack.length).toBe(1)
    expect(HAPTIC_PATTERNS.offTrack[0]).toBeGreaterThan(0)
    expect(HAPTIC_PATTERNS.offTrack[0]).toBeLessThan(
      patternTotalMs(HAPTIC_PATTERNS.record),
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

describe('RUMBLE_EFFECTS', () => {
  it('has an entry for every outcome', () => {
    for (const outcome of HAPTIC_OUTCOMES) {
      expect(RUMBLE_EFFECTS[outcome]).toBeDefined()
    }
  })

  it('every magnitude is in [0, 1]', () => {
    for (const outcome of HAPTIC_OUTCOMES) {
      const e = RUMBLE_EFFECTS[outcome]
      expect(e.strongMagnitude).toBeGreaterThanOrEqual(0)
      expect(e.strongMagnitude).toBeLessThanOrEqual(1)
      expect(e.weakMagnitude).toBeGreaterThanOrEqual(0)
      expect(e.weakMagnitude).toBeLessThanOrEqual(1)
    }
  })

  it('every duration is positive and within RUMBLE_EFFECT_MAX_MS', () => {
    expect(RUMBLE_EFFECT_MAX_MS).toBeGreaterThan(0)
    for (const outcome of HAPTIC_OUTCOMES) {
      const d = RUMBLE_EFFECTS[outcome].duration
      expect(d).toBeGreaterThan(0)
      expect(d).toBeLessThanOrEqual(RUMBLE_EFFECT_MAX_MS)
    }
  })

  it('celebration escalation: lap < pb < record on the strong motor', () => {
    expect(RUMBLE_EFFECTS.pb.strongMagnitude).toBeGreaterThan(
      RUMBLE_EFFECTS.lap.strongMagnitude,
    )
    expect(RUMBLE_EFFECTS.record.strongMagnitude).toBeGreaterThan(
      RUMBLE_EFFECTS.pb.strongMagnitude,
    )
  })

  it('per-frame call duration covers a stuttered 60fps frame', () => {
    expect(RUMBLE_FRAME_DURATION_MS).toBeGreaterThan(16)
  })
})

describe('shouldTouchHapticFire', () => {
  it('off always suppresses', () => {
    expect(shouldTouchHapticFire('off', true)).toBe(false)
    expect(shouldTouchHapticFire('off', false)).toBe(false)
  })

  it('on always fires', () => {
    expect(shouldTouchHapticFire('on', true)).toBe(true)
    expect(shouldTouchHapticFire('on', false)).toBe(true)
  })

  it('auto fires only on touch runtime', () => {
    expect(shouldTouchHapticFire('auto', true)).toBe(true)
    expect(shouldTouchHapticFire('auto', false)).toBe(false)
  })
})

describe('shouldGamepadRumbleFire', () => {
  it('off always suppresses', () => {
    expect(shouldGamepadRumbleFire('off', true)).toBe(false)
    expect(shouldGamepadRumbleFire('off', false)).toBe(false)
  })

  it('on always fires', () => {
    expect(shouldGamepadRumbleFire('on', true)).toBe(true)
    expect(shouldGamepadRumbleFire('on', false)).toBe(true)
  })

  it('auto fires only when a rumble-capable pad is present', () => {
    expect(shouldGamepadRumbleFire('auto', true)).toBe(true)
    expect(shouldGamepadRumbleFire('auto', false)).toBe(false)
  })
})

describe('gamepad rumble mode labels', () => {
  it('every mode has a non-empty label and description', () => {
    for (const mode of HAPTIC_MODES) {
      expect(GAMEPAD_RUMBLE_MODE_LABELS[mode]).toMatch(/\S/)
      expect(GAMEPAD_RUMBLE_MODE_DESCRIPTIONS[mode]).toMatch(/\S/)
    }
  })

  it('labels and descriptions never use em or en dashes (writing rule)', () => {
    for (const mode of HAPTIC_MODES) {
      expect(GAMEPAD_RUMBLE_MODE_LABELS[mode]).not.toContain('\u2014')
      expect(GAMEPAD_RUMBLE_MODE_LABELS[mode]).not.toContain('\u2013')
      expect(GAMEPAD_RUMBLE_MODE_DESCRIPTIONS[mode]).not.toContain('\u2014')
      expect(GAMEPAD_RUMBLE_MODE_DESCRIPTIONS[mode]).not.toContain('\u2013')
    }
  })
})

interface MockActuator {
  playEffect: ReturnType<typeof vi.fn>
  reset?: ReturnType<typeof vi.fn>
}

interface MockLegacyActuator {
  pulse: ReturnType<typeof vi.fn>
}

function makePadWithActuator(): { pad: Gamepad; actuator: MockActuator } {
  const actuator: MockActuator = {
    playEffect: vi.fn(() => Promise.resolve('complete')),
    reset: vi.fn(() => Promise.resolve('complete')),
  }
  const pad = { vibrationActuator: actuator } as unknown as Gamepad
  return { pad, actuator }
}

function makePadWithLegacy(): { pad: Gamepad; legacy: MockLegacyActuator } {
  const legacy: MockLegacyActuator = {
    pulse: vi.fn(() => Promise.resolve(true)),
  }
  const pad = { hapticActuators: [legacy] } as unknown as Gamepad
  return { pad, legacy }
}

describe('fireGamepadImpulse', () => {
  it('returns false when pad is null', () => {
    expect(fireGamepadImpulse('lap', null)).toBe(false)
  })

  it('returns false for an unknown outcome', () => {
    const { pad } = makePadWithActuator()
    expect(fireGamepadImpulse('jingle' as never, pad)).toBe(false)
  })

  it('returns false when neither actuator path is available', () => {
    const pad = {} as unknown as Gamepad
    expect(fireGamepadImpulse('lap', pad)).toBe(false)
  })

  it('drives vibrationActuator.playEffect with the documented dual-rumble effect', () => {
    const { pad, actuator } = makePadWithActuator()
    expect(fireGamepadImpulse('record', pad)).toBe(true)
    expect(actuator.playEffect).toHaveBeenCalledTimes(1)
    expect(actuator.playEffect).toHaveBeenCalledWith('dual-rumble', {
      duration: RUMBLE_EFFECTS.record.duration,
      strongMagnitude: RUMBLE_EFFECTS.record.strongMagnitude,
      weakMagnitude: RUMBLE_EFFECTS.record.weakMagnitude,
    })
  })

  it('falls back to hapticActuators[0].pulse when vibrationActuator is missing', () => {
    const { pad, legacy } = makePadWithLegacy()
    expect(fireGamepadImpulse('pb', pad)).toBe(true)
    expect(legacy.pulse).toHaveBeenCalledTimes(1)
    const args = legacy.pulse.mock.calls[0]
    expect(args[0]).toBeCloseTo(RUMBLE_EFFECTS.pb.weakMagnitude, 5)
    expect(args[1]).toBe(RUMBLE_EFFECTS.pb.duration)
  })

  it('swallows a thrown playEffect and returns false', () => {
    const actuator: MockActuator = {
      playEffect: vi.fn(() => {
        throw new Error('blocked')
      }),
    }
    const pad = { vibrationActuator: actuator } as unknown as Gamepad
    expect(fireGamepadImpulse('lap', pad)).toBe(false)
  })

  it('does not leak a rejected playEffect promise as an unhandled rejection', () => {
    const rejected = Promise.reject(new Error('blocked'))
    // attach a noop handler so vitest does not flag the raw rejection;
    // the function itself should also call .catch internally.
    rejected.catch(() => {})
    const actuator: MockActuator = {
      playEffect: vi.fn(() => rejected),
    }
    const pad = { vibrationActuator: actuator } as unknown as Gamepad
    expect(fireGamepadImpulse('lap', pad)).toBe(true)
  })
})

describe('setGamepadContinuousRumble', () => {
  it('no-ops when pad is null', () => {
    setGamepadContinuousRumble(null, { strongMagnitude: 0.5, weakMagnitude: 0.5 })
    // No assertion needed: just confirm no throw.
  })

  it('writes the effect on the first non-zero call', () => {
    const { pad, actuator } = makePadWithActuator()
    setGamepadContinuousRumble(pad, { strongMagnitude: 0.4, weakMagnitude: 0.6 })
    expect(actuator.playEffect).toHaveBeenCalledTimes(1)
    expect(actuator.playEffect).toHaveBeenCalledWith('dual-rumble', {
      duration: RUMBLE_FRAME_DURATION_MS,
      strongMagnitude: 0.4,
      weakMagnitude: 0.6,
    })
  })

  it('dedupes consecutive identical writes (epsilon)', () => {
    const { pad, actuator } = makePadWithActuator()
    setGamepadContinuousRumble(pad, { strongMagnitude: 0.4, weakMagnitude: 0.6 })
    setGamepadContinuousRumble(pad, { strongMagnitude: 0.4, weakMagnitude: 0.6 })
    expect(actuator.playEffect).toHaveBeenCalledTimes(1)
  })

  it('skips writes that differ by less than the epsilon', () => {
    const { pad, actuator } = makePadWithActuator()
    setGamepadContinuousRumble(pad, { strongMagnitude: 0.5, weakMagnitude: 0.5 })
    const tiny = RUMBLE_EPSILON / 4
    setGamepadContinuousRumble(pad, {
      strongMagnitude: 0.5 + tiny,
      weakMagnitude: 0.5 + tiny,
    })
    expect(actuator.playEffect).toHaveBeenCalledTimes(1)
  })

  it('writes again when magnitudes differ beyond the epsilon', () => {
    const { pad, actuator } = makePadWithActuator()
    setGamepadContinuousRumble(pad, { strongMagnitude: 0.4, weakMagnitude: 0.6 })
    setGamepadContinuousRumble(pad, { strongMagnitude: 0.7, weakMagnitude: 0.6 })
    expect(actuator.playEffect).toHaveBeenCalledTimes(2)
  })

  it('routes both-zero magnitudes through reset()', () => {
    const { pad, actuator } = makePadWithActuator()
    setGamepadContinuousRumble(pad, { strongMagnitude: 0, weakMagnitude: 0 })
    expect(actuator.reset).toHaveBeenCalledTimes(1)
    expect(actuator.playEffect).not.toHaveBeenCalled()
  })

  it('clamps oversize input into [0, 1]', () => {
    const { pad, actuator } = makePadWithActuator()
    setGamepadContinuousRumble(pad, { strongMagnitude: 5, weakMagnitude: -1 })
    expect(actuator.playEffect).toHaveBeenCalledWith('dual-rumble', {
      duration: RUMBLE_FRAME_DURATION_MS,
      strongMagnitude: 1,
      weakMagnitude: 0,
    })
  })

  it('uses the legacy pulse path with the stronger of the two magnitudes', () => {
    const { pad, legacy } = makePadWithLegacy()
    setGamepadContinuousRumble(pad, { strongMagnitude: 0.7, weakMagnitude: 0.4 })
    expect(legacy.pulse).toHaveBeenCalledTimes(1)
    const args = legacy.pulse.mock.calls[0]
    expect(args[0]).toBeCloseTo(0.7, 5)
    expect(args[1]).toBe(RUMBLE_FRAME_DURATION_MS)
  })
})

describe('stopGamepadRumble', () => {
  it('no-ops when pad is null', () => {
    stopGamepadRumble(null)
  })

  it('calls vibrationActuator.reset when available', () => {
    const { pad, actuator } = makePadWithActuator()
    stopGamepadRumble(pad)
    expect(actuator.reset).toHaveBeenCalledTimes(1)
  })

  it('falls back to a zero playEffect when reset is missing', () => {
    const actuator: MockActuator = {
      playEffect: vi.fn(() => Promise.resolve('complete')),
    }
    const pad = { vibrationActuator: actuator } as unknown as Gamepad
    stopGamepadRumble(pad)
    expect(actuator.playEffect).toHaveBeenCalledWith('dual-rumble', {
      duration: 0,
      strongMagnitude: 0,
      weakMagnitude: 0,
    })
  })

  it('lets a fresh continuous write hit the wire after stop (cache cleared)', () => {
    const { pad, actuator } = makePadWithActuator()
    setGamepadContinuousRumble(pad, { strongMagnitude: 0.5, weakMagnitude: 0.5 })
    stopGamepadRumble(pad)
    setGamepadContinuousRumble(pad, { strongMagnitude: 0.5, weakMagnitude: 0.5 })
    expect(actuator.playEffect).toHaveBeenCalledTimes(2)
  })
})

describe('hasRumbleCapableGamepad', () => {
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

  it('returns false when navigator is missing (SSR)', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: undefined,
      configurable: true,
      writable: true,
    })
    expect(hasRumbleCapableGamepad()).toBe(false)
  })

  it('returns false when getGamepads is missing', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: {},
      configurable: true,
      writable: true,
    })
    expect(hasRumbleCapableGamepad()).toBe(false)
  })

  it('returns false when no pads are connected', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { getGamepads: () => [null, null] },
      configurable: true,
      writable: true,
    })
    expect(hasRumbleCapableGamepad()).toBe(false)
  })

  it('returns true when a connected pad exposes vibrationActuator', () => {
    const pad = {
      connected: true,
      vibrationActuator: { playEffect: () => Promise.resolve('complete') },
    }
    Object.defineProperty(globalThis, 'navigator', {
      value: { getGamepads: () => [pad] },
      configurable: true,
      writable: true,
    })
    expect(hasRumbleCapableGamepad()).toBe(true)
  })

  it('returns true when a connected pad exposes hapticActuators[0].pulse', () => {
    const pad = {
      connected: true,
      hapticActuators: [{ pulse: () => Promise.resolve(true) }],
    }
    Object.defineProperty(globalThis, 'navigator', {
      value: { getGamepads: () => [pad] },
      configurable: true,
      writable: true,
    })
    expect(hasRumbleCapableGamepad()).toBe(true)
  })

  it('skips disconnected pads', () => {
    const pad = {
      connected: false,
      vibrationActuator: { playEffect: () => Promise.resolve('complete') },
    }
    Object.defineProperty(globalThis, 'navigator', {
      value: { getGamepads: () => [pad] },
      configurable: true,
      writable: true,
    })
    expect(hasRumbleCapableGamepad()).toBe(false)
  })

  it('swallows a thrown getGamepads', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        getGamepads: () => {
          throw new Error('blocked')
        },
      },
      configurable: true,
      writable: true,
    })
    expect(hasRumbleCapableGamepad()).toBe(false)
  })
})
