import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Vector2,
  type BufferGeometry,
  type Material,
} from 'three'
import type { DerbyArenaConfig } from '@/lib/derbyArenas'

// Stadium ring around the derby arena: a stepped concrete bowl revolved
// around the arena center, plus an instanced crowd of colored figures
// sitting on each tread, plus a few light poles. None of this is reachable
// from the playable disk (the wall stops the cars well before the bleachers
// start), so the stadium is purely visual scaffolding to make the arena
// read as an event venue and not a clay disk in the void.

// Geometry constants. The stadium starts at INNER_RADIUS (just past the
// derby skirt scenery) and steps outward in TREAD_WIDTH-wide rings, each
// STEP_HEIGHT taller than the last. Five steps gives a satisfying tiered
// feel without overwhelming the camera.
const INNER_RADIUS_PAD = 4 // gap between scenery skirt and stadium so the camera reads them separately
const STEP_COUNT = 5
const STEP_HEIGHT = 1.0
const TREAD_WIDTH = 5.0

// Crowd density per tread (people per radian of arc). Tuned for the noon
// camera so the seating looks populated but does not turn into a single
// pixel-soup color band at distance. Multiply by step radius * 2π to get
// total people per ring; total stadium population for STEP_COUNT=5 sits in
// the low hundreds.
const CROWD_DENSITY_PER_RAD = 7
const CROWD_BOX_W = 0.45
const CROWD_BOX_H = 1.1
const CROWD_BOX_D = 0.45

// Color palettes. Bleachers read as weathered concrete with painted seats;
// the crowd is a saturated mix that pops against both the concrete and the
// dirt skirt.
const CONCRETE_COLOR = 0x9c8f7a
const SEAT_COLORS = [0xb24545, 0x3a6ba0, 0xc6913a, 0x4a7d52]
const POLE_COLOR = 0x404040
const LIGHT_HEAD_COLOR = 0xfff4c2
const CROWD_COLORS: readonly Color[] = [
  new Color(0xd64545),
  new Color(0xe8a13a),
  new Color(0x4f8df2),
  new Color(0x4eb573),
  new Color(0x9b59b6),
  new Color(0xf2c14e),
  new Color(0xe0e0e0),
  new Color(0x2c2c2c),
  new Color(0xff6b9b),
  new Color(0x3acabc),
]

// Light poles. Just enough of these to suggest the venue could host a
// night round in a future arena variant; placed at cardinal angles.
const LIGHT_POLE_COUNT = 8
const LIGHT_POLE_HEIGHT = 12

export interface DerbyStadium {
  group: Group
  dispose: () => void
}

function makeRng(seed: number): () => number {
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

// Build the bleacher bowl, the crowd, and the light poles around an arena.
// The stadium inner radius is derived from the scenery skirt's outer
// radius via a fixed pad so the venue stays correctly nested even if the
// arena radius changes per-config.
export function buildDerbyStadium(
  arena: DerbyArenaConfig,
  scenerySkirtOuterRadius: number,
): DerbyStadium {
  const group = new Group()
  group.name = `derbyStadium:${arena.slug}`

  const geometries: BufferGeometry[] = []
  const materials: Material[] = []
  const track = <T extends BufferGeometry>(g: T): T => {
    geometries.push(g)
    return g
  }
  const trackMat = <T extends Material>(m: T): T => {
    materials.push(m)
    return m
  }

  const innerRadius = scenerySkirtOuterRadius + INNER_RADIUS_PAD

  // Stepped concrete bowl. LatheGeometry takes a 2D radial profile and
  // revolves it: we describe the cross-section as a series of horizontal
  // treads connected by vertical risers, then let three.js sweep it 360°.
  // This produces a single seamless mesh for the entire seating structure
  // instead of N concentric cylinders that all have to be aligned by hand.
  const profile: Vector2[] = []
  // Start at the inner-floor corner, sitting on the ground.
  profile.push(new Vector2(innerRadius, 0))
  for (let i = 0; i < STEP_COUNT; i++) {
    const r = innerRadius + i * TREAD_WIDTH
    const h = i * STEP_HEIGHT
    profile.push(new Vector2(r, h))
    profile.push(new Vector2(r, h + STEP_HEIGHT)) // riser
    profile.push(new Vector2(r + TREAD_WIDTH, h + STEP_HEIGHT)) // tread
  }
  // Cap the back of the structure so the lathe is closed: drop straight
  // down from the topmost tread to ground level at the outermost radius.
  const finalR = innerRadius + STEP_COUNT * TREAD_WIDTH
  profile.push(new Vector2(finalR, 0))
  profile.push(new Vector2(innerRadius, 0))
  const bowlGeometry = track(new LatheGeometry(profile, 96))
  const bowlMaterial = trackMat(
    new MeshStandardMaterial({
      color: CONCRETE_COLOR,
      roughness: 0.95,
      metalness: 0.05,
      side: DoubleSide,
    }),
  )
  const bowl = new Mesh(bowlGeometry, bowlMaterial)
  bowl.receiveShadow = true
  group.add(bowl)

  // Painted seat strip on each tread. A short colored ring (open-ended
  // cylinder shell with DoubleSide material) sits on the tread surface so
  // the bleachers read as built for sitting and not as a bare ramp. Each
  // step gets its own color from the palette.
  for (let i = 0; i < STEP_COUNT; i++) {
    const seatRadius = innerRadius + i * TREAD_WIDTH + 0.7
    const h = (i + 1) * STEP_HEIGHT + 0.12
    const seatGeometry = track(
      new CylinderGeometry(seatRadius, seatRadius, 0.18, 96, 1, true),
    )
    const seatMat = trackMat(
      new MeshStandardMaterial({
        color: SEAT_COLORS[i % SEAT_COLORS.length],
        roughness: 0.7,
        metalness: 0.05,
        side: DoubleSide,
      }),
    )
    const seat = new Mesh(seatGeometry, seatMat)
    seat.position.y = h
    group.add(seat)
  }

  // Crowd. One big InstancedMesh per stadium so the per-frame draw call
  // cost is constant in the number of people. Tread radius and height
  // determine where each instance lands; per-instance color comes from the
  // CROWD_COLORS palette. Slight Y-rotation jitter keeps them from looking
  // like a marching grid.
  const crowdGeom = track(new BoxGeometry(CROWD_BOX_W, CROWD_BOX_H, CROWD_BOX_D))
  const crowdMat = trackMat(
    new MeshStandardMaterial({
      color: 0xffffff, // overridden per-instance via instanceColor
      roughness: 0.85,
      metalness: 0,
      vertexColors: false,
    }),
  )
  let totalCrowd = 0
  const treadRadii: number[] = []
  const treadHeights: number[] = []
  const treadCounts: number[] = []
  for (let i = 0; i < STEP_COUNT; i++) {
    // Each person sits between the seat strip and the riser of the next
    // step. Place the body center on the rear half of the tread so the
    // person's back is against the next riser.
    const radius = innerRadius + i * TREAD_WIDTH + TREAD_WIDTH * 0.7
    const height = (i + 1) * STEP_HEIGHT + CROWD_BOX_H / 2 + 0.2
    const count = Math.floor(
      radius * 2 * Math.PI * CROWD_DENSITY_PER_RAD * 0.05,
    )
    treadRadii.push(radius)
    treadHeights.push(height)
    treadCounts.push(count)
    totalCrowd += count
  }
  const crowdMesh = new InstancedMesh(crowdGeom, crowdMat, totalCrowd)
  crowdMesh.frustumCulled = true
  const matrix = new Matrix4()
  const tmpColor = new Color()
  const rng = makeRng(seedFromArena(arena))
  let instanceIdx = 0
  for (let i = 0; i < STEP_COUNT; i++) {
    const radius = treadRadii[i]
    const y = treadHeights[i]
    const count = treadCounts[i]
    for (let p = 0; p < count; p++) {
      const theta = (p / count) * Math.PI * 2 + rng() * 0.06
      const radialJitter = (rng() - 0.5) * (TREAD_WIDTH * 0.25)
      const r = radius + radialJitter
      matrix.makeRotationY(-theta + Math.PI) // face the arena
      matrix.setPosition(Math.cos(theta) * r, y, Math.sin(theta) * r)
      crowdMesh.setMatrixAt(instanceIdx, matrix)
      tmpColor.copy(CROWD_COLORS[Math.floor(rng() * CROWD_COLORS.length)])
      crowdMesh.setColorAt(instanceIdx, tmpColor)
      instanceIdx++
    }
  }
  crowdMesh.instanceMatrix.needsUpdate = true
  if (crowdMesh.instanceColor) crowdMesh.instanceColor.needsUpdate = true
  group.add(crowdMesh)

  // Stadium light poles. Tall thin cylinders capped by a glowing white box
  // (a stylized floodlight). Visible above the bleachers from anywhere in
  // the arena.
  const poleRadius = finalR + 1.5
  const poleGeom = track(new CylinderGeometry(0.22, 0.28, LIGHT_POLE_HEIGHT, 8))
  const poleMat = trackMat(
    new MeshStandardMaterial({
      color: POLE_COLOR,
      roughness: 0.9,
      metalness: 0.4,
    }),
  )
  const headGeom = track(new BoxGeometry(2.4, 0.6, 1.2))
  const headMat = trackMat(
    new MeshStandardMaterial({
      color: LIGHT_HEAD_COLOR,
      roughness: 0.4,
      metalness: 0.1,
      emissive: new Color(0xfff4c2),
      emissiveIntensity: 0.35,
    }),
  )
  for (let i = 0; i < LIGHT_POLE_COUNT; i++) {
    const angle = (i / LIGHT_POLE_COUNT) * Math.PI * 2
    const pole = new Mesh(poleGeom, poleMat)
    pole.position.set(
      Math.cos(angle) * poleRadius,
      LIGHT_POLE_HEIGHT / 2,
      Math.sin(angle) * poleRadius,
    )
    group.add(pole)
    const head = new Mesh(headGeom, headMat)
    // Aim the floodlight's broadest face inward toward the arena center.
    head.position.set(
      Math.cos(angle) * (poleRadius - 0.6),
      LIGHT_POLE_HEIGHT,
      Math.sin(angle) * (poleRadius - 0.6),
    )
    head.rotation.y = -angle + Math.PI / 2
    group.add(head)
  }

  return {
    group,
    dispose() {
      for (const g of geometries) g.dispose()
      for (const m of materials) m.dispose()
    },
  }
}

// Local copy of the scenery seed with a golden-ratio XOR offset so the
// crowd RNG is decorrelated from the rock layout. Without the offset, the
// crowd gaps would line up with rock clusters. Kept inline to avoid the
// stadium module importing the scenery module just for one helper.
function seedFromArena(arena: DerbyArenaConfig): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < arena.slug.length; i++) {
    h = Math.imul(h ^ arena.slug.charCodeAt(i), 16777619) >>> 0
  }
  return Math.imul(h ^ 0x9e3779b1, 16777619) >>> 0
}
