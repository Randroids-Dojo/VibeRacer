'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  AmbientLight,
  CircleGeometry,
  Color,
  DirectionalLight,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three'
import { stepPhysics, type PhysicsState } from '@/game/physics'
import {
  loadDestructionCar,
  type DestructionAsset,
} from '@/game/destruction/asset'
import {
  createDestructionCar,
  panelIdForMesh,
  type DestructionCar,
} from '@/game/destruction/car'
import { tickFreeBodies, type FreeBody } from '@/game/destruction/freeBody'
import { step as aiStep } from '@/game/destruction/ai'
import { step as playerInputStep } from '@/game/destruction/playerInput'
import { useKeyboard } from '@/hooks/useKeyboard'
import { DestructionLabHud, type DestructionHudState } from './DestructionLabHud'

// Destruction Lab client component. Mounts a Three.js renderer over the
// full viewport, loads the Kenney sedan once, drives it either via the
// circle AI or via direct keyboard input depending on the user's mode
// toggle, and routes pointer clicks through the destruction stack.
//
// rAF loop responsibilities:
//   1. Read input snapshot (AI or player) and fold drivability into it.
//   2. Step the math integrator (stepPhysics from game/physics.ts).
//   3. Mirror physics state onto the car group's transform.
//   4. Tick the destruction car (deformers, decals already updated, emitter).
//   5. Tick free bodies (detached panels).
//   6. Update the chase camera.
//   7. Render.
//
// Pointer handling owns the click-vs-drag arbitration so a tap or
// click both land cleanly on touch and desktop. The raycast happens in
// pointerup so drag gestures (which the user uses for camera orbit)
// never trigger a hit.

const MODEL_URL = '/models/derby/car.glb'
const PAINT_COLOR = 0xff5544
const CAMERA_MIN_DIST = 8
const CAMERA_MAX_DIST = 30
const DEFAULT_PITCH_DEG = 28
const PITCH_MIN_DEG = 10
const PITCH_MAX_DEG = 70
const DRAG_THRESHOLD_PX_MOUSE = 6
const DRAG_THRESHOLD_PX_TOUCH = 12
const CLICK_WINDOW_MS = 350
const HIT_BASE_DAMAGE = 16
const HIT_DAMAGE_JITTER = 8

interface PointerSession {
  pointerId: number
  startX: number
  startY: number
  startTs: number
  isTouch: boolean
  isDragging: boolean
  lastX: number
  lastY: number
}

interface CameraOrbit {
  yawRad: number
  pitchRad: number
  distance: number
}

// `mulberry32` seeded RNG. Local copy so the destruction lab does not
// import from the derby module.
function makeRng(seed: number): () => number {
  let a = seed >>> 0
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function DestructionLab() {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [driveMode, setDriveMode] = useState<'ai' | 'player'>('ai')
  const driveModeRef = useRef(driveMode)
  driveModeRef.current = driveMode
  const keysRef = useKeyboard()
  const [hud, setHud] = useState<DestructionHudState | null>(null)
  // Mutable refs for buttons -> rAF loop so the loop sees the latest
  // request without re-mounting on every state change.
  const requestRepairRef = useRef(false)
  const requestDetonateRef = useRef(false)

  const requestRepair = useCallback(() => {
    requestRepairRef.current = true
  }, [])
  const requestDetonate = useCallback(() => {
    requestDetonateRef.current = true
  }, [])
  const toggleDriveMode = useCallback(() => {
    setDriveMode((m) => (m === 'ai' ? 'player' : 'ai'))
  }, [])

  useEffect(() => {
    const containerRaw = containerRef.current
    if (!containerRaw) return
    // Aliasing into a non-nullable local that the inner closures can
    // read without re-narrowing. TS does not propagate the early-return
    // narrowing into hoisted function declarations.
    const container: HTMLDivElement = containerRaw

    const renderer = new WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(container.clientWidth, container.clientHeight, false)
    renderer.domElement.dataset.testid = 'destruction-canvas'
    renderer.domElement.style.touchAction = 'none'
    container.appendChild(renderer.domElement)

    const scene = new Scene()
    scene.background = new Color(0x9ad8ff)

    const ambient = new AmbientLight(0xffffff, 0.55)
    scene.add(ambient)
    const sun = new DirectionalLight(0xffffff, 1.1)
    sun.position.set(40, 80, 30)
    scene.add(sun)

    const ground = new Mesh(
      new CircleGeometry(80, 64),
      new MeshStandardMaterial({
        color: 0xc8b48c,
        roughness: 0.96,
        metalness: 0.0,
      }),
    )
    ground.rotation.x = -Math.PI / 2
    ground.position.y = 0
    scene.add(ground)

    const camera = new PerspectiveCamera(
      55,
      container.clientWidth / container.clientHeight,
      0.1,
      500,
    )

    const carGroup = new Group()
    carGroup.name = 'destruction.car.root'
    scene.add(carGroup)

    const physicsState: PhysicsState = {
      x: 18,
      z: 0,
      heading: Math.PI / 2,
      speed: 0,
      angularVelocity: 0,
    }

    const freeBodies: FreeBody[] = []
    let car: DestructionCar | null = null
    let asset: DestructionAsset | null = null
    let cancelled = false

    const orbit: CameraOrbit = {
      yawRad: 0,
      pitchRad: (DEFAULT_PITCH_DEG * Math.PI) / 180,
      distance: 14,
    }

    let raf = 0
    let prev = performance.now()
    const raycaster = new Raycaster()
    const tmpNdc = new Vector2()
    let activePointer: PointerSession | null = null
    const rng = makeRng(0x1234abcd)

    function loadAsset() {
      void loadDestructionCar({
        modelUrl: MODEL_URL,
        paintColor: PAINT_COLOR,
        subdivisionPasses: 1,
      })
        .then((loaded) => {
          if (cancelled) {
            loaded.dispose()
            return
          }
          asset = loaded
          carGroup.add(loaded.group)
          car = createDestructionCar({
            asset: loaded,
            scene,
            freeBodies,
          })
          // Initial HUD snapshot so the bars render at full HP before
          // the first frame fires.
          publishHud()
        })
        .catch((err) => {
          if (cancelled) return
          console.error('[destruction] failed to load asset', err)
        })
    }
    loadAsset()

    function publishHud() {
      if (!car) return
      const panels = car.getPanels()
      const drivability = car.getDrivability()
      setHud({
        panels: {
          hood: { hp: panels.hood.hp, max: 60, detached: panels.hood.detached },
          trunk: { hp: panels.trunk.hp, max: 60, detached: panels.trunk.detached },
          door_l: {
            hp: panels.door_l.hp,
            max: 80,
            detached: panels.door_l.detached,
          },
          door_r: {
            hp: panels.door_r.hp,
            max: 80,
            detached: panels.door_r.detached,
          },
          body: { hp: panels.body.hp, max: 140, detached: false },
          engine: { hp: panels.engine.hp, max: 100, detached: false },
        },
        drivability: {
          accelFactor: drivability.accelFactor,
          maxSpeedFactor: drivability.maxSpeedFactor,
          steerBias: drivability.steerBias,
          stalled: drivability.stalled,
        },
        totalHits: car.getTotalHits(),
        driveMode: driveModeRef.current,
      })
    }
    let lastHudPushMs = 0

    function attemptHit(ndcX: number, ndcY: number): void {
      if (!car || !asset) return
      tmpNdc.set(ndcX, ndcY)
      raycaster.setFromCamera(tmpNdc, camera)
      const intersections = raycaster.intersectObject(asset.group, true)
      if (intersections.length === 0) return
      const hit = intersections[0]
      const mesh = hit.object as Mesh
      const panelId = panelIdForMesh(asset, mesh)
      if (!panelId) return
      const worldPoint = hit.point.clone()
      // Use the interpolated face normal (in object space) transformed
      // into world space. Fallback when missing: derive from car center.
      let worldNormal: Vector3
      if (hit.face && hit.face.normal) {
        worldNormal = hit.face.normal
          .clone()
          .transformDirection(mesh.matrixWorld)
          .normalize()
      } else {
        const center = asset.group.getWorldPosition(new Vector3())
        worldNormal = worldPoint.clone().sub(center).normalize()
      }
      const amount = HIT_BASE_DAMAGE + (rng() - 0.5) * 2 * HIT_DAMAGE_JITTER
      car.applyHit({
        panelId,
        worldPoint,
        worldNormal,
        amount: amount > 1 ? amount : 1,
        nowMs: performance.now(),
        rng,
      })
      publishHud()
    }

    function tick(now: number) {
      raf = requestAnimationFrame(tick)
      const dt = Math.min((now - prev) / 1000, 1 / 30)
      prev = now

      if (requestRepairRef.current) {
        requestRepairRef.current = false
        if (car) {
          car.repair()
          // Drop any detached free bodies. Their meshes are now in the
          // scene; the car owns the asset so we delegate full reload to
          // a fresh asset on repair? Simpler: leave the detached
          // meshes in place (they keep simulating until they settle)
          // and just restore the car's HP / dents / wear / smoke.
          // A future polish slice can recycle the detached meshes
          // back onto the car; for now, a repaired car is a fresh-HP
          // car with its already-detached panels still on the ground.
          // We DO reset the physics state so a stalled car can drive
          // again.
          physicsState.speed = 0
          physicsState.angularVelocity = 0
        }
        publishHud()
      }
      if (requestDetonateRef.current) {
        requestDetonateRef.current = false
        if (car) {
          car.detonate(performance.now(), rng)
          publishHud()
        }
      }

      if (car) {
        const drivability = car.getDrivability()
        const input =
          driveModeRef.current === 'ai'
            ? aiStep(physicsState, drivability)
            : playerInputStep(keysRef.current, drivability)
        stepPhysics(
          physicsState,
          input,
          dt,
          true,
          undefined,
          drivability.accelFactor,
          drivability.maxSpeedFactor,
        )
        // Apply pose to the car root.
        carGroup.position.set(physicsState.x, 0, physicsState.z)
        // glTF cars in this project face -Z at heading 0 (matches
        // race/drag); rotate by heading around Y.
        carGroup.rotation.y = physicsState.heading
        // Spin the wheels using the asset's pivots: front wheels
        // steer; all four spin with linear speed.
        if (asset) {
          const wheelCirc = 2 * Math.PI * 0.35
          const spinDelta = (physicsState.speed * dt) / wheelCirc * (2 * Math.PI)
          for (const wn of ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr'] as const) {
            const pivot = asset.wheelPivots[wn]
            pivot.spin.rotation.x += spinDelta
          }
          // Front-axle steering: lerp the steer pivot toward the input
          // steer * a fixed max angle.
          const targetSteer = input.steer * 0.4
          for (const wn of ['wheel_fl', 'wheel_fr'] as const) {
            const p = asset.wheelPivots[wn]
            p.steer.rotation.y += (targetSteer - p.steer.rotation.y) * 0.2
          }
        }
        // Smoke emits from a point above the hood in world space.
        const spawn = new Vector3(0, 1.0, -1.4)
        spawn.applyEuler(carGroup.rotation)
        spawn.add(carGroup.position)
        car.tick(dt, performance.now(), { x: spawn.x, y: spawn.y, z: spawn.z })
      }

      tickFreeBodies(freeBodies, dt)

      // Chase camera: orbit around the car position with the user's
      // yaw / pitch / distance. Yaw is car heading + user orbit so the
      // camera follows the car forward but the user can swing left or
      // right.
      const anchor = car
        ? new Vector3(physicsState.x, 0.9, physicsState.z)
        : new Vector3(0, 0.9, 0)
      const yaw = (car ? physicsState.heading : 0) + orbit.yawRad
      const cx = anchor.x + Math.sin(yaw) * orbit.distance * Math.cos(orbit.pitchRad)
      const cz = anchor.z + Math.cos(yaw) * orbit.distance * Math.cos(orbit.pitchRad)
      const cy = anchor.y + Math.sin(orbit.pitchRad) * orbit.distance
      camera.position.set(cx, cy, cz)
      camera.lookAt(anchor)

      // Light HUD refresh: about 10 Hz; the deeper publishHud() on
      // hit + on button is what drives interactive updates.
      if (now - lastHudPushMs > 100) {
        lastHudPushMs = now
        publishHud()
      }

      renderer.render(scene, camera)
    }

    raf = requestAnimationFrame(tick)

    // Pointer handlers. The container owns drag-to-orbit and the
    // canvas owns click-to-hit; we attach to the canvas so the events
    // do not propagate to the HUD when the player clicks past it.
    const dom = renderer.domElement

    function isTouchEvent(e: PointerEvent): boolean {
      return e.pointerType === 'touch' || e.pointerType === 'pen'
    }

    function onPointerDown(e: PointerEvent) {
      e.preventDefault()
      dom.setPointerCapture(e.pointerId)
      activePointer = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        startTs: performance.now(),
        isTouch: isTouchEvent(e),
        isDragging: false,
        lastX: e.clientX,
        lastY: e.clientY,
      }
    }

    function onPointerMove(e: PointerEvent) {
      if (!activePointer || activePointer.pointerId !== e.pointerId) return
      const dx = e.clientX - activePointer.startX
      const dy = e.clientY - activePointer.startY
      const distance = Math.hypot(dx, dy)
      const threshold = activePointer.isTouch
        ? DRAG_THRESHOLD_PX_TOUCH
        : DRAG_THRESHOLD_PX_MOUSE
      if (!activePointer.isDragging && distance > threshold) {
        activePointer.isDragging = true
      }
      if (activePointer.isDragging) {
        const stepX = e.clientX - activePointer.lastX
        const stepY = e.clientY - activePointer.lastY
        // Drag right -> yaw left (intuitive "push the world right").
        // Sensitivity: 0.005 rad per px feels right at typical viewport.
        orbit.yawRad -= stepX * 0.005
        orbit.pitchRad += stepY * 0.005
        orbit.pitchRad = Math.max(
          (PITCH_MIN_DEG * Math.PI) / 180,
          Math.min((PITCH_MAX_DEG * Math.PI) / 180, orbit.pitchRad),
        )
      }
      activePointer.lastX = e.clientX
      activePointer.lastY = e.clientY
    }

    function onPointerUp(e: PointerEvent) {
      if (!activePointer || activePointer.pointerId !== e.pointerId) return
      const duration = performance.now() - activePointer.startTs
      const isClick =
        !activePointer.isDragging && duration <= CLICK_WINDOW_MS
      if (isClick) {
        const rect = dom.getBoundingClientRect()
        const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1
        const ndcY = -(((e.clientY - rect.top) / rect.height) * 2 - 1)
        attemptHit(ndcX, ndcY)
      }
      try {
        dom.releasePointerCapture(e.pointerId)
      } catch {
        // releasePointerCapture throws if the capture was already
        // implicitly released (e.g. by browser gesture handling); the
        // exception is harmless.
      }
      activePointer = null
    }

    function onWheel(e: WheelEvent) {
      e.preventDefault()
      const delta = Math.sign(e.deltaY) * 1.2
      orbit.distance = Math.max(
        CAMERA_MIN_DIST,
        Math.min(CAMERA_MAX_DIST, orbit.distance + delta),
      )
    }

    dom.addEventListener('pointerdown', onPointerDown)
    dom.addEventListener('pointermove', onPointerMove)
    dom.addEventListener('pointerup', onPointerUp)
    dom.addEventListener('pointercancel', onPointerUp)
    dom.addEventListener('wheel', onWheel, { passive: false })

    function onResize() {
      const w = container.clientWidth
      const h = container.clientHeight
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    window.addEventListener('resize', onResize)

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      dom.removeEventListener('pointerdown', onPointerDown)
      dom.removeEventListener('pointermove', onPointerMove)
      dom.removeEventListener('pointerup', onPointerUp)
      dom.removeEventListener('pointercancel', onPointerUp)
      dom.removeEventListener('wheel', onWheel)
      window.removeEventListener('resize', onResize)
      if (car) car.dispose()
      if (asset) asset.dispose()
      // Detached free bodies still hold geometry references; their
      // meshes were children of the asset's group originally, whose
      // dispose call already walked them. Clearing the array drops the
      // last references.
      freeBodies.length = 0
      renderer.dispose()
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement)
      }
      ground.geometry.dispose()
      ;(ground.material as MeshStandardMaterial).dispose()
    }
    // `keysRef` is a stable ref; effect deliberately runs once. We do
    // NOT depend on `driveMode` here because driveModeRef captures the
    // latest value without remounting the scene.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const overlay = useMemo(() => {
    if (!hud) return null
    return (
      <DestructionLabHud
        state={hud}
        onRepair={requestRepair}
        onDetonate={requestDetonate}
        onToggleDriveMode={toggleDriveMode}
      />
    )
  }, [hud, requestRepair, requestDetonate, toggleDriveMode])

  return (
    <div style={pageStyle}>
      <div ref={containerRef} style={canvasContainerStyle} />
      {overlay}
    </div>
  )
}

const pageStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: '#9ad8ff',
  color: 'white',
  fontFamily: 'var(--font-cartoony), system-ui, sans-serif',
  overflow: 'hidden',
}
const canvasContainerStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
}
