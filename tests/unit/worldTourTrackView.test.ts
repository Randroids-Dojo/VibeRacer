import { describe, it, expect } from 'vitest'
import { buildAiTrackView } from '@/game/worldTourTrackView'
import { buildRail } from '@/game/worldTourRail'
import { buildTrackPath } from '@/game/trackPath'
import { getTrackTemplate } from '@/game/trackTemplates'
import { DEFAULT_TRACK_WIDTH } from '@/game/trackWidth'

function railFor(templateId: string) {
  const template = getTrackTemplate(templateId)
  if (!template) throw new Error(`unknown template ${templateId}`)
  return buildRail(buildTrackPath(template.pieces))
}

describe('buildAiTrackView', () => {
  it('returns the documented road half-width', () => {
    const rail = railFor('top-gear-opener')
    const view = buildAiTrackView(rail)
    expect(view.roadHalfWidth).toBe(DEFAULT_TRACK_WIDTH / 2)
  })

  it('falls back to a flat-straight view on a degenerate rail', () => {
    const view = buildAiTrackView({
      samples: [],
      cumulative: [],
      totalLength: 0,
    })
    expect(view.centerXAt(0)).toBe(0)
    expect(view.curveAt(0)).toBe(0)
    expect(view.roadHalfWidth).toBe(DEFAULT_TRACK_WIDTH / 2)
  })

  it('produces a near-zero curve somewhere on the loop (the long straights)', () => {
    const rail = railFor('top-gear-opener')
    const view = buildAiTrackView(rail)
    let minAbs = Infinity
    const step = Math.max(1, Math.floor(rail.totalLength / 80))
    for (let d = 0; d < rail.totalLength; d += step) {
      const c = Math.abs(view.curveAt(d))
      if (c < minAbs) minAbs = c
    }
    expect(minAbs).toBeLessThan(0.1)
  })

  it('produces a non-zero curve inside an authored sweep', () => {
    const rail = railFor('top-gear-opener')
    const view = buildAiTrackView(rail)
    let maxAbs = 0
    const step = Math.max(1, Math.floor(rail.totalLength / 80))
    for (let d = 0; d < rail.totalLength; d += step) {
      const c = Math.abs(view.curveAt(d))
      if (c > maxAbs) maxAbs = c
    }
    // Top-gear-opener has four right-handers; some part of the loop
    // must register as a real corner.
    expect(maxAbs).toBeGreaterThan(0.4)
  })

  it('wraps progress across the seam without discontinuity', () => {
    const rail = railFor('top-gear-opener')
    const view = buildAiTrackView(rail)
    const beforeSeam = view.centerXAt(rail.totalLength - 0.01)
    const afterSeam = view.centerXAt(0.01)
    // Half a centimeter on either side of the loop seam should land on
    // nearly the same world x as the start line.
    expect(Math.abs(beforeSeam - afterSeam)).toBeLessThan(0.5)
  })

  it('exposes a centerlineAt pose that matches centerXAt and curls through the loop', () => {
    const rail = railFor('top-gear-opener')
    const view = buildAiTrackView(rail)
    const start = view.centerlineAt?.(0)
    expect(start).toBeTruthy()
    expect(start!.x).toBeCloseTo(view.centerXAt(0), 6)
    // The full loop heading must rotate through approximately +/- 2 PI
    // because the track is closed.
    let totalTurn = 0
    let prev = view.centerlineAt!(0).heading
    const step = Math.max(0.5, rail.totalLength / 200)
    for (let d = step; d <= rail.totalLength; d += step) {
      const here = view.centerlineAt!(d).heading
      let delta = here - prev
      if (delta > Math.PI) delta -= 2 * Math.PI
      if (delta < -Math.PI) delta += 2 * Math.PI
      totalTurn += delta
      prev = here
    }
    expect(Math.abs(totalTurn)).toBeGreaterThan(Math.PI)
  })
})
