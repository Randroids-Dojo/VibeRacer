/**
 * Per-track engagement stats. Pure helpers so the data model and formatting
 * stay testable without React, the DOM, or localStorage. The Game session
 * loads the stored stats on mount, mutates a snapshot through the recorder
 * helpers as the player races, and writes the snapshot back through the
 * `localBest` storage layer.
 *
 * Stats are per `(slug, versionHash)`: a fork to a new version starts with a
 * clean slate so the engagement total reads as "time spent on THIS layout"
 * instead of being inflated by a different track that shares the slug.
 */

export interface TrackStats {
  // Total completed laps the player has logged on this slug + version, across
  // all sessions. Increments once per `LapCompleteEvent`.
  lapCount: number
  // Cumulative wall-clock-equivalent time spent driving completed laps, in ms.
  // Sum of every recorded lap's `lapTimeMs`. Useful as a "time spent" readout
  // that does not double-count time spent in the pause menu.
  totalDriveMs: number
  // Number of distinct race sessions on this slug + version. A session counts
  // exactly once at the moment the player first drops into the racing phase
  // (countdown -> racing transition); restarts within the same browser tab
  // tick this each time so a "I keep restarting from the line" workflow is
  // captured honestly.
  sessionCount: number
  // Epoch ms of the first time the player ever played this slug + version.
  // Null when no session has been recorded yet.
  firstPlayedAt: number | null
  // Epoch ms of the most recent activity on this slug + version. Updated on
  // every session start AND every recorded lap so a long fast session shifts
  // the timestamp without waiting for a lap.
  lastPlayedAt: number | null
}

/**
 * Build an empty stats snapshot. Returned as a fresh object every call so
 * callers can mutate the result without aliasing a shared default.
 */
export function emptyStats(): TrackStats {
  return {
    lapCount: 0,
    totalDriveMs: 0,
    sessionCount: 0,
    firstPlayedAt: null,
    lastPlayedAt: null,
  }
}

/**
 * Record a session start. Increments `sessionCount`, sets `firstPlayedAt` if
 * absent, and updates `lastPlayedAt`. Returns a new snapshot so callers can
 * drive React state with reference inequality.
 *
 * Defensive: a non-finite or negative `nowMs` falls back to the existing
 * `lastPlayedAt` (or null) so a misbehaving clock cannot poison the record.
 */
export function recordSession(
  prev: TrackStats,
  nowMs: number,
): TrackStats {
  const safeNow = sanitizeTimestamp(nowMs)
  return {
    lapCount: prev.lapCount,
    totalDriveMs: prev.totalDriveMs,
    sessionCount: prev.sessionCount + 1,
    firstPlayedAt: prev.firstPlayedAt ?? safeNow,
    lastPlayedAt: safeNow ?? prev.lastPlayedAt,
  }
}

/**
 * Record a completed lap. Increments `lapCount`, adds the lap time to
 * `totalDriveMs`, and updates `lastPlayedAt`. Returns a new snapshot.
 *
 * Defensive: a non-finite or non-positive `lapTimeMs` is dropped (the lap
 * counter does not advance and the totals do not change). The most-recent
 * timestamp is still updated when `nowMs` is sane so an invalid lap does not
 * make the engagement record look stale.
 */
export function recordLap(
  prev: TrackStats,
  lapTimeMs: number,
  nowMs: number,
): TrackStats {
  const safeNow = sanitizeTimestamp(nowMs)
  if (!Number.isFinite(lapTimeMs) || lapTimeMs <= 0) {
    return {
      ...prev,
      lastPlayedAt: safeNow ?? prev.lastPlayedAt,
      firstPlayedAt: prev.firstPlayedAt ?? safeNow,
    }
  }
  const rounded = Math.round(lapTimeMs)
  return {
    lapCount: prev.lapCount + 1,
    totalDriveMs: prev.totalDriveMs + rounded,
    sessionCount: prev.sessionCount,
    firstPlayedAt: prev.firstPlayedAt ?? safeNow,
    lastPlayedAt: safeNow ?? prev.lastPlayedAt,
  }
}

function sanitizeTimestamp(value: number): number | null {
  if (!Number.isFinite(value)) return null
  if (value <= 0) return null
  return Math.floor(value)
}

/**
 * Format a duration in ms as `HH:MM:SS` for the engagement display. Drops
 * the leading hours block when the total is under an hour so a short session
 * reads as `MM:SS` instead of `00:MM:SS`. Always two-digit minutes and
 * seconds so the column stays vertically aligned across rows.
 *
 * Defensive: a non-finite or negative input renders as `--:--`.
 */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '--:--'
  const total = Math.max(0, Math.round(ms))
  const totalSeconds = Math.floor(total / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const mm = String(minutes).padStart(2, '0')
  const ss = String(seconds).padStart(2, '0')
  if (hours > 0) {
    const hh = String(hours).padStart(2, '0')
    return `${hh}:${mm}:${ss}`
  }
  return `${mm}:${ss}`
}

/**
 * Format an epoch ms timestamp as a short, locale-neutral date so the
 * engagement record reads the same regardless of the player's machine
 * settings. Output looks like `2026-04-26`.
 *
 * Defensive: a null, non-finite, or non-positive input renders as `--`.
 */
export function formatPlayedAt(epochMs: number | null): string {
  if (epochMs === null) return '--'
  if (!Number.isFinite(epochMs) || epochMs <= 0) return '--'
  const d = new Date(epochMs)
  const year = d.getUTCFullYear()
  const month = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Compute the average completed lap time. Returns null when no laps have
 * been recorded so the UI can render a placeholder without branching on
 * `lapCount === 0` everywhere.
 */
export function averageLapMs(stats: TrackStats): number | null {
  if (stats.lapCount <= 0) return null
  if (!Number.isFinite(stats.totalDriveMs) || stats.totalDriveMs <= 0) {
    return null
  }
  return stats.totalDriveMs / stats.lapCount
}
