import {
  AmbientLight,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  Group,
  type Material,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
} from 'three'
import {
  CELL_SIZE,
  TRACK_WIDTH,
  type OrderedPiece,
  type TrackPath,
} from './trackPath'

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

function pieceGeometry(op: OrderedPiece): BufferGeometry {
  return op.piece.type === 'straight' ? straightGeometry(op) : cornerGeometry(op)
}

function buildCar(): Group {
  const group = new Group()
  const body = new Mesh(
    new BoxGeometry(2.2, 1.0, 4.2),
    new MeshStandardMaterial({ color: 0xe84a5f, roughness: 0.6 }),
  )
  body.position.y = 0.9
  const cabin = new Mesh(
    new BoxGeometry(1.8, 0.8, 2.2),
    new MeshStandardMaterial({ color: 0x1b1b1b, roughness: 0.4 }),
  )
  cabin.position.y = 1.8
  cabin.position.z = 0.3
  group.add(body)
  group.add(cabin)
  const nose = new Mesh(
    new BoxGeometry(0.8, 0.2, 0.6),
    new MeshStandardMaterial({ color: 0xffffff }),
  )
  nose.position.set(0, 1.1, -2.1)
  group.add(nose)
  return group
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
  let sumX = 0
  let sumZ = 0
  for (const op of path.order) {
    sumX += op.center.x
    sumZ += op.center.z
    const mesh = new Mesh(pieceGeometry(op), trackMat)
    mesh.position.y = 0.01
    scene.add(mesh)
  }

  const ground = new Mesh(
    new PlaneGeometry(800, 800),
    new MeshStandardMaterial({ color: 0x6fb26f, roughness: 1.0 }),
  )
  ground.rotation.x = -Math.PI / 2
  ground.position.set(
    sumX / path.order.length,
    -0.02,
    sumZ / path.order.length,
  )
  scene.add(ground)

  const start = path.order[0]
  const entryIsVertical = start.entryDir === 0 || start.entryDir === 2
  const stripeGeom = new PlaneGeometry(
    entryIsVertical ? TRACK_WIDTH : 1.2,
    entryIsVertical ? 1.2 : TRACK_WIDTH,
  )
  const stripeMat = new MeshStandardMaterial({ color: 0xffffff })
  const stripe = new Mesh(stripeGeom, stripeMat)
  stripe.rotation.x = -Math.PI / 2
  stripe.position.set(path.finishLine.x, 0.02, path.finishLine.z)
  scene.add(stripe)

  const car = buildCar()
  scene.add(car)

  const camera = new PerspectiveCamera(70, 1, 0.1, 2000)
  camera.position.set(0, 10, 20)

  const dispose = () => {
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
