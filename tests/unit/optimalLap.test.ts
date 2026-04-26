import { describe, it, expect } from 'vitest'
import {
  compareSectorToBest,
  computeSectorDurations,
  hasCompleteOptimalLap,
  mergeBestSectors,
  optimalLapTime,
  type SectorDuration,
} from '@/game/optimalLap'
import type { CheckpointHit } from '@/lib/schemas'

describe('computeSectorDurations', () => {
  it('returns an empty array for no hits', () => {
    expect(computeSectorDurations([])).toEqual([])
  })

  it('treats the first hit as a sector from t=0', () => {
    const hits: CheckpointHit[] = [{ cpId: 0, tMs: 1500 }]
    expect(computeSectorDurations(hits)).toEqual([{ cpId: 0, durationMs: 1500 }])
  })

  it('emits consecutive differences between hits', () => {
    const hits: CheckpointHit[] = [
      { cpId: 0, tMs: 1500 },
      { cpId: 1, tMs: 4200 },
      { cpId: 2, tMs: 9000 },
    ]
    expect(computeSectorDurations(hits)).toEqual([
      { cpId: 0, durationMs: 1500 },
      { cpId: 1, durationMs: 2700 },
      { cpId: 2, durationMs: 4800 },
    ])
  })

  it('skips a hit with a non-positive computed duration', () => {
    const hits: CheckpointHit[] = [
      { cpId: 0, tMs: 1500 },
      // Glitched out-of-order hit: tMs goes backward.
      { cpId: 1, tMs: 1000 },
      { cpId: 2, tMs: 4000 },
    ]
    const out = computeSectorDurations(hits)
    expect(out).toEqual([
      { cpId: 0, durationMs: 1500 },
      // cp1 dropped (negative duration), cp2 measured against cp1's tMs.
      { cpId: 2, durationMs: 3000 },
    ])
  })

  it('skips hits whose computed duration is non-finite', () => {
    const hits: CheckpointHit[] = [
      { cpId: 0, tMs: 1500 },
      { cpId: 1, tMs: Number.POSITIVE_INFINITY },
    ]
    const out = computeSectorDurations(hits)
    expect(out).toEqual([{ cpId: 0, durationMs: 1500 }])
  })

  it('preserves cpId order even when adjacent ids are not contiguous', () => {
    const hits: CheckpointHit[] = [
      { cpId: 0, tMs: 1000 },
      { cpId: 5, tMs: 2500 },
    ]
    const out = computeSectorDurations(hits)
    expect(out.map((s) => s.cpId)).toEqual([0, 5])
  })
})

describe('mergeBestSectors', () => {
  it('returns the next sectors when prev is null', () => {
    const next: SectorDuration[] = [{ cpId: 0, durationMs: 1500 }]
    expect(mergeBestSectors(null, next)).toEqual(next)
  })

  it('returns the next sectors when prev is empty', () => {
    const next: SectorDuration[] = [{ cpId: 0, durationMs: 1500 }]
    expect(mergeBestSectors([], next)).toEqual(next)
  })

  it('keeps prev sectors when next is empty', () => {
    const prev: SectorDuration[] = [{ cpId: 0, durationMs: 1500 }]
    expect(mergeBestSectors(prev, [])).toEqual(prev)
  })

  it('takes the minimum duration per cpId', () => {
    const prev: SectorDuration[] = [
      { cpId: 0, durationMs: 1500 },
      { cpId: 1, durationMs: 3000 },
    ]
    const next: SectorDuration[] = [
      { cpId: 0, durationMs: 1200 },
      { cpId: 1, durationMs: 3500 },
    ]
    expect(mergeBestSectors(prev, next)).toEqual([
      { cpId: 0, durationMs: 1200 },
      { cpId: 1, durationMs: 3000 },
    ])
  })

  it('appends new cpIds from next that are missing from prev', () => {
    const prev: SectorDuration[] = [{ cpId: 0, durationMs: 1500 }]
    const next: SectorDuration[] = [
      { cpId: 1, durationMs: 2000 },
      { cpId: 2, durationMs: 2500 },
    ]
    expect(mergeBestSectors(prev, next)).toEqual([
      { cpId: 0, durationMs: 1500 },
      { cpId: 1, durationMs: 2000 },
      { cpId: 2, durationMs: 2500 },
    ])
  })

  it('preserves prev order then appends new cpIds in next order', () => {
    const prev: SectorDuration[] = [
      { cpId: 5, durationMs: 1500 },
      { cpId: 2, durationMs: 1800 },
    ]
    const next: SectorDuration[] = [
      { cpId: 7, durationMs: 1100 },
      { cpId: 5, durationMs: 1700 },
    ]
    const out = mergeBestSectors(prev, next)
    expect(out.map((s) => s.cpId)).toEqual([5, 2, 7])
  })

  it('does not mutate either input', () => {
    const prev: SectorDuration[] = [{ cpId: 0, durationMs: 1500 }]
    const next: SectorDuration[] = [{ cpId: 0, durationMs: 1200 }]
    const prevSnapshot = JSON.parse(JSON.stringify(prev))
    const nextSnapshot = JSON.parse(JSON.stringify(next))
    mergeBestSectors(prev, next)
    expect(prev).toEqual(prevSnapshot)
    expect(next).toEqual(nextSnapshot)
  })

  it('drops invalid durations from next instead of poisoning prev', () => {
    const prev: SectorDuration[] = [{ cpId: 0, durationMs: 1500 }]
    const next: SectorDuration[] = [
      { cpId: 0, durationMs: 0 },
      { cpId: 1, durationMs: -100 },
      { cpId: 2, durationMs: Number.NaN },
    ]
    expect(mergeBestSectors(prev, next)).toEqual([
      { cpId: 0, durationMs: 1500 },
    ])
  })

  it('drops invalid durations from prev but lets next backfill the same cpId', () => {
    const prev: SectorDuration[] = [
      { cpId: 0, durationMs: -50 },
      { cpId: 1, durationMs: 2000 },
    ]
    const next: SectorDuration[] = [{ cpId: 0, durationMs: 1500 }]
    // prev's cp0 slot was empty after the duration filter, so next's cp0
    // slots into prev's slot position rather than landing at the end.
    expect(mergeBestSectors(prev, next)).toEqual([
      { cpId: 0, durationMs: 1500 },
      { cpId: 1, durationMs: 2000 },
    ])
  })

  it('drops a prev cpId entirely when neither prev nor next has a valid duration for it', () => {
    const prev: SectorDuration[] = [
      { cpId: 0, durationMs: -50 },
      { cpId: 1, durationMs: 2000 },
    ]
    const next: SectorDuration[] = [{ cpId: 2, durationMs: 1500 }]
    expect(mergeBestSectors(prev, next)).toEqual([
      { cpId: 1, durationMs: 2000 },
      { cpId: 2, durationMs: 1500 },
    ])
  })

  it('handles a stitched optimal lap across multiple imperfect laps', () => {
    // Lap 1: fast cp0, slow cp1, slow cp2.
    const lap1: SectorDuration[] = [
      { cpId: 0, durationMs: 1000 },
      { cpId: 1, durationMs: 5000 },
      { cpId: 2, durationMs: 4000 },
    ]
    // Lap 2: slow cp0, fast cp1, slow cp2.
    const lap2: SectorDuration[] = [
      { cpId: 0, durationMs: 1500 },
      { cpId: 1, durationMs: 2000 },
      { cpId: 2, durationMs: 3500 },
    ]
    // Lap 3: medium cp0, medium cp1, fast cp2.
    const lap3: SectorDuration[] = [
      { cpId: 0, durationMs: 1200 },
      { cpId: 1, durationMs: 2500 },
      { cpId: 2, durationMs: 1800 },
    ]
    const after1 = mergeBestSectors(null, lap1)
    const after2 = mergeBestSectors(after1, lap2)
    const after3 = mergeBestSectors(after2, lap3)
    expect(after3).toEqual([
      { cpId: 0, durationMs: 1000 },
      { cpId: 1, durationMs: 2000 },
      { cpId: 2, durationMs: 1800 },
    ])
    // Optimal lap is the sum of best sectors, which beats every individual lap.
    expect(optimalLapTime(after3)).toBe(4800)
  })
})

describe('optimalLapTime', () => {
  it('returns null for null input', () => {
    expect(optimalLapTime(null)).toBeNull()
  })

  it('returns null for an empty array', () => {
    expect(optimalLapTime([])).toBeNull()
  })

  it('sums sector durations', () => {
    const sectors: SectorDuration[] = [
      { cpId: 0, durationMs: 1500 },
      { cpId: 1, durationMs: 2700 },
      { cpId: 2, durationMs: 4800 },
    ]
    expect(optimalLapTime(sectors)).toBe(9000)
  })

  it('rounds the sum to a whole millisecond', () => {
    const sectors: SectorDuration[] = [
      { cpId: 0, durationMs: 1500.4 },
      { cpId: 1, durationMs: 2700.4 },
    ]
    expect(optimalLapTime(sectors)).toBe(4201)
  })

  it('returns null when any sector duration is invalid', () => {
    const sectors: SectorDuration[] = [
      { cpId: 0, durationMs: 1500 },
      { cpId: 1, durationMs: Number.NaN },
    ]
    expect(optimalLapTime(sectors)).toBeNull()
  })

  it('returns null when any sector duration is non-positive', () => {
    const sectors: SectorDuration[] = [
      { cpId: 0, durationMs: 1500 },
      { cpId: 1, durationMs: 0 },
    ]
    expect(optimalLapTime(sectors)).toBeNull()
  })
})

describe('hasCompleteOptimalLap', () => {
  it('returns false for null input', () => {
    expect(hasCompleteOptimalLap(null, 8)).toBe(false)
  })

  it('returns false when fewer sectors than expected', () => {
    const sectors: SectorDuration[] = [
      { cpId: 0, durationMs: 1500 },
      { cpId: 1, durationMs: 2000 },
    ]
    expect(hasCompleteOptimalLap(sectors, 3)).toBe(false)
  })

  it('returns true when sector count matches expected', () => {
    const sectors: SectorDuration[] = [
      { cpId: 0, durationMs: 1500 },
      { cpId: 1, durationMs: 2000 },
      { cpId: 2, durationMs: 2500 },
    ]
    expect(hasCompleteOptimalLap(sectors, 3)).toBe(true)
  })

  it('returns true when sector count exceeds expected', () => {
    const sectors: SectorDuration[] = [
      { cpId: 0, durationMs: 1500 },
      { cpId: 1, durationMs: 2000 },
      { cpId: 2, durationMs: 2500 },
      { cpId: 3, durationMs: 1800 },
    ]
    expect(hasCompleteOptimalLap(sectors, 3)).toBe(true)
  })

  it('returns false when a duration is invalid', () => {
    const sectors: SectorDuration[] = [
      { cpId: 0, durationMs: 1500 },
      { cpId: 1, durationMs: 0 },
      { cpId: 2, durationMs: 2500 },
    ]
    expect(hasCompleteOptimalLap(sectors, 3)).toBe(false)
  })

  it('returns false when expectedSectorCount is zero or negative', () => {
    const sectors: SectorDuration[] = [{ cpId: 0, durationMs: 1500 }]
    expect(hasCompleteOptimalLap(sectors, 0)).toBe(false)
    expect(hasCompleteOptimalLap(sectors, -1)).toBe(false)
  })

  it('counts distinct cpIds, not raw array length', () => {
    // Two entries with the same cpId should not satisfy a 2-sector requirement.
    const sectors: SectorDuration[] = [
      { cpId: 0, durationMs: 1500 },
      { cpId: 0, durationMs: 1700 },
    ]
    expect(hasCompleteOptimalLap(sectors, 2)).toBe(false)
  })

  it('handles a single-sector mini-track', () => {
    const sectors: SectorDuration[] = [{ cpId: 0, durationMs: 1500 }]
    expect(hasCompleteOptimalLap(sectors, 1)).toBe(true)
  })
})

describe('compareSectorToBest', () => {
  it('marks the first-ever sector for a cpId as a PB', () => {
    const out = compareSectorToBest({ cpId: 2, tMs: 4200 }, 2700, [])
    expect(out).not.toBeNull()
    expect(out!.cpId).toBe(2)
    expect(out!.durationMs).toBe(1500)
    expect(out!.priorBestMs).toBeNull()
    expect(out!.isPb).toBe(true)
  })

  it('marks first-ever as PB even when bestSectors is null', () => {
    const out = compareSectorToBest({ cpId: 0, tMs: 1500 }, 0, null)
    expect(out!.isPb).toBe(true)
    expect(out!.priorBestMs).toBeNull()
  })

  it('flags a faster duration as a PB and reports the prior best', () => {
    const best: SectorDuration[] = [
      { cpId: 0, durationMs: 1800 },
      { cpId: 1, durationMs: 1400 },
    ]
    const out = compareSectorToBest({ cpId: 1, tMs: 3000 }, 1800, best)
    expect(out!.cpId).toBe(1)
    expect(out!.durationMs).toBe(1200)
    expect(out!.priorBestMs).toBe(1400)
    expect(out!.isPb).toBe(true)
  })

  it('does not flag a slower duration as a PB', () => {
    const best: SectorDuration[] = [{ cpId: 1, durationMs: 1100 }]
    const out = compareSectorToBest({ cpId: 1, tMs: 3000 }, 1500, best)
    expect(out!.durationMs).toBe(1500)
    expect(out!.priorBestMs).toBe(1100)
    expect(out!.isPb).toBe(false)
  })

  it('does not flag a tied duration as a PB', () => {
    const best: SectorDuration[] = [{ cpId: 0, durationMs: 1500 }]
    const out = compareSectorToBest({ cpId: 0, tMs: 1500 }, 0, best)
    expect(out!.durationMs).toBe(1500)
    expect(out!.priorBestMs).toBe(1500)
    expect(out!.isPb).toBe(false)
  })

  it('rejects a non-positive computed duration', () => {
    expect(compareSectorToBest({ cpId: 0, tMs: 0 }, 0, null)).toBeNull()
    expect(compareSectorToBest({ cpId: 0, tMs: 1500 }, 1500, null)).toBeNull()
    expect(compareSectorToBest({ cpId: 0, tMs: 1000 }, 1500, null)).toBeNull()
  })

  it('rejects non-finite tMs or prevHitTMs', () => {
    expect(compareSectorToBest({ cpId: 0, tMs: NaN }, 0, null)).toBeNull()
    expect(compareSectorToBest({ cpId: 0, tMs: Infinity }, 0, null)).toBeNull()
    expect(compareSectorToBest({ cpId: 0, tMs: 1500 }, NaN, null)).toBeNull()
    expect(
      compareSectorToBest({ cpId: 0, tMs: 1500 }, Infinity, null),
    ).toBeNull()
  })

  it('ignores a stored best with a non-positive duration', () => {
    // A glitched / hand-edited row for cpId 0 should fall back to "no prior".
    const best: SectorDuration[] = [{ cpId: 0, durationMs: -10 }]
    const out = compareSectorToBest({ cpId: 0, tMs: 1500 }, 0, best)
    expect(out!.priorBestMs).toBeNull()
    expect(out!.isPb).toBe(true)
  })

  it('matches the cpId, not array order', () => {
    // Best for cpId 2 only; comparing cpId 0 should still report "no prior".
    const best: SectorDuration[] = [{ cpId: 2, durationMs: 1100 }]
    const out = compareSectorToBest({ cpId: 0, tMs: 1500 }, 0, best)
    expect(out!.priorBestMs).toBeNull()
    expect(out!.isPb).toBe(true)
  })

  it('rounds the duration to whole ms', () => {
    const out = compareSectorToBest({ cpId: 0, tMs: 1499.6 }, 0, null)
    expect(out!.durationMs).toBe(1500)
  })
})
