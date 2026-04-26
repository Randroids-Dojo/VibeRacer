import { describe, it, expect } from 'vitest'
import {
  computeSectorBreakdown,
  formatSectorDelta,
  formatSectorDuration,
  formatSessionDuration,
  summarizeSession,
} from '@/game/sessionSummary'
import type { LapHistoryEntry } from '@/game/lapHistory'
import type { SectorDuration } from '@/game/optimalLap'

function lap(
  lapNumber: number,
  lapTimeMs: number,
  sectors: SectorDuration[] = [],
): LapHistoryEntry {
  return {
    lapNumber,
    lapTimeMs,
    deltaVsPbMs: null,
    isPb: false,
    sectors,
  }
}

describe('summarizeSession', () => {
  it('returns null lap stats with zero count on an empty history', () => {
    const stats = summarizeSession({
      history: [],
      priorAllTimeMs: null,
      driftBest: null,
      sessionDurationMs: 12_345,
    })
    expect(stats.lapCount).toBe(0)
    expect(stats.bestLapMs).toBeNull()
    expect(stats.averageLapMs).toBeNull()
    expect(stats.totalLapMs).toBeNull()
    expect(stats.deltaVsAllTimeMs).toBeNull()
    expect(stats.beatsAllTime).toBe(false)
    expect(stats.driftBest).toBeNull()
    expect(stats.sessionDurationMs).toBe(12_345)
    expect(stats.priorAllTimeMs).toBeNull()
    expect(stats.sectorBreakdown).toEqual([])
    expect(stats.totalTimeLostMs).toBeNull()
  })

  it('aggregates lap stats over the history', () => {
    const stats = summarizeSession({
      history: [lap(1, 18_000), lap(2, 17_500), lap(3, 17_900)],
      priorAllTimeMs: null,
      driftBest: null,
      sessionDurationMs: 60_000,
    })
    expect(stats.lapCount).toBe(3)
    expect(stats.bestLapMs).toBe(17_500)
    expect(stats.totalLapMs).toBe(53_400)
    expect(stats.averageLapMs).toBe(53_400 / 3)
  })

  it('reports a negative delta and beatsAllTime=true when the session set a new PB', () => {
    const stats = summarizeSession({
      history: [lap(1, 18_000), lap(2, 17_400)],
      priorAllTimeMs: 17_500,
      driftBest: null,
      sessionDurationMs: 30_000,
    })
    expect(stats.deltaVsAllTimeMs).toBe(-100)
    expect(stats.beatsAllTime).toBe(true)
    expect(stats.priorAllTimeMs).toBe(17_500)
  })

  it('reports a positive delta and beatsAllTime=false when the session was slower', () => {
    const stats = summarizeSession({
      history: [lap(1, 17_900)],
      priorAllTimeMs: 17_500,
      driftBest: null,
      sessionDurationMs: 30_000,
    })
    expect(stats.deltaVsAllTimeMs).toBe(400)
    expect(stats.beatsAllTime).toBe(false)
  })

  it('treats an exact tie as beatsAllTime=false (no improvement to celebrate)', () => {
    const stats = summarizeSession({
      history: [lap(1, 17_500)],
      priorAllTimeMs: 17_500,
      driftBest: null,
      sessionDurationMs: 30_000,
    })
    expect(stats.deltaVsAllTimeMs).toBe(0)
    expect(stats.beatsAllTime).toBe(false)
  })

  it('returns a null delta when there was no prior all-time PB', () => {
    const stats = summarizeSession({
      history: [lap(1, 17_500)],
      priorAllTimeMs: null,
      driftBest: null,
      sessionDurationMs: 30_000,
    })
    expect(stats.deltaVsAllTimeMs).toBeNull()
    expect(stats.beatsAllTime).toBe(false)
  })

  it('passes the drift score through when valid and drops it when degenerate', () => {
    const valid = summarizeSession({
      history: [lap(1, 17_500)],
      priorAllTimeMs: null,
      driftBest: 1234,
      sessionDurationMs: 30_000,
    })
    expect(valid.driftBest).toBe(1234)
    const zero = summarizeSession({
      history: [lap(1, 17_500)],
      priorAllTimeMs: null,
      driftBest: 0,
      sessionDurationMs: 30_000,
    })
    expect(zero.driftBest).toBeNull()
    const negative = summarizeSession({
      history: [lap(1, 17_500)],
      priorAllTimeMs: null,
      driftBest: -5,
      sessionDurationMs: 30_000,
    })
    expect(negative.driftBest).toBeNull()
    const nonFinite = summarizeSession({
      history: [lap(1, 17_500)],
      priorAllTimeMs: null,
      driftBest: Number.NaN,
      sessionDurationMs: 30_000,
    })
    expect(nonFinite.driftBest).toBeNull()
  })

  it('clamps a non-finite, negative, or absurd session duration', () => {
    expect(
      summarizeSession({
        history: [],
        priorAllTimeMs: null,
        driftBest: null,
        sessionDurationMs: -1000,
      }).sessionDurationMs,
    ).toBe(0)
    expect(
      summarizeSession({
        history: [],
        priorAllTimeMs: null,
        driftBest: null,
        sessionDurationMs: Number.NaN,
      }).sessionDurationMs,
    ).toBe(0)
    expect(
      summarizeSession({
        history: [],
        priorAllTimeMs: null,
        driftBest: null,
        sessionDurationMs: Number.POSITIVE_INFINITY,
      }).sessionDurationMs,
    ).toBe(86_400_000)
    expect(
      summarizeSession({
        history: [],
        priorAllTimeMs: null,
        driftBest: null,
        sessionDurationMs: 86_400_000 + 1,
      }).sessionDurationMs,
    ).toBe(86_400_000)
  })

  it('rejects a non-finite or non-positive prior PB rather than returning a NaN delta', () => {
    const negativePrior = summarizeSession({
      history: [lap(1, 17_500)],
      priorAllTimeMs: -100,
      driftBest: null,
      sessionDurationMs: 1000,
    })
    expect(negativePrior.priorAllTimeMs).toBeNull()
    expect(negativePrior.deltaVsAllTimeMs).toBeNull()
    const nanPrior = summarizeSession({
      history: [lap(1, 17_500)],
      priorAllTimeMs: Number.NaN,
      driftBest: null,
      sessionDurationMs: 1000,
    })
    expect(nanPrior.priorAllTimeMs).toBeNull()
    expect(nanPrior.deltaVsAllTimeMs).toBeNull()
  })

  it('does not mutate the input history array', () => {
    const history: LapHistoryEntry[] = [lap(1, 17_500), lap(2, 17_300)]
    const snapshot = JSON.parse(JSON.stringify(history))
    summarizeSession({
      history,
      priorAllTimeMs: null,
      driftBest: null,
      sessionDurationMs: 1000,
    })
    expect(history).toEqual(snapshot)
  })
})

describe('formatSessionDuration', () => {
  it('reads "0s" for sub-second inputs and degenerate values', () => {
    expect(formatSessionDuration(0)).toBe('0s')
    expect(formatSessionDuration(-1)).toBe('0s')
    expect(formatSessionDuration(500)).toBe('0s')
    expect(formatSessionDuration(Number.NaN)).toBe('0s')
  })

  it('reads "Xs" for sub-minute inputs', () => {
    expect(formatSessionDuration(1_000)).toBe('1s')
    expect(formatSessionDuration(45_000)).toBe('45s')
    expect(formatSessionDuration(59_999)).toBe('59s')
  })

  it('reads "Mm Ss" for sub-hour inputs and drops the seconds suffix on a flat minute', () => {
    expect(formatSessionDuration(60_000)).toBe('1m')
    expect(formatSessionDuration(60_000 + 5_000)).toBe('1m 5s')
    expect(formatSessionDuration(15 * 60_000 + 30_000)).toBe('15m 30s')
    expect(formatSessionDuration(45 * 60_000)).toBe('45m')
  })

  it('reads "Hh Mm" for hour-plus inputs and drops the minutes suffix on a flat hour', () => {
    expect(formatSessionDuration(60 * 60_000)).toBe('1h')
    expect(formatSessionDuration(60 * 60_000 + 30 * 60_000)).toBe('1h 30m')
    expect(formatSessionDuration(2 * 60 * 60_000 + 5 * 60_000)).toBe('2h 5m')
  })

  it('clamps absurdly long durations to 24h before formatting', () => {
    expect(formatSessionDuration(48 * 60 * 60_000)).toBe('24h')
    expect(formatSessionDuration(Number.POSITIVE_INFINITY)).toBe('24h')
  })
})

describe('computeSectorBreakdown', () => {
  it('returns an empty array when both inputs are empty', () => {
    expect(computeSectorBreakdown([], null)).toEqual([])
    expect(computeSectorBreakdown([], [])).toEqual([])
  })

  it('produces one row per cpId across the union of session and prior sectors', () => {
    const history: LapHistoryEntry[] = [
      lap(1, 10_000, [
        { cpId: 0, durationMs: 3000 },
        { cpId: 1, durationMs: 4000 },
        { cpId: 2, durationMs: 3000 },
      ]),
    ]
    const prior: SectorDuration[] = [
      { cpId: 0, durationMs: 2800 },
      { cpId: 1, durationMs: 3800 },
      { cpId: 2, durationMs: 2900 },
    ]
    const rows = computeSectorBreakdown(history, prior)
    expect(rows.length).toBe(3)
    const ids = rows.map((r) => r.cpId).sort((a, b) => a - b)
    expect(ids).toEqual([0, 1, 2])
  })

  it('uses the SESSION-best per cpId, not just the session-best lap', () => {
    const history: LapHistoryEntry[] = [
      lap(1, 11_000, [
        { cpId: 0, durationMs: 3000 },
        { cpId: 1, durationMs: 4000 },
      ]),
      lap(2, 11_500, [
        // Lap 2 is slower overall, but its S0 is the session best.
        { cpId: 0, durationMs: 2700 },
        { cpId: 1, durationMs: 4500 },
      ]),
    ]
    const rows = computeSectorBreakdown(history, [
      { cpId: 0, durationMs: 2900 },
      { cpId: 1, durationMs: 3900 },
    ])
    const s0 = rows.find((r) => r.cpId === 0)!
    const s1 = rows.find((r) => r.cpId === 1)!
    expect(s0.sessionBestMs).toBe(2700)
    expect(s1.sessionBestMs).toBe(4000)
    // S0 beat the prior all-time best (2700 < 2900), so delta is negative.
    expect(s0.deltaMs).toBe(-200)
    expect(s0.matchedAllTimeBest).toBe(true)
    // S1 lost time vs prior all-time best (4000 > 3900).
    expect(s1.deltaMs).toBe(100)
    expect(s1.matchedAllTimeBest).toBe(false)
  })

  it('marks the row with the largest positive delta as biggestLoss', () => {
    const history: LapHistoryEntry[] = [
      lap(1, 9999, [
        { cpId: 0, durationMs: 3100 },
        { cpId: 1, durationMs: 4500 },
        { cpId: 2, durationMs: 3000 },
      ]),
    ]
    const prior: SectorDuration[] = [
      { cpId: 0, durationMs: 3000 }, // lost 100
      { cpId: 1, durationMs: 4000 }, // lost 500 (biggest)
      { cpId: 2, durationMs: 2900 }, // lost 100
    ]
    const rows = computeSectorBreakdown(history, prior)
    const biggest = rows.filter((r) => r.biggestLoss)
    expect(biggest.length).toBe(1)
    expect(biggest[0].cpId).toBe(1)
  })

  it('marks no row as biggestLoss when there are no positive deltas', () => {
    const history: LapHistoryEntry[] = [
      lap(1, 9999, [
        { cpId: 0, durationMs: 2800 },
        { cpId: 1, durationMs: 3800 },
      ]),
    ]
    const prior: SectorDuration[] = [
      { cpId: 0, durationMs: 2800 },
      { cpId: 1, durationMs: 3800 },
    ]
    const rows = computeSectorBreakdown(history, prior)
    expect(rows.every((r) => r.biggestLoss === false)).toBe(true)
  })

  it('sorts rows: time-lost biggest-first, then matched, then null-delta', () => {
    const history: LapHistoryEntry[] = [
      lap(1, 9999, [
        { cpId: 0, durationMs: 3000 }, // matched (delta 0)
        { cpId: 1, durationMs: 4500 }, // lost 500
        { cpId: 2, durationMs: 3100 }, // lost 100
        // cpId 3 not in history -> null delta in row
      ]),
    ]
    const prior: SectorDuration[] = [
      { cpId: 0, durationMs: 3000 },
      { cpId: 1, durationMs: 4000 },
      { cpId: 2, durationMs: 3000 },
      { cpId: 3, durationMs: 5000 },
    ]
    const rows = computeSectorBreakdown(history, prior)
    expect(rows.map((r) => r.cpId)).toEqual([1, 2, 0, 3])
  })

  it('builds labels (S1, S2, ...) from the prior sectors order, not cpId arithmetic', () => {
    const history: LapHistoryEntry[] = [
      lap(1, 9999, [
        { cpId: 5, durationMs: 3000 },
        { cpId: 9, durationMs: 4000 },
      ]),
    ]
    const prior: SectorDuration[] = [
      { cpId: 5, durationMs: 2900 },
      { cpId: 9, durationMs: 3900 },
    ]
    const rows = computeSectorBreakdown(history, prior)
    const r0 = rows.find((r) => r.cpId === 5)!
    const r1 = rows.find((r) => r.cpId === 9)!
    expect(r0.label).toBe('S1')
    expect(r1.label).toBe('S2')
  })

  it('falls back to S{cpId+1} for sectors that exist only in the session set', () => {
    const history: LapHistoryEntry[] = [
      lap(1, 9999, [
        { cpId: 7, durationMs: 4000 },
      ]),
    ]
    const rows = computeSectorBreakdown(history, null)
    expect(rows.length).toBe(1)
    expect(rows[0].label).toBe('S8')
    expect(rows[0].sessionBestMs).toBe(4000)
    expect(rows[0].allTimeBestMs).toBeNull()
    expect(rows[0].deltaMs).toBeNull()
  })

  it('drops non-finite or non-positive sector durations from both sides', () => {
    const history: LapHistoryEntry[] = [
      lap(1, 9999, [
        { cpId: 0, durationMs: 3000 },
        { cpId: 1, durationMs: 0 },
        { cpId: 2, durationMs: Number.NaN },
        { cpId: 3, durationMs: -50 },
      ]),
    ]
    const prior: SectorDuration[] = [
      { cpId: 0, durationMs: 2900 },
      { cpId: 1, durationMs: -10 },
      { cpId: 2, durationMs: Number.POSITIVE_INFINITY },
      { cpId: 3, durationMs: 0 },
      { cpId: 4, durationMs: 2500 },
    ]
    const rows = computeSectorBreakdown(history, prior)
    // Only cpId 0 (both valid) and cpId 4 (only prior) survive.
    expect(rows.length).toBe(2)
    const r0 = rows.find((r) => r.cpId === 0)!
    expect(r0.sessionBestMs).toBe(3000)
    expect(r0.allTimeBestMs).toBe(2900)
    const r4 = rows.find((r) => r.cpId === 4)!
    expect(r4.sessionBestMs).toBeNull()
    expect(r4.allTimeBestMs).toBe(2500)
  })

  it('mirrors mergeBestSectors with last-write-wins on duplicate prior cpIds', () => {
    const history: LapHistoryEntry[] = [
      lap(1, 9999, [{ cpId: 0, durationMs: 3000 }]),
    ]
    const prior: SectorDuration[] = [
      { cpId: 0, durationMs: 2500 },
      { cpId: 0, durationMs: 2900 },
    ]
    const rows = computeSectorBreakdown(history, prior)
    expect(rows.length).toBe(1)
    expect(rows[0].allTimeBestMs).toBe(2900)
    expect(rows[0].deltaMs).toBe(100)
  })

  it('produces a null delta when only one side has a value at a cpId', () => {
    const history: LapHistoryEntry[] = [
      lap(1, 9999, [{ cpId: 0, durationMs: 3000 }]),
    ]
    const prior: SectorDuration[] = [{ cpId: 1, durationMs: 4000 }]
    const rows = computeSectorBreakdown(history, prior)
    expect(rows.length).toBe(2)
    for (const row of rows) {
      expect(row.deltaMs).toBeNull()
      expect(row.matchedAllTimeBest).toBe(false)
      expect(row.biggestLoss).toBe(false)
    }
  })

  it('does not mutate the input history or prior sectors', () => {
    const history: LapHistoryEntry[] = [
      lap(1, 9999, [{ cpId: 0, durationMs: 3000 }]),
    ]
    const prior: SectorDuration[] = [{ cpId: 0, durationMs: 2900 }]
    const historyClone = JSON.parse(JSON.stringify(history))
    const priorClone = JSON.parse(JSON.stringify(prior))
    computeSectorBreakdown(history, prior)
    expect(history).toEqual(historyClone)
    expect(prior).toEqual(priorClone)
  })
})

describe('summarizeSession sectorBreakdown wiring', () => {
  it('produces a non-empty breakdown when both history sectors and prior sectors exist', () => {
    const stats = summarizeSession({
      history: [
        lap(1, 10_000, [
          { cpId: 0, durationMs: 3100 },
          { cpId: 1, durationMs: 4500 },
        ]),
      ],
      priorAllTimeMs: 9_500,
      priorAllTimeSectors: [
        { cpId: 0, durationMs: 3000 },
        { cpId: 1, durationMs: 4000 },
      ],
      driftBest: null,
      sessionDurationMs: 30_000,
    })
    expect(stats.sectorBreakdown.length).toBe(2)
    // 100 + 500 = 600 ms total time lost
    expect(stats.totalTimeLostMs).toBe(600)
  })

  it('reports zero total time lost when every sector matched or beat the prior best', () => {
    const stats = summarizeSession({
      history: [
        lap(1, 9_000, [
          { cpId: 0, durationMs: 2900 },
          { cpId: 1, durationMs: 3800 },
        ]),
      ],
      priorAllTimeMs: 9_500,
      priorAllTimeSectors: [
        { cpId: 0, durationMs: 3000 },
        { cpId: 1, durationMs: 3800 },
      ],
      driftBest: null,
      sessionDurationMs: 30_000,
    })
    expect(stats.sectorBreakdown.length).toBe(2)
    expect(stats.totalTimeLostMs).toBe(0)
  })

  it('returns a null totalTimeLostMs when no breakdown was produced', () => {
    const stats = summarizeSession({
      history: [lap(1, 10_000)],
      priorAllTimeMs: 9_500,
      // No prior sectors, no per-lap sectors -> empty breakdown.
      driftBest: null,
      sessionDurationMs: 30_000,
    })
    expect(stats.sectorBreakdown).toEqual([])
    expect(stats.totalTimeLostMs).toBeNull()
  })
})

describe('formatSectorDuration', () => {
  it('formats a positive duration as S.mmm', () => {
    expect(formatSectorDuration(3_421)).toBe('3.421')
    expect(formatSectorDuration(500)).toBe('0.500')
    expect(formatSectorDuration(60_000)).toBe('60.000')
  })

  it('returns -- for null, non-finite, or non-positive inputs', () => {
    expect(formatSectorDuration(null)).toBe('--')
    expect(formatSectorDuration(0)).toBe('--')
    expect(formatSectorDuration(-1)).toBe('--')
    expect(formatSectorDuration(Number.NaN)).toBe('--')
    expect(formatSectorDuration(Number.POSITIVE_INFINITY)).toBe('--')
  })

  it('rounds half millis to nearest integer ms', () => {
    expect(formatSectorDuration(1234.5)).toBe('1.235')
  })
})

describe('formatSectorDelta', () => {
  it('formats a positive delta with a leading +', () => {
    expect(formatSectorDelta(421)).toBe('+0.421')
    expect(formatSectorDelta(1_034)).toBe('+1.034')
  })

  it('formats a negative delta with a leading -', () => {
    expect(formatSectorDelta(-421)).toBe('-0.421')
    expect(formatSectorDelta(-1_034)).toBe('-1.034')
  })

  it('reads zero as +0.000', () => {
    expect(formatSectorDelta(0)).toBe('+0.000')
  })

  it('returns -- for null or non-finite inputs', () => {
    expect(formatSectorDelta(null)).toBe('--')
    expect(formatSectorDelta(Number.NaN)).toBe('--')
    expect(formatSectorDelta(Number.POSITIVE_INFINITY)).toBe('--')
  })

  it('handles the 999.5 ms rounding rollover', () => {
    expect(formatSectorDelta(1_999.5)).toBe('+2.000')
    expect(formatSectorDelta(-1_999.5)).toBe('-2.000')
  })
})
