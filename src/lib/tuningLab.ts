import { z } from 'zod'
import type { CarParams } from '@/game/physics'
import {
  CarParamsSchema,
  TUNING_BOUNDS,
  TUNING_PARAM_META,
  clampParams,
  cloneDefaultParams,
  writeTuning,
} from './tuningSettings'

// Player-facing interactive tuning lab: drive a curated short loop, rate the
// car on a Likert scale, get a recommended next CarParams. All state lives in
// localStorage; no server round-trip.

export const ControlTypeSchema = z.enum([
  'keyboard',
  'touch_single',
  'touch_dual',
])
export type ControlType = z.infer<typeof ControlTypeSchema>

export const CONTROL_TYPE_LABELS: Record<ControlType, string> = {
  keyboard: 'Keyboard',
  touch_single: 'Touch (single stick)',
  touch_dual: 'Touch (dual stick)',
}

export const TrackTagSchema = z.enum(['twisty', 'fast', 'mixed', 'technical'])
export type TrackTag = z.infer<typeof TrackTagSchema>

export const TRACK_TAG_LABELS: Record<TrackTag, string> = {
  twisty: 'Twisty',
  fast: 'Fast',
  mixed: 'Mixed',
  technical: 'Technical',
}

export type LikertScore = 1 | 2 | 3 | 4 | 5

export type AspectId =
  | 'topSpeed'
  | 'acceleration'
  | 'braking'
  | 'lowSpeedTurning'
  | 'highSpeedTurning'
  | 'coastFeel'
  | 'offTrackPenalty'

export const ASPECT_IDS: AspectId[] = [
  'topSpeed',
  'acceleration',
  'braking',
  'lowSpeedTurning',
  'highSpeedTurning',
  'coastFeel',
  'offTrackPenalty',
]

export interface AspectMeta {
  id: AspectId
  label: string
  question: string
  lowLabel: string
  highLabel: string
  // Each contribution: positive sign means raising the param raises the felt
  // aspect. Negative sign means raising the param lowers the felt aspect.
  contributions: { key: keyof CarParams; sign: 1 | -1; weight: number }[]
}

export const ASPECTS: AspectMeta[] = [
  {
    id: 'topSpeed',
    label: 'Top speed',
    question: 'Top speed on the long straight felt:',
    lowLabel: 'too slow',
    highLabel: 'too fast',
    contributions: [{ key: 'maxSpeed', sign: 1, weight: 1 }],
  },
  {
    id: 'acceleration',
    label: 'Pickup',
    question: 'Acceleration off the line felt:',
    lowLabel: 'sluggish',
    highLabel: 'too aggressive',
    contributions: [{ key: 'accel', sign: 1, weight: 1 }],
  },
  {
    id: 'braking',
    label: 'Braking',
    question: 'Braking before corners felt:',
    lowLabel: 'mushy',
    highLabel: 'too grabby',
    contributions: [{ key: 'brake', sign: 1, weight: 1 }],
  },
  {
    id: 'lowSpeedTurning',
    label: 'Low-speed turn',
    question: 'Tight U-turn at low speed felt:',
    lowLabel: 'too sluggish',
    highLabel: 'too twitchy',
    contributions: [
      { key: 'steerRateLow', sign: 1, weight: 1 },
      { key: 'minSpeedForSteering', sign: -1, weight: 0.5 },
    ],
  },
  {
    id: 'highSpeedTurning',
    label: 'High-speed turn',
    question: 'Steering at top speed felt:',
    lowLabel: 'understeery',
    highLabel: 'too darty',
    contributions: [{ key: 'steerRateHigh', sign: 1, weight: 1 }],
  },
  {
    id: 'coastFeel',
    label: 'Coast',
    question: 'When I let off the throttle, the car:',
    lowLabel: 'kept rolling forever',
    highLabel: 'slammed to a stop',
    contributions: [{ key: 'rollingFriction', sign: 1, weight: 1 }],
  },
  {
    id: 'offTrackPenalty',
    label: 'Off-track penalty',
    question: 'Going off-track felt:',
    lowLabel: 'too forgiving',
    highLabel: 'too punishing',
    contributions: [
      { key: 'offTrackDrag', sign: 1, weight: 0.5 },
      { key: 'offTrackMaxSpeed', sign: -1, weight: 0.5 },
    ],
  },
]

export const AspectRatingsSchema = z.record(
  z.enum([
    'topSpeed',
    'acceleration',
    'braking',
    'lowSpeedTurning',
    'highSpeedTurning',
    'coastFeel',
    'offTrackPenalty',
  ]),
  z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
    z.null(),
  ]),
)

export type AspectRatings = z.infer<typeof AspectRatingsSchema>

export type Damping = Record<keyof CarParams, number>
export type ParamDeltas = Partial<Record<keyof CarParams, number>>

const DAMPING_FLOOR = 0.0625

export function createDefaultDamping(): Damping {
  const out = {} as Damping
  for (const m of TUNING_PARAM_META) out[m.key] = 1
  return out
}

export interface RecommendResult {
  next: CarParams
  perParamDelta: ParamDeltas
  newDamping: Damping
}

// Pure. Applies a weighted gradient step per aspect rating, clamps to bounds,
// and updates the per-param damping multiplier when the next delta flips sign
// against the previous one (oscillation tamed by halving the step).
export function recommendNextParams(
  current: CarParams,
  ratings: AspectRatings,
  prevDeltas: ParamDeltas,
  damping: Damping,
  baseStepFraction = 0.12,
): RecommendResult {
  const deltaSum: ParamDeltas = {}
  const weightSum: Partial<Record<keyof CarParams, number>> = {}

  for (const aspect of ASPECTS) {
    const score = ratings[aspect.id]
    if (score === null || score === undefined) continue
    if (score === 3) continue
    const unit = (3 - score) / 2 // -1 .. +1, sign reversed: above 3 means lower the felt aspect
    for (const c of aspect.contributions) {
      const meta = TUNING_BOUNDS[c.key]
      const range = meta.max - meta.min
      const damp = damping[c.key] ?? 1
      const inc =
        unit *
        c.sign *
        c.weight *
        range *
        baseStepFraction *
        damp
      deltaSum[c.key] = (deltaSum[c.key] ?? 0) + inc
      weightSum[c.key] = (weightSum[c.key] ?? 0) + c.weight
    }
  }

  const perParamDelta: ParamDeltas = {}
  const proposed: CarParams = { ...current }
  for (const m of TUNING_PARAM_META) {
    const sum = deltaSum[m.key]
    if (sum === undefined) continue
    const w = weightSum[m.key] ?? 1
    const d = sum / Math.max(w, 1e-9)
    perParamDelta[m.key] = d
    proposed[m.key] = current[m.key] + d
  }
  const next = clampParams(proposed)

  const newDamping: Damping = { ...damping }
  for (const m of TUNING_PARAM_META) {
    const prev = prevDeltas[m.key]
    const cur = perParamDelta[m.key]
    if (prev !== undefined && cur !== undefined && prev !== 0 && cur !== 0) {
      if (Math.sign(prev) !== Math.sign(cur)) {
        newDamping[m.key] = Math.max(DAMPING_FLOOR, (damping[m.key] ?? 1) / 2)
      }
    }
  }

  return { next, perParamDelta, newDamping }
}

// Aggregate Likert ratings into a single 0..1 quality score. Each rated
// aspect contributes (3 - |r - 3|) / 2: 1.0 for "just right", 0.0 for the
// extremes. Skipped (null) aspects do not count. No rated aspects -> 0.
export function computeOverallRating(ratings: AspectRatings): number {
  let sum = 0
  let n = 0
  for (const id of ASPECT_IDS) {
    const r = ratings[id]
    if (r === null || r === undefined) continue
    sum += (2 - Math.abs(r - 3)) / 2
    n += 1
  }
  return n === 0 ? 0 : sum / n
}

export const SavedTuningSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(48),
  params: CarParamsSchema,
  ratings: AspectRatingsSchema,
  controlType: ControlTypeSchema,
  trackTags: z.array(TrackTagSchema).max(4),
  lapTimeMs: z.number().int().positive().nullable(),
  notes: z.string().max(500),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type SavedTuning = z.infer<typeof SavedTuningSchema>

export const TUNING_LAB_KEY = 'viberacer.tuningLab.saved'
export const TUNING_LAB_SCHEMA_TAG = 'viberacer.tuningLab.v1'

function safeJsonParse(raw: string | null | undefined): unknown {
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function readSavedTunings(): SavedTuning[] {
  if (typeof window === 'undefined') return []
  const raw = window.localStorage.getItem(TUNING_LAB_KEY)
  const parsed = safeJsonParse(raw)
  if (!Array.isArray(parsed)) return []
  const out: SavedTuning[] = []
  for (const row of parsed) {
    const result = SavedTuningSchema.safeParse(row)
    if (result.success) out.push(result.data)
  }
  return out
}

export function writeSavedTunings(items: SavedTuning[]): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(TUNING_LAB_KEY, JSON.stringify(items))
}

export function upsertTuning(item: SavedTuning): SavedTuning[] {
  const items = readSavedTunings()
  const idx = items.findIndex((t) => t.id === item.id)
  const next = idx >= 0 ? [...items] : [...items, item]
  if (idx >= 0) next[idx] = item
  writeSavedTunings(next)
  return next
}

export function deleteTuning(id: string): SavedTuning[] {
  const next = readSavedTunings().filter((t) => t.id !== id)
  writeSavedTunings(next)
  return next
}

export function getTuning(id: string): SavedTuning | null {
  return readSavedTunings().find((t) => t.id === id) ?? null
}

export type SortBy =
  | 'updatedDesc'
  | 'updatedAsc'
  | 'nameAsc'
  | 'lapAsc'
  | 'overallRatingDesc'

export function sortSaved(
  items: SavedTuning[],
  by: SortBy = 'updatedDesc',
): SavedTuning[] {
  const copy = [...items]
  switch (by) {
    case 'updatedDesc':
      copy.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      break
    case 'updatedAsc':
      copy.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
      break
    case 'nameAsc':
      copy.sort((a, b) => a.name.localeCompare(b.name))
      break
    case 'lapAsc':
      copy.sort((a, b) => {
        const la = a.lapTimeMs ?? Infinity
        const lb = b.lapTimeMs ?? Infinity
        return la - lb
      })
      break
    case 'overallRatingDesc':
      copy.sort(
        (a, b) => computeOverallRating(b.ratings) - computeOverallRating(a.ratings),
      )
      break
  }
  return copy
}

export function filterSaved(
  items: SavedTuning[],
  opts: {
    controlType?: ControlType
    trackTag?: TrackTag
    search?: string
  } = {},
): SavedTuning[] {
  const search = opts.search?.trim().toLowerCase() ?? ''
  return items.filter((t) => {
    if (opts.controlType && t.controlType !== opts.controlType) return false
    if (opts.trackTag && !t.trackTags.includes(opts.trackTag)) return false
    if (search && !t.name.toLowerCase().includes(search)) return false
    return true
  })
}

// Carries the tuning forward to the next race via the existing lastLoaded key.
// Synthetic slug "__lab__" so we never stomp a real per-track save.
export const TUNING_LAB_SYNTHETIC_SLUG = '__lab__'

export function applySavedAsLastLoaded(t: SavedTuning): void {
  writeTuning(TUNING_LAB_SYNTHETIC_SLUG, t.params)
}

// Snapshot the lab's live params into the lastLoaded key so the next race
// (or the next time the lab opens) starts from whatever the player most
// recently drove. Called on every params change in the session and on exit
// so an unsaved session still carries its winning setup forward.
export function persistLabLastLoaded(params: CarParams): void {
  writeTuning(TUNING_LAB_SYNTHETIC_SLUG, params)
}

export interface RoundLog {
  params: CarParams
  ratings: AspectRatings
  notes: string
  lapTimeMs: number | null
}

export const RoundLogSchema = z.object({
  params: CarParamsSchema,
  ratings: AspectRatingsSchema,
  notes: z.string().max(500),
  lapTimeMs: z.number().int().positive().nullable(),
})

export const ExportSessionSchema = z.object({
  schema: z.literal(TUNING_LAB_SCHEMA_TAG),
  timestamp: z.string(),
  userAgent: z.string(),
  controlType: ControlTypeSchema,
  trackTags: z.array(TrackTagSchema).max(4),
  rounds: z.array(RoundLogSchema),
  saved: SavedTuningSchema.nullable(),
})
export type ExportSession = z.infer<typeof ExportSessionSchema>

export function buildExportPayload(args: {
  rounds: RoundLog[]
  saved?: SavedTuning | null
  controlType: ControlType
  trackTags?: TrackTag[]
  userAgent?: string
  timestamp?: string
}): ExportSession {
  return {
    schema: TUNING_LAB_SCHEMA_TAG,
    timestamp: args.timestamp ?? new Date().toISOString(),
    userAgent:
      args.userAgent ??
      (typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown'),
    controlType: args.controlType,
    trackTags: args.trackTags ?? [],
    rounds: args.rounds,
    saved: args.saved ?? null,
  }
}

export type ImportResult =
  | { kind: 'tuning'; saved: SavedTuning }
  | { kind: 'session'; session: ExportSession }
  | { kind: 'error'; reason: string }

export function parseImportedJson(raw: unknown): ImportResult {
  if (raw === null || raw === undefined) {
    return { kind: 'error', reason: 'empty payload' }
  }
  const tuning = SavedTuningSchema.safeParse(raw)
  if (tuning.success) return { kind: 'tuning', saved: tuning.data }
  const session = ExportSessionSchema.safeParse(raw)
  if (session.success) return { kind: 'session', session: session.data }
  return {
    kind: 'error',
    reason: 'JSON did not match a tuning or a session payload',
  }
}

// Convenience helper: turn a single round into a SavedTuning seed. Used when
// the user clicks Save at the end of a session, or when importing a session
// payload and saving its final round.
export function makeSavedTuning(args: {
  id: string
  name: string
  round: RoundLog
  controlType: ControlType
  trackTags: TrackTag[]
  now?: string
}): SavedTuning {
  const now = args.now ?? new Date().toISOString()
  return {
    id: args.id,
    name: args.name.trim().slice(0, 48) || 'Unnamed setup',
    params: clampParams(args.round.params),
    ratings: args.round.ratings,
    controlType: args.controlType,
    trackTags: args.trackTags.slice(0, 4),
    lapTimeMs: args.round.lapTimeMs,
    notes: args.round.notes.slice(0, 500),
    createdAt: now,
    updatedAt: now,
  }
}

// Tiny RNG-free id helper: time-based + counter. Stable across SSR (used only
// at user-action time, not at module load). For tests, callers can pass in a
// deterministic id.
let idCounter = 0
export function makeTuningId(): string {
  idCounter = (idCounter + 1) & 0xffff
  const ts = Date.now().toString(36)
  const ctr = idCounter.toString(36).padStart(3, '0')
  return `t-${ts}-${ctr}`
}

// Re-export helpers callers commonly need.
export { cloneDefaultParams }
