import { describe, it, expect } from 'vitest'
import {
  formatSessionDuration,
  summarizeSession,
} from '@/game/sessionSummary'
import type { LapHistoryEntry } from '@/game/lapHistory'

function lap(lapNumber: number, lapTimeMs: number): LapHistoryEntry {
  return {
    lapNumber,
    lapTimeMs,
    deltaVsPbMs: null,
    isPb: false,
    sectors: [],
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
