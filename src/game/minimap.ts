// Pure helpers that turn a TrackPath into geometry suitable for a small
// top-down minimap. Used by `src/components/Minimap.tsx`. Kept in `src/game/`
// alongside the other rendering helpers so the React layer stays a thin shell
// and the math is unit-testable without a DOM.
//
// Coordinate convention. World coordinates use the same +X / +Z plane the 3D
// renderer does (north is -Z, east is +X). For the SVG view we keep +X going
// right and flip the Z axis so north renders up. The output is normalized to
// a square viewBox (default 100x100) with `padding` units of empty space on
// every side so the track outline never clips against the rounded card edge.

import {
  CELL_SIZE,
  type OrderedPiece,
  type TrackPath,
} from './trackPath'
import { halfWidthAt } from './trackWidth'

export const MINIMAP_DEFAULT_VIEW_SIZE = 100
export const MINIMAP_DEFAULT_PADDING = 6
// How finely each curved corner is sampled when we serialize it as an SVG
// polyline. 12 segments per quarter-turn keeps the curve visually smooth
// without exploding the path-string size.
export const MINIMAP_CORNER_SEGMENTS = 12

export interface MinimapBounds {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

export interface MinimapGeometry {
  // The square viewBox `0 0 viewSize viewSize` we recommend for the SVG.
  viewSize: number
  // World-coordinate bounds the track occupies, padded by half the track
  // width so straights and corners both sit comfortably inside.
  bounds: MinimapBounds
  // Pure-SVG path data strings, one per piece, that draw each piece's
  // centerline in view coordinates. Suitable for a `<path d=... />` element.
  pieces: string[]
  // Convert a world point to view coordinates. The minimap component uses
  // this both for the player's dot and the optional ghost dot.
  worldToView(x: number, z: number): { x: number; y: number }
}

interface PiecePolyline {
  // The list of (worldX, worldZ) points the piece's centerline traces, in
  // travel order. Straights produce 2 points; corners produce
  // MINIMAP_CORNER_SEGMENTS + 1 points; sampled pieces (S-curve) reuse their
  // pre-sampled centerline directly.
  points: Array<{ x: number; z: number }>
}

function piecePolyline(op: OrderedPiece): PiecePolyline {
  if (op.samples !== null) {
    return { points: op.samples.map((s) => ({ x: s.x, z: s.z })) }
  }
  if (op.arcCenter === null) {
    return {
      points: [
        { x: op.entry.x, z: op.entry.z },
        { x: op.exit.x, z: op.exit.z },
      ],
    }
  }
  const { cx, cz } = op.arcCenter
  const r = CELL_SIZE / 2
  const a1 = Math.atan2(op.entry.z - cz, op.entry.x - cx)
  const a2 = Math.atan2(op.exit.z - cz, op.exit.x - cx)
  // Sweep through the shorter arc so corners always render correctly even
  // when the heading wraps around the +/-pi boundary.
  let delta = a2 - a1
  while (delta > Math.PI) delta -= 2 * Math.PI
  while (delta < -Math.PI) delta += 2 * Math.PI
  const points: Array<{ x: number; z: number }> = []
  for (let i = 0; i <= MINIMAP_CORNER_SEGMENTS; i++) {
    const t = i / MINIMAP_CORNER_SEGMENTS
    const a = a1 + delta * t
    points.push({ x: cx + r * Math.cos(a), z: cz + r * Math.sin(a) })
  }
  return { points }
}

export function computeBounds(path: TrackPath): MinimapBounds {
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (const op of path.order) {
    const poly = piecePolyline(op)
    for (const p of poly.points) {
      if (p.x < minX) minX = p.x
      if (p.x > maxX) maxX = p.x
      if (p.z < minZ) minZ = p.z
      if (p.z > maxZ) maxZ = p.z
    }
  }
  // Pad by half the track width so the outline never clips a corner that
  // bows out exactly to the cell edge.
  const half = path.order.reduce(
    (max, op) => Math.max(max, halfWidthAt(op, 0.5)),
    0,
  )
  return {
    minX: minX - half,
    maxX: maxX + half,
    minZ: minZ - half,
    maxZ: maxZ + half,
  }
}

// Build the SVG-ready geometry. `viewSize` defines the square viewBox edge in
// SVG units; `padding` is the empty rim (in the same SVG units) that frames
// the track. The world-to-view transform preserves aspect ratio so the track
// never looks stretched on landscape vs portrait tracks.
export function buildMinimapGeometry(
  path: TrackPath,
  viewSize: number = MINIMAP_DEFAULT_VIEW_SIZE,
  padding: number = MINIMAP_DEFAULT_PADDING,
): MinimapGeometry {
  if (path.order.length === 0) {
    throw new Error('minimap: empty track')
  }
  const bounds = computeBounds(path)
  const worldW = Math.max(bounds.maxX - bounds.minX, 1e-6)
  const worldH = Math.max(bounds.maxZ - bounds.minZ, 1e-6)
  const inner = Math.max(viewSize - 2 * padding, 1)
  const scale = Math.min(inner / worldW, inner / worldH)
  // Center the scaled track inside the view so non-square tracks sit in the
  // middle of the card.
  const usedW = worldW * scale
  const usedH = worldH * scale
  const offsetX = padding + (inner - usedW) / 2
  const offsetY = padding + (inner - usedH) / 2

  function worldToView(x: number, z: number): { x: number; y: number } {
    return {
      x: offsetX + (x - bounds.minX) * scale,
      // SVG Y grows downward and world +Z points south (per the renderer's
      // axis convention). Mapping Z directly onto Y keeps north (smaller Z)
      // visually above south (larger Z) without a flip.
      y: offsetY + (z - bounds.minZ) * scale,
    }
  }

  const pieces: string[] = []
  for (const op of path.order) {
    const poly = piecePolyline(op)
    if (poly.points.length === 0) continue
    let d = ''
    for (let i = 0; i < poly.points.length; i++) {
      const v = worldToView(poly.points[i].x, poly.points[i].z)
      d += i === 0 ? `M${fmt(v.x)} ${fmt(v.y)}` : ` L${fmt(v.x)} ${fmt(v.y)}`
    }
    pieces.push(d)
  }

  return { viewSize, bounds, pieces, worldToView }
}

// Trim trailing zeros so the path strings stay short for fast diffs and
// readable test snapshots without losing pixel-meaningful precision.
function fmt(n: number): string {
  return Number.parseFloat(n.toFixed(2)).toString()
}
