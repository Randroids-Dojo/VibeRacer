import { describe, it, expect } from 'vitest'
import {
  KERB_COLOR_RED,
  KERB_COLOR_WHITE,
  KERB_DEPTH,
  KERB_SEGMENTS_PER_CORNER,
  buildCornerKerbTiles,
  buildTrackKerbTiles,
  countCorners,
} from '@/game/kerbs'
import { CELL_SIZE, TRACK_WIDTH, buildTrackPath } from '@/game/trackPath'
import { DEFAULT_TRACK_PIECES } from '@/lib/defaultTrack'
import type { Piece } from '@/lib/schemas'

const INNER_RADIUS = CELL_SIZE / 2 - TRACK_WIDTH / 2

const SQUARE_OF_RIGHT90s: Piece[] = [
  { type: 'right90', row: 0, col: 0, rotation: 0 },
  { type: 'right90', row: 0, col: 1, rotation: 90 },
  { type: 'right90', row: 1, col: 1, rotation: 180 },
  { type: 'right90', row: 1, col: 0, rotation: 270 },
]

describe('buildCornerKerbTiles', () => {
  it('returns the configured number of tiles for a corner', () => {
    const path = buildTrackPath(DEFAULT_TRACK_PIECES)
    const corner = path.order.find((op) => op.arcCenter !== null)!
    expect(corner).toBeDefined()
    const tiles = buildCornerKerbTiles(corner)
    expect(tiles.length).toBe(KERB_SEGMENTS_PER_CORNER)
  })

  it('returns an empty list for non-corner pieces', () => {
    const path = buildTrackPath(DEFAULT_TRACK_PIECES)
    const straight = path.order.find((op) => op.piece.type === 'straight')!
    expect(straight).toBeDefined()
    expect(buildCornerKerbTiles(straight)).toEqual([])
  })

  it('returns an empty list when segmentCount is invalid', () => {
    const path = buildTrackPath(DEFAULT_TRACK_PIECES)
    const corner = path.order.find((op) => op.arcCenter !== null)!
    expect(buildCornerKerbTiles(corner, 0)).toEqual([])
    expect(buildCornerKerbTiles(corner, -3)).toEqual([])
    expect(buildCornerKerbTiles(corner, Number.NaN)).toEqual([])
    expect(buildCornerKerbTiles(corner, Number.POSITIVE_INFINITY)).toEqual([])
  })

  it('places every tile on the inner-radius arc of the corner', () => {
    const path = buildTrackPath(SQUARE_OF_RIGHT90s)
    for (const op of path.order) {
      const tiles = buildCornerKerbTiles(op)
      const { cx, cz } = op.arcCenter!
      for (const tile of tiles) {
        const r = Math.hypot(tile.x - cx, tile.z - cz)
        expect(r).toBeCloseTo(INNER_RADIUS, 6)
      }
    }
  })

  it('alternates red and white starting with red', () => {
    const path = buildTrackPath(SQUARE_OF_RIGHT90s)
    const tiles = buildCornerKerbTiles(path.order[0])
    expect(tiles[0].colorHex).toBe(KERB_COLOR_RED)
    expect(tiles[1].colorHex).toBe(KERB_COLOR_WHITE)
    expect(tiles[2].colorHex).toBe(KERB_COLOR_RED)
    expect(tiles[tiles.length - 1].colorHex).toBe(
      tiles.length % 2 === 0 ? KERB_COLOR_WHITE : KERB_COLOR_RED,
    )
  })

  it('every tile uses the configured depth', () => {
    const path = buildTrackPath(SQUARE_OF_RIGHT90s)
    const tiles = buildCornerKerbTiles(path.order[0])
    for (const t of tiles) {
      expect(t.depth).toBe(KERB_DEPTH)
    }
  })

  it('tile lengths are positive and sum to roughly the inner-arc length', () => {
    const path = buildTrackPath(SQUARE_OF_RIGHT90s)
    const tiles = buildCornerKerbTiles(path.order[0])
    const totalLen = tiles.reduce((acc, t) => acc + t.length, 0)
    const expectedArc = INNER_RADIUS * (Math.PI / 2)
    expect(totalLen).toBeGreaterThan(0)
    // With KERB_TILE_GAP = 0 the sum should match the inner arc length almost
    // exactly. Allow a small tolerance for any future gap addition.
    expect(Math.abs(totalLen - expectedArc)).toBeLessThan(0.5)
  })

  it('tile rotation aligns with the local arc tangent (length axis)', () => {
    const path = buildTrackPath(SQUARE_OF_RIGHT90s)
    for (const op of path.order) {
      const tiles = buildCornerKerbTiles(op)
      const { cx, cz } = op.arcCenter!
      for (const tile of tiles) {
        // The local +X (length) axis after applying rotationY about world +Y
        // should be perpendicular to the radius vector (since it lies along
        // the tangent of the inner-radius circle).
        const tangentWorldX = Math.cos(tile.rotationY)
        const tangentWorldZ = -Math.sin(tile.rotationY)
        const radiusX = tile.x - cx
        const radiusZ = tile.z - cz
        const dot = tangentWorldX * radiusX + tangentWorldZ * radiusZ
        expect(Math.abs(dot)).toBeLessThan(1e-6)
      }
    }
  })

  it('first tile sits roughly at the entry side and last at the exit side', () => {
    const path = buildTrackPath(SQUARE_OF_RIGHT90s)
    const op = path.order[0]
    const tiles = buildCornerKerbTiles(op)
    // The kerb runs along the inner edge of the corner's arc. The first tile
    // is closer to the entry-edge mid than to the exit-edge mid; the last tile
    // is the reverse. We compute distance to the inner-edge reference points
    // (radius INNER_RADIUS in the entry / exit angular positions).
    const { cx, cz } = op.arcCenter!
    const a1 = Math.atan2(op.entry.z - cz, op.entry.x - cx)
    const a2 = Math.atan2(op.exit.z - cz, op.exit.x - cx)
    const entryInnerX = cx + INNER_RADIUS * Math.cos(a1)
    const entryInnerZ = cz + INNER_RADIUS * Math.sin(a1)
    const exitInnerX = cx + INNER_RADIUS * Math.cos(a2)
    const exitInnerZ = cz + INNER_RADIUS * Math.sin(a2)
    const first = tiles[0]
    const last = tiles[tiles.length - 1]
    const firstToEntry = Math.hypot(first.x - entryInnerX, first.z - entryInnerZ)
    const firstToExit = Math.hypot(first.x - exitInnerX, first.z - exitInnerZ)
    const lastToEntry = Math.hypot(last.x - entryInnerX, last.z - entryInnerZ)
    const lastToExit = Math.hypot(last.x - exitInnerX, last.z - exitInnerZ)
    expect(firstToEntry).toBeLessThan(firstToExit)
    expect(lastToExit).toBeLessThan(lastToEntry)
  })
})

describe('buildTrackKerbTiles', () => {
  it('emits N * KERB_SEGMENTS_PER_CORNER tiles for a track with N corners', () => {
    const path = buildTrackPath(DEFAULT_TRACK_PIECES)
    const tiles = buildTrackKerbTiles(path)
    const corners = path.order.filter((op) => op.arcCenter !== null).length
    expect(tiles.length).toBe(corners * KERB_SEGMENTS_PER_CORNER)
  })

  it('respects a custom segment count', () => {
    const path = buildTrackPath(SQUARE_OF_RIGHT90s)
    const tiles = buildTrackKerbTiles(path, 4)
    expect(tiles.length).toBe(4 * 4)
  })

  it('emits zero tiles for a straight-only track', () => {
    // A 1xN row of straights does not form a closed loop, so we cannot exercise
    // an all-straight closed track. Instead use the helper directly on the
    // ordered pieces: the only corners in the default track are left90 / right90,
    // so filtering them out leaves zero kerb tiles.
    const path = buildTrackPath(DEFAULT_TRACK_PIECES)
    // Synthesize a minimal "track path"-shaped object whose order contains
    // only the straight pieces from the default track.
    const straightsOnly = {
      ...path,
      order: path.order.filter((op) => op.piece.type === 'straight'),
    }
    expect(buildTrackKerbTiles(straightsOnly)).toEqual([])
  })
})

describe('countCorners', () => {
  it('counts left90 and right90 pieces and ignores everything else', () => {
    const path = buildTrackPath(DEFAULT_TRACK_PIECES)
    const expected = path.order.filter(
      (op) => op.piece.type === 'left90' || op.piece.type === 'right90',
    ).length
    expect(countCorners(path)).toBe(expected)
  })

  it('returns 4 for the four-right90 square', () => {
    const path = buildTrackPath(SQUARE_OF_RIGHT90s)
    expect(countCorners(path)).toBe(4)
  })
})
