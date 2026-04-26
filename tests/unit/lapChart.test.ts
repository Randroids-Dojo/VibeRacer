import { describe, it, expect } from 'vitest'
import {
  buildLapChartGeometry,
  pointsToPolyline,
} from '@/game/lapChart'
import type { LapHistoryEntry } from '@/game/lapHistory'

function makeEntry(overrides: Partial<LapHistoryEntry> = {}): LapHistoryEntry {
  return {
    lapNumber: 1,
    lapTimeMs: 18000,
    deltaVsPbMs: null,
    isPb: false,
    ...overrides,
  }
}

describe('buildLapChartGeometry', () => {
  it('returns an empty geometry on empty history', () => {
    const geom = buildLapChartGeometry([], { width: 200, height: 60 })
    expect(geom.points).toEqual([])
    expect(geom.bestY).toBeNull()
    expect(geom.averageY).toBeNull()
    expect(geom.slowestMs).toBeNull()
    expect(geom.fastestMs).toBeNull()
  })

  it('returns an empty geometry on non-positive width / height', () => {
    expect(
      buildLapChartGeometry([makeEntry()], { width: 0, height: 60 }).points,
    ).toEqual([])
    expect(
      buildLapChartGeometry([makeEntry()], { width: 100, height: 0 }).points,
    ).toEqual([])
    expect(
      buildLapChartGeometry([makeEntry()], { width: -10, height: 60 }).points,
    ).toEqual([])
  })

  it('returns an empty geometry on non-finite dimensions', () => {
    expect(
      buildLapChartGeometry([makeEntry()], {
        width: Number.NaN,
        height: 60,
      }).points,
    ).toEqual([])
    expect(
      buildLapChartGeometry([makeEntry()], {
        width: 100,
        height: Number.POSITIVE_INFINITY,
      }).points,
    ).toEqual([])
  })

  it('skips entries with non-finite or non-positive lap times', () => {
    const history: LapHistoryEntry[] = [
      makeEntry({ lapNumber: 1, lapTimeMs: Number.NaN }),
      makeEntry({ lapNumber: 2, lapTimeMs: 0 }),
      makeEntry({ lapNumber: 3, lapTimeMs: -100 }),
      makeEntry({ lapNumber: 4, lapTimeMs: Number.POSITIVE_INFINITY }),
      makeEntry({ lapNumber: 5, lapTimeMs: 18000 }),
      makeEntry({ lapNumber: 6, lapTimeMs: 17500 }),
    ]
    const geom = buildLapChartGeometry(history, { width: 100, height: 60 })
    expect(geom.points.length).toBe(2)
    expect(geom.points[0].entry.lapNumber).toBe(5)
    expect(geom.points[1].entry.lapNumber).toBe(6)
    expect(geom.fastestMs).toBe(17500)
    expect(geom.slowestMs).toBe(18000)
  })

  it('returns empty geometry when every entry is invalid', () => {
    const history: LapHistoryEntry[] = [
      makeEntry({ lapNumber: 1, lapTimeMs: Number.NaN }),
      makeEntry({ lapNumber: 2, lapTimeMs: -5 }),
    ]
    const geom = buildLapChartGeometry(history, { width: 100, height: 60 })
    expect(geom.points).toEqual([])
    expect(geom.bestY).toBeNull()
  })

  it('places a single entry at the horizontal center and vertical mid-band', () => {
    const geom = buildLapChartGeometry([makeEntry({ lapTimeMs: 12345 })], {
      width: 200,
      height: 60,
      padY: 5,
    })
    expect(geom.points.length).toBe(1)
    expect(geom.points[0].x).toBe(100)
    // Single entry is the only domain anchor; midline is innerTop + innerH / 2
    // where innerTop = 5 and innerH = 60 - 10 = 50, so y = 5 + 25 = 30.
    expect(geom.points[0].y).toBe(30)
    expect(geom.fastestMs).toBe(12345)
    expect(geom.slowestMs).toBe(12345)
    expect(geom.bestY).toBe(30)
    expect(geom.averageY).toBe(30)
  })

  it('spreads multiple entries evenly across the width', () => {
    const history: LapHistoryEntry[] = [
      makeEntry({ lapNumber: 1, lapTimeMs: 18000 }),
      makeEntry({ lapNumber: 2, lapTimeMs: 17500 }),
      makeEntry({ lapNumber: 3, lapTimeMs: 17000 }),
    ]
    const geom = buildLapChartGeometry(history, { width: 200, height: 60 })
    expect(geom.points.map((p) => p.x)).toEqual([0, 100, 200])
  })

  it('maps the fastest lap to the top of the inner band and the slowest to the bottom', () => {
    const history: LapHistoryEntry[] = [
      makeEntry({ lapNumber: 1, lapTimeMs: 18000 }),
      makeEntry({ lapNumber: 2, lapTimeMs: 17500 }),
      makeEntry({ lapNumber: 3, lapTimeMs: 17000 }),
    ]
    const geom = buildLapChartGeometry(history, {
      width: 200,
      height: 60,
      padY: 5,
    })
    // padY = 5, height = 60, so innerTop = 5 and innerBottom = 55.
    expect(geom.points[2].y).toBe(5) // fastest 17000
    expect(geom.points[0].y).toBe(55) // slowest 18000
    // Middle lap halfway between (in lap-time-ratio terms).
    expect(geom.points[1].y).toBeCloseTo(30, 5)
    expect(geom.bestY).toBe(5)
    expect(geom.fastestMs).toBe(17000)
    expect(geom.slowestMs).toBe(18000)
  })

  it('places averageY between bestY and slowestY for an asymmetric spread', () => {
    const history: LapHistoryEntry[] = [
      makeEntry({ lapNumber: 1, lapTimeMs: 17000 }),
      makeEntry({ lapNumber: 2, lapTimeMs: 19000 }),
      makeEntry({ lapNumber: 3, lapTimeMs: 21000 }),
    ]
    const geom = buildLapChartGeometry(history, {
      width: 200,
      height: 60,
      padY: 5,
    })
    expect(geom.bestY).toBeLessThan(geom.averageY!)
    expect(geom.averageY!).toBeLessThan(geom.points[2].y)
  })

  it('collapses all points to mid-band when every lap has the same time', () => {
    const history: LapHistoryEntry[] = [
      makeEntry({ lapNumber: 1, lapTimeMs: 18000 }),
      makeEntry({ lapNumber: 2, lapTimeMs: 18000 }),
      makeEntry({ lapNumber: 3, lapTimeMs: 18000 }),
    ]
    const geom = buildLapChartGeometry(history, {
      width: 200,
      height: 60,
      padY: 6,
    })
    // innerTop = 6, innerH = 48, mid = 6 + 24 = 30.
    for (const p of geom.points) expect(p.y).toBe(30)
    expect(geom.bestY).toBe(30)
    expect(geom.averageY).toBe(30)
  })

  it('preserves entry references so the caller can drive labels off them', () => {
    const a = makeEntry({ lapNumber: 1, lapTimeMs: 18000 })
    const b = makeEntry({ lapNumber: 2, lapTimeMs: 17500, isPb: true })
    const geom = buildLapChartGeometry([a, b], { width: 100, height: 60 })
    expect(geom.points[0].entry).toBe(a)
    expect(geom.points[1].entry).toBe(b)
  })

  it('does not mutate the input history', () => {
    const history: readonly LapHistoryEntry[] = Object.freeze([
      makeEntry({ lapNumber: 1, lapTimeMs: 18000 }),
      makeEntry({ lapNumber: 2, lapTimeMs: 17500 }),
    ])
    expect(() =>
      buildLapChartGeometry(history, { width: 100, height: 60 }),
    ).not.toThrow()
    expect(history.length).toBe(2)
  })

  it('uses a default vertical padding of 6 when padY is omitted', () => {
    const history: LapHistoryEntry[] = [
      makeEntry({ lapNumber: 1, lapTimeMs: 18000 }),
      makeEntry({ lapNumber: 2, lapTimeMs: 17000 }),
    ]
    const geom = buildLapChartGeometry(history, { width: 100, height: 60 })
    expect(geom.points[1].y).toBe(6) // fastest hugs innerTop
    expect(geom.points[0].y).toBe(54) // slowest hugs innerBottom = 60 - 6
  })

  it('filters before computing stride so two valid entries span the full width', () => {
    const history: LapHistoryEntry[] = [
      makeEntry({ lapNumber: 1, lapTimeMs: Number.NaN }),
      makeEntry({ lapNumber: 2, lapTimeMs: 18000 }),
      makeEntry({ lapNumber: 3, lapTimeMs: -1 }),
      makeEntry({ lapNumber: 4, lapTimeMs: 17500 }),
    ]
    const geom = buildLapChartGeometry(history, { width: 200, height: 60 })
    expect(geom.points.map((p) => p.x)).toEqual([0, 200])
  })
})

describe('pointsToPolyline', () => {
  it('returns an empty string for an empty geometry', () => {
    expect(
      pointsToPolyline({
        points: [],
        bestY: null,
        averageY: null,
        slowestMs: null,
        fastestMs: null,
      }),
    ).toBe('')
  })

  it('joins point coordinates with a comma plus space separator', () => {
    const geom = buildLapChartGeometry(
      [
        { lapNumber: 1, lapTimeMs: 18000, deltaVsPbMs: null, isPb: false },
        { lapNumber: 2, lapTimeMs: 17000, deltaVsPbMs: null, isPb: false },
      ],
      { width: 100, height: 60, padY: 0 },
    )
    expect(pointsToPolyline(geom)).toBe('0,60 100,0')
  })

  it('rounds coordinates to two decimals', () => {
    const geom = buildLapChartGeometry(
      [
        { lapNumber: 1, lapTimeMs: 18000, deltaVsPbMs: null, isPb: false },
        { lapNumber: 2, lapTimeMs: 17789, deltaVsPbMs: null, isPb: false },
        { lapNumber: 3, lapTimeMs: 17500, deltaVsPbMs: null, isPb: false },
      ],
      { width: 100, height: 60, padY: 0 },
    )
    // x stride for 3 entries = 50. y for entry 2 is the only place precision
    // matters: ratio = (17789 - 17500) / (18000 - 17500) = 0.578, y = 0.578
    // * 60 = 34.68.
    expect(pointsToPolyline(geom)).toBe('0,60 50,34.68 100,0')
  })
})
