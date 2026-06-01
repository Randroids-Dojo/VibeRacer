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
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

// ---------------------------------------------------------------------------
// Cabin interior (shared by the derby loader and the destruction lab)
// ---------------------------------------------------------------------------
//
// The shipping vehicle GLBs are hollow shells with a solid dark `cabin_core`
// filler block dropped into the cabin volume (plus engine_block / trunk_floor
// for the hood and trunk cavities). When a door / hood / trunk detaches the
// cabin reads as one flat black box: that box IS `cabin_core`.
//
// addVehicleInterior replaces the cabin filler with cabin furniture: a real
// low-poly steering-wheel model (public/models/interior/steering-wheel.glb,
// CC-BY — see CREDITS.md), plus procedurally-built bucket seats, a rear bench,
// a dashboard, a centre console, and a floor pan. It removes `cabin_core` so
// the furniture is not hidden behind it, and recolours the near-black
// engine_block / trunk_floor fillers so the hood/boot cavities stop reading as
// a black box.
//
// The furniture is grouped under a single child Object3D named `interior`
// whose name matches none of either loader's contract/panel submeshes, so it
// is never tinted, detached, deformed, or treated as a hit target. Both
// loaders' dispose paths walk the whole subtree, so interior geometry and
// materials are freed with the rest of the asset.
//
// This module is intentionally standalone (no game-lifecycle imports) so the
// derby and destruction stacks can share it without coupling to each other.

const STEERING_WHEEL_URL = '/models/interior/steering-wheel.glb'

// Cabin trim palette. The cabin interior sits in shadow once a panel pops off,
// so pure dark charcoal reads as a black block again. These tones are
// mid-bright and varied (warm tan seats, neutral grey trim) and carry a little
// emissive so the shapes stay legible in shadow instead of crushing to black.
const INTERIOR_SEAT_COLOR = 0xa1906c // warm tan upholstery
const INTERIOR_SEAT_EMISSIVE = 0x2a2418
const INTERIOR_BOLSTER_COLOR = 0x7c6e52 // darker tan for seat side bolsters
const INTERIOR_BOLSTER_EMISSIVE = 0x201c12
const INTERIOR_TRIM_COLOR = 0x595961 // dashboard / console / floor
const INTERIOR_TRIM_EMISSIVE = 0x16161a
const INTERIOR_WHEEL_COLOR = 0x26262b // procedural fallback wheel
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
// body's window faces also use, so we swap the reference rather than mutate it.
function recolorNode(node: Object3D, mat: MeshStandardMaterial): void {
  node.traverse((child) => {
    if (child instanceof Mesh) child.material = mat
  })
}

// Module-level cache so the steering-wheel GLB is fetched + parsed at most once
// per session. Each car clones the cached scene. Rejection clears the cache so
// a transient failure can be retried; callers fall back to a procedural wheel.
let wheelScenePromise: Promise<Object3D> | null = null
function loadWheelScene(): Promise<Object3D> {
  if (!wheelScenePromise) {
    wheelScenePromise = new GLTFLoader()
      .loadAsync(STEERING_WHEEL_URL)
      .then((gltf) => gltf.scene)
      .catch((err) => {
        wheelScenePromise = null
        throw err
      })
  }
  return wheelScenePromise
}

// Reject if `p` does not settle within `ms` so a hung/slow GLB fetch never
// stalls vehicle creation; the caller then builds the procedural fallback.
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('wheel load timed out')), ms),
    ),
  ])
}

// Normalise the loaded wheel scene into a `steering_wheel` group: centred on
// the origin, scaled to `targetDiameter`, and oriented so the rim faces the
// driver (the model is authored lying flat with its axle on +Y; we stand it up
// and rake it back). Caller positions the returned group in the cabin.
function buildWheelFromModel(scene: Object3D, targetDiameter: number): Group {
  const model = scene.clone(true)
  const box = new Box3().setFromObject(model)
  const size = box.getSize(new Vector3())
  const centre = box.getCenter(new Vector3())
  // Disc lies in the model's XZ plane (axle = Y), so the rim diameter is the
  // larger of the two in-plane extents.
  const diameter = Math.max(size.x, size.z) || 1
  const scale = targetDiameter / diameter
  model.position.sub(centre) // recentre on origin before scaling/rotating

  const scaled = new Group()
  scaled.scale.setScalar(scale)
  scaled.add(model)

  const wheel = new Group()
  wheel.name = 'steering_wheel'
  // Stand the flat-lying wheel up (axle +Y -> +Z) and rake the top forward.
  wheel.rotation.x = Math.PI / 2 - 0.32
  wheel.add(scaled)
  return wheel
}

// Procedural fallback wheel (rim + hub + spokes) for when the GLB fails to
// load (offline / unit tests). Faces the driver via its hole-axis along Z.
function buildWheelFallback(radius: number, mat: MeshStandardMaterial): Group {
  const wheel = new Group()
  wheel.name = 'steering_wheel'
  const tube = radius * 0.13
  const rim = new Mesh(new TorusGeometry(radius, tube, 10, 24), mat)
  rim.name = 'steering_rim'
  wheel.add(rim)
  const hub = new Mesh(
    new CylinderGeometry(radius * 0.28, radius * 0.28, tube * 2.2, 12),
    mat,
  )
  hub.name = 'steering_hub'
  hub.rotation.x = Math.PI / 2
  wheel.add(hub)
  for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * Math.PI * 2 - Math.PI / 2
    const spoke = new Mesh(
      new BoxGeometry(radius * 0.12, radius * 0.9, tube * 1.4),
      mat,
    )
    spoke.name = `steering_spoke_${i}`
    spoke.position.set(Math.cos(angle) * radius * 0.45, Math.sin(angle) * radius * 0.45, 0)
    spoke.rotation.z = angle - Math.PI / 2
    wheel.add(spoke)
  }
  wheel.rotation.x = -0.3
  return wheel
}

// Build the interior furniture and parent it under the supplied group. Async
// because it loads the steering-wheel GLB; both loaders await it. Local frame
// matches both loaders' assets: +Y up, +X right, length along Z, front at -Z.
//
// The cabin cavity is sized from the `cabin_core` filler block when present
// (the GLBs) — that block already marks the exact cabin volume — and that block
// is then removed so it no longer occludes the furniture. When it is absent
// (the procedural placeholder) we fall back to a cabin-sized slice of the
// `body` bounding box. No-op when neither node exists.
export async function addVehicleInterior(group: Group): Promise<void> {
  let cabinCore: Object3D | null = null
  let body: Object3D | null = null
  // The engine_block (under the hood) and trunk_floor (in the boot) are
  // near-black `derbyInterior` fillers; recolour them to a visible dark trim.
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
  // Z stations from front (-Z) to rear (+Z) as cabin-length fractions so the
  // layout scales per car: dashboard, wheel, front seats, rear bench.
  const zAt = (frac: number) => minZ + sz * frac

  const seatMat = new MeshStandardMaterial({
    color: INTERIOR_SEAT_COLOR,
    emissive: INTERIOR_SEAT_EMISSIVE,
    emissiveIntensity: 1.0,
    roughness: 0.85,
  })
  const bolsterMat = new MeshStandardMaterial({
    color: INTERIOR_BOLSTER_COLOR,
    emissive: INTERIOR_BOLSTER_EMISSIVE,
    emissiveIntensity: 1.0,
    roughness: 0.85,
  })
  const trimMat = new MeshStandardMaterial({
    color: INTERIOR_TRIM_COLOR,
    emissive: INTERIOR_TRIM_EMISSIVE,
    emissiveIntensity: 1.0,
    roughness: 0.8,
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

  // A bucket seat: cushion + reclined backrest + headrest, plus raised side
  // bolsters on both so it reads as a contoured car seat rather than a slab.
  // The rear bench passes bucket=false for a flatter, wider profile.
  const addSeat = (
    name: string,
    x: number,
    z: number,
    seatW: number,
    bucket = true,
  ) => {
    const baseH = sy * 0.16
    const baseD = sz * 0.34
    const backH = sy * 0.6
    const backD = sz * 0.12
    const bolW = seatW * 0.16

    const base = new Mesh(new BoxGeometry(seatW, baseH, baseD), seatMat)
    base.name = `${name}_base`
    base.position.set(x, floorY + baseH / 2, z)
    interior.add(base)

    const back = new Mesh(new BoxGeometry(seatW, backH, backD), seatMat)
    back.name = `${name}_back`
    back.rotation.x = -0.16 // recline slightly
    const backCY = floorY + baseH + backH / 2
    const backCZ = z + baseD * 0.42
    back.position.set(x, backCY, backCZ)
    interior.add(back)

    if (bucket) {
      // Cushion side bolsters.
      for (const s of [-1, 1]) {
        const b = new Mesh(
          new BoxGeometry(bolW, baseH * 1.5, baseD * 0.9),
          bolsterMat,
        )
        b.name = `${name}_cushion_bolster_${s < 0 ? 'l' : 'r'}`
        b.position.set(x + s * (seatW / 2 - bolW / 2), floorY + baseH * 0.75, z)
        interior.add(b)
      }
      // Backrest side bolsters (wings).
      for (const s of [-1, 1]) {
        const b = new Mesh(
          new BoxGeometry(bolW, backH * 0.92, backD * 1.7),
          bolsterMat,
        )
        b.name = `${name}_back_bolster_${s < 0 ? 'l' : 'r'}`
        b.rotation.x = -0.16
        b.position.set(x + s * (seatW / 2 - bolW / 2), backCY, backCZ - backD * 0.2)
        interior.add(b)
      }
      // Headrest.
      const rest = new Mesh(
        new BoxGeometry(seatW * 0.5, sy * 0.14, backD * 1.1),
        seatMat,
      )
      rest.name = `${name}_headrest`
      rest.position.set(x, floorY + baseH + backH + sy * 0.04, backCZ)
      interior.add(rest)
    }
  }

  const seatX = sx * 0.24
  const frontSeatW = sx * 0.4
  const frontSeatZ = zAt(0.55)
  addSeat('seat_fl', -seatX, frontSeatZ, frontSeatW)
  addSeat('seat_fr', seatX, frontSeatZ, frontSeatW)
  // Rear bench: one wide flat seat behind the fronts.
  addSeat('seat_rear', center.x, zAt(0.78), sx * 0.86, false)

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
  // binnacle in front of the driver so it reads as a dashboard, not a slab.
  const dashH = sy * 0.26
  const dashZ = zAt(0.12)
  const dash = new Mesh(new BoxGeometry(sx * 0.92, dashH, sz * 0.14), trimMat)
  dash.name = 'dashboard'
  dash.position.set(center.x, floorY + sy * 0.46, dashZ)
  interior.add(dash)
  const binnacle = new Mesh(new BoxGeometry(sx * 0.34, sy * 0.12, sz * 0.1), trimMat)
  binnacle.name = 'dash_binnacle'
  binnacle.position.set(-seatX, floorY + sy * 0.46 + dashH * 0.5, dashZ + sz * 0.06)
  interior.add(binnacle)

  // Steering column from the dashboard to the wheel, in front of the driver.
  const wheelX = -seatX
  const wheelY = floorY + sy * 0.46
  const wheelZ = zAt(0.32)
  const wheelMat = new MeshStandardMaterial({
    color: INTERIOR_WHEEL_COLOR,
    emissive: INTERIOR_WHEEL_EMISSIVE,
    emissiveIntensity: 1.0,
    roughness: 0.7,
    metalness: 0.15,
  })
  const column = new Mesh(
    new CylinderGeometry(sx * 0.02, sx * 0.02, sz * 0.2, 8),
    wheelMat,
  )
  column.name = 'steering_column'
  column.rotation.x = Math.PI / 2 - 0.3
  column.position.set(wheelX, floorY + sy * 0.38, zAt(0.23))
  interior.add(column)

  // Steering wheel: the real GLB when it loads, else a procedural wheel. The
  // load is raced against a short timeout so a missing/slow asset (or a
  // non-browser test environment where the fetch hangs) falls back promptly
  // instead of stalling vehicle creation.
  const wheelDiameter = sx * 0.36
  let wheel: Group
  try {
    const scene = await withTimeout(loadWheelScene(), 1200)
    wheel = buildWheelFromModel(scene, wheelDiameter)
  } catch {
    wheel = buildWheelFallback(wheelDiameter / 2, wheelMat)
  }
  wheel.position.set(wheelX, wheelY, wheelZ)
  interior.add(wheel)

  group.add(interior)

  // Drop the solid cabin filler now that furniture occupies the cavity, and
  // recolour the remaining near-black hood/boot fillers.
  if (cabinCore) removeAndDisposeGeometry(cabinCore)
  for (const filler of fillers) recolorNode(filler, trimMat)
}
