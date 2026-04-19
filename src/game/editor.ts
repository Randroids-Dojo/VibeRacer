import type { Piece, PieceType, Rotation } from '@/lib/schemas'
import { buildTrackPath, getStartExitDir } from './trackPath'

export { getStartExitDir }

const PIECE_TYPES: PieceType[] = ['straight', 'left90', 'right90']
const ROTATIONS: Rotation[] = [0, 90, 180, 270]

export type CellSlot = Pick<Piece, 'type' | 'rotation'>

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

export function moveStartTo(
  pieces: Piece[],
  row: number,
  col: number,
): Piece[] {
  if (pieces.length === 0) return pieces
  if (pieces[0].row === row && pieces[0].col === col) return pieces
  try {
    const path = buildTrackPath(pieces)
    const idx = path.order.findIndex(
      (o) => o.piece.row === row && o.piece.col === col,
    )
    if (idx <= 0) return pieces
    const rotated = [...path.order.slice(idx), ...path.order.slice(0, idx)]
    return rotated.map((o) => o.piece)
  } catch {
    return pieces
  }
}

export function reverseStartDirection(pieces: Piece[]): Piece[] {
  if (pieces.length < 2) return pieces
  const [first, ...rest] = pieces
  return [first, ...rest.slice().reverse()]
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
