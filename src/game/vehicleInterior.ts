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

// Remove a node from the asset and free its geometry. Used to drop the solid
// `cabin_core` filler once real furniture takes its place; once it leaves the
// group it is no longer reached by the loader's dispose walk. We dispose only
// its geometry — its material is the shared `derbyInterior` instance that the
// body's window faces (and the hood/boot fillers) also use, so disposing it
// here would yank the material out from under those surviving meshes.
function removeAndDisposeGeometry(node: Object3D): void {
  node.parent?.remove(node)
  node.traverse((child) => {
    if (child instanceof Mesh) child.geometry.dispose()
  })
}

// Point every Mesh under `node` at `mat`. Used to repaint the near-black
// hood/boot fillers with the cabin trim so they stop reading as a black box.
// The fillers' original material is the shared `derbyInterior` instance the
// body's window faces also use, so we swap the reference rather than mutate
// the shared material in place.
function recolorNode(node: Object3D, mat: MeshStandardMaterial): void {
  node.traverse((child) => {
    if (child instanceof Mesh) child.material = mat
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
  // The engine_block (under the hood) and trunk_floor (in the boot) are
  // near-black `derbyInterior` fillers. Left as-is they read as the "black
  // box" the cabin used to be, so we recolour them to a visible dark trim.
  const fillers: Object3D[] = []
  group.traverse((node) => {
    if (!cabinCore && node.name === 'cabin_core' && firstMeshOf(node)) {
      cabinCore = node
    }
    if (!body && node.name === 'body' && firstMeshOf(node)) body = node
    if (node.name === 'engine_block' || node.name === 'trunk_floor') {
      fillers.push(node)
    }
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
  const minZ = cavity.min.z // front of cabin (asset front is -Z)
  const floorY = cavity.min.y + sy * 0.02
  // Z stations from front (-Z) to rear (+Z): dashboard, wheel, front seats,
  // rear bench. Fractions of the cabin length so the layout scales per car.
  const zAt = (frac: number) => minZ + sz * frac

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
  floor.position.set(center.x, cavity.min.y + floorH / 2, center.z)
  interior.add(floor)

  // A single seat = base cushion + reclined backrest (+ optional headrest).
  // Reused for both front seats and the rear bench (with a wider footprint).
  // Sized generously so it fills the cabin and reads as furniture, not a chip.
  const addSeat = (
    name: string,
    x: number,
    z: number,
    seatW: number,
    headrest = true,
  ) => {
    const baseH = sy * 0.18
    const baseD = sz * 0.32
    const backH = sy * 0.62
    const backD = sz * 0.14
    const base = new Mesh(new BoxGeometry(seatW, baseH, baseD), seatMat)
    base.name = `${name}_base`
    base.position.set(x, floorY + baseH / 2, z)
    interior.add(base)

    const back = new Mesh(new BoxGeometry(seatW, backH, backD), seatMat)
    back.name = `${name}_back`
    back.rotation.x = -0.16 // recline slightly
    const backTopY = floorY + baseH + backH
    back.position.set(x, floorY + baseH + backH / 2, z + baseD * 0.45)
    interior.add(back)

    // Headrest: a small block above the backrest so the seat keeps a
    // recognisable silhouette instead of reading as a plain slab.
    if (headrest) {
      const rest = new Mesh(
        new BoxGeometry(seatW * 0.55, sy * 0.14, backD * 1.05),
        seatMat,
      )
      rest.name = `${name}_headrest`
      rest.position.set(x, backTopY + sy * 0.05, z + baseD * 0.45)
      interior.add(rest)
    }
  }

  const seatX = sx * 0.24
  const frontSeatW = sx * 0.4
  const frontSeatZ = zAt(0.55)
  addSeat('seat_fl', -seatX, frontSeatZ, frontSeatW)
  addSeat('seat_fr', seatX, frontSeatZ, frontSeatW)
  // Rear bench: one wide seat behind the fronts (no headrest).
  addSeat('seat_rear', center.x, zAt(0.76), sx * 0.88, false)

  // Centre console between the front seats.
  const consoleH = sy * 0.22
  const centreConsole = new Mesh(
    new BoxGeometry(sx * 0.14, consoleH, sz * 0.38),
    trimMat,
  )
  centreConsole.name = 'console'
  centreConsole.position.set(center.x, floorY + consoleH / 2, frontSeatZ)
  interior.add(centreConsole)

  // Dashboard spanning the cabin width at the front, with a raised instrument
  // binnacle so it reads as a dashboard rather than a plain slab.
  const dashH = sy * 0.26
  const dashZ = zAt(0.12)
  const dash = new Mesh(new BoxGeometry(sx * 0.92, dashH, sz * 0.14), trimMat)
  dash.name = 'dashboard'
  dash.position.set(center.x, floorY + sy * 0.46, dashZ)
  interior.add(dash)
  const binnacle = new Mesh(
    new BoxGeometry(sx * 0.34, sy * 0.12, sz * 0.1),
    trimMat,
  )
  binnacle.name = 'dash_binnacle'
  binnacle.position.set(-seatX, floorY + sy * 0.46 + dashH * 0.5, dashZ + sz * 0.06)
  interior.add(binnacle)

  // Steering wheel: a torus rim (hole-axis along Z so the disc faces the
  // driver) with a centre hub and three spokes, raked back on a short column
  // toward the dashboard, in front of the left seat.
  const wheelGroup = new Group()
  wheelGroup.name = 'steering_wheel'
  const wheelR = sx * 0.17
  const tube = sx * 0.022
  const rim = new Mesh(new TorusGeometry(wheelR, tube, 10, 24), wheelMat)
  rim.name = 'steering_rim'
  wheelGroup.add(rim)
  const hub = new Mesh(
    new CylinderGeometry(wheelR * 0.28, wheelR * 0.28, tube * 2.2, 12),
    wheelMat,
  )
  hub.name = 'steering_hub'
  hub.rotation.x = Math.PI / 2 // align hub axis with the rim's hole (Z)
  wheelGroup.add(hub)
  for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * Math.PI * 2 - Math.PI / 2
    const spoke = new Mesh(
      new BoxGeometry(wheelR * 0.12, wheelR * 0.9, tube * 1.4),
      wheelMat,
    )
    spoke.name = `steering_spoke_${i}`
    spoke.position.set(
      Math.cos(angle) * wheelR * 0.45,
      Math.sin(angle) * wheelR * 0.45,
      0,
    )
    spoke.rotation.z = angle - Math.PI / 2
    wheelGroup.add(spoke)
  }
  wheelGroup.rotation.x = -0.3 // rake the column back
  wheelGroup.position.set(-seatX, floorY + sy * 0.48, zAt(0.3))
  interior.add(wheelGroup)

  const column = new Mesh(
    new CylinderGeometry(sx * 0.02, sx * 0.02, sz * 0.2, 8),
    wheelMat,
  )
  column.name = 'steering_column'
  column.rotation.x = Math.PI / 2 - 0.3 // lie along Z, matching the wheel rake
  column.position.set(-seatX, floorY + sy * 0.4, zAt(0.21))
  interior.add(column)

  group.add(interior)

  // Drop the solid cabin filler now that furniture occupies the cavity, and
  // recolour the remaining near-black hood/boot fillers so they stop reading
  // as a black box.
  if (cabinCore) removeAndDisposeGeometry(cabinCore)
  for (const filler of fillers) recolorNode(filler, trimMat)
}
