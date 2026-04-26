// Per-track and lifetime top-speed personal-best tracking. Pure helpers only:
// no DOM, no WebGL, no React. The renderer captures the live peak through the
// existing speedometer ref; this module owns the math (PB comparison,
// classification, formatting) and the storage layer (in `src/lib/localBest.ts`)
// owns the round-trip with localStorage.
//
// Top speed is tracked in raw "us" (world units per second) so the stored
// value is independent of the player's display unit pick. The renderer / HUD
// converts to mph / km/h at draw time using the existing speedometer helpers.
//
// Defensive everywhere: a non-finite or non-positive measurement reads as "no
// PB" so a one-frame physics glitch can never poison the stored peak. Tier
// classification gives the celebration chip a sane label even on the very
// first PB (no prior best to compare deltas against).

import {
  MPS_TO_MPH,
  MPS_TO_KMH,
  type SpeedUnit,
  unitLabel,
} from '@/lib/speedometer'

// How long the HUD chip stays on screen after a fresh PB. Long enough that
// the player notices the result, short enough that it does not crowd the
// in-race HUD past the first sector or two. Mirrors the reaction-time chip's
// dwell so the two cues feel like siblings.
export const TOP_SPEED_PB_DISPLAY_MS = 3500

// Cap the stored top speed at a comfortably-above-stock-tuning ceiling so a
// hand-edited blob can never seed an absurd "infinity / s" PB the gauge
// cannot show. The stock car tops out around 26 us; a heavily-tuned car can
// reach the high 30s. 200 leaves room for future tuning ranges and still
// catches obvious garbage.
export const MAX_REASONABLE_TOP_SPEED_US = 200

// Minimum difference between a fresh top speed and the stored PB to count as
// a "significant" PB worth the celebration chip. Avoids flickering the chip
// on noise-floor jitter when the player is hovering just above their prior
// peak (e.g. a long flat-out straight where every frame edges the value up
// by a thousandth). The number is small enough (1 / s ~= 2.2 mph) that any
// genuinely improved top speed always trips it.
export const TOP_SPEED_PB_MIN_DELTA_US = 1.0

// Sanitize a raw top-speed value (typically captured from `topSpeedRef`).
// Returns null on non-finite, non-positive, or absurdly-large input so the
// rest of the flow never has to defend against junk. Round to a single
// decimal place so the stored value matches the gauge's display precision.
export function sanitizeTopSpeed(raw: unknown): number | null {
  if (typeof raw !== 'number') return null
  if (!Number.isFinite(raw)) return null
  if (raw <= 0) return null
  if (raw > MAX_REASONABLE_TOP_SPEED_US) return null
  return Math.round(raw * 10) / 10
}

// Determine whether a fresh measurement beats a stored top-speed PB by at
// least `TOP_SPEED_PB_MIN_DELTA_US`. Treats null / non-finite / non-positive
// prior bests as "no PB on file" so the very first qualifying top speed on
// a brand-new track reads as a PB. Mirrors the reaction-time / lap-time PB
// helpers so callers can branch on a single boolean.
export function isTopSpeedPb(
  prevBestUs: number | null,
  freshUs: number,
): boolean {
  const sanitized = sanitizeTopSpeed(freshUs)
  if (sanitized === null) return false
  if (prevBestUs === null) return true
  if (!Number.isFinite(prevBestUs) || prevBestUs <= 0) return true
  return sanitized >= prevBestUs + TOP_SPEED_PB_MIN_DELTA_US
}

// Format a top-speed value in the player's chosen display unit, e.g. "58 MPH"
// or "94 KM/H". Used by the HUD chip and the Stats pane so the readout matches
// the gauge below it. Defensive: a non-finite or non-positive input renders
// as "-- <unit>" so the slot keeps its shape on a fresh slug.
export function formatTopSpeed(rawUs: number | null, unit: SpeedUnit): string {
  if (rawUs === null) return `-- ${unitLabel(unit)}`
  if (!Number.isFinite(rawUs) || rawUs <= 0) return `-- ${unitLabel(unit)}`
  const display =
    unit === 'mph'
      ? rawUs * MPS_TO_MPH
      : unit === 'kmh'
        ? rawUs * MPS_TO_KMH
        : rawUs
  if (unit === 'us') {
    return `${display.toFixed(1)} ${unitLabel(unit)}`
  }
  return `${Math.round(display)} ${unitLabel(unit)}`
}

// Format the absolute delta between a fresh top speed and the prior PB in the
// player's display unit, prefixed with "+" so the chip reads as a celebration
// (e.g. "+3 MPH"). Returns null when there is no prior PB (the chip should
// just say "FIRST!" in that case) or when the math degenerates.
export function formatTopSpeedDelta(
  freshUs: number,
  priorUs: number | null,
  unit: SpeedUnit,
): string | null {
  const sanitized = sanitizeTopSpeed(freshUs)
  if (sanitized === null) return null
  if (priorUs === null) return null
  if (!Number.isFinite(priorUs) || priorUs <= 0) return null
  const deltaUs = sanitized - priorUs
  if (deltaUs <= 0) return null
  const display =
    unit === 'mph'
      ? deltaUs * MPS_TO_MPH
      : unit === 'kmh'
        ? deltaUs * MPS_TO_KMH
        : deltaUs
  if (unit === 'us') {
    return `+${display.toFixed(1)} ${unitLabel(unit)}`
  }
  const rounded = Math.round(display)
  if (rounded <= 0) {
    // The raw delta is positive but rounds to zero in the display unit (e.g.
    // a 0.4 mph improvement). Show the value with a single decimal so the
    // chip does not lie about a "+0" win.
    return `+${display.toFixed(1)} ${unitLabel(unit)}`
  }
  return `+${rounded} ${unitLabel(unit)}`
}

// Tier classification for the chip's accent color. Anchored against the
// player's current `maxSpeed` tuning so a heavily-tuned car still reads as
// "blistering" when it hits its own ceiling. Defensive against zero / negative
// maxSpeed so a corrupt tuning value collapses to "warm".
export const TOP_SPEED_TIERS = ['warm', 'fast', 'blazing', 'redline'] as const
export type TopSpeedTier = (typeof TOP_SPEED_TIERS)[number]

// Inclusive thresholds: a value that meets the threshold for `redline` reads
// as `redline` regardless of any earlier tier match. The cascade walks fastest
// first so a hot run short-circuits early.
export const TOP_SPEED_TIER_THRESHOLDS: Record<TopSpeedTier, number> = {
  warm: 0.5, // anything that gets the car moving past the first turn.
  fast: 0.75, // comfortably past mid-throttle.
  blazing: 0.9, // pushing the gauge into the orange.
  redline: 1.0, // saturated against the player's own ceiling.
}

export const TOP_SPEED_TIER_LABELS: Record<TopSpeedTier, string> = {
  warm: 'Warm',
  fast: 'Fast',
  blazing: 'Blazing',
  redline: 'Redline',
}

// Accent color per tier. Sticks to the cool-to-hot family so faster reads as
// hotter at a glance. Matches the speedometer's hot-zone red for `redline`.
export const TOP_SPEED_TIER_COLORS: Record<TopSpeedTier, string> = {
  warm: '#9be58a', // soft green, encouraging.
  fast: '#a8e6ff', // cool blue, momentum.
  blazing: '#ffd35a', // warm gold, celebration.
  redline: '#ff8a6e', // hot red, "you pinned the dial".
}

// Classify a top speed against the player's current `maxSpeed` tuning. Returns
// the slowest tier whose threshold the measurement satisfies. Defensive
// against zero / negative maxSpeed and non-finite inputs (returns 'warm' so the
// chip never disappears on a corrupt read).
export function classifyTopSpeed(
  topUs: number,
  maxSpeed: number,
): TopSpeedTier {
  if (!Number.isFinite(topUs) || topUs <= 0) return 'warm'
  if (!Number.isFinite(maxSpeed) || maxSpeed <= 0) return 'warm'
  const fraction = topUs / maxSpeed
  // Walk slowest-to-fastest so the highest tier whose threshold the
  // measurement clears wins. Iterating in array order matches TOP_SPEED_TIERS
  // (which is sorted slowest-first) so the loop exits on the LAST match.
  let resolved: TopSpeedTier = 'warm'
  for (const tier of TOP_SPEED_TIERS) {
    if (fraction >= TOP_SPEED_TIER_THRESHOLDS[tier]) {
      resolved = tier
    }
  }
  return resolved
}

// Human-readable label combining the formatted top speed and the tier name,
// e.g. "58 MPH BLAZING". Used as the chip's accessible label and as the toast
// copy when a fresh personal best fires.
export function formatTopSpeedLabel(
  topUs: number,
  unit: SpeedUnit,
  tier?: TopSpeedTier,
  maxSpeed: number = 26,
): string {
  const resolvedTier = tier ?? classifyTopSpeed(topUs, maxSpeed)
  return `${formatTopSpeed(topUs, unit)} ${TOP_SPEED_TIER_LABELS[resolvedTier].toUpperCase()}`
}
