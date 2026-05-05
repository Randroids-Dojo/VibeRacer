import { describe, expect, it } from 'vitest'
import {
  SchemaTooNewError,
  assertSchemaVersionSupported,
  convertV1Piece,
  convertV1Pieces,
  convertV1Track,
  deriveTransformFromCells,
} from '@/lib/trackVersion'
import type { Piece, TrackVersion } from '@/lib/schemas'
import { MAX_SCHEMA_VERSION, TrackVersionSchema } from '@/lib/schemas'
import { CELL_SIZE } from '@/game/trackPath'
import { connectorPortsOf, validateClosedLoop } from '@/game/track'
import { frameOfPort, framesConnect } from '@/game/pieceFrames'

describe('deriveTransformFromCells', () => {
  it('projects (row, col, rotation) to the documented world transform', () => {
    expect(
      deriveTransformFromCells({ row: 3, col: 5, rotation: 90 }),
    ).toEqual({
      x: 5 * CELL_SIZE,
      z: 3 * CELL_SIZE,
      theta: Math.PI / 2,
    })
  })

  it('projects rotation 270 to 3*PI/2', () => {
    expect(
      deriveTransformFromCells({ row: 0, col: 0, rotation: 270 }).theta,
    ).toBeCloseTo((3 * Math.PI) / 2, 12)
  })
})

describe('convertV1Piece', () => {
  it('populates transform when missing', () => {
    const out = convertV1Piece({
      type: 'straight',
      row: 2,
      col: 4,
      rotation: 90,
    })
    expect(out.transform).toEqual({
      x: 4 * CELL_SIZE,
      z: 2 * CELL_SIZE,
      theta: Math.PI / 2,
    })
  })

  it('is idempotent on already-converted pieces', () => {
    const once = convertV1Piece({
      type: 'straight',
      row: 1,
      col: 1,
      rotation: 0,
    })
    const twice = convertV1Piece(once)
    expect(twice).toBe(once)
  })

  it('does not overwrite a pre-set transform', () => {
    const piece: Piece = {
      type: 'straight',
      row: 0,
      col: 0,
      rotation: 0,
      transform: { x: 99, z: -7, theta: 0.25 },
    }
    expect(convertV1Piece(piece).transform).toEqual({
      x: 99,
      z: -7,
      theta: 0.25,
    })
  })

  it('treats transform as authoritative and re-derives (row, col, rotation) when v1-projectable', () => {
    // A v2 wire payload could carry a transform that disagrees with the
    // legacy (row, col, rotation) fields (the schema does not couple them).
    // For v1-projectable transforms the converter projects cells back from
    // transform so the validator, sort key, sample paths, and canonical
    // emit can never disagree on world geometry.
    const piece: Piece = {
      type: 'straight',
      row: 0,
      col: 0,
      rotation: 0,
      transform: { x: 5 * CELL_SIZE, z: 3 * CELL_SIZE, theta: Math.PI / 2 },
    }
    const out = convertV1Piece(piece)
    expect(out.row).toBe(3)
    expect(out.col).toBe(5)
    expect(out.rotation).toBe(90)
    expect(out.transform).toEqual({
      x: 5 * CELL_SIZE,
      z: 3 * CELL_SIZE,
      theta: Math.PI / 2,
    })
  })

  it('leaves (row, col, rotation) untouched for non-v1-projectable transforms', () => {
    const piece: Piece = {
      type: 'straight',
      row: 0,
      col: 0,
      rotation: 0,
      transform: { x: 0, z: 0, theta: (14 * Math.PI) / 180 },
    }
    const out = convertV1Piece(piece)
    expect(out.row).toBe(0)
    expect(out.col).toBe(0)
    expect(out.rotation).toBe(0)
    expect(out.transform).toEqual({ x: 0, z: 0, theta: (14 * Math.PI) / 180 })
  })
})

describe('convertV1Pieces and convertV1Track', () => {
  it('returns the same array length', () => {
    const out = convertV1Pieces([
      { type: 'straight', row: 0, col: 0, rotation: 0 },
      { type: 'left90', row: 1, col: 1, rotation: 90 },
    ])
    expect(out).toHaveLength(2)
    expect(out[0].transform).toBeDefined()
    expect(out[1].transform).toBeDefined()
  })

  it('preserves all non-piece TrackVersion fields', () => {
    const parsed: TrackVersion = {
      pieces: [{ type: 'straight', row: 0, col: 0, rotation: 0 }],
      createdByRacerId: '00000000-0000-0000-0000-000000000000',
      createdAt: '2026-05-04T00:00:00.000Z',
    }
    const out = convertV1Track(parsed)
    expect(out.createdByRacerId).toBe(parsed.createdByRacerId)
    expect(out.createdAt).toBe(parsed.createdAt)
    expect(out.pieces[0].transform).toBeDefined()
  })
})

describe('assertSchemaVersionSupported', () => {
  it('passes when schemaVersion is missing (v1)', () => {
    expect(() => assertSchemaVersionSupported({})).not.toThrow()
  })

  it('passes when schemaVersion equals MAX_SCHEMA_VERSION', () => {
    expect(() =>
      assertSchemaVersionSupported({ schemaVersion: MAX_SCHEMA_VERSION }),
    ).not.toThrow()
  })

  it('throws SchemaTooNewError when schemaVersion exceeds the supported max', () => {
    expect(() =>
      assertSchemaVersionSupported({ schemaVersion: MAX_SCHEMA_VERSION + 1 }),
    ).toThrow(SchemaTooNewError)
  })

  it('is reachable through TrackVersionSchema parse (gate is the source of truth, not the literal union)', () => {
    // Pinning schemaVersion to a literal union of 1 / 2 would short-circuit
    // the gate at parse time and force MAX_SCHEMA_VERSION to be edited in
    // two places on every bump. The schema accepts any positive int and
    // assertSchemaVersionSupported is the one place that decides what is
    // supported.
    const future = TrackVersionSchema.safeParse({
      pieces: [{ type: 'straight', row: 0, col: 0, rotation: 0 }],
      createdByRacerId: '00000000-0000-0000-0000-000000000000',
      createdAt: '2026-05-04T00:00:00.000Z',
      schemaVersion: MAX_SCHEMA_VERSION + 5,
    })
    expect(future.success).toBe(true)
    if (!future.success) return
    expect(() => assertSchemaVersionSupported(future.data)).toThrow(
      SchemaTooNewError,
    )
  })

  it('rejects non-integer schemaVersion at the schema layer', () => {
    const parsed = TrackVersionSchema.safeParse({
      pieces: [{ type: 'straight', row: 0, col: 0, rotation: 0 }],
      createdByRacerId: '00000000-0000-0000-0000-000000000000',
      createdAt: '2026-05-04T00:00:00.000Z',
      schemaVersion: 1.5,
    })
    expect(parsed.success).toBe(false)
  })
})

describe('PieceTransformSchema rejects non-finite components', () => {
  // NaN, Infinity, and -Infinity slip past epsilon comparisons in
  // isV1Projectable (because `NaN > epsilon` is false), which would let a
  // malformed payload produce unstable canonical JSON or runtime crashes.
  // The schema layer is the single canonical guard.
  it('rejects NaN x', () => {
    const parsed = TrackVersionSchema.safeParse({
      pieces: [
        {
          type: 'straight',
          row: 0,
          col: 0,
          rotation: 0,
          transform: { x: Number.NaN, z: 0, theta: 0 },
        },
      ],
      createdByRacerId: '00000000-0000-0000-0000-000000000000',
      createdAt: '2026-05-04T00:00:00.000Z',
    })
    expect(parsed.success).toBe(false)
  })

  it('rejects Infinity theta', () => {
    const parsed = TrackVersionSchema.safeParse({
      pieces: [
        {
          type: 'straight',
          row: 0,
          col: 0,
          rotation: 0,
          transform: { x: 0, z: 0, theta: Number.POSITIVE_INFINITY },
        },
      ],
      createdByRacerId: '00000000-0000-0000-0000-000000000000',
      createdAt: '2026-05-04T00:00:00.000Z',
    })
    expect(parsed.success).toBe(false)
  })
})

describe('long-chain round-trip drift', () => {
  // Stage 1 contract pin: the 60-piece rectangle tested in track.test.ts must
  // continue to report exact zero drift after every piece's transform
  // round-trips through the v1 to v2 converter. This is the same closure test
  // moved into the trackVersion module so the converter itself is what
  // guarantees bit-for-bit identity. If the converter ever introduces any
  // numerical noise, this test fails alongside the track.test.ts test.
  it('cell-aligned chain has zero join drift after the converter runs', () => {
    const v1: Piece[] = []
    for (let c = 1; c <= 28; c++) {
      v1.push({ type: 'straight', row: 0, col: c, rotation: 90 })
    }
    v1.push({ type: 'right90', row: 0, col: 29, rotation: 90 })
    v1.push({ type: 'straight', row: 1, col: 29, rotation: 0 })
    v1.push({ type: 'right90', row: 2, col: 29, rotation: 180 })
    for (let c = 28; c >= 1; c--) {
      v1.push({ type: 'straight', row: 2, col: c, rotation: 90 })
    }
    v1.push({ type: 'right90', row: 2, col: 0, rotation: 270 })
    v1.push({ type: 'straight', row: 1, col: 0, rotation: 0 })
    v1.push({ type: 'right90', row: 0, col: 0, rotation: 0 })

    const converted = convertV1Pieces(v1)
    expect(validateClosedLoop(converted).ok).toBe(true)

    let maxJoinDistance = 0
    let maxTangentDelta = 0
    for (const piece of converted) {
      for (const port of connectorPortsOf(piece)) {
        const myFrame = frameOfPort(piece, port)
        let matched: { x: number; z: number; theta: number } | null = null
        for (const candidate of converted) {
          if (candidate === piece) continue
          for (const candidatePort of connectorPortsOf(candidate)) {
            const cf = frameOfPort(candidate, candidatePort)
            if (framesConnect(myFrame, cf)) {
              matched = cf
              break
            }
          }
          if (matched) break
        }
        expect(matched).not.toBeNull()
        const distance = Math.hypot(
          myFrame.x - matched!.x,
          myFrame.z - matched!.z,
        )
        let dt = myFrame.theta - matched!.theta - Math.PI
        while (dt > Math.PI) dt -= 2 * Math.PI
        while (dt < -Math.PI) dt += 2 * Math.PI
        if (distance > maxJoinDistance) maxJoinDistance = distance
        if (Math.abs(dt) > maxTangentDelta) maxTangentDelta = Math.abs(dt)
      }
    }
    expect(maxJoinDistance).toBe(0)
    expect(maxTangentDelta).toBe(0)
  })
})
