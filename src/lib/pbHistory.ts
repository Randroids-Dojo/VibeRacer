/**
 * PB history: the lifetime list of personal-best lap times the player has
 * recorded on a single (slug, versionHash). Each entry is a single PB lap
 * (the kind of lap that drops the player's all-time PB on disk), tagged with
 * the prior PB it beat (or null on the very first lap of a fresh slug) and
 * the wall-clock timestamp when the lap was completed.
 *
 * The pause-menu PB History pane reads this list to surface a chronological
 * progression: every PB the player has ever set on this layout, the size of
 * each improvement, and how long ago each one was achieved. This complements
 * the per-session Laps pane (which clears on Restart) and the Stats pane
 * (which shows aggregates rather than the progression curve).
 *
 * Pure helpers only. The thin localStorage wrappers at the bottom touch
 * `window` but defensively bail on SSR / quota failures so the lap-complete
 * flow is never broken by a corrupt or full storage.
 */
import { z } from 'zod'

// Maximum number of PB-progression entries kept per (slug, versionHash). A
// single track is unlikely to ever produce 50 distinct PB laps in the wild
// (each PB by definition beats every prior PB), but the cap protects against
// pathological scenarios (a hand-edited blob, a future "grind for ms" mode,
// a developer tool that synthesizes laps). Oldest entries drop first so the
// most-recent progression always survives.
export const MAX_PB_HISTORY_ENTRIES = 50

export interface PbHistoryEntry {
  // The lap time of this PB lap, in milliseconds. Always positive and finite.
  lapTimeMs: number
  // The PB lap time this entry beat. null on the very first PB on a fresh
  // slug + version (no prior bar to clear). Always positive and finite when
  // present; the validator drops entries where this is set but malformed.
  priorBestMs: number | null
  // Wall-clock epoch ms when the PB lap was completed. Used for the relative
  // "today" / "yesterday" labels and for the strict newest-first sort.
  achievedAt: number
}

const PbHistoryEntrySchema = z.object({
  lapTimeMs: z.number().positive().finite(),
  priorBestMs: z.number().positive().finite().nullable(),
  achievedAt: z.number().positive().finite(),
})

const PbHistoryArraySchema = z.array(PbHistoryEntrySchema)

export interface PbHistorySummary {
  // Number of PB laps recorded on this (slug, versionHash). Equal to the
  // length of the list; surfaced separately so callers do not duplicate the
  // count derivation across the UI.
  count: number
  // The very first PB on this layout (the slowest of the PBs, since each
  // subsequent PB by definition beats the prior). null when the list is empty.
  firstMs: number | null
  // The most-recent PB on this layout (the fastest, mirroring the player's
  // current all-time PB). null when the list is empty.
  latestMs: number | null
  // Total milliseconds shaved off across the full progression. Equal to
  // (firstMs - latestMs) when both are present; surfaced separately so the UI
  // can show the headline "you have shaved 4.832 off this layout" stat
  // without recomputing the diff.
  totalImprovementMs: number
}

/**
 * Append a fresh PB entry to the history. Pure: returns a new array, never
 * mutates the input. Drops the oldest entries when the list exceeds the cap
 * so the most-recent progression always survives. Defensive against malformed
 * input (returns a clone of the prior list when the entry is unusable).
 */
export function appendPbHistory(
  prev: readonly PbHistoryEntry[],
  next: PbHistoryEntry,
): PbHistoryEntry[] {
  // Validate the incoming entry. A malformed entry is a no-op rather than a
  // throw so the caller's lap-complete path keeps working.
  const parsed = PbHistoryEntrySchema.safeParse(next)
  if (!parsed.success) return [...prev]
  const combined = [...prev, parsed.data]
  if (combined.length <= MAX_PB_HISTORY_ENTRIES) return combined
  // Drop the oldest excess entries. Slice from the back so the most-recent
  // window survives intact.
  return combined.slice(combined.length - MAX_PB_HISTORY_ENTRIES)
}

/**
 * Summarize a PB-history list for the pane header. Pure, defensive: rejects
 * non-finite or non-positive lap times so a corrupt stored entry can never
 * feed the UI a garbage stat.
 */
export function summarizePbHistory(
  entries: readonly PbHistoryEntry[],
): PbHistorySummary {
  // Filter to usable entries up-front so a single bad row in the middle of a
  // large list does not poison the summary.
  const usable = entries.filter(
    (e) =>
      Number.isFinite(e.lapTimeMs) &&
      e.lapTimeMs > 0 &&
      Number.isFinite(e.achievedAt) &&
      e.achievedAt > 0,
  )
  if (usable.length === 0) {
    return {
      count: 0,
      firstMs: null,
      latestMs: null,
      totalImprovementMs: 0,
    }
  }
  // Walk in chronological order so the "first" / "latest" reading matches
  // the player's intuition (oldest PB = first, most-recent PB = latest).
  // Tie-break on lapTimeMs only matters for hand-edited duplicates; we accept
  // whichever sits earliest in the array since a PB by definition strictly
  // beats the prior.
  const sorted = [...usable].sort((a, b) => a.achievedAt - b.achievedAt)
  const firstMs = sorted[0].lapTimeMs
  const latestMs = sorted[sorted.length - 1].lapTimeMs
  // Improvement is first-minus-latest. Clamp at zero so a degenerate history
  // where the latest PB is somehow slower than the first (only possible via
  // hand-edited blobs) reads as "no improvement" rather than a negative.
  const totalImprovementMs = Math.max(0, firstMs - latestMs)
  return {
    count: usable.length,
    firstMs,
    latestMs,
    totalImprovementMs,
  }
}

/**
 * Sort a PB-history list newest-first so the freshest PB sits at the top of
 * the pane's scroll. Stable on tied timestamps. Pure: returns a fresh array.
 */
export function sortPbHistoryNewestFirst(
  entries: readonly PbHistoryEntry[],
): PbHistoryEntry[] {
  return [...entries].sort((a, b) => b.achievedAt - a.achievedAt)
}

/**
 * Compute the improvement (in milliseconds) of a PB entry vs its prior best.
 * Returns null when the entry is the very first PB on a fresh layout (no
 * prior bar to clear) or when the prior is malformed. Always positive when
 * defined (a PB by definition strictly beats the prior).
 */
export function pbImprovementMs(entry: PbHistoryEntry): number | null {
  if (entry.priorBestMs === null) return null
  if (!Number.isFinite(entry.priorBestMs) || entry.priorBestMs <= 0) return null
  if (!Number.isFinite(entry.lapTimeMs) || entry.lapTimeMs <= 0) return null
  const diff = entry.priorBestMs - entry.lapTimeMs
  return diff > 0 ? diff : null
}

// Time-ago labels mirror the trophy-case formatter so the visual language is
// consistent across the app. Defensive against non-finite or non-positive
// timestamps and against a future timestamp (clamps to "today" rather than
// rendering a negative).
export function formatPbAge(achievedAt: number, nowMs: number = Date.now()): string {
  if (!Number.isFinite(achievedAt) || achievedAt <= 0) return ''
  if (!Number.isFinite(nowMs) || nowMs <= 0) return ''
  const diffMs = Math.max(0, nowMs - achievedAt)
  const day = 24 * 60 * 60 * 1000
  if (diffMs < day) return 'today'
  const days = Math.floor(diffMs / day)
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

// localStorage key shape mirrors the rest of the per-(slug, version) storage
// in src/lib/localBest.ts so a future namespace audit picks every PB-related
// key out at once.
function pbHistoryKey(slug: string, versionHash: string): string {
  return `viberacer.pbHistory.${slug}.${versionHash}`
}

/**
 * Read the persisted PB history for this (slug, versionHash). Returns an
 * empty array on SSR, missing key, malformed JSON, or schema-rejected blob
 * so the caller never has to special-case any of those.
 */
export function readPbHistory(
  slug: string,
  versionHash: string,
): PbHistoryEntry[] {
  if (typeof window === 'undefined') return []
  const raw = window.localStorage.getItem(pbHistoryKey(slug, versionHash))
  if (!raw) return []
  try {
    const parsed = PbHistoryArraySchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : []
  } catch {
    return []
  }
}

/**
 * Append a fresh PB entry to the persisted history. Defensive against SSR,
 * malformed input, and storage-quota failures so a successful lap can never
 * be broken by a write that fails for an unrelated reason. Returns the new
 * list so callers that hold a React state copy can swap it in without a
 * second read.
 */
export function appendStoredPbHistory(
  slug: string,
  versionHash: string,
  entry: PbHistoryEntry,
): PbHistoryEntry[] {
  if (typeof window === 'undefined') return []
  const prev = readPbHistory(slug, versionHash)
  const next = appendPbHistory(prev, entry)
  // No-op write when the entry was rejected by the validator (the appender
  // returns a clone of the prior list in that case, so length comparison
  // catches it).
  if (next.length === prev.length) return next
  try {
    window.localStorage.setItem(
      pbHistoryKey(slug, versionHash),
      JSON.stringify(next),
    )
  } catch {
    // Quota or storage disabled. PB history is a best-effort UX enhancement;
    // a write failure should never break the lap-complete flow.
  }
  return next
}
