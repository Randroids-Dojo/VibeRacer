import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
} from 'three'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { DerbyVehicleConfig } from '@/lib/derbyVehicles'
import { addVehicleInterior } from '@/game/vehicleInterior'

// Vehicle asset loader for Derby. Contract: every loaded asset is a
// Three.js Group whose direct children include a fixed set of named
// submeshes. Slice 9's damage visualizer reaches into these by name to
// recolor paint, swap broken-light materials, and detach panels on hits.
//
// v1 ships procedural placeholder geometry (boxes for the body, panels,
// and lights; cylinders for wheels). Real open-source destructible GLBs
// can swap into loadDerbyVehicleAsset by adding a GLB-aware code path
// that produces the same DerbyVehicleAsset shape; assertVehicleContract
// catches any GLB whose authored submesh names do not match the contract.

export const REQUIRED_SUBMESHES = [
  'body',
  'hood',
  'trunk',
  'headlight_l',
  'headlight_r',
  'taillight_l',
  'taillight_r',
  'wheel_fl',
  'wheel_fr',
  'wheel_rl',
  'wheel_rr',
] as const
// Doors are OPTIONAL on the Kenney-sourced sedan/truck/race because slicing
// or overlaying a door panel on a thin shell body looks worse than not
// having one (visible blocky protrusions). Real-source-door variants
// (ambulance) and the procedural placeholder still ship doors; the damage
// visualizer skips door work gracefully when they are absent.
export const OPTIONAL_SUBMESHES = ['door_l', 'door_r'] as const
export type RequiredSubmeshName = (typeof REQUIRED_SUBMESHES)[number]
export type OptionalSubmeshName = (typeof OPTIONAL_SUBMESHES)[number]
export type SubmeshName = RequiredSubmeshName | OptionalSubmeshName
const ALL_SUBMESHES: readonly SubmeshName[] = [
  ...REQUIRED_SUBMESHES,
  ...OPTIONAL_SUBMESHES,
]

export type WheelName = 'wheel_fl' | 'wheel_fr' | 'wheel_rl' | 'wheel_rr'
export const WHEEL_NAMES: WheelName[] = [
  'wheel_fl',
  'wheel_fr',
  'wheel_rl',
  'wheel_rr',
]
export const FRONT_WHEEL_NAMES: WheelName[] = ['wheel_fl', 'wheel_fr']

// Pivot groups for wheel animation. `steer` is the outer node that rotates
// around the car's vertical axis for the front-wheel steering angle; `spin`
// is its child and rotates around its local rolling axis as the wheel rolls
// over the ground. The original wheel mesh becomes a child of `spin`.
export interface WheelPivot {
  steer: Group
  spin: Group
}

export interface DerbyVehicleAsset {
  group: Group
  // The contract-named meshes / groups. Authored GLBs can have a body /
  // hood / trunk node with multiple primitives (paint + glass), in which
  // case Three.js's GLTFLoader wraps the primitives under a Group named
  // for the node and gives the child meshes auto-numbered names. We
  // accept Object3D here and resolve to the underlying Mesh(es) on a
  // case-by-case basis (see firstMeshOf / meshesOf below). Required
  // submeshes are always present; optional ones (doors) are present only
  // for variants that ship a real door node.
  submeshes: Record<RequiredSubmeshName, Object3D> &
    Partial<Record<OptionalSubmeshName, Object3D>>
  // Per-wheel pivot groups for steering and rolling. Wired up by
  // attachWheelPivots() so DerbyCanvas can drive them each frame.
  wheelPivots: Record<WheelName, WheelPivot>
  // Bookkeeping for the visualizer to dispose geometry/materials when the
  // round ends. Procedural assets register everything; GLB loaders should
  // register textures and material clones the same way.
  dispose: () => void
}

// First Mesh descendant of `node` (or `node` itself when it's a Mesh).
// Used by the visualizer when it needs a `.material` reference: for a
// multi-primitive node, any one of the underlying primitives is good
// enough as the "primary paint" mesh.
export function firstMeshOf(node: Object3D): Mesh | null {
  if (node instanceof Mesh) return node
  let found: Mesh | null = null
  node.traverse((child) => {
    if (found) return
    if (child instanceof Mesh) found = child
  })
  return found
}

// All Mesh descendants of `node` (or `[node]` when it's a Mesh). Used for
// operations that should apply uniformly across every primitive: paint
// tinting, broken-light material swap.
export function meshesOf(node: Object3D): Mesh[] {
  const out: Mesh[] = []
  node.traverse((child) => {
    if (child instanceof Mesh) out.push(child)
  })
  return out
}

const VEHICLE_BODY_HEIGHT = 1.0
const VEHICLE_WHEEL_RADIUS = 0.35
const PANEL_THICKNESS = 0.12
const LIGHT_SIZE = 0.25

// Walk a group's full subtree and collect the meshes that match a required
// submesh name. Throws when any required name is missing. Allows extra
// unnamed meshes (decorative geometry, debug helpers, wheel rims) so a GLB
// authored with more detail can still pass. Subtree walk lets the GLB host
// nest required parts under intermediate empties or transform nodes
// (Blender's exporter sometimes does this).
export function assertVehicleContract(group: Group): DerbyVehicleAsset {
  const found: Partial<Record<SubmeshName, Object3D>> = {}
  group.traverse((node) => {
    // Accept either a Mesh or any Object3D that has at least one Mesh
    // descendant. glTF nodes with multiple primitives come through as a
    // Group named after the source node and Mesh children with
    // auto-numbered names; we match on the parent's name and let the
    // visualizer drill into the children when it needs Mesh references.
    if (!(ALL_SUBMESHES as readonly string[]).includes(node.name)) return
    if (node instanceof Mesh || firstMeshOf(node) !== null) {
      if (!found[node.name as SubmeshName]) {
        found[node.name as SubmeshName] = node
      }
    }
  })
  const missing: RequiredSubmeshName[] = []
  for (const name of REQUIRED_SUBMESHES) {
    if (!found[name]) missing.push(name)
  }
  if (missing.length > 0) {
    throw new Error(
      `derby vehicle asset is missing required submeshes: ${missing.join(', ')}`,
    )
  }
  const submeshes = found as Record<RequiredSubmeshName, Object3D> &
    Partial<Record<OptionalSubmeshName, Object3D>>
  const wheelPivots = attachWheelPivots(group, submeshes)
  return {
    group,
    submeshes,
    wheelPivots,
    dispose: () => disposeAll(group),
  }
}

// Wrap each wheel mesh in a steer pivot (outer Group) and a spin pivot
// (inner Group, child of steer). The wheel mesh moves under the spin pivot
// so a Y rotation on `steer` turns the wheel and an X rotation on `spin`
// rolls it without those two interacting. Pivot is positioned at the
// wheel's original world location so the wheel does not visually shift.
function attachWheelPivots(
  parent: Group,
  submeshes: Record<RequiredSubmeshName, Object3D>,
): Record<WheelName, WheelPivot> {
  parent.updateMatrixWorld(true)
  const pivots = {} as Record<WheelName, WheelPivot>
  for (const name of WHEEL_NAMES) {
    const wheel = submeshes[name]
    // Capture the wheel's position relative to `parent` before reparenting.
    // GLB imports usually place required meshes as direct children of
    // `parent` so wheel.position already is parent-local; if a future
    // exporter introduces an intermediate node we walk the matrices up to
    // parent so the wheel does not visually shift after the wrap.
    const local = wheel.position.clone()
    if (wheel.parent && wheel.parent !== parent) {
      wheel.getWorldPosition(local)
      parent.worldToLocal(local)
    }
    const steer = new Group()
    steer.name = `${name}_steer`
    steer.position.copy(local)
    const spin = new Group()
    spin.name = `${name}_spin`
    steer.add(spin)
    spin.add(wheel)
    wheel.position.set(0, 0, 0)
    parent.add(steer)
    pivots[name] = { steer, spin }
  }
  return pivots
}

// Free every disposable geometry / material under the group. Walks the
// subtree once so a future asset with nested groups (door + door handle)
// still releases everything.
function disposeAll(root: Object3D): void {
  root.traverse((node) => {
    if (node instanceof Mesh) {
      node.geometry.dispose()
      const m = node.material
      if (Array.isArray(m)) {
        for (const item of m) item.dispose()
      } else {
        m.dispose()
      }
    }
  })
}

// Module-level promise cache so the GLB fetch + parse runs at most once per
// modelUrl across an entire session. Without this, every car in a round
// would trigger its own network fetch.
const glbCache: Map<string, Promise<GLTF>> = new Map()
function fetchGltf(url: string): Promise<GLTF> {
  let p = glbCache.get(url)
  if (!p) {
    p = new GLTFLoader().loadAsync(url).catch((err) => {
      glbCache.delete(url)
      throw err
    })
    glbCache.set(url, p)
  }
  return p
}

// Load a derby vehicle asset. Prefers the authored GLB at config.modelUrl;
// on any load / contract failure falls back to the procedural placeholder
// so a missing or malformed asset never blocks the round from starting.
// paintColor is applied to the GLB's body material by name so the four
// shipping vehicles still get distinct hues in v1 without re-baking GLBs.
export async function loadDerbyVehicleAsset(
  config: DerbyVehicleConfig,
  paintColor: number = 0xfff7b0,
): Promise<DerbyVehicleAsset> {
  if (config.modelUrl) {
    try {
      const gltf = await fetchGltf(config.modelUrl)
      const root = gltf.scene.clone(true)
      // Some GLB exporters wrap the model in a single empty; if so, hoist
      // its children up so assertVehicleContract finds named meshes at the
      // top of the asset hierarchy.
      const group = new Group()
      group.name = `derbyVehicle:${config.type}`
      for (const child of [...root.children]) group.add(child)
      tintBody(group, paintColor)
      addVehicleInterior(group)
      return assertVehicleContract(group)
    } catch (err) {
      console.error(
        `[derby] GLB load failed for ${config.type} (${config.modelUrl}); falling back to procedural placeholder`,
        err,
      )
    }
  }
  const group = buildPlaceholderVehicleGroup(config, paintColor)
  return assertVehicleContract(group)
}

// Tint the painted submeshes so each vehicle reads as a distinct color
// without re-baking the GLB. The contract names (body, hood, trunk,
// door_l, door_r) may resolve to either a single Mesh or a parent Group
// of multiple Mesh primitives (paint + glass on the Kenney source). We
// recolor every Mesh descendant of those nodes. Materials are cloned so
// the tint does not bleed across cars that share a source material.
const PAINT_NODE_NAMES: ReadonlySet<string> = new Set([
  'body',
  'hood',
  'trunk',
  'door_l',
  'door_r',
])

function tintBody(group: Group, paintColor: number): void {
  group.traverse((node) => {
    if (!PAINT_NODE_NAMES.has(node.name)) return
    for (const mesh of meshesOf(node)) {
      const mat = mesh.material
      if (Array.isArray(mat)) {
        mesh.material = mat.map((m) => recolorMaterial(m, paintColor))
      } else if (mat) {
        mesh.material = recolorMaterial(mat, paintColor)
      }
    }
  })
}

function recolorMaterial(mat: unknown, paintColor: number): MeshStandardMaterial {
  const clone = (mat as MeshStandardMaterial).clone()
  clone.color.setHex(paintColor)
  return clone
}

export function buildPlaceholderVehicleGroup(
  config: DerbyVehicleConfig,
  paintColor: number,
): Group {
  const group = new Group()
  group.name = `derbyVehicle:${config.type}`

  const bodyW = config.collisionRadius * 1.4
  const bodyL = config.collisionRadius * 2.0
  const bodyH = VEHICLE_BODY_HEIGHT

  // Body. Sized off the collision radius so a bigger truck reads as bigger.
  const bodyGeo = new BoxGeometry(bodyW, bodyH, bodyL)
  const paintMaterial = new MeshStandardMaterial({
    color: paintColor,
    roughness: 0.6,
    metalness: 0.1,
  })
  const body = new Mesh(bodyGeo, paintMaterial)
  body.name = 'body'
  body.position.y = bodyH / 2
  group.add(body)

  // Hood and trunk. Thin slabs sitting on top of the body's front and rear.
  const panelMat = paintMaterial.clone()
  const hood = new Mesh(
    new BoxGeometry(bodyW * 0.85, PANEL_THICKNESS, bodyL * 0.32),
    panelMat,
  )
  hood.name = 'hood'
  hood.position.set(0, bodyH + PANEL_THICKNESS / 2, -bodyL * 0.32)
  group.add(hood)

  const trunk = new Mesh(
    new BoxGeometry(bodyW * 0.85, PANEL_THICKNESS, bodyL * 0.28),
    panelMat,
  )
  trunk.name = 'trunk'
  trunk.position.set(0, bodyH + PANEL_THICKNESS / 2, bodyL * 0.34)
  group.add(trunk)

  // Doors. Two slabs on the body's sides centered on the body's middle.
  const doorMat = paintMaterial.clone()
  const door_l = new Mesh(
    new BoxGeometry(PANEL_THICKNESS, bodyH * 0.7, bodyL * 0.45),
    doorMat,
  )
  door_l.name = 'door_l'
  door_l.position.set(-bodyW / 2 - PANEL_THICKNESS / 2, bodyH / 2, 0)
  group.add(door_l)

  const door_r = new Mesh(
    new BoxGeometry(PANEL_THICKNESS, bodyH * 0.7, bodyL * 0.45),
    doorMat,
  )
  door_r.name = 'door_r'
  door_r.position.set(bodyW / 2 + PANEL_THICKNESS / 2, bodyH / 2, 0)
  group.add(door_r)

  // Lights. Front headlights are emissive yellow; tail lights emissive red.
  const headlightMat = new MeshStandardMaterial({
    color: 0xfff5b0,
    emissive: 0xfff5b0,
    emissiveIntensity: 0.7,
    roughness: 0.4,
  })
  const taillightMat = new MeshStandardMaterial({
    color: 0xff3030,
    emissive: 0xff3030,
    emissiveIntensity: 0.5,
    roughness: 0.4,
  })
  const lightGeo = new BoxGeometry(LIGHT_SIZE, LIGHT_SIZE * 0.8, LIGHT_SIZE * 0.8)
  const headlight_l = new Mesh(lightGeo, headlightMat)
  headlight_l.name = 'headlight_l'
  headlight_l.position.set(-bodyW * 0.32, bodyH * 0.7, -bodyL / 2 - LIGHT_SIZE / 2)
  group.add(headlight_l)

  const headlight_r = new Mesh(lightGeo, headlightMat)
  headlight_r.name = 'headlight_r'
  headlight_r.position.set(bodyW * 0.32, bodyH * 0.7, -bodyL / 2 - LIGHT_SIZE / 2)
  group.add(headlight_r)

  const taillight_l = new Mesh(lightGeo, taillightMat)
  taillight_l.name = 'taillight_l'
  taillight_l.position.set(-bodyW * 0.32, bodyH * 0.7, bodyL / 2 + LIGHT_SIZE / 2)
  group.add(taillight_l)

  const taillight_r = new Mesh(lightGeo, taillightMat)
  taillight_r.name = 'taillight_r'
  taillight_r.position.set(bodyW * 0.32, bodyH * 0.7, bodyL / 2 + LIGHT_SIZE / 2)
  group.add(taillight_r)

  // Wheels. Cylinders rotated so their flat faces are on the X axis.
  const wheelGeo = new CylinderGeometry(
    VEHICLE_WHEEL_RADIUS,
    VEHICLE_WHEEL_RADIUS,
    0.3,
    16,
  )
  const wheelMat = new MeshStandardMaterial({ color: 0x222222, roughness: 0.9 })
  const wheelOffsets: { name: RequiredSubmeshName; x: number; z: number }[] = [
    { name: 'wheel_fl', x: -bodyW / 2, z: -bodyL / 2 + 0.4 },
    { name: 'wheel_fr', x: bodyW / 2, z: -bodyL / 2 + 0.4 },
    { name: 'wheel_rl', x: -bodyW / 2, z: bodyL / 2 - 0.4 },
    { name: 'wheel_rr', x: bodyW / 2, z: bodyL / 2 - 0.4 },
  ]
  for (const w of wheelOffsets) {
    const wheel = new Mesh(wheelGeo, wheelMat)
    wheel.name = w.name
    wheel.rotation.z = Math.PI / 2
    wheel.position.set(w.x, 0, w.z)
    group.add(wheel)
  }

  addVehicleInterior(group)

  return group
}
