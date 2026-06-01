import {
  Box3,
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  TorusGeometry,
  Vector3,
  type Object3D,
} from 'three'

// ---------------------------------------------------------------------------
// Cabin interior (shared by the derby loader and the destruction lab)
// ---------------------------------------------------------------------------
//
// The shipping vehicle GLBs are hollow shells with a solid dark `cabin_core`
// filler block dropped into the cabin volume (plus engine_block / trunk_floor
// for the hood and trunk cavities). When a door / hood / trunk detaches the
// cabin reads as one flat black box: that box IS `cabin_core`.
//
// addVehicleInterior replaces the cabin filler with low-poly furniture (a
// floor pan, two front seats, a rear bench, a steering wheel + column, a
// dashboard, and a centre console) so a gutted wreck shows recognisable car
// internals. It removes `cabin_core` so the new furniture is not hidden behind
// it, but leaves engine_block / trunk_floor / axles alone — those still read
// as engine and boot internals and stop light passing through those cavities.
//
// The furniture is grouped under a single child Object3D named `interior`
// whose name matches none of either loader's contract/panel submeshes, so it
// is never tinted, detached, deformed, or treated as a hit target. Both
// loaders' dispose paths walk the whole subtree, so interior geometry and
// materials are freed with the rest of the asset.
//
// This module is intentionally standalone (pure geometry, no game-lifecycle
// imports) so the derby and destruction stacks can share it without coupling
// to each other.

// Cabin trim palette. The cabin interior sits in shadow once a panel pops
// off, so pure dark charcoal just reads as a black block again. These tones
// are mid-bright and varied (warm tan seats, neutral grey trim, near-black
// wheel) and the materials carry a little emissive so the shapes stay legible
// in shadow instead of crushing to black.
const INTERIOR_SEAT_COLOR = 0xa1906c // warm tan upholstery
const INTERIOR_SEAT_EMISSIVE = 0x2a2418
const INTERIOR_TRIM_COLOR = 0x595961 // dashboard / console / floor
const INTERIOR_TRIM_EMISSIVE = 0x16161a
const INTERIOR_WHEEL_COLOR = 0x26262b // steering wheel + column
const INTERIOR_WHEEL_EMISSIVE = 0x0c0c0e

// First Mesh descendant of `node` (or `node` itself when it is a Mesh).
function firstMeshOf(node: Object3D): Mesh | null {
  if (node instanceof Mesh) return node
  let found: Mesh | null = null
  node.traverse((child) => {
    if (found) return
    if (child instanceof Mesh) found = child
  })
  return found
}

// Remove a node from the asset and free its geometry/material. Used to drop
// the solid `cabin_core` filler once real furniture takes its place; once it
// leaves the group it is no longer reached by the loader's dispose walk, so we
// dispose here.
function removeAndDispose(node: Object3D): void {
  node.parent?.remove(node)
  node.traverse((child) => {
    if (child instanceof Mesh) {
      child.geometry.dispose()
      const m = child.material
      if (Array.isArray(m)) for (const item of m) item.dispose()
      else m.dispose()
    }
  })
}

// Build the interior furniture and parent it under the supplied group. Local
// frame matches both loaders' assets: +Y up, +X right, length along Z with
// the front at -Z.
//
// The cabin cavity is sized from the `cabin_core` filler block when present
// (the GLBs) — that block already marks the exact cabin volume — and that
// block is then removed so it no longer occludes the furniture. When it is
// absent (the procedural placeholder) we fall back to a cabin-sized slice of
// the `body` bounding box. No-op when neither node exists.
export function addVehicleInterior(group: Group): void {
  let cabinCore: Object3D | null = null
  let body: Object3D | null = null
  group.traverse((node) => {
    if (!cabinCore && node.name === 'cabin_core' && firstMeshOf(node)) {
      cabinCore = node
    }
    if (!body && node.name === 'body' && firstMeshOf(node)) body = node
  })

  // Cavity bounds: prefer the cabin_core block, else a central slice of body.
  const cavity = new Box3()
  if (cabinCore) {
    cavity.setFromObject(cabinCore)
  } else if (body) {
    const b = new Box3().setFromObject(body)
    const c = b.getCenter(new Vector3())
    const s = b.getSize(new Vector3())
    cavity.setFromCenterAndSize(
      new Vector3(c.x, c.y + s.y * 0.05, c.z),
      new Vector3(s.x * 0.8, s.y * 0.7, s.z * 0.55),
    )
  } else {
    return
  }

  const size = cavity.getSize(new Vector3())
  const center = cavity.getCenter(new Vector3())
  const sx = size.x
  const sy = size.y
  const sz = size.z
  if (sx <= 0 || sy <= 0 || sz <= 0) return
  const cz = center.z
  const frontZ = cavity.min.z // front of cabin (asset front is -Z)
  const floorY = cavity.min.y + sy * 0.04

  const seatMat = new MeshStandardMaterial({
    color: INTERIOR_SEAT_COLOR,
    emissive: INTERIOR_SEAT_EMISSIVE,
    emissiveIntensity: 1.0,
    roughness: 0.85,
    metalness: 0.0,
  })
  const trimMat = new MeshStandardMaterial({
    color: INTERIOR_TRIM_COLOR,
    emissive: INTERIOR_TRIM_EMISSIVE,
    emissiveIntensity: 1.0,
    roughness: 0.8,
    metalness: 0.0,
  })
  const wheelMat = new MeshStandardMaterial({
    color: INTERIOR_WHEEL_COLOR,
    emissive: INTERIOR_WHEEL_EMISSIVE,
    emissiveIntensity: 1.0,
    roughness: 0.7,
    metalness: 0.15,
  })

  const interior = new Group()
  interior.name = 'interior'

  // Floor pan: a thin slab across the cavity so a missing door does not look
  // straight through to the far side / sky.
  const floorH = sy * 0.06
  const floor = new Mesh(new BoxGeometry(sx * 0.96, floorH, sz * 0.96), trimMat)
  floor.name = 'interior_floor'
  floor.position.set(center.x, cavity.min.y + floorH / 2, cz)
  interior.add(floor)

  // A single seat = base cushion + reclined backrest (+ optional headrest).
  // Reused for both front seats and the rear bench (with a wider footprint).
  const baseH = sy * 0.24
  const baseD = sz * 0.28
  const backH = sy * 0.5
  const backD = sz * 0.09
  const addSeat = (
    name: string,
    x: number,
    z: number,
    widthFrac: number,
    headrest = true,
  ) => {
    const seatW = sx * widthFrac
    const base = new Mesh(new BoxGeometry(seatW, baseH, baseD), seatMat)
    base.name = `${name}_base`
    base.position.set(x, floorY + baseH / 2, z)
    interior.add(base)

    const back = new Mesh(new BoxGeometry(seatW, backH, backD), seatMat)
    back.name = `${name}_back`
    back.rotation.x = -0.14 // recline slightly
    const backTopY = floorY + baseH + backH
    back.position.set(x, floorY + baseH + backH / 2, z + baseD * 0.5)
    interior.add(back)

    // Headrest: a small block above the backrest so the seat keeps a
    // recognisable silhouette instead of reading as a plain slab.
    if (headrest) {
      const rest = new Mesh(
        new BoxGeometry(seatW * 0.5, sy * 0.12, backD * 1.1),
        seatMat,
      )
      rest.name = `${name}_headrest`
      rest.position.set(x, backTopY + sy * 0.04, z + baseD * 0.5)
      interior.add(rest)
    }
  }

  const seatX = sx * 0.23
  const frontSeatZ = cz - sz * 0.04
  addSeat('seat_fl', -seatX, frontSeatZ, 0.36)
  addSeat('seat_fr', seatX, frontSeatZ, 0.36)
  // Rear bench: one wide seat behind the fronts (no headrest).
  addSeat('seat_rear', center.x, cz + sz * 0.26, 0.84, false)

  // Centre console between the front seats.
  const consoleH = sy * 0.2
  const centreConsole = new Mesh(
    new BoxGeometry(sx * 0.12, consoleH, sz * 0.34),
    trimMat,
  )
  centreConsole.name = 'console'
  centreConsole.position.set(center.x, floorY + consoleH / 2, frontSeatZ)
  interior.add(centreConsole)

  // Dashboard spanning the cabin width at the front.
  const dashH = sy * 0.22
  const dash = new Mesh(new BoxGeometry(sx * 0.9, dashH, sz * 0.12), trimMat)
  dash.name = 'dashboard'
  dash.position.set(center.x, floorY + sy * 0.5, frontZ + sz * 0.1)
  interior.add(dash)

  // Steering wheel (torus, hole-axis along Z so it faces the driver) on a
  // short column reaching toward the dashboard, in front of the left seat.
  const wheelR = sx * 0.14
  const wheel = new Mesh(new TorusGeometry(wheelR, sx * 0.025, 8, 20), wheelMat)
  wheel.name = 'steering_wheel'
  wheel.rotation.x = -0.32 // rake the column back
  wheel.position.set(-seatX, floorY + sy * 0.42, frontZ + sz * 0.22)
  interior.add(wheel)

  const column = new Mesh(
    new CylinderGeometry(sx * 0.018, sx * 0.018, sz * 0.16, 8),
    wheelMat,
  )
  column.name = 'steering_column'
  column.rotation.x = Math.PI / 2 - 0.32 // lie along Z, matching the wheel rake
  column.position.set(-seatX, floorY + sy * 0.36, frontZ + sz * 0.15)
  interior.add(column)

  group.add(interior)

  // Drop the solid cabin filler now that furniture occupies the cavity.
  if (cabinCore) removeAndDispose(cabinCore)
}
