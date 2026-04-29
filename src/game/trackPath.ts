import type { Piece } from '@/lib/schemas'
import { DIR_OFFSETS, cellKey, connectorsOf, opposite, type Dir } from './track'

// Travel direction is encoded by pieces[1]'s cell-adjacency to pieces[0]:
// whichever connector points at pieces[1] is the exit. Falls back to connB
// when pieces[1] is absent or non-adjacent.
export function getStartExitDir(pieces: Piece[]): Dir | null {
  if (pieces.length === 0) return null
  const first = pieces[0]
  const [connA, connB] = connectorsOf(first)
  if (pieces.length >= 2) {
    const second = pieces[1]
    const aOff = DIR_OFFSETS[connA]
    if (
      first.row + aOff.dr === second.row &&
      first.col + aOff.dc === second.col
    ) {
      return connA
    }
  }
  return connB
}

export const CELL_SIZE = 20
export const TRACK_WIDTH = 8
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

export interface TrackPath {
  order: OrderedPiece[]
  cellToOrderIdx: Map<string, number>
  spawn: { position: Vec3; heading: number }
  finishLine: { position: Vec3; heading: number }
  // Path-order index of the piece whose entry triggers checkpoint k. The last
  // entry is always 0 (lap completes when the car re-enters the start piece).
  cpTriggerPieceIdx: number[]
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

export function cellCenter(row: number, col: number): Vec3 {
  return { x: col * CELL_SIZE, y: 0, z: row * CELL_SIZE }
}

const HALF = CELL_SIZE / 2
const EDGE_OFFSETS: Record<Dir, { dx: number; dz: number }> = {
  0: { dx: 0, dz: -HALF },
  1: { dx: HALF, dz: 0 },
  2: { dx: 0, dz: HALF },
  3: { dx: -HALF, dz: 0 },
}

export function edgeMidpoint(row: number, col: number, dir: Dir): Vec3 {
  const c = cellCenter(row, col)
  const { dx, dz } = EDGE_OFFSETS[dir]
  return { x: c.x + dx, y: 0, z: c.z + dz }
}

// Heading in radians where 0 = +X (east) and increases counter-clockwise around +Y.
// North (-Z) = Math.PI/2, East (+X) = 0, South (+Z) = -Math.PI/2, West (-X) = Math.PI.
const DIR_HEADINGS: Record<Dir, number> = {
  0: Math.PI / 2,
  1: 0,
  2: -Math.PI / 2,
  3: Math.PI,
}

export function dirToHeading(d: Dir): number {
  return DIR_HEADINGS[d]
}

function otherConnector(piece: Piece, entry: Dir): Dir {
  const [a, b] = connectorsOf(piece)
  return entry === a ? b : a
}

function computeArcCenter(
  center: Vec3,
  entryDir: Dir,
  exitDir: Dir,
): { cx: number; cz: number } {
  const e1 = EDGE_OFFSETS[entryDir]
  const e2 = EDGE_OFFSETS[exitDir]
  return { cx: center.x + e1.dx + e2.dx, cz: center.z + e1.dz + e2.dz }
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

// Apply piece rotation to a LOCAL sample, then translate to the piece center.
// Rotation R degrees clockwise (compass-wise) maps local (lx, lz) to
// (lx cos R - lz sin R, lx sin R + lz cos R) in the global x/z frame, since
// +Z points south on the top-down map. Heading (atan2(-z, x)) rotates by
// -R radians.
export function transformSample(
  s: SampledPoint,
  centerX: number,
  centerZ: number,
  rotationDeg: number,
): SampledPoint {
  const R = (rotationDeg * Math.PI) / 180
  const cs = Math.cos(R)
  const sn = Math.sin(R)
  return {
    x: centerX + s.x * cs - s.z * sn,
    z: centerZ + s.x * sn + s.z * cs,
    heading: s.heading - R,
  }
}

// Cached local-frame samples for the S-curves. The right-bend version is
// computed by sampleScurveLocal(); the left-bend version is its mirror across
// the local x = 0 axis (negate x and reflect headings: atan2(-z, -x) = pi - h).
const SCURVE_LOCAL_SAMPLES = sampleScurveLocal()
const SCURVE_LEFT_LOCAL_SAMPLES = sampleScurveLeftLocal()

export const SWEEP_SAMPLE_COUNT = 33
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

export function sampleSweepRightLocal(): SampledPoint[] {
  const samples: SampledPoint[] = []
  const p0 = { x: 0, z: HALF }
  const p1 = { x: 0, z: HALF * 0.12 }
  const p2 = { x: HALF * 0.12, z: 0 }
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

function buildScurveSamples(
  piece: Piece,
  center: Vec3,
  entryDir: Dir,
): SampledPoint[] {
  // The local samples enter at the base south connector (rotation 0). After
  // rotating the piece, the rotated base entry sits at dir (2 + rot/90) % 4.
  // If the loop traversal enters from the OPPOSITE end, the car drives the
  // path in reverse, so flip the sample order and rotate every heading by
  // 180 degrees so headings still face the direction of travel.
  const localSamples =
    piece.type === 'scurveLeft'
      ? SCURVE_LEFT_LOCAL_SAMPLES
      : SCURVE_LOCAL_SAMPLES
  const baseEntryAfterRotation = (2 + piece.rotation / 90) % 4
  const reversed = entryDir !== baseEntryAfterRotation
  const transformed = localSamples.map((s) =>
    transformSample(s, center.x, center.z, piece.rotation),
  )
  if (!reversed) return transformed
  const out = transformed.slice().reverse()
  return out.map((s) => ({ x: s.x, z: s.z, heading: s.heading + Math.PI }))
}

function buildSweepSamples(
  piece: Piece,
  center: Vec3,
  entryDir: Dir,
): SampledPoint[] {
  const localSamples =
    piece.type === 'sweepLeft'
      ? SWEEP_LEFT_LOCAL_SAMPLES
      : SWEEP_RIGHT_LOCAL_SAMPLES
  const baseEntryAfterRotation = (2 + piece.rotation / 90) % 4
  const reversed = entryDir !== baseEntryAfterRotation
  const transformed = localSamples.map((s) =>
    transformSample(s, center.x, center.z, piece.rotation),
  )
  if (!reversed) return transformed
  const out = transformed.slice().reverse()
  return out.map((s) => ({ x: s.x, z: s.z, heading: s.heading + Math.PI }))
}

export function buildTrackPath(
  pieces: Piece[],
  checkpointCount?: number,
): TrackPath {
  if (pieces.length === 0) {
    throw new Error('empty pieces')
  }

  const byCell = new Map<string, Piece>()
  for (const p of pieces) byCell.set(cellKey(p.row, p.col), p)

  const first = pieces[0]
  const [connA, connB] = connectorsOf(first)
  let exitDir: Dir = getStartExitDir(pieces)!
  let entryDir: Dir = exitDir === connA ? connB : connA
  let current = first

  const order: OrderedPiece[] = []
  const seen = new Set<string>()

  while (order.length < pieces.length) {
    const key = cellKey(current.row, current.col)
    if (seen.has(key)) break
    seen.add(key)
    const center = cellCenter(current.row, current.col)
    const isCorner = current.type === 'left90' || current.type === 'right90'
    const isScurve =
      current.type === 'scurve' || current.type === 'scurveLeft'
    const isSweep =
      current.type === 'sweepRight' || current.type === 'sweepLeft'
    order.push({
      piece: current,
      entryDir,
      exitDir,
      center,
      entry: edgeMidpoint(current.row, current.col, entryDir),
      exit: edgeMidpoint(current.row, current.col, exitDir),
      arcCenter: isCorner ? computeArcCenter(center, entryDir, exitDir) : null,
      samples: isScurve
        ? buildScurveSamples(current, center, entryDir)
        : isSweep
          ? buildSweepSamples(current, center, entryDir)
          : null,
    })

    const { dr, dc } = DIR_OFFSETS[exitDir]
    const nextKey = cellKey(current.row + dr, current.col + dc)
    const next = byCell.get(nextKey)
    if (!next) break
    const nextEntry = opposite(exitDir)
    const nextExit = otherConnector(next, nextEntry)
    current = next
    entryDir = nextEntry
    exitDir = nextExit
  }

  const cellToOrderIdx = new Map<string, number>()
  for (let i = 0; i < order.length; i++) {
    const p = order[i].piece
    cellToOrderIdx.set(cellKey(p.row, p.col), i)
  }

  // Walk inward along the centerline (arc for corners, straight for straights)
  // so spawn and stripe both land on-track even when the start piece is a turn.
  const SPAWN_INSET = 2
  const FINISH_LINE_INSET = 5
  const spawn = pointAlongStartPiece(order[0], SPAWN_INSET)
  const finishLine = pointAlongStartPiece(order[0], FINISH_LINE_INSET)

  const cpTriggerPieceIdx = computeCpTriggerPieceIdx(
    order.length,
    checkpointCount,
  )

  return { order, cellToOrderIdx, spawn, finishLine, cpTriggerPieceIdx }
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
