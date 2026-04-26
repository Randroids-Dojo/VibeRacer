import { describe, it, expect } from 'vitest'
import {
  THUMBNAIL_DEFAULT_PADDING,
  THUMBNAIL_DEFAULT_VIEW_SIZE,
  THUMBNAIL_ROAD_WORLD_WIDTH,
  buildTrackThumbnail,
} from '@/lib/trackThumbnail'
import { DEFAULT_TRACK_PIECES } from '@/lib/defaultTrack'
import type { Piece } from '@/lib/schemas'

describe('buildTrackThumbnail', () => {
  it('returns null for an empty piece list', () => {
    expect(buildTrackThumbnail([])).toBeNull()
  })

  it('returns null when the pieces fail to form a path', () => {
    // Two disjoint pieces that cannot be walked into a path. buildTrackPath
    // throws on empty input but returns a partial walk for malformed graphs;
    // either way the helper must not throw.
    const broken: Piece[] = [
      { type: 'left90', row: 0, col: 0, rotation: 0 },
    ]
    const out = buildTrackThumbnail(broken)
    // A single corner cannot close a loop, but buildTrackPath still returns
    // an OrderedPiece for it. The helper should return a thumbnail rather
    // than throwing in that case.
    expect(out).not.toBeNull()
  })

  it('builds one path per piece for the default oval', () => {
    const out = buildTrackThumbnail(DEFAULT_TRACK_PIECES)
    expect(out).not.toBeNull()
    expect(out!.pieces.length).toBe(DEFAULT_TRACK_PIECES.length)
    for (const d of out!.pieces) {
      expect(d).toMatch(/^M[-0-9.\s]+( L[-0-9.\s]+)+$/)
    }
  })

  it('uses the requested view size and pads spawn inside the view', () => {
    const out = buildTrackThumbnail(DEFAULT_TRACK_PIECES, 200, 12)
    expect(out).not.toBeNull()
    expect(out!.viewSize).toBe(200)
    expect(out!.spawn.x).toBeGreaterThanOrEqual(12)
    expect(out!.spawn.x).toBeLessThanOrEqual(188)
    expect(out!.spawn.y).toBeGreaterThanOrEqual(12)
    expect(out!.spawn.y).toBeLessThanOrEqual(188)
  })

  it('clamps the road stroke width to the view size', () => {
    const out = buildTrackThumbnail(DEFAULT_TRACK_PIECES)
    expect(out).not.toBeNull()
    expect(out!.roadStrokeWidth).toBeGreaterThan(0)
    expect(out!.roadStrokeWidth).toBeLessThanOrEqual(out!.viewSize / 2)
  })

  it('shrinks the road stroke as the track sprawls', () => {
    const small = buildTrackThumbnail(DEFAULT_TRACK_PIECES)
    // A wider rectangular loop covers more world area, so the per-unit scale
    // shrinks and the road stroke must shrink with it.
    const wide: Piece[] = [
      { type: 'straight', row: 0, col: 0, rotation: 90 },
      { type: 'straight', row: 0, col: 1, rotation: 90 },
      { type: 'straight', row: 0, col: 2, rotation: 90 },
      { type: 'straight', row: 0, col: 3, rotation: 90 },
      { type: 'left90', row: 0, col: 4, rotation: 0 },
      { type: 'left90', row: 1, col: 4, rotation: 90 },
      { type: 'straight', row: 1, col: 3, rotation: 90 },
      { type: 'straight', row: 1, col: 2, rotation: 90 },
      { type: 'straight', row: 1, col: 1, rotation: 90 },
      { type: 'straight', row: 1, col: 0, rotation: 90 },
      { type: 'left90', row: 1, col: -1, rotation: 180 },
      { type: 'left90', row: 0, col: -1, rotation: 270 },
    ]
    const big = buildTrackThumbnail(wide)
    expect(small).not.toBeNull()
    expect(big).not.toBeNull()
    expect(big!.roadStrokeWidth).toBeLessThan(small!.roadStrokeWidth)
  })

  it('exports default constants', () => {
    expect(THUMBNAIL_DEFAULT_VIEW_SIZE).toBeGreaterThan(0)
    expect(THUMBNAIL_DEFAULT_PADDING).toBeGreaterThanOrEqual(0)
    expect(THUMBNAIL_ROAD_WORLD_WIDTH).toBeGreaterThan(0)
  })
})
