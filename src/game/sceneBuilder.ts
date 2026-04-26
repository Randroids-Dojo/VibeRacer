import {
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  Group,
  type Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
} from 'three'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import {
  CELL_SIZE,
  TRACK_WIDTH,
  trackCenter,
  type OrderedPiece,
  type TrackPath,
} from './trackPath'
import {
  SKID_MARK_LENGTH,
  SKID_MARK_POOL_SIZE,
  nextSkidMarkIndex,
  skidMarkAlpha,
  skidMarkPeakAlpha,
} from './skidMarks'

const CAR_MODEL_URL = '/models/car.glb'
// Remap model's local +Z forward to world +X (physics heading 0).
const CAR_MODEL_YAW_OFFSET = Math.PI / 2
const CAR_MODEL_SCALE = 1.65

let carGltfPromise: Promise<GLTF> | null = null
function loadCarGltf(): Promise<GLTF> {
  carGltfPromise ??= new GLTFLoader().loadAsync(CAR_MODEL_URL).catch((err) => {
    carGltfPromise = null
    throw err
  })
  return carGltfPromise
}

export interface SceneBundle {
  scene: Scene
  camera: PerspectiveCamera
  car: Group
  // Recolor the body mesh of the player car. `null` restores the stock
  // colormap baked into the GLB. Safe to call before the GLB has finished
  // loading: the requested paint is buffered and applied as soon as the
  // mesh appears.
  setCarPaint: (paintHex: string | null) => void
  // Skid mark pool. Exposed on the bundle so the rAF loop can spawn into it
  // each frame and clear it on a full reset, without needing to reach into
  // the scene graph.
  skidMarks: SkidMarkLayer
  dispose: () => void
}

function buildFlatGeometry(verts: number[], idx: number[]): BufferGeometry {
  const geom = new BufferGeometry()
  geom.setAttribute(
    'position',
    new BufferAttribute(new Float32Array(verts), 3),
  )
  geom.setIndex(idx)
  geom.computeVertexNormals()
  return geom
}

function straightGeometry(op: OrderedPiece): BufferGeometry {
  const isVertical = op.entryDir === 0 || op.entryDir === 2
  const halfLong = CELL_SIZE / 2
  const halfShort = TRACK_WIDTH / 2
  const { x: cx, z: cz } = op.center
  const verts = isVertical
    ? [
        cx - halfShort, 0, cz - halfLong,
        cx + halfShort, 0, cz - halfLong,
        cx + halfShort, 0, cz + halfLong,
        cx - halfShort, 0, cz + halfLong,
      ]
    : [
        cx - halfLong, 0, cz - halfShort,
        cx + halfLong, 0, cz - halfShort,
        cx + halfLong, 0, cz + halfShort,
        cx - halfLong, 0, cz + halfShort,
      ]
  return buildFlatGeometry(verts, [0, 2, 1, 0, 3, 2])
}

function cornerGeometry(op: OrderedPiece, segments = 20): BufferGeometry {
  const { cx, cz } = op.arcCenter!
  const innerR = CELL_SIZE / 2 - TRACK_WIDTH / 2
  const outerR = CELL_SIZE / 2 + TRACK_WIDTH / 2

  const a1 = Math.atan2(op.entry.z - cz, op.entry.x - cx)
  const a2 = Math.atan2(op.exit.z - cz, op.exit.x - cx)
  let delta = a2 - a1
  while (delta > Math.PI) delta -= 2 * Math.PI
  while (delta < -Math.PI) delta += 2 * Math.PI

  const verts: number[] = []
  for (let i = 0; i <= segments; i++) {
    const a = a1 + delta * (i / segments)
    const ca = Math.cos(a)
    const sa = Math.sin(a)
    verts.push(cx + innerR * ca, 0, cz + innerR * sa)
    verts.push(cx + outerR * ca, 0, cz + outerR * sa)
  }
  // Triangle winding must yield a +Y normal. Flip if delta is negative.
  const ccw = delta > 0
  const idx: number[] = []
  for (let i = 0; i < segments; i++) {
    const base = i * 2
    if (ccw) {
      idx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3)
    } else {
      idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2)
    }
  }
  return buildFlatGeometry(verts, idx)
}

function polylineGeometry(op: OrderedPiece): BufferGeometry {
  const samples = op.samples!
  const half = TRACK_WIDTH / 2
  const verts: number[] = []
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i]
    // Build a tangent from neighboring samples (central difference at the
    // interior, forward / backward at the ends). The perpendicular in the
    // y=0 plane is (tz, -tx) rotated 90 CW, which yields the right-hand side
    // when standing at the sample looking along travel.
    let tx: number
    let tz: number
    if (i === 0) {
      tx = samples[i + 1].x - s.x
      tz = samples[i + 1].z - s.z
    } else if (i === samples.length - 1) {
      tx = s.x - samples[i - 1].x
      tz = s.z - samples[i - 1].z
    } else {
      tx = samples[i + 1].x - samples[i - 1].x
      tz = samples[i + 1].z - samples[i - 1].z
    }
    const tlen = Math.hypot(tx, tz) || 1
    tx /= tlen
    tz /= tlen
    // Right-hand perpendicular in the +Y up frame.
    const px = -tz
    const pz = tx
    verts.push(s.x + px * half, 0, s.z + pz * half)
    verts.push(s.x - px * half, 0, s.z - pz * half)
  }
  const idx: number[] = []
  for (let i = 0; i < samples.length - 1; i++) {
    const base = i * 2
    idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2)
  }
  return buildFlatGeometry(verts, idx)
}

function pieceGeometry(op: OrderedPiece): BufferGeometry {
  if (op.samples !== null) return polylineGeometry(op)
  return op.piece.type === 'straight' ? straightGeometry(op) : cornerGeometry(op)
}

function buildCarFrame(
  onLoaded?: (clone: Object3D) => void,
): { car: Group; cancel: () => void } {
  const outer = new Group()
  const inner = new Group()
  inner.rotation.y = CAR_MODEL_YAW_OFFSET
  inner.scale.setScalar(CAR_MODEL_SCALE)
  outer.add(inner)

  let cancelled = false
  loadCarGltf().then(
    (gltf) => {
      if (cancelled) return
      const clone = gltf.scene.clone()
      onLoaded?.(clone)
      inner.add(clone)
    },
    (err) => {
      console.error('Failed to load car model', err)
    },
  )

  return { car: outer, cancel: () => { cancelled = true } }
}

// Player car with a paint hook. The Kenney race car GLB exposes the body as
// a single mesh node named "body" sharing the colormap atlas with the
// wheels. To recolor only the chassis we clone the material on the body
// node, drop the `.map` reference (the body region of the atlas is solid
// red, so dropping it gives a clean unicolor repaint), and tint to the
// requested hex. `null` restores the original shared material so wheels
// stay in the same family. The setter is exposed so live Settings updates
// can reach the renderer without rebuilding the scene.
function buildCar(): {
  car: Group
  setPaint: (hex: string | null) => void
  cancel: () => void
} {
  let bodyMesh: Mesh | null = null
  let originalBodyMaterial: Material | null = null
  let paintMaterial: MeshStandardMaterial | null = null
  // Buffer the paint requested before the GLB resolves so the first apply
  // happens the moment the mesh appears.
  let pendingHex: string | null = null

  function applyPaint(hex: string | null) {
    if (!bodyMesh || !originalBodyMaterial) return
    if (hex === null) {
      // Restore stock. Keep the paint material around so a re-apply can
      // reuse it without churning GPU resources.
      bodyMesh.material = originalBodyMaterial
      return
    }
    if (!paintMaterial) {
      paintMaterial = new MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.5,
        metalness: 0.05,
      })
    }
    paintMaterial.color.set(hex)
    bodyMesh.material = paintMaterial
  }

  const { car, cancel: cancelLoad } = buildCarFrame((clone) => {
    clone.traverse((obj) => {
      if (bodyMesh) return
      const mesh = obj as Mesh
      if (!mesh.isMesh) return
      // The Kenney GLB names the chassis node "body". Match prefix so a
      // future re-export with a numeric suffix still works.
      if (typeof mesh.name === 'string' && mesh.name.startsWith('body')) {
        bodyMesh = mesh
        const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
        originalBodyMaterial = mat ?? null
      }
    })
    applyPaint(pendingHex)
  })

  return {
    car,
    setPaint: (hex: string | null) => {
      pendingHex = hex
      applyPaint(hex)
    },
    cancel: () => {
      cancelLoad()
      paintMaterial?.dispose()
      paintMaterial = null
    },
  }
}

// Skid mark layer: a fixed-size pool of dark quads laid flat on the road
// that the rAF loop spawns into when the car is sliding. The pool is a ring
// buffer; the oldest mark is overwritten when capacity is hit so the GPU
// footprint stays bounded regardless of race length. Each quad owns its own
// material so per-mark alpha can fade independently without touching shaders.
//
// Spawn poses are passed in as world `(x, z, heading)` plus the slide's peak
// intensity. The renderer offsets each mark to the rear-axle stripes (left
// and right of the chassis) so the trail reads as two distinct tire marks.
export interface SkidMarkLayer {
  group: Group
  spawn: (x: number, z: number, heading: number, peakAlpha: number, nowMs: number) => void
  tick: (nowMs: number) => void
  clear: () => void
  dispose: () => void
}

interface SkidMarkSlot {
  mesh: Mesh
  mat: MeshBasicMaterial
  spawnedAt: number
  peak: number
  active: boolean
}

// Half the rear-axle width in world units. TRACK_WIDTH is 8; the car's
// rendered footprint is roughly 2 wide after the GLB scale, so 1.0 places
// the two stripes about a tire's width apart. Tuned visually so the marks
// read as paired stripes rather than a single smeared blob.
const SKID_MARK_REAR_OFFSET = 1.05
// How far behind the chassis center the rear axle sits. The car GLB pivots
// near its midpoint, so this is the back-half of the visible footprint.
const SKID_MARK_REAR_BACK = 1.4
// Sit slightly above the road plane (which itself sits at y=0.01) so the
// marks render on top without z-fighting the road material.
const SKID_MARK_Y = 0.02

export function buildSkidMarkLayer(
  poolSize = SKID_MARK_POOL_SIZE,
): SkidMarkLayer {
  const group = new Group()
  // One geometry shared across every quad in the pool. Each slot owns its
  // own material so per-mark alpha animates independently.
  const geom = new PlaneGeometry(TRACK_WIDTH * 0.08, SKID_MARK_LENGTH)
  const slots: SkidMarkSlot[] = []
  for (let i = 0; i < poolSize; i++) {
    const mat = new MeshBasicMaterial({
      color: 0x1a1a1a,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    })
    const mesh = new Mesh(geom, mat)
    mesh.rotation.x = -Math.PI / 2
    mesh.visible = false
    group.add(mesh)
    slots.push({ mesh, mat, spawnedAt: 0, peak: 0, active: false })
  }

  // Two slots per spawn (one stripe per rear wheel). Track them via a
  // single ring index that advances by 2 each spawn.
  let writeIdx = 0

  function placeSlot(
    slot: SkidMarkSlot,
    cx: number,
    cz: number,
    headingY: number,
    peak: number,
    nowMs: number,
  ) {
    slot.mesh.position.set(cx, SKID_MARK_Y, cz)
    // The plane started in the XY plane (width on X, length on Y). After
    // `rotation.x = -PI/2` the local +Y direction maps to world -Z, so a
    // mark with `rotation.y = 0` lays its length along world -Z. To align
    // the length with the car's heading we rotate about world Y by
    // `heading - PI/2`: at heading 0 (car facing +X) this is -PI/2, which
    // takes -Z back around to +X.
    slot.mesh.rotation.y = headingY - Math.PI / 2
    slot.spawnedAt = nowMs
    slot.peak = peak
    slot.active = true
    slot.mat.opacity = peak
    slot.mesh.visible = peak > 0
  }

  return {
    group,
    spawn(x, z, heading, peakAlpha, nowMs) {
      if (peakAlpha <= 0) return
      // Rear axle is back along the car's local -X (heading 0 looks +X).
      const cosH = Math.cos(heading)
      const sinH = -Math.sin(heading) // world Z = -sin(heading) for our coord system
      // The "back" vector is opposite of the heading.
      const backX = -cosH * SKID_MARK_REAR_BACK
      const backZ = -sinH * SKID_MARK_REAR_BACK
      // The "right" vector is perpendicular to heading in the XZ plane.
      // For heading 0 (+X), right is +Z. So right = (-sinH, cosH) but our
      // sinH already encodes the negation, so:
      const rightX = -sinH
      const rightZ = cosH
      const baseX = x + backX
      const baseZ = z + backZ
      const leftSlot = slots[writeIdx]
      const rightSlot = slots[(writeIdx + 1) % poolSize]
      placeSlot(
        leftSlot,
        baseX + rightX * -SKID_MARK_REAR_OFFSET,
        baseZ + rightZ * -SKID_MARK_REAR_OFFSET,
        heading,
        peakAlpha,
        nowMs,
      )
      placeSlot(
        rightSlot,
        baseX + rightX * SKID_MARK_REAR_OFFSET,
        baseZ + rightZ * SKID_MARK_REAR_OFFSET,
        heading,
        peakAlpha,
        nowMs,
      )
      writeIdx = nextSkidMarkIndex(
        nextSkidMarkIndex(writeIdx, poolSize),
        poolSize,
      )
    },
    tick(nowMs) {
      for (let i = 0; i < slots.length; i++) {
        const s = slots[i]
        if (!s.active) continue
        const age = nowMs - s.spawnedAt
        const a = skidMarkAlpha(age, s.peak)
        if (a <= 0) {
          s.active = false
          s.mesh.visible = false
          s.mat.opacity = 0
        } else {
          s.mat.opacity = a
        }
      }
    },
    clear() {
      for (let i = 0; i < slots.length; i++) {
        const s = slots[i]
        s.active = false
        s.mesh.visible = false
        s.mat.opacity = 0
      }
      writeIdx = 0
    },
    dispose() {
      for (let i = 0; i < slots.length; i++) {
        slots[i].mat.dispose()
      }
      geom.dispose()
    },
  }
}

// Re-export the pool helpers so RaceCanvas can reference the constants
// without reaching across modules.
export { skidMarkPeakAlpha }

// Ghost variant of the player car: same GLB clone, but every material is
// swapped for a translucent cyan tint so it reads as a recording rather than
// another vehicle. Returned `dispose` releases the override material.
export function buildGhostCar(): { ghost: Group; dispose: () => void } {
  const ghostMat = new MeshStandardMaterial({
    color: 0x66e3ff,
    emissive: 0x114a55,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
  })
  const { car, cancel } = buildCarFrame((clone) => {
    clone.traverse((obj) => {
      const mesh = obj as Mesh
      if (mesh.isMesh) mesh.material = ghostMat
    })
  })
  return {
    ghost: car,
    dispose: () => {
      cancel()
      ghostMat.dispose()
    },
  }
}

export function buildScene(path: TrackPath): SceneBundle {
  const scene = new Scene()
  scene.background = new Color(0x9ad8ff)

  const ambient = new AmbientLight(0xffffff, 0.55)
  scene.add(ambient)
  const sun = new DirectionalLight(0xffffff, 0.9)
  sun.position.set(80, 160, 60)
  scene.add(sun)

  const trackMat = new MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.9 })
  for (const op of path.order) {
    const mesh = new Mesh(pieceGeometry(op), trackMat)
    mesh.position.y = 0.01
    scene.add(mesh)
  }

  const center = trackCenter(path)
  const ground = new Mesh(
    new PlaneGeometry(800, 800),
    new MeshStandardMaterial({ color: 0x6fb26f, roughness: 1.0 }),
  )
  ground.rotation.x = -Math.PI / 2
  ground.position.set(center.x, -0.02, center.z)
  scene.add(ground)

  const stripeGeom = new PlaneGeometry(TRACK_WIDTH, 1.2)
  const stripeMat = new MeshStandardMaterial({ color: 0xffffff })
  const stripe = new Mesh(stripeGeom, stripeMat)
  stripe.rotation.x = -Math.PI / 2
  stripe.rotation.z = path.finishLine.heading - Math.PI / 2
  stripe.position.set(path.finishLine.position.x, 0.02, path.finishLine.position.z)
  scene.add(stripe)

  const { car, setPaint: setCarPaint, cancel: cancelCar } = buildCar()
  scene.add(car)

  const skidMarks = buildSkidMarkLayer()
  scene.add(skidMarks.group)

  const camera = new PerspectiveCamera(70, 1, 0.1, 2000)
  camera.position.set(0, 10, 20)

  const dispose = () => {
    cancelCar()
    // The skid mark layer's materials and shared geometry are picked up by
    // the traversal below (the group sits inside `scene` and dedupes the
    // shared geometry through `Set` semantics on dispose). Calling
    // `skidMarks.dispose()` here would double-dispose the same resources.
    const mats = new Set<Material>()
    const geoms = new Set<BufferGeometry>()
    scene.traverse((obj) => {
      const mesh = obj as Mesh
      if (mesh.geometry) geoms.add(mesh.geometry)
      const mat = mesh.material
      if (Array.isArray(mat)) mat.forEach((m) => mats.add(m))
      else if (mat) mats.add(mat)
    })
    geoms.forEach((g) => g.dispose())
    mats.forEach((m) => m.dispose())
  }

  return { scene, camera, car, setCarPaint, skidMarks, dispose }
}

export interface CameraRigParams {
  height: number
  distance: number
  lookAhead: number
  positionLerp: number
  targetLerp: number
}

export const DEFAULT_CAMERA_RIG: CameraRigParams = {
  height: 6,
  distance: 14,
  lookAhead: 6,
  positionLerp: 0.12,
  targetLerp: 0.2,
}

export interface CameraRigState {
  position: { x: number; y: number; z: number }
  target: { x: number; y: number; z: number }
}

export function initCameraRig(carX: number, carZ: number, heading: number): CameraRigState {
  const cx = Math.cos(heading)
  const sz = -Math.sin(heading)
  return {
    position: {
      x: carX - cx * DEFAULT_CAMERA_RIG.distance,
      y: DEFAULT_CAMERA_RIG.height,
      z: carZ - sz * DEFAULT_CAMERA_RIG.distance,
    },
    target: { x: carX, y: 1, z: carZ },
  }
}

export function updateCameraRig(
  rig: CameraRigState,
  carX: number,
  carZ: number,
  heading: number,
  params: CameraRigParams = DEFAULT_CAMERA_RIG,
): void {
  const cx = Math.cos(heading)
  const sz = -Math.sin(heading)
  const wantX = carX - cx * params.distance
  const wantZ = carZ - sz * params.distance
  const aheadX = carX + cx * params.lookAhead
  const aheadZ = carZ + sz * params.lookAhead

  rig.position.x += (wantX - rig.position.x) * params.positionLerp
  rig.position.y += (params.height - rig.position.y) * params.positionLerp
  rig.position.z += (wantZ - rig.position.z) * params.positionLerp
  rig.target.x += (aheadX - rig.target.x) * params.targetLerp
  rig.target.y += (1 - rig.target.y) * params.targetLerp
  rig.target.z += (aheadZ - rig.target.z) * params.targetLerp
}
