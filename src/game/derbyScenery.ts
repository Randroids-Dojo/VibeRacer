import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshStandardMaterial,
  RingGeometry,
  TorusGeometry,
  type BufferGeometry,
  type Material,
} from 'three'
import type { DerbyArenaConfig } from '@/lib/derbyArenas'

// Static scenery for the derby arena perimeter. Sits in the annular zone
// between the arena wall (radius = arena.radius) and the stadium ring so the
// player has visual landmarks to drift against and the camera no longer sees
// a featureless dirt disk on a dust-colored sky. Items are placed
// deterministically from a per-arena seed so two players in the same round
// see the same dirt piles in the same spots.
//
// Nothing here is collidable. Cars are clamped inside the arena disk by
// arenaContains/clampInsideArena before any of this scenery becomes
// reachable, so the layout is purely cosmetic.

// Skirt extends from just past the wall out to the stadium inner radius.
// Scenery items live anywhere inside this annulus. Exported so the stadium
// builder can stack itself against the actual outer edge without
// duplicating the literal.
const SKIRT_INNER_RADIUS_PAD = 1.5 // start a bit past the wall so cars are not visually inside dirt
export const SKIRT_OUTER_RADIUS = 128

// Color palette tuned for the dust-bowl biome. Swap per-arena later when more
// arenas land (forest skirt, snow skirt, etc.).
const SKIRT_COLOR = 0x8d6440
const ROCK_COLORS = [0x7a6d63, 0x5e554d, 0x9a8a7a]
const DIRT_PILE_COLOR = 0x6b4a2c
const CACTUS_COLOR = 0x4d6b4d
const DEAD_TREE_TRUNK_COLOR = 0x4a3826
const DEAD_TREE_FOLIAGE_COLOR = 0x6b5a3a
const TIRE_COLOR = 0x1c1c1c
const DRUM_COLORS = [0x8b2828, 0x556b2f, 0x2c4a6b, 0x6b4a2c]
const CONCRETE_COLOR = 0x9a9a9a

// Counts. Tuned by eye against the dust bowl: dense enough to read as a
// landscape, sparse enough that the camera still feels like it is on a wide
// open arena. Bump these per arena later via the arena config if needed.
const ROCK_BIG_COUNT = 10
const ROCK_MEDIUM_COUNT = 24
const ROCK_SMALL_COUNT = 50
const CACTUS_COUNT = 8
const DEAD_TREE_COUNT = 6
const DIRT_PILE_COUNT = 14
const TIRE_COUNT = 22
const DRUM_COUNT = 16
const CONCRETE_COUNT = 14

export interface DerbyScenery {
  group: Group
  dispose: () => void
}

// Mulberry32 RNG. Same flavor used by the road-race scenery so the layout
// behavior is consistent across modes.
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

// Stable per-arena seed. Folds the slug bytes into a 32-bit integer so a
// rename of the arena would shift the layout (intentional: a new biome
// deserves a new layout) but two players on dust-bowl always see the same
// rocks. Independent from the track path seed used by road races since
// derby has no path concept.
export function seedFromArena(arena: DerbyArenaConfig): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < arena.slug.length; i++) {
    h = Math.imul(h ^ arena.slug.charCodeAt(i), 16777619) >>> 0
  }
  // Mix in radius so a future tuning bump (radius 60 -> 80) reshuffles the
  // skirt density rather than leaving items clustered inside the new wall.
  h = Math.imul(h ^ (Math.round(arena.radius * 100) | 0), 16777619) >>> 0
  return h
}

// Picks a uniformly distributed point inside the skirt annulus. Uses
// sqrt(u) on the radial coordinate so the resulting density is uniform per
// unit area (otherwise a naive lerp would clump everything near the inner
// edge).
function randomSkirtPoint(
  arena: DerbyArenaConfig,
  rng: () => number,
): { x: number; z: number } {
  const inner = arena.radius + SKIRT_INNER_RADIUS_PAD
  const outer = SKIRT_OUTER_RADIUS
  const u = rng()
  const r = Math.sqrt(u * (outer * outer - inner * inner) + inner * inner)
  const theta = rng() * Math.PI * 2
  return { x: Math.cos(theta) * r, z: Math.sin(theta) * r }
}

function pickColor(rng: () => number, palette: readonly number[]): number {
  return palette[Math.floor(rng() * palette.length) % palette.length]
}

// Builds the entire decorative skirt: extended ground annulus + scenery
// items. Caller adds the returned group to the scene; dispose() frees every
// geometry and material the builder allocated.
export function buildDerbyScenery(arena: DerbyArenaConfig): DerbyScenery {
  const group = new Group()
  group.name = `derbyScenery:${arena.slug}`
  const rng = makeRng(seedFromArena(arena))

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

  // Ground skirt. Flat ring sitting at y=0 just outside the arena wall so
  // the visible "dirt extending past the perimeter" is a real surface and
  // not just sky bleed-through.
  const skirtGeometry = track(
    new RingGeometry(
      arena.radius,
      SKIRT_OUTER_RADIUS,
      96,
      1,
    ),
  )
  const skirtMaterial = trackMat(
    new MeshStandardMaterial({
      color: SKIRT_COLOR,
      roughness: 1,
      metalness: 0,
      side: DoubleSide,
    }),
  )
  const skirt = new Mesh(skirtGeometry, skirtMaterial)
  skirt.rotation.x = -Math.PI / 2
  skirt.position.y = -0.01 // tucked just under the arena disk to avoid z-fighting
  group.add(skirt)

  // Big rocks. Icosahedrons scaled non-uniformly so they read as boulders
  // and not soccer balls. Y-rotation only so the flat bottom faces sit
  // believably on the ground.
  for (let i = 0; i < ROCK_BIG_COUNT; i++) {
    const { x, z } = randomSkirtPoint(arena, rng)
    const radius = 1.4 + rng() * 1.6
    const geom = track(new IcosahedronGeometry(radius, 0))
    const mat = trackMat(
      new MeshStandardMaterial({
        color: pickColor(rng, ROCK_COLORS),
        roughness: 1,
        metalness: 0,
        flatShading: true,
      }),
    )
    const m = new Mesh(geom, mat)
    m.position.set(x, radius * 0.55, z)
    m.scale.set(1, 0.7 + rng() * 0.3, 1)
    m.rotation.y = rng() * Math.PI * 2
    group.add(m)
  }

  // Medium rocks. Smaller icosahedrons; share the same generator pattern
  // so a future rock-prop refactor swaps both at once.
  for (let i = 0; i < ROCK_MEDIUM_COUNT; i++) {
    const { x, z } = randomSkirtPoint(arena, rng)
    const radius = 0.55 + rng() * 0.55
    const geom = track(new IcosahedronGeometry(radius, 0))
    const mat = trackMat(
      new MeshStandardMaterial({
        color: pickColor(rng, ROCK_COLORS),
        roughness: 1,
        metalness: 0,
        flatShading: true,
      }),
    )
    const m = new Mesh(geom, mat)
    m.position.set(x, radius * 0.5, z)
    m.rotation.y = rng() * Math.PI * 2
    group.add(m)
  }

  // Pebbles. Tiny rocks for ground texture.
  for (let i = 0; i < ROCK_SMALL_COUNT; i++) {
    const { x, z } = randomSkirtPoint(arena, rng)
    const radius = 0.18 + rng() * 0.22
    const geom = track(new IcosahedronGeometry(radius, 0))
    const mat = trackMat(
      new MeshStandardMaterial({
        color: pickColor(rng, ROCK_COLORS),
        roughness: 1,
        metalness: 0,
      }),
    )
    const m = new Mesh(geom, mat)
    m.position.set(x, radius * 0.3, z)
    group.add(m)
  }

  // Cacti. A trunk plus one or two arms; tall enough to break the horizon
  // line behind the wall when the camera is low.
  for (let i = 0; i < CACTUS_COUNT; i++) {
    const { x, z } = randomSkirtPoint(arena, rng)
    const trunkHeight = 2.5 + rng() * 1.5
    const trunkGeom = track(new CylinderGeometry(0.28, 0.32, trunkHeight, 8))
    const cactusMat = trackMat(
      new MeshStandardMaterial({
        color: CACTUS_COLOR,
        roughness: 0.9,
        metalness: 0,
      }),
    )
    const trunk = new Mesh(trunkGeom, cactusMat)
    trunk.position.set(x, trunkHeight / 2, z)
    trunk.rotation.y = rng() * Math.PI * 2
    group.add(trunk)
    // Arms: one or two short cylinders sticking out, then bending up.
    const armCount = rng() > 0.4 ? 2 : 1
    for (let a = 0; a < armCount; a++) {
      const armLen = 0.7 + rng() * 0.4
      const armGeom = track(new CylinderGeometry(0.18, 0.2, armLen, 8))
      const arm = new Mesh(armGeom, cactusMat)
      const armAngle = rng() * Math.PI * 2
      const armHeight = trunkHeight * (0.55 + rng() * 0.3)
      arm.position.set(
        x + Math.cos(armAngle) * 0.35,
        armHeight,
        z + Math.sin(armAngle) * 0.35,
      )
      arm.rotation.z = Math.cos(armAngle) > 0 ? Math.PI / 2 : -Math.PI / 2
      arm.position.y += armLen * 0.15 // suggest a bend without modeling one
      group.add(arm)
    }
  }

  // Dead trees. Cylindrical trunk with a sparse cone of brown foliage so
  // they read as desert-dry rather than a pine forest visiting the wrong
  // biome.
  for (let i = 0; i < DEAD_TREE_COUNT; i++) {
    const { x, z } = randomSkirtPoint(arena, rng)
    const trunkHeight = 3.5 + rng() * 1.5
    const trunkGeom = track(new CylinderGeometry(0.22, 0.32, trunkHeight, 8))
    const trunkMat = trackMat(
      new MeshStandardMaterial({
        color: DEAD_TREE_TRUNK_COLOR,
        roughness: 1,
        metalness: 0,
      }),
    )
    const trunk = new Mesh(trunkGeom, trunkMat)
    trunk.position.set(x, trunkHeight / 2, z)
    group.add(trunk)
    const foliageGeom = track(new ConeGeometry(1.2 + rng() * 0.6, 1.6, 6))
    const foliageMat = trackMat(
      new MeshStandardMaterial({
        color: DEAD_TREE_FOLIAGE_COLOR,
        roughness: 0.95,
        metalness: 0,
        flatShading: true,
      }),
    )
    const foliage = new Mesh(foliageGeom, foliageMat)
    foliage.position.set(x, trunkHeight + 0.7, z)
    foliage.rotation.y = rng() * Math.PI * 2
    group.add(foliage)
  }

  // Dirt piles. Wide low cones that match the skirt color, scattered as
  // mounded earth that looks like the arena was bulldozed in place.
  for (let i = 0; i < DIRT_PILE_COUNT; i++) {
    const { x, z } = randomSkirtPoint(arena, rng)
    const radius = 1.2 + rng() * 1.6
    const height = 0.5 + rng() * 0.8
    const geom = track(new ConeGeometry(radius, height, 12))
    const mat = trackMat(
      new MeshStandardMaterial({
        color: DIRT_PILE_COLOR,
        roughness: 1,
        metalness: 0,
        flatShading: true,
      }),
    )
    const m = new Mesh(geom, mat)
    m.position.set(x, height / 2 - 0.01, z)
    m.rotation.y = rng() * Math.PI * 2
    group.add(m)
  }

  // Stacked tires. A torus per tire; sometimes two stacked. The dust-bowl
  // skirt is supposed to read as a junkyard ring around the arena, so tires
  // are dense.
  const tireGeom = track(new TorusGeometry(0.45, 0.18, 8, 16))
  const tireMat = trackMat(
    new MeshStandardMaterial({
      color: TIRE_COLOR,
      roughness: 0.95,
      metalness: 0,
    }),
  )
  for (let i = 0; i < TIRE_COUNT; i++) {
    const { x, z } = randomSkirtPoint(arena, rng)
    const stack = rng() > 0.55 ? 2 : 1
    for (let s = 0; s < stack; s++) {
      const m = new Mesh(tireGeom, tireMat)
      m.rotation.x = Math.PI / 2 // lay flat on the ground
      m.position.set(x, 0.18 + s * 0.36, z)
      group.add(m)
    }
  }

  // Oil drums. Painted cylinders standing upright; some tipped on their
  // sides for variety.
  for (let i = 0; i < DRUM_COUNT; i++) {
    const { x, z } = randomSkirtPoint(arena, rng)
    const tipped = rng() > 0.7
    const geom = track(new CylinderGeometry(0.42, 0.42, 1.2, 16))
    const mat = trackMat(
      new MeshStandardMaterial({
        color: pickColor(rng, DRUM_COLORS),
        roughness: 0.6,
        metalness: 0.25,
      }),
    )
    const m = new Mesh(geom, mat)
    if (tipped) {
      m.rotation.z = Math.PI / 2
      m.rotation.y = rng() * Math.PI * 2
      m.position.set(x, 0.42, z)
    } else {
      m.position.set(x, 0.6, z)
      m.rotation.y = rng() * Math.PI * 2
    }
    group.add(m)
  }

  // Concrete chunks. Boxy and a bit cracked-looking via random scale.
  for (let i = 0; i < CONCRETE_COUNT; i++) {
    const { x, z } = randomSkirtPoint(arena, rng)
    const w = 0.7 + rng() * 0.7
    const h = 0.4 + rng() * 0.5
    const d = 0.7 + rng() * 0.7
    const geom = track(new BoxGeometry(w, h, d))
    const mat = trackMat(
      new MeshStandardMaterial({
        color: CONCRETE_COLOR,
        roughness: 0.95,
        metalness: 0,
      }),
    )
    const m = new Mesh(geom, mat)
    m.position.set(x, h / 2, z)
    m.rotation.y = rng() * Math.PI * 2
    m.rotation.z = (rng() - 0.5) * 0.2
    group.add(m)
  }

  return {
    group,
    dispose() {
      for (const g of geometries) g.dispose()
      for (const m of materials) m.dispose()
    },
  }
}
