'use client'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import Link from 'next/link'
import {
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  WebGLRenderer,
  type BufferGeometry,
  type Group,
  type Scene,
} from 'three'
import { interpolateGhostPose, type Replay } from '@/lib/replay'
import { useKeyboard } from '@/hooks/useKeyboard'
import { useControlSettings } from '@/hooks/useControlSettings'
import {
  applyCameraRig,
  buildGhostCar,
  buildGhostNameplate,
  buildScene,
  DEFAULT_CAMERA_RIG,
  initCameraRig,
  profiledTerrainSkirtGeometry,
  profiledTrackSurfaceGeometry,
  updateCameraRig,
  type CameraRigState,
  type SceneBundle,
} from '@/game/sceneBuilder'
import {
  nameplateOpacityForDistance,
  type GhostMeta,
} from '@/game/ghostNameplate'
import { buildTrackPath } from '@/game/trackPath'
import {
  DRAG_STRIPS,
  dragStripCheckpoints,
  dragStripPieces,
  dragStripVersionHash,
  type DragStripConfig,
  type DragStripSlug,
} from '@/lib/dragStrips'
import {
  DEFAULT_DRAG_LOADOUT,
  type DragLoadout,
} from '@/lib/dragParts'
import {
  readDragLoadout,
  writeDragLoadout,
} from '@/lib/dragLoadoutStorage'
import { deriveDragCarParams } from '@/game/dragTuning'
import {
  dragTick,
  handlePreCountdownInput,
  initDragGameState,
  startDragRace,
  type DragGameState,
  type DragLapCompleteEvent,
  type DragTickConfig,
} from '@/game/dragTick'
import {
  heightAt,
  projectArcLengthOnSpawnAxis,
  slopeAt,
} from '@/game/dragVerticalProfile'
import type { LeaderboardEntry } from '@/lib/leaderboard'
import { selectDragGhost } from '@/lib/dragGhost'
import { submitDragRun } from '@/lib/dragSubmit'
import { DragGarage } from './DragGarage'
import { DragHUD } from './DragHUD'
import { DragSessionSummary } from './DragSessionSummary'
import { Speedometer } from './Speedometer'
import {
  DRAG_COUNTDOWN_TOTAL_MS,
  DragChristmasTree,
} from './DragChristmasTree'
import { TouchControls } from './TouchControls'
import { getTrackBiomePreset } from '@/lib/biomes'

type Phase = 'garage' | 'staging' | 'countdown' | 'racing' | 'finished'

interface DragRaceProps {
  slug: DragStripSlug
}

// World-units half-width of the terrain skirt extruded sideways from the
// road. Tuned to frame the strip without overlapping the biome ground
// plane that buildScene already places under the scene.
const SKIRT_HALF_WIDTH = 24

// Drag mode reuses the closed-loop camera rig from sceneBuilder so the
// framing matches the rest of the game. The rig handles position /
// quaternion lerp internally; we only feed the car's pose each frame.

const raceHeaderStyle: React.CSSProperties = {
  position: 'absolute',
  top: 12,
  left: 12,
  padding: '6px 12px',
  background: '#161616cc',
  border: '1px solid #2a2a2a',
  borderRadius: 8,
  fontSize: 13,
  pointerEvents: 'auto',
  display: 'flex',
  gap: 12,
  alignItems: 'center',
  fontFamily: 'system-ui, sans-serif',
  color: '#fff',
  boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
}
const raceHeaderBackStyle: React.CSSProperties = {
  color: '#ff6b35',
  textDecoration: 'none',
  fontWeight: 700,
  letterSpacing: 0.5,
}
const raceHeaderTagsStyle: React.CSSProperties = {
  fontSize: 11,
  opacity: 0.7,
  textTransform: 'capitalize',
  letterSpacing: 0.5,
}

export function DragRace({ slug }: DragRaceProps) {
  const strip: DragStripConfig = DRAG_STRIPS[slug]
  const versionHash = useMemo(() => dragStripVersionHash(strip), [strip])

  const path = useMemo(
    () => buildTrackPath(dragStripPieces(strip), undefined, dragStripCheckpoints(strip)),
    [strip],
  )

  const [phase, setPhase] = useState<Phase>('garage')
  const [loadout, setLoadout] = useState<DragLoadout>(DEFAULT_DRAG_LOADOUT)
  const [hydratedLoadout, setHydratedLoadout] = useState(false)
  const [hud, setHud] = useState<{
    elapsedMs: number
    speed: number
    fouled: boolean
    reactionTimeMs: number | null
    splits: number[]
    topSpeed: number
  }>({ elapsedMs: 0, speed: 0, fouled: false, reactionTimeMs: null, splits: [], topSpeed: 0 })
  const [finishEvent, setFinishEvent] =
    useState<DragLapCompleteEvent | null>(null)
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  // Captured once when startCountdown fires so a parent re-render during the
  // countdown phase does not reset the elapsed lamp animation. Cleared back
  // to null when we leave countdown.
  const [countdownStartedAt, setCountdownStartedAt] = useState<number | null>(
    null,
  )
  // Mirrors stateRef.current.fouled into React state at low frequency so the
  // CountdownTree overlay can show "JUMP-START" the moment a pre-GO throttle
  // press flips the foul flag. The rAF loop owns the canonical value; this
  // state just lets the overlay react to it.
  const [countdownFouled, setCountdownFouled] = useState(false)

  // Hydrate loadout from storage on mount.
  useEffect(() => {
    setLoadout(readDragLoadout(slug))
    setHydratedLoadout(true)
  }, [slug])

  // Single fetch path the mount effect and the post-submit handler both
  // call. Best-effort: a network error or a malformed response returns
  // null so the leaderboard pane keeps showing the last successful list.
  const refreshLeaderboard = useCallback(async (): Promise<
    LeaderboardEntry[] | null
  > => {
    try {
      const res = await fetch(
        `/api/leaderboard?slug=${encodeURIComponent(slug)}&v=${versionHash}&limit=25`,
      )
      if (!res.ok) return null
      const data = (await res.json()) as { entries?: LeaderboardEntry[] }
      return Array.isArray(data.entries) ? data.entries : null
    } catch {
      return null
    }
  }, [slug, versionHash])

  // Initial leaderboard load on mount and whenever the strip changes.
  // Post-finish refresh is owned by the submit handler below, which calls
  // refreshLeaderboard directly the moment the lap is stored. Keeping
  // finishEvent out of this dep array avoids a duplicate fetch.
  useEffect(() => {
    let cancelled = false
    void refreshLeaderboard().then((entries) => {
      if (!cancelled && entries !== null) setLeaderboard(entries)
    })
    return () => {
      cancelled = true
    }
  }, [refreshLeaderboard])

  // Derived params recomputed when the loadout changes; the rAF loop reads
  // from a ref so we never restart the renderer on a part swap.
  const derived = useMemo(
    () => deriveDragCarParams(loadout, strip),
    [loadout, strip],
  )

  const stateRef = useRef<DragGameState>(initDragGameState(path))
  const phaseRef = useRef<Phase>(phase)
  const configRef = useRef<DragTickConfig>({
    totalWeight: derived.derivation.totalWeight,
    launch: derived.launch,
    verticalProfile: strip.verticalProfile,
  })
  const paramsRef = useRef(derived.params)
  const goAtMsRef = useRef<number | null>(null)
  const finishedRef = useRef(false)

  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  // While the countdown overlay is up, mirror stateRef.current.fouled into
  // React state at 50ms cadence so the JUMP-START label appears within a
  // frame or two of the foul instead of waiting for the racing phase. The
  // rAF loop owns the actual flag; we just sample it here.
  useEffect(() => {
    if (phase !== 'countdown') return undefined
    const id = window.setInterval(() => {
      if (stateRef.current.fouled !== countdownFouled) {
        setCountdownFouled(stateRef.current.fouled)
      }
    }, 50)
    return () => window.clearInterval(id)
  }, [phase, countdownFouled])

  useEffect(() => {
    paramsRef.current = derived.params
    maxSpeedRef.current = derived.params.maxSpeed
    configRef.current = {
      totalWeight: derived.derivation.totalWeight,
      launch: derived.launch,
      verticalProfile: strip.verticalProfile,
    }
  }, [derived, strip])

  const keys = useKeyboard()
  // Touch / control settings drive the optional virtual joystick overlay
  // for mobile play. Drag mode mirrors the closed-loop game's behavior
  // so a player on touch sees the same joystick they use everywhere
  // else, just without manual shift since drag has no gear UI.
  const { settings: controlSettings } = useControlSettings()

  // Renderer / scene refs
  const containerRef = useRef<HTMLDivElement | null>(null)
  const rendererRef = useRef<WebGLRenderer | null>(null)
  const sceneBundleRef = useRef<SceneBundle | null>(null)
  const cameraRef = useRef<PerspectiveCamera | null>(null)
  const carGroupRef = useRef<Group | null>(null)
  const sceneRef = useRef<Scene | null>(null)
  // Camera rig state. Persists between frames so the position / quaternion
  // lerp inside updateCameraRig has somewhere to write smoothed values.
  // Initialized in the same effect that builds the scene so the first
  // frame already has a valid pose and the camera does not snap on start.
  const cameraRigRef = useRef<CameraRigState | null>(null)
  // Ghost replay state. The active replay drives a translucent cyan clone
  // of the player car (built via `buildGhostCar`) that follows the
  // leaderboard's chosen rival (top, next-faster, or own PB, selected by
  // `selectDragGhost`). Read on every frame; null hides the ghost car.
  const ghostReplayRef = useRef<Replay | null>(null)
  const ghostCarRef = useRef<Group | null>(null)
  // Floating "WHO + TIME" plate above the ghost car. Built once per scene
  // and re-applied whenever the active ghost meta changes; the rAF loop
  // hides / fades it based on distance to the player.
  const ghostNameplateRef = useRef<ReturnType<
    typeof buildGhostNameplate
  > | null>(null)
  const ghostMetaRef = useRef<GhostMeta | null>(null)

  // Live speed values surfaced to the bottom-center Speedometer overlay.
  // The overlay drives its own rAF loop, so writing into refs lets the
  // gauge needle and peak marker update at 60 Hz without re-rendering the
  // rest of the React tree.
  const speedRef = useRef<number>(0)
  const maxSpeedRef = useRef<number>(derived.params.maxSpeed)
  const topSpeedRef = useRef<number>(0)

  // Set up Three.js renderer + scene exactly once for the strip lifetime.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return undefined

    const bundle = buildScene(path, { biome: strip.biome })
    bundle.setTimeOfDay(strip.timeOfDay)
    bundle.setWeather(strip.weather)
    sceneBundleRef.current = bundle
    sceneRef.current = bundle.scene
    cameraRef.current = bundle.camera
    carGroupRef.current = bundle.car

    // Swap the flat road for a profile-baked ribbon and lay a matching
    // terrain skirt under it so the strip has visible hills instead of a
    // floating noodle on a flat plane. Both meshes are owned by the bundle
    // (skirt added to bundle.scene; new road geometry replaces the existing
    // mesh's geometry so material, position, and lifecycle stay shared).
    const profile = strip.verticalProfile
    // Visual back-extension behind the spawn so the chase camera (positioned
    // ~12u behind the car) does not see the surrounding ground plane in front
    // of the start of the strip. Pure cosmetics; physics and arc length are
    // unaffected because they project from the spawn position.
    const ROAD_BACK_EXTENSION = 30
    const oldRoadGeom = bundle.trackMesh.geometry as BufferGeometry
    const profiledRoadGeom = profiledTrackSurfaceGeometry(
      path,
      profile,
      ROAD_BACK_EXTENSION,
    )
    bundle.trackMesh.geometry = profiledRoadGeom
    oldRoadGeom.dispose()

    const skirtGeom = profiledTerrainSkirtGeometry(
      path,
      profile,
      SKIRT_HALF_WIDTH,
      ROAD_BACK_EXTENSION,
    )
    // Skirt color follows the strip's biome so an Alpine snow strip does
    // not bleed olive grass under its road and a Harbor city strip does
    // not look like a grassy field. The biome's `groundColor` is the same
    // hex the surrounding terrain plane already uses, which keeps the
    // seam visually quiet.
    const skirtMat = new MeshStandardMaterial({
      color: getTrackBiomePreset(strip.biome).groundColor,
      roughness: 1,
    })
    const skirtMesh = new Mesh(skirtGeom, skirtMat)
    bundle.scene.add(skirtMesh)
    const disposeSkirt = () => {
      bundle.scene.remove(skirtMesh)
      skirtGeom.dispose()
      skirtMat.dispose()
    }

    // Ghost car. The closed-loop game's `buildGhostCar` clones the same
    // GLB the player drives and tints every material translucent cyan, so
    // the ghost reads as "another car" rather than a generic prop. Hidden
    // by default; the rAF loop flips visibility on when a replay is loaded
    // and the race has started. Nameplate is parented to the ghost group
    // so it inherits world position each frame.
    const ghostBuild = buildGhostCar()
    const ghostCar = ghostBuild.ghost
    ghostCar.visible = false
    bundle.scene.add(ghostCar)
    ghostCarRef.current = ghostCar

    const ghostNameplate = buildGhostNameplate()
    ghostCar.add(ghostNameplate.group)
    ghostNameplateRef.current = ghostNameplate
    let lastNameplateKey: string | null = null
    let lastNameplateVisible = false
    const disposeGhost = () => {
      ghostCar.remove(ghostNameplate.group)
      ghostNameplate.dispose()
      bundle.scene.remove(ghostCar)
      ghostBuild.dispose()
      ghostCarRef.current = null
      ghostNameplateRef.current = null
    }

    const renderer = new WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(container.clientWidth, container.clientHeight)
    container.appendChild(renderer.domElement)
    rendererRef.current = renderer

    function onResize() {
      if (!container) return
      const w = container.clientWidth
      const h = container.clientHeight
      renderer.setSize(w, h)
      if (cameraRef.current) {
        cameraRef.current.aspect = w / Math.max(1, h)
        cameraRef.current.updateProjectionMatrix()
      }
    }
    window.addEventListener('resize', onResize)
    onResize()

    // Position the car at the spawn.
    const spawn = path.spawn
    bundle.car.position.set(spawn.position.x, 0, spawn.position.z)
    bundle.car.rotation.y = spawn.heading

    // Seed the camera rig at the spawn so the first frame is already
    // composed instead of snapping into place on tick 1.
    cameraRigRef.current = initCameraRig(
      spawn.position.x,
      spawn.position.z,
      spawn.heading,
      DEFAULT_CAMERA_RIG,
    )
    applyCameraRig(bundle.camera, cameraRigRef.current)

    let raf = 0
    let lastNow = performance.now()
    const tickLoop = (now: number) => {
      const dtMs = Math.max(0, Math.min(50, now - lastNow))
      lastNow = now

      const k = keys.current
      const throttle = k.axes ? k.axes.throttle : k.forward ? 1 : k.backward ? -1 : 0
      const steer = k.axes ? k.axes.steer : (k.right ? 1 : 0) - (k.left ? 1 : 0)
      const input = { throttle, steer, handbrake: k.handbrake }

      let state = stateRef.current
      const ph = phaseRef.current

      if (ph === 'countdown') {
        state = handlePreCountdownInput(state, input, configRef.current)
      } else if (ph === 'racing' && goAtMsRef.current !== null) {
        const result = dragTick(
          state,
          input,
          dtMs,
          performance.now(),
          path,
          paramsRef.current,
          configRef.current,
        )
        state = result.state
        if (result.finished && !finishedRef.current) {
          finishedRef.current = true
          setFinishEvent(result.finished)
          setPhase('finished')
        }
      }

      stateRef.current = state

      // Sync car group position / rotation. Apply hill height + pitch.
      const car = carGroupRef.current
      if (car) {
        const arcLength =
          ph === 'racing' || ph === 'finished'
            ? state.arcLengthS
            : projectArcLengthOnSpawnAxis(
                { x: state.x, z: state.z },
                { position: spawn.position, heading: spawn.heading },
              )
        const y = heightAt(strip.verticalProfile, arcLength)
        const pitch = slopeAt(strip.verticalProfile, arcLength)
        car.position.set(state.x, y, state.z)
        car.rotation.set(-pitch, state.heading, 0)
      }

      // Ghost car follow. During the racing phase the rival's replay is
      // sampled by elapsed-since-GO and the ghost is placed on the strip;
      // y is taken from the strip's profile so it follows the same hills
      // the player drives over. Visibility extends through the 'finished'
      // phase so the rival freezes at its finish-line pose
      // (interpolateGhostPose clamps past maxT) instead of vanishing the
      // moment the player crosses the line. Hidden in garage/staging so
      // the pre-race overlays never show a stale ghost.
      const ghostNode = ghostCarRef.current
      const ghostPlate = ghostNameplateRef.current
      const ghostReplay = ghostReplayRef.current
      const ghostActive =
        (ph === 'racing' || ph === 'finished') &&
        ghostReplay !== null &&
        state.raceStartMs !== null
      let ghostVisibleThisFrame = false
      let ghostDistanceToPlayer = Number.POSITIVE_INFINITY
      if (ghostNode) {
        if (ghostActive && ghostReplay && state.raceStartMs !== null) {
          const ghostT = Math.max(0, performance.now() - state.raceStartMs)
          const pose = interpolateGhostPose(ghostReplay, ghostT)
          if (pose) {
            const ghostArc = projectArcLengthOnSpawnAxis(
              { x: pose.x, z: pose.z },
              { position: spawn.position, heading: spawn.heading },
            )
            const gy = heightAt(strip.verticalProfile, ghostArc)
            const gpitch = slopeAt(strip.verticalProfile, ghostArc)
            ghostNode.position.set(pose.x, gy, pose.z)
            ghostNode.rotation.set(-gpitch, pose.heading, 0)
            ghostNode.visible = true
            ghostVisibleThisFrame = true
            ghostDistanceToPlayer = Math.hypot(
              pose.x - state.x,
              pose.z - state.z,
            )
          } else {
            ghostNode.visible = false
          }
        } else {
          ghostNode.visible = false
        }
      }

      // Nameplate. Hidden whenever the ghost itself is hidden, and faded
      // out when the ghost is close to the player so it cannot cover the
      // player's car in chase cameras. Re-applies the texture only when
      // the meta tuple changes so steady-state frames are a single string
      // compare.
      if (ghostPlate) {
        const opacity = nameplateOpacityForDistance(ghostDistanceToPlayer)
        const meta = ghostMetaRef.current
        const wantPlate =
          ghostVisibleThisFrame && meta !== null && opacity > 0
        if (wantPlate && meta) {
          const key = `top|${meta.initials}|${meta.lapTimeMs}`
          if (key !== lastNameplateKey || !lastNameplateVisible) {
            ghostPlate.apply(meta, 'top')
            lastNameplateKey = key
            lastNameplateVisible = true
          }
          ghostPlate.setOpacity(opacity)
        } else if (lastNameplateVisible) {
          ghostPlate.setVisible(false)
          lastNameplateVisible = false
          lastNameplateKey = null
        }
      }

      // Camera follow uses the closed-loop rig from sceneBuilder so the
      // framing matches the rest of the game (height 6, distance 14,
      // lookAhead 6, fov 70 by default). The rig lerps position and
      // orientation internally so the camera eases to the target rather
      // than snapping every frame.
      if (cameraRef.current && car && cameraRigRef.current) {
        updateCameraRig(
          cameraRigRef.current,
          car.position.x,
          car.position.z,
          state.heading,
          DEFAULT_CAMERA_RIG,
        )
        applyCameraRig(cameraRef.current, cameraRigRef.current)
      }

      // Live speed refs for the Speedometer overlay. Always updated so the
      // gauge needle drops to zero between phases instead of freezing on
      // the last racing frame. The peak ref is reset alongside the game
      // state in startCountdown so a fresh attempt starts the marker clean.
      speedRef.current = state.speed
      if (state.topSpeed > topSpeedRef.current) {
        topSpeedRef.current = state.topSpeed
      }

      // HUD update at frame rate.
      if (ph === 'racing' && goAtMsRef.current !== null) {
        const elapsed = performance.now() - goAtMsRef.current
        setHud({
          elapsedMs: Math.max(0, Math.round(elapsed)),
          speed: Math.abs(state.speed),
          fouled: state.fouled,
          reactionTimeMs: state.reactionTimeMs,
          splits: state.hits.map((h) => h.tMs),
          topSpeed: state.topSpeed,
        })
      } else if (ph === 'finished' && finishEvent) {
        setHud((h) => ({
          ...h,
          elapsedMs: finishEvent.finishTimeMs,
          fouled: finishEvent.fouled,
          reactionTimeMs: finishEvent.reactionTimeMs,
          splits: finishEvent.hits.map((cp) => cp.tMs),
          topSpeed: finishEvent.topSpeed,
        }))
      }

      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current)
      }

      raf = requestAnimationFrame(tickLoop)
    }
    raf = requestAnimationFrame(tickLoop)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement)
      }
      disposeSkirt()
      disposeGhost()
      bundle.dispose()
      renderer.dispose()
      rendererRef.current = null
      sceneBundleRef.current = null
      cameraRef.current = null
      carGroupRef.current = null
      sceneRef.current = null
    }
    // path/strip/keys are stable for the strip lifetime; rebuilding a strip
    // change happens at the route level by remounting this component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, strip])

  // Run the countdown lights, then start the race.
  const startCountdown = useCallback(() => {
    setPhase('countdown')
    finishedRef.current = false
    setFinishEvent(null)
    // Reset the game state to spawn.
    const fresh = initDragGameState(path)
    stateRef.current = fresh
    goAtMsRef.current = null
    speedRef.current = 0
    topSpeedRef.current = 0
    setCountdownStartedAt(performance.now())
    setCountdownFouled(false)
    setHud({
      elapsedMs: 0,
      speed: 0,
      fouled: false,
      reactionTimeMs: null,
      splits: [],
      topSpeed: 0,
    })
    // Three "ready/set/go" beats at 800ms each. After GO we transition to
    // 'racing' and seed the race start time. Foul detection runs across the
    // whole window via the rAF loop.
    // Pinned to DRAG_COUNTDOWN_TOTAL_MS so the green lamp in the
    // christmas tree component lights at the same moment we flip phase
    // to 'racing'. A drift between the two would let a fast reaction at
    // green still register as a foul.
    setTimeout(() => {
      const now = performance.now()
      goAtMsRef.current = now
      stateRef.current = startDragRace(stateRef.current, now)
      setPhase('racing')
    }, DRAG_COUNTDOWN_TOTAL_MS)
  }, [path])

  const onChooseLoadout = useCallback(
    (next: DragLoadout) => {
      setLoadout(next)
      writeDragLoadout(slug, next)
    },
    [slug],
  )

  const onConfirmLoadout = useCallback(() => {
    setPhase('staging')
    // Auto-roll into the countdown after a brief stage moment.
    window.setTimeout(() => startCountdown(), 350)
  }, [startCountdown])

  const onRaceAgain = useCallback(() => {
    startCountdown()
  }, [startCountdown])

  const onChangeParts = useCallback(() => {
    setPhase('garage')
  }, [])

  // Submit the lap to the leaderboard once we have a finish event.
  // The submission flow follows /api/race/start to mint a token, then POSTs
  // to /api/race/submit. Best-effort: failure does not block the UI.
  const submittedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!finishEvent) return
    const key = `${slug}:${finishEvent.finishTimeMs}:${finishEvent.hits.length}`
    if (submittedRef.current === key) return
    submittedRef.current = key
    void submitDragRun({
      slug,
      versionHash,
      finishEvent,
      loadout,
    })
      .then(async () => {
        const entries = await refreshLeaderboard()
        if (entries !== null) setLeaderboard(entries)
      })
      .catch(() => {
        // ignore; user can retry by racing again.
      })
  }, [finishEvent, slug, versionHash, loadout, refreshLeaderboard])

  // Pick the player's PB for this strip from the leaderboard (server marks
  // with isMe). selectDragGhost handles the rotation rules.
  const playerPbMs = useMemo(() => {
    const mine = leaderboard.filter((e) => e.isMe)
    if (mine.length === 0) return null
    return mine.reduce((best, e) => Math.min(best, e.lapTimeMs), Number.POSITIVE_INFINITY) || null
  }, [leaderboard])
  const ghost = useMemo(
    () => selectDragGhost(leaderboard, playerPbMs),
    [leaderboard, playerPbMs],
  )

  // Push the active ghost's "WHO + TIME" tuple into a ref so the rAF loop
  // can drive the floating nameplate without re-rendering. The matching
  // entry is the leaderboard row whose nonce matches the active ghost.
  // null hides the plate (e.g. when the leaderboard is empty or the
  // selected entry has no nonce).
  useEffect(() => {
    if (!ghost.nonce) {
      ghostMetaRef.current = null
      return
    }
    const entry = leaderboard.find((e) => e.nonce === ghost.nonce)
    if (!entry) {
      ghostMetaRef.current = null
      return
    }
    ghostMetaRef.current = {
      initials: entry.initials,
      lapTimeMs: entry.lapTimeMs,
    }
  }, [ghost.nonce, leaderboard])

  // Load the ghost's replay whenever the selected nonce changes. Best
  // effort: a 404 (legacy entry without a stored replay) just leaves
  // ghostReplayRef null so the rAF loop hides the ghost mesh.
  useEffect(() => {
    if (!ghost.nonce) {
      ghostReplayRef.current = null
      return undefined
    }
    let cancelled = false
    void fetch(
      `/api/replay/byNonce?slug=${encodeURIComponent(slug)}&v=${versionHash}&nonce=${ghost.nonce}`,
    )
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return
        if (!data || typeof data !== 'object') {
          ghostReplayRef.current = null
          return
        }
        // Trust the API: it already validated through ReplaySchema before
        // returning. Storing the raw object keeps the per-frame lookup a
        // simple array index without re-parsing.
        ghostReplayRef.current = data as Replay
      })
      .catch(() => {
        if (!cancelled) ghostReplayRef.current = null
      })
    return () => {
      cancelled = true
    }
  }, [ghost.nonce, slug, versionHash])

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', color: '#fff' }}>
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />

      {/* Strip name + back chip. Matches the project's HUD chip look:
          panel background, rounded, subtle border, accent-color back link. */}
      <div style={raceHeaderStyle}>
        <Link href="/drag" style={raceHeaderBackStyle}>
          ‹ back
        </Link>
        <strong style={{ letterSpacing: 0.5 }}>{strip.displayName}</strong>
        <span style={raceHeaderTagsStyle}>
          {strip.biome} · {strip.weather}
        </span>
      </div>

      {phase === 'garage' && hydratedLoadout && (
        <DragGarage
          strip={strip}
          loadout={loadout}
          derivation={derived.derivation}
          onChange={onChooseLoadout}
          onConfirm={onConfirmLoadout}
        />
      )}

      {phase === 'staging' && (
        <CenterMessage title="STAGE" body="Pull up to the line." />
      )}

      {phase === 'countdown' && countdownStartedAt !== null && (
        <DragChristmasTree
          startedAt={countdownStartedAt}
          fouled={countdownFouled}
        />
      )}

      {phase === 'racing' && (
        <DragHUD
          elapsedMs={hud.elapsedMs}
          fouled={hud.fouled}
          reactionTimeMs={hud.reactionTimeMs}
          splits={hud.splits}
        />
      )}

      {(phase === 'racing' || phase === 'finished') &&
        controlSettings.showSpeedometer && (
          <Speedometer
            speedRef={speedRef}
            maxSpeedRef={maxSpeedRef}
            unit={controlSettings.speedUnit}
            topSpeedRef={topSpeedRef}
            showTopSpeedMarker={controlSettings.showTopSpeedMarker}
          />
        )}

      {phase === 'finished' && finishEvent && (
        <DragSessionSummary
          strip={strip}
          finishEvent={finishEvent}
          leaderboard={leaderboard}
          ghostSource={ghost.source}
          ghostNonce={ghost.nonce}
          onRaceAgain={onRaceAgain}
          onChangeParts={onChangeParts}
        />
      )}

      <TouchControls
        keys={keys}
        enabled={phase === 'racing' || phase === 'countdown'}
        mode={controlSettings.touchMode}
      />
    </div>
  )
}

function CenterMessage({ title, body }: { title: string; body: string }) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 8,
        pointerEvents: 'none',
      }}
    >
      <div style={{ fontSize: 64, fontWeight: 700, letterSpacing: 2 }}>{title}</div>
      <div style={{ opacity: 0.85 }}>{body}</div>
    </div>
  )
}
