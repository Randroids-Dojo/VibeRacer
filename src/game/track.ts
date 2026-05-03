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

export interface ConnectorPort {
  dr: number
  dc: number
  dir: Dir
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
  hairpin: [6, 6], // W -> W on different footprint rows
  arc45: [4, 1], // S -> NE (right-hand cardinal-to-corner bridge)
  arc45Left: [4, 7], // S -> NW (left-hand cardinal-to-corner bridge)
  diagonal: [5, 1], // SW -> NE (straight across one cell corner-to-corner)
}

export function connectorsOf(piece: Piece): Dir[] {
  return connectorPortsOf(piece).map((port) => port.dir)
}

export function connectorPortsOf(piece: Piece): ConnectorPort[] {
  if (piece.type === 'hairpin') {
    return rotatePorts(
      [
        { dr: -1, dc: 0, dir: 6 },
        { dr: 1, dc: 0, dir: 6 },
      ],
      piece.rotation,
    )
  }
  const shift = (piece.rotation / 90) * 2
  return BASE_CONNECTORS[piece.type].map((dir) => ({
    dr: 0,
    dc: 0,
    dir: ((dir + shift) % 8) as Dir,
  }))
}

function rotatePorts(
  ports: readonly ConnectorPort[],
  rotation: Piece['rotation'],
): ConnectorPort[] {
  const turns = rotation / 90
  return ports.map((port) => {
    let dr = port.dr
    let dc = port.dc
    for (let i = 0; i < turns; i++) {
      const nextDr = dc
      const nextDc = -dr
      dr = nextDr
      dc = nextDc
    }
    return {
      dr,
      dc,
      dir: ((port.dir + turns * 2) % 8) as Dir,
    }
  })
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
    const ports = connectorPortsOf(p)
    const adj: string[] = []
    for (const port of ports) {
      const neighbor = findConnectedNeighbor(p, port, pieces)
      const nKey = neighbor ? cellKey(neighbor.row, neighbor.col) : neighborAnchorKey(p, port)
      if (!neighbor || neighbor === p) {
        return {
          ok: false,
          reason: `open connector at ${key} facing ${port.dir}`,
        }
      }
      if (!portsConnect(p, port, neighbor)) {
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
  for (const port of connectorPortsOf(piece)) {
    if (neighborAnchorKey(piece, port) !== key) continue
    return portsConnect(piece, port, neighbor)
  }
  return false
}

export function portCell(
  piece: Pick<Piece, 'row' | 'col'>,
  port: Pick<ConnectorPort, 'dr' | 'dc'>,
): { row: number; col: number } {
  return { row: piece.row + port.dr, col: piece.col + port.dc }
}

export function neighborAnchorKey(piece: Piece, port: ConnectorPort): string {
  const cell = portCell(piece, port)
  const { dr, dc } = DIR_OFFSETS[port.dir]
  return cellKey(cell.row + dr, cell.col + dc)
}

export function portsConnect(
  piece: Piece,
  port: ConnectorPort,
  neighbor: Piece,
): boolean {
  const cell = portCell(piece, port)
  for (const neighborPort of connectorPortsOf(neighbor)) {
    const neighborCell = portCell(neighbor, neighborPort)
    const off = DIR_OFFSETS[neighborPort.dir]
    if (
      neighborCell.row + off.dr === cell.row &&
      neighborCell.col + off.dc === cell.col &&
      neighborPort.dir === opposite(port.dir)
    ) {
      return true
    }
  }
  return false
}

export function findConnectedNeighbor(
  piece: Piece,
  port: ConnectorPort,
  pieces: readonly Piece[],
): Piece | null {
  for (const candidate of pieces) {
    if (candidate === piece) continue
    if (portsConnect(piece, port, candidate)) return candidate
  }
  return null
}
