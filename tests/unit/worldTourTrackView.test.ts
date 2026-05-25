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
    expect(view.totalLength).toBe(0)
    expect(view.sampleAt(0, 0)).toEqual({ x: 0, z: 0, heading: 0 })
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

  it('sampleAt wraps across the seam without a position jump', () => {
    const rail = railFor('top-gear-opener')
    const view = buildAiTrackView(rail)
    const beforeSeam = view.sampleAt(rail.totalLength - 0.01, 0)
    const afterSeam = view.sampleAt(0.01, 0)
    // Half a centimeter on either side of the loop seam should land on
    // nearly the same world position (the closing chord is short and
    // the rail's first sample is the start line).
    const drift = Math.hypot(
      beforeSeam.x - afterSeam.x,
      beforeSeam.z - afterSeam.z,
    )
    expect(drift).toBeLessThan(0.5)
  })

  it('sampleAt heading on a non-degenerate closing chord is the chord direction (regression: lerpAngle seam)', () => {
    // The seam fix in `worldTourRail.ts` makes the heading along the
    // closing chord equal to atan2 of the chord itself rather than a
    // shortest-arc interpolation of the two endpoint headings. The
    // top-gear-opener loop closes perfectly (last sample == first
    // sample, zero-length chord), so we synthesise a rail where the
    // closing chord is non-trivial and the endpoint headings differ.
    // A car driving the chord follows the chord direction, not the
    // interpolation; the test asserts the heading along the chord
    // is exactly the chord's atan2.
    const samples = [
      { x: 0, z: 0, heading: Math.PI / 2 }, // facing north
      { x: 0, z: -10, heading: Math.PI / 2 }, // still facing north
      { x: 10, z: -10, heading: 0 }, // facing east, 10 m east of sample[1]
    ]
    const cumulative = [0, 10, 20]
    // Closing chord goes from (10, -10) back to (0, 0): chord direction
    // is south-west by atan2(-(0 - -10), 0 - 10) = atan2(-10, -10).
    const closingLen = Math.hypot(10, 10)
    const totalLength = 20 + closingLen
    const synthRail = { samples, cumulative, totalLength }
    const view = buildAiTrackView(synthRail)
    const chordHeading = Math.atan2(-(0 - -10), 0 - 10) // -3PI/4 = south-west
    const at25 = view.sampleAt(20 + closingLen * 0.25, 0)
    const at75 = view.sampleAt(20 + closingLen * 0.75, 0)
    expect(at25.heading).toBeCloseTo(chordHeading, 5)
    expect(at75.heading).toBeCloseTo(chordHeading, 5)
  })

  it('sampleAt accepts a positive lateral offset (right of travel)', () => {
    const rail = railFor('top-gear-opener')
    const view = buildAiTrackView(rail)
    const onCenter = view.sampleAt(50, 0)
    const offRight = view.sampleAt(50, 2)
    // Same arc length but 2 m to the right of travel: the world
    // position must shift by exactly 2 m on the perpendicular
    // (sin h, cos h) per the rail extrusion convention.
    const drift = Math.hypot(offRight.x - onCenter.x, offRight.z - onCenter.z)
    expect(drift).toBeCloseTo(2, 5)
  })

  it('projectToRail and sampleAt round-trip a position on the rail', () => {
    const rail = railFor('top-gear-opener')
    const view = buildAiTrackView(rail)
    // Pick a few arc lengths spread around the loop; sample, project,
    // and confirm the projection returns roughly the same arc length.
    const testArcs = [10, rail.totalLength * 0.25, rail.totalLength * 0.5, rail.totalLength * 0.75]
    for (const arc of testArcs) {
      const pose = view.sampleAt(arc, 0)
      const projected = view.projectToRail!(pose.x, pose.z, arc)
      expect(Math.abs(projected - arc)).toBeLessThan(2)
    }
  })
})
