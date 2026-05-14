'use client'

import { useEffect, useRef, type MutableRefObject } from 'react'
import {
  AmbientLight,
  Color,
  DirectionalLight,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three'
import {
  buildArenaMesh,
  type DerbyArenaMesh,
} from '@/game/derbyArena'
import {
  buildDerbyScenery,
  SKIRT_OUTER_RADIUS,
  type DerbyScenery,
} from '@/game/derbyScenery'
import { buildDerbyStadium, type DerbyStadium } from '@/game/derbyStadium'
import {
  FRONT_WHEEL_NAMES,
  WHEEL_NAMES,
  firstMeshOf,
  loadDerbyVehicleAsset,
  type DerbyVehicleAsset,
} from '@/game/derbyVehicleLoader'
import {
  createDamageVisualizer,
  type DerbyDamageVisualizer,
} from '@/game/derbyDamageVisuals'
import {
  pruneDebris,
  spawnDebris,
  tickDebris,
  type DerbyDebrisItem,
} from '@/game/derbyDebris'
import { mulberry32 } from '@/game/derbyRoundState'
import { derbyTick } from '@/game/derbyTick'
import {
  initBrain,
  stepAi,
  type DerbyAiBrain,
} from '@/game/derbyAi'
import {
  initDerbyRound,
  type DerbyRoundState,
} from '@/game/derbyRoundState'
import { isDestroyed } from '@/game/derbyVehicleState'
import {
  applyCameraRig,
  DEFAULT_CAMERA_RIG,
  initCameraRig,
  updateCameraRig,
  type CameraRigParams,
} from '@/game/sceneBuilder'
import { readPlayerInput } from '@/game/playerInput'
import type { KeyInput } from '@/hooks/useKeyboard'
import type { DerbyArenaConfig } from '@/lib/derbyArenas'
import type { DerbyVehicleConfig } from '@/lib/derbyVehicles'
import type { PhysicsInput } from '@/game/physics'

// Three.js host for the Derby round. Mounts a WebGL renderer, builds the
// arena and four placeholder vehicles, runs a rAF loop that calls
// derbyTick every frame, and updates car meshes from the resulting state.
// Player input comes from a keyboard ref; CPU inputs come from derbyAi.
//
// Vehicle visuals are still procedural box / cylinder geometry. The async
// signature on loadDerbyVehicleAsset lets a future GLB code path slot in
// against the named-submesh contract without touching this loop.

export interface DerbyCanvasProps {
  arena: DerbyArenaConfig
  vehicleConfigs: DerbyVehicleConfig[]
  // Index 0 is the player; CPU brains are initialized for indices >= 1.
  // The same array order drives carIdx in the round.
  keysRef: { current: KeyInput }
  // Live camera-rig overrides from Settings. Matches RaceCanvas behavior:
  // Derby reads the ref each frame so camera preset and slider changes apply
  // without rebuilding the WebGL scene.
  cameraRigRef?: MutableRefObject<CameraRigParams | null>
  // Called whenever the HUD-relevant snapshot changes. The canvas decides
  // when to call it (typically every few frames, on hits, and on round
  // end) so React renders only when there is something to update.
  onHud: (snapshot: DerbyHudSnapshot) => void
  // Fired when the round ends so the parent can swap to a results panel.
  onRoundEnd: (
    outcome: 'win' | 'loss' | 'timeout',
    summary: DerbyRoundSummary,
  ) => void
  // Fired every time a hit lands so the parent can spawn HUD popups.
  onHit: (event: DerbyHitEvent) => void
}

export interface DerbyHudSnapshot {
  place: number
  totalCars: number
  carsLeft: number
  scorePoints: number
  health: number
  maxHealth: number
}

export interface DerbyRoundSummary {
  outcome: 'win' | 'loss' | 'timeout'
  roundTimeMs: number
  finalHealths: number[]
  kills: number
  scorePoints: number
}

export interface DerbyHitEvent {
  amount: number
  // World-space hit point; the canvas projects it to the camera so the
  // HUD can anchor the popup near the impact.
  screenX: number
  screenY: number
}

const PLAYER_IDX = 0

const VEHICLE_BODY_HEIGHT = 1.0
const VEHICLE_WHEEL_RADIUS = 0.35

export function DerbyCanvas(props: DerbyCanvasProps) {
  const { arena, vehicleConfigs, keysRef, cameraRigRef } = props
  const containerRef = useRef<HTMLDivElement | null>(null)
  // Callbacks live in refs so the rAF loop sees the latest closures
  // without forcing the canvas to re-mount on every parent render.
  const onHudRef = useRef(props.onHud)
  const onHitRef = useRef(props.onHit)
  const onRoundEndRef = useRef(props.onRoundEnd)
  onHudRef.current = props.onHud
  onHitRef.current = props.onHit
  onRoundEndRef.current = props.onRoundEnd

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const renderer = new WebGLRenderer({ antialias: true, alpha: false })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(container.clientWidth, container.clientHeight)
    renderer.domElement.dataset.testid = 'derby-canvas'
    renderer.shadowMap.enabled = false
    container.appendChild(renderer.domElement)

    const scene = new Scene()
    scene.background = new Color(0xb88c54)

    const ambient = new AmbientLight(0xffffff, 0.5)
    const sun = new DirectionalLight(0xffffff, 1.0)
    sun.position.set(40, 80, 30)
    scene.add(ambient)
    scene.add(sun)

    const initialCameraParams = cameraRigRef?.current ?? DEFAULT_CAMERA_RIG
    const camera = new PerspectiveCamera(
      initialCameraParams.fov ?? DEFAULT_CAMERA_RIG.fov ?? 70,
      container.clientWidth / container.clientHeight,
      0.1,
      2000,
    )

    const arenaMesh: DerbyArenaMesh = buildArenaMesh(arena)
    scene.add(arenaMesh.group)
    // Decorative skirt around the arena: rocks, dirt piles, dead trees,
    // tires, drums, concrete chunks. Purely cosmetic; sits outside the
    // wall so cars never reach it.
    const scenery: DerbyScenery = buildDerbyScenery(arena)
    scene.add(scenery.group)
    // Stadium ring beyond the scenery: stepped concrete bowl, instanced
    // crowd, light poles. Inner radius derived from the scenery skirt's
    // outer extent so the venue stays correctly nested for any arena radius.
    const stadium: DerbyStadium = buildDerbyStadium(arena, SKIRT_OUTER_RADIUS)
    scene.add(stadium.group)

    const round: DerbyRoundState = initDerbyRound({
      arena,
      vehicleTypes: vehicleConfigs.map((v) => v.type),
    })

    // Camera rig uses the same live player settings as the loop mode.
    // initCameraRig seeds it at the player's spawn so the first frame is
    // already in pose; updateCameraRig+applyCameraRig run inside step().
    const cameraRig = initCameraRig(
      round.cars[PLAYER_IDX].physics.x,
      round.cars[PLAYER_IDX].physics.z,
      round.cars[PLAYER_IDX].physics.heading,
      initialCameraParams,
    )
    applyCameraRig(camera, cameraRig)
    let lastAppliedFov = camera.fov

    const brains: DerbyAiBrain[] = vehicleConfigs.map(() => initBrain())

    // Vehicle assets load asynchronously to keep the contract aligned with
    // the future GLB path. While the assets resolve, the cars render
    // nothing; loop typically resolves on the same frame for procedural
    // assets so this is invisible at runtime. The teardown flag below
    // catches the case where the effect cleans up before the load
    // resolves: late assets get disposed immediately so they do not leak.
    const carAssets: (DerbyVehicleAsset | null)[] = vehicleConfigs.map(() => null)
    const carVisualizers: (DerbyDamageVisualizer | null)[] = vehicleConfigs.map(
      () => null,
    )
    Promise.all(
      vehicleConfigs.map((cfg, i) =>
        loadDerbyVehicleAsset(cfg, i === PLAYER_IDX ? 0xfff7b0 : pickEnemyColor(cfg.type)),
      ),
    )
      .then((assets) => {
        if (stopped) {
          for (const a of assets) a.dispose()
          return
        }
        for (let i = 0; i < assets.length; i++) {
          carAssets[i] = assets[i]
          carVisualizers[i] = createDamageVisualizer(assets[i])
          scene.add(assets[i].group)
        }
      })
      .catch((err) => {
        console.error('[DerbyCanvas] vehicle asset load failed:', err)
      })

    const debrisItems: DerbyDebrisItem[] = []
    const debrisRng = mulberry32(round.rngSeed ^ 0x9e3779b9)

    let lastTimeMs = performance.now()
    let rafId = 0
    let stopped = false
    let lastHudPushMs = 0
    let endedReported = false

    // Accumulated rolling angle per wheel per car. Indexed [carIdx][wheelIdx
    // in FRONT_WHEEL_NAMES then REAR order], in radians. Sized lazily so
    // the asset-load promise can populate it once the carAssets are ready.
    const wheelSpinAngle: number[][] = vehicleConfigs.map(() => [0, 0, 0, 0])
    // Smoothed steer angle per car (front wheels) so a hard left-right key
    // tap eases instead of snapping.
    const steerAngleSmoothed: number[] = vehicleConfigs.map(() => 0)
    const STEER_MAX_RAD = Math.PI / 6 // 30 degrees at the front wheels
    const STEER_LERP_PER_SEC = 12
    function animateWheels(inputs: PhysicsInput[], dt: number): void {
      for (let i = 0; i < round.cars.length; i++) {
        const asset = carAssets[i]
        if (!asset) continue
        const car = round.cars[i]
        const input = inputs[i]
        // Smooth the steer target so visual response feels mechanical, not
        // instantaneous. clamp dt for the lerp so a frame stall does not
        // overshoot past the target.
        const target = clamp(input.steer ?? 0, -1, 1) * STEER_MAX_RAD
        const lerp = 1 - Math.exp(-STEER_LERP_PER_SEC * Math.min(dt, 0.05))
        steerAngleSmoothed[i] += (target - steerAngleSmoothed[i]) * lerp
        // Rolling speed: angular = linear / radius. Approximate the visual
        // wheel radius from the wheel mesh's bounding cylinder; the same
        // value is used for every wheel of a given car so we cache it on
        // first use as `asset.group.userData.wheelRadius`.
        const r =
          (asset.group.userData.wheelRadius as number | undefined) ??
          measureWheelRadius(asset)
        asset.group.userData.wheelRadius = r
        const angularDelta = (car.physics.speed * dt) / Math.max(0.01, r)
        for (let w = 0; w < WHEEL_NAMES.length; w++) {
          const name = WHEEL_NAMES[w]
          const pivot = asset.wheelPivots[name]
          if (FRONT_WHEEL_NAMES.includes(name)) {
            pivot.steer.rotation.y = steerAngleSmoothed[i]
          }
          wheelSpinAngle[i][w] += angularDelta
          // Spin axis is the wheel mesh's local rolling axis. The GLB build
          // script orients each wheel cylinder so its rotation axis is the
          // model-local X (width direction), so a Three.js X-axis rotation
          // on the spin pivot rolls the wheel forward.
          pivot.spin.rotation.x = wheelSpinAngle[i][w]
        }
      }
    }

    function syncVisuals() {
      for (let i = 0; i < round.cars.length; i++) {
        const car = round.cars[i]
        const asset = carAssets[i]
        if (!asset) continue
        asset.group.position.set(
          car.physics.x,
          VEHICLE_WHEEL_RADIUS,
          car.physics.z,
        )
        // Procedural model has its hood at local -Z and taillights at local
        // +Z, so local -Z is "front". Physics heading h points in world
        // direction (cos h, -sin h). To send local -Z to that world vector,
        // the Three.js Y rotation must be (h - PI/2). The previous formula
        // negated h, which mirrored every steering input visually and made
        // the chase camera spin the wrong way around the car.
        asset.group.rotation.y = car.physics.heading - Math.PI / 2
        asset.group.visible = !isDestroyed(car)
      }
    }

    function pushHudSnapshot() {
      const player = round.cars[PLAYER_IDX]
      const carsLeft = round.cars.reduce(
        (n, c) => (isDestroyed(c) ? n : n + 1),
        0,
      )
      const place = computePlace(round)
      const score = player.kills * 200 + Math.floor(player.aliveMs / 10_000) * 100
      onHudRef.current({
        place,
        totalCars: round.cars.length,
        carsLeft,
        scorePoints: score,
        health: player.health,
        maxHealth: player.maxHealth,
      })
    }

    // Reused across every hit-projection call so a multi-car pileup that
    // fires dozens of hit events in a frame does not allocate a fresh
    // Vector3 each time.
    const projectScratch = new Vector3()
    function projectToScreen(x: number, z: number): { sx: number; sy: number } {
      projectScratch.set(x, VEHICLE_BODY_HEIGHT, z).project(camera)
      const sx = (projectScratch.x * 0.5 + 0.5) * container!.clientWidth
      const sy = (1 - (projectScratch.y * 0.5 + 0.5)) * container!.clientHeight
      return { sx, sy }
    }

    function step() {
      if (stopped) return
      rafId = requestAnimationFrame(step)
      const nowMs = performance.now()
      const dtSec = Math.min(0.05, (nowMs - lastTimeMs) / 1000)
      lastTimeMs = nowMs

      // Build per-car PhysicsInput. carIdx 0 is the player; the rest are CPU AI.
      // The player input goes through the shared readPlayerInput so the
      // keyboard / gamepad / touch translation matches loop and drag.
      const inputs: PhysicsInput[] = []
      for (let i = 0; i < round.cars.length; i++) {
        if (i === PLAYER_IDX) {
          inputs.push(readPlayerInput(keysRef.current))
        } else {
          inputs.push(
            stepAi(brains[i], {
              selfIdx: i,
              cars: round.cars,
              arenaRadius: arena.radius,
              nowMs: round.elapsedMs,
            }),
          )
        }
      }

      const result = derbyTick(round, { perCar: inputs }, dtSec)
      syncVisuals()
      animateWheels(inputs, dtSec)

      // Camera rig: same live camera settings contract as the loop mode.
      const player = round.cars[PLAYER_IDX]
      const cameraParams = cameraRigRef?.current ?? DEFAULT_CAMERA_RIG
      const nextFov = cameraParams.fov ?? DEFAULT_CAMERA_RIG.fov ?? 70
      if (nextFov !== lastAppliedFov) {
        camera.fov = nextFov
        camera.updateProjectionMatrix()
        lastAppliedFov = nextFov
      }
      updateCameraRig(
        cameraRig,
        player.physics.x,
        player.physics.z,
        player.physics.heading,
        cameraParams,
      )
      applyCameraRig(camera, cameraRig)

      // Forward HUD updates at most ~10 Hz to avoid React renders every frame.
      if (nowMs - lastHudPushMs > 100 || result.events.length > 0) {
        pushHudSnapshot()
        lastHudPushMs = nowMs
      }

      // Forward hit events as HUD popup spawns plus drive damage visuals.
      for (const e of result.events) {
        if (e.kind !== 'hit') continue
        if (e.victimIdx === PLAYER_IDX) {
          const p = projectToScreen(e.x, e.z)
          onHitRef.current({ amount: e.amount, screenX: p.sx, screenY: p.sy })
        }
        const visualizer = carVisualizers[e.victimIdx]
        if (!visualizer) continue
        const victim = round.cars[e.victimIdx]
        const nx = e.x - victim.physics.x
        const nz = e.z - victim.physics.z
        const len = Math.hypot(nx, nz)
        const inv = len > 1e-6 ? 1 / len : 0
        const detached = visualizer.applyHit(
          e.amount,
          nx * inv,
          nz * inv,
          victim.physics.heading,
          debrisRng,
        )
        if (detached) {
          scene.add(detached)
          debrisItems.push(
            spawnDebris(
              detached,
              detached.position,
              { nx: nx * inv, nz: nz * inv },
              4 + e.relativeSpeed * 0.2,
              debrisRng,
            ),
          )
        }
      }

      // Update damage visuals from current state.
      for (let i = 0; i < round.cars.length; i++) {
        carVisualizers[i]?.update(round.cars[i])
      }

      // Advance debris. Removing dead meshes inline avoids the per-frame
      // filter() allocation; pruneDebris compacts the array afterward.
      tickDebris(debrisItems, dtSec, arena.radius)
      for (let i = 0; i < debrisItems.length; i++) {
        if (!debrisItems[i].alive) scene.remove(debrisItems[i].object)
      }
      pruneDebris(debrisItems)

      if (round.status === 'ended' && !endedReported) {
        endedReported = true
        const summary: DerbyRoundSummary = {
          outcome: round.endOutcome ?? 'timeout',
          roundTimeMs: Math.round(round.elapsedMs),
          finalHealths: round.cars.map((c) => c.health),
          kills: round.cars[PLAYER_IDX].kills,
          scorePoints:
            round.cars[PLAYER_IDX].kills * 200 +
            Math.floor(round.cars[PLAYER_IDX].aliveMs / 10_000) * 100,
        }
        pushHudSnapshot()
        onRoundEndRef.current(summary.outcome, summary)
      }

      renderer.render(scene, camera)
    }
    rafId = requestAnimationFrame(step)

    function onResize() {
      if (!container) return
      renderer.setSize(container.clientWidth, container.clientHeight)
      camera.aspect = container.clientWidth / container.clientHeight
      camera.updateProjectionMatrix()
    }
    window.addEventListener('resize', onResize)
    window.visualViewport?.addEventListener('resize', onResize)

    return () => {
      stopped = true
      cancelAnimationFrame(rafId)
      window.removeEventListener('resize', onResize)
      window.visualViewport?.removeEventListener('resize', onResize)
      for (const v of carVisualizers) v?.dispose()
      for (const a of carAssets) a?.dispose()
      for (const d of debrisItems) scene.remove(d.object)
      stadium.dispose()
      scenery.dispose()
      arenaMesh.dispose()
      renderer.dispose()
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement)
      }
    }
  }, [arena, vehicleConfigs, keysRef, cameraRigRef])

  return <div ref={containerRef} style={canvasContainerStyle} />
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

// Approximate the visual wheel radius from a wheel mesh's bounding-box
// extent. Wheel cylinders authored in the GLB sit with their rolling axis
// along the model's X axis, so the height of the bounding box (Y extent)
// equals the wheel diameter; halving gives the radius. Cached on the
// asset via userData so we only measure once per car.
function measureWheelRadius(asset: DerbyVehicleAsset): number {
  const wheel = firstMeshOf(asset.submeshes.wheel_fl)
  if (!wheel) return 0.36
  wheel.geometry.computeBoundingBox()
  const box = wheel.geometry.boundingBox
  if (!box) return 0.36
  const yExtent = box.max.y - box.min.y
  const zExtent = box.max.z - box.min.z
  return Math.max(yExtent, zExtent) / 2
}

function pickEnemyColor(type: string): number {
  switch (type) {
    case 'schoolBus':
      return 0xf5c518
    case 'bigTruck':
      return 0xa0522d
    case 'racecar':
      return 0xe84a5f
    default:
      return 0x3ddc84
  }
}

function computePlace(round: DerbyRoundState): number {
  // Place is the player's rank if the round were to end this frame. Living
  // cars rank ahead of destroyed cars; among living, sort by health desc.
  const player = round.cars[0]
  if (isDestroyed(player)) {
    let aheadOfPlayer = 0
    for (const c of round.cars) {
      if (c.carIdx === 0) continue
      if (!isDestroyed(c)) aheadOfPlayer += 1
      else if (c.aliveMs > player.aliveMs) aheadOfPlayer += 1
    }
    return aheadOfPlayer + 1
  }
  let aheadOfPlayer = 0
  for (const c of round.cars) {
    if (c.carIdx === 0) continue
    if (!isDestroyed(c) && c.health > player.health) aheadOfPlayer += 1
  }
  return aheadOfPlayer + 1
}

const canvasContainerStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  background: '#000',
}
