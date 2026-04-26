import type { SectorDuration } from './optimalLap'

/**
 * Session-scoped lap history. Pure helpers so the data model and formatting
 * stay testable without React or DOM. The Game session owns one
 * `LapHistory` array, appends to it on every completed lap, and clears it on
 * Restart.
 *
 * Each entry captures the lap number (1-indexed), its raw time in ms, and an
 * optional delta vs the player's local PB at the moment the lap completed.
 * The delta is signed: negative means this lap was faster than the prior PB
 * (so the entry IS the new PB, captured before the PB was rewritten); positive
 * means the lap was slower. `null` means there was no PB to compare to (first
 * lap, or the slug + version PB had never been set).
 *
 * `sectors` holds the per-checkpoint durations for the lap, in checkpoint
 * order. Empty when the lap completed without any captured hits (defensive,
 * should not happen on a valid lap). Used by the Laps pane to expand a row
 * into a sector breakdown so players can see WHERE they lost or gained time
 * inside a single lap.
 */
export interface LapHistoryEntry {
  lapNumber: number
  lapTimeMs: number
  // Signed delta vs local PB at the moment the lap completed. Null when no
  // prior PB existed.
  deltaVsPbMs: number | null
  // True when this lap matched or beat the prior PB at completion time.
  // Always false when `deltaVsPbMs` is null (no comparison reference yet).
  isPb: boolean
  // Per-sector durations in lap order. Carried so the Laps pane can show a
  // sector breakdown without going back to the raw checkpoint hits. Defaults
  // to an empty array when the caller does not pass sectors (legacy callers
  // and degenerate / hit-less laps).
  sectors: SectorDuration[]
}

export interface AppendLapInputs {
  lapNumber: number
  lapTimeMs: number
  // Local PB BEFORE this lap was applied. Pass null when no PB existed yet.
  priorBestAllTimeMs: number | null
  // Per-sector durations for the just-completed lap. Optional so existing
  // callers and tests that only care about the lap-time fields keep working;
  // omitted defaults to an empty array.
  sectors?: readonly SectorDuration[]
}

/**
 * Append a new lap entry to the history. Returns a new array so the caller
 * can drive React state updates with reference inequality.
 */
export function appendLap(
  history: readonly LapHistoryEntry[],
  inputs: AppendLapInputs,
): LapHistoryEntry[] {
  const entry = makeLapEntry(inputs)
  return [...history, entry]
}

/**
 * Build a single entry without mutating any history. Exposed separately so
 * callers that only need the formatted entry (e.g. for a one-shot toast)
 * do not have to allocate an array.
 */
export function makeLapEntry(inputs: AppendLapInputs): LapHistoryEntry {
  const { lapNumber, lapTimeMs, priorBestAllTimeMs, sectors } = inputs
  // Defensive copy so a caller's mutable buffer does not leak into the
  // history array. Filter out any non-finite or non-positive durations so the
  // breakdown UI never has to render garbage rows.
  const safeSectors: SectorDuration[] = []
  if (sectors) {
    for (const s of sectors) {
      if (Number.isFinite(s.durationMs) && s.durationMs > 0) {
        safeSectors.push({ cpId: s.cpId, durationMs: s.durationMs })
      }
    }
  }
  if (priorBestAllTimeMs === null) {
    return {
      lapNumber,
      lapTimeMs,
      deltaVsPbMs: null,
      isPb: false,
      sectors: safeSectors,
    }
  }
  const deltaVsPbMs = lapTimeMs - priorBestAllTimeMs
  return {
    lapNumber,
    lapTimeMs,
    deltaVsPbMs,
    isPb: deltaVsPbMs <= 0,
    sectors: safeSectors,
  }
}

/**
 * Format a signed delta as a HUD-ready string. Mirrors splits.formatSplitDelta
 * but kept local so a refactor of one display does not silently change the
 * other. Always shows sign + 3 decimal seconds (e.g. "+0.421", "-1.034"). Zero
 * reads as "+0.000" so the lane never shows a sign-less number.
 */
export function formatLapDelta(deltaMs: number): string {
  if (!Number.isFinite(deltaMs)) return '+0.000'
  const sign = deltaMs > 0 ? '+' : deltaMs < 0 ? '-' : '+'
  const abs = Math.abs(deltaMs)
  const seconds = Math.floor(abs / 1000)
  const millis = Math.round(abs % 1000)
  // Guard the rounding case where 999.5 ms rounds up to 1000.
  const adjSeconds = millis === 1000 ? seconds + 1 : seconds
  const adjMillis = millis === 1000 ? 0 : millis
  return `${sign}${adjSeconds}.${String(adjMillis).padStart(3, '0')}`
}

/**
 * Aggregate stats over a history. Exposed for the panel header and for
 * future surfaces (e.g. an end-of-session summary). All stats are null when
 * the history is empty so the UI can render placeholders without branching
 * on `length === 0` everywhere.
 */
export interface LapHistoryStats {
  count: number
  bestMs: number | null
  averageMs: number | null
  totalMs: number | null
}

export function summarizeHistory(history: readonly LapHistoryEntry[]): LapHistoryStats {
  if (history.length === 0) {
    return { count: 0, bestMs: null, averageMs: null, totalMs: null }
  }
  let bestMs = Number.POSITIVE_INFINITY
  let totalMs = 0
  for (const entry of history) {
    if (entry.lapTimeMs < bestMs) bestMs = entry.lapTimeMs
    totalMs += entry.lapTimeMs
  }
  return {
    count: history.length,
    bestMs,
    averageMs: totalMs / history.length,
    totalMs,
  }
}
