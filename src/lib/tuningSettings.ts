import { z } from 'zod'
import { DEFAULT_CAR_PARAMS, type CarParams } from '@/game/physics'

// Player-facing per-track car tuning. Stored in localStorage. Each track keeps
// its own setup; switching to a fresh track seeds from the last-loaded setup
// (so a new track starts with whatever the player tweaked most recently).

export interface TuningParamMeta {
  key: keyof CarParams
  label: string
  min: number
  max: number
  step: number
  unit: string
  hint?: string
}

export const TUNING_PARAM_META: TuningParamMeta[] = [
  {
    key: 'maxSpeed',
    label: 'Max speed',
    min: 12,
    max: 50,
    step: 0.5,
    unit: 'u/s',
    hint: 'Top speed cap on track.',
  },
  {
    key: 'maxReverseSpeed',
    label: 'Max reverse speed',
    min: 2,
    max: 20,
    step: 0.5,
    unit: 'u/s',
    hint: 'Reverse speed cap.',
  },
  {
    key: 'accel',
    label: 'Acceleration',
    min: 4,
    max: 48,
    step: 0.5,
    unit: 'u/s²',
    hint: 'Forward acceleration under full throttle.',
  },
  {
    key: 'brake',
    label: 'Brake force',
    min: 8,
    max: 80,
    step: 1,
    unit: 'u/s²',
    hint: 'Deceleration when braking.',
  },
  {
    key: 'reverseAccel',
    label: 'Reverse acceleration',
    min: 2,
    max: 30,
    step: 0.5,
    unit: 'u/s²',
    hint: 'Acceleration when already stopped and held back.',
  },
  {
    key: 'rollingFriction',
    label: 'Rolling friction',
    min: 0,
    max: 20,
    step: 0.25,
    unit: 'u/s²',
    hint: 'Coast deceleration with no input.',
  },
  {
    key: 'steerRateLow',
    label: 'Steer rate (low speed)',
    min: 0.5,
    max: 5.0,
    step: 0.05,
    unit: 'rad/s',
    hint: 'Heading rate at the bottom of the steering band (near minimum speed).',
  },
  {
    key: 'steerRateHigh',
    label: 'Steer rate (high speed)',
    min: 0.5,
    max: 5.0,
    step: 0.05,
    unit: 'rad/s',
    hint: 'Heading rate at top speed. Lower than the low-speed value gives stable straights with sharp U-turns.',
  },
  {
    key: 'minSpeedForSteering',
    label: 'Min steering speed',
    min: 0,
    max: 5,
    step: 0.1,
    unit: 'u/s',
    hint: 'Below this speed steering does nothing.',
  },
  {
    key: 'offTrackMaxSpeed',
    label: 'Off-track max speed',
    min: 2,
    max: 30,
    step: 0.5,
    unit: 'u/s',
    hint: 'Speed cap when leaving the road.',
  },
  {
    key: 'offTrackDrag',
    label: 'Off-track drag',
    min: 0,
    max: 60,
    step: 1,
    unit: 'u/s²',
    hint: 'Extra deceleration when off-track.',
  },
]

// Map for O(1) bounds lookups and reuse by the schema below.
export const TUNING_BOUNDS: Record<
  keyof CarParams,
  { min: number; max: number }
> = TUNING_PARAM_META.reduce(
  (acc, m) => {
    acc[m.key] = { min: m.min, max: m.max }
    return acc
  },
  {} as Record<keyof CarParams, { min: number; max: number }>,
)

function boundedNumber(min: number, max: number) {
  return z.number().finite().min(min).max(max)
}

export const CarParamsSchema = z.object({
  maxSpeed: boundedNumber(TUNING_BOUNDS.maxSpeed.min, TUNING_BOUNDS.maxSpeed.max),
  maxReverseSpeed: boundedNumber(
    TUNING_BOUNDS.maxReverseSpeed.min,
    TUNING_BOUNDS.maxReverseSpeed.max,
  ),
  accel: boundedNumber(TUNING_BOUNDS.accel.min, TUNING_BOUNDS.accel.max),
  brake: boundedNumber(TUNING_BOUNDS.brake.min, TUNING_BOUNDS.brake.max),
  reverseAccel: boundedNumber(
    TUNING_BOUNDS.reverseAccel.min,
    TUNING_BOUNDS.reverseAccel.max,
  ),
  rollingFriction: boundedNumber(
    TUNING_BOUNDS.rollingFriction.min,
    TUNING_BOUNDS.rollingFriction.max,
  ),
  steerRateLow: boundedNumber(
    TUNING_BOUNDS.steerRateLow.min,
    TUNING_BOUNDS.steerRateLow.max,
  ),
  steerRateHigh: boundedNumber(
    TUNING_BOUNDS.steerRateHigh.min,
    TUNING_BOUNDS.steerRateHigh.max,
  ),
  minSpeedForSteering: boundedNumber(
    TUNING_BOUNDS.minSpeedForSteering.min,
    TUNING_BOUNDS.minSpeedForSteering.max,
  ),
  offTrackMaxSpeed: boundedNumber(
    TUNING_BOUNDS.offTrackMaxSpeed.min,
    TUNING_BOUNDS.offTrackMaxSpeed.max,
  ),
  offTrackDrag: boundedNumber(
    TUNING_BOUNDS.offTrackDrag.min,
    TUNING_BOUNDS.offTrackDrag.max,
  ),
})

export const InputModeSchema = z.enum(['keyboard', 'touch', 'gamepad'])
export type InputMode = z.infer<typeof InputModeSchema>

export const TUNING_KEYS = TUNING_PARAM_META.map((m) => m.key)

export const TUNING_PER_TRACK_PREFIX = 'viberacer.tuning.track:'
export const TUNING_LAST_LOADED_KEY = 'viberacer.tuning.lastLoaded'
// Older dev-only key. We migrate from this once if present.
export const TUNING_LEGACY_DEV_KEY = 'viberacer.dev.tuning'

export function cloneDefaultParams(): CarParams {
  return { ...DEFAULT_CAR_PARAMS }
}

export function clampParams(params: CarParams): CarParams {
  const out = { ...params }
  for (const m of TUNING_PARAM_META) {
    const v = out[m.key]
    if (!Number.isFinite(v)) {
      out[m.key] = DEFAULT_CAR_PARAMS[m.key]
      continue
    }
    if (v < m.min) out[m.key] = m.min
    else if (v > m.max) out[m.key] = m.max
  }
  return out
}

export function isStockParams(params: CarParams): boolean {
  for (const m of TUNING_PARAM_META) {
    if (Math.abs(params[m.key] - DEFAULT_CAR_PARAMS[m.key]) > 1e-9) return false
  }
  return true
}

// Parse a stored value, filling in any missing keys from defaults so adding a
// new field does not blow up an existing local save. Out-of-range values get
// clamped (rather than rejected) to be forgiving across tweaks to the bounds.
export function parseStoredParams(raw: unknown): CarParams | null {
  if (raw === null || raw === undefined) return null
  if (typeof raw !== 'object') return null
  const merged: CarParams = cloneDefaultParams()
  const obj = raw as Record<string, unknown>
  for (const m of TUNING_PARAM_META) {
    const v = obj[m.key]
    if (typeof v === 'number' && Number.isFinite(v)) merged[m.key] = v
  }
  return clampParams(merged)
}

export function perTrackKey(slug: string): string {
  return `${TUNING_PER_TRACK_PREFIX}${slug}`
}

function readJson(key: string): unknown {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(key)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(key, JSON.stringify(value))
}

// One-shot migration. If the dev-only key still exists and the new last-loaded
// key is empty, copy it over and drop the legacy key. Idempotent.
export function migrateLegacyTuning(): void {
  if (typeof window === 'undefined') return
  if (window.localStorage.getItem(TUNING_LAST_LOADED_KEY)) return
  const legacy = window.localStorage.getItem(TUNING_LEGACY_DEV_KEY)
  if (!legacy) return
  try {
    const parsed = parseStoredParams(JSON.parse(legacy))
    if (parsed) {
      writeJson(TUNING_LAST_LOADED_KEY, parsed)
    }
  } catch {
    // ignore
  }
  window.localStorage.removeItem(TUNING_LEGACY_DEV_KEY)
}

export function readLastLoaded(): CarParams | null {
  return parseStoredParams(readJson(TUNING_LAST_LOADED_KEY))
}

export function readPerTrack(slug: string): CarParams | null {
  return parseStoredParams(readJson(perTrackKey(slug)))
}

// Resolve the starting tuning for a track: per-track save wins, then the most
// recently loaded tuning (carryover), then defaults.
export function resolveStartingTuning(slug: string): CarParams {
  return readPerTrack(slug) ?? readLastLoaded() ?? cloneDefaultParams()
}

export function writeTuning(slug: string, params: CarParams): void {
  const safe = clampParams(params)
  writeJson(perTrackKey(slug), safe)
  writeJson(TUNING_LAST_LOADED_KEY, safe)
}

export function clearPerTrackTuning(slug: string): void {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(perTrackKey(slug))
}
