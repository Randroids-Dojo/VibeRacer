'use client'

import { useEffect, useRef } from 'react'
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
// Vehicle visuals here are procedural box geometry (slice 7) so the
// integration is testable end to end before slice 8 swaps in real GLBs
// against the named-submesh contract.

export interface DerbyCanvasProps {
  arena: DerbyArenaConfig
  vehicleConfigs: DerbyVehicleConfig[]
  // Index 0 is the player; CPU brains are initialized for indices >= 1.
  // The same array order drives carIdx in the round.
  keysRef: { current: KeyInput }
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
  const { arena, vehicleConfigs, keysRef } = props
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
    renderer.shadowMap.enabled = false
    container.appendChild(renderer.domElement)

    const scene = new Scene()
    scene.background = new Color(0xb88c54)

    const ambient = new AmbientLight(0xffffff, 0.5)
    const sun = new DirectionalLight(0xffffff, 1.0)
    sun.position.set(40, 80, 30)
    scene.add(ambient)
    scene.add(sun)

    const camera = new PerspectiveCamera(
      55,
      container.clientWidth / container.clientHeight,
      0.5,
      400,
    )

    const arenaMesh: DerbyArenaMesh = buildArenaMesh(arena)
    scene.add(arenaMesh.group)

    const round: DerbyRoundState = initDerbyRound({
      arena,
      vehicleTypes: vehicleConfigs.map((v) => v.type),
    })

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
        // Heading 0 = +X, PI/2 = -Z. Rotate the group so its +Z axis aligns
        // with the heading direction. world rotation about Y matches
        // -(heading - PI/2) under the simulator's convention.
        asset.group.rotation.y = -car.physics.heading + Math.PI / 2
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

    function projectToScreen(x: number, z: number): { sx: number; sy: number } {
      const v = new Vector3(x, VEHICLE_BODY_HEIGHT, z).project(camera)
      const sx = (v.x * 0.5 + 0.5) * container!.clientWidth
      const sy = (1 - (v.y * 0.5 + 0.5)) * container!.clientHeight
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

      // Camera follows the player from above and behind.
      const player = round.cars[PLAYER_IDX]
      const camDist = 16
      const camHeight = 12
      const ch = player.physics.heading
      const cx = player.physics.x - Math.cos(ch) * camDist
      const cz = player.physics.z + Math.sin(ch) * camDist
      camera.position.set(cx, camHeight, cz)
      camera.lookAt(player.physics.x, 0, player.physics.z)

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

      // Advance debris.
      tickDebris(debrisItems, dtSec, arena.radius)
      const dead = debrisItems.filter((d) => !d.alive)
      for (const d of dead) scene.remove(d.object)
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

    return () => {
      stopped = true
      cancelAnimationFrame(rafId)
      window.removeEventListener('resize', onResize)
      for (const v of carVisualizers) v?.dispose()
      for (const a of carAssets) a?.dispose()
      for (const d of debrisItems) scene.remove(d.object)
      arenaMesh.dispose()
      renderer.dispose()
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement)
      }
    }
  }, [arena, vehicleConfigs, keysRef])

  return <div ref={containerRef} style={canvasContainerStyle} />
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
