import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
} from 'three'
import type { DerbyVehicleConfig } from '@/lib/derbyVehicles'

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
  'door_l',
  'door_r',
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
export type RequiredSubmeshName = (typeof REQUIRED_SUBMESHES)[number]

export interface DerbyVehicleAsset {
  group: Group
  submeshes: Record<RequiredSubmeshName, Mesh>
  // Bookkeeping for the visualizer to dispose geometry/materials when the
  // round ends. Procedural assets register everything; GLB loaders should
  // register textures and material clones the same way.
  dispose: () => void
}

const VEHICLE_BODY_HEIGHT = 1.0
const VEHICLE_WHEEL_RADIUS = 0.35
const PANEL_THICKNESS = 0.12
const LIGHT_SIZE = 0.25

// Walk a group's direct children and collect the meshes that match a
// required submesh name. Throws when any required name is missing. Allows
// extra unnamed children (decorative geometry, debug helpers, etc.) so a
// future GLB authored with more detail can still pass.
export function assertVehicleContract(group: Group): DerbyVehicleAsset {
  const found: Partial<Record<RequiredSubmeshName, Mesh>> = {}
  for (const child of group.children) {
    if (!(child instanceof Mesh)) continue
    if ((REQUIRED_SUBMESHES as readonly string[]).includes(child.name)) {
      found[child.name as RequiredSubmeshName] = child
    }
  }
  const missing: RequiredSubmeshName[] = []
  for (const name of REQUIRED_SUBMESHES) {
    if (!found[name]) missing.push(name)
  }
  if (missing.length > 0) {
    throw new Error(
      `derby vehicle asset is missing required submeshes: ${missing.join(', ')}`,
    )
  }
  return {
    group,
    submeshes: found as Record<RequiredSubmeshName, Mesh>,
    dispose: () => disposeAll(group),
  }
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

// Async to mirror the future GLBLoader path. v1 returns immediately with
// procedural geometry built from the vehicle config dimensions.
export async function loadDerbyVehicleAsset(
  config: DerbyVehicleConfig,
  paintColor: number = 0xfff7b0,
): Promise<DerbyVehicleAsset> {
  const group = buildPlaceholderVehicleGroup(config, paintColor)
  return assertVehicleContract(group)
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

  return group
}
