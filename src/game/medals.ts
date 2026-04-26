// Medal tier system. The player's all-time PB on a (slug, version) is
// compared against a target time (the leaderboard #1 for that version). The
// PB earns the highest tier whose threshold is at or above the PB. Tiers are
// expressed as a multiplier of the target time so a fast track and a slow
// track scale the same way.
//
// platinum: at or below the target (the player matched or beat the record)
// gold:     within 102% of the target
// silver:   within 110% of the target
// bronze:   within 125% of the target
// (none):   slower than 125% of the target, or no target on file
//
// Target sources:
// - The overall record's lap time when the player has a record to chase.
// - null when the route has never recorded a lap, in which case medals are
//   suppressed until someone (the player or another racer) sets the bar.
//
// Pure helpers only: storage, HUD wiring, and toast lifecycle live in
// `src/components/Game.tsx` and `src/components/HUD.tsx`.

export const MEDAL_TIERS = ['bronze', 'silver', 'gold', 'platinum'] as const
export type MedalTier = (typeof MEDAL_TIERS)[number]

// Threshold ratios. Each tier's threshold is the maximum lap time (as a
// fraction of the target) that still earns that tier. A platinum lap is at or
// below the target itself.
export const MEDAL_THRESHOLDS: Record<MedalTier, number> = {
  platinum: 1.0,
  gold: 1.02,
  silver: 1.1,
  bronze: 1.25,
}

// Display order from highest to lowest. Useful when iterating to find the
// best tier a given time qualifies for.
export const MEDAL_TIERS_DESCENDING: readonly MedalTier[] = [
  'platinum',
  'gold',
  'silver',
  'bronze',
]

// Compute the tier index in MEDAL_TIERS for ranking comparisons. Higher means
// better. Returns -1 for null so a player without a medal compares lower than
// any earned tier.
export function medalRank(tier: MedalTier | null): number {
  if (tier === null) return -1
  return MEDAL_TIERS.indexOf(tier)
}

// Return true when `next` is a strictly better tier than `prev`. null `prev`
// means "no medal yet" so any non-null `next` is an upgrade.
export function isMedalUpgrade(
  prev: MedalTier | null,
  next: MedalTier | null,
): boolean {
  if (next === null) return false
  return medalRank(next) > medalRank(prev)
}

// Lap-time thresholds (in ms) for each tier on a given target time. Each
// entry is the slowest lap time that still earns that tier. A nullish or
// non-finite target yields null (no medals available).
export interface MedalThresholdsMs {
  platinum: number
  gold: number
  silver: number
  bronze: number
}

export function medalThresholdsFor(
  targetMs: number | null,
): MedalThresholdsMs | null {
  if (targetMs === null || !Number.isFinite(targetMs) || targetMs <= 0) {
    return null
  }
  return {
    platinum: targetMs * MEDAL_THRESHOLDS.platinum,
    gold: targetMs * MEDAL_THRESHOLDS.gold,
    silver: targetMs * MEDAL_THRESHOLDS.silver,
    bronze: targetMs * MEDAL_THRESHOLDS.bronze,
  }
}

// Highest medal tier the lap qualifies for, or null if it does not earn one.
// `lapMs` is the player's PB; `targetMs` is the reference (leaderboard #1).
// Returns null when either input is missing / non-finite / non-positive, when
// targetMs is zero, or when the lap is slower than the bronze threshold.
export function medalForTime(
  lapMs: number | null,
  targetMs: number | null,
): MedalTier | null {
  if (lapMs === null || !Number.isFinite(lapMs) || lapMs <= 0) return null
  const thresholds = medalThresholdsFor(targetMs)
  if (thresholds === null) return null
  // Iterate highest to lowest so the first matching tier is the best the lap
  // qualifies for. Ties (lap === threshold) earn the tier (inclusive bound).
  for (const tier of MEDAL_TIERS_DESCENDING) {
    if (lapMs <= thresholds[tier]) return tier
  }
  return null
}

// Friendly label for the HUD badge and toast lines.
export const MEDAL_LABELS: Record<MedalTier, string> = {
  platinum: 'Platinum',
  gold: 'Gold',
  silver: 'Silver',
  bronze: 'Bronze',
}

// Emoji-free pictogram glyph for the badge. A filled circle in the tier color
// reads as a medal pip without depending on the user's emoji font; the HUD
// pairs it with the tier label so the meaning is unambiguous.
export const MEDAL_GLYPH = '●'

// Tier accent colors, tuned to feel close to the metals without clashing with
// the existing HUD palette. Used for the badge background ring and the toast
// text color.
export const MEDAL_COLORS: Record<MedalTier, string> = {
  platinum: '#e5edf2',
  gold: '#f4d774',
  silver: '#c8d3dd',
  bronze: '#d49866',
}
