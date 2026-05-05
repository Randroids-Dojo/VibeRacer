import type { FlexStraightSpec, Piece } from '@/lib/schemas'
import { DEFAULT_FLEX_STRAIGHT_SPEC } from '@/lib/schemas'
import { cellKey } from './track'

export interface FootprintOffset {
  dr: number
  dc: number
}

export interface FootprintCell {
  row: number
  col: number
}

export const DEFAULT_FOOTPRINT: readonly FootprintOffset[] = [
  { dr: 0, dc: 0 },
]

export const MEGA_SWEEP_RIGHT_FOOTPRINT: readonly FootprintOffset[] = [
  { dr: -1, dc: -1 },
  { dr: -1, dc: 0 },
  { dr: 0, dc: -1 },
  { dr: 0, dc: 0 },
]

export const MEGA_SWEEP_LEFT_FOOTPRINT: readonly FootprintOffset[] = [
  { dr: -1, dc: 0 },
  { dr: -1, dc: 1 },
  { dr: 0, dc: 0 },
  { dr: 0, dc: 1 },
]

export const HAIRPIN_FOOTPRINT: readonly FootprintOffset[] = [
  { dr: -1, dc: 0 },
  { dr: -1, dc: 1 },
  { dr: 0, dc: 0 },
  { dr: 0, dc: 1 },
  { dr: 1, dc: 0 },
  { dr: 1, dc: 1 },
]

export const HAIRPIN_WIDE_FOOTPRINT: readonly FootprintOffset[] = [
  { dr: -1, dc: 0 },
  { dr: -1, dc: 1 },
  { dr: -1, dc: 2 },
  { dr: 0, dc: 0 },
  { dr: 0, dc: 1 },
  { dr: 0, dc: 2 },
  { dr: 1, dc: 0 },
  { dr: 1, dc: 1 },
  { dr: 1, dc: 2 },
]

export const WIDE_ARC45_RIGHT_FOOTPRINT: readonly FootprintOffset[] = [
  { dr: -1, dc: 0 },
  { dr: -1, dc: 1 },
  { dr: 0, dc: 0 },
]

export const WIDE_ARC45_LEFT_FOOTPRINT: readonly FootprintOffset[] = [
  { dr: -1, dc: -1 },
  { dr: -1, dc: 0 },
  { dr: 0, dc: 0 },
]

export const OFFSET_RIGHT_FOOTPRINT: readonly FootprintOffset[] = [
  { dr: -1, dc: 0 },
  { dr: -1, dc: 1 },
  { dr: 0, dc: 0 },
  { dr: 0, dc: 1 },
]

export const OFFSET_LEFT_FOOTPRINT: readonly FootprintOffset[] = [
  { dr: -1, dc: -1 },
  { dr: -1, dc: 0 },
  { dr: 0, dc: -1 },
  { dr: 0, dc: 0 },
]

// Supercover line: every cell the line from cell (0, 0) to cell (spec.dr,
// spec.dc) passes through, including the start and end cells. Uses Amanatides
// and Woo's voxel traversal so cells whose interiors the line crosses (as
// well as cells whose corners the line hits) all land in the footprint. This
// matters because the road has visible width: a flex straight that grazes a
// corner of a fourth cell still has paint inside that cell.
export function flexStraightFootprintLocal(
  spec: FlexStraightSpec,
): FootprintOffset[] {
  // Entry midpoint sits on the south edge of (0, 0), exit midpoint on the
  // north edge of (spec.dr, spec.dc). Cell coords: col grows east, row grows
  // south. Entry is at (col, row) = (0, 0.5), exit at (spec.dc, spec.dr - 0.5).
  // Cells are centered on integer (row, col) and span [r-0.5, r+0.5).
  const x0 = 0
  const y0 = 0.5
  const x1 = spec.dc
  const y1 = spec.dr - 0.5
  const cells = new Map<string, FootprintOffset>()

  const ensure = (r: number, c: number) => {
    const key = `${r},${c}`
    if (!cells.has(key)) cells.set(key, { dr: r, dc: c })
  }

  ensure(0, 0)
  ensure(spec.dr, spec.dc)

  const dx = x1 - x0
  const dy = y1 - y0
  if (dx === 0 && dy === 0) {
    return Array.from(cells.values())
  }

  // Cell containing the start point. Bias toward the anchor cell so the
  // start (which lies exactly on the south edge of (0, 0)) snaps to (0, 0)
  // rather than the cell south of the anchor.
  let cx = Math.round(x0)
  let cy = dy < 0 ? Math.round(y0 - 0.5) : Math.round(y0 + 0.5)
  ensure(cy, cx)

  const stepX = dx === 0 ? 0 : dx > 0 ? 1 : -1
  const stepY = dy === 0 ? 0 : dy > 0 ? 1 : -1
  const tDeltaX = stepX === 0 ? Infinity : Math.abs(1 / dx)
  const tDeltaY = stepY === 0 ? Infinity : Math.abs(1 / dy)
  let tMaxX =
    stepX === 0
      ? Infinity
      : stepX > 0
        ? (cx + 0.5 - x0) / dx
        : (cx - 0.5 - x0) / dx
  let tMaxY =
    stepY === 0
      ? Infinity
      : stepY > 0
        ? (cy + 0.5 - y0) / dy
        : (cy - 0.5 - y0) / dy

  // Defensive bound: at most one cell per axis crossing plus the start cell.
  // |dx| + |dy| + 4 covers integer-aligned starts/ends and corner crossings.
  const maxIter = Math.ceil(Math.abs(dx) + Math.abs(dy)) + 4
  let iterations = 0
  const epsilon = 1e-9
  while (
    iterations < maxIter &&
    (tMaxX < 1 - epsilon || tMaxY < 1 - epsilon)
  ) {
    iterations++
    if (Math.abs(tMaxX - tMaxY) < epsilon) {
      // Corner crossing: include both diagonally adjacent cells along with
      // the cell we are stepping into.
      ensure(cy + stepY, cx)
      ensure(cy, cx + stepX)
      cx += stepX
      cy += stepY
      tMaxX += tDeltaX
      tMaxY += tDeltaY
    } else if (tMaxX < tMaxY) {
      cx += stepX
      tMaxX += tDeltaX
    } else {
      cy += stepY
      tMaxY += tDeltaY
    }
    ensure(cy, cx)
  }
  return Array.from(cells.values())
}

// Apply the piece's 90-degree rotation to a local-frame footprint cell. The
// flex straight's local cells live in the rotation-0 frame; rotation maps
// (dr, dc) -> (dc, -dr) per 90-degree turn.
export function rotateFlexStraightFootprint(
  spec: FlexStraightSpec,
  rotation: Piece['rotation'],
): FootprintOffset[] {
  const local = flexStraightFootprintLocal(spec)
  return normalizedFootprint(rotateRawFootprint(local, rotation))
}

function rotateRawFootprint(
  cells: readonly FootprintOffset[],
  rotation: Piece['rotation'],
): FootprintOffset[] {
  let out = cells.map((c) => ({ dr: c.dr, dc: c.dc }))
  for (let i = 0; i < rotation / 90; i++) {
    out = out.map((c) => ({ dr: c.dc, dc: -c.dr }))
  }
  return out
}

export function defaultFootprintForPiece(
  piece: Pick<Piece, 'type' | 'rotation' | 'flex'>,
): readonly FootprintOffset[] {
  return piece.type === 'megaSweepRight'
    ? rotateFootprintByRotation(MEGA_SWEEP_RIGHT_FOOTPRINT, piece.rotation)
    : piece.type === 'megaSweepLeft'
      ? rotateFootprintByRotation(MEGA_SWEEP_LEFT_FOOTPRINT, piece.rotation)
    : piece.type === 'hairpin' || piece.type === 'hairpinTight'
      ? rotateFootprintByRotation(HAIRPIN_FOOTPRINT, piece.rotation)
    : piece.type === 'hairpinWide'
      ? rotateFootprintByRotation(HAIRPIN_WIDE_FOOTPRINT, piece.rotation)
    : piece.type === 'wideArc45Right'
      ? rotateFootprintByRotation(WIDE_ARC45_RIGHT_FOOTPRINT, piece.rotation)
    : piece.type === 'wideArc45Left'
      ? rotateFootprintByRotation(WIDE_ARC45_LEFT_FOOTPRINT, piece.rotation)
    : piece.type === 'offsetStraightRight' ||
        piece.type === 'grandSweepRight'
      ? rotateFootprintByRotation(OFFSET_RIGHT_FOOTPRINT, piece.rotation)
    : piece.type === 'offsetStraightLeft' ||
        piece.type === 'grandSweepLeft'
      ? rotateFootprintByRotation(OFFSET_LEFT_FOOTPRINT, piece.rotation)
    : piece.type === 'flexStraight'
      ? rotateFlexStraightFootprint(
          piece.flex ?? DEFAULT_FLEX_STRAIGHT_SPEC,
          piece.rotation,
        )
      : DEFAULT_FOOTPRINT
}

function rotateFootprintByRotation(
  footprint: readonly FootprintOffset[],
  rotation: Piece['rotation'],
): FootprintOffset[] {
  let rotated = normalizedFootprint(footprint)
  for (let i = 0; i < rotation / 90; i++) {
    rotated = normalizedFootprint(
      rotated.map((cell) => ({
        dr: cell.dc,
        dc: -cell.dr,
      })),
    )
  }
  return rotated
}

export function normalizedFootprint(
  footprint: readonly FootprintOffset[] | undefined,
): FootprintOffset[] {
  if (!footprint || footprint.length === 0) return [...DEFAULT_FOOTPRINT]
  const seen = new Set<string>()
  const out: FootprintOffset[] = []
  for (const cell of footprint) {
    if (!Number.isInteger(cell.dr) || !Number.isInteger(cell.dc)) continue
    const dr = cleanOffset(cell.dr)
    const dc = cleanOffset(cell.dc)
    const key = `${dr},${dc}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ dr, dc })
  }
  return out.length > 0
    ? out.sort((a, b) => (a.dr === b.dr ? a.dc - b.dc : a.dr - b.dr))
    : [...DEFAULT_FOOTPRINT]
}

function cleanOffset(value: number): number {
  return Object.is(value, -0) ? 0 : value
}

export function isDefaultFootprint(
  footprint: readonly FootprintOffset[] | undefined,
): boolean {
  const normalized = normalizedFootprint(footprint)
  return normalized.length === 1 && normalized[0].dr === 0 && normalized[0].dc === 0
}

export function footprintCells(piece: Piece): FootprintCell[] {
  const footprint =
    piece.footprint === undefined || piece.footprint.length === 0
      ? defaultFootprintForPiece(piece)
      : piece.footprint
  return normalizedFootprint(footprint).map((cell) => ({
    row: piece.row + cell.dr,
    col: piece.col + cell.dc,
  }))
}

export function footprintCellKeys(piece: Piece): string[] {
  return footprintCells(piece).map((cell) => cellKey(cell.row, cell.col))
}

export function pieceOccupiesCell(piece: Piece, row: number, col: number): boolean {
  return footprintCells(piece).some((cell) => cell.row === row && cell.col === col)
}

export function rotateFootprintClockwise(
  footprint: readonly FootprintOffset[] | undefined,
): FootprintOffset[] | undefined {
  const rotated = normalizedFootprint(
    normalizedFootprint(footprint).map((cell) => ({
      dr: cell.dc,
      dc: -cell.dr,
    })),
  )
  return isDefaultFootprint(rotated) ? undefined : rotated
}

export function flipFootprint(
  footprint: readonly FootprintOffset[] | undefined,
  axis: 'horizontal' | 'vertical',
): FootprintOffset[] | undefined {
  const flipped = normalizedFootprint(
    normalizedFootprint(footprint).map((cell) => ({
      dr: axis === 'vertical' ? -cell.dr : cell.dr,
      dc: axis === 'horizontal' ? -cell.dc : cell.dc,
    })),
  )
  return isDefaultFootprint(flipped) ? undefined : flipped
}
