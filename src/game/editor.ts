import type { Piece, PieceType, Rotation } from '@/lib/schemas'
import { buildTrackPath, getStartExitDir } from './trackPath'

export { getStartExitDir }

const ROTATIONS: Rotation[] = [0, 90, 180, 270]

export function nextRotation(current: Rotation): Rotation {
  const idx = ROTATIONS.indexOf(current)
  return ROTATIONS[(idx + 1) % ROTATIONS.length]
}

export function withPiecePlaced(
  pieces: Piece[],
  row: number,
  col: number,
  type: PieceType,
  rotation: Rotation,
): Piece[] {
  const idx = pieces.findIndex((p) => p.row === row && p.col === col)
  const updated: Piece = { row, col, type, rotation }
  if (idx === -1) return [...pieces, updated]
  const copy = pieces.slice()
  copy[idx] = updated
  return copy
}

export function withPieceRotated(
  pieces: Piece[],
  row: number,
  col: number,
): Piece[] {
  const idx = pieces.findIndex((p) => p.row === row && p.col === col)
  if (idx === -1) return pieces
  const cur = pieces[idx]
  const copy = pieces.slice()
  copy[idx] = { ...cur, rotation: nextRotation(cur.rotation) }
  return copy
}

export function withPieceRemoved(
  pieces: Piece[],
  row: number,
  col: number,
): Piece[] {
  const idx = pieces.findIndex((p) => p.row === row && p.col === col)
  if (idx === -1) return pieces
  return pieces.filter((_, i) => i !== idx)
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
    // buildTrackPath returns a partial walk when the track is not a valid
    // closed loop. Rotating a partial walk would drop the unwalked pieces,
    // so bail out and leave the array alone.
    if (path.order.length !== pieces.length) return pieces
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
