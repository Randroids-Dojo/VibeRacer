// Trackside scenery: pure helpers that decide where decorative props sit
// around the racing line. Trees fill the grass area outside the track,
// traffic cones flag the outside of every corner so the apex reads at speed,
// and small barrier blocks frame the start / finish gate. The renderer side
// (sceneBuilder.ts) turns these items into three.js meshes; the math lives
// here so it stays unit-testable without instantiating WebGL.
//
// Placement is deterministic: the seed comes from the track's piece layout so
// the same track always reads the same way and a player can mentally bookmark
// "the tree before the hairpin" across sessions. A flat list of items keeps
// the renderer side trivial: one mesh per item, grouped under a single Group
// so a Settings toggle can flip visibility in O(1).
//
// Items are kept clear of the asphalt by the SCENERY_TRACK_CLEARANCE radius
// check below. The clearance is generous (a couple of meters past the track
// edge) so a slight off-track excursion does not slam the car into a hedge.

import {
  CELL_SIZE,
  TRACK_WIDTH,
  distanceToCenterline,
  type OrderedPiece,
  type TrackPath,
} from './trackPath'

// Radial keep-out from the road centerline, in world units. Items whose
// candidate position falls inside this radius are rejected. CELL_SIZE/2 is the
// max distance from a track piece's center to any point in its cell, so this
// number being a little larger than TRACK_WIDTH/2 keeps trees off the road
// without leaving an obvious dead band of bare grass.
export const SCENERY_TRACK_CLEARANCE = TRACK_WIDTH / 2 + 2.4

// Radial extent of the scenery field around the track. We sample candidate
// positions on a regular grid spanning the track bounding box plus this
// padding so the trees frame the loop cleanly without spilling off into the
// far distance where the camera never sees them anyway.
export const SCENERY_RING_PADDING = CELL_SIZE * 1.5

// Grid spacing for the candidate sample lattice. Smaller numbers pack more
// trees but also cost more wall clock during scene build; this number is
// tuned so the default oval ships ~30 trees, which reads as forested without
// overwhelming the cartoony aesthetic.
export const SCENERY_GRID_SPACING = 6

// Per-cell jitter applied to the candidate position so the trees do not
// read as a perfect grid. Bounded to half the spacing so neighbors never
// swap positions.
export const SCENERY_JITTER_RANGE = SCENERY_GRID_SPACING * 0.45

// Probability a passing-the-clearance candidate cell becomes a tree. Lower
// numbers thin the forest; higher numbers pack it. 0.55 reads as a healthy
// stand without choking the camera.
export const SCENERY_TREE_DENSITY = 0.55

// Cone placement: cones sit just outside the apex of every corner so the
// outside line reads as a tight wall of orange. The offset is the radial
// distance from the road centerline; OUTER_RADIUS = CELL_SIZE/2 + TRACK_WIDTH/2
// is the outer edge of the asphalt, so this lands cones a little beyond it.
export const SCENERY_CONE_RADIUS_OFFSET = TRACK_WIDTH / 2 + 1.0

// How many cones per corner. Spread evenly across the outside arc.
export const SCENERY_CONES_PER_CORNER = 4

// Tree size bounds. Trees scale randomly within these so the forest looks
// alive instead of cookie-cutter. The renderer multiplies its cone + cylinder
// dimensions by the scale factor.
export const SCENERY_TREE_SCALE_MIN = 0.85
export const SCENERY_TREE_SCALE_MAX = 1.45

// Cartoony palette. Trees use one of two foliage greens picked from the seed
// so the forest reads as varied without exploding into a per-tree color
// picker. Trunk is a single warm brown for everyone.
export const SCENERY_TREE_FOLIAGE_HEX = [0x4caf50, 0x66bb6a] as const
export const SCENERY_TREE_TRUNK_HEX = 0x6b4423
export const SCENERY_CONE_HEX = 0xff7a1a
export const SCENERY_BARRIER_HEX_RED = 0xd0241b
export const SCENERY_BARRIER_HEX_WHITE = 0xf0f0f0

export type SceneryKind = 'tree' | 'cone' | 'barrier'

export interface SceneryItem {
  kind: SceneryKind
  // World-space ground position. y is set by the renderer per-kind (cones sit
  // on the ground, trees lift their pivot to the trunk base, barriers center
  // on their own height).
  x: number
  z: number
  // Yaw rotation about +Y in radians. Trees use a random yaw so identical
  // models do not look stamped; cones and barriers point along the track.
  rotationY: number
  // Uniform scale factor. Trees vary in [SCENERY_TREE_SCALE_MIN,
  // SCENERY_TREE_SCALE_MAX]; cones and barriers ship at scale 1 today.
  scale: number
  // Hex color override the renderer applies to the prop's primary surface.
  // Trees use this for the foliage cone; cones use it for the body; barriers
  // use it to alternate red / white along the gate frame.
  colorHex: number
}

// Pure helpers exported for tests. ---------------------------------------

// Tiny seeded LCG (Mulberry32 variant). Same flavor as the confetti helper so
// the scenery layout is deterministic from a seed: the same track always
// produces the same tree positions across sessions. A return of 0 from the
// raw seed seeds with 1 to avoid the constant-zero degenerate path.
export function makeSceneryRng(seed: number): () => number {
  let s = seed >>> 0
  if (s === 0) s = 1
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Stable seed derived from a track path. Folds piece type, row, col, and
// rotation into a 32-bit integer so two identical layouts seed the same RNG
// and two distinct layouts almost never collide. We do not depend on the
// V8-specific string-hash here because tests run under Node and the browser
// runs under V8 / SpiderMonkey / WebKit; an integer hash is portable.
export function seedFromPath(path: TrackPath): number {
  let h = 2166136261 >>> 0
  for (const op of path.order) {
    const p = op.piece
    h = Math.imul(h ^ p.type.charCodeAt(0), 16777619) >>> 0
    h = Math.imul(h ^ (p.row | 0), 16777619) >>> 0
    h = Math.imul(h ^ (p.col | 0), 16777619) >>> 0
    h = Math.imul(h ^ (p.rotation | 0), 16777619) >>> 0
  }
  return h
}

// Axis-aligned bounding box around every piece center, padded by SCENERY_RING_PADDING.
// Useful both for the candidate grid and for unit tests asserting items stay
// inside the expected region.
export function sceneryBounds(path: TrackPath): {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
} {
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (const op of path.order) {
    if (op.center.x < minX) minX = op.center.x
    if (op.center.x > maxX) maxX = op.center.x
    if (op.center.z < minZ) minZ = op.center.z
    if (op.center.z > maxZ) maxZ = op.center.z
  }
  return {
    minX: minX - SCENERY_RING_PADDING,
    maxX: maxX + SCENERY_RING_PADDING,
    minZ: minZ - SCENERY_RING_PADDING,
    maxZ: maxZ + SCENERY_RING_PADDING,
  }
}

// Minimum distance from (x, z) to the centerline of any piece on the path.
// Used to enforce the SCENERY_TRACK_CLEARANCE keep-out below. Reuses the
// existing distanceToCenterline helper which already handles straights,
// arcs, and sampled S-curves.
export function distanceToTrack(
  path: TrackPath,
  x: number,
  z: number,
): number {
  let best = Infinity
  for (const op of path.order) {
    const d = distanceToCenterline(op, x, z)
    if (d < best) best = d
  }
  return best
}

// Returns a single tree if the candidate cell clears the track and passes the
// density coin-flip; null otherwise. Pulled out so unit tests can drive the
// gate logic without mocking the whole grid loop.
export function maybeTreeAt(
  path: TrackPath,
  cx: number,
  cz: number,
  rng: () => number,
  opts?: {
    clearance?: number
    density?: number
  },
): SceneryItem | null {
  const clearance = opts?.clearance ?? SCENERY_TRACK_CLEARANCE
  const density = opts?.density ?? SCENERY_TREE_DENSITY
  if (rng() > density) return null
  const jx = cx + (rng() - 0.5) * 2 * SCENERY_JITTER_RANGE
  const jz = cz + (rng() - 0.5) * 2 * SCENERY_JITTER_RANGE
  if (distanceToTrack(path, jx, jz) < clearance) return null
  const scale =
    SCENERY_TREE_SCALE_MIN +
    rng() * (SCENERY_TREE_SCALE_MAX - SCENERY_TREE_SCALE_MIN)
  const rotationY = rng() * Math.PI * 2
  const foliageIdx = Math.floor(rng() * SCENERY_TREE_FOLIAGE_HEX.length)
  return {
    kind: 'tree',
    x: jx,
    z: jz,
    rotationY,
    scale,
    colorHex: SCENERY_TREE_FOLIAGE_HEX[foliageIdx],
  }
}

// Build the set of trees scattered across the grass surrounding the track.
// Walks a regular grid spanning the bounding box; each cell that clears the
// track and passes a per-cell density check turns into one tree. Ordering is
// deterministic so the seeded RNG produces the same layout every call.
export function buildTreeScenery(
  path: TrackPath,
  rng: () => number,
  opts?: {
    spacing?: number
    clearance?: number
    density?: number
  },
): SceneryItem[] {
  const spacing = opts?.spacing ?? SCENERY_GRID_SPACING
  const items: SceneryItem[] = []
  const bounds = sceneryBounds(path)
  // Start the grid on a stable phase so two adjacent cells of the same track
  // bounding box do not jitter against each other in a way that depends on
  // bounds parity.
  for (let z = bounds.minZ; z <= bounds.maxZ; z += spacing) {
    for (let x = bounds.minX; x <= bounds.maxX; x += spacing) {
      const item = maybeTreeAt(path, x, z, rng, opts)
      if (item) items.push(item)
    }
  }
  return items
}

// Build cones along the OUTSIDE of every corner. The outside of a corner is
// the side away from the arc center: opposite of where the kerbs sit (the
// kerbs hug the inner radius). Cones go on the outside so they read as a
// "do not let go wide here" cue from the driver's seat. S-curves and
// straights get no cones in v1; cones at every straight would just be noise.
export function buildCornerCones(
  path: TrackPath,
  opts?: {
    radiusOffset?: number
    conesPerCorner?: number
  },
): SceneryItem[] {
  const radiusOffset = opts?.radiusOffset ?? SCENERY_CONE_RADIUS_OFFSET
  const conesPerCorner = opts?.conesPerCorner ?? SCENERY_CONES_PER_CORNER
  if (conesPerCorner < 1 || !Number.isFinite(conesPerCorner)) return []
  const items: SceneryItem[] = []
  for (const op of path.order) {
    if (op.arcCenter === null) continue
    if (op.piece.type !== 'left90' && op.piece.type !== 'right90') continue
    const cones = conesForCorner(op, radiusOffset, conesPerCorner)
    for (const c of cones) items.push(c)
  }
  return items
}

// Cones for one corner. The outer-edge arc is centered on the same arcCenter
// as the road but at radius (CELL_SIZE/2 + TRACK_WIDTH/2 + radiusOffset).
// Cones are spaced evenly across the angular sweep so the line reads as a
// tight wall of orange around the apex.
function conesForCorner(
  op: OrderedPiece,
  radiusOffset: number,
  conesPerCorner: number,
): SceneryItem[] {
  if (op.arcCenter === null) return []
  const { cx, cz } = op.arcCenter
  const outerRadius = CELL_SIZE / 2 + TRACK_WIDTH / 2 + radiusOffset
  const a1 = Math.atan2(op.entry.z - cz, op.entry.x - cx)
  const a2 = Math.atan2(op.exit.z - cz, op.exit.x - cx)
  let delta = a2 - a1
  while (delta > Math.PI) delta -= 2 * Math.PI
  while (delta < -Math.PI) delta += 2 * Math.PI
  const items: SceneryItem[] = []
  for (let k = 0; k < conesPerCorner; k++) {
    const t = (k + 0.5) / conesPerCorner
    const a = a1 + delta * t
    const x = cx + outerRadius * Math.cos(a)
    const z = cz + outerRadius * Math.sin(a)
    // Heading for the cone (rotation about +Y) faces along the local arc
    // tangent so a downstream barrier-style mesh would read straight; cones
    // are rotationally symmetric so this is mostly cosmetic but stays
    // consistent with the kerb math.
    const sign = delta >= 0 ? 1 : -1
    const tx = sign * -Math.sin(a)
    const tz = sign * Math.cos(a)
    const rotationY = Math.atan2(-tz, tx)
    items.push({
      kind: 'cone',
      x,
      z,
      rotationY,
      scale: 1,
      colorHex: SCENERY_CONE_HEX,
    })
  }
  return items
}

// Build the start / finish gate barriers: a small line of red / white
// alternating blocks framing each side of the start piece beyond where the
// gate poles sit so the start line reads as a more substantial landmark.
// Five blocks per side, color alternates, all heading-aligned.
export const SCENERY_BARRIERS_PER_SIDE = 5
export const SCENERY_BARRIER_SPACING = 1.6
export const SCENERY_BARRIER_OFFSET = TRACK_WIDTH / 2 + 1.4

export function buildStartBarriers(path: TrackPath): SceneryItem[] {
  const items: SceneryItem[] = []
  const finish = path.finishLine
  // Perpendicular to the heading: rotate (cos, sin) by +90 degrees to get
  // the lateral offset direction. heading is the game-frame angle where 0 = +X.
  // Game heading uses atan2(-z, x) so the perpendicular vector in (x, z) is
  // (sin h, cos h) for left side, (-sin h, -cos h) for right.
  const sx = Math.sin(finish.heading)
  const cz = Math.cos(finish.heading)
  // Forward offset along the heading so barriers sit alongside the gate, not
  // on top of the finish stripe.
  const fx = Math.cos(finish.heading)
  const fz = -Math.sin(finish.heading)
  for (let side = 0; side < 2; side++) {
    const sideSign = side === 0 ? 1 : -1
    const lateralX = sideSign * sx * SCENERY_BARRIER_OFFSET
    const lateralZ = sideSign * cz * SCENERY_BARRIER_OFFSET
    for (let k = 0; k < SCENERY_BARRIERS_PER_SIDE; k++) {
      const along = (k - (SCENERY_BARRIERS_PER_SIDE - 1) / 2) * SCENERY_BARRIER_SPACING
      const x = finish.position.x + lateralX + fx * along
      const z = finish.position.z + lateralZ + fz * along
      items.push({
        kind: 'barrier',
        x,
        z,
        rotationY: finish.heading,
        scale: 1,
        colorHex:
          k % 2 === 0
            ? SCENERY_BARRIER_HEX_RED
            : SCENERY_BARRIER_HEX_WHITE,
      })
    }
  }
  return items
}

// Top-level builder. Combines trees (deterministic from the path's seed),
// cones at every corner, and barriers at the start gate into one flat list
// the renderer can drop into a single Group. The seed override is for tests;
// production callers always derive the seed from the path.
export function buildScenery(
  path: TrackPath,
  opts?: {
    seed?: number
    spacing?: number
    clearance?: number
    density?: number
    radiusOffset?: number
    conesPerCorner?: number
    includeTrees?: boolean
    includeCones?: boolean
    includeBarriers?: boolean
  },
): SceneryItem[] {
  const seed = opts?.seed ?? seedFromPath(path)
  const rng = makeSceneryRng(seed)
  const items: SceneryItem[] = []
  if (opts?.includeTrees ?? true) {
    for (const t of buildTreeScenery(path, rng, opts)) items.push(t)
  }
  if (opts?.includeCones ?? true) {
    for (const c of buildCornerCones(path, opts)) items.push(c)
  }
  if (opts?.includeBarriers ?? true) {
    for (const b of buildStartBarriers(path)) items.push(b)
  }
  return items
}
