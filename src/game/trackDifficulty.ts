/**
 * Track difficulty rating.
 *
 * Pure helpers that score a track's piece array on a 0..100 scale and bucket
 * the score into a small set of difficulty tiers (Easy / Moderate / Hard /
 * Expert). The score is a weighted sum of:
 *
 * - per-piece complexity (a sharp 90-degree corner is harder than a straight,
 *   and an S-curve is harder still)
 * - turn density (more corners per total piece count = busier track)
 * - direction-flip count (alternating left / right turns demand more weight
 *   transfer than a constant-radius loop)
 * - track length (a longer layout has more places to lose time, so a small
 *   bonus is added past a baseline)
 *
 * The output is intentionally coarse so a player can scan a list of tracks
 * and pick one that matches their mood rather than guess from the slug.
 *
 * Defensive against a null / empty / malformed pieces array so the renderer
 * can degrade to a "?" badge without try/catch. Every numeric output is
 * clamped to a finite, sensible range.
 */

import type { Piece, PieceType } from '@/lib/schemas'

// Difficulty tiers in ascending order so a `<= threshold` cascade walks them
// from easy to expert and stops on the first match. The renderer is allowed
// to reverse the order for a "tier ladder" UI, but the canonical order stays
// here so a future addition lands in one place.
export const TRACK_DIFFICULTY_TIERS = [
  'easy',
  'moderate',
  'hard',
  'expert',
] as const
export type TrackDifficultyTier = (typeof TRACK_DIFFICULTY_TIERS)[number]

export const TRACK_DIFFICULTY_LABELS: Record<TrackDifficultyTier, string> = {
  easy: 'Easy',
  moderate: 'Moderate',
  hard: 'Hard',
  expert: 'Expert',
}

export const TRACK_DIFFICULTY_DESCRIPTIONS: Record<
  TrackDifficultyTier,
  string
> = {
  easy: 'Mostly straights with a few gentle corners. Friendly to first laps.',
  moderate: 'Balanced mix of corners and straights. A solid challenge.',
  hard: 'Tight turns and direction flips reward precise driving.',
  expert: 'Technical layout packed with sharp corners and S-curves.',
}

// Tier accent palette. Cool colors for easy, warm for hard, hot red for
// expert. Mirrors the medal / reaction-time palette family so the visual
// language across the app stays consistent.
export const TRACK_DIFFICULTY_COLORS: Record<TrackDifficultyTier, string> = {
  easy: '#5cd672',
  moderate: '#5fb6ff',
  hard: '#f3a93b',
  expert: '#e84a5f',
}

// Per-piece-type complexity weight. A straight contributes nothing (it is
// the baseline); 90-degree corners contribute the most because they demand
// the heaviest braking / turn-in commitment; S-curves sit between because
// they reward steady steering through two opposed arcs; sweep turns are softer
// because their sampled centerline eases the steering transition.
export const PIECE_COMPLEXITY_WEIGHTS: Record<PieceType, number> = {
  straight: 0,
  left90: 1.5,
  right90: 1.5,
  scurve: 1.2,
  scurveLeft: 1.2,
  sweepRight: 1.0,
  sweepLeft: 1.0,
  megaSweepRight: 1.1,
  megaSweepLeft: 1.1,
  hairpin: 1.4,
  hairpinTight: 1.5,
  hairpinWide: 1.3,
  arc45: 0.8,
  arc45Left: 0.8,
  diagonal: 0.2,
  wideArc45Right: 0.7,
  wideArc45Left: 0.7,
  diagonalSweepRight: 0.9,
  diagonalSweepLeft: 0.9,
  kinkRight: 0.4,
  kinkLeft: 0.4,
  offsetStraightRight: 0.6,
  offsetStraightLeft: 0.6,
  grandSweepRight: 1.0,
  grandSweepLeft: 1.0,
  flexStraight: 0.3,
}

// Whether a piece type counts as a "turn" for the density and direction-flip
// metrics. S-curves count because they swap direction inside themselves;
// straights do not.
export const TURN_PIECE_TYPES: ReadonlySet<PieceType> = new Set<PieceType>([
  'left90',
  'right90',
  'scurve',
  'scurveLeft',
  'sweepRight',
  'sweepLeft',
  'megaSweepRight',
  'megaSweepLeft',
  'hairpin',
  'hairpinTight',
  'hairpinWide',
  'arc45',
  'arc45Left',
  'diagonal',
  'wideArc45Right',
  'wideArc45Left',
  'diagonalSweepRight',
  'diagonalSweepLeft',
  'kinkRight',
  'kinkLeft',
  'offsetStraightRight',
  'offsetStraightLeft',
  'grandSweepRight',
  'grandSweepLeft',
])

// Score tier thresholds. A score at-or-below the threshold lands in that
// tier; the highest tier ('expert') has no upper bound. Values were tuned
// against a small sample of stock tracks (oval -> easy, sandbox -> hard,
// hand-built figure-8 -> expert) so the buckets feel right at first sight.
export const TRACK_DIFFICULTY_THRESHOLDS: Record<
  Exclude<TrackDifficultyTier, 'expert'>,
  number
> = {
  easy: 18,
  moderate: 38,
  hard: 62,
}

// Length bonus kicks in past this baseline so a tiny 4-piece loop and a
// 32-piece sweep can land in different buckets even when the corner mix
// matches.
export const TRACK_LENGTH_BONUS_BASELINE = 8
export const TRACK_LENGTH_BONUS_PER_PIECE = 0.6
export const TRACK_LENGTH_BONUS_MAX = 18

// Density weights. Both metrics produce a 0..1 ratio multiplied by their
// weight; the product saturates the score band the corner density occupies.
export const TURN_DENSITY_WEIGHT = 25
export const DIRECTION_FLIP_WEIGHT = 18

// The maximum score the helper will ever return. Keeps the renderer's
// percentage / bar code defensive against a future weight tweak that pushes
// a pathological track past 100.
export const TRACK_DIFFICULTY_MAX_SCORE = 100

// Per-piece complexity contribution to the score, scaled so a track full of
// 90-degree corners alone clears the moderate threshold without any density
// or length bonus. The cap makes a 64-piece tour-de-force not eclipse all
// other inputs.
export const COMPLEXITY_SCORE_CAP = 60

export interface TrackDifficultyBreakdown {
  pieceCount: number
  turnCount: number
  directionFlips: number
  complexityRaw: number
  complexityScore: number
  densityScore: number
  flipScore: number
  lengthBonus: number
}

export interface TrackDifficultyInfo {
  tier: TrackDifficultyTier
  score: number
  breakdown: TrackDifficultyBreakdown
}

// Sentinel "unknown" info used when the input is missing / empty so the
// renderer can short-circuit to a placeholder badge without branching.
export const UNKNOWN_DIFFICULTY: TrackDifficultyInfo = {
  tier: 'easy',
  score: 0,
  breakdown: {
    pieceCount: 0,
    turnCount: 0,
    directionFlips: 0,
    complexityRaw: 0,
    complexityScore: 0,
    densityScore: 0,
    flipScore: 0,
    lengthBonus: 0,
  },
}

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo
  if (n < lo) return lo
  if (n > hi) return hi
  return n
}

// Pieces are rendered in their stored order. A "direction flip" is a turn
// piece whose handedness disagrees with the previous turn piece (left then
// right or right then left). S-curves contain a flip by construction so
// they always contribute one flip on top of any flip vs the prior turn.
function turnHand(p: Piece): 'left' | 'right' | 'flip' | null {
  switch (p.type) {
    case 'left90':
      return 'left'
    case 'right90':
    case 'sweepRight':
    case 'megaSweepRight':
      return 'right'
    case 'sweepLeft':
    case 'megaSweepLeft':
      return 'left'
    case 'hairpin':
      return 'right'
    case 'arc45':
      return 'right'
    case 'arc45Left':
      return 'left'
    case 'diagonal':
      return null
    case 'scurve':
    case 'scurveLeft':
      return 'flip'
    case 'straight':
    case 'flexStraight':
      return null
    default:
      // Unknown / future piece type. Treat as a non-turn so a future schema
      // addition does not silently inflate the turn count.
      return null
  }
}

export function isTrackDifficultyTier(
  value: unknown,
): value is TrackDifficultyTier {
  return (
    typeof value === 'string' &&
    (TRACK_DIFFICULTY_TIERS as readonly string[]).includes(value)
  )
}

/**
 * Bucket a numeric score into the matching difficulty tier. Walks the tier
 * list in ascending order and returns the first tier whose threshold is
 * greater than or equal to the score; 'expert' is the catch-all. Defensive
 * against non-finite or negative input (collapses to 'easy').
 */
export function classifyDifficulty(score: number): TrackDifficultyTier {
  if (!Number.isFinite(score) || score <= 0) return 'easy'
  if (score <= TRACK_DIFFICULTY_THRESHOLDS.easy) return 'easy'
  if (score <= TRACK_DIFFICULTY_THRESHOLDS.moderate) return 'moderate'
  if (score <= TRACK_DIFFICULTY_THRESHOLDS.hard) return 'hard'
  return 'expert'
}

/**
 * Walk a piece array and produce the full breakdown plus the resolved tier.
 * Defensive against:
 *  - null / undefined / non-array input (returns UNKNOWN_DIFFICULTY)
 *  - empty array (returns UNKNOWN_DIFFICULTY)
 *  - pieces with an unknown `type` (treated as straights so a future schema
 *    addition does not crash the renderer; the future addition should add a
 *    weight here in the same commit)
 *
 * The returned info object is a fresh allocation so the caller can mutate
 * its breakdown safely.
 */
export function analyzeTrack(
  pieces: Piece[] | null | undefined,
): TrackDifficultyInfo {
  if (!Array.isArray(pieces) || pieces.length === 0) {
    // Return a fresh clone so the caller cannot mutate the sentinel.
    return {
      tier: UNKNOWN_DIFFICULTY.tier,
      score: UNKNOWN_DIFFICULTY.score,
      breakdown: { ...UNKNOWN_DIFFICULTY.breakdown },
    }
  }

  let complexityRaw = 0
  let turnCount = 0
  let directionFlips = 0
  let prevTurnHand: 'left' | 'right' | null = null

  for (const piece of pieces) {
    if (!piece || typeof piece !== 'object') continue
    const weight =
      PIECE_COMPLEXITY_WEIGHTS[piece.type as PieceType] !== undefined
        ? PIECE_COMPLEXITY_WEIGHTS[piece.type as PieceType]
        : 0
    complexityRaw += weight
    const hand = turnHand(piece)
    if (hand === null) continue
    turnCount += 1
    if (hand === 'flip') {
      // S-curve always contains an internal flip plus a flip vs an
      // opposing prior turn (if any).
      directionFlips += 1
      // Reset prev hand to null so a same-hand turn after the s-curve does
      // not falsely trigger a flip on the next iteration; the s-curve
      // resolves to neither pure left nor pure right.
      prevTurnHand = null
      continue
    }
    if (prevTurnHand !== null && prevTurnHand !== hand) {
      directionFlips += 1
    }
    prevTurnHand = hand
  }

  const pieceCount = pieces.length
  const complexityScore = Math.min(complexityRaw * 4, COMPLEXITY_SCORE_CAP)
  const turnDensity = pieceCount > 0 ? turnCount / pieceCount : 0
  const densityScore = clamp(turnDensity, 0, 1) * TURN_DENSITY_WEIGHT
  const maxFlips = Math.max(1, turnCount - 1)
  const flipRatio = clamp(directionFlips / maxFlips, 0, 1)
  const flipScore = flipRatio * DIRECTION_FLIP_WEIGHT
  const lengthBonus = clamp(
    Math.max(0, pieceCount - TRACK_LENGTH_BONUS_BASELINE) *
      TRACK_LENGTH_BONUS_PER_PIECE,
    0,
    TRACK_LENGTH_BONUS_MAX,
  )

  const score = clamp(
    Math.round(complexityScore + densityScore + flipScore + lengthBonus),
    0,
    TRACK_DIFFICULTY_MAX_SCORE,
  )
  const tier = classifyDifficulty(score)
  return {
    tier,
    score,
    breakdown: {
      pieceCount,
      turnCount,
      directionFlips,
      complexityRaw: Math.round(complexityRaw * 100) / 100,
      complexityScore: Math.round(complexityScore * 100) / 100,
      densityScore: Math.round(densityScore * 100) / 100,
      flipScore: Math.round(flipScore * 100) / 100,
      lengthBonus: Math.round(lengthBonus * 100) / 100,
    },
  }
}

/**
 * Plain-language label for a tier ("Easy", "Moderate", ...). Defensive
 * against an unknown tier (returns "Unknown").
 */
export function labelForTier(tier: TrackDifficultyTier | null | undefined): string {
  if (!tier || !isTrackDifficultyTier(tier)) return 'Unknown'
  return TRACK_DIFFICULTY_LABELS[tier]
}

/**
 * Hex color for a tier. Defensive against an unknown tier (returns the
 * neutral muted gray used by the rest of the HUD for "no value").
 */
export function colorForTier(tier: TrackDifficultyTier | null | undefined): string {
  if (!tier || !isTrackDifficultyTier(tier)) return '#888888'
  return TRACK_DIFFICULTY_COLORS[tier]
}
