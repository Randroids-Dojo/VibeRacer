// Achievement progress tracking. Pure helpers that turn the player's lifetime
// + per-track snapshot into a per-achievement {value, target, fraction, label}
// map so the AchievementsPane can show how close the player is to each locked
// milestone (and surface a "next goal" hint).
//
// Pure module. Storage and snapshot assembly live in the caller (Game.tsx
// reads from localStorage + live HudState refs). Numeric defenses keep a
// hostile or corrupt input from poisoning the rendered bars.

import {
  ACHIEVEMENTS,
  DRIFT_KING_THRESHOLD,
  FIVE_PB_STREAK,
  MARATHONER_DRIVE_MS,
  SUB_15_MS,
  SUB_20_MS,
  SUB_30_MS,
  TRACK_VETERAN_LAP_COUNT,
  TRIPLE_PB_STREAK,
  VARIETY_PACK_SLUG_COUNT,
  type AchievementId,
  type AchievementMap,
} from './achievements'

// Snapshot fed into the progress builder. Mirrors the AchievementSnapshot
// shape from `achievements.ts` but accumulates lifetime / best-yet bests
// instead of just the last lap so a locked milestone can show a real progress
// bar (e.g. "best lap 21.4s, target 20.0s" for sub-20).
export interface AchievementProgressSnapshot {
  // Player's lifetime fastest lap across every (slug, version), in ms. null
  // when no lap has been recorded yet. Sourced from localStorage's PB scan.
  lifetimeFastestLapMs: number | null
  // Player's lifetime best drift score across every (slug, version). null
  // when no drift score has been recorded yet. Sourced from localStorage's
  // drift-best scan.
  lifetimeBestDriftScore: number | null
  // Player's best PB streak across every (slug, version). null when no streak
  // has been recorded yet.
  lifetimeBestPbStreak: number | null
  // Cumulative lap count on the CURRENT (slug, version). The Track Veteran
  // badge requires 50 laps on the SAME version, so the relevant counter is
  // per-version not lifetime.
  trackLapCount: number
  // Cumulative drive-time on the CURRENT (slug, version), in ms. The
  // Marathoner badge requires 30 minutes on the SAME version.
  trackDriveMs: number
  // True when the current (slug, version) has a complete optimal lap on file.
  // Perfectionist is per-version: completing it elsewhere does not count for
  // the current track.
  optimalComplete: boolean
  // Distinct slugs the player has set foot on. Lifetime, dedupes across
  // versions of the same slug.
  distinctSlugCount: number
  // True when the player has earned a platinum medal anywhere. The locked
  // Platinum row reads "race a leaderboard #1 to unlock" without a numeric
  // bar (binary milestone).
  platinumEarnedAnywhere: boolean
  // True when a wrong-way warning has fired in the current session (or any
  // prior session that already earned the achievement). Binary milestone.
  wrongWayTriggered: boolean
}

// Builds a fresh empty snapshot. Returned as a new object every call so
// callers can mutate the result safely.
export function emptyAchievementProgressSnapshot(): AchievementProgressSnapshot {
  return {
    lifetimeFastestLapMs: null,
    lifetimeBestDriftScore: null,
    lifetimeBestPbStreak: null,
    trackLapCount: 0,
    trackDriveMs: 0,
    optimalComplete: false,
    distinctSlugCount: 0,
    platinumEarnedAnywhere: false,
    wrongWayTriggered: false,
  }
}

// Per-achievement progress entry. value / target are in the same units (ms,
// laps, count, score) so a renderer can show "N / T" plus a normalized 0..1
// fraction.
export interface AchievementProgressEntry {
  // Numeric progress (e.g. fastest-lap-ms-so-far for sub-30, lap count for
  // Track Veteran). Always non-negative and finite.
  value: number
  // Numeric goal (e.g. 30000 ms for sub-30, 50 laps for Track Veteran).
  // Always positive.
  target: number
  // Normalized 0..1 progress fraction. For lap-time achievements this is
  // computed as target/value clamped to [0, 1] so the bar fills as the
  // player gets closer (lower lap time = higher fraction). For count-style
  // milestones this is value/target.
  fraction: number
  // Human-readable progress label, e.g. "21.412s / 20.000s" or "23 / 50 laps".
  // Renderer concatenates the achievement name with this label so the row
  // reads as "Sub-20: 21.412s / 20.000s".
  label: string
  // True when the achievement has already been earned. Renderer can dim or
  // tint the bar to read "complete" rather than "in progress".
  unlocked: boolean
  // True when the achievement is binary (wrong-way, first-lap, etc.) and the
  // numeric fields above are not meaningful. Renderer should hide the bar
  // and the numeric label.
  binary: boolean
}

export type AchievementProgressMap = Partial<
  Record<AchievementId, AchievementProgressEntry>
>

// Build the per-achievement progress map. Defensive: non-finite or non-positive
// snapshot fields fall back to "no progress" so a hand-edited storage blob
// never paints a negative bar.
//
// `unlocked` map drives the unlock state per row so the renderer can still
// surface the player's best-yet number on an already-earned milestone (e.g.
// "lifetime best 18.2s" on Sub-20 after the player keeps improving).
export function buildAchievementProgress(
  snapshot: AchievementProgressSnapshot,
  unlocked: AchievementMap,
): AchievementProgressMap {
  const result: AchievementProgressMap = {}
  for (const def of ACHIEVEMENTS) {
    const entry = computeEntry(def.id, snapshot, !!unlocked[def.id])
    if (entry) result[def.id] = entry
  }
  return result
}

function computeEntry(
  id: AchievementId,
  snapshot: AchievementProgressSnapshot,
  isUnlocked: boolean,
): AchievementProgressEntry | null {
  switch (id) {
    case 'sub-30':
      return lapTimeEntry(snapshot.lifetimeFastestLapMs, SUB_30_MS, isUnlocked)
    case 'sub-20':
      return lapTimeEntry(snapshot.lifetimeFastestLapMs, SUB_20_MS, isUnlocked)
    case 'sub-15':
      return lapTimeEntry(snapshot.lifetimeFastestLapMs, SUB_15_MS, isUnlocked)
    case 'drift-king':
      return countEntry(
        sanitizeNonNegativeInt(snapshot.lifetimeBestDriftScore),
        DRIFT_KING_THRESHOLD,
        formatScoreLabel,
        isUnlocked,
      )
    case 'triple-pb-streak':
      return countEntry(
        sanitizeNonNegativeInt(snapshot.lifetimeBestPbStreak),
        TRIPLE_PB_STREAK,
        formatStreakLabel,
        isUnlocked,
      )
    case 'five-pb-streak':
      return countEntry(
        sanitizeNonNegativeInt(snapshot.lifetimeBestPbStreak),
        FIVE_PB_STREAK,
        formatStreakLabel,
        isUnlocked,
      )
    case 'track-veteran':
      return countEntry(
        sanitizeNonNegativeInt(snapshot.trackLapCount),
        TRACK_VETERAN_LAP_COUNT,
        formatLapsLabel,
        isUnlocked,
      )
    case 'marathoner':
      return durationEntry(
        sanitizeNonNegative(snapshot.trackDriveMs),
        MARATHONER_DRIVE_MS,
        isUnlocked,
      )
    case 'variety-pack':
      return countEntry(
        sanitizeNonNegativeInt(snapshot.distinctSlugCount),
        VARIETY_PACK_SLUG_COUNT,
        formatTracksLabel,
        isUnlocked,
      )
    case 'perfectionist':
      // Binary on the current track: the optimal lap is either complete or it
      // is not. We surface this as a 0/1 binary entry so the renderer can
      // show "in progress on this track" without inventing a sector count
      // here (the underlying source is already a boolean).
      return {
        value: snapshot.optimalComplete ? 1 : 0,
        target: 1,
        fraction: snapshot.optimalComplete ? 1 : 0,
        label: snapshot.optimalComplete ? 'complete' : 'not yet on this track',
        unlocked: isUnlocked,
        binary: true,
      }
    case 'platinum-medal':
      return {
        value: snapshot.platinumEarnedAnywhere ? 1 : 0,
        target: 1,
        fraction: snapshot.platinumEarnedAnywhere ? 1 : 0,
        label: snapshot.platinumEarnedAnywhere
          ? 'earned'
          : 'beat a leaderboard #1',
        unlocked: isUnlocked,
        binary: true,
      }
    case 'wrong-way':
      return {
        value: snapshot.wrongWayTriggered ? 1 : 0,
        target: 1,
        fraction: snapshot.wrongWayTriggered ? 1 : 0,
        label: snapshot.wrongWayTriggered
          ? 'triggered'
          : 'drive against the racing line',
        unlocked: isUnlocked,
        binary: true,
      }
    case 'first-lap':
    case 'first-pb':
      // Pure milestones. Renderer hides the bar and surfaces only the
      // unlocked state.
      return {
        value: isUnlocked ? 1 : 0,
        target: 1,
        fraction: isUnlocked ? 1 : 0,
        label: isUnlocked ? 'done' : 'complete one lap',
        unlocked: isUnlocked,
        binary: true,
      }
    default:
      return null
  }
}

function lapTimeEntry(
  fastestMs: number | null,
  targetMs: number,
  isUnlocked: boolean,
): AchievementProgressEntry {
  const sanitized =
    fastestMs !== null && Number.isFinite(fastestMs) && fastestMs > 0
      ? fastestMs
      : null
  // No lap on file yet: zero progress, labeled accordingly.
  if (sanitized === null) {
    return {
      value: 0,
      target: targetMs,
      fraction: 0,
      label: `no lap yet, target ${formatLapTimeSeconds(targetMs)}`,
      unlocked: isUnlocked,
      binary: false,
    }
  }
  // Lap-time progress is target/value: 30s lap with 20s target = 0.667.
  // A faster lap clamps the fraction to 1.
  const fraction = sanitized <= targetMs ? 1 : clampFraction(targetMs / sanitized)
  return {
    value: sanitized,
    target: targetMs,
    fraction,
    label: `${formatLapTimeSeconds(sanitized)} / ${formatLapTimeSeconds(targetMs)}`,
    unlocked: isUnlocked,
    binary: false,
  }
}

function countEntry(
  value: number,
  target: number,
  format: (value: number, target: number) => string,
  isUnlocked: boolean,
): AchievementProgressEntry {
  const fraction = target > 0 ? clampFraction(value / target) : 0
  return {
    value,
    target,
    fraction,
    label: format(value, target),
    unlocked: isUnlocked,
    binary: false,
  }
}

function durationEntry(
  value: number,
  target: number,
  isUnlocked: boolean,
): AchievementProgressEntry {
  const fraction = target > 0 ? clampFraction(value / target) : 0
  return {
    value,
    target,
    fraction,
    label: `${formatDurationMinutes(value)} / ${formatDurationMinutes(target)}`,
    unlocked: isUnlocked,
    binary: false,
  }
}

function clampFraction(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0
  if (n > 1) return 1
  return n
}

function sanitizeNonNegative(n: number | null): number {
  if (n === null || !Number.isFinite(n) || n < 0) return 0
  return n
}

function sanitizeNonNegativeInt(n: number | null): number {
  if (n === null || !Number.isFinite(n) || n < 0) return 0
  return Math.floor(n)
}

// Lap time formatted like "21.412s" or "30.000s". The achievement thresholds
// are whole-second values so the .000 suffix on the target reads honestly
// when the player's bar is at the gate.
export function formatLapTimeSeconds(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '--.---s'
  const seconds = ms / 1000
  return `${seconds.toFixed(3)}s`
}

// Drive-time formatted like "12:30 / 30:00" (mm:ss). Marathoner is the only
// duration-style milestone today so the formatter is shaped for it.
export function formatDurationMinutes(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '0:00'
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function formatLapsLabel(value: number, target: number): string {
  return `${value} / ${target} laps`
}

function formatTracksLabel(value: number, target: number): string {
  return `${value} / ${target} tracks`
}

function formatStreakLabel(value: number, target: number): string {
  return `best x${value} / x${target}`
}

function formatScoreLabel(value: number, target: number): string {
  return `${value} / ${target} pts`
}

// Pick the closest N locked goals (highest fraction first, descending). Used
// by the pause-menu pane to surface a compact "next goals" strip above the
// full list. Binary milestones are excluded so the strip never highlights an
// achievement the player cannot make incremental progress on.
export function pickNextGoals(
  progress: AchievementProgressMap,
  max: number,
): AchievementId[] {
  if (!Number.isFinite(max) || max <= 0) return []
  const limit = Math.floor(max)
  const candidates: { id: AchievementId; fraction: number; orderIndex: number }[] = []
  let orderIndex = 0
  for (const def of ACHIEVEMENTS) {
    const entry = progress[def.id]
    orderIndex += 1
    if (!entry) continue
    if (entry.unlocked) continue
    if (entry.binary) continue
    candidates.push({ id: def.id, fraction: entry.fraction, orderIndex })
  }
  candidates.sort((a, b) => {
    if (b.fraction !== a.fraction) return b.fraction - a.fraction
    // Stable tie-break on the canonical ACHIEVEMENTS catalog order so two
    // same-fraction entries always render in the same slot.
    return a.orderIndex - b.orderIndex
  })
  return candidates.slice(0, limit).map((c) => c.id)
}
