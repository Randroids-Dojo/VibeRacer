import {
  DEFAULT_FLEX_STRAIGHT_SPEC,
  MAX_PIECES_PER_TRACK,
  type FlexStraightSpec,
  type Piece,
  type PieceType,
} from '@/lib/schemas'
import { convertV1Pieces } from '@/lib/trackVersion'
import { footprintCellKeys } from './trackFootprint'
import {
  cardinalTurnsOfTheta,
  frameOfPortAtTransform,
  framesConnect,
} from './pieceFrames'
import { endpointsOf, transformOf } from './pieceGeometry'

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

function parseCellKey(key: string): { row: number; col: number } {
  const [rowRaw, colRaw] = key.split(',')
  return { row: Number(rowRaw), col: Number(colRaw) }
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
  hairpinTight: [6, 6], // W -> W on different footprint rows
  hairpinWide: [6, 6], // W -> W on different footprint rows
  arc45: [4, 1], // S -> NE (right-hand cardinal-to-corner bridge)
  arc45Left: [4, 7], // S -> NW (left-hand cardinal-to-corner bridge)
  diagonal: [5, 1], // SW -> NE (straight across one cell corner-to-corner)
  wideArc45Right: [4, 1], // S -> NE across a wider footprint
  wideArc45Left: [4, 7], // S -> NW across a wider footprint
  diagonalSweepRight: [5, 3], // SW -> SE diagonal bend
  diagonalSweepLeft: [3, 5], // SE -> SW diagonal bend
  kinkRight: [4, 0], // S -> N with a shallow right kink
  kinkLeft: [4, 0], // S -> N with a shallow left kink
  offsetStraightRight: [4, 0], // S -> N with the exit shifted right
  offsetStraightLeft: [4, 0], // S -> N with the exit shifted left
  grandSweepRight: [4, 2], // S -> E across a larger footprint
  grandSweepLeft: [4, 6], // S -> W across a larger footprint
  flexStraight: [4, 0], // S -> N (placeholder; real ports use the flex spec)
}

// Resolve the flex spec for a piece, falling back to the default when missing
// so consumers do not have to branch on undefined. Validation rejects pieces
// of other types that carry a flex spec, so this stays consistent.
export function flexSpecOf(piece: Piece): FlexStraightSpec {
  return piece.flex ?? DEFAULT_FLEX_STRAIGHT_SPEC
}

// Apply `turns` cardinal 90-degree CW rotations to a piece-local (dr, dc)
// vector. At turns=0 the offset is unchanged; each step maps (dr, dc) ->
// (dc, -dr). Used by both `flexStraightPorts` and `rotatePorts` so the cell
// rotation table stays in one place.
function rotateOffsetByTurns(
  dr: number,
  dc: number,
  turns: number,
): { dr: number; dc: number } {
  let r = dr
  let c = dc
  for (let i = 0; i < turns; i++) {
    const nr = c
    const nc = -r
    r = nr
    c = nc
  }
  return { dr: r, dc: c }
}

// Resolve the rotation theta for a piece in radians. Reads `transform.theta`
// when present (Stage 1 invariant after the v1 to v2 converter runs);
// falls back to `piece.rotation * PI / 180` for transform-less pieces so
// callers (template literals, direct test inputs) don't have to run the
// converter just to ask for a rotation.
export function thetaOfPiece(piece: Piece): number {
  if (piece.transform !== undefined) return piece.transform.theta
  return (piece.rotation * Math.PI) / 180
}

// Connector ports for a flex straight at the piece's current theta. Entry
// sits on the south edge of the anchor cell at rotation 0 (rotates with
// the piece). Exit sits on the north edge of the cell at offset (flex.dr,
// flex.dc), which also rotates with the piece. The exit edge is always
// cardinal-snapped (opposite of the entry edge after the cardinal turn),
// so flex straights remain compatible with the existing 8-direction
// connector matching against grid pieces.
export function flexStraightPorts(piece: Piece): ConnectorPort[] {
  const { dr, dc } = flexSpecOf(piece)
  const turns = cardinalTurnsOfTheta(thetaOfPiece(piece))
  const exit = rotateOffsetByTurns(dr, dc, turns)
  const entryDir = ((4 + turns * 2) % 8) as Dir
  const exitDir = opposite(entryDir)
  return [
    { dr: 0, dc: 0, dir: entryDir },
    { dr: exit.dr, dc: exit.dc, dir: exitDir },
  ]
}

export function connectorsOf(piece: Piece): Dir[] {
  return connectorPortsOf(piece).map((port) => port.dir)
}

// Stage 2 contract: ports are derived from `transform.theta` rather than
// `piece.rotation`. The theta is cardinal-snapped to a 0..3 turn count via
// `cardinalTurnsOfTheta` so the discrete `dir` and `(dr, dc)` table reads
// stay integer-exact for grid-aligned input. The remaining residual angle
// (transform.theta minus the cardinal projection) is applied in the world
// frame by `frameOfPortAtTransform`. For v1-projectable pieces the residual
// is exactly zero, so the geometry layer reproduces the legacy bytes
// bit-for-bit and the snapshot wall in tests/unit/pieceGeometry.test.ts
// stays pinned. For non-projectable pieces the cardinal-snapped port still
// gives a sensible answer for cell-keyed diagnostics (footprint cells, port
// dir for issue reporting), and the world frame follows the continuous
// theta.
export function connectorPortsOf(piece: Piece): ConnectorPort[] {
  const turns = cardinalTurnsOfTheta(thetaOfPiece(piece))
  if (
    piece.type === 'hairpin' ||
    piece.type === 'hairpinTight' ||
    piece.type === 'hairpinWide'
  ) {
    return rotatePortsByTurns(
      [
        { dr: -1, dc: 0, dir: 6 },
        { dr: 1, dc: 0, dir: 6 },
      ],
      turns,
    )
  }
  if (piece.type === 'wideArc45Right') {
    return rotatePortsByTurns(
      [
        { dr: 0, dc: 0, dir: 4 },
        { dr: -1, dc: 1, dir: 1 },
      ],
      turns,
    )
  }
  if (piece.type === 'wideArc45Left') {
    return rotatePortsByTurns(
      [
        { dr: 0, dc: 0, dir: 4 },
        { dr: -1, dc: -1, dir: 7 },
      ],
      turns,
    )
  }
  if (piece.type === 'offsetStraightRight') {
    return rotatePortsByTurns(
      [
        { dr: 0, dc: 0, dir: 4 },
        { dr: -1, dc: 1, dir: 0 },
      ],
      turns,
    )
  }
  if (piece.type === 'offsetStraightLeft') {
    return rotatePortsByTurns(
      [
        { dr: 0, dc: 0, dir: 4 },
        { dr: -1, dc: -1, dir: 0 },
      ],
      turns,
    )
  }
  if (piece.type === 'grandSweepRight') {
    return rotatePortsByTurns(
      [
        { dr: 0, dc: 0, dir: 4 },
        { dr: -1, dc: 1, dir: 2 },
      ],
      turns,
    )
  }
  if (piece.type === 'grandSweepLeft') {
    return rotatePortsByTurns(
      [
        { dr: 0, dc: 0, dir: 4 },
        { dr: -1, dc: -1, dir: 6 },
      ],
      turns,
    )
  }
  if (piece.type === 'flexStraight') {
    return flexStraightPorts(piece)
  }
  const shift = turns * 2
  return BASE_CONNECTORS[piece.type].map((dir) => ({
    dr: 0,
    dc: 0,
    dir: ((dir + shift) % 8) as Dir,
  }))
}

function rotatePortsByTurns(
  ports: readonly ConnectorPort[],
  turns: number,
): ConnectorPort[] {
  return ports.map((port) => {
    const { dr, dc } = rotateOffsetByTurns(port.dr, port.dc, turns)
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
  issue?: ValidationIssue
}

export type ValidationIssue =
  | {
      kind: 'openConnector'
      row: number
      col: number
      connectorRow: number
      connectorCol: number
      dir: Dir
      targetRow: number
      targetCol: number
    }
  | {
      kind: 'duplicateCell'
      row: number
      col: number
    }
  | {
      kind: 'disconnected'
    }

export function validateClosedLoop(pieces: Piece[]): ValidationResult {
  if (pieces.length === 0) {
    return { ok: false, reason: 'empty track' }
  }
  if (pieces.length > MAX_PIECES_PER_TRACK) {
    return { ok: false, reason: `too many pieces (>${MAX_PIECES_PER_TRACK})` }
  }
  // Normalize to v2 (every piece has transform populated) so the geometry
  // layer can read transform without a fallback. Idempotent: pieces already
  // carrying transform are returned as-is. This is the same converter the
  // load path runs immediately after schema parse.
  pieces = convertV1Pieces(pieces)

  const byAnchorCell = new Map<string, Piece>()
  for (const p of pieces) {
    const key = cellKey(p.row, p.col)
    if (byAnchorCell.has(key)) {
      return {
        ok: false,
        reason: `duplicate piece at ${key}`,
        issue: { kind: 'duplicateCell', row: p.row, col: p.col },
      }
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
        const duplicate = parseCellKey(key)
        return {
          ok: false,
          reason: `duplicate piece at ${key}`,
          issue: {
            kind: 'duplicateCell',
            row: duplicate.row,
            col: duplicate.col,
          },
        }
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
      const connector = portCell(p, port)
      const target = neighborAnchorCell(p, port)
      const nKey = neighbor ? cellKey(neighbor.row, neighbor.col) : cellKey(target.row, target.col)
      if (!neighbor || neighbor === p) {
        return {
          ok: false,
          reason: `open connector at ${key} facing ${port.dir}`,
          issue: {
            kind: 'openConnector',
            row: p.row,
            col: p.col,
            connectorRow: connector.row,
            connectorCol: connector.col,
            dir: port.dir,
            targetRow: target.row,
            targetCol: target.col,
          },
        }
      }
      if (!portsConnect(p, port, neighbor)) {
        return {
          ok: false,
          reason: `connector mismatch between ${key} and ${nKey}`,
          issue: {
            kind: 'openConnector',
            row: p.row,
            col: p.col,
            connectorRow: connector.row,
            connectorCol: connector.col,
            dir: port.dir,
            targetRow: target.row,
            targetCol: target.col,
          },
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
    return {
      ok: false,
      reason: 'graph is not a single connected component',
      issue: { kind: 'disconnected' },
    }
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
    return true
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
  const cell = neighborAnchorCell(piece, port)
  return cellKey(cell.row, cell.col)
}

export function neighborAnchorCell(
  piece: Piece,
  port: ConnectorPort,
): { row: number; col: number } {
  const cell = portCell(piece, port)
  const { dr, dc } = DIR_OFFSETS[port.dir]
  return { row: cell.row + dr, col: cell.col + dc }
}

export function portsConnect(
  piece: Piece,
  port: ConnectorPort,
  neighbor: Piece,
): boolean {
  // Endpoints are the source of truth for connections. Use `endpointsOf`
  // (not `geometryOf`) so the validator's hot path skips the supercover
  // footprint computation that `geometryOf` would also do. Both source and
  // candidate frames go through `frameOfPortAtTransform` so non-projectable
  // (Stage 2) transforms produce the right world-space frame instead of the
  // cell-keyed approximation `frameOfPort` would give.
  const frame = frameOfPortAtTransform(transformOf(piece), port)
  for (const candidate of endpointsOf(neighbor)) {
    if (framesConnect(frame, candidate)) return true
  }
  return false
}

export function findConnectedNeighbor(
  piece: Piece,
  port: ConnectorPort,
  pieces: readonly Piece[],
): Piece | null {
  // Endpoint-driven match: iterate every other piece's endpoint frames and
  // return the first whose frame connects to this port's frame. Both sides
  // run through `frameOfPortAtTransform` so non-projectable transforms
  // close correctly; for grid-aligned pieces the residual rotation is zero
  // and the result is bit-equal to the cell-keyed Stage 1 path.
  const frame = frameOfPortAtTransform(transformOf(piece), port)
  for (const candidate of pieces) {
    if (candidate === piece) continue
    for (const candidateFrame of endpointsOf(candidate)) {
      if (framesConnect(frame, candidateFrame)) return candidate
    }
  }
  return null
}
