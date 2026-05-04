import { describe, it, expect } from 'vitest'
import {
  analyzeTrack,
  classifyDifficulty,
  colorForTier,
  COMPLEXITY_SCORE_CAP,
  DIRECTION_FLIP_WEIGHT,
  isTrackDifficultyTier,
  labelForTier,
  PIECE_COMPLEXITY_WEIGHTS,
  TRACK_DIFFICULTY_COLORS,
  TRACK_DIFFICULTY_DESCRIPTIONS,
  TRACK_DIFFICULTY_LABELS,
  TRACK_DIFFICULTY_MAX_SCORE,
  TRACK_DIFFICULTY_THRESHOLDS,
  TRACK_DIFFICULTY_TIERS,
  TRACK_LENGTH_BONUS_BASELINE,
  TRACK_LENGTH_BONUS_MAX,
  TRACK_LENGTH_BONUS_PER_PIECE,
  TURN_DENSITY_WEIGHT,
  TURN_PIECE_TYPES,
  UNKNOWN_DIFFICULTY,
} from '@/game/trackDifficulty'
import type { Piece, PieceType } from '@/lib/schemas'

function piece(type: PieceType, row = 0, col = 0): Piece {
  return { type, row, col, rotation: 0 }
}

describe('TRACK_DIFFICULTY_TIERS table', () => {
  it('lists tiers in ascending order without duplicates', () => {
    const set = new Set<string>(TRACK_DIFFICULTY_TIERS)
    expect(set.size).toBe(TRACK_DIFFICULTY_TIERS.length)
    expect(TRACK_DIFFICULTY_TIERS.length).toBeGreaterThan(0)
    expect(TRACK_DIFFICULTY_TIERS).toEqual(['easy', 'moderate', 'hard', 'expert'])
  })

  it('has a non-empty label, description, and color per tier', () => {
    for (const tier of TRACK_DIFFICULTY_TIERS) {
      expect(typeof TRACK_DIFFICULTY_LABELS[tier]).toBe('string')
      expect(TRACK_DIFFICULTY_LABELS[tier].length).toBeGreaterThan(0)
      expect(typeof TRACK_DIFFICULTY_DESCRIPTIONS[tier]).toBe('string')
      expect(TRACK_DIFFICULTY_DESCRIPTIONS[tier].length).toBeGreaterThan(0)
      expect(/^#[0-9a-fA-F]{6}$/.test(TRACK_DIFFICULTY_COLORS[tier])).toBe(true)
    }
  })

  it('avoids em-dashes / en-dashes in every player-facing string', () => {
    for (const tier of TRACK_DIFFICULTY_TIERS) {
      expect(TRACK_DIFFICULTY_LABELS[tier]).not.toContain('\u2013')
      expect(TRACK_DIFFICULTY_LABELS[tier]).not.toContain('\u2014')
      expect(TRACK_DIFFICULTY_DESCRIPTIONS[tier]).not.toContain('\u2013')
      expect(TRACK_DIFFICULTY_DESCRIPTIONS[tier]).not.toContain('\u2014')
    }
  })

  it('has unique tier colors', () => {
    const colors = new Set(Object.values(TRACK_DIFFICULTY_COLORS))
    expect(colors.size).toBe(TRACK_DIFFICULTY_TIERS.length)
  })
})

describe('PIECE_COMPLEXITY_WEIGHTS', () => {
  it('treats straights as the zero baseline', () => {
    expect(PIECE_COMPLEXITY_WEIGHTS.straight).toBe(0)
  })

  it('weights 90-degree corners higher than s-curves', () => {
    expect(PIECE_COMPLEXITY_WEIGHTS.left90).toBeGreaterThan(
      PIECE_COMPLEXITY_WEIGHTS.scurve,
    )
    expect(PIECE_COMPLEXITY_WEIGHTS.right90).toBeGreaterThan(
      PIECE_COMPLEXITY_WEIGHTS.scurveLeft,
    )
  })

  it('weights left and right 90s the same', () => {
    expect(PIECE_COMPLEXITY_WEIGHTS.left90).toBe(
      PIECE_COMPLEXITY_WEIGHTS.right90,
    )
  })

  it('weights both s-curve flavors the same', () => {
    expect(PIECE_COMPLEXITY_WEIGHTS.scurve).toBe(
      PIECE_COMPLEXITY_WEIGHTS.scurveLeft,
    )
  })

  it('weights sweep turns below sharp 90s and equally by hand', () => {
    expect(PIECE_COMPLEXITY_WEIGHTS.sweepRight).toBe(
      PIECE_COMPLEXITY_WEIGHTS.sweepLeft,
    )
    expect(PIECE_COMPLEXITY_WEIGHTS.sweepRight).toBeLessThan(
      PIECE_COMPLEXITY_WEIGHTS.right90,
    )
  })

  it('weights mega sweep turns below sharp 90s and equally by hand', () => {
    expect(PIECE_COMPLEXITY_WEIGHTS.megaSweepRight).toBe(
      PIECE_COMPLEXITY_WEIGHTS.megaSweepLeft,
    )
    expect(PIECE_COMPLEXITY_WEIGHTS.megaSweepRight).toBeLessThan(
      PIECE_COMPLEXITY_WEIGHTS.right90,
    )
  })

  it('weights hairpins close to sharp 90s', () => {
    expect(PIECE_COMPLEXITY_WEIGHTS.hairpin).toBeGreaterThan(
      PIECE_COMPLEXITY_WEIGHTS.sweepRight,
    )
    expect(PIECE_COMPLEXITY_WEIGHTS.hairpin).toBeLessThanOrEqual(
      PIECE_COMPLEXITY_WEIGHTS.right90,
    )
  })

  it('weights flex straights low because they are still straights', () => {
    expect(PIECE_COMPLEXITY_WEIGHTS.flexStraight).toBeLessThan(
      PIECE_COMPLEXITY_WEIGHTS.kinkRight,
    )
    expect(PIECE_COMPLEXITY_WEIGHTS.flexStraight).toBeGreaterThan(
      PIECE_COMPLEXITY_WEIGHTS.straight,
    )
  })
})

describe('TURN_PIECE_TYPES', () => {
  it('contains every non-straight piece type', () => {
    expect(TURN_PIECE_TYPES.has('left90')).toBe(true)
    expect(TURN_PIECE_TYPES.has('right90')).toBe(true)
    expect(TURN_PIECE_TYPES.has('scurve')).toBe(true)
    expect(TURN_PIECE_TYPES.has('scurveLeft')).toBe(true)
    expect(TURN_PIECE_TYPES.has('sweepRight')).toBe(true)
    expect(TURN_PIECE_TYPES.has('sweepLeft')).toBe(true)
    expect(TURN_PIECE_TYPES.has('megaSweepRight')).toBe(true)
    expect(TURN_PIECE_TYPES.has('megaSweepLeft')).toBe(true)
    expect(TURN_PIECE_TYPES.has('hairpin')).toBe(true)
    expect(TURN_PIECE_TYPES.has('arc45')).toBe(true)
    expect(TURN_PIECE_TYPES.has('arc45Left')).toBe(true)
    expect(TURN_PIECE_TYPES.has('diagonal')).toBe(true)
  })

  it('does not contain straights', () => {
    expect(TURN_PIECE_TYPES.has('straight')).toBe(false)
  })

  it('does not treat flex straights as turns', () => {
    expect(TURN_PIECE_TYPES.has('flexStraight')).toBe(false)
  })
})

describe('TRACK_DIFFICULTY_THRESHOLDS', () => {
  it('orders thresholds strictly ascending', () => {
    expect(TRACK_DIFFICULTY_THRESHOLDS.easy).toBeLessThan(
      TRACK_DIFFICULTY_THRESHOLDS.moderate,
    )
    expect(TRACK_DIFFICULTY_THRESHOLDS.moderate).toBeLessThan(
      TRACK_DIFFICULTY_THRESHOLDS.hard,
    )
    expect(TRACK_DIFFICULTY_THRESHOLDS.hard).toBeLessThan(
      TRACK_DIFFICULTY_MAX_SCORE,
    )
  })
})

describe('classifyDifficulty', () => {
  it('returns easy for scores at or below the easy threshold', () => {
    expect(classifyDifficulty(0)).toBe('easy')
    expect(classifyDifficulty(TRACK_DIFFICULTY_THRESHOLDS.easy)).toBe('easy')
  })

  it('returns moderate just past the easy threshold and at the moderate threshold', () => {
    expect(classifyDifficulty(TRACK_DIFFICULTY_THRESHOLDS.easy + 0.5)).toBe(
      'moderate',
    )
    expect(classifyDifficulty(TRACK_DIFFICULTY_THRESHOLDS.moderate)).toBe(
      'moderate',
    )
  })

  it('returns hard between moderate and hard thresholds', () => {
    expect(
      classifyDifficulty(TRACK_DIFFICULTY_THRESHOLDS.moderate + 0.5),
    ).toBe('hard')
    expect(classifyDifficulty(TRACK_DIFFICULTY_THRESHOLDS.hard)).toBe('hard')
  })

  it('returns expert past the hard threshold', () => {
    expect(classifyDifficulty(TRACK_DIFFICULTY_THRESHOLDS.hard + 0.5)).toBe(
      'expert',
    )
    expect(classifyDifficulty(TRACK_DIFFICULTY_MAX_SCORE)).toBe('expert')
  })

  it('collapses non-finite or negative scores to easy', () => {
    expect(classifyDifficulty(NaN)).toBe('easy')
    expect(classifyDifficulty(Infinity)).toBe('easy')
    expect(classifyDifficulty(-Infinity)).toBe('easy')
    expect(classifyDifficulty(-1)).toBe('easy')
  })
})

describe('isTrackDifficultyTier', () => {
  it('accepts every documented tier', () => {
    for (const tier of TRACK_DIFFICULTY_TIERS) {
      expect(isTrackDifficultyTier(tier)).toBe(true)
    }
  })

  it('rejects non-tier strings and non-string inputs', () => {
    expect(isTrackDifficultyTier('insane')).toBe(false)
    expect(isTrackDifficultyTier('')).toBe(false)
    expect(isTrackDifficultyTier('EASY')).toBe(false)
    expect(isTrackDifficultyTier(null)).toBe(false)
    expect(isTrackDifficultyTier(undefined)).toBe(false)
    expect(isTrackDifficultyTier(0)).toBe(false)
    expect(isTrackDifficultyTier({})).toBe(false)
  })
})

describe('analyzeTrack', () => {
  it('returns the unknown sentinel for null / undefined / empty / non-array', () => {
    for (const bad of [null, undefined, [], 'not an array']) {
      const info = analyzeTrack(bad as unknown as Piece[] | null | undefined)
      expect(info.tier).toBe(UNKNOWN_DIFFICULTY.tier)
      expect(info.score).toBe(UNKNOWN_DIFFICULTY.score)
      expect(info.breakdown.pieceCount).toBe(0)
    }
  })

  it('returns an isolated breakdown clone (caller mutation does not leak)', () => {
    const a = analyzeTrack(null)
    const b = analyzeTrack(null)
    a.breakdown.pieceCount = 999
    expect(b.breakdown.pieceCount).toBe(0)
    expect(UNKNOWN_DIFFICULTY.breakdown.pieceCount).toBe(0)
  })

  it('counts pieces and computes the complexity sum', () => {
    const pieces = [piece('straight'), piece('left90'), piece('right90')]
    const info = analyzeTrack(pieces)
    expect(info.breakdown.pieceCount).toBe(3)
    expect(info.breakdown.turnCount).toBe(2)
    expect(info.breakdown.complexityRaw).toBeCloseTo(
      PIECE_COMPLEXITY_WEIGHTS.left90 + PIECE_COMPLEXITY_WEIGHTS.right90,
      5,
    )
  })

  it('counts a left-then-right turn as a direction flip', () => {
    const info = analyzeTrack([piece('left90'), piece('right90')])
    expect(info.breakdown.directionFlips).toBe(1)
  })

  it('does not count consecutive same-hand turns as flips', () => {
    const info = analyzeTrack([piece('left90'), piece('left90'), piece('left90')])
    expect(info.breakdown.directionFlips).toBe(0)
  })

  it('counts every s-curve as one flip plus does not bridge to a same-hand neighbor', () => {
    const info = analyzeTrack([
      piece('left90'),
      piece('scurve'),
      piece('left90'),
    ])
    // S-curve always contributes a flip on its own.
    expect(info.breakdown.directionFlips).toBe(1)
    expect(info.breakdown.turnCount).toBe(3)
  })

  it('respects insertion order when classifying flips', () => {
    const a = analyzeTrack([piece('left90'), piece('right90'), piece('left90')])
    const b = analyzeTrack([piece('left90'), piece('left90'), piece('right90')])
    expect(a.breakdown.directionFlips).toBe(2)
    expect(b.breakdown.directionFlips).toBe(1)
  })

  it('skips malformed (null / non-object) entries without throwing', () => {
    const pieces: unknown[] = [
      piece('left90'),
      null,
      undefined,
      { not: 'a piece' },
      piece('right90'),
    ]
    const info = analyzeTrack(pieces as Piece[])
    expect(info.breakdown.pieceCount).toBe(5)
    // The two malformed entries fall through; our helper still counts the
    // recognized turns.
    expect(info.breakdown.turnCount).toBe(2)
  })

  it('caps the complexity contribution to COMPLEXITY_SCORE_CAP', () => {
    // 64 90-degree corners would produce 64 * 1.5 * 4 = 384 raw complexity
    // points. Verify the score still respects the cap.
    const pieces: Piece[] = []
    for (let i = 0; i < 64; i += 1) pieces.push(piece('left90'))
    const info = analyzeTrack(pieces)
    expect(info.breakdown.complexityScore).toBeLessThanOrEqual(
      COMPLEXITY_SCORE_CAP,
    )
  })

  it('clamps the final score to TRACK_DIFFICULTY_MAX_SCORE', () => {
    const pieces: Piece[] = []
    for (let i = 0; i < 64; i += 1) {
      pieces.push(i % 2 === 0 ? piece('left90') : piece('right90'))
    }
    const info = analyzeTrack(pieces)
    expect(info.score).toBeLessThanOrEqual(TRACK_DIFFICULTY_MAX_SCORE)
    expect(info.score).toBeGreaterThan(0)
  })

  it('a long straight-only track stays in the easy tier despite the length bonus', () => {
    const pieces: Piece[] = []
    for (let i = 0; i < 32; i += 1) pieces.push(piece('straight'))
    const info = analyzeTrack(pieces)
    expect(info.tier).toBe('easy')
  })

  it('a flip-heavy figure-8 lands in expert', () => {
    const pieces: Piece[] = [
      piece('right90'),
      piece('left90'),
      piece('right90'),
      piece('left90'),
      piece('scurve'),
      piece('right90'),
      piece('left90'),
      piece('scurveLeft'),
      piece('right90'),
      piece('left90'),
      piece('right90'),
      piece('left90'),
    ]
    const info = analyzeTrack(pieces)
    expect(info.tier).toBe('expert')
  })

  it('a mixed 12-piece loop with one flip lands in moderate', () => {
    const pieces: Piece[] = [
      piece('straight'),
      piece('straight'),
      piece('right90'),
      piece('straight'),
      piece('right90'),
      piece('straight'),
      piece('straight'),
      piece('left90'),
      piece('straight'),
      piece('left90'),
      piece('straight'),
      piece('straight'),
    ]
    const info = analyzeTrack(pieces)
    expect(['moderate', 'hard']).toContain(info.tier)
  })

  it('density score is monotone in turn density', () => {
    const sparse = analyzeTrack([
      piece('straight'),
      piece('straight'),
      piece('straight'),
      piece('left90'),
    ])
    const dense = analyzeTrack([
      piece('left90'),
      piece('right90'),
      piece('left90'),
      piece('right90'),
    ])
    expect(dense.breakdown.densityScore).toBeGreaterThan(
      sparse.breakdown.densityScore,
    )
    expect(dense.breakdown.densityScore).toBeLessThanOrEqual(
      TURN_DENSITY_WEIGHT,
    )
  })

  it('flip score never exceeds DIRECTION_FLIP_WEIGHT', () => {
    const pieces: Piece[] = []
    for (let i = 0; i < 16; i += 1) {
      pieces.push(i % 2 === 0 ? piece('left90') : piece('right90'))
    }
    const info = analyzeTrack(pieces)
    expect(info.breakdown.flipScore).toBeLessThanOrEqual(DIRECTION_FLIP_WEIGHT)
  })

  it('length bonus is zero at the baseline and clamps at the maximum', () => {
    const baseline: Piece[] = []
    for (let i = 0; i < TRACK_LENGTH_BONUS_BASELINE; i += 1) {
      baseline.push(piece('straight'))
    }
    expect(analyzeTrack(baseline).breakdown.lengthBonus).toBe(0)

    const huge: Piece[] = []
    for (let i = 0; i < 64; i += 1) huge.push(piece('straight'))
    expect(analyzeTrack(huge).breakdown.lengthBonus).toBeLessThanOrEqual(
      TRACK_LENGTH_BONUS_MAX,
    )
  })

  it('length bonus grows linearly past the baseline', () => {
    const a: Piece[] = []
    for (let i = 0; i < TRACK_LENGTH_BONUS_BASELINE + 4; i += 1) {
      a.push(piece('straight'))
    }
    const info = analyzeTrack(a)
    expect(info.breakdown.lengthBonus).toBeCloseTo(
      4 * TRACK_LENGTH_BONUS_PER_PIECE,
      5,
    )
  })

  it('returns a fresh breakdown object per call (no shared reference)', () => {
    const pieces = [piece('left90')]
    const a = analyzeTrack(pieces)
    const b = analyzeTrack(pieces)
    expect(a).not.toBe(b)
    expect(a.breakdown).not.toBe(b.breakdown)
  })

  it('rounds breakdown values to two decimals so the renderer does not show dust', () => {
    const pieces: Piece[] = [piece('left90'), piece('right90'), piece('scurve')]
    const info = analyzeTrack(pieces)
    expect(info.breakdown.complexityScore.toString()).toMatch(
      /^-?\d+(\.\d{1,2})?$/,
    )
    expect(info.breakdown.densityScore.toString()).toMatch(
      /^-?\d+(\.\d{1,2})?$/,
    )
    expect(info.breakdown.flipScore.toString()).toMatch(/^-?\d+(\.\d{1,2})?$/)
    expect(info.breakdown.lengthBonus.toString()).toMatch(
      /^-?\d+(\.\d{1,2})?$/,
    )
  })
})

describe('labelForTier', () => {
  it('returns the catalog label for every tier', () => {
    for (const tier of TRACK_DIFFICULTY_TIERS) {
      expect(labelForTier(tier)).toBe(TRACK_DIFFICULTY_LABELS[tier])
    }
  })

  it('falls back to Unknown on missing or malformed input', () => {
    expect(labelForTier(null)).toBe('Unknown')
    expect(labelForTier(undefined)).toBe('Unknown')
    expect(labelForTier('insane' as never)).toBe('Unknown')
  })
})

describe('colorForTier', () => {
  it('returns the catalog color for every tier', () => {
    for (const tier of TRACK_DIFFICULTY_TIERS) {
      expect(colorForTier(tier)).toBe(TRACK_DIFFICULTY_COLORS[tier])
    }
  })

  it('falls back to a neutral hex on missing or malformed input', () => {
    expect(/^#[0-9a-fA-F]{6}$/.test(colorForTier(null))).toBe(true)
    expect(/^#[0-9a-fA-F]{6}$/.test(colorForTier(undefined))).toBe(true)
    expect(/^#[0-9a-fA-F]{6}$/.test(colorForTier('insane' as never))).toBe(true)
  })
})
