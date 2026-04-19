import type { Piece, PieceType, Rotation } from '@/lib/schemas'

const PIECE_TYPES: PieceType[] = ['straight', 'left90', 'right90']
const ROTATIONS: Rotation[] = [0, 90, 180, 270]

export interface CellSlot {
  type: PieceType
  rotation: Rotation
}

// Empty -> straight/0, 90, 180, 270 -> left90/0..270 -> right90/0..270 -> empty.
// Cycle keeps the same cell; the caller writes the result back to the pieces array.
export function cycleCell(current: CellSlot | null): CellSlot | null {
  if (current === null) {
    return { type: 'straight', rotation: 0 }
  }
  const rotIdx = ROTATIONS.indexOf(current.rotation)
  if (rotIdx < ROTATIONS.length - 1) {
    return { type: current.type, rotation: ROTATIONS[rotIdx + 1] }
  }
  const typeIdx = PIECE_TYPES.indexOf(current.type)
  if (typeIdx < PIECE_TYPES.length - 1) {
    return { type: PIECE_TYPES[typeIdx + 1], rotation: 0 }
  }
  return null
}

export function withCellCycled(
  pieces: Piece[],
  row: number,
  col: number,
): Piece[] {
  const idx = pieces.findIndex((p) => p.row === row && p.col === col)
  const current = idx === -1 ? null : { type: pieces[idx].type, rotation: pieces[idx].rotation }
  const next = cycleCell(current)

  if (idx === -1 && next === null) return pieces
  if (next === null) {
    return pieces.filter((_, i) => i !== idx)
  }
  const updated: Piece = { row, col, type: next.type, rotation: next.rotation }
  if (idx === -1) return [...pieces, updated]
  const copy = pieces.slice()
  copy[idx] = updated
  return copy
}

export function getBounds(pieces: Piece[]): {
  rowMin: number
  rowMax: number
  colMin: number
  colMax: number
} {
  if (pieces.length === 0) {
    return { rowMin: 0, rowMax: 0, colMin: 0, colMax: 0 }
  }
  let rowMin = pieces[0].row
  let rowMax = pieces[0].row
  let colMin = pieces[0].col
  let colMax = pieces[0].col
  for (const p of pieces) {
    if (p.row < rowMin) rowMin = p.row
    if (p.row > rowMax) rowMax = p.row
    if (p.col < colMin) colMin = p.col
    if (p.col > colMax) colMax = p.col
  }
  return { rowMin, rowMax, colMin, colMax }
}
