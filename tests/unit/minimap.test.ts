import { describe, it, expect } from 'vitest'
import {
  MINIMAP_DEFAULT_PADDING,
  MINIMAP_DEFAULT_VIEW_SIZE,
  buildMinimapGeometry,
  computeBounds,
} from '@/game/minimap'
import { buildTrackPath, CELL_SIZE, TRACK_WIDTH } from '@/game/trackPath'
import { DEFAULT_TRACK_PIECES } from '@/lib/defaultTrack'
import type { Piece } from '@/lib/schemas'

describe('computeBounds', () => {
  it('covers every piece center extended by half the track width', () => {
    const path = buildTrackPath(DEFAULT_TRACK_PIECES)
    const bounds = computeBounds(path)
    const half = TRACK_WIDTH / 2
    for (const op of path.order) {
      expect(op.center.x).toBeGreaterThanOrEqual(bounds.minX + half - 1e-6)
      expect(op.center.x).toBeLessThanOrEqual(bounds.maxX - half + 1e-6)
      expect(op.center.z).toBeGreaterThanOrEqual(bounds.minZ + half - 1e-6)
      expect(op.center.z).toBeLessThanOrEqual(bounds.maxZ - half + 1e-6)
    }
  })

  it('expands by half the track width past the centerline extents', () => {
    const path = buildTrackPath(DEFAULT_TRACK_PIECES)
    const bounds = computeBounds(path)
    let centerlineMinX = Infinity
    let centerlineMaxX = -Infinity
    for (const op of path.order) {
      centerlineMinX = Math.min(centerlineMinX, op.entry.x, op.exit.x)
      centerlineMaxX = Math.max(centerlineMaxX, op.entry.x, op.exit.x)
    }
    expect(bounds.minX).toBeLessThanOrEqual(centerlineMinX - TRACK_WIDTH / 2 + 1e-6)
    expect(bounds.maxX).toBeGreaterThanOrEqual(centerlineMaxX + TRACK_WIDTH / 2 - 1e-6)
  })
})

describe('buildMinimapGeometry', () => {
  it('produces one path string per piece', () => {
    const path = buildTrackPath(DEFAULT_TRACK_PIECES)
    const geom = buildMinimapGeometry(path)
    expect(geom.pieces.length).toBe(path.order.length)
    for (const d of geom.pieces) {
      expect(d).toMatch(/^M[-0-9.\s]+( L[-0-9.\s]+)+$/)
    }
  })

  it('keeps every projected point inside the padded view', () => {
    const path = buildTrackPath(DEFAULT_TRACK_PIECES)
    const geom = buildMinimapGeometry(path)
    for (const op of path.order) {
      for (const point of [op.entry, op.exit, op.center]) {
        const v = geom.worldToView(point.x, point.z)
        expect(v.x).toBeGreaterThanOrEqual(0)
        expect(v.x).toBeLessThanOrEqual(geom.viewSize)
        expect(v.y).toBeGreaterThanOrEqual(0)
        expect(v.y).toBeLessThanOrEqual(geom.viewSize)
      }
    }
  })

  it('flips the Z axis so north (smaller Z) renders above south (larger Z)', () => {
    const path = buildTrackPath(DEFAULT_TRACK_PIECES)
    const geom = buildMinimapGeometry(path)
    const north = geom.worldToView(0, 0)
    const south = geom.worldToView(0, CELL_SIZE)
    expect(north.y).toBeLessThan(south.y)
  })

  it('respects the requested view size', () => {
    const path = buildTrackPath(DEFAULT_TRACK_PIECES)
    const geom = buildMinimapGeometry(path, 200, 10)
    expect(geom.viewSize).toBe(200)
    const v = geom.worldToView(path.order[0].center.x, path.order[0].center.z)
    expect(v.x).toBeGreaterThanOrEqual(10)
    expect(v.x).toBeLessThanOrEqual(190)
    expect(v.y).toBeGreaterThanOrEqual(10)
    expect(v.y).toBeLessThanOrEqual(190)
  })

  it('preserves aspect ratio: a wide track centers vertically', () => {
    // A 4-piece line stretched east / west, capped on each end with a U-turn.
    const wide: Piece[] = [
      { type: 'straight', row: 0, col: 0, rotation: 90 },
      { type: 'straight', row: 0, col: 1, rotation: 90 },
      { type: 'left90', row: 0, col: 2, rotation: 0 },
      { type: 'left90', row: 1, col: 2, rotation: 90 },
      { type: 'straight', row: 1, col: 1, rotation: 90 },
      { type: 'straight', row: 1, col: 0, rotation: 90 },
      { type: 'left90', row: 1, col: -1, rotation: 180 },
      { type: 'left90', row: 0, col: -1, rotation: 270 },
    ]
    const path = buildTrackPath(wide)
    const geom = buildMinimapGeometry(path)
    const bounds = geom.bounds
    const wWorld = bounds.maxX - bounds.minX
    const hWorld = bounds.maxZ - bounds.minZ
    expect(wWorld).toBeGreaterThan(hWorld)
    // Horizontal span should hit the inner-area edge and the vertical span
    // should be vertically centered (top + bottom margins are equal).
    const inner = MINIMAP_DEFAULT_VIEW_SIZE - 2 * MINIMAP_DEFAULT_PADDING
    const scale = inner / wWorld
    const usedH = hWorld * scale
    const expectedTopOffset = MINIMAP_DEFAULT_PADDING + (inner - usedH) / 2
    const projectedTop = geom.worldToView(bounds.minX, bounds.minZ)
    expect(Math.abs(projectedTop.y - expectedTopOffset)).toBeLessThan(0.01)
  })

  it('throws on an empty path', () => {
    const fakePath = {
      order: [],
      cellToOrderIdx: new Map<string, number>(),
      spawn: { position: { x: 0, y: 0, z: 0 }, heading: 0 },
      finishLine: { position: { x: 0, y: 0, z: 0 }, heading: 0 },
      cpTriggerPieceIdx: [],
      checkpointMarkers: [],
    }
    expect(() => buildMinimapGeometry(fakePath)).toThrow()
  })
})
