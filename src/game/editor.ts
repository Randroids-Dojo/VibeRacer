import type { Piece, PieceType, Rotation } from '@/lib/schemas'
import { buildTrackPath, getStartExitDir } from './trackPath'
import { connectorsOf, type Dir } from './track'
import {
  flipFootprint,
  footprintCells,
  footprintCellKeys,
  pieceOccupiesCell,
  rotateFootprintClockwise,
} from './trackFootprint'

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
  const idx = pieces.findIndex((p) => pieceOccupiesCell(p, row, col))
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
  const idx = pieces.findIndex((p) => pieceOccupiesCell(p, row, col))
  if (idx === -1) return pieces
  const cur = pieces[idx]
  const copy = pieces.slice()
  copy[idx] = {
    ...cur,
    rotation: nextRotation(cur.rotation),
    footprint: rotateFootprintClockwise(cur.footprint),
  }
  return copy
}

export function withPieceRemoved(
  pieces: Piece[],
  row: number,
  col: number,
): Piece[] {
  const idx = pieces.findIndex((p) => pieceOccupiesCell(p, row, col))
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
    for (const cell of footprintCells(p)) {
      if (cell.row < rowMin) rowMin = cell.row
      if (cell.row > rowMax) rowMax = cell.row
      if (cell.col < colMin) colMin = cell.col
      if (cell.col > colMax) colMax = cell.col
    }
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
    if (pieceTouchesSelection(piece, selectedKeys)) count += 1
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
  const selectedPieceIndexes = selectedPieceIndexesFor(pieces, selectedKeys)
  if (selectedPieceIndexes.size === 0) return pieces

  const occupiedByUnselected = new Set<string>()
  for (let i = 0; i < pieces.length; i++) {
    if (selectedPieceIndexes.has(i)) continue
    for (const key of footprintCellKeys(pieces[i])) occupiedByUnselected.add(key)
  }
  for (const index of selectedPieceIndexes) {
    const piece = pieces[index]
    for (const cell of footprintCellKeys({
      ...piece,
      row: piece.row + rowDelta,
      col: piece.col + colDelta,
    })) {
      if (occupiedByUnselected.has(cell)) return pieces
    }
  }

  return pieces.map((piece, index) => {
    if (!selectedPieceIndexes.has(index)) {
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
  const selectedPieceIndexes = selectedPieceIndexesFor(pieces, selectedKeys)
  if (selectedPieceIndexes.size === 0) return pieces
  const next = pieces.map((piece, index) => {
    if (!selectedPieceIndexes.has(index)) return piece
    return {
      ...piece,
      rotation: nextRotation(piece.rotation),
      footprint: rotateFootprintClockwise(piece.footprint),
    }
  })
  return footprintsCollide(next) ? pieces : next
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

  const selectedPieceIndexes = selectedPieceIndexesFor(pieces, selectedKeys)
  if (selectedPieceIndexes.size === 0) return pieces

  const occupiedByUnselected = new Set<string>()
  for (let i = 0; i < pieces.length; i++) {
    if (selectedPieceIndexes.has(i)) continue
    for (const key of footprintCellKeys(pieces[i])) occupiedByUnselected.add(key)
  }
  for (const index of selectedPieceIndexes) {
    const piece = pieces[index]
    const target = mirroredCell(piece.row, piece.col, bounds, axis)
    const mirrored = mirrorPieceShape({ ...piece, row: target.row, col: target.col }, axis)
    for (const key of footprintCellKeys(mirrored)) {
      if (occupiedByUnselected.has(key)) return pieces
    }
  }

  return pieces.map((piece, index) => {
    if (!selectedPieceIndexes.has(index)) {
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

function pieceTouchesSelection(
  piece: Piece,
  selectedKeys: ReadonlySet<string>,
): boolean {
  return footprintCellKeys(piece).some((key) => selectedKeys.has(key))
}

function selectedPieceIndexesFor(
  pieces: Piece[],
  selectedKeys: ReadonlySet<string>,
): Set<number> {
  const indexes = new Set<number>()
  for (let i = 0; i < pieces.length; i++) {
    if (pieceTouchesSelection(pieces[i], selectedKeys)) indexes.add(i)
  }
  return indexes
}

function footprintsCollide(pieces: Piece[]): boolean {
  const seen = new Set<string>()
  for (const piece of pieces) {
    for (const key of footprintCellKeys(piece)) {
      if (seen.has(key)) return true
      seen.add(key)
    }
  }
  return false
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

function mirrorPieceShape(piece: Piece, axis: SelectionFlipAxis): Piece {
  const targetType = mirroredPieceType(piece.type)
  const mirroredConnectors = connectorsOf(piece).map((dir) =>
    mirrorDir(dir, axis),
  )
  const rotation = findRotationForConnectors(targetType, mirroredConnectors)
  return {
    ...piece,
    type: targetType,
    rotation,
    footprint: flipFootprint(piece.footprint, axis),
  }
}

function mirroredPieceType(type: PieceType): PieceType {
  if (type === 'left90') return 'right90'
  if (type === 'right90') return 'left90'
  if (type === 'scurve') return 'scurveLeft'
  if (type === 'scurveLeft') return 'scurve'
  if (type === 'sweepRight') return 'sweepLeft'
  if (type === 'sweepLeft') return 'sweepRight'
  if (type === 'megaSweepRight') return 'megaSweepLeft'
  if (type === 'megaSweepLeft') return 'megaSweepRight'
  if (type === 'arc45') return 'arc45Left'
  if (type === 'arc45Left') return 'arc45'
  return type
}

function mirrorDir(dir: Dir, axis: SelectionFlipAxis): Dir {
  if (axis === 'horizontal') {
    const map: Record<Dir, Dir> = {
      0: 0,
      1: 7,
      2: 6,
      3: 5,
      4: 4,
      5: 3,
      6: 2,
      7: 1,
    }
    return map[dir]
  }
  const map: Record<Dir, Dir> = {
    0: 4,
    1: 3,
    2: 2,
    3: 1,
    4: 0,
    5: 7,
    6: 6,
    7: 5,
  }
  return map[dir]
}

function findRotationForConnectors(type: PieceType, target: Dir[]): Rotation {
  for (const rotation of ROTATIONS) {
    const connectors = connectorsOf({ type, row: 0, col: 0, rotation })
    if (sameConnectorPair(connectors, target)) return rotation
  }
  return 0
}

function sameConnectorPair(a: Dir[], b: Dir[]): boolean {
  if (a.length !== b.length) return false
  return a.every((dir) => b.includes(dir))
}
