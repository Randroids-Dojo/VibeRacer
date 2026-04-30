/**
 * Tuning history: a recent-changes audit log that records discrete tuning
 * intents the player has produced (slider settle, applied saved tuning,
 * recommended-params accept, reset to defaults, leaderboard rival apply, JSON
 * import, history revert). The pause-menu Tuning Lab and the in-race SETUP
 * overlay both render this list so the player can swap any prior snapshot
 * back to the live car in one click.
 *
 * One global list across all tracks. Each row carries a `slug` so the in-race
 * panel can scope to the active layout while the lab home view can show the
 * full cross-track history.
 *
 * Pure helpers + thin localStorage wrappers, mirroring the discipline in
 * `src/lib/pbHistory.ts` (defensive on read, never throws on quota / SSR).
 */
import { z } from 'zod'
import type { CarParams } from '@/game/physics'
import {
  CarParamsSchema,
  TUNING_PARAM_META,
  clampParams,
  formatTuningValue,
  getTuningParamMeta,
} from './tuningSettings'
import { makeTuningId } from './tuningLab'

export const TUNING_HISTORY_KEY = 'viberacer.tuningHistory'
export const MAX_TUNING_HISTORY_ENTRIES = 30
export const TUNING_HISTORY_DEBOUNCE_MS = 600

export const TUNING_CHANGE_SOURCES = [
  'slider',
  'savedApplied',
  'recommended',
  'reset',
  'imported',
  'leaderboard',
  'historyRevert',
] as const

export type TuningChangeSource = (typeof TUNING_CHANGE_SOURCES)[number]

export const TUNING_SOURCE_LABELS: Record<TuningChangeSource, string> = {
  slider: 'Slider',
  savedApplied: 'Saved tuning',
  recommended: 'Recommended',
  reset: 'Reset',
  imported: 'Imported',
  leaderboard: 'Rival',
  historyRevert: 'Reverted',
}

export interface TuningChangedKey {
  from: number
  to: number
}

export type TuningChangedKeyMap = Partial<
  Record<keyof CarParams, TuningChangedKey>
>

export interface TuningHistoryEntry {
  // Stable id reused as the React key and for round-tripping apply calls.
  id: string
  // Snapshot of the params after the change landed. Always re-clamped on read
  // so a hand-edited blob can never feed bad numbers into the live car.
  params: CarParams
  // Where this change came from. Free-form `label` carries the human detail.
  source: TuningChangeSource
  // Optional human label: saved-tuning name, "defaults", rival initials, etc.
  label: string | null
  // Per-key delta vs the prior entry's params. Empty when this is the first
  // entry on a fresh log (no prior bar to diff against).
  changedKeys: TuningChangedKeyMap
  // Slug the change wrote through to. Real track slug during a race or the
  // synthetic '__lab__' slug when the change happened inside the Tuning Lab.
  slug: string
  // Wall-clock epoch ms. Used for `formatPbAge` and for newest-first sort.
  changedAt: number
}

const ChangedKeyShape = z.object({
  from: z.number().finite(),
  to: z.number().finite(),
})

const TuningChangedKeyMapSchema = z.record(
  z.enum(TUNING_PARAM_META.map((m) => m.key) as [keyof CarParams, ...(keyof CarParams)[]]),
  ChangedKeyShape,
)

export const TuningHistoryEntrySchema = z.object({
  id: z.string().min(1),
  params: CarParamsSchema,
  source: z.enum(TUNING_CHANGE_SOURCES),
  label: z.string().nullable(),
  changedKeys: TuningChangedKeyMapSchema,
  slug: z.string().min(1),
  changedAt: z.number().positive().finite(),
})

/**
 * Compare two CarParams snapshots for equality. Tolerates tiny float drift
 * (1e-9) so a re-clamp does not register as a change. Returns true iff every
 * tunable key matches.
 */
export function paramsEqual(a: CarParams, b: CarParams): boolean {
  for (const m of TUNING_PARAM_META) {
    if (Math.abs(a[m.key] - b[m.key]) > 1e-9) return false
  }
  return true
}

/**
 * Compute the per-key delta map from `before` to `after`. Returns only keys
 * whose value changed beyond the float-drift epsilon. With a null `before`
 * (the first entry on a fresh log) returns an empty map.
 */
export function diffParams(
  before: CarParams | null,
  after: CarParams,
): TuningChangedKeyMap {
  if (before === null) return {}
  const out: TuningChangedKeyMap = {}
  for (const m of TUNING_PARAM_META) {
    const a = before[m.key]
    const b = after[m.key]
    if (Math.abs(a - b) > 1e-9) {
      out[m.key] = { from: a, to: b }
    }
  }
  return out
}

/**
 * One-line human summary of a history entry's delta. Renders up to `maxShown`
 * keys explicitly, then collapses the rest into "and N others". Returns
 * "no change" for empty maps so the UI never shows a bare row.
 *
 * Example: "+max speed 26 to 28, -accel 18 to 16" or "5 fields changed"
 */
export function summarizeChangedKeys(
  entry: TuningHistoryEntry,
  maxShown = 2,
): string {
  const keys = Object.keys(entry.changedKeys) as (keyof CarParams)[]
  if (keys.length === 0) return 'no change'
  const parts = keys.slice(0, maxShown).map((k) => {
    const d = entry.changedKeys[k]!
    const sign = d.to >= d.from ? '+' : '-'
    const label = getTuningParamMeta(k).label.toLowerCase()
    return `${sign}${label} ${formatTuningValue(d.from)} to ${formatTuningValue(d.to)}`
  })
  const extra = keys.length - parts.length
  if (extra > 0) parts.push(`and ${extra} ${extra === 1 ? 'other' : 'others'}`)
  return parts.join(', ')
}

/**
 * Append a fresh history entry to the list. Returns the same array reference
 * on no-op cases (rejected entry or head-match) so React state setters can
 * skip a re-render via referential equality. Returns a fresh array when the
 * entry is actually appended; truncates from the tail at the cap so the
 * most-recent window always survives.
 *
 * The history is stored newest-first so the list reads like a stack.
 */
export function appendTuningHistory(
  prev: readonly TuningHistoryEntry[],
  next: TuningHistoryEntry,
): TuningHistoryEntry[] {
  const parsed = TuningHistoryEntrySchema.safeParse(next)
  if (!parsed.success) return prev as TuningHistoryEntry[]
  const head = prev[0]
  if (head && paramsEqual(head.params, parsed.data.params)) {
    return prev as TuningHistoryEntry[]
  }
  const combined = [parsed.data, ...prev]
  if (combined.length <= MAX_TUNING_HISTORY_ENTRIES) return combined
  return combined.slice(0, MAX_TUNING_HISTORY_ENTRIES)
}

/**
 * Sort the list newest-first. The on-disk order is already newest-first
 * (because `appendTuningHistory` prepends), but a defensive sort keeps the
 * UI stable against hand-edited blobs.
 */
export function sortTuningHistoryNewestFirst(
  entries: readonly TuningHistoryEntry[],
): TuningHistoryEntry[] {
  return [...entries].sort((a, b) => b.changedAt - a.changedAt)
}

/**
 * Read the persisted history. Returns an empty array on SSR, missing key,
 * malformed JSON, or schema-rejected blob. Drops malformed rows individually
 * (instead of throwing the whole list) so a single bad entry never poisons
 * the rest. Re-clamps every params snapshot so an out-of-bound entry can
 * never feed the live car.
 */
export function readTuningHistory(): TuningHistoryEntry[] {
  if (typeof window === 'undefined') return []
  let raw: string | null = null
  try {
    raw = window.localStorage.getItem(TUNING_HISTORY_KEY)
  } catch {
    return []
  }
  if (!raw) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  const out: TuningHistoryEntry[] = []
  for (const row of parsed) {
    const result = TuningHistoryEntrySchema.safeParse(row)
    if (result.success) {
      out.push({ ...result.data, params: clampParams(result.data.params) })
    }
  }
  // Cap on read so a hand-edited or corrupt blob with more than the cap
  // never feeds a giant array into the UI. Sort first so the cap drops the
  // oldest tail rather than slicing arbitrary positions.
  const sorted = sortTuningHistoryNewestFirst(out)
  if (sorted.length <= MAX_TUNING_HISTORY_ENTRIES) return sorted
  return sorted.slice(0, MAX_TUNING_HISTORY_ENTRIES)
}

/**
 * Append a fresh entry to persistent storage and return the new list.
 * Defensive against SSR, malformed input, and storage-quota failures so a
 * write that fails for an unrelated reason can never break the calling
 * tuning flow. Callers pass partial fields; missing id/changedAt/changedKeys
 * are filled in here so the recorder hook stays terse.
 */
export function appendStoredTuningHistory(
  partial: Omit<
    TuningHistoryEntry,
    'id' | 'changedAt' | 'changedKeys'
  > &
    Partial<Pick<TuningHistoryEntry, 'id' | 'changedAt' | 'changedKeys'>>,
  prevParams: CarParams | null,
): TuningHistoryEntry[] {
  if (typeof window === 'undefined') return []
  const prev = readTuningHistory()
  // Clamp once so the stored snapshot and the diff fallback agree. A caller
  // that passes out-of-bound numbers should see the post-clamp delta, not a
  // delta against the unclamped input that the live car never saw.
  const safeParams = clampParams(partial.params)
  const entry: TuningHistoryEntry = {
    id: partial.id ?? makeTuningId(),
    params: safeParams,
    source: partial.source,
    label: partial.label ?? null,
    changedKeys: partial.changedKeys ?? diffParams(prevParams, safeParams),
    slug: partial.slug,
    changedAt: partial.changedAt ?? Date.now(),
  }
  const next = appendTuningHistory(prev, entry)
  // No-op detection by reference: appendTuningHistory returns the same array
  // when the entry was rejected or matched the head. Length comparison would
  // false-positive when prev is at the cap and a real entry rotates the tail
  // out, leaving lengths equal.
  if (next === prev) return next
  try {
    window.localStorage.setItem(TUNING_HISTORY_KEY, JSON.stringify(next))
  } catch {
    // Quota or storage disabled. History is a best-effort UX enhancement; a
    // failed write must never break the tuning write path that triggered it.
  }
  return next
}

export function clearTuningHistory(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(TUNING_HISTORY_KEY)
  } catch {
    // ignore
  }
}

/**
 * Apply a history entry back to the live car. The caller injects whichever
 * `applyParams` is right for its surface (the in-race `useTuning(slug)` hook
 * during a race, or the lab's lastLoaded write inside `/tune`). The entry's
 * params are re-clamped so a blob whose bounds drifted across releases never
 * crashes the live integrator.
 */
export function applyTuningHistoryEntry(
  entry: TuningHistoryEntry,
  applyParams: (p: CarParams) => void,
): void {
  applyParams(clampParams(entry.params))
}
