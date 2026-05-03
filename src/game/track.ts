import { MAX_PIECES_PER_TRACK, type Piece, type PieceType } from '@/lib/schemas'
import { footprintCellKeys } from './trackFootprint'

export type Dir = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 // N, NE, E, SE, S, SW, W, NW

export const DIR_OFFSETS: Record<Dir, { dr: number; dc: number }> = {
  0: { dr: -1, dc: 0 },
  1: { dr: -1, dc: 1 },
  2: { dr: 0, dc: 1 },
  3: { dr: 1, dc: 1 },
  4: { dr: 1, dc: 0 },
  5: { dr: 1, dc: -1 },
  6: { dr: 0, dc: -1 },
  7: { dr: -1, dc: -1 },
}

export function opposite(d: Dir): Dir {
  return ((d + 4) % 8) as Dir
}

export function cellKey(row: number, col: number): string {
  return `${row},${col}`
}

// Base connectors at rotation 0. Order is [entry, exit] but both are just open edges for graph purposes.
const BASE_CONNECTORS: Record<PieceType, Dir[]> = {
  straight: [4, 0], // S -> N
  left90: [4, 6], // S -> W (left turn)
  right90: [4, 2], // S -> E (right turn)
  scurve: [4, 0], // S -> N (snakes inside the cell, right then left)
  scurveLeft: [4, 0], // S -> N (mirror of scurve: snakes left then right)
  sweepRight: [4, 2], // S -> E (smooth sampled right turn)
  sweepLeft: [4, 6], // S -> W (smooth sampled left turn)
  megaSweepRight: [4, 2], // S -> E (3x3 smooth sampled right turn)
  megaSweepLeft: [4, 6], // S -> W (3x3 smooth sampled left turn)
}

export function connectorsOf(piece: Piece): Dir[] {
  const shift = (piece.rotation / 90) * 2
  return BASE_CONNECTORS[piece.type].map((dir) => ((dir + shift) % 8) as Dir)
}

export interface ValidationResult {
  ok: boolean
  reason?: string
}

export function validateClosedLoop(pieces: Piece[]): ValidationResult {
  if (pieces.length === 0) {
    return { ok: false, reason: 'empty track' }
  }
  if (pieces.length > MAX_PIECES_PER_TRACK) {
    return { ok: false, reason: `too many pieces (>${MAX_PIECES_PER_TRACK})` }
  }

  const byAnchorCell = new Map<string, Piece>()
  for (const p of pieces) {
    const key = cellKey(p.row, p.col)
    if (byAnchorCell.has(key)) {
      return { ok: false, reason: `duplicate piece at ${key}` }
    }
    byAnchorCell.set(key, p)
  }

  const occupiedByCell = new Map<string, Piece>()
  for (const p of pieces) {
    for (const key of footprintCellKeys(p)) {
      const existing = occupiedByCell.get(key)
      if (
        existing &&
        !isAllowedConnectorFootprintOverlap(p, existing, key)
      ) {
        return { ok: false, reason: `duplicate piece at ${key}` }
      }
      if (!existing) occupiedByCell.set(key, p)
    }
  }

  const neighbors = new Map<string, string[]>()

  for (const p of pieces) {
    const key = cellKey(p.row, p.col)
    const conns = connectorsOf(p)
    const adj: string[] = []
    for (const d of conns) {
      const { dr, dc } = DIR_OFFSETS[d]
      const nKey = cellKey(p.row + dr, p.col + dc)
      const neighbor = byAnchorCell.get(nKey)
      if (!neighbor || neighbor === p) {
        return { ok: false, reason: `open connector at ${key} facing ${d}` }
      }
      const neighborConns = connectorsOf(neighbor)
      if (!neighborConns.includes(opposite(d))) {
        return {
          ok: false,
          reason: `connector mismatch between ${key} and ${nKey}`,
        }
      }
      adj.push(nKey)
    }
    neighbors.set(key, adj)
  }

  // BFS for single connected component.
  const start = cellKey(pieces[0].row, pieces[0].col)
  const seen = new Set<string>([start])
  const queue: string[] = [start]
  while (queue.length) {
    const cur = queue.shift()!
    for (const n of neighbors.get(cur)!) {
      if (!seen.has(n)) {
        seen.add(n)
        queue.push(n)
      }
    }
  }

  if (seen.size !== pieces.length) {
    return { ok: false, reason: 'graph is not a single connected component' }
  }

  return { ok: true }
}

function isAllowedConnectorFootprintOverlap(
  a: Piece,
  b: Piece,
  key: string,
): boolean {
  if (a === b) return true
  return (
    isConnectorAnchorCell(a, b, key) ||
    isConnectorAnchorCell(b, a, key)
  )
}

function isConnectorAnchorCell(
  piece: Piece,
  neighbor: Piece,
  key: string,
): boolean {
  if (key !== cellKey(neighbor.row, neighbor.col)) return false
  for (const dir of connectorsOf(piece)) {
    const { dr, dc } = DIR_OFFSETS[dir]
    if (piece.row + dr !== neighbor.row || piece.col + dc !== neighbor.col) {
      continue
    }
    return connectorsOf(neighbor).includes(opposite(dir))
  }
  return false
}
