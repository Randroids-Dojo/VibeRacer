import type { FlexStraightSpec, Piece, TrackCheckpoint } from '@/lib/schemas'
import { convertV1Pieces } from '@/lib/trackVersion'
import { CELL_SIZE } from './cellSize'
import { footprintCellKeys } from './trackFootprint'
import {
  cellKey,
  connectorPortsOf,
  findConnectedNeighbor,
  flexSpecOf,
  portCell,
  portsConnect,
  type ConnectorPort,
  type Dir,
} from './track'
import { transformOf } from './pieceGeometry'
import {
  cardinalTurnsOfTheta,
  frameOfPortAtTransform,
  residualThetaAfterCardinalSnap,
} from './pieceFrames'
import type { PieceTransform } from '@/lib/schemas'

// Travel direction is encoded by pieces[1]'s cell-adjacency to pieces[0]:
// whichever connector points at pieces[1] is the exit. Falls back to connB
// when pieces[1] is absent or non-adjacent.
export function getStartExitDir(pieces: Piece[]): Dir | null {
  return getStartExitPort(pieces)?.dir ?? null
}

function getStartExitPort(pieces: Piece[]): ConnectorPort | null {
  if (pieces.length === 0) return null
  const first = pieces[0]
  const ports = connectorPortsOf(first)
  const [portA, portB] = ports
  if (portA === undefined || portB === undefined) return null
  if (pieces.length >= 2) {
    const second = pieces[1]
    const matching = ports.find((port) => portsConnect(first, port, second))
    if (matching) return matching
  }
  return portB
}

// CELL_SIZE lives in the leaf module `./cellSize` to keep pieceGeometry /
// trackVersion / trackPath out of a runtime import cycle. Re-exported here
// so external callers can keep importing it from the path module.
export { CELL_SIZE }
export { DEFAULT_TRACK_WIDTH as TRACK_WIDTH } from './trackWidth'
export const CORNER_ARC_RADIUS = CELL_SIZE / 2
const CORNER_ARC_LENGTH = CORNER_ARC_RADIUS * (Math.PI / 2)

export interface Vec3 {
  x: number
  y: number
  z: number
}

export interface SampledPoint {
  x: number
  z: number
  heading: number
}

export interface OrderedPiece {
  piece: Piece
  entryDir: Dir
  exitDir: Dir
  center: Vec3
  entry: Vec3
  exit: Vec3
  // Populated for corners only: the cell corner where the two open edges meet.
  // The corner centerline lies at distance CELL_SIZE/2 from this point.
  arcCenter: { cx: number; cz: number } | null
  // Populated for pieces with non-analytic centerlines (currently only the
  // S-curve). Samples are evenly spaced along the path by parameter t in
  // [0, 1] from entry (samples[0]) to exit (samples[last]).
  samples: SampledPoint[] | null
}

export interface PathLocator {
  segmentId: string
  idx: number
}

export interface PathSegment {
  id: string
  order: OrderedPiece[]
  closesLoop: boolean
}

export interface TrackPath {
  segments: PathSegment[]
  order: OrderedPiece[]
  cellToOrderIdx: Map<string, number>
  cellToLocators: Map<string, PathLocator[]>
  spawn: { position: Vec3; heading: number }
  finishLine: { position: Vec3; heading: number }
  // Path-order index of the piece whose entry triggers checkpoint k. The last
  // entry is always 0 (lap completes when the car re-enters the start piece).
  cpTriggerPieceIdx: number[]
  checkpointMarkers: { cpId: number; pieceIdx: number; position: Vec3; heading: number }[]
}

// K checkpoints distributed evenly across M pieces in path order. The k-th CP
// fires when the car enters piece round((k+1) * M / K) % M, so the K-th CP
// always lands on piece 0 (lap complete). When K === M this matches the
// pre-feature behavior of one CP per piece.
export function computeCpTriggerPieceIdx(
  pieceCount: number,
  checkpointCount?: number,
): number[] {
  const K = checkpointCount ?? pieceCount
  const M = pieceCount
  const out: number[] = []
  for (let k = 0; k < K; k++) {
    out.push(Math.round(((k + 1) * M) / K) % M)
  }
  return out
}

export function computeExplicitCpTriggerPieceIdx(
  order: OrderedPiece[],
  checkpoints: TrackCheckpoint[],
): number[] {
  const cellToIdx = new Map<string, number>()
  for (let i = 0; i < order.length; i++) {
    const p = order[i].piece
    cellToIdx.set(cellKey(p.row, p.col), i)
  }
  const idxs = Array.from(
    new Set(
      checkpoints
        .map((cp) => cellToIdx.get(cellKey(cp.row, cp.col)))
        .filter((idx): idx is number => idx !== undefined && idx > 0),
    ),
  ).sort((a, b) => a - b)
  return [...idxs, 0]
}

export function cellCenter(row: number, col: number): Vec3 {
  return { x: col * CELL_SIZE, y: 0, z: row * CELL_SIZE }
}

const HALF = CELL_SIZE / 2
const EDGE_OFFSETS: Record<Dir, { dx: number; dz: number }> = {
  0: { dx: 0, dz: -HALF },
  1: { dx: HALF, dz: -HALF },
  2: { dx: HALF, dz: 0 },
  3: { dx: HALF, dz: HALF },
  4: { dx: 0, dz: HALF },
  5: { dx: -HALF, dz: HALF },
  6: { dx: -HALF, dz: 0 },
  7: { dx: -HALF, dz: -HALF },
}

export function edgeMidpoint(row: number, col: number, dir: Dir): Vec3 {
  const c = cellCenter(row, col)
  const { dx, dz } = EDGE_OFFSETS[dir]
  return { x: c.x + dx, y: 0, z: c.z + dz }
}

function portMidpoint(piece: Piece, port: ConnectorPort): Vec3 {
  // Stage 2: read the world-frame port position from the piece's transform
  // rather than from cell coordinates so non-projectable pieces render at
  // the correct location. For grid-aligned pieces the residual rotation in
  // `frameOfPortAtTransform` is exactly zero and the result is bit-equal
  // to the legacy `edgeMidpoint(cell.row, cell.col, port.dir)` arithmetic.
  const frame = frameOfPortAtTransform(transformOf(piece), port)
  return { x: frame.x, y: 0, z: frame.z }
}

// Heading in radians where 0 = +X (east) and increases counter-clockwise around +Y.
// North (-Z) = Math.PI/2, East (+X) = 0, South (+Z) = -Math.PI/2, West (-X) = Math.PI.
const DIR_HEADINGS: Record<Dir, number> = {
  0: Math.PI / 2,
  1: Math.PI / 4,
  2: 0,
  3: -Math.PI / 4,
  4: -Math.PI / 2,
  5: -3 * Math.PI / 4,
  6: Math.PI,
  7: 3 * Math.PI / 4,
}

export function dirToHeading(d: Dir): number {
  return DIR_HEADINGS[d]
}

function otherConnectorPort(piece: Piece, entry: ConnectorPort): ConnectorPort {
  const [a, b] = connectorPortsOf(piece)
  if (a === undefined || b === undefined) return entry
  return samePort(entry, a) ? b : a
}

function samePort(a: ConnectorPort, b: ConnectorPort): boolean {
  return a.dr === b.dr && a.dc === b.dc && a.dir === b.dir
}

function matchingEntryPort(piece: Piece, previous: Piece): ConnectorPort {
  const ports = connectorPortsOf(piece)
  const found = ports.find((port) => portsConnect(piece, port, previous))
  return found ?? ports[0]
}

function computeArcCenter(
  transform: PieceTransform,
  entryDir: Dir,
  exitDir: Dir,
): { cx: number; cz: number } {
  // The arc center for a 90-degree corner sits at the cell corner where
  // the two open edges meet. In the piece-local frame that point is the
  // sum of the two edge-midpoint offsets relative to cell center. For
  // grid-aligned pieces the residual rotation is zero and this collapses
  // to the legacy `(center.x + e1.dx + e2.dx, center.z + e1.dz + e2.dz)`
  // arithmetic; for non-projectable corners it rotates the local corner
  // offset by the residual angle so the arc center tracks the rotated
  // piece.
  const e1 = EDGE_OFFSETS[entryDir]
  const e2 = EDGE_OFFSETS[exitDir]
  const offsetX = e1.dx + e2.dx
  const offsetZ = e1.dz + e2.dz
  const residual = residualThetaAfterCardinalSnap(transform.theta)
  if (residual === 0) {
    return { cx: transform.x + offsetX, cz: transform.z + offsetZ }
  }
  const cs = Math.cos(residual)
  const sn = Math.sin(residual)
  return {
    cx: transform.x + offsetX * cs - offsetZ * sn,
    cz: transform.z + offsetX * sn + offsetZ * cs,
  }
}

// S-curve geometry parameters. Local layout (piece rotation 0): a south to
// north traversal that weaves right then left then right then left, ending
// heading north on the centerline.
//
// Built from four 90-degree arcs of radius SCURVE_ARC_RADIUS, plus short
// straight bridges at the entry and exit so the road's outer edge stays
// inside the cell. With SCURVE_ARC_RADIUS = 3 the eastmost point of the
// centerline is at x = 2 * radius = 6, so the outer road edge sits at
// x = 6 + TRACK_WIDTH / 2 = 10 = cell edge.
//
// Arc 1 (right, north -> east), Arc 2 (left, east -> north, offset east by
// 2r), Arc 3 (left, north -> west, weaves to opposite side), Arc 4 (right,
// west -> north, back to centerline at the exit).
//
// Vertical span of the four arcs: 4 * radius = 12. Bridges fill the
// remaining (CELL_SIZE - 4 * radius) / 2 = 4 units at each end.
export const SCURVE_ARC_RADIUS = 3
export const SCURVE_BRIDGE_LENGTH = (CELL_SIZE - 4 * SCURVE_ARC_RADIUS) / 2
const SCURVE_ARC_LENGTH = SCURVE_ARC_RADIUS * (Math.PI / 2)
const SCURVE_TOTAL_LENGTH =
  2 * SCURVE_BRIDGE_LENGTH + 4 * SCURVE_ARC_LENGTH
export const SCURVE_SAMPLE_COUNT = 49 // 4 arcs * ~12 samples + bridges

// Sample the S-curve centerline in LOCAL coordinates (cell origin at 0, 0,
// piece rotation 0). Returns SCURVE_SAMPLE_COUNT points evenly spaced by
// arc length from entry (south edge midpoint) to exit (north edge midpoint).
// Heading uses the game convention atan2(-dz, dx) so PI/2 means due north.
export function sampleScurveLocal(): SampledPoint[] {
  const samples: SampledPoint[] = []
  for (let i = 0; i < SCURVE_SAMPLE_COUNT; i++) {
    const s = (i / (SCURVE_SAMPLE_COUNT - 1)) * SCURVE_TOTAL_LENGTH
    samples.push(scurvePointAtArcLength(s))
  }
  return samples
}

// Mirror image of sampleScurveLocal across the local x = 0 axis. The
// scurveLeft piece bumps WEST (negative x) at its midpoint instead of east,
// otherwise sharing the same connectors and arc-length parameterization.
export function sampleScurveLeftLocal(): SampledPoint[] {
  return sampleScurveLocal().map((s) => ({
    x: -s.x,
    z: s.z,
    heading: Math.PI - s.heading,
  }))
}

// Arc step: parametrize a quarter-circle by t in [0, 1]. (cx, cz) is the
// arc center, startAngle is the math-frame angle from center to start
// position, dir = +1 for CCW motion, -1 for CW motion. Returns position and
// game-heading at parameter t.
function arcSample(
  cx: number,
  cz: number,
  startAngle: number,
  dir: 1 | -1,
  t: number,
): SampledPoint {
  const r = SCURVE_ARC_RADIUS
  const a = startAngle + dir * t * (Math.PI / 2)
  const x = cx + r * Math.cos(a)
  const z = cz + r * Math.sin(a)
  // Tangent for CCW motion is (-sin a, cos a); CW flips both signs.
  const tx = -dir * Math.sin(a)
  const tz = dir * Math.cos(a)
  return { x, z, heading: Math.atan2(-tz, tx) }
}

function scurvePointAtArcLength(s: number): SampledPoint {
  // Coordinate frame: +X is east, +Z is south, +Y is up. Headings use the
  // game's atan2(-z, x) convention, so PI/2 = north (-Z).
  const r = SCURVE_ARC_RADIUS
  const halfL = CELL_SIZE / 2
  const bridge = SCURVE_BRIDGE_LENGTH
  const arcLen = SCURVE_ARC_LENGTH

  // Entry straight bridge: from (0, halfL) heading north for `bridge` units.
  if (s <= bridge) {
    return { x: 0, z: halfL - s, heading: Math.PI / 2 }
  }
  s -= bridge
  const z0 = halfL - bridge // top of arc layout

  // Arc 1: right turn, center east of entry at (r, z0). CCW sweep from
  // a = PI (west of center) to a = 3*PI/2 (north of center). End:
  // (r, z0 - r) heading east.
  if (s <= arcLen) {
    return arcSample(r, z0, Math.PI, +1, s / arcLen)
  }
  s -= arcLen

  // Arc 2: left turn, center north of arc-1 end at (r, z0 - 2r). CW sweep
  // from a = PI/2 (south of center) to a = 0 (east of center). End:
  // (2r, z0 - 2r) heading north (offset east by 2r).
  if (s <= arcLen) {
    return arcSample(r, z0 - 2 * r, Math.PI / 2, -1, s / arcLen)
  }
  s -= arcLen

  // Arc 3: left turn around the SAME center as arc 2 (the path is a smooth
  // 180-degree CW sweep across the cell's vertical midline). CW sweep from
  // a = 0 (east of center) to a = -PI/2 (north of center). End:
  // (r, z0 - 3r) heading west.
  //
  // Geometrically arc 2 and arc 3 share a center because the car's heading
  // and the radius vector both flip 180 degrees across them, so they form
  // one continuous 180-degree CW sweep.
  if (s <= arcLen) {
    return arcSample(r, z0 - 2 * r, 0, -1, s / arcLen)
  }
  s -= arcLen

  // Arc 4: right turn, center north of arc-3 end at (r, z0 - 4r). CCW sweep
  // from a = PI/2 (south of center) to a = PI (west of center). End:
  // (0, z0 - 4r) heading north.
  if (s <= arcLen) {
    return arcSample(r, z0 - 4 * r, Math.PI / 2, +1, s / arcLen)
  }
  s -= arcLen

  // Exit straight bridge: from (0, z0 - 4r) heading north for `bridge` units.
  // With z0 = halfL - bridge and bridge = (CELL_SIZE - 4r)/2, the end z is
  // halfL - bridge - 4r - bridge = halfL - 2*bridge - 4r = -halfL.
  return { x: 0, z: z0 - 4 * r - s, heading: Math.PI / 2 }
}

// Apply a piece transform to a LOCAL sample. Rotation by `theta` radians
// clockwise (compass-wise) maps local (lx, lz) to
// (lx cos t - lz sin t, lx sin t + lz cos t) in the global x/z frame, since
// +Z points south on the top-down map. Heading (atan2(-z, x)) rotates by
// -theta radians.
//
// Stage 2 contract: the sampler reads `transform` directly. For
// v1-projectable pieces (every Stage 1 piece) the converter populates
// `transform.x = col * CELL_SIZE`, `transform.z = row * CELL_SIZE`, and
// `transform.theta = rotation * PI / 180` exactly, so the rotated samples
// produced here are bit-equal to the legacy
// `transformSample(..., piece.rotation)` output and the snapshot wall in
// tests/unit/pieceGeometry.test.ts stays pinned. For non-projectable
// pieces the rendered road follows the continuous theta directly.
export function transformSample(
  s: SampledPoint,
  transform: { x: number; z: number; theta: number },
): SampledPoint {
  const cs = Math.cos(transform.theta)
  const sn = Math.sin(transform.theta)
  return {
    x: transform.x + s.x * cs - s.z * sn,
    z: transform.z + s.x * sn + s.z * cs,
    heading: s.heading - transform.theta,
  }
}

// Cached local-frame samples for the S-curves. The right-bend version is
// computed by sampleScurveLocal(); the left-bend version is its mirror across
// the local x = 0 axis (negate x and reflect headings: atan2(-z, -x) = pi - h).
const SCURVE_LOCAL_SAMPLES = sampleScurveLocal()
const SCURVE_LEFT_LOCAL_SAMPLES = sampleScurveLeftLocal()

// Density of samples along a flex straight. Each cell-length of straight
// gets this many points, so a 5-cell flex straight produces ~40 samples and
// the centerline distance / wheel-contact / ribbon extrusion all stay smooth.
export const FLEX_STRAIGHT_SAMPLES_PER_CELL = 8

// World-space length in units of a flex straight described by `spec`. The
// path runs from the south edge midpoint of the anchor cell (z = +HALF) to
// the north edge midpoint of the cell at offset (spec.dr, spec.dc) (z =
// spec.dr * CELL_SIZE - HALF), so the vertical span is |spec.dr - 1| cells
// (which is |spec.dr| + 1 cells since spec.dr is always negative) and the
// lateral span is |spec.dc| cells. The +1 cell of vertical run beyond
// |spec.dr| accounts for the two half-cell skins (south edge of the anchor
// row plus north edge of the exit row) that together add one full cell.
export function flexStraightLength(spec: FlexStraightSpec): number {
  const dx = CELL_SIZE * spec.dc
  const dz = CELL_SIZE * spec.dr - CELL_SIZE
  return Math.hypot(dx, dz)
}

// Sample the flex straight centerline in LOCAL coordinates (anchor cell
// origin at (0, 0), piece rotation 0). Entry sits at the south edge midpoint
// of the anchor cell at (0, HALF); exit sits at the north edge midpoint of
// the cell at (spec.dr, spec.dc) at (CELL_SIZE * spec.dc, CELL_SIZE * spec.dr - HALF).
// The path is a straight line, so heading is constant across the samples.
export function sampleFlexStraightLocal(
  spec: FlexStraightSpec,
): SampledPoint[] {
  const startX = 0
  const startZ = HALF
  const endX = CELL_SIZE * spec.dc
  const endZ = CELL_SIZE * spec.dr - HALF
  const dx = endX - startX
  const dz = endZ - startZ
  const length = Math.hypot(dx, dz)
  const heading = Math.atan2(-dz, dx)
  const sampleCount = Math.max(
    2,
    Math.round((length / CELL_SIZE) * FLEX_STRAIGHT_SAMPLES_PER_CELL) + 1,
  )
  return Array.from({ length: sampleCount }, (_, i) => {
    const t = i / (sampleCount - 1)
    return {
      x: startX + dx * t,
      z: startZ + dz * t,
      heading,
    }
  })
}

export const SWEEP_SAMPLE_COUNT = 33
export const MEGA_SWEEP_SAMPLE_COUNT = 49
export const MEGA_SWEEP_ARC_RADIUS = 1.5 * CELL_SIZE
export const HAIRPIN_SAMPLE_COUNT = 65
export const HAIRPIN_ARC_RADIUS = 1.5 * CELL_SIZE
export const ARC45_SAMPLE_COUNT = 25
export const DIAGONAL_SAMPLE_COUNT = 17
export const WIDE_ARC45_SAMPLE_COUNT = 41
export const DIAGONAL_SWEEP_SAMPLE_COUNT = 33
export const KINK_SAMPLE_COUNT = 25
export const OFFSET_STRAIGHT_SAMPLE_COUNT = 41
export const GRAND_SWEEP_SAMPLE_COUNT = 57
const SWEEP_OVERSAMPLE_COUNT = 257

type BezierPoint = { x: number; z: number }

function cubicBezierPoint(
  p0: BezierPoint,
  p1: BezierPoint,
  p2: BezierPoint,
  p3: BezierPoint,
  t: number,
): BezierPoint {
  const mt = 1 - t
  return {
    x:
      mt * mt * mt * p0.x +
      3 * mt * mt * t * p1.x +
      3 * mt * t * t * p2.x +
      t * t * t * p3.x,
    z:
      mt * mt * mt * p0.z +
      3 * mt * mt * t * p1.z +
      3 * mt * t * t * p2.z +
      t * t * t * p3.z,
  }
}

function cubicBezierDerivative(
  p0: BezierPoint,
  p1: BezierPoint,
  p2: BezierPoint,
  p3: BezierPoint,
  t: number,
): { dx: number; dz: number } {
  const mt = 1 - t
  return {
    dx:
      3 * mt * mt * (p1.x - p0.x) +
      6 * mt * t * (p2.x - p1.x) +
      3 * t * t * (p3.x - p2.x),
    dz:
      3 * mt * mt * (p1.z - p0.z) +
      6 * mt * t * (p2.z - p1.z) +
      3 * t * t * (p3.z - p2.z),
  }
}

function equalArcLengthParameters(
  sampleCount: number,
  evaluator: (t: number) => BezierPoint,
): number[] {
  const parameters: number[] = []
  const cumulativeLengths: number[] = []
  let totalLength = 0
  let previous = evaluator(0)

  for (let i = 0; i < SWEEP_OVERSAMPLE_COUNT; i++) {
    const t = i / (SWEEP_OVERSAMPLE_COUNT - 1)
    const point = evaluator(t)
    parameters.push(t)
    if (i === 0) {
      cumulativeLengths.push(0)
      continue
    }
    totalLength += Math.hypot(point.x - previous.x, point.z - previous.z)
    cumulativeLengths.push(totalLength)
    previous = point
  }

  if (totalLength <= 0 || sampleCount <= 1) {
    return Array.from({ length: sampleCount }, (_, i) =>
      sampleCount <= 1 ? 0 : i / (sampleCount - 1),
    )
  }

  const remapped: number[] = []
  let segmentIndex = 1
  for (let i = 0; i < sampleCount; i++) {
    const targetLength = (i / (sampleCount - 1)) * totalLength
    while (
      segmentIndex < cumulativeLengths.length - 1 &&
      cumulativeLengths[segmentIndex] < targetLength
    ) {
      segmentIndex++
    }
    const prevLength = cumulativeLengths[segmentIndex - 1]
    const nextLength = cumulativeLengths[segmentIndex]
    const span = nextLength - prevLength
    const localT = span <= 0 ? 0 : (targetLength - prevLength) / span
    remapped.push(
      parameters[segmentIndex - 1] +
        (parameters[segmentIndex] - parameters[segmentIndex - 1]) * localT,
    )
  }
  return remapped
}

function mirrorSweepSamples(samples: SampledPoint[]): SampledPoint[] {
  return samples.map((s) => ({
    x: -s.x,
    z: s.z,
    heading: Math.PI - s.heading,
  }))
}

function sampleCubicLocal(
  sampleCount: number,
  p0: BezierPoint,
  p1: BezierPoint,
  p2: BezierPoint,
  p3: BezierPoint,
): SampledPoint[] {
  const samples: SampledPoint[] = []
  const sampleParameters = equalArcLengthParameters(sampleCount, (t) =>
    cubicBezierPoint(p0, p1, p2, p3, t),
  )
  for (const t of sampleParameters) {
    const { x, z } = cubicBezierPoint(p0, p1, p2, p3, t)
    const { dx, dz } = cubicBezierDerivative(p0, p1, p2, p3, t)
    samples.push({ x, z, heading: Math.atan2(-dz, dx) })
  }
  return samples
}

// Standard cubic-bezier coefficient for approximating a quarter circle:
// 4*(sqrt(2)-1)/3 ≈ 0.5523. With this coefficient the curve's minimum
// curvature radius stays well above TRACK_WIDTH / 2, so the extruded road
// ribbon never folds onto itself. Tighter coefficients (e.g. the original
// 0.12) collapsed the ribbon into a self-intersecting fan at the apex,
// producing z-fighting and a visible seam where the fold crossed back over
// the rest of the road.
const SWEEP_BEZIER_K = (4 * (Math.SQRT2 - 1)) / 3

export function sampleSweepRightLocal(): SampledPoint[] {
  const samples: SampledPoint[] = []
  const p0 = { x: 0, z: HALF }
  const p1 = { x: 0, z: HALF * SWEEP_BEZIER_K }
  const p2 = { x: HALF * SWEEP_BEZIER_K, z: 0 }
  const p3 = { x: HALF, z: 0 }
  const sampleParameters = equalArcLengthParameters(SWEEP_SAMPLE_COUNT, (t) =>
    cubicBezierPoint(p0, p1, p2, p3, t),
  )
  for (const t of sampleParameters) {
    const { x, z } = cubicBezierPoint(p0, p1, p2, p3, t)
    const { dx, dz } = cubicBezierDerivative(p0, p1, p2, p3, t)
    samples.push({ x, z, heading: Math.atan2(-dz, dx) })
  }
  return samples
}

export function sampleSweepLeftLocal(): SampledPoint[] {
  return mirrorSweepSamples(SWEEP_RIGHT_LOCAL_SAMPLES)
}

const SWEEP_RIGHT_LOCAL_SAMPLES = sampleSweepRightLocal()
const SWEEP_LEFT_LOCAL_SAMPLES = mirrorSweepSamples(SWEEP_RIGHT_LOCAL_SAMPLES)

export function sampleMegaSweepRightLocal(): SampledPoint[] {
  const samples: SampledPoint[] = []
  const p0 = { x: 0, z: HALF }
  const p1 = { x: 0, z: HALF - MEGA_SWEEP_ARC_RADIUS }
  const p2 = { x: HALF - MEGA_SWEEP_ARC_RADIUS, z: 0 }
  const p3 = { x: HALF, z: 0 }
  const sampleParameters = equalArcLengthParameters(
    MEGA_SWEEP_SAMPLE_COUNT,
    (t) => cubicBezierPoint(p0, p1, p2, p3, t),
  )
  for (const t of sampleParameters) {
    const { x, z } = cubicBezierPoint(p0, p1, p2, p3, t)
    const { dx, dz } = cubicBezierDerivative(p0, p1, p2, p3, t)
    samples.push({ x, z, heading: Math.atan2(-dz, dx) })
  }
  return samples
}

export function sampleMegaSweepLeftLocal(): SampledPoint[] {
  return mirrorSweepSamples(MEGA_SWEEP_RIGHT_LOCAL_SAMPLES)
}

const MEGA_SWEEP_RIGHT_LOCAL_SAMPLES = sampleMegaSweepRightLocal()
const MEGA_SWEEP_LEFT_LOCAL_SAMPLES = mirrorSweepSamples(
  MEGA_SWEEP_RIGHT_LOCAL_SAMPLES,
)

export function sampleHairpinLocal(): SampledPoint[] {
  return sampleCubicLocal(
    HAIRPIN_SAMPLE_COUNT,
    { x: -HALF, z: -CELL_SIZE },
    { x: -HALF + HAIRPIN_ARC_RADIUS, z: -CELL_SIZE },
    { x: -HALF + HAIRPIN_ARC_RADIUS, z: CELL_SIZE },
    { x: -HALF, z: CELL_SIZE },
  )
}

const HAIRPIN_LOCAL_SAMPLES = sampleHairpinLocal()

export function sampleHairpinTightLocal(): SampledPoint[] {
  return sampleCubicLocal(
    HAIRPIN_SAMPLE_COUNT,
    { x: -HALF, z: -CELL_SIZE },
    { x: CELL_SIZE * 0.55, z: -CELL_SIZE },
    { x: CELL_SIZE * 0.55, z: CELL_SIZE },
    { x: -HALF, z: CELL_SIZE },
  )
}

export function sampleHairpinWideLocal(): SampledPoint[] {
  return sampleCubicLocal(
    HAIRPIN_SAMPLE_COUNT,
    { x: -HALF, z: -CELL_SIZE },
    { x: CELL_SIZE * 2.0, z: -CELL_SIZE },
    { x: CELL_SIZE * 2.0, z: CELL_SIZE },
    { x: -HALF, z: CELL_SIZE },
  )
}

const HAIRPIN_TIGHT_LOCAL_SAMPLES = sampleHairpinTightLocal()
const HAIRPIN_WIDE_LOCAL_SAMPLES = sampleHairpinWideLocal()

export function sampleArc45Local(): SampledPoint[] {
  const samples: SampledPoint[] = []
  const p0 = { x: 0, z: HALF }
  const p1 = { x: 0, z: HALF - CELL_SIZE * 0.55 }
  const p2 = { x: HALF - CELL_SIZE * 0.55, z: -HALF + CELL_SIZE * 0.55 }
  const p3 = { x: HALF, z: -HALF }
  const sampleParameters = equalArcLengthParameters(ARC45_SAMPLE_COUNT, (t) =>
    cubicBezierPoint(p0, p1, p2, p3, t),
  )
  for (const t of sampleParameters) {
    const { x, z } = cubicBezierPoint(p0, p1, p2, p3, t)
    const { dx, dz } = cubicBezierDerivative(p0, p1, p2, p3, t)
    samples.push({ x, z, heading: Math.atan2(-dz, dx) })
  }
  return samples
}

export function sampleArc45LeftLocal(): SampledPoint[] {
  return sampleArc45Local().map((s) => ({
    x: -s.x,
    z: s.z,
    heading: Math.PI - s.heading,
  }))
}

export function sampleDiagonalLocal(): SampledPoint[] {
  return Array.from({ length: DIAGONAL_SAMPLE_COUNT }, (_, i) => {
    const t = i / (DIAGONAL_SAMPLE_COUNT - 1)
    return {
      x: -HALF + CELL_SIZE * t,
      z: HALF - CELL_SIZE * t,
      heading: Math.PI / 4,
    }
  })
}

const ARC45_LOCAL_SAMPLES = sampleArc45Local()
const ARC45_LEFT_LOCAL_SAMPLES = sampleArc45LeftLocal()
const DIAGONAL_LOCAL_SAMPLES = sampleDiagonalLocal()

export function sampleWideArc45RightLocal(): SampledPoint[] {
  return sampleCubicLocal(
    WIDE_ARC45_SAMPLE_COUNT,
    { x: 0, z: HALF },
    { x: 0, z: -CELL_SIZE * 0.6 },
    { x: CELL_SIZE * 0.9, z: -CELL_SIZE * 1.5 },
    { x: CELL_SIZE * 1.5, z: -CELL_SIZE * 1.5 },
  )
}

export function sampleWideArc45LeftLocal(): SampledPoint[] {
  return mirrorSweepSamples(sampleWideArc45RightLocal())
}

export function sampleDiagonalSweepRightLocal(): SampledPoint[] {
  return sampleCubicLocal(
    DIAGONAL_SWEEP_SAMPLE_COUNT,
    { x: -HALF, z: HALF },
    { x: 0, z: 0 },
    { x: 0, z: 0 },
    { x: HALF, z: HALF },
  )
}

export function sampleDiagonalSweepLeftLocal(): SampledPoint[] {
  return mirrorSweepSamples(sampleDiagonalSweepRightLocal())
}

export function sampleKinkRightLocal(): SampledPoint[] {
  return sampleCubicLocal(
    KINK_SAMPLE_COUNT,
    { x: 0, z: HALF },
    { x: CELL_SIZE * 0.28, z: CELL_SIZE * 0.2 },
    { x: CELL_SIZE * 0.28, z: -CELL_SIZE * 0.2 },
    { x: 0, z: -HALF },
  )
}

export function sampleKinkLeftLocal(): SampledPoint[] {
  return mirrorSweepSamples(sampleKinkRightLocal())
}

export function sampleOffsetStraightRightLocal(): SampledPoint[] {
  return sampleCubicLocal(
    OFFSET_STRAIGHT_SAMPLE_COUNT,
    { x: 0, z: HALF },
    { x: 0, z: -CELL_SIZE * 0.45 },
    { x: CELL_SIZE, z: -CELL_SIZE * 0.75 },
    { x: CELL_SIZE, z: -CELL_SIZE * 1.5 },
  )
}

export function sampleOffsetStraightLeftLocal(): SampledPoint[] {
  return mirrorSweepSamples(sampleOffsetStraightRightLocal())
}

export function sampleGrandSweepRightLocal(): SampledPoint[] {
  return sampleCubicLocal(
    GRAND_SWEEP_SAMPLE_COUNT,
    { x: 0, z: HALF },
    { x: 0, z: -CELL_SIZE * 1.0 },
    { x: CELL_SIZE * 0.8, z: -CELL_SIZE },
    { x: CELL_SIZE * 1.5, z: -CELL_SIZE },
  )
}

export function sampleGrandSweepLeftLocal(): SampledPoint[] {
  return mirrorSweepSamples(sampleGrandSweepRightLocal())
}

const WIDE_ARC45_RIGHT_LOCAL_SAMPLES = sampleWideArc45RightLocal()
const WIDE_ARC45_LEFT_LOCAL_SAMPLES = sampleWideArc45LeftLocal()
const DIAGONAL_SWEEP_RIGHT_LOCAL_SAMPLES = sampleDiagonalSweepRightLocal()
const DIAGONAL_SWEEP_LEFT_LOCAL_SAMPLES = sampleDiagonalSweepLeftLocal()
const KINK_RIGHT_LOCAL_SAMPLES = sampleKinkRightLocal()
const KINK_LEFT_LOCAL_SAMPLES = sampleKinkLeftLocal()
const OFFSET_STRAIGHT_RIGHT_LOCAL_SAMPLES = sampleOffsetStraightRightLocal()
const OFFSET_STRAIGHT_LEFT_LOCAL_SAMPLES = sampleOffsetStraightLeftLocal()
const GRAND_SWEEP_RIGHT_LOCAL_SAMPLES = sampleGrandSweepRightLocal()
const GRAND_SWEEP_LEFT_LOCAL_SAMPLES = sampleGrandSweepLeftLocal()

function buildScurveSamples(
  piece: Piece,
  entryDir: Dir,
): SampledPoint[] {
  // The local samples enter at the base south connector (rotation 0). After
  // rotating the piece, the rotated base entry's discrete dir is the
  // cardinal-snapped projection of `transform.theta`. If the loop traversal
  // enters from the OPPOSITE end, the car drives the path in reverse, so
  // flip the sample order and rotate every heading by 180 degrees so
  // headings still face the direction of travel.
  const localSamples =
    piece.type === 'scurveLeft'
      ? SCURVE_LEFT_LOCAL_SAMPLES
      : SCURVE_LOCAL_SAMPLES
  const transform = transformOf(piece)
  const baseEntryAfterRotation =
    (4 + cardinalTurnsOfTheta(transform.theta) * 2) % 8
  const reversed = entryDir !== baseEntryAfterRotation
  const transformed = localSamples.map((s) => transformSample(s, transform))
  if (!reversed) return transformed
  const out = transformed.slice().reverse()
  return out.map((s) => ({ x: s.x, z: s.z, heading: s.heading + Math.PI }))
}

function buildSweepSamples(
  piece: Piece,
  entryPort: ConnectorPort,
): SampledPoint[] {
  const localSamples = sweepLocalSamplesFor(piece)
  const [baseEntryAfterRotation] = connectorPortsOf(piece)
  const reversed =
    baseEntryAfterRotation === undefined ||
    !samePort(entryPort, baseEntryAfterRotation)
  const transform = transformOf(piece)
  const transformed = localSamples.map((s) => transformSample(s, transform))
  if (!reversed) return transformed
  const out = transformed.slice().reverse()
  return out.map((s) => ({ x: s.x, z: s.z, heading: s.heading + Math.PI }))
}

function sweepLocalSamplesFor(piece: Piece): SampledPoint[] {
  if (piece.type === 'diagonal') return DIAGONAL_LOCAL_SAMPLES
  if (piece.type === 'wideArc45Right') return WIDE_ARC45_RIGHT_LOCAL_SAMPLES
  if (piece.type === 'wideArc45Left') return WIDE_ARC45_LEFT_LOCAL_SAMPLES
  if (piece.type === 'diagonalSweepRight') return DIAGONAL_SWEEP_RIGHT_LOCAL_SAMPLES
  if (piece.type === 'diagonalSweepLeft') return DIAGONAL_SWEEP_LEFT_LOCAL_SAMPLES
  if (piece.type === 'kinkRight') return KINK_RIGHT_LOCAL_SAMPLES
  if (piece.type === 'kinkLeft') return KINK_LEFT_LOCAL_SAMPLES
  if (piece.type === 'offsetStraightRight') return OFFSET_STRAIGHT_RIGHT_LOCAL_SAMPLES
  if (piece.type === 'offsetStraightLeft') return OFFSET_STRAIGHT_LEFT_LOCAL_SAMPLES
  if (piece.type === 'grandSweepRight') return GRAND_SWEEP_RIGHT_LOCAL_SAMPLES
  if (piece.type === 'grandSweepLeft') return GRAND_SWEEP_LEFT_LOCAL_SAMPLES
  if (piece.type === 'arc45Left') return ARC45_LEFT_LOCAL_SAMPLES
  if (piece.type === 'arc45') return ARC45_LOCAL_SAMPLES
  if (piece.type === 'hairpinTight') return HAIRPIN_TIGHT_LOCAL_SAMPLES
  if (piece.type === 'hairpinWide') return HAIRPIN_WIDE_LOCAL_SAMPLES
  if (piece.type === 'hairpin') return HAIRPIN_LOCAL_SAMPLES
  if (piece.type === 'megaSweepLeft') return MEGA_SWEEP_LEFT_LOCAL_SAMPLES
  if (piece.type === 'megaSweepRight') return MEGA_SWEEP_RIGHT_LOCAL_SAMPLES
  if (piece.type === 'flexStraight') return sampleFlexStraightLocal(flexSpecOf(piece))
  if (piece.type === 'sweepLeft') return SWEEP_LEFT_LOCAL_SAMPLES
  return SWEEP_RIGHT_LOCAL_SAMPLES
}

export function buildTrackPath(
  pieces: Piece[],
  checkpointCount?: number,
  checkpoints?: TrackCheckpoint[],
): TrackPath {
  if (pieces.length === 0) {
    throw new Error('empty pieces')
  }
  // Normalize to v2 (every piece has transform populated) so the geometry
  // layer can read transform without a fallback. Idempotent. See the same
  // call at the head of validateClosedLoop.
  pieces = convertV1Pieces(pieces)

  const first = pieces[0]
  const [portA, portB] = connectorPortsOf(first)
  if (portA === undefined || portB === undefined) {
    throw new Error('start piece has fewer than two connectors')
  }
  let exitPort = getStartExitPort(pieces)!
  let entryPort = samePort(exitPort, portA) ? portB : portA
  let exitDir: Dir = exitPort.dir
  let entryDir: Dir = entryPort.dir
  let current = first

  const order: OrderedPiece[] = []
  const seen = new Set<string>()

  while (order.length < pieces.length) {
    const key = cellKey(current.row, current.col)
    if (seen.has(key)) break
    seen.add(key)
    // Source the piece center from `transform.x / z` so non-projectable
    // pieces render at the right world coordinates. For grid-aligned
    // pieces the converter sets `transform.x = col * CELL_SIZE` and
    // `transform.z = row * CELL_SIZE` exactly, so this is bit-equal to
    // the legacy `cellCenter(current.row, current.col)`.
    const transform = transformOf(current)
    const center: Vec3 = { x: transform.x, y: 0, z: transform.z }
    const isCorner = current.type === 'left90' || current.type === 'right90'
    const isScurve =
      current.type === 'scurve' || current.type === 'scurveLeft'
    const isSweep =
      current.type === 'sweepRight' ||
      current.type === 'sweepLeft' ||
      current.type === 'megaSweepRight' ||
      current.type === 'megaSweepLeft' ||
      current.type === 'hairpin' ||
      current.type === 'hairpinTight' ||
      current.type === 'hairpinWide' ||
      current.type === 'arc45' ||
      current.type === 'arc45Left' ||
      current.type === 'diagonal' ||
      current.type === 'wideArc45Right' ||
      current.type === 'wideArc45Left' ||
      current.type === 'diagonalSweepRight' ||
      current.type === 'diagonalSweepLeft' ||
      current.type === 'kinkRight' ||
      current.type === 'kinkLeft' ||
      current.type === 'offsetStraightRight' ||
      current.type === 'offsetStraightLeft' ||
      current.type === 'grandSweepRight' ||
      current.type === 'grandSweepLeft' ||
      current.type === 'flexStraight'
    order.push({
      piece: current,
      entryDir,
      exitDir,
      center,
      entry: portMidpoint(current, entryPort),
      exit: portMidpoint(current, exitPort),
      arcCenter: isCorner ? computeArcCenter(transform, entryDir, exitDir) : null,
      samples: isScurve
        ? buildScurveSamples(current, entryDir)
        : isSweep
          ? buildSweepSamples(current, entryPort)
          : null,
    })

    const next = findConnectedNeighbor(current, exitPort, pieces)
    if (!next) break
    const nextEntryPort = matchingEntryPort(next, current)
    const nextExitPort = otherConnectorPort(next, nextEntryPort)
    current = next
    entryPort = nextEntryPort
    exitPort = nextExitPort
    entryDir = entryPort.dir
    exitDir = exitPort.dir
  }

  const segment: PathSegment = {
    id: 'main',
    order,
    closesLoop: order.length === pieces.length,
  }
  const cellToOrderIdx = new Map<string, number>()
  const cellToLocators = new Map<string, PathLocator[]>()
  for (let i = 0; i < order.length; i++) {
    const p = order[i].piece
    const key = cellKey(p.row, p.col)
    cellToOrderIdx.set(key, i)
    for (const footprintKey of footprintCellKeys(p)) {
      const locators = cellToLocators.get(footprintKey) ?? []
      locators.push({ segmentId: segment.id, idx: i })
      cellToLocators.set(footprintKey, locators)
    }
  }

  // Walk inward along the centerline (arc for corners, straight for straights)
  // so spawn and stripe both land on-track even when the start piece is a turn.
  const SPAWN_INSET = 2
  const FINISH_LINE_INSET = 5
  const spawn = pointAlongStartPiece(order[0], SPAWN_INSET)
  const finishLine = pointAlongStartPiece(order[0], FINISH_LINE_INSET)

  const cpTriggerPieceIdx =
    checkpoints !== undefined && checkpoints.length > 0
      ? computeExplicitCpTriggerPieceIdx(order, checkpoints)
      : computeCpTriggerPieceIdx(order.length, checkpointCount)
  const checkpointMarkers = cpTriggerPieceIdx.slice(0, -1).map((pieceIdx, cpId) => {
    const sample = samplePieceAt(order[pieceIdx], 0.5)
    return {
      cpId,
      pieceIdx,
      position: sample.position,
      heading: sample.heading,
    }
  })

  return {
    segments: [segment],
    order,
    cellToOrderIdx,
    cellToLocators,
    spawn,
    finishLine,
    cpTriggerPieceIdx,
    checkpointMarkers,
  }
}

export function samplePieceAt(
  op: OrderedPiece,
  t: number,
): { position: Vec3; heading: number } {
  if (op.samples !== null) {
    const samples = op.samples
    const last = samples.length - 1
    const tc = Math.max(0, Math.min(1, t))
    const f = tc * last
    const i = Math.min(last - 1, Math.floor(f))
    const a = samples[i]
    const b = samples[i + 1]
    const k = f - i
    // Unwrap heading delta into [-pi, pi] before lerping so the S-curve never
    // pops through 2pi at sample boundaries.
    let dh = b.heading - a.heading
    while (dh > Math.PI) dh -= 2 * Math.PI
    while (dh < -Math.PI) dh += 2 * Math.PI
    return {
      position: { x: a.x + (b.x - a.x) * k, y: 0, z: a.z + (b.z - a.z) * k },
      heading: a.heading + dh * k,
    }
  }
  if (op.arcCenter === null) {
    const dx = op.exit.x - op.entry.x
    const dz = op.exit.z - op.entry.z
    return {
      position: { x: op.entry.x + dx * t, y: 0, z: op.entry.z + dz * t },
      heading: Math.atan2(-dz, dx),
    }
  }
  const { cx, cz } = op.arcCenter
  const a1 = Math.atan2(op.entry.z - cz, op.entry.x - cx)
  const a2 = Math.atan2(op.exit.z - cz, op.exit.x - cx)
  let delta = a2 - a1
  while (delta > Math.PI) delta -= 2 * Math.PI
  while (delta < -Math.PI) delta += 2 * Math.PI
  const a = a1 + delta * t
  const sign = delta >= 0 ? 1 : -1
  // Tangent along direction of travel: radius rotated 90 degrees toward the exit.
  const tx = sign * -Math.sin(a)
  const tz = sign * Math.cos(a)
  return {
    position: {
      x: cx + CORNER_ARC_RADIUS * Math.cos(a),
      y: 0,
      z: cz + CORNER_ARC_RADIUS * Math.sin(a),
    },
    heading: Math.atan2(-tz, tx),
  }
}

function pointAlongStartPiece(
  first: OrderedPiece,
  arcLength: number,
): { position: Vec3; heading: number } {
  let totalLength: number
  if (first.samples !== null) {
    totalLength = polylineLength(first.samples)
  } else if (first.arcCenter === null) {
    totalLength = CELL_SIZE
  } else {
    totalLength = CORNER_ARC_LENGTH
  }
  return samplePieceAt(first, arcLength / totalLength)
}

function polylineLength(samples: SampledPoint[]): number {
  let total = 0
  for (let i = 0; i < samples.length - 1; i++) {
    total += Math.hypot(
      samples[i + 1].x - samples[i].x,
      samples[i + 1].z - samples[i].z,
    )
  }
  return total
}

export function trackCenter(path: TrackPath): { x: number; z: number } {
  let sumX = 0
  let sumZ = 0
  for (const op of path.order) {
    sumX += op.center.x
    sumZ += op.center.z
  }
  const n = path.order.length
  return { x: sumX / n, z: sumZ / n }
}

export function worldToCell(x: number, z: number): { row: number; col: number } {
  return {
    row: Math.round(z / CELL_SIZE),
    col: Math.round(x / CELL_SIZE),
  }
}

// Closest-point distance from (x,z) to the piece centerline. Called once per frame.
export function distanceToCenterline(
  op: OrderedPiece,
  x: number,
  z: number,
): number {
  if (op.samples !== null) {
    return distanceToPolyline(op.samples, x, z)
  }
  if (op.arcCenter === null) {
    return distanceToSegment(op.entry, op.exit, x, z)
  }
  const { cx, cz } = op.arcCenter
  return Math.abs(Math.hypot(x - cx, z - cz) - HALF)
}

function distanceToPolyline(
  samples: SampledPoint[],
  x: number,
  z: number,
): number {
  let best = Infinity
  for (let i = 0; i < samples.length - 1; i++) {
    const a = samples[i]
    const b = samples[i + 1]
    const d = distanceToSegment(
      { x: a.x, y: 0, z: a.z },
      { x: b.x, y: 0, z: b.z },
      x,
      z,
    )
    if (d < best) best = d
  }
  return best
}

function distanceToSegment(a: Vec3, b: Vec3, x: number, z: number): number {
  const dx = b.x - a.x
  const dz = b.z - a.z
  const len2 = dx * dx + dz * dz
  if (len2 === 0) return Math.hypot(x - a.x, z - a.z)
  let t = ((x - a.x) * dx + (z - a.z) * dz) / len2
  t = Math.max(0, Math.min(1, t))
  const px = a.x + t * dx
  const pz = a.z + t * dz
  return Math.hypot(x - px, z - pz)
}
