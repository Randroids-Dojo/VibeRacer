import {
  CircleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
} from 'three'
import type { DerbyArenaConfig } from '@/lib/derbyArenas'

// Arena geometry for Derby mode. Pure-data helpers (containment, wall
// normal) plus a Three.js mesh builder. Kept independent from the
// piece-grid track system in src/game/track.ts: a derby arena is one open
// disk with a perimeter wall, no checkpoints, no laps, so reusing the
// piece system would force awkward concepts.

// --- Pure helpers ----------------------------------------------------------

// Returns true when (x, z) is strictly inside the arena perimeter, treating
// the car's collision radius as a buffer so the cars body never visually
// clips through the wall.
export function arenaContains(
  arena: DerbyArenaConfig,
  x: number,
  z: number,
  buffer: number = 0,
): boolean {
  const r = Math.hypot(x, z)
  return r <= arena.radius - buffer
}

// Inward unit normal at the arena boundary nearest (x, z). Defined for
// every point inside the arena; outside the arena it still returns a
// well-defined inward direction (toward the origin). Returns (1, 0) when
// the input is at the exact center to keep the function total.
export function arenaWallNormalAt(
  _arena: DerbyArenaConfig,
  x: number,
  z: number,
): { nx: number; nz: number } {
  const r = Math.hypot(x, z)
  if (r < 1e-6) return { nx: 1, nz: 0 }
  return { nx: -x / r, nz: -z / r }
}

// Clamp (x, z) so it sits within the arena, accounting for a per-car
// collision radius buffer. Returns the clamped point and a flag telling
// the caller whether a clamp actually happened, so the tick can zero out
// the outward velocity component only on contact.
export function clampInsideArena(
  arena: DerbyArenaConfig,
  x: number,
  z: number,
  buffer: number,
): { x: number; z: number; clamped: boolean } {
  const r = Math.hypot(x, z)
  const limit = arena.radius - buffer
  if (r <= limit) return { x, z, clamped: false }
  const inv = r > 1e-6 ? 1 / r : 1
  return { x: x * inv * limit, z: z * inv * limit, clamped: true }
}

// --- Three.js mesh builder -------------------------------------------------

// Sun-baked clay surface color. Picked to read at noon on the desert biome
// without competing with the dust-bowl skybox; tinted slightly redder than
// the existing trackTexture sand color so the arena reads as a derby
// surface and not a strip extension.
const DIRT_COLOR = new Color(0xa17247)
const WALL_COLOR = new Color(0x4a4a4a)

const WALL_HEIGHT = 1.6
const WALL_THICKNESS = 0.6

export interface DerbyArenaMesh {
  group: Group
  ground: Mesh
  wall: Mesh
  dispose: () => void
}

// Build the visible arena geometry. The ground is a flat disk; the wall is
// a thin cylindrical ring on the perimeter so the player has a visible
// boundary. Caller adds the returned group to the scene; dispose() frees
// the geometry and material allocations.
export function buildArenaMesh(arena: DerbyArenaConfig): DerbyArenaMesh {
  const group = new Group()
  group.name = `derbyArena:${arena.slug}`

  const groundGeometry = new CircleGeometry(arena.radius, 64)
  const groundMaterial = new MeshStandardMaterial({
    color: DIRT_COLOR,
    roughness: 0.95,
    metalness: 0.0,
    side: DoubleSide,
  })
  const ground = new Mesh(groundGeometry, groundMaterial)
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  group.add(ground)

  // Wall: a tall, thin cylinder open at top and bottom. Built from a
  // CylinderGeometry rotated to stand upright. Inner face draws inward via
  // DoubleSide so the player can still see the wall when looking out.
  const wallGeometry = new CylinderGeometry(
    arena.radius + WALL_THICKNESS / 2,
    arena.radius + WALL_THICKNESS / 2,
    WALL_HEIGHT,
    96,
    1,
    true,
  )
  const wallMaterial = new MeshStandardMaterial({
    color: WALL_COLOR,
    roughness: 0.7,
    metalness: 0.05,
    side: DoubleSide,
  })
  const wall = new Mesh(wallGeometry, wallMaterial)
  wall.position.y = WALL_HEIGHT / 2
  wall.castShadow = true
  group.add(wall)

  return {
    group,
    ground,
    wall,
    dispose() {
      groundGeometry.dispose()
      groundMaterial.dispose()
      wallGeometry.dispose()
      wallMaterial.dispose()
    },
  }
}
