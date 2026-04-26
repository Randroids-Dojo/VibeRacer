/**
 * Lap consistency rating.
 *
 * Pure helpers that take the player's recent completed laps and bucket the
 * standard deviation of the most recent window into a small set of friendly
 * tiers (Locked-in / Steady / Wavering / Wobbly). The chip surfaces alongside
 * the BEST (SESSION) tile in the HUD and as a tile in the end-of-session
 * summary so a player driving five laps in a row can see at a glance how
 * close together their laps are clustering.
 *
 * Why standard deviation: it is the most intuitive single number for "how
 * tight is this cluster" without requiring the player to read every lap time.
 * A low number means every lap was within a fraction of a second of every
 * other lap, which is the canonical sign of a driver who has the line dialed
 * in. A high number means the laps are scattered, which usually maps to a
 * driver still learning the track or fighting their setup.
 *
 * The metric uses a sliding window of the most recent N completed laps so
 * one off lap early in the session does not haunt the chip for the rest of
 * the run. The window is intentionally short (default 5) so the readout
 * stays current with the player's actual recent driving.
 *
 * Defensive against:
 *   - empty / null history returns null so the renderer hides the chip.
 *   - fewer than `LAP_CONSISTENCY_MIN_LAPS` (3) laps returns null so the chip
 *     does not flicker into existence on the first two laps before the
 *     standard deviation has any meaning.
 *   - non-finite or non-positive lap times in the input are skipped (a
 *     malformed entry from a future schema bump cannot poison the score).
 *   - thresholds are scaled to the player's mean lap time so a player on a
 *     long technical track is not unfairly graded against the same absolute
 *     bar as a player on a 20-second sprint loop.
 */

import type { LapHistoryEntry } from './lapHistory'

// Tiers in ascending difficulty order so a `<= threshold` cascade walks from
// the tightest cluster (locked-in) to the widest scatter (wobbly) and stops
// on the first match. The renderer is allowed to invert the order for a
// "tier ladder" readout, but the canonical order stays here so a future
// addition lands in one place.
export const LAP_CONSISTENCY_TIERS = [
  'locked-in',
  'steady',
  'wavering',
  'wobbly',
] as const
export type LapConsistencyTier = (typeof LAP_CONSISTENCY_TIERS)[number]

export const LAP_CONSISTENCY_LABELS: Record<LapConsistencyTier, string> = {
  'locked-in': 'Locked in',
  steady: 'Steady',
  wavering: 'Wavering',
  wobbly: 'Wobbly',
}

export const LAP_CONSISTENCY_DESCRIPTIONS: Record<LapConsistencyTier, string> = {
  'locked-in':
    'Your last laps are within a heartbeat of each other. Every corner is muscle memory.',
  steady: 'Tight cluster of times. The line is dialed in.',
  wavering:
    'Your laps are spreading out. Look for one sector where the line is drifting.',
  wobbly: 'Big spread between laps. Try to repeat the same line, lap to lap.',
}

// Tier accent palette. Cool greens for tight clusters, amber and red for
// loose ones. Mirrors the medal / track-difficulty / reaction-time palette
// family so the visual language across the app stays consistent.
export const LAP_CONSISTENCY_COLORS: Record<LapConsistencyTier, string> = {
  'locked-in': '#5cd672',
  steady: '#5fb6ff',
  wavering: '#f3a93b',
  wobbly: '#e84a5f',
}

// Per-tier threshold expressed as a fraction of the mean lap time so a
// player on a 60-second technical layout is not graded against the same
// absolute number-of-milliseconds bar as a player on a 18-second sprint
// loop. A standard deviation below the threshold qualifies for the tier;
// the highest tier ('wobbly') has no upper bound.
//
// Tuning baseline: across a casual session on the default 8-piece oval
// (mean lap ~14 s) a comfortable driver clusters within ~150-300 ms of
// their average. So:
//   ~ 1.5% of mean -> locked-in (very tight)
//   ~ 3.0% of mean -> steady (still good)
//   ~ 6.0% of mean -> wavering (room to improve)
//   anything more  -> wobbly
export const LAP_CONSISTENCY_THRESHOLDS: Record<
  Exclude<LapConsistencyTier, 'wobbly'>,
  number
> = {
  'locked-in': 0.015,
  steady: 0.03,
  wavering: 0.06,
}

// Minimum lap count before the chip surfaces. Two laps already give a
// standard deviation, but the value swings wildly between any pair so
// a third lap is the smallest window that produces a stable readout.
export const LAP_CONSISTENCY_MIN_LAPS = 3

// Sliding window length. The most recent N completed laps are used. A
// short window keeps the readout current with the player's actual recent
// driving rather than smearing across the entire session.
export const LAP_CONSISTENCY_WINDOW = 5

// Floor for the mean lap time used in the threshold scaling. Guards
// against a degenerate near-zero mean (a corrupt history with bogus
// sub-second laps) producing a divide-by-near-zero blow-up that would
// land every cluster in 'locked-in'. 250 ms is well under any plausible
// real lap.
export const LAP_CONSISTENCY_MIN_MEAN_MS = 250

export interface LapConsistencyInfo {
  /** Bucketed tier for the cluster's tightness. */
  tier: LapConsistencyTier
  /** Standard deviation of the windowed lap times in ms. Always >= 0. */
  stdDevMs: number
  /** Mean lap time across the windowed laps in ms. */
  meanMs: number
  /** Number of laps the standard deviation was computed over. Always
   * between `LAP_CONSISTENCY_MIN_LAPS` and `LAP_CONSISTENCY_WINDOW`. */
  sampleCount: number
  /** Standard deviation expressed as a fraction of the mean (the metric
   * the tier cascade actually compares). Useful for the renderer when
   * showing a percent badge. */
  stdDevRatio: number
}

/**
 * Compute the consistency info for the player's recent completed laps.
 *
 * Returns null when there are not enough valid laps, when the input is
 * null / not an array, or when sanitization collapses the window below
 * the minimum sample count. The renderer should hide the chip in that
 * case rather than show a placeholder.
 */
export function computeLapConsistency(
  history: readonly LapHistoryEntry[] | null | undefined,
  windowSize: number = LAP_CONSISTENCY_WINDOW,
): LapConsistencyInfo | null {
  if (!Array.isArray(history) || history.length === 0) return null
  // Defensive: a non-finite or non-positive window collapses to the default
  // window so a caller cannot accidentally request a single-lap window.
  const safeWindow =
    Number.isFinite(windowSize) && windowSize >= LAP_CONSISTENCY_MIN_LAPS
      ? Math.floor(windowSize)
      : LAP_CONSISTENCY_WINDOW
  // Sanitize the window: only keep finite, positive lap times. A future
  // schema bump that lets a 0 / negative / NaN through cannot poison the
  // metric.
  const recent: number[] = []
  for (let i = history.length - 1; i >= 0 && recent.length < safeWindow; i--) {
    const entry = history[i]
    if (!entry || typeof entry !== 'object') continue
    const ms = entry.lapTimeMs
    if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) continue
    recent.push(ms)
  }
  if (recent.length < LAP_CONSISTENCY_MIN_LAPS) return null
  const meanMs = arithmeticMean(recent)
  const stdDevMs = populationStdDev(recent, meanMs)
  // Use the larger of the actual mean and the floor to keep the ratio
  // honest. A pathological near-zero mean still produces a sensible ratio.
  const denom = Math.max(meanMs, LAP_CONSISTENCY_MIN_MEAN_MS)
  const stdDevRatio = stdDevMs / denom
  return {
    tier: classifyConsistency(stdDevRatio),
    stdDevMs: round2(stdDevMs),
    meanMs: round2(meanMs),
    sampleCount: recent.length,
    stdDevRatio: round4(stdDevRatio),
  }
}

/**
 * Bucket a standard-deviation-as-fraction-of-mean ratio into a tier.
 *
 * Defensive against non-finite or negative input: collapses to the worst
 * tier (`wobbly`) on a NaN / Infinity / negative since the math behind it
 * is broken. A clean zero ratio is valid (every lap is identical) and
 * lands in `locked-in`.
 */
export function classifyConsistency(ratio: number): LapConsistencyTier {
  if (typeof ratio !== 'number' || !Number.isFinite(ratio) || ratio < 0) {
    return 'wobbly'
  }
  if (ratio <= LAP_CONSISTENCY_THRESHOLDS['locked-in']) return 'locked-in'
  if (ratio <= LAP_CONSISTENCY_THRESHOLDS.steady) return 'steady'
  if (ratio <= LAP_CONSISTENCY_THRESHOLDS.wavering) return 'wavering'
  return 'wobbly'
}

/** Type guard for stored / cross-boundary tier values. */
export function isLapConsistencyTier(value: unknown): value is LapConsistencyTier {
  if (typeof value !== 'string') return false
  return (LAP_CONSISTENCY_TIERS as readonly string[]).includes(value)
}

export function labelForConsistencyTier(tier: LapConsistencyTier): string {
  return LAP_CONSISTENCY_LABELS[tier] ?? 'Unknown'
}

export function colorForConsistencyTier(tier: LapConsistencyTier): string {
  return LAP_CONSISTENCY_COLORS[tier] ?? '#cccccc'
}

/**
 * Format the standard deviation for a chip readout. Uses a sub-second style
 * (e.g. `0.421s`) so the chip stays compact. Defensive against a non-finite
 * input.
 */
export function formatConsistencyStdDev(stdDevMs: number): string {
  if (typeof stdDevMs !== 'number' || !Number.isFinite(stdDevMs) || stdDevMs < 0) {
    return '--'
  }
  if (stdDevMs >= 1000) {
    const seconds = stdDevMs / 1000
    return `${seconds.toFixed(2)}s`
  }
  return `${Math.round(stdDevMs)}ms`
}

/**
 * Format the standard deviation as a percent of the mean for a sub-line
 * readout (e.g. `1.2%`). Defensive against non-finite or negative input.
 */
export function formatConsistencyRatio(ratio: number): string {
  if (typeof ratio !== 'number' || !Number.isFinite(ratio) || ratio < 0) {
    return '--'
  }
  const pct = ratio * 100
  if (pct >= 10) return `${pct.toFixed(0)}%`
  return `${pct.toFixed(1)}%`
}

// --- internal helpers ---

function arithmeticMean(values: readonly number[]): number {
  let sum = 0
  for (const v of values) sum += v
  return sum / values.length
}

// Population (not sample) standard deviation. The sample is the player's
// recent driving, not a sample drawn from a larger distribution, so the
// population formula is the honest one to use. Always returns a finite
// non-negative value; a zero-variance input correctly returns 0.
function populationStdDev(values: readonly number[], mean: number): number {
  if (values.length === 0) return 0
  let sumSq = 0
  for (const v of values) {
    const diff = v - mean
    sumSq += diff * diff
  }
  const variance = sumSq / values.length
  return Math.sqrt(Math.max(0, variance))
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000
}
