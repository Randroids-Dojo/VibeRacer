import { describe, it, expect } from 'vitest'
import {
  appendLap,
  formatLapDelta,
  makeLapEntry,
  summarizeHistory,
  type LapHistoryEntry,
} from '@/game/lapHistory'

describe('makeLapEntry', () => {
  it('returns a null delta and isPb=false when there is no prior PB', () => {
    const entry = makeLapEntry({
      lapNumber: 1,
      lapTimeMs: 18420,
      priorBestAllTimeMs: null,
    })
    expect(entry).toEqual({
      lapNumber: 1,
      lapTimeMs: 18420,
      deltaVsPbMs: null,
      isPb: false,
      sectors: [],
    })
  })

  it('marks the lap as a PB when faster than the prior best', () => {
    const entry = makeLapEntry({
      lapNumber: 4,
      lapTimeMs: 17500,
      priorBestAllTimeMs: 18000,
    })
    expect(entry.deltaVsPbMs).toBe(-500)
    expect(entry.isPb).toBe(true)
    expect(entry.sectors).toEqual([])
  })

  it('marks the lap as a PB on an exact tie (delta is zero)', () => {
    const entry = makeLapEntry({
      lapNumber: 2,
      lapTimeMs: 17500,
      priorBestAllTimeMs: 17500,
    })
    expect(entry.deltaVsPbMs).toBe(0)
    expect(entry.isPb).toBe(true)
  })

  it('marks the lap as not a PB when slower than the prior best', () => {
    const entry = makeLapEntry({
      lapNumber: 3,
      lapTimeMs: 18250,
      priorBestAllTimeMs: 18000,
    })
    expect(entry.deltaVsPbMs).toBe(250)
    expect(entry.isPb).toBe(false)
  })

  it('carries the provided sectors through onto the entry', () => {
    const entry = makeLapEntry({
      lapNumber: 1,
      lapTimeMs: 18000,
      priorBestAllTimeMs: null,
      sectors: [
        { cpId: 0, durationMs: 4000 },
        { cpId: 1, durationMs: 5000 },
        { cpId: 2, durationMs: 9000 },
      ],
    })
    expect(entry.sectors).toEqual([
      { cpId: 0, durationMs: 4000 },
      { cpId: 1, durationMs: 5000 },
      { cpId: 2, durationMs: 9000 },
    ])
  })

  it('drops sectors with non-finite or non-positive durations', () => {
    const entry = makeLapEntry({
      lapNumber: 1,
      lapTimeMs: 18000,
      priorBestAllTimeMs: null,
      sectors: [
        { cpId: 0, durationMs: 4000 },
        { cpId: 1, durationMs: 0 },
        { cpId: 2, durationMs: -100 },
        { cpId: 3, durationMs: NaN },
        { cpId: 4, durationMs: Infinity },
        { cpId: 5, durationMs: 7000 },
      ],
    })
    expect(entry.sectors).toEqual([
      { cpId: 0, durationMs: 4000 },
      { cpId: 5, durationMs: 7000 },
    ])
  })

  it('defensively copies the sectors array so caller mutations do not leak', () => {
    const sectors = [
      { cpId: 0, durationMs: 4000 },
      { cpId: 1, durationMs: 5000 },
    ]
    const entry = makeLapEntry({
      lapNumber: 1,
      lapTimeMs: 18000,
      priorBestAllTimeMs: null,
      sectors,
    })
    sectors[0].durationMs = 9999
    expect(entry.sectors[0].durationMs).toBe(4000)
    expect(entry.sectors).not.toBe(sectors)
  })
})

describe('appendLap', () => {
  it('returns a new array preserving prior entries', () => {
    const initial: LapHistoryEntry[] = [
      {
        lapNumber: 1,
        lapTimeMs: 18000,
        deltaVsPbMs: null,
        isPb: false,
        sectors: [],
      },
    ]
    const next = appendLap(initial, {
      lapNumber: 2,
      lapTimeMs: 17500,
      priorBestAllTimeMs: 18000,
    })
    expect(next).not.toBe(initial)
    expect(initial).toHaveLength(1)
    expect(next).toHaveLength(2)
    expect(next[0]).toEqual(initial[0])
    expect(next[1]).toEqual({
      lapNumber: 2,
      lapTimeMs: 17500,
      deltaVsPbMs: -500,
      isPb: true,
      sectors: [],
    })
  })

  it('keeps appending across many laps', () => {
    let history: LapHistoryEntry[] = []
    history = appendLap(history, {
      lapNumber: 1,
      lapTimeMs: 19000,
      priorBestAllTimeMs: null,
    })
    history = appendLap(history, {
      lapNumber: 2,
      lapTimeMs: 18000,
      priorBestAllTimeMs: 19000,
    })
    history = appendLap(history, {
      lapNumber: 3,
      lapTimeMs: 17800,
      priorBestAllTimeMs: 18000,
    })
    expect(history.map((h) => h.isPb)).toEqual([false, true, true])
    expect(history.map((h) => h.deltaVsPbMs)).toEqual([null, -1000, -200])
  })
})

describe('formatLapDelta', () => {
  it('formats positive deltas with a leading +', () => {
    expect(formatLapDelta(421)).toBe('+0.421')
    expect(formatLapDelta(2050)).toBe('+2.050')
  })

  it('formats negative deltas with a leading -', () => {
    expect(formatLapDelta(-421)).toBe('-0.421')
    expect(formatLapDelta(-1034)).toBe('-1.034')
  })

  it('formats zero as +0.000 so the lane is never just a number', () => {
    expect(formatLapDelta(0)).toBe('+0.000')
  })

  it('pads millis to three digits', () => {
    expect(formatLapDelta(7)).toBe('+0.007')
    expect(formatLapDelta(-50)).toBe('-0.050')
  })

  it('handles non-finite input defensively', () => {
    expect(formatLapDelta(NaN)).toBe('+0.000')
    expect(formatLapDelta(Infinity)).toBe('+0.000')
  })

  it('rolls millis up into seconds when rounding hits 1000', () => {
    expect(formatLapDelta(1999.6)).toBe('+2.000')
    expect(formatLapDelta(-999.7)).toBe('-1.000')
  })
})

describe('summarizeHistory', () => {
  it('returns nulls and a count of 0 for an empty history', () => {
    expect(summarizeHistory([])).toEqual({
      count: 0,
      bestMs: null,
      averageMs: null,
      totalMs: null,
    })
  })

  it('computes count, best, average, and total across entries', () => {
    const history: LapHistoryEntry[] = [
      {
        lapNumber: 1,
        lapTimeMs: 20000,
        deltaVsPbMs: null,
        isPb: false,
        sectors: [],
      },
      {
        lapNumber: 2,
        lapTimeMs: 18000,
        deltaVsPbMs: -2000,
        isPb: true,
        sectors: [],
      },
      {
        lapNumber: 3,
        lapTimeMs: 22000,
        deltaVsPbMs: 4000,
        isPb: false,
        sectors: [],
      },
    ]
    expect(summarizeHistory(history)).toEqual({
      count: 3,
      bestMs: 18000,
      averageMs: 20000,
      totalMs: 60000,
    })
  })

  it('handles a single-entry history without divide-by-zero', () => {
    const history: LapHistoryEntry[] = [
      {
        lapNumber: 1,
        lapTimeMs: 18420,
        deltaVsPbMs: null,
        isPb: false,
        sectors: [],
      },
    ]
    expect(summarizeHistory(history)).toEqual({
      count: 1,
      bestMs: 18420,
      averageMs: 18420,
      totalMs: 18420,
    })
  })
})
