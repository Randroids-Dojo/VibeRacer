import {
  CanvasTexture,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Vector3,
} from 'three'
import { DecalGeometry } from 'three/examples/jsm/geometries/DecalGeometry.js'

// Procedural scuff decal pool. Each hit drops one decal at the contact
// point on the panel. We bake two CanvasTexture variants once (dark
// scuff, lighter scratch) and reuse them for every decal so the GPU
// only pays for a couple of small textures. The decals are parented to
// the car's root so they follow the chassis as it drives.
//
// We accept that DecalGeometry is somewhat heavy per-instance because
// the cap is small (32 active). When the cap is exceeded the oldest
// decal's mesh is removed and disposed.

const DECAL_TEXTURE_SIZE = 128
const DEFAULT_CAP = 32
const DECAL_DEPTH = 0.45

interface DecalEntry {
  mesh: Mesh
}

export interface DecalPool {
  // Spawn a decal on `surface`. `surface` is the deformable panel mesh
  // the hit landed on; the DecalGeometry projects onto it. position is
  // the world-space contact point. normal is the world-space surface
  // normal; the decal's "look" direction is rotated to face the normal
  // so the decal projects through the panel.
  addDecal(
    surface: Mesh,
    worldPoint: Vector3,
    worldNormal: Vector3,
    sizeJitter: () => number,
  ): void
  // Number of active decals (HUD debug).
  readonly count: number
  dispose(): void
}

export function createDecalPool(
  carRoot: Object3D,
  cap: number = DEFAULT_CAP,
): DecalPool {
  // Parent decals to a single group so disposal walks one subtree.
  const group = new Group()
  group.name = 'destruction.decals'
  // Attaching to the car root means decals inherit the car's world
  // transform and ride along during driving; without this they would
  // stick to the world where they were spawned.
  carRoot.add(group)
  // Reusable scratch object so we do not allocate per decal.
  const orientHelper = new Object3D()

  const scuffTexture = makeScuffTexture(0x111111, 0.85)
  const scratchTexture = makeScuffTexture(0x444444, 0.55)
  const scuffMaterial = new MeshBasicMaterial({
    map: scuffTexture,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    side: DoubleSide,
    color: new Color(0xffffff),
  })
  const scratchMaterial = new MeshBasicMaterial({
    map: scratchTexture,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    side: DoubleSide,
    color: new Color(0xffffff),
  })

  const items: DecalEntry[] = []
  let pickFlip = false

  function addDecal(
    surface: Mesh,
    worldPoint: Vector3,
    worldNormal: Vector3,
    sizeJitter: () => number,
  ): void {
    // DecalGeometry expects an Euler orientation. Three's example
    // pattern is to point an Object3D at the contact point plus the
    // normal, then read its rotation. The scratch Object3D is reused
    // each call so we do not allocate.
    orientHelper.position.copy(worldPoint)
    orientHelper.lookAt(worldPoint.clone().add(worldNormal))
    // Randomize the in-plane spin so two decals stacked on the same
    // spot do not visually align.
    orientHelper.rotation.z = sizeJitter() * Math.PI * 2
    const orientation = orientHelper.rotation
    const size = 0.45 + sizeJitter() * 0.35
    const material = pickFlip ? scuffMaterial : scratchMaterial
    pickFlip = !pickFlip
    const geom = new DecalGeometry(
      surface,
      worldPoint,
      orientation,
      new Vector3(size, size, DECAL_DEPTH),
    )
    const mesh = new Mesh(geom, material)
    mesh.name = 'destruction.decal'
    group.add(mesh)
    items.push({ mesh })
    while (items.length > cap) {
      const dead = items.shift()
      if (dead) {
        group.remove(dead.mesh)
        dead.mesh.geometry.dispose()
      }
    }
  }

  function dispose(): void {
    for (const entry of items) {
      group.remove(entry.mesh)
      entry.mesh.geometry.dispose()
    }
    items.length = 0
    scuffMaterial.dispose()
    scratchMaterial.dispose()
    scuffTexture.dispose()
    scratchTexture.dispose()
    if (group.parent) group.parent.remove(group)
  }

  return {
    addDecal,
    get count() {
      return items.length
    },
    dispose,
  }
}

// Build a small radial scratch texture. Pure 2D canvas: a radial
// gradient with a few scuff strokes overlaid so each decal reads as a
// chipped paint smear rather than a clean dark circle.
function makeScuffTexture(color: number, intensity: number): CanvasTexture {
  if (typeof document === 'undefined') {
    // Server-side rendering safety. The lab is a client component, so
    // this branch never executes at runtime; it only exists so a stray
    // SSR import does not throw on `document`. Cast bridges the
    // CanvasTexture generic parameter mismatch.
    return new CanvasTexture(null as unknown as HTMLCanvasElement)
  }
  const canvas = document.createElement('canvas')
  canvas.width = DECAL_TEXTURE_SIZE
  canvas.height = DECAL_TEXTURE_SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('decals: 2D canvas context unavailable')
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  const cx = canvas.width / 2
  const cy = canvas.height / 2
  const r = Math.min(cx, cy) * 0.9
  const grad = ctx.createRadialGradient(cx, cy, r * 0.05, cx, cy, r)
  const c = new Color(color)
  grad.addColorStop(0, `rgba(${c.r * 255}, ${c.g * 255}, ${c.b * 255}, ${intensity})`)
  grad.addColorStop(0.65, `rgba(${c.r * 255}, ${c.g * 255}, ${c.b * 255}, ${intensity * 0.45})`)
  grad.addColorStop(1, `rgba(${c.r * 255}, ${c.g * 255}, ${c.b * 255}, 0)`)
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  // A few scratch strokes through the center so the decal has
  // direction. Random per texture; baked once so all decals share the
  // same scratch pattern of their flavor.
  ctx.strokeStyle = `rgba(0, 0, 0, ${intensity * 0.5})`
  ctx.lineWidth = 2
  for (let i = 0; i < 5; i++) {
    const a = Math.random() * Math.PI * 2
    const dx = Math.cos(a) * r * 0.6
    const dy = Math.sin(a) * r * 0.6
    ctx.beginPath()
    ctx.moveTo(cx - dx, cy - dy)
    ctx.lineTo(cx + dx, cy + dy)
    ctx.stroke()
  }
  const tex = new CanvasTexture(canvas)
  tex.needsUpdate = true
  return tex
}
