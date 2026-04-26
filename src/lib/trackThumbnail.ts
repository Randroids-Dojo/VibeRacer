// Pure helper that turns a piece array into a small SVG-ready thumbnail
// preview. Intended for the home-page `Load existing track` list and the
// fresh-slug landing fallback so players can recognize a track at a glance
// without loading the full 3D scene.
//
// The thumbnail reuses `buildTrackPath` + `buildMinimapGeometry` for the
// centerline math, then exposes the data needed by `<TrackThumbnail />` to
// render a proportionally-sized SVG (background, road band, optional spawn
// dot). All math is pure so this can run on the server during SSR or in a
// Vitest unit test without touching the DOM.

import type { Piece } from './schemas'
import { buildTrackPath, TRACK_WIDTH } from '@/game/trackPath'
import { buildMinimapGeometry } from '@/game/minimap'

export const THUMBNAIL_DEFAULT_VIEW_SIZE = 64
export const THUMBNAIL_DEFAULT_PADDING = 6
// The road in world units. We map this through the same scale that
// buildMinimapGeometry uses so the road thickness on the thumbnail visually
// matches the actual track-width-to-cell-size ratio of the world.
export const THUMBNAIL_ROAD_WORLD_WIDTH = TRACK_WIDTH

export interface TrackThumbnail {
  // The SVG viewBox edge length. Square so the thumbnail composes nicely on
  // the home page rows.
  viewSize: number
  // SVG path data strings, one per piece, drawing each piece's centerline in
  // view coordinates. Stroke these with `roadStrokeWidth` to render the road.
  pieces: string[]
  // Stroke width (in SVG units) that reproduces the road's actual world
  // thickness at the chosen scale. Scales naturally with track size: a
  // sprawling track shrinks the road on the thumbnail; a tight track keeps
  // the road visually prominent.
  roadStrokeWidth: number
  // Spawn point in view coordinates so callers can draw a small marker at
  // the start of lap 1.
  spawn: { x: number; y: number }
}

export function buildTrackThumbnail(
  pieces: Piece[],
  viewSize: number = THUMBNAIL_DEFAULT_VIEW_SIZE,
  padding: number = THUMBNAIL_DEFAULT_PADDING,
): TrackThumbnail | null {
  if (pieces.length === 0) return null
  let path
  try {
    path = buildTrackPath(pieces)
  } catch {
    return null
  }
  if (path.order.length === 0) return null

  const geom = buildMinimapGeometry(path, viewSize, padding)
  // World-to-view scale: pick from the X axis since buildMinimapGeometry uses
  // a uniform scale on both axes (preserves aspect ratio). Two arbitrary
  // points one world unit apart project to `scale` view units apart.
  const a = geom.worldToView(0, 0)
  const b = geom.worldToView(1, 0)
  const scale = Math.hypot(b.x - a.x, b.y - a.y)
  // Floor at 1 so a tiny sprawling track still draws a visible road. Cap at
  // half the view size so a one-piece track does not paint the whole tile.
  const roadStrokeWidth = clamp(THUMBNAIL_ROAD_WORLD_WIDTH * scale, 1, viewSize / 2)

  const spawnView = geom.worldToView(path.spawn.position.x, path.spawn.position.z)

  return {
    viewSize,
    pieces: geom.pieces,
    roadStrokeWidth,
    spawn: spawnView,
  }
}

function clamp(v: number, lo: number, hi: number): number {
  if (v < lo) return lo
  if (v > hi) return hi
  return v
}
