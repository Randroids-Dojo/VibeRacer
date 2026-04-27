import { describe, it, expect } from 'vitest'
import {
  GHOST_GAP_DEFAULT_WINDOW_SAMPLES,
  GHOST_GAP_MAX_NEAR_DIST_SQ,
  findClosestSampleIdx,
  formatGhostGap,
  ghostGapMs,
} from '@/game/ghostGap'
import type { Replay } from '@/lib/replay'
import { REPLAY_SAMPLE_MS } from '@/lib/replay'

// Synthesize a straight-line replay heading east along +X. Each sample is
// REPLAY_SAMPLE_MS apart, sample[i] sits at (i, 0, 0) so the closest-sample
// math has a clean correspondence between index and world position. The
// `lapTimeMs` ceiling reflects samples.length * sample period.
function makeStraightLineReplay(sampleCount: number = 10): Replay {
  const samples: Replay['samples'] = []
  for (let i = 0; i < sampleCount; i++) samples.push([i, 0, 0])
  return {
    lapTimeMs: sampleCount * REPLAY_SAMPLE_MS,
    samples,
  }
}

describe('GHOST_GAP constants', () => {
  it('default window covers a sane span of samples', () => {
    expect(GHOST_GAP_DEFAULT_WINDOW_SAMPLES).toBeGreaterThanOrEqual(4)
    expect(Number.isInteger(GHOST_GAP_DEFAULT_WINDOW_SAMPLES)).toBe(true)
  })

  it('near-distance threshold is positive and finite', () => {
    expect(GHOST_GAP_MAX_NEAR_DIST_SQ).toBeGreaterThan(0)
    expect(Number.isFinite(GHOST_GAP_MAX_NEAR_DIST_SQ)).toBe(true)
  })
})

describe('findClosestSampleIdx', () => {
  it('returns -1 when the replay is empty', () => {
    const replay: Replay = { lapTimeMs: 1, samples: [] as never as Replay['samples'] }
    expect(findClosestSampleIdx(replay, 0, 0)).toBe(-1)
  })

  it('returns -1 when the player position is non-finite', () => {
    const replay = makeStraightLineReplay(5)
    expect(findClosestSampleIdx(replay, NaN, 0)).toBe(-1)
    expect(findClosestSampleIdx(replay, 0, Infinity)).toBe(-1)
  })

  it('finds the nearest sample inside a windowed search', () => {
    const replay = makeStraightLineReplay(20)
    // Player at x=4.4 -> sample 4 is closest.
    expect(findClosestSampleIdx(replay, 4.4, 0, 4, 5)).toBe(4)
    // Player at x=10.6 -> sample 11 is closest (centered hint at 10).
    expect(findClosestSampleIdx(replay, 10.6, 0, 10, 5)).toBe(11)
  })

  it('clamps a hint index outside the array to the nearest legal slot', () => {
    const replay = makeStraightLineReplay(8)
    // Hint past the end: still searches from clamped index near n - 1.
    expect(findClosestSampleIdx(replay, 7, 0, 999, 2)).toBe(7)
    // Negative hint clamps to 0.
    expect(findClosestSampleIdx(replay, 0, 0, -50, 2)).toBe(0)
  })

  it('window of zero limits the search to the hint sample only', () => {
    const replay = makeStraightLineReplay(8)
    // Player at x=2 with hint=5 and zero window: best (only) candidate is 5.
    expect(findClosestSampleIdx(replay, 2, 0, 5, 0)).toBe(5)
  })

  it('larger window sweeps the full pool when the hint is wrong', () => {
    const replay = makeStraightLineReplay(20)
    // Player at x=18 with hint=2 and a window of 25: best is sample 18.
    expect(findClosestSampleIdx(replay, 18, 0, 2, 25)).toBe(18)
  })

  it('breaks ties by keeping the earlier index (first match wins)', () => {
    const replay: Replay = {
      lapTimeMs: 100,
      samples: [
        [0, 0, 0],
        [10, 0, 0],
        [0, 0, 0], // same position as sample 0
      ],
    }
    expect(findClosestSampleIdx(replay, 0, 0, 1, 5)).toBe(0)
  })

  it('non-finite or negative window collapses cleanly to a single-sample search', () => {
    const replay = makeStraightLineReplay(8)
    expect(findClosestSampleIdx(replay, 0, 0, 4, NaN)).toBe(4)
    expect(findClosestSampleIdx(replay, 0, 0, 4, -7)).toBe(4)
  })
})

describe('ghostGapMs', () => {
  it('returns null when the replay is null', () => {
    expect(ghostGapMs(null, 0, 0, 0)).toBeNull()
  })

  it('returns null when player position is non-finite', () => {
    const replay = makeStraightLineReplay(5)
    expect(ghostGapMs(replay, NaN, 0, 100)).toBeNull()
    expect(ghostGapMs(replay, 0, Infinity, 100)).toBeNull()
  })

  it('returns null when playerLapMs is non-finite or negative', () => {
    const replay = makeStraightLineReplay(5)
    expect(ghostGapMs(replay, 0, 0, NaN)).toBeNull()
    expect(ghostGapMs(replay, 0, 0, -5)).toBeNull()
  })

  it('returns null when the replay has no samples', () => {
    const replay: Replay = { lapTimeMs: 1, samples: [] as never as Replay['samples'] }
    expect(ghostGapMs(replay, 0, 0, 100)).toBeNull()
  })

  it('returns 0 gap when the player exactly matches the ghost timing', () => {
    const replay = makeStraightLineReplay(20)
    // Player at sample 5 position (x=5, z=0); player has been running
    // 5 * REPLAY_SAMPLE_MS so they exactly match the ghost.
    const out = ghostGapMs(replay, 5, 0, 5 * REPLAY_SAMPLE_MS, 5)
    expect(out).not.toBeNull()
    expect(out!.gapMs).toBe(0)
    expect(out!.sampleIdx).toBe(5)
  })

  it('returns negative gap when the player is ahead of the ghost', () => {
    const replay = makeStraightLineReplay(20)
    // Player has reached sample 5's position, but only 3 samples worth of
    // wall-clock has elapsed. Player is 2 sample periods AHEAD => negative.
    const out = ghostGapMs(replay, 5, 0, 3 * REPLAY_SAMPLE_MS, 5)
    expect(out).not.toBeNull()
    expect(out!.gapMs).toBe(-2 * REPLAY_SAMPLE_MS)
  })

  it('returns positive gap when the player is behind the ghost', () => {
    const replay = makeStraightLineReplay(20)
    // Player at sample 5 position but 8 samples of wall-clock has elapsed.
    // Player is 3 sample periods BEHIND => positive.
    const out = ghostGapMs(replay, 5, 0, 8 * REPLAY_SAMPLE_MS, 5)
    expect(out).not.toBeNull()
    expect(out!.gapMs).toBe(3 * REPLAY_SAMPLE_MS)
  })

  it('rounds the gap to whole milliseconds', () => {
    const replay = makeStraightLineReplay(20)
    // Player tMs is fractional (123.7 ms), should round to 124.
    const out = ghostGapMs(replay, 0, 0, 123.7, 0)
    expect(out!.gapMs).toBe(124)
  })

  it('returns null when player drifted too far from the ghost trail', () => {
    const replay = makeStraightLineReplay(10)
    // Player far off-axis (z=100), too far from any sample.
    expect(ghostGapMs(replay, 0, 100, 0, 0)).toBeNull()
  })

  it('honors a custom maxNearDistSq', () => {
    const replay = makeStraightLineReplay(10)
    // Player 3 units off-axis: dist^2 = 9. Under default 64, but with custom
    // maxNearDistSq of 1, this is too far.
    expect(ghostGapMs(replay, 0, 3, 0, 0)).not.toBeNull()
    expect(
      ghostGapMs(replay, 0, 3, 0, 0, { maxNearDistSq: 1 }),
    ).toBeNull()
  })

  it('returns the sample index suitable for hinting the next frame', () => {
    const replay = makeStraightLineReplay(20)
    const out = ghostGapMs(replay, 7, 0, 0, 6)
    expect(out!.sampleIdx).toBe(7)
  })

  it('finds a nearby sample even when the hint is stale by a small amount', () => {
    const replay = makeStraightLineReplay(20)
    // Player jumped to x=10 but hint is still at 8 (within default window).
    const out = ghostGapMs(replay, 10, 0, 0, 8)
    expect(out!.sampleIdx).toBe(10)
  })
})

describe('formatGhostGap', () => {
  it('returns null when gap is null', () => {
    expect(formatGhostGap(null)).toBeNull()
  })

  it('returns null when gap is non-finite', () => {
    expect(formatGhostGap(NaN)).toBeNull()
    expect(formatGhostGap(Infinity)).toBeNull()
    expect(formatGhostGap(-Infinity)).toBeNull()
  })

  it('formats positive deltas with a + sign and 3-decimal seconds', () => {
    expect(formatGhostGap(421)).toBe('+0.421')
    expect(formatGhostGap(1034)).toBe('+1.034')
    expect(formatGhostGap(60500)).toBe('+60.500')
  })

  it('formats negative deltas with a - sign and 3-decimal seconds', () => {
    expect(formatGhostGap(-421)).toBe('-0.421')
    expect(formatGhostGap(-1034)).toBe('-1.034')
  })

  it('formats zero as +0.000 (not "-0.000" or "0.000")', () => {
    expect(formatGhostGap(0)).toBe('+0.000')
  })

  it('pads the millis component to three digits', () => {
    expect(formatGhostGap(5)).toBe('+0.005')
    expect(formatGhostGap(50)).toBe('+0.050')
    expect(formatGhostGap(500)).toBe('+0.500')
  })

  it('handles the 999.5 ms rounding rollover into the next second', () => {
    expect(formatGhostGap(999.5)).toBe('+1.000')
    expect(formatGhostGap(-999.5)).toBe('-1.000')
  })

  it('contains no em-dash or en-dash characters', () => {
    const samples = [-9876, -1, 0, 1, 9876, 60500].map(formatGhostGap)
    for (const s of samples) {
      expect(s).not.toMatch(/\u2014/)
      expect(s).not.toMatch(/\u2013/)
    }
  })
})
