import {
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  Group,
  type Material,
  Mesh,
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

function buildCar(): { car: Group; cancel: () => void } {
  return buildCarFrame()
}

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

  const { car, cancel: cancelCar } = buildCar()
  scene.add(car)

  const camera = new PerspectiveCamera(70, 1, 0.1, 2000)
  camera.position.set(0, 10, 20)

  const dispose = () => {
    cancelCar()
    const mats = new Set<Material>()
    scene.traverse((obj) => {
      const mesh = obj as Mesh
      if (mesh.geometry) mesh.geometry.dispose()
      const mat = mesh.material
      if (Array.isArray(mat)) mat.forEach((m) => mats.add(m))
      else if (mat) mats.add(mat)
    })
    mats.forEach((m) => m.dispose())
  }

  return { scene, camera, car, dispose }
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
