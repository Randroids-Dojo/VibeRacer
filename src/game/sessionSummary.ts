import type { LapHistoryEntry } from './lapHistory'
import { summarizeHistory } from './lapHistory'

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
  }
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
