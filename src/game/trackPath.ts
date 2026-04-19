import type { Piece } from '@/lib/schemas'
import { DIR_OFFSETS, cellKey, connectorsOf, opposite, type Dir } from './track'

export const CELL_SIZE = 20
export const TRACK_WIDTH = 8

export interface Vec3 {
  x: number
  y: number
  z: number
}

export interface OrderedPiece {
  piece: Piece
  entryDir: Dir
  exitDir: Dir
  center: Vec3
  entry: Vec3
  exit: Vec3
  // Populated for corners only: the cell corner where the two open edges meet.
  // The corner centerline lies at distance CELL_SIZE/2 from this point.
  arcCenter: { cx: number; cz: number } | null
}

export interface TrackPath {
  order: OrderedPiece[]
  cellToOrderIdx: Map<string, number>
  spawn: { position: Vec3; heading: number }
  finishLine: { position: Vec3; heading: number }
}

export function cellCenter(row: number, col: number): Vec3 {
  return { x: col * CELL_SIZE, y: 0, z: row * CELL_SIZE }
}

const HALF = CELL_SIZE / 2
const EDGE_OFFSETS: Record<Dir, { dx: number; dz: number }> = {
  0: { dx: 0, dz: -HALF },
  1: { dx: HALF, dz: 0 },
  2: { dx: 0, dz: HALF },
  3: { dx: -HALF, dz: 0 },
}

export function edgeMidpoint(row: number, col: number, dir: Dir): Vec3 {
  const c = cellCenter(row, col)
  const { dx, dz } = EDGE_OFFSETS[dir]
  return { x: c.x + dx, y: 0, z: c.z + dz }
}

// Heading in radians where 0 = +X (east) and increases counter-clockwise around +Y.
// North (-Z) = Math.PI/2, East (+X) = 0, South (+Z) = -Math.PI/2, West (-X) = Math.PI.
const DIR_HEADINGS: Record<Dir, number> = {
  0: Math.PI / 2,
  1: 0,
  2: -Math.PI / 2,
  3: Math.PI,
}

export function dirToHeading(d: Dir): number {
  return DIR_HEADINGS[d]
}

function otherConnector(piece: Piece, entry: Dir): Dir {
  const [a, b] = connectorsOf(piece)
  return entry === a ? b : a
}

function computeArcCenter(
  center: Vec3,
  entryDir: Dir,
  exitDir: Dir,
): { cx: number; cz: number } {
  const e1 = EDGE_OFFSETS[entryDir]
  const e2 = EDGE_OFFSETS[exitDir]
  return { cx: center.x + e1.dx + e2.dx, cz: center.z + e1.dz + e2.dz }
}

export function buildTrackPath(pieces: Piece[]): TrackPath {
  if (pieces.length === 0) {
    throw new Error('empty pieces')
  }

  const byCell = new Map<string, Piece>()
  for (const p of pieces) byCell.set(cellKey(p.row, p.col), p)

  const first = pieces[0]
  const [connA, connB] = connectorsOf(first)
  let entryDir: Dir = connA
  let exitDir: Dir = connB
  let current = first

  const order: OrderedPiece[] = []
  const seen = new Set<string>()

  while (order.length < pieces.length) {
    const key = cellKey(current.row, current.col)
    if (seen.has(key)) break
    seen.add(key)
    const center = cellCenter(current.row, current.col)
    const isCorner = current.type !== 'straight'
    order.push({
      piece: current,
      entryDir,
      exitDir,
      center,
      entry: edgeMidpoint(current.row, current.col, entryDir),
      exit: edgeMidpoint(current.row, current.col, exitDir),
      arcCenter: isCorner ? computeArcCenter(center, entryDir, exitDir) : null,
    })

    const { dr, dc } = DIR_OFFSETS[exitDir]
    const nextKey = cellKey(current.row + dr, current.col + dc)
    const next = byCell.get(nextKey)
    if (!next) break
    const nextEntry = opposite(exitDir)
    const nextExit = otherConnector(next, nextEntry)
    current = next
    entryDir = nextEntry
    exitDir = nextExit
  }

  const cellToOrderIdx = new Map<string, number>()
  for (let i = 0; i < order.length; i++) {
    const p = order[i].piece
    cellToOrderIdx.set(cellKey(p.row, p.col), i)
  }

  // Walk inward along the centerline (arc for corners, straight for straights)
  // so spawn and stripe both land on-track even when the start piece is a turn.
  const SPAWN_INSET = 2
  const FINISH_LINE_INSET = 5
  const spawn = pointAlongStartPiece(order[0], SPAWN_INSET)
  const finishLine = pointAlongStartPiece(order[0], FINISH_LINE_INSET)

  return { order, cellToOrderIdx, spawn, finishLine }
}

function pointAlongStartPiece(
  first: OrderedPiece,
  arcLength: number,
): { position: Vec3; heading: number } {
  if (first.arcCenter === null) {
    const travelDir = opposite(first.entryDir)
    const d = DIR_OFFSETS[travelDir]
    return {
      position: {
        x: first.entry.x + arcLength * d.dc,
        y: 0,
        z: first.entry.z + arcLength * d.dr,
      },
      heading: dirToHeading(travelDir),
    }
  }
  const { cx, cz } = first.arcCenter
  const a1 = Math.atan2(first.entry.z - cz, first.entry.x - cx)
  const a2 = Math.atan2(first.exit.z - cz, first.exit.x - cx)
  let delta = a2 - a1
  while (delta > Math.PI) delta -= 2 * Math.PI
  while (delta < -Math.PI) delta += 2 * Math.PI
  const sign = delta >= 0 ? 1 : -1
  const a = a1 + (sign * arcLength) / HALF
  const position: Vec3 = {
    x: cx + HALF * Math.cos(a),
    y: 0,
    z: cz + HALF * Math.sin(a),
  }
  // Tangent along direction of travel: radius rotated 90 degrees toward the exit.
  const tx = sign * -Math.sin(a)
  const tz = sign * Math.cos(a)
  return { position, heading: Math.atan2(-tz, tx) }
}

export function worldToCell(x: number, z: number): { row: number; col: number } {
  return {
    row: Math.round(z / CELL_SIZE),
    col: Math.round(x / CELL_SIZE),
  }
}

// Closest-point distance from (x,z) to the piece centerline. Called once per frame.
export function distanceToCenterline(
  op: OrderedPiece,
  x: number,
  z: number,
): number {
  if (op.arcCenter === null) {
    return distanceToSegment(op.entry, op.exit, x, z)
  }
  const { cx, cz } = op.arcCenter
  return Math.abs(Math.hypot(x - cx, z - cz) - HALF)
}

function distanceToSegment(a: Vec3, b: Vec3, x: number, z: number): number {
  const dx = b.x - a.x
  const dz = b.z - a.z
  const len2 = dx * dx + dz * dz
  if (len2 === 0) return Math.hypot(x - a.x, z - a.z)
  let t = ((x - a.x) * dx + (z - a.z) * dz) / len2
  t = Math.max(0, Math.min(1, t))
  const px = a.x + t * dx
  const pz = a.z + t * dz
  return Math.hypot(x - px, z - pz)
}
