import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DEFAULT_CAR_PARAMS } from '@/game/physics'
import {
  CarParamsSchema,
  TUNING_LAST_LOADED_KEY,
  TUNING_LEGACY_DEV_KEY,
  TUNING_PARAM_META,
  cloneDefaultParams,
  clampParams,
  inputModeDescription,
  inputModeLabel,
  isStockParams,
  isTrackDecided,
  isTrackPinned,
  markTrackDecided,
  migrateLegacyTuning,
  parseStoredParams,
  perTrackKey,
  pinTrack,
  readLastLoaded,
  readPerTrack,
  resolveStartingTuning,
  unpinTrack,
  writeTuning,
} from '@/lib/tuningSettings'

describe('cloneDefaultParams', () => {
  it('returns a value-equal copy that is not the same reference', () => {
    const a = cloneDefaultParams()
    expect(a).toEqual(DEFAULT_CAR_PARAMS)
    a.maxSpeed = 999
    expect(DEFAULT_CAR_PARAMS.maxSpeed).not.toBe(999)
  })
})

describe('clampParams', () => {
  it('clamps every field into its declared range', () => {
    const insane = {
      ...cloneDefaultParams(),
      maxSpeed: 999,
      steerRateLow: -1,
      steerRateHigh: 99,
      offTrackDrag: 99999,
    }
    const out = clampParams(insane)
    for (const m of TUNING_PARAM_META) {
      expect(out[m.key]).toBeGreaterThanOrEqual(m.min)
      expect(out[m.key]).toBeLessThanOrEqual(m.max)
    }
  })

  it('replaces non-finite fields with defaults', () => {
    const broken = { ...cloneDefaultParams(), accel: NaN, brake: Infinity }
    const out = clampParams(broken)
    expect(out.accel).toBe(DEFAULT_CAR_PARAMS.accel)
    expect(out.brake).toBe(DEFAULT_CAR_PARAMS.brake)
  })
})

describe('isStockParams', () => {
  it('is true for the defaults', () => {
    expect(isStockParams(cloneDefaultParams())).toBe(true)
  })

  it('is false when any field differs', () => {
    const tuned = { ...cloneDefaultParams(), accel: DEFAULT_CAR_PARAMS.accel + 1 }
    expect(isStockParams(tuned)).toBe(false)
  })
})

describe('CarParamsSchema', () => {
  it('accepts the defaults', () => {
    const parsed = CarParamsSchema.safeParse(cloneDefaultParams())
    expect(parsed.success).toBe(true)
  })

  it('rejects out-of-range values', () => {
    const bad = { ...cloneDefaultParams(), maxSpeed: 9999 }
    const parsed = CarParamsSchema.safeParse(bad)
    expect(parsed.success).toBe(false)
  })

  it('rejects missing keys', () => {
    const partial = { ...cloneDefaultParams() } as Record<string, unknown>
    delete partial.steerRateLow
    const parsed = CarParamsSchema.safeParse(partial)
    expect(parsed.success).toBe(false)
  })
})

describe('input mode labels', () => {
  it('returns player-facing labels for all recorded input modes', () => {
    expect(inputModeLabel('keyboard')).toBe('Keyboard')
    expect(inputModeLabel('touch')).toBe('Touch')
    expect(inputModeLabel('gamepad')).toBe('Gamepad')
  })

  it('returns a clear fallback for legacy rows without recorded input', () => {
    expect(inputModeLabel(null)).toBe('Unknown input')
    expect(inputModeDescription(null)).toBe('Input device was not recorded')
  })
})

describe('parseStoredParams', () => {
  it('returns null for null/undefined', () => {
    expect(parseStoredParams(null)).toBeNull()
    expect(parseStoredParams(undefined)).toBeNull()
  })

  it('fills missing fields from defaults and clamps the rest', () => {
    const out = parseStoredParams({ maxSpeed: 9999, accel: 12 })
    expect(out).not.toBeNull()
    expect(out!.maxSpeed).toBeLessThanOrEqual(
      TUNING_PARAM_META.find((m) => m.key === 'maxSpeed')!.max,
    )
    expect(out!.accel).toBe(12)
    expect(out!.steerRateLow).toBe(DEFAULT_CAR_PARAMS.steerRateLow)
    expect(out!.steerRateHigh).toBe(DEFAULT_CAR_PARAMS.steerRateHigh)
  })
})

describe('localStorage round-trip', () => {
  const originalWindow = (globalThis as { window?: unknown }).window
  let store: Record<string, string>

  beforeEach(() => {
    store = {}
    const fakeWindow = {
      localStorage: {
        getItem: (k: string) => (k in store ? store[k] : null),
        setItem: (k: string, v: string) => {
          store[k] = v
        },
        removeItem: (k: string) => {
          delete store[k]
        },
        clear: () => {
          store = {}
        },
      },
    }
    ;(globalThis as { window?: unknown }).window = fakeWindow
  })

  afterEach(() => {
    if (originalWindow === undefined) {
      delete (globalThis as { window?: unknown }).window
    } else {
      ;(globalThis as { window?: unknown }).window = originalWindow
    }
  })

  it('resolveStartingTuning falls back to defaults when nothing is stored', () => {
    expect(resolveStartingTuning('foo')).toEqual(cloneDefaultParams())
  })

  it('writes per-track and last-loaded together', () => {
    const tuned = { ...cloneDefaultParams(), accel: 30 }
    writeTuning('alpha', tuned)
    expect(readPerTrack('alpha')).toEqual(tuned)
    expect(readLastLoaded()).toEqual(tuned)
  })

  it('lastLoaded is the global default for every unpinned track', () => {
    const tuned = { ...cloneDefaultParams(), maxSpeed: 40 }
    writeTuning('alpha', tuned)
    // Brand new slug, no per-track entry yet, falls back to lastLoaded.
    expect(resolveStartingTuning('beta')).toEqual(tuned)
    // Save under beta; lastLoaded is now beta. Alpha's per-track save is
    // ignored because alpha is not pinned, so alpha also resolves to beta.
    const beta = { ...cloneDefaultParams(), maxSpeed: 22 }
    writeTuning('beta', beta)
    expect(resolveStartingTuning('beta')).toEqual(beta)
    expect(resolveStartingTuning('alpha')).toEqual(beta)
  })

  it('pinned tracks consult their per-track save first', () => {
    const tuned = { ...cloneDefaultParams(), maxSpeed: 40 }
    writeTuning('alpha', tuned)
    const beta = { ...cloneDefaultParams(), maxSpeed: 22 }
    writeTuning('beta', beta)
    // lastLoaded is now beta. Pin alpha and confirm its per-track save wins.
    pinTrack('alpha')
    expect(isTrackPinned('alpha')).toBe(true)
    expect(resolveStartingTuning('alpha')).toEqual(tuned)
    // Unpinning alpha returns it to the lastLoaded default.
    unpinTrack('alpha')
    expect(isTrackPinned('alpha')).toBe(false)
    expect(resolveStartingTuning('alpha')).toEqual(beta)
  })

  it('pin / unpin / decided helpers are idempotent and persist', () => {
    expect(isTrackPinned('zeta')).toBe(false)
    expect(isTrackDecided('zeta')).toBe(false)
    pinTrack('zeta')
    pinTrack('zeta')
    expect(isTrackPinned('zeta')).toBe(true)
    markTrackDecided('zeta')
    markTrackDecided('zeta')
    expect(isTrackDecided('zeta')).toBe(true)
    unpinTrack('zeta')
    unpinTrack('zeta')
    expect(isTrackPinned('zeta')).toBe(false)
    // Decided survives an unpin.
    expect(isTrackDecided('zeta')).toBe(true)
  })

  it('migrates the legacy dev key once and removes it', () => {
    const legacy = { ...cloneDefaultParams(), accel: 25 }
    store[TUNING_LEGACY_DEV_KEY] = JSON.stringify(legacy)
    migrateLegacyTuning()
    expect(store[TUNING_LEGACY_DEV_KEY]).toBeUndefined()
    expect(JSON.parse(store[TUNING_LAST_LOADED_KEY])).toEqual(legacy)
  })

  it('migration is a no-op when the new key already exists', () => {
    const newer = { ...cloneDefaultParams(), accel: 19 }
    const legacy = { ...cloneDefaultParams(), accel: 25 }
    store[TUNING_LAST_LOADED_KEY] = JSON.stringify(newer)
    store[TUNING_LEGACY_DEV_KEY] = JSON.stringify(legacy)
    migrateLegacyTuning()
    expect(JSON.parse(store[TUNING_LAST_LOADED_KEY])).toEqual(newer)
    // Legacy left alone in this case (we only remove on actual migration).
    expect(store[TUNING_LEGACY_DEV_KEY]).toBeDefined()
  })

  it('garbage in storage is treated as absent', () => {
    store[perTrackKey('alpha')] = 'not-json'
    expect(readPerTrack('alpha')).toBeNull()
    expect(resolveStartingTuning('alpha')).toEqual(cloneDefaultParams())
  })
})
