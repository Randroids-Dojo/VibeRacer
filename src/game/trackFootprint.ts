import type { Piece } from '@/lib/schemas'
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

export const MEGA_SWEEP_FOOTPRINT: readonly FootprintOffset[] = [
  { dr: -1, dc: -1 },
  { dr: -1, dc: 0 },
  { dr: -1, dc: 1 },
  { dr: 0, dc: -1 },
  { dr: 0, dc: 0 },
  { dr: 0, dc: 1 },
  { dr: 1, dc: -1 },
  { dr: 1, dc: 0 },
  { dr: 1, dc: 1 },
]

export const HAIRPIN_FOOTPRINT: readonly FootprintOffset[] = [
  { dr: -1, dc: 0 },
  { dr: -1, dc: 1 },
  { dr: 0, dc: 0 },
  { dr: 0, dc: 1 },
  { dr: 1, dc: 0 },
  { dr: 1, dc: 1 },
]

export function defaultFootprintForPiece(
  piece: Pick<Piece, 'type' | 'rotation'>,
): readonly FootprintOffset[] {
  return piece.type === 'megaSweepRight' || piece.type === 'megaSweepLeft'
    ? MEGA_SWEEP_FOOTPRINT
    : piece.type === 'hairpin'
      ? rotateFootprintByRotation(HAIRPIN_FOOTPRINT, piece.rotation)
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
