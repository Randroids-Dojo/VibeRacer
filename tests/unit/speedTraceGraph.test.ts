import { describe, it, expect } from 'vitest'
import {
  buildLinePath,
  downsampleByStride,
  formatDurationSec,
  formatLapTime,
  formatSigned,
  niceTicks,
  speedColor,
  speedFraction,
} from '@/lib/speedTraceGraph'

describe('niceTicks', () => {
  it('produces round numbers for typical speed ranges', () => {
    const r = niceTicks(0, 26)
    expect(r.niceMin).toBe(0)
    expect(r.niceMax).toBeGreaterThanOrEqual(26)
    expect(r.step).toBeGreaterThan(0)
    expect(r.values[0]).toBe(r.niceMin)
    expect(r.values[r.values.length - 1]).toBe(r.niceMax)
    for (let i = 1; i < r.values.length; i++) {
      expect(r.values[i] - r.values[i - 1]).toBeCloseTo(r.step, 6)
    }
  })

  it('snaps the range outward to the nearest step', () => {
    const r = niceTicks(2.3, 17.6)
    expect(r.niceMin).toBeLessThanOrEqual(2.3)
    expect(r.niceMax).toBeGreaterThanOrEqual(17.6)
  })

  it('honors targetTicks loosely (within +/- a few ticks)', () => {
    const r = niceTicks(0, 100, 5)
    expect(r.values.length).toBeGreaterThanOrEqual(3)
    expect(r.values.length).toBeLessThanOrEqual(11)
  })

  it('falls back to a unit range when min > max', () => {
    const r = niceTicks(10, 5)
    expect(r.niceMin).toBe(0)
    expect(r.niceMax).toBe(4)
    expect(r.step).toBe(1)
    expect(r.values).toEqual([0, 1, 2, 3, 4])
  })

  it('falls back when inputs are non-finite', () => {
    expect(niceTicks(Number.NaN, 10).values).toEqual([0, 1, 2, 3, 4])
    expect(niceTicks(0, Number.POSITIVE_INFINITY).values).toEqual([
      0, 1, 2, 3, 4,
    ])
  })

  it('expands a degenerate range when min equals max', () => {
    const r = niceTicks(5, 5)
    expect(r.niceMin).toBeLessThan(5)
    expect(r.niceMax).toBeGreaterThan(5)
    expect(r.values.length).toBeGreaterThanOrEqual(2)
  })

  it('expands a zero-zero range to a 0..1 axis', () => {
    const r = niceTicks(0, 0)
    expect(r.niceMin).toBe(0)
    expect(r.niceMax).toBe(1)
    expect(r.values).toEqual([0, 0.25, 0.5, 0.75, 1])
  })
})

describe('speedColor', () => {
  it('returns blue for 0 and red for 1', () => {
    const blue = speedColor(0)
    const red = speedColor(1)
    expect(blue).toMatch(/^hsl\(220/)
    expect(red).toMatch(/^hsl\(0/)
  })

  it('clamps inputs outside [0, 1]', () => {
    expect(speedColor(-1)).toBe(speedColor(0))
    expect(speedColor(2)).toBe(speedColor(1))
  })

  it('moves monotonically across the ramp', () => {
    const a = speedColor(0.1)
    const b = speedColor(0.5)
    const c = speedColor(0.9)
    const huesIn = (s: string) => Number(s.match(/hsl\((\d+(?:\.\d+)?)/)![1])
    expect(huesIn(a)).toBeGreaterThan(huesIn(b))
    expect(huesIn(b)).toBeGreaterThan(huesIn(c))
  })

  it('returns a neutral grey on non-finite input', () => {
    expect(speedColor(Number.NaN)).toBe('hsl(0 0% 60%)')
  })
})

describe('speedFraction', () => {
  it('returns 0 at rest and 1 at the cap', () => {
    expect(speedFraction(0, 26)).toBe(0)
    expect(speedFraction(26, 26)).toBe(1)
  })

  it('clamps speeds above the cap to 1', () => {
    expect(speedFraction(40, 26)).toBe(1)
  })

  it('returns 0 when the cap is non-positive or non-finite', () => {
    expect(speedFraction(10, 0)).toBe(0)
    expect(speedFraction(10, -1)).toBe(0)
    expect(speedFraction(10, Number.NaN)).toBe(0)
  })

  it('returns 0 on negative or non-finite speeds', () => {
    expect(speedFraction(-1, 26)).toBe(0)
    expect(speedFraction(Number.NaN, 26)).toBe(0)
  })
})

describe('buildLinePath', () => {
  it('returns an empty string for empty input', () => {
    expect(buildLinePath([])).toBe('')
  })

  it('returns a single move command for one point', () => {
    const d = buildLinePath([[1, 2]])
    expect(d).toBe('M1 2')
  })

  it('draws line segments between consecutive points', () => {
    const d = buildLinePath([[0, 0], [10, 5], [20, 10]])
    expect(d).toBe('M0 0 L10 5 L20 10')
  })

  it('skips non-finite samples without breaking the path', () => {
    const d = buildLinePath([[0, 0], [Number.NaN, 5], [10, 10]])
    expect(d).toContain('M0 0')
    expect(d).toContain('L10 10')
    expect(d).not.toContain('NaN')
  })

  it('emits the move command on the first finite point even when leading samples are non-finite', () => {
    const d = buildLinePath([
      [Number.NaN, 0],
      [Number.NaN, 1],
      [5, 6],
      [10, 12],
    ])
    expect(d).toBe('M5 6 L10 12')
    expect(d.startsWith('M')).toBe(true)
  })

  it('returns an empty path when every point is non-finite', () => {
    const d = buildLinePath([
      [Number.NaN, 0],
      [Number.POSITIVE_INFINITY, 1],
    ])
    expect(d).toBe('')
  })

  it('grows monotonically with sample count', () => {
    const a = buildLinePath([[0, 0], [1, 1]])
    const b = buildLinePath([[0, 0], [1, 1], [2, 2]])
    expect(b.length).toBeGreaterThan(a.length)
  })
})

describe('formatSigned', () => {
  it('prefixes positive values with +', () => {
    expect(formatSigned(0.42, 2)).toBe('+0.42')
    expect(formatSigned(1, 2)).toBe('+1.00')
  })

  it('prefixes negative values with -', () => {
    expect(formatSigned(-0.5, 2)).toBe('-0.50')
    expect(formatSigned(-1, 2)).toBe('-1.00')
  })

  it('renders zero without a sign', () => {
    expect(formatSigned(0, 2)).toBe('0.00')
  })

  it('falls back to 0 on non-finite input', () => {
    expect(formatSigned(Number.NaN, 2)).toBe('0')
    expect(formatSigned(Number.POSITIVE_INFINITY, 2)).toBe('0')
  })

  it('honors the digits argument', () => {
    expect(formatSigned(1 / 3, 3)).toBe('+0.333')
    expect(formatSigned(-1 / 3, 4)).toBe('-0.3333')
  })
})

describe('downsampleByStride', () => {
  it('returns 1 when count is at or below maxOut', () => {
    expect(downsampleByStride(0, 600)).toBe(1)
    expect(downsampleByStride(1, 600)).toBe(1)
    expect(downsampleByStride(600, 600)).toBe(1)
  })

  it('returns ceil(count / maxOut) when count exceeds maxOut', () => {
    expect(downsampleByStride(1200, 600)).toBe(2)
    expect(downsampleByStride(601, 600)).toBe(2)
    expect(downsampleByStride(5400, 600)).toBe(9)
    expect(downsampleByStride(5401, 600)).toBe(10)
  })

  it('returns 1 on non-finite or non-positive inputs', () => {
    expect(downsampleByStride(Number.NaN, 600)).toBe(1)
    expect(downsampleByStride(600, Number.NaN)).toBe(1)
    expect(downsampleByStride(-10, 600)).toBe(1)
    expect(downsampleByStride(600, 0)).toBe(1)
  })
})

describe('formatDurationSec', () => {
  it('formats milliseconds as 2-decimal seconds with an s suffix', () => {
    expect(formatDurationSec(1234)).toBe('1.23s')
    expect(formatDurationSec(420)).toBe('0.42s')
  })

  it('collapses non-finite or non-positive input to 0.00s', () => {
    expect(formatDurationSec(0)).toBe('0.00s')
    expect(formatDurationSec(-100)).toBe('0.00s')
    expect(formatDurationSec(Number.NaN)).toBe('0.00s')
    expect(formatDurationSec(Number.POSITIVE_INFINITY)).toBe('0.00s')
  })
})

describe('formatLapTime', () => {
  it('formats sub-minute times with leading zero in seconds', () => {
    expect(formatLapTime(1234)).toBe('0:01.234')
    expect(formatLapTime(45)).toBe('0:00.045')
  })

  it('formats over-a-minute times', () => {
    expect(formatLapTime(64275)).toBe('1:04.275')
    expect(formatLapTime(125000)).toBe('2:05.000')
  })

  it('formats zero', () => {
    expect(formatLapTime(0)).toBe('0:00.000')
  })

  it('rounds fractional milliseconds', () => {
    expect(formatLapTime(999.4)).toBe('0:00.999')
    expect(formatLapTime(999.6)).toBe('0:01.000')
  })

  it('falls back to zero on non-finite or negative input', () => {
    expect(formatLapTime(Number.NaN)).toBe('0:00.000')
    expect(formatLapTime(Number.POSITIVE_INFINITY)).toBe('0:00.000')
    expect(formatLapTime(-1)).toBe('0:00.000')
  })

  it('contains no em-dash or en-dash in any output', () => {
    const EM = String.fromCharCode(0x2014)
    const EN = String.fromCharCode(0x2013)
    const samples = [0, 100, 12345, 60000, 999999]
    for (const ms of samples) {
      const out = formatLapTime(ms)
      expect(out).not.toContain(EM)
      expect(out).not.toContain(EN)
    }
  })
})
