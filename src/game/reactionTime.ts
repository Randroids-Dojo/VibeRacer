// Reaction time at the GO light. Measures how many milliseconds elapsed
// between the countdown's GO step (which is also the moment `state.raceStartMs`
// is seeded by `RaceCanvas`) and the player first depressing the throttle for
// the new race. A classic time-trial stat racing fans love to chase.
//
// Pure helpers only. No DOM, no WebGL, no React. The renderer owns the
// per-frame detection and feeds the result through a callback to React state.
//
// The classification thresholds are loose enough to read as encouraging on
// the first race ("GOOD") while still rewarding genuinely fast reactions
// (LIGHTNING is sub-200 ms, which is roughly "trained athlete on a familiar
// stimulus"). The slowest tier is named so a 2 second reaction reads as
// "HUMAN" rather than scolding the player for opening the menu mid-countdown.

// How long the HUD chip stays on screen after a fresh measurement.
// Long enough that the player notices the result, short enough that it does
// not crowd the in-race HUD past the first sector or two.
export const REACTION_TIME_DISPLAY_MS = 3500

// Reaction-time tiers. Ordered fastest first so a tier-iteration that wants
// "the fastest tier this measurement still beats" can early-exit.
export const REACTION_TIME_TIERS = ['lightning', 'great', 'good', 'human'] as const
export type ReactionTimeTier = (typeof REACTION_TIME_TIERS)[number]

// Inclusive upper bounds for each tier in milliseconds. The `human` tier is
// effectively a catch-all (every positive measurement falls in or below
// `Infinity`) so a slow start still classifies into something rather than
// returning null. Keeps the chip readable across every race.
export const REACTION_TIME_TIER_THRESHOLDS_MS: Record<ReactionTimeTier, number> = {
  lightning: 200,
  great: 350,
  good: 600,
  human: Number.POSITIVE_INFINITY,
}

// Player-facing labels. Uppercased on render to match the existing HUD chip
// style; kept TitleCase here so the source reads as a sentence in error
// messages and aria-labels.
export const REACTION_TIME_TIER_LABELS: Record<ReactionTimeTier, string> = {
  lightning: 'Lightning',
  great: 'Great',
  good: 'Good',
  human: 'Human',
}

// Description copy for the Settings hint and aria-label fallbacks. No
// em-dashes (per project convention).
export const REACTION_TIME_TIER_DESCRIPTIONS: Record<ReactionTimeTier, string> = {
  lightning: 'Sub 200 ms. Trained-athlete fast.',
  great: 'Sub 350 ms. Sharp pre-timed launch.',
  good: 'Sub 600 ms. Solid first-tap pace.',
  human: 'Above 600 ms. Take a breath; chase it next time.',
}

// Accent color per tier. Used by the HUD chip's border + badge text. Sticks
// to the same warm-gold-to-cool-blue family as the medal palette so the
// chip reads as a sibling of the existing PB chips at a glance.
export const REACTION_TIME_TIER_COLORS: Record<ReactionTimeTier, string> = {
  lightning: '#a8e6ff', // Cool electric blue (fastest, "lightning bolt").
  great: '#ffd35a', // Warm gold (close second, celebratory).
  good: '#9be58a', // Soft green (encouraging).
  human: '#d4d4d4', // Neutral gray (no shaming).
}

// Classify a reaction time in milliseconds into the fastest tier whose
// threshold the measurement satisfies. Defensive against non-finite or
// non-positive inputs (returns 'human' so the chip never disappears on a
// corrupt read).
export function classifyReactionTime(ms: number): ReactionTimeTier {
  if (!Number.isFinite(ms) || ms <= 0) return 'human'
  for (const tier of REACTION_TIME_TIERS) {
    if (ms <= REACTION_TIME_TIER_THRESHOLDS_MS[tier]) return tier
  }
  // Unreachable while `human` has Infinity threshold, but keeps the function
  // total without an explicit assertion so a future threshold edit cannot
  // produce undefined behavior.
  return 'human'
}

// Format a reaction time as `S.mmm s` (e.g. `0.245 s`). The trailing unit
// keeps the chip readable in isolation (no surrounding "REACTION" label
// would mean the player has to remember the number is in seconds). Returns
// "--.--- s" on non-finite or non-positive input so the slot keeps its
// shape.
export function formatReactionTime(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '-.--- s'
  const total = Math.max(0, Math.round(ms))
  const seconds = Math.floor(total / 1000)
  const millis = total % 1000
  return `${seconds}.${String(millis).padStart(3, '0')} s`
}

// Human-readable label combining the formatted time and the tier name, e.g.
// `0.245 s LIGHTNING`. Used as the chip's accessible label and as the toast
// copy when a fresh personal best fires.
export function formatReactionTimeLabel(ms: number, tier?: ReactionTimeTier): string {
  const resolvedTier = tier ?? classifyReactionTime(ms)
  return `${formatReactionTime(ms)} ${REACTION_TIME_TIER_LABELS[resolvedTier].toUpperCase()}`
}

// True when the supplied normalized throttle input represents the player
// pressing forward (gas) for the new race. Reverse / brake input does not
// count: the conventional racing-game reaction-time stat measures "go pedal
// down", not "any pedal down". Treats anything strictly above the noise
// floor as a press so a feathered analog trigger pre-loaded against the
// dead-zone still registers cleanly.
//
// The threshold is intentionally conservative (well above gamepad dead-zone
// noise but well below "deliberate quarter-press") so a player who cannot
// reach a full trigger pull due to trigger travel still records a fair time.
export const REACTION_TIME_PRESS_THRESHOLD = 0.05

export function isReactionInputPressed(throttleInput: number): boolean {
  if (!Number.isFinite(throttleInput)) return false
  return throttleInput > REACTION_TIME_PRESS_THRESHOLD
}

// Sanitize a reaction time value read from disk or the network. Drops
// non-finite, non-positive, and absurdly large measurements so the lifetime-
// best storage and the Stats pane never have to render a junk number.
// `MAX_REASONABLE_REACTION_MS` is generous on purpose: we'd rather record a
// genuine sleeper-grade reaction than throw it away.
export const MAX_REASONABLE_REACTION_MS = 30_000

export function sanitizeReactionTime(raw: unknown): number | null {
  if (typeof raw !== 'number') return null
  if (!Number.isFinite(raw)) return null
  if (raw <= 0) return null
  if (raw > MAX_REASONABLE_REACTION_MS) return null
  return Math.round(raw)
}

// Determine whether a fresh measurement beats a stored personal best.
// Treats null / non-finite / non-positive prior bests as "no PB on file"
// so the very first reaction on a brand-new track reads as a PB.
// Matches the convention used by the PB-streak helper.
export function isReactionPb(prevBestMs: number | null, freshMs: number): boolean {
  const sanitized = sanitizeReactionTime(freshMs)
  if (sanitized === null) return false
  if (prevBestMs === null) return true
  if (!Number.isFinite(prevBestMs) || prevBestMs <= 0) return true
  return sanitized < prevBestMs
}
