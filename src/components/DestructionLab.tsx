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
  applyCameraRig,
  DEFAULT_CAMERA_RIG,
  initCameraRig,
  updateCameraRig,
  type CameraRigParams,
  type CameraRigState,
} from '@/game/sceneBuilder'
import { MOBILE_GAME_SURFACE_STYLES } from '@/lib/mobileGameSurface'
import { useControlSettings } from '@/hooks/useControlSettings'
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
import { TouchControls } from './TouchControls'
import { DestructionLabHud, type DestructionHudState } from './DestructionLabHud'

// Destruction Lab client component. Mounts a Three.js renderer over the
// full viewport, loads the Kenney sedan once, drives it either via the
// circle AI or via direct keyboard / touch / gamepad input depending on
// the user's mode toggle, and routes pointer clicks through the
// destruction stack.
//
// The chase camera is the same rig the main racing mode (RaceCanvas)
// uses, sourced from `sceneBuilder.initCameraRig` and tuned via the
// player's saved Settings via `useControlSettings`. The drive controls
// reuse the shared `useKeyboard` snapshot plus the same `TouchControls`
// virtual joystick that ships on the loop / drag / derby modes, so
// mobile users see exactly the same on-screen stick they get on the
// title-screen-launched Free Race.
//
// rAF loop responsibilities:
//   1. Read input snapshot (AI or player) and fold drivability into it.
//   2. Step the math integrator (stepPhysics from game/physics.ts).
//   3. Mirror physics state onto the car group's transform.
//   4. Tick the destruction car (deformers, decals already updated, emitter).
//   5. Tick free bodies (detached panels).
//   6. Update the chase camera rig.
//   7. Render.

const MODEL_URL = '/models/derby/car.glb'
const PAINT_COLOR = 0xff5544
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
  const { settings } = useControlSettings()
  const keysRef = useKeyboard(settings.keyBindings)
  const [hud, setHud] = useState<DestructionHudState | null>(null)
  // Mutable refs for buttons -> rAF loop so the loop sees the latest
  // request without re-mounting on every state change.
  const requestRepairRef = useRef(false)
  const requestDetonateRef = useRef(false)

  // The camera rig is derived from the player's saved Settings each
  // render so a tweak in SettingsPane lands on the next frame, exactly
  // like RaceCanvas does it via Game.tsx. The lab respects whichever
  // preset the player picked for race mode (Chase far, Chase close,
  // Cockpit, etc.). Players who want a different framing on mobile
  // switch their saved preset in Settings, the same way race mode
  // handles per-device camera choice.
  //
  // The one deviation: positionLerp and targetLerp are forced to 1
  // (snap-to) instead of the user's follow speed. The lab uses a
  // self-driving AI that turns continuously, and on narrow portrait
  // viewports the standard followSpeed=1 lerp (positionLerp=0.12)
  // trails far enough behind the heading change to push the car
  // entirely out of frame. Race mode handles this naturally because
  // the player tends to drive in mostly straight lines along the
  // track and any lateral lag is hidden by the road extending ahead.
  const cameraRigRef = useRef<CameraRigParams | null>(null)
  {
    cameraRigRef.current = {
      height: settings.camera.height,
      distance: settings.camera.distance,
      lookAhead: settings.camera.lookAhead,
      positionLerp: 1,
      targetLerp: 1,
      cameraForward: settings.camera.cameraForward,
      targetHeight: settings.camera.targetHeight,
      fov: settings.camera.fov,
    }
  }

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
    const container: HTMLDivElement = containerRaw

    const renderer = new WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    // setSize must update the canvas CSS dimensions too (default
    // updateStyle = true). Passing false leaves the canvas styled at
    // its WebGL framebuffer size (CSS px = w * DPR), which on DPR=2
    // mobile devices overflows the container by 2x and the visible
    // top-left quarter shows what should be frame center at the
    // bottom-right corner.
    renderer.setSize(container.clientWidth, container.clientHeight)
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

    const initialRig = cameraRigRef.current ?? DEFAULT_CAMERA_RIG
    const camera = new PerspectiveCamera(
      initialRig.fov ?? DEFAULT_CAMERA_RIG.fov ?? 70,
      container.clientWidth / container.clientHeight,
      0.1,
      500,
    )

    // Two-group rig matching RaceCanvas's `buildCarFrame`. The outer
    // group is rotated to the physics heading every frame. The inner
    // group is pre-rotated by CAR_MODEL_YAW_OFFSET (π/2) so the GLB's
    // default orientation (nose at -Z) aligns with the physics
    // convention (heading=0 -> nose at +X). Without this inner offset
    // the chase camera ended up to the side of the car instead of
    // behind it, because the camera's "behind" direction came from
    // cos/sin of the physics heading while the visible mesh pointed
    // somewhere else.
    const carGroup = new Group()
    carGroup.name = 'destruction.car.root'
    const carInner = new Group()
    carInner.name = 'destruction.car.inner'
    carInner.rotation.y = Math.PI / 2
    carGroup.add(carInner)
    scene.add(carGroup)

    // Physics state. stepPhysics returns a fresh state object every
    // call (it does not mutate in place); we reassign the let binding
    // each frame so the next tick sees the updated position. Tracking
    // this as `let` matches how RaceCanvas threads its game state
    // through the rAF loop.
    //
    // Spawn on the AI circle so the controller does not have to chase
    // a far-off target on frame one.
    let physicsState: PhysicsState = {
      x: 60,
      z: 0,
      heading: Math.PI / 2,
      speed: 0,
      angularVelocity: 0,
    }

    // Chase camera rig matching the main race mode. We seed it at the
    // car's spawn so the first frame is already in pose; the rAF loop
    // ticks it from the car's current physics state each frame.
    const rig: CameraRigState = initCameraRig(
      physicsState.x,
      physicsState.z,
      physicsState.heading,
      cameraRigRef.current ?? undefined,
    )
    applyCameraRig(camera, rig)
    let lastAppliedFov = camera.fov

    const freeBodies: FreeBody[] = []
    let car: DestructionCar | null = null
    let asset: DestructionAsset | null = null
    let cancelled = false

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
          carInner.add(loaded.group)
          car = createDestructionCar({
            asset: loaded,
            scene,
            freeBodies,
          })
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
          physicsState = {
            ...physicsState,
            speed: 0,
            angularVelocity: 0,
          }
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
        physicsState = stepPhysics(
          physicsState,
          input,
          dt,
          true,
          undefined,
          drivability.accelFactor,
          drivability.maxSpeedFactor,
        )
        carGroup.position.set(physicsState.x, 0, physicsState.z)
        carGroup.rotation.y = physicsState.heading
        if (asset) {
          const wheelCirc = 2 * Math.PI * 0.35
          const spinDelta = (physicsState.speed * dt) / wheelCirc * (2 * Math.PI)
          for (const wn of ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr'] as const) {
            const pivot = asset.wheelPivots[wn]
            pivot.spin.rotation.x += spinDelta
          }
          const targetSteer = input.steer * 0.4
          for (const wn of ['wheel_fl', 'wheel_fr'] as const) {
            const p = asset.wheelPivots[wn]
            p.steer.rotation.y += (targetSteer - p.steer.rotation.y) * 0.2
          }
        }
        const spawn = new Vector3(0, 1.0, -1.4)
        spawn.applyEuler(carGroup.rotation)
        spawn.add(carGroup.position)
        car.tick(dt, { x: spawn.x, y: spawn.y, z: spawn.z })
      }

      tickFreeBodies(freeBodies, dt)

      // Chase camera rig: identical math to RaceCanvas. Re-read the
      // current params each frame so a Settings slider lands without a
      // remount, and reapply the FOV when it changes.
      const liveRig = cameraRigRef.current ?? DEFAULT_CAMERA_RIG
      const liveFov = liveRig.fov ?? DEFAULT_CAMERA_RIG.fov ?? 70
      if (liveFov !== lastAppliedFov) {
        camera.fov = liveFov
        camera.updateProjectionMatrix()
        lastAppliedFov = liveFov
      }
      updateCameraRig(
        rig,
        physicsState.x,
        physicsState.z,
        physicsState.heading,
        liveRig,
      )
      applyCameraRig(camera, rig)

      if (now - lastHudPushMs > 100) {
        lastHudPushMs = now
        publishHud()
      }

      renderer.render(scene, camera)
    }

    raf = requestAnimationFrame(tick)

    const dom = renderer.domElement

    function isTouchEvent(e: PointerEvent): boolean {
      return e.pointerType === 'touch' || e.pointerType === 'pen'
    }

    // Pointer flow: every short tap that does not drift more than a few
    // px is treated as a hit attempt. The chase camera owns the view
    // so there is no orbit gesture to disambiguate from a click.
    function onPointerDown(e: PointerEvent) {
      activePointer = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        startTs: performance.now(),
        isTouch: isTouchEvent(e),
      }
    }

    function onPointerUp(e: PointerEvent) {
      if (!activePointer || activePointer.pointerId !== e.pointerId) return
      const dx = e.clientX - activePointer.startX
      const dy = e.clientY - activePointer.startY
      const distance = Math.hypot(dx, dy)
      const threshold = activePointer.isTouch
        ? DRAG_THRESHOLD_PX_TOUCH
        : DRAG_THRESHOLD_PX_MOUSE
      const duration = performance.now() - activePointer.startTs
      const isClick = distance <= threshold && duration <= CLICK_WINDOW_MS
      if (isClick) {
        const rect = dom.getBoundingClientRect()
        const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1
        const ndcY = -(((e.clientY - rect.top) / rect.height) * 2 - 1)
        attemptHit(ndcX, ndcY)
      }
      activePointer = null
    }

    dom.addEventListener('pointerdown', onPointerDown)
    dom.addEventListener('pointerup', onPointerUp)
    dom.addEventListener('pointercancel', onPointerUp)

    function onResize() {
      const w = container.clientWidth
      const h = container.clientHeight
      renderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    window.addEventListener('resize', onResize)

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      dom.removeEventListener('pointerdown', onPointerDown)
      dom.removeEventListener('pointerup', onPointerUp)
      dom.removeEventListener('pointercancel', onPointerUp)
      window.removeEventListener('resize', onResize)
      if (car) car.dispose()
      if (asset) asset.dispose()
      freeBodies.length = 0
      renderer.dispose()
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement)
      }
      ground.geometry.dispose()
      ;(ground.material as MeshStandardMaterial).dispose()
    }
    // The rig and key bindings live in refs; the effect deliberately
    // runs once so the WebGL context is not torn down on every settings
    // tweak.
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
      <TouchControls
        keys={keysRef}
        enabled={driveMode === 'player'}
        mode={settings.touchMode}
      />
    </div>
  )
}

// Same mobile-safe surface contract as Game.tsx / DragRace.tsx / DerbyRound:
// fixed full-viewport, touchAction none, no text selection, no iOS callout.
const pageStyle: React.CSSProperties = {
  ...MOBILE_GAME_SURFACE_STYLES,
  background: '#9ad8ff',
  color: 'white',
  fontFamily: 'var(--font-cartoony), system-ui, sans-serif',
}
const canvasContainerStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
}

