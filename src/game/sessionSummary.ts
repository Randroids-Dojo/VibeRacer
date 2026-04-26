import type { LapHistoryEntry } from './lapHistory'
import { summarizeHistory } from './lapHistory'
import type { SectorDuration } from './optimalLap'

/**
 * Pure helpers for the end-of-session summary pane that surfaces when the
 * player picks "Exit to title" from the pause menu and has at least one
 * completed lap. Kept React-free so the math stays unit-testable.
 *
 * The pane reads a single `SessionSummaryStats` snapshot and renders rows
 * for: laps driven, best lap of session, average lap, total time on lap,
 * full session wall-clock duration (race + pause), gap from the session
 * best to the player's all-time PB on this (slug, version), and the
 * session's best drift score. All fields are optional / nullable so the
 * pane can render gracefully even with degenerate inputs.
 */

export interface SessionSummaryInputs {
  /** Lap log captured this session. */
  history: readonly LapHistoryEntry[]
  /** Player's all-time PB on this (slug, version) AT MOUNT (before this
   * session started). Used to compute `deltaVsAllTimeMs`. Null when the
   * player had no PB on the track before this session. */
  priorAllTimeMs: number | null
  /** Best drift score across this session. Null when no drift was scored. */
  driftBest: number | null
  /** Wall-clock duration of the session (ms) since the player landed on the
   * page. Capped at 0 so a negative or non-finite input never leaks. */
  sessionDurationMs: number
  /** Player's all-time best sectors AT MOUNT (before this session started).
   * Used to compute `sectorBreakdown` so the comparison reads "where this
   * session left time on the table" rather than comparing against a bar the
   * session itself just moved. Optional so legacy callers keep working;
   * absent or empty means no breakdown is produced. */
  priorAllTimeSectors?: readonly SectorDuration[] | null
}

export interface SessionSummaryStats {
  lapCount: number
  bestLapMs: number | null
  averageLapMs: number | null
  totalLapMs: number | null
  /** Signed gap from the session's best lap to the prior all-time PB.
   * Negative means the session beat the prior PB (i.e. the session set a
   * new PB), positive means the session was slower. Null when either side
   * is missing. */
  deltaVsAllTimeMs: number | null
  /** Prior all-time PB carried through verbatim so the pane can render the
   * comparison without re-passing the input. */
  priorAllTimeMs: number | null
  /** Whether the session beat the prior all-time PB. False when there was
   * no prior PB (the session's best becomes the first PB but there is no
   * "beat" relationship to display). */
  beatsAllTime: boolean
  driftBest: number | null
  sessionDurationMs: number
  /** Per-sector deltas comparing the session's best per-sector durations to
   * the player's prior all-time best sectors (the bar walked into the
   * session). Sorted with the biggest TIME LOSS first so the row at the top
   * is the most actionable "fix this next session" cue. Empty when no laps
   * had captured sector data or when the prior all-time sectors are missing.
   */
  sectorBreakdown: SectorBreakdownRow[]
  /** Sum of the positive (loss) per-sector deltas across `sectorBreakdown`.
   * The "headline" the breakdown card uses to read "you left ~X seconds on
   * the table this session". Null when no breakdown was produced. */
  totalTimeLostMs: number | null
}

/** One row of the sector breakdown card. */
export interface SectorBreakdownRow {
  /** Checkpoint id at the END of the sector (matches `SectorDuration.cpId`). */
  cpId: number
  /** 1-indexed display label (S1, S2, ...). Computed from the row's order
   * inside the player's prior all-time best sectors so a track edit that
   * removes an interior checkpoint never silently relabels surviving sectors.
   * Falls back to `cpId + 1` when the row only exists in the session set. */
  label: string
  /** Best duration this session at this cpId. Null when no lap captured this
   * sector this session (e.g. only the all-time best has a value). */
  sessionBestMs: number | null
  /** Player's all-time best for this sector at session start. Null when no
   * prior best exists for this cpId. */
  allTimeBestMs: number | null
  /** Signed delta `sessionBest - allTimeBest`. Positive means time was lost
   * vs the prior all-time best. Null when either side is missing so the row
   * has no direction to read. */
  deltaMs: number | null
  /** True when the session's best for this sector matched or beat the prior
   * all-time best (delta <= 0). False on a positive delta or a null delta. */
  matchedAllTimeBest: boolean
  /** True when this row carries the largest positive (time-lost) delta in
   * the breakdown so the renderer can pin a "biggest loss" accent on it.
   * Always false when no row has a positive delta. */
  biggestLoss: boolean
}

const MAX_SESSION_DURATION_MS = 86_400_000 // 24 hours; clamps a runaway clock

export function summarizeSession(inputs: SessionSummaryInputs): SessionSummaryStats {
  const { history, priorAllTimeMs, driftBest } = inputs
  const lapStats = summarizeHistory(history)
  const safeDuration = sanitizeDuration(inputs.sessionDurationMs)
  const safeDrift = sanitizeDrift(driftBest)
  const safePriorAllTime = sanitizeLapTime(priorAllTimeMs)
  let deltaVsAllTimeMs: number | null = null
  let beatsAllTime = false
  if (lapStats.bestMs !== null && safePriorAllTime !== null) {
    deltaVsAllTimeMs = lapStats.bestMs - safePriorAllTime
    beatsAllTime = deltaVsAllTimeMs < 0
  }
  const sectorBreakdown = computeSectorBreakdown(
    history,
    inputs.priorAllTimeSectors ?? null,
  )
  let totalTimeLostMs: number | null = null
  if (sectorBreakdown.length > 0) {
    let sum = 0
    let any = false
    for (const row of sectorBreakdown) {
      if (row.deltaMs !== null && row.deltaMs > 0) {
        sum += row.deltaMs
        any = true
      }
    }
    totalTimeLostMs = any ? Math.round(sum) : 0
  }
  return {
    lapCount: lapStats.count,
    bestLapMs: lapStats.bestMs,
    averageLapMs: lapStats.averageMs,
    totalLapMs: lapStats.totalMs,
    deltaVsAllTimeMs,
    priorAllTimeMs: safePriorAllTime,
    beatsAllTime,
    driftBest: safeDrift,
    sessionDurationMs: safeDuration,
    sectorBreakdown,
    totalTimeLostMs,
  }
}

/**
 * Build the per-sector breakdown rows comparing this session's best sector
 * times to the player's prior all-time best sectors. The comparison uses the
 * SESSION-best per cpId (not the session-best LAP's sectors) so a player who
 * banked one fast S1 in lap 2 and one fast S3 in lap 5 sees their true
 * theoretical-best per sector against the bar they walked in with.
 *
 * Sort order: rows with a positive (time-lost) delta come first, biggest
 * loss at the top so the player sees the most actionable target immediately;
 * matched-or-beat rows come next in sector order; and rows that exist only
 * in one of the two sets (a brand-new sector this session, or a sector the
 * player has not run yet this session) are interleaved at the end. The
 * caller-side renderer can choose to dim or expand groups based on the row
 * shape.
 *
 * Defensive against:
 *   - empty / missing history or priorAllTimeSectors
 *   - non-finite or non-positive durations in either input
 *   - sectors with hand-edited duplicate cpIds in the prior set (last-write-wins
 *     to mirror `mergeBestSectors`)
 *   - sectors that appear in only one of the two sets (rendered with a null
 *     delta so the row reads cleanly without faking a comparison)
 */
export function computeSectorBreakdown(
  history: readonly LapHistoryEntry[],
  priorAllTimeSectors: readonly SectorDuration[] | null,
): SectorBreakdownRow[] {
  const sessionBest = collectSessionBestSectors(history)
  const allTimeBest = collectAllTimeBestSectors(priorAllTimeSectors)
  if (sessionBest.size === 0 && allTimeBest.size === 0) return []
  // Label each cpId by its position inside the prior all-time set so a track
  // edit that drops an interior checkpoint never silently relabels surviving
  // sectors. Sectors that exist only in the session set fall back to `cpId+1`.
  const labels = new Map<number, string>()
  if (priorAllTimeSectors) {
    let idx = 0
    for (const s of priorAllTimeSectors) {
      if (!Number.isFinite(s.durationMs) || s.durationMs <= 0) continue
      if (!labels.has(s.cpId)) {
        labels.set(s.cpId, `S${idx + 1}`)
        idx += 1
      }
    }
  }
  const cpIds = new Set<number>()
  for (const id of sessionBest.keys()) cpIds.add(id)
  for (const id of allTimeBest.keys()) cpIds.add(id)
  const rows: SectorBreakdownRow[] = []
  let biggestLossDelta = 0
  let biggestLossCpId: number | null = null
  for (const cpId of cpIds) {
    const sessionMs = sessionBest.get(cpId) ?? null
    const priorMs = allTimeBest.get(cpId) ?? null
    let deltaMs: number | null = null
    if (sessionMs !== null && priorMs !== null) {
      deltaMs = sessionMs - priorMs
    }
    const matchedAllTimeBest = deltaMs !== null && deltaMs <= 0
    if (deltaMs !== null && deltaMs > biggestLossDelta) {
      biggestLossDelta = deltaMs
      biggestLossCpId = cpId
    }
    rows.push({
      cpId,
      label: labels.get(cpId) ?? `S${cpId + 1}`,
      sessionBestMs: sessionMs,
      allTimeBestMs: priorMs,
      deltaMs,
      matchedAllTimeBest,
      biggestLoss: false,
    })
  }
  if (biggestLossCpId !== null) {
    for (const row of rows) {
      if (row.cpId === biggestLossCpId) row.biggestLoss = true
    }
  }
  // Sort: time-lost rows first (biggest loss at top), then matched rows in
  // ascending cpId, then rows missing one of the two sides at the end.
  rows.sort((a, b) => sectorRowSortKey(a) - sectorRowSortKey(b) || sectorRowDeltaCompare(a, b) || a.cpId - b.cpId)
  return rows
}

function sectorRowSortKey(row: SectorBreakdownRow): number {
  if (row.deltaMs !== null && row.deltaMs > 0) return 0
  if (row.deltaMs !== null && row.deltaMs <= 0) return 1
  return 2
}

function sectorRowDeltaCompare(
  a: SectorBreakdownRow,
  b: SectorBreakdownRow,
): number {
  // Within the time-lost group, sort BIGGEST loss first (descending delta).
  if (
    a.deltaMs !== null &&
    a.deltaMs > 0 &&
    b.deltaMs !== null &&
    b.deltaMs > 0
  ) {
    return b.deltaMs - a.deltaMs
  }
  // Within the matched group, sort by cpId ascending (S1, S2, ...).
  return 0
}

function collectSessionBestSectors(
  history: readonly LapHistoryEntry[],
): Map<number, number> {
  const out = new Map<number, number>()
  for (const lap of history) {
    if (!lap.sectors) continue
    for (const s of lap.sectors) {
      if (!Number.isFinite(s.durationMs) || s.durationMs <= 0) continue
      const existing = out.get(s.cpId)
      if (existing === undefined || s.durationMs < existing) {
        out.set(s.cpId, s.durationMs)
      }
    }
  }
  return out
}

function collectAllTimeBestSectors(
  prior: readonly SectorDuration[] | null,
): Map<number, number> {
  const out = new Map<number, number>()
  if (!prior) return out
  for (const s of prior) {
    if (!Number.isFinite(s.durationMs) || s.durationMs <= 0) continue
    // Last-write-wins on a hand-edited duplicate cpId so we mirror
    // `mergeBestSectors`.
    out.set(s.cpId, s.durationMs)
  }
  return out
}

/**
 * Format a sector duration (ms) as a HUD-ready short string `S.mmm`. Always
 * three decimal seconds so two rows line up visually. Defensive against
 * non-finite or non-positive inputs (returns a `--` placeholder so a
 * row never collapses).
 */
export function formatSectorDuration(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms <= 0) return '--'
  const total = Math.round(ms)
  const seconds = Math.floor(total / 1000)
  const millis = total % 1000
  return `${seconds}.${String(millis).padStart(3, '0')}`
}

/**
 * Format a signed sector delta (ms) as a HUD-ready string with sign + 3
 * decimal seconds. Mirrors `formatLapDelta` from `lapHistory` so the two
 * stay visually consistent. Returns a placeholder on a null / non-finite
 * input so a row never collapses.
 */
export function formatSectorDelta(deltaMs: number | null): string {
  if (deltaMs === null || !Number.isFinite(deltaMs)) return '--'
  const sign = deltaMs > 0 ? '+' : deltaMs < 0 ? '-' : '+'
  const abs = Math.abs(deltaMs)
  const seconds = Math.floor(abs / 1000)
  const millis = Math.round(abs % 1000)
  const adjSeconds = millis === 1000 ? seconds + 1 : seconds
  const adjMillis = millis === 1000 ? 0 : millis
  return `${sign}${adjSeconds}.${String(adjMillis).padStart(3, '0')}`
}

/**
 * Format a wall-clock session duration for the summary header. Picks a
 * human-friendly grain: under a minute reads "Xs", under an hour reads
 * "Mm Ss", an hour or more reads "Hh Mm". Always renders something
 * non-empty so the row never collapses.
 */
export function formatSessionDuration(ms: number): string {
  const total = sanitizeDuration(ms)
  if (total < 1_000) return '0s'
  const totalSeconds = Math.floor(total / 1_000)
  if (totalSeconds < 60) return `${totalSeconds}s`
  const totalMinutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (totalMinutes < 60) {
    if (seconds === 0) return `${totalMinutes}m`
    return `${totalMinutes}m ${seconds}s`
  }
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (minutes === 0) return `${hours}h`
  return `${hours}h ${minutes}m`
}

function sanitizeDuration(ms: number): number {
  if (Number.isNaN(ms)) return 0
  if (ms <= 0) return 0
  if (ms > MAX_SESSION_DURATION_MS) return MAX_SESSION_DURATION_MS
  return ms
}

function sanitizeLapTime(ms: number | null | undefined): number | null {
  if (ms === null || ms === undefined) return null
  if (!Number.isFinite(ms) || ms <= 0) return null
  return ms
}

function sanitizeDrift(score: number | null | undefined): number | null {
  if (score === null || score === undefined) return null
  if (!Number.isFinite(score) || score <= 0) return null
  return score
}
