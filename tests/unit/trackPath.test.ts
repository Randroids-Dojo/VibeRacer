import { describe, it, expect } from 'vitest'
import { opposite, validateClosedLoop } from '@/game/track'
import {
  CELL_SIZE,
  ARC45_SAMPLE_COUNT,
  DIAGONAL_SAMPLE_COUNT,
  HAIRPIN_SAMPLE_COUNT,
  MEGA_SWEEP_SAMPLE_COUNT,
  SCURVE_ARC_RADIUS,
  TRACK_WIDTH,
  buildTrackPath,
  computeCpTriggerPieceIdx,
  distanceToCenterline,
  samplePieceAt,
  sampleArc45Local,
  sampleArc45LeftLocal,
  sampleDiagonalLocal,
  sampleFlexStraightLocal,
  sampleHairpinLocal,
  sampleMegaSweepLeftLocal,
  sampleMegaSweepRightLocal,
  sampleScurveLeftLocal,
  sampleScurveLocal,
  sampleSweepLeftLocal,
  sampleSweepRightLocal,
} from '@/game/trackPath'
import { DEFAULT_TRACK_PIECES } from '@/lib/defaultTrack'
import type { Piece } from '@/lib/schemas'

describe('DEFAULT_TRACK_PIECES', () => {
  it('forms a valid closed loop', () => {
    expect(validateClosedLoop(DEFAULT_TRACK_PIECES).ok).toBe(true)
  })
})

describe('buildTrackPath', () => {
  it('orders every piece exactly once', () => {
    const path = buildTrackPath(DEFAULT_TRACK_PIECES)
    expect(path.order.length).toBe(DEFAULT_TRACK_PIECES.length)
    const cells = new Set(path.order.map((o) => `${o.piece.row},${o.piece.col}`))
    expect(cells.size).toBe(DEFAULT_TRACK_PIECES.length)
  })

  it('neighboring pieces share opposite connectors', () => {
    const path = buildTrackPath(DEFAULT_TRACK_PIECES)
    for (let i = 0; i < path.order.length; i++) {
      const cur = path.order[i]
      const next = path.order[(i + 1) % path.order.length]
      expect(next.entryDir).toBe(opposite(cur.exitDir))
    }
  })

  it('spawn stays inside piece 0 and on the centerline for a straight start', () => {
    const path = buildTrackPath(DEFAULT_TRACK_PIECES)
    const first = path.order[0]
    expect(first.piece.type).toBe('straight')
    expect(distanceToCenterline(first, path.spawn.position.x, path.spawn.position.z))
      .toBeLessThan(0.01)
    const cellX = first.piece.col * CELL_SIZE
    const cellZ = first.piece.row * CELL_SIZE
    expect(Math.abs(path.spawn.position.x - cellX)).toBeLessThanOrEqual(CELL_SIZE / 2)
    expect(Math.abs(path.spawn.position.z - cellZ)).toBeLessThanOrEqual(CELL_SIZE / 2)
  })

  it('spawn and finish line both sit on the arc when piece 0 is a corner', () => {
    // A minimal closed loop whose first piece is a right90: square of four right90s.
    const squarePieces: Piece[] = [
      { type: 'right90', row: 0, col: 0, rotation: 0 },
      { type: 'right90', row: 0, col: 1, rotation: 90 },
      { type: 'right90', row: 1, col: 1, rotation: 180 },
      { type: 'right90', row: 1, col: 0, rotation: 270 },
    ]
    expect(validateClosedLoop(squarePieces).ok).toBe(true)
    const path = buildTrackPath(squarePieces)
    const first = path.order[0]
    expect(first.piece.type).toBe('right90')
    expect(
      distanceToCenterline(first, path.spawn.position.x, path.spawn.position.z),
    ).toBeLessThan(0.01)
    expect(
      distanceToCenterline(
        first,
        path.finishLine.position.x,
        path.finishLine.position.z,
      ),
    ).toBeLessThan(0.01)
    // Finish line heading differs from spawn heading because the arc tangent
    // has rotated between inset 2 and inset 5.
    expect(path.finishLine.heading).not.toBeCloseTo(path.spawn.heading, 2)
  })

  it('cellToOrderIdx covers every piece', () => {
    const path = buildTrackPath(DEFAULT_TRACK_PIECES)
    for (let i = 0; i < path.order.length; i++) {
      const p = path.order[i].piece
      expect(path.cellToOrderIdx.get(`${p.row},${p.col}`)).toBe(i)
    }
  })

  it('exposes current tracks as one closed segment', () => {
    const path = buildTrackPath(DEFAULT_TRACK_PIECES)

    expect(path.segments).toHaveLength(1)
    expect(path.segments[0].id).toBe('main')
    expect(path.segments[0].order).toBe(path.order)
    expect(path.segments[0].closesLoop).toBe(true)
  })

  it('cellToLocators mirrors cellToOrderIdx for single-segment tracks', () => {
    const path = buildTrackPath(DEFAULT_TRACK_PIECES)

    for (let i = 0; i < path.order.length; i++) {
      const p = path.order[i].piece
      const key = `${p.row},${p.col}`
      expect(path.cellToLocators.get(key)).toEqual([{ segmentId: 'main', idx: i }])
    }
  })

  it('centers are one CELL_SIZE apart along the loop', () => {
    const path = buildTrackPath(DEFAULT_TRACK_PIECES)
    for (let i = 0; i < path.order.length; i++) {
      const a = path.order[i].center
      const b = path.order[(i + 1) % path.order.length].center
      const d = Math.hypot(a.x - b.x, a.z - b.z)
      expect(d).toBeCloseTo(CELL_SIZE, 6)
    }
  })
})

describe('OrderedPiece.arcCenter', () => {
  it('corners get arcCenter at the cell corner where the open edges meet', () => {
    const path = buildTrackPath(DEFAULT_TRACK_PIECES)
    const corner = path.order.find((o) => o.piece.type !== 'straight')!
    expect(corner.arcCenter).not.toBeNull()
    const { cx, cz } = corner.arcCenter!
    const dx = Math.abs(cx - corner.center.x)
    const dz = Math.abs(cz - corner.center.z)
    expect(dx).toBeCloseTo(CELL_SIZE / 2, 6)
    expect(dz).toBeCloseTo(CELL_SIZE / 2, 6)
  })

  it('straights have arcCenter null', () => {
    const path = buildTrackPath(DEFAULT_TRACK_PIECES)
    const straight = path.order.find((o) => o.piece.type === 'straight')!
    expect(straight.arcCenter).toBeNull()
  })
})

describe('S-curve piece', () => {
  // 3x2 stadium-style loop where the bottom straight is swapped for an
  // S-curve. The connectors of an S-curve match a straight's at the same
  // rotation so the loop still closes.
  const scurveLoop: Piece[] = [
    { type: 'right90', row: 0, col: 0, rotation: 0 },
    { type: 'straight', row: 0, col: 1, rotation: 90 },
    { type: 'right90', row: 0, col: 2, rotation: 90 },
    { type: 'right90', row: 1, col: 2, rotation: 180 },
    { type: 'scurve', row: 1, col: 1, rotation: 90 },
    { type: 'right90', row: 1, col: 0, rotation: 270 },
  ]

  it('validates as a closed loop when slotted in for a straight', () => {
    expect(validateClosedLoop(scurveLoop)).toEqual({ ok: true })
  })

  it('populates samples on the OrderedPiece', () => {
    const path = buildTrackPath(scurveLoop)
    const op = path.order.find((o) => o.piece.type === 'scurve')!
    expect(op.samples).not.toBeNull()
    expect(op.samples!.length).toBeGreaterThan(8)
    expect(op.arcCenter).toBeNull()
  })

  it('starts on the entry edge and ends on the exit edge after rotation', () => {
    const path = buildTrackPath(scurveLoop)
    const op = path.order.find((o) => o.piece.type === 'scurve')!
    const samples = op.samples!
    const first = samples[0]
    const last = samples[samples.length - 1]
    // Entry/exit midpoints precomputed by buildTrackPath.
    expect(Math.hypot(first.x - op.entry.x, first.z - op.entry.z))
      .toBeLessThan(0.01)
    expect(Math.hypot(last.x - op.exit.x, last.z - op.exit.z))
      .toBeLessThan(0.01)
  })

  it('keeps every sample inside the cell so the road does not poke into a neighbor', () => {
    const path = buildTrackPath(scurveLoop)
    const op = path.order.find((o) => o.piece.type === 'scurve')!
    const half = CELL_SIZE / 2 + 0.001
    for (const s of op.samples!) {
      expect(Math.abs(s.x - op.center.x)).toBeLessThanOrEqual(half)
      expect(Math.abs(s.z - op.center.z)).toBeLessThanOrEqual(half)
    }
  })

  it('local sample peak amplitude matches twice the arc radius', () => {
    // At rotation 0 the path bumps east. The eastmost sample sits at
    // 2 * SCURVE_ARC_RADIUS from the cell center (x = 0). The road's outer
    // edge then lands at 2*r + TRACK_WIDTH/2 = cell edge.
    const local = sampleScurveLocal()
    let maxX = -Infinity
    for (const s of local) {
      if (s.x > maxX) maxX = s.x
    }
    expect(maxX).toBeCloseTo(2 * SCURVE_ARC_RADIUS, 4)
    expect(2 * SCURVE_ARC_RADIUS + TRACK_WIDTH / 2).toBeLessThanOrEqual(
      CELL_SIZE / 2 + 0.001,
    )
  })

  it('distanceToCenterline is near zero at every sampled point', () => {
    const path = buildTrackPath(scurveLoop)
    const op = path.order.find((o) => o.piece.type === 'scurve')!
    for (const s of op.samples!) {
      expect(distanceToCenterline(op, s.x, s.z)).toBeLessThan(0.01)
    }
  })

  it('spawns on the centerline when piece 0 is an S-curve', () => {
    // Reorder the stadium loop so the S-curve at (1, 1) is at index 0. The
    // graph still validates; the path walker starts at the S-curve and the
    // spawn lands inside it.
    const start: Piece[] = [
      { type: 'scurve', row: 1, col: 1, rotation: 90 },
      { type: 'right90', row: 1, col: 2, rotation: 180 },
      { type: 'right90', row: 0, col: 2, rotation: 90 },
      { type: 'straight', row: 0, col: 1, rotation: 90 },
      { type: 'right90', row: 0, col: 0, rotation: 0 },
      { type: 'right90', row: 1, col: 0, rotation: 270 },
    ]
    expect(validateClosedLoop(start)).toEqual({ ok: true })
    const path = buildTrackPath(start)
    const first = path.order[0]
    expect(first.piece.type).toBe('scurve')
    expect(first.samples).not.toBeNull()
    expect(
      distanceToCenterline(first, path.spawn.position.x, path.spawn.position.z),
    ).toBeLessThan(0.05)
  })

  it('samplePieceAt(t=0.5) lands at the bump apex perpendicular to travel', () => {
    const path = buildTrackPath(scurveLoop)
    const op = path.order.find((o) => o.piece.type === 'scurve')!
    const mid = samplePieceAt(op, 0.5)
    // At t=0.5 the chicane is at its bump apex: 2 * SCURVE_ARC_RADIUS units
    // perpendicular to travel from the cell axis. At rotation 90 travel is
    // east-west, so the perpendicular offset shows up along the z axis.
    // Allow a tiny linear-interp slop because samples are spaced.
    const apex = 2 * SCURVE_ARC_RADIUS
    expect(Math.abs(mid.position.x - op.center.x)).toBeLessThan(0.5)
    expect(Math.abs(mid.position.z - op.center.z)).toBeCloseTo(apex, 0)
  })
})

describe('scurveLeft piece (mirror of scurve)', () => {
  // Same stadium loop as the scurve test but with a left-bend chicane in the
  // bottom row. Connectors and rotation are unchanged from the scurve case.
  const scurveLeftLoop: Piece[] = [
    { type: 'right90', row: 0, col: 0, rotation: 0 },
    { type: 'straight', row: 0, col: 1, rotation: 90 },
    { type: 'right90', row: 0, col: 2, rotation: 90 },
    { type: 'right90', row: 1, col: 2, rotation: 180 },
    { type: 'scurveLeft', row: 1, col: 1, rotation: 90 },
    { type: 'right90', row: 1, col: 0, rotation: 270 },
  ]

  it('local samples are an exact mirror of the scurve samples across x = 0', () => {
    const right = sampleScurveLocal()
    const left = sampleScurveLeftLocal()
    expect(left.length).toBe(right.length)
    for (let i = 0; i < right.length; i++) {
      expect(left[i].x).toBeCloseTo(-right[i].x, 6)
      expect(left[i].z).toBeCloseTo(right[i].z, 6)
    }
  })

  it('local sample peak amplitude bumps WEST (negative x) by 2 * arc radius', () => {
    const local = sampleScurveLeftLocal()
    let minX = Infinity
    for (const s of local) {
      if (s.x < minX) minX = s.x
    }
    expect(minX).toBeCloseTo(-2 * SCURVE_ARC_RADIUS, 4)
  })

  it('validates as a closed loop when slotted in for a straight', () => {
    expect(validateClosedLoop(scurveLeftLoop)).toEqual({ ok: true })
  })

  it('populates samples on the OrderedPiece', () => {
    const path = buildTrackPath(scurveLeftLoop)
    const op = path.order.find((o) => o.piece.type === 'scurveLeft')!
    expect(op.samples).not.toBeNull()
    expect(op.samples!.length).toBeGreaterThan(8)
    expect(op.arcCenter).toBeNull()
  })

  it('starts on the entry edge and ends on the exit edge after rotation', () => {
    const path = buildTrackPath(scurveLeftLoop)
    const op = path.order.find((o) => o.piece.type === 'scurveLeft')!
    const samples = op.samples!
    const first = samples[0]
    const last = samples[samples.length - 1]
    expect(Math.hypot(first.x - op.entry.x, first.z - op.entry.z))
      .toBeLessThan(0.01)
    expect(Math.hypot(last.x - op.exit.x, last.z - op.exit.z))
      .toBeLessThan(0.01)
  })

  it('keeps every sample inside the cell', () => {
    const path = buildTrackPath(scurveLeftLoop)
    const op = path.order.find((o) => o.piece.type === 'scurveLeft')!
    const half = CELL_SIZE / 2 + 0.001
    for (const s of op.samples!) {
      expect(Math.abs(s.x - op.center.x)).toBeLessThanOrEqual(half)
      expect(Math.abs(s.z - op.center.z)).toBeLessThanOrEqual(half)
    }
  })

  it('distanceToCenterline is near zero at every sampled point', () => {
    const path = buildTrackPath(scurveLeftLoop)
    const op = path.order.find((o) => o.piece.type === 'scurveLeft')!
    for (const s of op.samples!) {
      expect(distanceToCenterline(op, s.x, s.z)).toBeLessThan(0.01)
    }
  })

  it('samplePieceAt(t=0.5) bumps in the OPPOSITE direction from the right scurve', () => {
    const path = buildTrackPath(scurveLeftLoop)
    const opLeft = path.order.find((o) => o.piece.type === 'scurveLeft')!
    const midLeft = samplePieceAt(opLeft, 0.5)
    // The matching right-bend piece at the same rotation/cell.
    const rightLoop: Piece[] = scurveLeftLoop.map((p) =>
      p.type === 'scurveLeft' ? { ...p, type: 'scurve' as const } : p,
    )
    const opRight = buildTrackPath(rightLoop).order.find(
      (o) => o.piece.type === 'scurve',
    )!
    const midRight = samplePieceAt(opRight, 0.5)
    // Apex is opposite-signed perpendicular to travel; sum should equal twice
    // the cell center coords (i.e., they reflect across the center).
    expect(midLeft.position.x + midRight.position.x).toBeCloseTo(
      2 * opLeft.center.x,
      1,
    )
    expect(midLeft.position.z + midRight.position.z).toBeCloseTo(
      2 * opLeft.center.z,
      1,
    )
  })
})

describe('sweep turn pieces', () => {
  const sweepLoop: Piece[] = [
    { type: 'sweepRight', row: 0, col: 0, rotation: 0 },
    { type: 'right90', row: 0, col: 1, rotation: 90 },
    { type: 'right90', row: 1, col: 1, rotation: 180 },
    { type: 'right90', row: 1, col: 0, rotation: 270 },
  ]

  it('local left sweep samples mirror the right sweep across x = 0', () => {
    const right = sampleSweepRightLocal()
    const left = sampleSweepLeftLocal()
    expect(left.length).toBe(right.length)
    for (let i = 0; i < right.length; i++) {
      expect(left[i].x).toBeCloseTo(-right[i].x, 6)
      expect(left[i].z).toBeCloseTo(right[i].z, 6)
    }
  })

  it('spaces right sweep samples by near-equal arc length', () => {
    const samples = sampleSweepRightLocal()
    const lengths: number[] = []
    for (let i = 1; i < samples.length; i++) {
      lengths.push(
        Math.hypot(
          samples[i].x - samples[i - 1].x,
          samples[i].z - samples[i - 1].z,
        ),
      )
    }
    const average =
      lengths.reduce((sum, length) => sum + length, 0) / lengths.length
    for (const length of lengths) {
      expect(Math.abs(length - average) / average).toBeLessThan(0.04)
    }
  })

  it('forms a valid loop when replacing a sharp right turn', () => {
    expect(validateClosedLoop(sweepLoop)).toEqual({ ok: true })
    const path = buildTrackPath(sweepLoop)
    const op = path.order[0]
    expect(op.piece.type).toBe('sweepRight')
    expect(op.samples).not.toBeNull()
    expect(op.entry).toEqual({ x: 0, y: 0, z: CELL_SIZE / 2 })
    expect(op.exit).toEqual({ x: CELL_SIZE / 2, y: 0, z: 0 })
  })

  it('samples stay inside the sweep cell and preserve a smooth right turn', () => {
    const path = buildTrackPath(sweepLoop)
    const op = path.order[0]
    const samples = op.samples ?? []
    expect(samples.length).toBeGreaterThan(8)
    for (const sample of samples) {
      expect(sample.x).toBeGreaterThanOrEqual(0)
      expect(sample.x).toBeLessThanOrEqual(CELL_SIZE / 2)
      expect(sample.z).toBeGreaterThanOrEqual(0)
      expect(sample.z).toBeLessThanOrEqual(CELL_SIZE / 2)
      expect(distanceToCenterline(op, sample.x, sample.z)).toBeLessThan(0.001)
    }
    expect(samplePieceAt(op, 0).heading).toBeCloseTo(Math.PI / 2, 5)
    expect(samplePieceAt(op, 1).heading).toBeCloseTo(0, 5)
  })
})

describe('mega sweep turn pieces', () => {
  const megaSweepLoop: Piece[] = [
    { type: 'megaSweepRight', row: 0, col: 0, rotation: 0 },
    { type: 'straight', row: 0, col: 1, rotation: 90 },
    { type: 'right90', row: 0, col: 2, rotation: 90 },
    { type: 'straight', row: 1, col: 2, rotation: 0 },
    { type: 'right90', row: 2, col: 2, rotation: 180 },
    { type: 'straight', row: 2, col: 1, rotation: 90 },
    { type: 'right90', row: 2, col: 0, rotation: 270 },
    { type: 'straight', row: 1, col: 0, rotation: 0 },
  ]

  it('local left mega sweep samples mirror the right mega sweep across x = 0', () => {
    const right = sampleMegaSweepRightLocal()
    const left = sampleMegaSweepLeftLocal()
    expect(left.length).toBe(MEGA_SWEEP_SAMPLE_COUNT)
    expect(left.length).toBe(right.length)
    for (let i = 0; i < right.length; i++) {
      expect(left[i].x).toBeCloseTo(-right[i].x, 6)
      expect(left[i].z).toBeCloseTo(right[i].z, 6)
    }
  })

  it('uses more samples and a longer path than the standard sweep', () => {
    const standardLength = polylineLength(sampleSweepRightLocal())
    const megaLength = polylineLength(sampleMegaSweepRightLocal())
    expect(sampleMegaSweepRightLocal().length).toBe(MEGA_SWEEP_SAMPLE_COUNT)
    expect(megaLength).toBeGreaterThan(standardLength * 1.5)
  })

  it('forms a valid loop with connector-neighbor anchors inside its footprint', () => {
    expect(validateClosedLoop(megaSweepLoop)).toEqual({ ok: true })
    const path = buildTrackPath(megaSweepLoop)
    const op = path.order[0]
    expect(op.piece.type).toBe('megaSweepRight')
    expect(op.samples).not.toBeNull()
    expect(op.entry).toEqual({ x: 0, y: 0, z: CELL_SIZE / 2 })
    expect(op.exit).toEqual({ x: CELL_SIZE / 2, y: 0, z: 0 })
  })

  it('keeps samples inside the reserved 3x3 footprint around the anchor', () => {
    const path = buildTrackPath(megaSweepLoop)
    const op = path.order[0]
    const samples = op.samples ?? []
    const halfFootprint = CELL_SIZE * 1.5 + 0.001
    for (const sample of samples) {
      expect(Math.abs(sample.x - op.center.x)).toBeLessThanOrEqual(halfFootprint)
      expect(Math.abs(sample.z - op.center.z)).toBeLessThanOrEqual(halfFootprint)
      expect(distanceToCenterline(op, sample.x, sample.z)).toBeLessThan(0.001)
    }
    expect(samplePieceAt(op, 0).heading).toBeCloseTo(Math.PI / 2, 5)
    expect(samplePieceAt(op, 1).heading).toBeCloseTo(0, 5)
  })
})

describe('hairpin piece', () => {
  const hairpinLoop: Piece[] = [
    { type: 'hairpin', row: 0, col: 0, rotation: 0 },
    { type: 'right90', row: 1, col: -1, rotation: 270 },
    { type: 'straight', row: 0, col: -1, rotation: 0 },
    { type: 'right90', row: -1, col: -1, rotation: 0 },
  ]

  it('spaces local samples by near-equal arc length', () => {
    const samples = sampleHairpinLocal()
    const lengths: number[] = []
    for (let i = 1; i < samples.length; i++) {
      lengths.push(
        Math.hypot(
          samples[i].x - samples[i - 1].x,
          samples[i].z - samples[i - 1].z,
        ),
      )
    }
    const average =
      lengths.reduce((sum, length) => sum + length, 0) / lengths.length
    for (const length of lengths) {
      expect(Math.abs(length - average) / average).toBeLessThan(0.04)
    }
  })

  it('forms a valid loop with connectors on two footprint rows', () => {
    expect(validateClosedLoop(hairpinLoop)).toEqual({ ok: true })
    const path = buildTrackPath(hairpinLoop)
    const op = path.order[0]
    expect(op.piece.type).toBe('hairpin')
    expect(op.samples).not.toBeNull()
    expect(op.samples!.length).toBe(HAIRPIN_SAMPLE_COUNT)
    expect(op.entry).toEqual({ x: -CELL_SIZE / 2, y: 0, z: -CELL_SIZE })
    expect(op.exit).toEqual({ x: -CELL_SIZE / 2, y: 0, z: CELL_SIZE })
  })

  it('keeps samples inside the 2x3 footprint around the anchor', () => {
    const path = buildTrackPath(hairpinLoop)
    const op = path.order[0]
    const samples = op.samples ?? []
    for (const sample of samples) {
      expect(sample.x - op.center.x).toBeGreaterThanOrEqual(-CELL_SIZE / 2 - 0.001)
      expect(sample.x - op.center.x).toBeLessThanOrEqual(CELL_SIZE * 1.5 + 0.001)
      expect(Math.abs(sample.z - op.center.z)).toBeLessThanOrEqual(
        CELL_SIZE + 0.001,
      )
      expect(distanceToCenterline(op, sample.x, sample.z)).toBeLessThan(0.001)
    }
    expect(samplePieceAt(op, 0).heading).toBeCloseTo(0, 5)
    expect(Math.abs(samplePieceAt(op, 1).heading)).toBeCloseTo(Math.PI, 5)
  })
})

describe('45-degree connector pieces', () => {
  const diagonalLoop: Piece[] = [
    { type: 'arc45', row: 0, col: 0, rotation: 0 },
    { type: 'diagonal', row: -1, col: 1, rotation: 0 },
    { type: 'arc45', row: -2, col: 2, rotation: 180 },
    { type: 'left90', row: -3, col: 2, rotation: 0 },
    { type: 'straight', row: -3, col: 1, rotation: 90 },
    { type: 'straight', row: -3, col: 0, rotation: 90 },
    { type: 'left90', row: -3, col: -1, rotation: 270 },
    { type: 'straight', row: -2, col: -1, rotation: 0 },
    { type: 'straight', row: -1, col: -1, rotation: 0 },
    { type: 'straight', row: 0, col: -1, rotation: 0 },
    { type: 'left90', row: 1, col: -1, rotation: 180 },
    { type: 'right90', row: 1, col: 0, rotation: 180 },
  ]

  it('samples an arc from a cardinal connector to a corner connector', () => {
    const samples = sampleArc45Local()
    expect(samples.length).toBe(ARC45_SAMPLE_COUNT)
    expect(samples[0]).toMatchObject({ x: 0, z: CELL_SIZE / 2 })
    expect(samples[samples.length - 1]).toMatchObject({
      x: CELL_SIZE / 2,
      z: -CELL_SIZE / 2,
    })
    expect(samples[0].heading).toBeCloseTo(Math.PI / 2, 5)
    expect(samples[samples.length - 1].heading).toBeCloseTo(Math.PI / 4, 5)
  })

  it('samples a mirrored arc for left-hand diagonal transitions', () => {
    const right = sampleArc45Local()
    const left = sampleArc45LeftLocal()
    expect(left.length).toBe(ARC45_SAMPLE_COUNT)
    for (let i = 0; i < right.length; i++) {
      expect(left[i].x).toBeCloseTo(-right[i].x, 6)
      expect(left[i].z).toBeCloseTo(right[i].z, 6)
    }
    expect(left[0].heading).toBeCloseTo(Math.PI / 2, 5)
    expect(left[left.length - 1].heading).toBeCloseTo(3 * Math.PI / 4, 5)
  })

  it('samples a diagonal across one cell corner-to-corner', () => {
    const samples = sampleDiagonalLocal()
    expect(samples.length).toBe(DIAGONAL_SAMPLE_COUNT)
    expect(samples[0]).toEqual({
      x: -CELL_SIZE / 2,
      z: CELL_SIZE / 2,
      heading: Math.PI / 4,
    })
    expect(samples[samples.length - 1]).toEqual({
      x: CELL_SIZE / 2,
      z: -CELL_SIZE / 2,
      heading: Math.PI / 4,
    })
  })

  it('forms a valid loop bridged by 45 arcs', () => {
    expect(validateClosedLoop(diagonalLoop)).toEqual({ ok: true })
    const path = buildTrackPath(diagonalLoop)
    expect(path.order.map((op) => op.piece.type).slice(0, 3)).toEqual([
      'arc45',
      'diagonal',
      'arc45',
    ])
    expect(path.order[0].samples).not.toBeNull()
    expect(path.order[1].samples).not.toBeNull()
    expect(samplePieceAt(path.order[0], 0).heading).toBeCloseTo(Math.PI / 2, 5)
    expect(samplePieceAt(path.order[0], 1).heading).toBeCloseTo(Math.PI / 4, 5)
    expect(samplePieceAt(path.order[1], 0.5).heading).toBeCloseTo(Math.PI / 4, 5)
  })

  it('rejects a cardinal piece connected directly to a diagonal corner', () => {
    const invalid: Piece[] = [
      { type: 'straight', row: 0, col: 0, rotation: 0 },
      { type: 'diagonal', row: -1, col: 1, rotation: 0 },
    ]
    expect(validateClosedLoop(invalid).ok).toBe(false)
  })

  it('forms a valid loop with left-hand 45 arcs', () => {
    const leftDiagonalLoop: Piece[] = [
      { type: 'arc45Left', row: 0, col: 0, rotation: 0 },
      { type: 'diagonal', row: -1, col: -1, rotation: 90 },
      { type: 'arc45Left', row: -2, col: -2, rotation: 180 },
      { type: 'right90', row: -3, col: -2, rotation: 0 },
      { type: 'straight', row: -3, col: -1, rotation: 90 },
      { type: 'straight', row: -3, col: 0, rotation: 90 },
      { type: 'left90', row: -3, col: 1, rotation: 0 },
      { type: 'straight', row: -2, col: 1, rotation: 0 },
      { type: 'straight', row: -1, col: 1, rotation: 0 },
      { type: 'straight', row: 0, col: 1, rotation: 0 },
      { type: 'right90', row: 1, col: 1, rotation: 180 },
      { type: 'left90', row: 1, col: 0, rotation: 180 },
    ]
    expect(validateClosedLoop(leftDiagonalLoop)).toEqual({ ok: true })
    const path = buildTrackPath(leftDiagonalLoop)
    expect(path.order.map((op) => op.piece.type).slice(0, 3)).toEqual([
      'arc45Left',
      'diagonal',
      'arc45Left',
    ])
  })
})

describe('flex straight piece', () => {
  // Closed 8-piece loop: a 2-cell flex straight forms one column, and a
  // simple cardinal U closes back through the other column. The flex
  // straight's footprint covers cells (0, 1), (1, 1), (2, 1); the loop
  // walks (-1, 1) -> (-1, 0) -> (0..2, 0) -> (3, 0) -> (3, 1) -> flex.
  const flexLoop: Piece[] = [
    {
      type: 'flexStraight',
      row: 2,
      col: 1,
      rotation: 0,
      flex: { dr: -2, dc: 0 },
    },
    { type: 'right90', row: 3, col: 1, rotation: 180 },
    { type: 'right90', row: 3, col: 0, rotation: 270 },
    { type: 'straight', row: 2, col: 0, rotation: 0 },
    { type: 'straight', row: 1, col: 0, rotation: 0 },
    { type: 'straight', row: 0, col: 0, rotation: 0 },
    { type: 'right90', row: -1, col: 0, rotation: 0 },
    { type: 'right90', row: -1, col: 1, rotation: 90 },
  ]

  it('placeholder loop validates with a 2-cell flex straight', () => {
    expect(validateClosedLoop(flexLoop).ok).toBe(true)
  })

  it('produces samples at every requested density', () => {
    const path = buildTrackPath(flexLoop)
    const op = path.order.find((o) => o.piece.type === 'flexStraight')!
    expect(op.samples).not.toBeNull()
    expect(op.samples!.length).toBeGreaterThanOrEqual(8)
  })

  it('first and last samples land on the connector edge midpoints', () => {
    const path = buildTrackPath(flexLoop)
    const op = path.order.find((o) => o.piece.type === 'flexStraight')!
    const first = op.samples![0]
    const last = op.samples![op.samples!.length - 1]
    expect(Math.hypot(first.x - op.entry.x, first.z - op.entry.z))
      .toBeLessThan(0.01)
    expect(Math.hypot(last.x - op.exit.x, last.z - op.exit.z))
      .toBeLessThan(0.01)
  })

  it('every sample sits exactly on the centerline', () => {
    const path = buildTrackPath(flexLoop)
    const op = path.order.find((o) => o.piece.type === 'flexStraight')!
    for (const s of op.samples!) {
      expect(distanceToCenterline(op, s.x, s.z)).toBeLessThan(0.01)
    }
  })

  it('connectors for an angled flex straight stay cardinal', () => {
    // A flex straight with spec dr=-5, dc=2 runs at atan(2/6) ~= 18.43
    // degrees off cardinal (vertical span |dr - 1| = 6 cells, lateral
    // span |dc| = 2 cells). The endpoint connectors are still S and N,
    // so it attaches to existing grid pieces.
    const piece: Piece = {
      type: 'flexStraight',
      row: 0,
      col: 0,
      rotation: 0,
      flex: { dr: -5, dc: 2 },
    }
    expect(opposite(0)).toBe(4)
    const path = buildTrackPath([
      piece,
      { type: 'straight', row: -5, col: 2, rotation: 0 },
      { type: 'left90', row: -6, col: 2, rotation: 0 },
      { type: 'straight', row: -6, col: 1, rotation: 90 },
      { type: 'straight', row: -6, col: 0, rotation: 90 },
      { type: 'left90', row: -6, col: -1, rotation: 270 },
      { type: 'straight', row: -5, col: -1, rotation: 0 },
      { type: 'straight', row: -4, col: -1, rotation: 0 },
      { type: 'straight', row: -3, col: -1, rotation: 0 },
      { type: 'straight', row: -2, col: -1, rotation: 0 },
      { type: 'straight', row: -1, col: -1, rotation: 0 },
      { type: 'straight', row: 0, col: -1, rotation: 0 },
      { type: 'left90', row: 1, col: -1, rotation: 180 },
      { type: 'right90', row: 1, col: 0, rotation: 180 },
    ])
    const op = path.order.find((o) => o.piece.type === 'flexStraight')!
    // The path entered the flex straight from the south edge of (0, 0) and
    // exits through the north edge of (-5, 2). Two connectors, both cardinal.
    expect(op.entryDir % 2).toBe(0)
    expect(op.exitDir % 2).toBe(0)
  })

  it('a steep flex straight delivers a heading off cardinal', () => {
    const piece: Piece = {
      type: 'flexStraight',
      row: 0,
      col: 0,
      rotation: 0,
      flex: { dr: -3, dc: 1 },
    }
    const samples = sampleFlexStraightLocal(piece.flex!)
    const heading = samples[0].heading
    // Cardinal north would be Math.PI / 2; the angled run drifts a few
    // degrees east of north. Check the angle is in the expected NE arc.
    expect(heading).toBeGreaterThan(Math.PI / 4)
    expect(heading).toBeLessThan(Math.PI / 2)
  })
})

describe('TRACK_WIDTH fits inside the cell', () => {
  it('leaves non-zero inner radius for corner annulus', () => {
    expect(CELL_SIZE / 2 - TRACK_WIDTH / 2).toBeGreaterThan(0)
  })
})

function polylineLength(samples: { x: number; z: number }[]): number {
  let total = 0
  for (let i = 1; i < samples.length; i++) {
    total += Math.hypot(
      samples[i].x - samples[i - 1].x,
      samples[i].z - samples[i - 1].z,
    )
  }
  return total
}

describe('computeCpTriggerPieceIdx', () => {
  it('matches one-CP-per-piece when K equals piece count', () => {
    const M = 8
    const idx = computeCpTriggerPieceIdx(M)
    expect(idx).toEqual([1, 2, 3, 4, 5, 6, 7, 0])
  })

  it('distributes 4 CPs evenly across an 8-piece loop', () => {
    expect(computeCpTriggerPieceIdx(8, 4)).toEqual([2, 4, 6, 0])
  })

  it('always lands the final CP on piece 0', () => {
    for (const M of [6, 8, 12, 13]) {
      for (let K = 3; K <= M; K++) {
        const idx = computeCpTriggerPieceIdx(M, K)
        expect(idx.length).toBe(K)
        expect(idx[K - 1]).toBe(0)
      }
    }
  })

  it('keeps intermediate trigger pieces strictly inside the loop', () => {
    for (const M of [6, 8, 12, 13]) {
      for (let K = 3; K < M; K++) {
        const idx = computeCpTriggerPieceIdx(M, K)
        for (let k = 0; k < K - 1; k++) {
          expect(idx[k]).toBeGreaterThan(0)
          expect(idx[k]).toBeLessThan(M)
        }
      }
    }
  })
})

describe('buildTrackPath cpTriggerPieceIdx', () => {
  it('defaults to one CP per piece when checkpointCount is omitted', () => {
    const path = buildTrackPath(DEFAULT_TRACK_PIECES)
    expect(path.cpTriggerPieceIdx.length).toBe(DEFAULT_TRACK_PIECES.length)
  })

  it('honors checkpointCount when supplied', () => {
    const path = buildTrackPath(DEFAULT_TRACK_PIECES, 4)
    expect(path.cpTriggerPieceIdx).toEqual([2, 4, 6, 0])
  })

  it('orders custom checkpoints by path order and finishes at the start', () => {
    const path = buildTrackPath(DEFAULT_TRACK_PIECES, undefined, [
      DEFAULT_TRACK_PIECES[5],
      DEFAULT_TRACK_PIECES[2],
      DEFAULT_TRACK_PIECES[6],
    ])
    expect(path.cpTriggerPieceIdx).toEqual([2, 5, 6, 0])
    expect(path.checkpointMarkers.map((m) => m.cpId)).toEqual([0, 1, 2])
    expect(path.checkpointMarkers.map((m) => m.pieceIdx)).toEqual([2, 5, 6])
  })
})
