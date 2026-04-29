import type { Piece, PieceType, Rotation } from '@/lib/schemas'
import { buildTrackPath, getStartExitDir } from './trackPath'
import { connectorsOf, type Dir } from './track'

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
  // Closed-loop fast path: rotate the array along travel order so the
  // existing direction is preserved.
  try {
    const path = buildTrackPath(pieces)
    if (path.order.length === pieces.length) {
      const idx = path.order.findIndex(
        (o) => o.piece.row === row && o.piece.col === col,
      )
      if (idx > 0) {
        const rotated = [...path.order.slice(idx), ...path.order.slice(0, idx)]
        return rotated.map((o) => o.piece)
      }
    }
  } catch {
    // fall through to the open-track behavior
  }
  // Open-track fallback: just promote the picked piece to index 0 without
  // dropping anything else. Travel direction will resolve naturally once
  // the loop closes.
  const idx = pieces.findIndex((p) => p.row === row && p.col === col)
  if (idx <= 0) return pieces
  return [pieces[idx], ...pieces.slice(0, idx), ...pieces.slice(idx + 1)]
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

export function selectedCellKey(row: number, col: number): string {
  return cellSelectionKey(row, col)
}

function cellSelectionKey(row: number, col: number): string {
  return `${row},${col}`
}

function parseSelectionKey(key: string): { row: number; col: number } | null {
  const [rowRaw, colRaw] = key.split(',')
  const row = Number(rowRaw)
  const col = Number(colRaw)
  if (!Number.isInteger(row) || !Number.isInteger(col)) return null
  return { row, col }
}

export function rectangleSelectionKeys(
  anchor: { row: number; col: number },
  target: { row: number; col: number },
): string[] {
  const rowMin = Math.min(anchor.row, target.row)
  const rowMax = Math.max(anchor.row, target.row)
  const colMin = Math.min(anchor.col, target.col)
  const colMax = Math.max(anchor.col, target.col)
  const keys: string[] = []
  for (let row = rowMin; row <= rowMax; row++) {
    for (let col = colMin; col <= colMax; col++) {
      keys.push(cellSelectionKey(row, col))
    }
  }
  return keys
}

export function countSelectedPieces(
  pieces: Piece[],
  selectedKeys: ReadonlySet<string>,
): number {
  let count = 0
  for (const piece of pieces) {
    if (selectedKeys.has(cellSelectionKey(piece.row, piece.col))) count += 1
  }
  return count
}

export function shiftSelectionKeys(
  selectedKeys: ReadonlySet<string>,
  rowDelta: number,
  colDelta: number,
): Set<string> {
  const next = new Set<string>()
  for (const key of selectedKeys) {
    const cell = parseSelectionKey(key)
    if (!cell) continue
    next.add(cellSelectionKey(cell.row + rowDelta, cell.col + colDelta))
  }
  return next
}

export function moveSelectedPieces(
  pieces: Piece[],
  selectedKeys: ReadonlySet<string>,
  rowDelta: number,
  colDelta: number,
): Piece[] {
  if (rowDelta === 0 && colDelta === 0) return pieces
  const selectedPieceKeys = new Set<string>()
  for (const piece of pieces) {
    const key = cellSelectionKey(piece.row, piece.col)
    if (selectedKeys.has(key)) selectedPieceKeys.add(key)
  }
  if (selectedPieceKeys.size === 0) return pieces

  const occupiedByUnselected = new Set<string>()
  for (const piece of pieces) {
    const key = cellSelectionKey(piece.row, piece.col)
    if (!selectedPieceKeys.has(key)) occupiedByUnselected.add(key)
  }
  for (const piece of pieces) {
    const key = cellSelectionKey(piece.row, piece.col)
    if (!selectedPieceKeys.has(key)) continue
    const targetKey = cellSelectionKey(piece.row + rowDelta, piece.col + colDelta)
    if (occupiedByUnselected.has(targetKey)) return pieces
  }

  return pieces.map((piece) => {
    if (!selectedPieceKeys.has(cellSelectionKey(piece.row, piece.col))) {
      return piece
    }
    return {
      ...piece,
      row: piece.row + rowDelta,
      col: piece.col + colDelta,
    }
  })
}

export function rotateSelectedPieces(
  pieces: Piece[],
  selectedKeys: ReadonlySet<string>,
): Piece[] {
  let changed = false
  const next = pieces.map((piece) => {
    if (!selectedKeys.has(cellSelectionKey(piece.row, piece.col))) return piece
    changed = true
    return { ...piece, rotation: nextRotation(piece.rotation) }
  })
  return changed ? next : pieces
}

export type SelectionFlipAxis = 'horizontal' | 'vertical'

export function flipSelectionKeys(
  selectedKeys: ReadonlySet<string>,
  axis: SelectionFlipAxis,
): Set<string> {
  const bounds = getSelectionBounds(selectedKeys)
  if (!bounds) return new Set(selectedKeys)
  const next = new Set<string>()
  for (const key of selectedKeys) {
    const cell = parseSelectionKey(key)
    if (!cell) continue
    next.add(cellSelectionKey(
      axis === 'vertical'
        ? bounds.rowMin + bounds.rowMax - cell.row
        : cell.row,
      axis === 'horizontal'
        ? bounds.colMin + bounds.colMax - cell.col
        : cell.col,
    ))
  }
  return next
}

export function flipCellWithinSelection(
  row: number,
  col: number,
  selectedKeys: ReadonlySet<string>,
  axis: SelectionFlipAxis,
): { row: number; col: number } {
  const bounds = getSelectionBounds(selectedKeys)
  if (!bounds) return { row, col }
  return mirroredCell(row, col, bounds, axis)
}

export function flipSelectedPieces(
  pieces: Piece[],
  selectedKeys: ReadonlySet<string>,
  axis: SelectionFlipAxis,
): Piece[] {
  const bounds = getSelectionBounds(selectedKeys)
  if (!bounds) return pieces

  const selectedPieceKeys = new Set<string>()
  for (const piece of pieces) {
    const key = cellSelectionKey(piece.row, piece.col)
    if (selectedKeys.has(key)) selectedPieceKeys.add(key)
  }
  if (selectedPieceKeys.size === 0) return pieces

  const occupiedByUnselected = new Set<string>()
  for (const piece of pieces) {
    const key = cellSelectionKey(piece.row, piece.col)
    if (!selectedPieceKeys.has(key)) occupiedByUnselected.add(key)
  }
  for (const piece of pieces) {
    const key = cellSelectionKey(piece.row, piece.col)
    if (!selectedPieceKeys.has(key)) continue
    const targetKey = mirroredCellKey(piece.row, piece.col, bounds, axis)
    if (occupiedByUnselected.has(targetKey)) return pieces
  }

  return pieces.map((piece) => {
    if (!selectedPieceKeys.has(cellSelectionKey(piece.row, piece.col))) {
      return piece
    }
    const target = mirroredCell(piece.row, piece.col, bounds, axis)
    return {
      ...mirrorPieceShape(piece, axis),
      row: target.row,
      col: target.col,
    }
  })
}

function getSelectionBounds(selectedKeys: ReadonlySet<string>): {
  rowMin: number
  rowMax: number
  colMin: number
  colMax: number
} | null {
  let rowMin = Infinity
  let rowMax = -Infinity
  let colMin = Infinity
  let colMax = -Infinity
  for (const key of selectedKeys) {
    const cell = parseSelectionKey(key)
    if (!cell) continue
    rowMin = Math.min(rowMin, cell.row)
    rowMax = Math.max(rowMax, cell.row)
    colMin = Math.min(colMin, cell.col)
    colMax = Math.max(colMax, cell.col)
  }
  if (!Number.isFinite(rowMin)) return null
  return { rowMin, rowMax, colMin, colMax }
}

function mirroredCell(
  row: number,
  col: number,
  bounds: { rowMin: number; rowMax: number; colMin: number; colMax: number },
  axis: SelectionFlipAxis,
): { row: number; col: number } {
  return {
    row: axis === 'vertical' ? bounds.rowMin + bounds.rowMax - row : row,
    col: axis === 'horizontal' ? bounds.colMin + bounds.colMax - col : col,
  }
}

function mirroredCellKey(
  row: number,
  col: number,
  bounds: { rowMin: number; rowMax: number; colMin: number; colMax: number },
  axis: SelectionFlipAxis,
): string {
  const cell = mirroredCell(row, col, bounds, axis)
  return cellSelectionKey(cell.row, cell.col)
}

function mirrorPieceShape(piece: Piece, axis: SelectionFlipAxis): Piece {
  const targetType = mirroredPieceType(piece.type)
  const mirroredConnectors = connectorsOf(piece).map((dir) =>
    mirrorDir(dir, axis),
  ) as [Dir, Dir]
  const rotation = findRotationForConnectors(targetType, mirroredConnectors)
  return {
    ...piece,
    type: targetType,
    rotation,
  }
}

function mirroredPieceType(type: PieceType): PieceType {
  if (type === 'left90') return 'right90'
  if (type === 'right90') return 'left90'
  if (type === 'scurve') return 'scurveLeft'
  if (type === 'scurveLeft') return 'scurve'
  if (type === 'sweepRight') return 'sweepLeft'
  if (type === 'sweepLeft') return 'sweepRight'
  return type
}

function mirrorDir(dir: Dir, axis: SelectionFlipAxis): Dir {
  if (axis === 'horizontal') {
    if (dir === 1) return 3
    if (dir === 3) return 1
    return dir
  }
  if (dir === 0) return 2
  if (dir === 2) return 0
  return dir
}

function findRotationForConnectors(type: PieceType, target: [Dir, Dir]): Rotation {
  for (const rotation of ROTATIONS) {
    const connectors = connectorsOf({ type, row: 0, col: 0, rotation })
    if (sameConnectorPair(connectors, target)) return rotation
  }
  return 0
}

function sameConnectorPair(a: [Dir, Dir], b: [Dir, Dir]): boolean {
  return (a[0] === b[0] && a[1] === b[1]) || (a[0] === b[1] && a[1] === b[0])
}
