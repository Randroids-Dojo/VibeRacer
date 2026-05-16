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
import {
  MAX_REPLAY_SAMPLES,
  REPLAY_SAMPLE_MS,
  type Replay,
} from '@/lib/replay'
import { useKeyboard } from '@/hooks/useKeyboard'
import { useControlSettings } from '@/hooks/useControlSettings'
import {
  applyCameraRig,
  buildDragGhostCar,
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
import { type GhostMeta } from '@/game/ghostNameplate'
import {
  applyGhostPresentation,
  initGhostPresentation,
} from '@/game/ghostPresentation'
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
import { readPlayerInput } from '@/game/playerInput'
import {
  dragGearSpec,
  dragTick,
  DRAG_MANUAL_GEAR_MAX,
  DRAG_REDLINE_RATIO,
  SHIFT_LATE_HOLD_SEC,
  handlePreCountdownInput,
  initDragGameState,
  startDragRace,
  type DragGameState,
  type DragLapCompleteEvent,
  type DragShiftQuality,
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
import type { NameplateSource } from '@/game/ghostNameplate'
import {
  DEFAULT_RACING_NUMBER,
  type RacingNumberSetting,
} from '@/lib/racingNumber'
import { DragGarage } from './DragGarage'
import { DragHUD } from './DragHUD'
import { DragSessionSummary } from './DragSessionSummary'
import { DragShiftFlash } from './DragShiftFlash'
import { DragRedlineTint } from './DragRedlineTint'
import { DragSpeedometer } from './DragSpeedometer'
import {
  DRAG_COUNTDOWN_TOTAL_MS,
  DragChristmasTree,
} from './DragChristmasTree'
import { TouchControls } from './TouchControls'
import { getTrackBiomePreset } from '@/lib/biomes'
import { MOBILE_GAME_SURFACE_STYLES } from '@/lib/mobileGameSurface'

type Phase = 'garage' | 'staging' | 'countdown' | 'racing' | 'finished'

interface DragRaceProps {
  slug: DragStripSlug
}

// World-units half-width of the terrain skirt extruded sideways from the
// road. Tuned to frame the strip without overlapping the biome ground
// plane that buildScene already places under the scene.
const SKIRT_HALF_WIDTH = 24

// Lateral lane offset from the strip centerline. The player spawns this far
// to the driver's right; the ghost is rendered this far to the driver's
// left, so the two appear side by side on the strip. Track width is 8m, so
// 2m puts each car halfway between the centerline and the kerb.
const LANE_OFFSET_M = 2

// Right-perpendicular vector to the forward (cos h, -sin h) basis at
// `heading`. Multiplying by a signed magnitude gives a world-frame lateral
// offset relative to the spawn axis: positive = driver's right, negative =
// driver's left.
function lateralOffset(
  heading: number,
  signedMagnitude: number,
): { x: number; z: number } {
  return {
    x: Math.sin(heading) * signedMagnitude,
    z: Math.cos(heading) * signedMagnitude,
  }
}

// Move a freshly initialized drag state so the player car spawns offset
// from the strip centerline. Arc-length progression is unaffected because
// `projectArcLengthOnSpawnAxis` projects onto the heading direction, which
// is orthogonal to this offset.
function spawnAtLane(
  state: DragGameState,
  spawn: { position: { x: number; z: number }; heading: number },
  signedOffset: number,
): DragGameState {
  const off = lateralOffset(spawn.heading, signedOffset)
  return { ...state, x: state.x + off.x, z: state.z + off.z }
}

// Drag mode reuses the closed-loop camera rig from sceneBuilder so the
// framing matches the rest of the game. The rig handles position /
// quaternion lerp internally; we only feed the car's pose each frame.

const dragRootStyle: React.CSSProperties = {
  ...MOBILE_GAME_SURFACE_STYLES,
  background: '#000',
  color: '#fff',
}

// Top-left strip chip. Kept compact (12px font, 4/8 padding) so it does
// not crowd the centered hero timer below it. Max-width caps it short of
// half the screen so very-long strip names truncate rather than push into
// the timer band on narrow phones.
const raceHeaderStyle: React.CSSProperties = {
  position: 'absolute',
  top: 12,
  left: 12,
  padding: '4px 10px',
  background: '#161616cc',
  border: '1px solid #2a2a2a',
  borderRadius: 8,
  fontSize: 12,
  pointerEvents: 'auto',
  display: 'flex',
  gap: 8,
  alignItems: 'center',
  fontFamily: 'system-ui, sans-serif',
  color: '#fff',
  boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
  maxWidth: 'calc(50vw - 24px)',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
}
const raceHeaderBackStyle: React.CSSProperties = {
  color: '#ff6b35',
  textDecoration: 'none',
  fontWeight: 700,
  letterSpacing: 0.5,
  flexShrink: 0,
}
const raceHeaderTitleStyle: React.CSSProperties = {
  letterSpacing: 0.5,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}
const raceHeaderTagsStyle: React.CSSProperties = {
  fontSize: 10,
  opacity: 0.7,
  textTransform: 'capitalize',
  letterSpacing: 0.5,
  flexShrink: 0,
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
    gear: number
  }>({
    elapsedMs: 0,
    speed: 0,
    fouled: false,
    reactionTimeMs: null,
    splits: [],
    topSpeed: 0,
    gear: 1,
  })
  const [finishEvent, setFinishEvent] =
    useState<DragLapCompleteEvent | null>(null)
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  // Transient EARLY / PERFECT / LATE chip seeded from the rAF loop. The
  // `triggeredAt` timestamp is included in the key so two same-quality
  // upshifts in a row each restart the CSS animation. Cleared back to null
  // after the animation duration so a stale chip never lingers across a
  // restart.
  const [shiftFlash, setShiftFlash] = useState<{
    quality: DragShiftQuality
    triggeredAt: number
  } | null>(null)
  const shiftFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
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

  const stateRef = useRef<DragGameState>(
    spawnAtLane(initDragGameState(path), path.spawn, LANE_OFFSET_M),
  )
  const phaseRef = useRef<Phase>(phase)
  const configRef = useRef<DragTickConfig>({
    totalWeight: derived.derivation.totalWeight,
    launch: derived.launch,
    verticalProfile: strip.verticalProfile,
  })
  const paramsRef = useRef(derived.params)
  const goAtMsRef = useRef<number | null>(null)
  const finishedRef = useRef(false)
  // Tracks whether shiftDown / shiftUp were already pressed on the previous
  // tick so the rAF loop can emit a single shift on the press edge instead
  // of cycling gears every frame the key is held.
  const shiftLatchedRef = useRef<{ down: boolean; up: boolean }>({
    down: false,
    up: false,
  })
  // Redline-bleed intensity in [0, 1] driven by the rAF loop. The
  // DragRedlineTint overlay owns its own animation loop and reads this
  // ref each frame; using a ref instead of React state keeps the 60 Hz
  // pulse from re-rendering the rest of the HUD tree.
  const redlineIntensityRef = useRef<number>(0)

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
  // Mirror of `controlSettings` so the scene-build effect (which runs
  // exactly once per slug) can read the latest paint / racing-number
  // without listing the whole settings object in its dep array. A
  // separate effect below re-applies the values when the user updates
  // them in Settings.
  const controlSettingsRef = useRef(controlSettings)
  controlSettingsRef.current = controlSettings

  // Live-apply the player's livery when the Settings panel changes paint
  // or racing-number. The scene-build effect seeds them on mount; this
  // effect keeps them in sync without rebuilding the renderer.
  useEffect(() => {
    const bundle = sceneBundleRef.current
    if (!bundle) return
    bundle.setCarPaint(controlSettings.carPaint)
    bundle.setRacingNumber(controlSettings.racingNumber)
  }, [controlSettings.carPaint, controlSettings.racingNumber])

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
  const ghostSourceRef = useRef<NameplateSource>('top')
  // Ghost car visual setters. The replay loader pulls paint + racing
  // number off the matching leaderboard entry's loadout and applies them
  // here so the ghost wears the same livery the original racer had.
  // Refs (not state) so a rAF tick never goes stale between renders.
  const ghostSetPaintRef = useRef<((hex: string | null) => void) | null>(null)
  const ghostSetRacingNumberRef = useRef<
    ((setting: RacingNumberSetting) => void) | null
  >(null)

  // Replay recorder. The rAF loop pushes [x, z, heading] triples at
  // REPLAY_SAMPLE_MS cadence from raceStartMs so a finished run can be
  // stored as a ghost for the next racer to chase. The buffer is reset on
  // every startCountdown and the completed Replay is parked in
  // `recordedReplayRef` so the submit effect can read it after the
  // 'finished' phase fires.
  const recordingBufferRef = useRef<number[]>([])
  const nextSampleAtRef = useRef<number>(0)
  const recordedReplayRef = useRef<Replay | null>(null)

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
    // Apply the player's chosen livery so the drag car matches what they
    // race with in closed-loop mode. A separate effect re-applies on
    // settings changes so the Settings panel reflects live.
    bundle.setCarPaint(controlSettingsRef.current.carPaint)
    bundle.setRacingNumber(controlSettingsRef.current.racingNumber)
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

    // Drag ghost. Uses `buildDragGhostCar` (not the cyan-translucent
    // closed-loop `buildGhostCar`) so the rAF loop can dress the ghost in
    // the original racer's paint + racing-number plate from the
    // leaderboard entry's stored loadout. Hidden by default; the rAF
    // loop flips visibility on when a replay is loaded and the race has
    // started. Nameplate is parented to the ghost group so it inherits
    // world position each frame.
    const ghostBuild = buildDragGhostCar()
    const ghostCar = ghostBuild.ghost
    ghostCar.visible = false
    bundle.scene.add(ghostCar)
    ghostCarRef.current = ghostCar
    ghostSetPaintRef.current = ghostBuild.setPaint
    ghostSetRacingNumberRef.current = ghostBuild.setRacingNumber

    const ghostNameplate = buildGhostNameplate()
    ghostCar.add(ghostNameplate.group)
    ghostNameplateRef.current = ghostNameplate
    const ghostPresentationState = initGhostPresentation()
    const disposeGhost = () => {
      ghostCar.remove(ghostNameplate.group)
      ghostNameplate.dispose()
      bundle.scene.remove(ghostCar)
      ghostBuild.dispose()
      ghostCarRef.current = null
      ghostNameplateRef.current = null
      ghostSetPaintRef.current = null
      ghostSetRacingNumberRef.current = null
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

    // Position the car at the spawn, offset into the right lane so the
    // ghost (which we pin to the left lane each frame) can race alongside.
    const spawn = path.spawn
    const playerOff = lateralOffset(spawn.heading, LANE_OFFSET_M)
    const playerSpawnX = spawn.position.x + playerOff.x
    const playerSpawnZ = spawn.position.z + playerOff.z
    bundle.car.position.set(playerSpawnX, 0, playerSpawnZ)
    bundle.car.rotation.y = spawn.heading

    // Seed the camera rig at the offset spawn so the first frame is
    // already composed instead of snapping into place on tick 1.
    cameraRigRef.current = initCameraRig(
      playerSpawnX,
      playerSpawnZ,
      spawn.heading,
      DEFAULT_CAMERA_RIG,
    )
    applyCameraRig(bundle.camera, cameraRigRef.current)

    let raf = 0
    let lastNow = performance.now()
    const tickLoop = (now: number) => {
      const dtMs = Math.max(0, Math.min(50, now - lastNow))
      lastNow = now

      // Use the shared keyboard / gamepad / touch translator so drag stays
      // in lockstep with the closed-loop game and derby on steer / throttle
      // conventions. Drag's old inline derivation flipped the steer sign,
      // which read as inverted on the touch joystick (push joystick right
      // -> car turned left). The helper's "+steer turns CCW" convention
      // matches the physics module.
      const baseInput = readPlayerInput(keys.current)
      // Edge-trigger shifts so a held Q / E or LB / RB does not auto-cycle
      // gears every frame. shiftLatchedRef remembers whether each binding
      // was already down on the previous tick; we only emit a shift on the
      // press, not while the key is held. Cleared on key release so the
      // next press fires a fresh shift.
      const rawShiftDown = !!keys.current.shiftDown
      const rawShiftUp = !!keys.current.shiftUp
      const wasShiftDown = shiftLatchedRef.current.down
      const wasShiftUp = shiftLatchedRef.current.up
      const input: typeof baseInput & {
        shiftDown: boolean
        shiftUp: boolean
      } = {
        ...baseInput,
        shiftDown: rawShiftDown && !wasShiftDown,
        shiftUp: rawShiftUp && !wasShiftUp,
      }
      shiftLatchedRef.current = { down: rawShiftDown, up: rawShiftUp }

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
        if (result.shiftQuality !== null) {
          // Schedule the chip and clear it after the animation finishes
          // so a stale "PERFECT" doesn't linger across a restart. Any
          // pending timer is cleared first so back-to-back shifts always
          // get the full animation duration.
          if (shiftFlashTimerRef.current) {
            clearTimeout(shiftFlashTimerRef.current)
          }
          const triggeredAt = performance.now()
          const quality = result.shiftQuality
          setShiftFlash({ quality, triggeredAt })
          shiftFlashTimerRef.current = setTimeout(() => {
            setShiftFlash((current) =>
              current && current.triggeredAt === triggeredAt ? null : current,
            )
            shiftFlashTimerRef.current = null
          }, 900)
        }
        // Sample the player's pose into the recording buffer at fixed
        // cadence. Push every slot we crossed this frame so a long dt does
        // not create gaps. The cap mirrors RaceCanvas: stop sampling at
        // MAX_REPLAY_SAMPLES so the persisted blob stays bounded.
        if (state.raceStartMs !== null) {
          const tLap = performance.now() - state.raceStartMs
          const buf = recordingBufferRef.current
          while (
            tLap >= nextSampleAtRef.current &&
            buf.length / 3 < MAX_REPLAY_SAMPLES
          ) {
            buf.push(state.x, state.z, state.heading)
            nextSampleAtRef.current += REPLAY_SAMPLE_MS
          }
        }
        if (result.finished && !finishedRef.current) {
          // Snapshot the recording into a Replay so the submit effect can
          // forward it. ReplaySchema requires at least one sample; very
          // short runs that never crossed a sample slot are skipped.
          const buf = recordingBufferRef.current
          const sampleCount = Math.floor(buf.length / 3)
          if (sampleCount >= 1) {
            const samples: Array<[number, number, number]> = new Array(
              sampleCount,
            )
            for (let i = 0; i < sampleCount; i++) {
              const o = i * 3
              samples[i] = [buf[o], buf[o + 1], buf[o + 2]]
            }
            recordedReplayRef.current = {
              samples,
              lapTimeMs: result.finished.finishTimeMs,
            }
          }
          finishedRef.current = true
          setFinishEvent(result.finished)
          setPhase('finished')
        }
      }

      stateRef.current = state

      // Drive the redline-bleed overlay. Red only appears once the
      // needle hits the gear-number tick on the dial (speedRatio >=
      // DRAG_REDLINE_RATIO of the gear cap, ~at the tick mark): the
      // gear number is the shift cue, the red is "you've bogged past
      // it". 35 percent base intensity the moment the player reaches
      // the cap so the warning reads instantly, then climbs with
      // gearPeakHoldSec so a longer bog produces a deeper bleed.
      if (ph === 'racing') {
        const gMax = Math.max(
          1,
          paramsRef.current.maxSpeed * dragGearSpec(state.gear).maxSpeedFactor,
        )
        const speedRatio = Math.abs(state.speed) / gMax
        const atRedline = speedRatio >= DRAG_REDLINE_RATIO
        const holdBonus = Math.min(1, state.gearPeakHoldSec / SHIFT_LATE_HOLD_SEC)
        redlineIntensityRef.current = atRedline
          ? Math.min(1, 0.35 + holdBonus * 0.65)
          : 0
      } else {
        redlineIntensityRef.current = 0
      }

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

      // Ghost car + floating nameplate. The shared helper handles pose
      // sampling, visibility, distance-fade, and the cache-keyed plate
      // redraw; we just hand it the strip's hilly terrain sampler so the
      // ghost follows the same profile the player car drives over. The
      // 'finished' phase keeps active=true so the rival freezes at its
      // finish-line pose (the replay sampler clamps past maxT) instead
      // of vanishing the moment the player crosses the line.
      const ghostNode = ghostCarRef.current
      const ghostPlate = ghostNameplateRef.current
      if (ghostNode && ghostPlate) {
        applyGhostPresentation(ghostPresentationState, {
          ghostCar: ghostNode,
          ghostPlate,
          replay: ghostReplayRef.current,
          raceStartMs: state.raceStartMs,
          nowMs: performance.now(),
          active: ph === 'racing' || ph === 'finished',
          showNameplate: true,
          meta: ghostMetaRef.current,
          source: ghostSourceRef.current,
          playerX: state.x,
          playerZ: state.z,
          resolveTerrain: (x, z) => {
            const arc = projectArcLengthOnSpawnAxis(
              { x, z },
              { position: spawn.position, heading: spawn.heading },
            )
            return {
              y: heightAt(strip.verticalProfile, arc),
              pitch: slopeAt(strip.verticalProfile, arc),
            }
          },
        })
        // Pin the ghost to the left lane. When the replay drove it
        // visible we keep the longitudinal arc length and just rebuild
        // the world position on the left side of the spawn axis. When
        // the helper left it hidden (no replay loaded, or pre-race) we
        // park a phantom ghost at the start line so the player always
        // has a visible opponent staged in the left lane. Y is unchanged
        // because the vertical profile only varies along the spawn axis.
        const fwdX = Math.cos(spawn.heading)
        const fwdZ = -Math.sin(spawn.heading)
        const leftOff = lateralOffset(spawn.heading, -LANE_OFFSET_M)
        if (ghostNode.visible) {
          const arc = projectArcLengthOnSpawnAxis(
            { x: ghostNode.position.x, z: ghostNode.position.z },
            { position: spawn.position, heading: spawn.heading },
          )
          ghostNode.position.x =
            spawn.position.x + fwdX * arc + leftOff.x
          ghostNode.position.z =
            spawn.position.z + fwdZ * arc + leftOff.z
        } else {
          // Parked at the spawn line in the left lane. Heading matches
          // the strip so the car is aimed down the strip from the start,
          // not idling sideways.
          const y = heightAt(strip.verticalProfile, 0)
          const pitch = slopeAt(strip.verticalProfile, 0)
          ghostNode.position.set(
            spawn.position.x + leftOff.x,
            y,
            spawn.position.z + leftOff.z,
          )
          ghostNode.rotation.set(-pitch, spawn.heading, 0)
          ghostNode.visible = true
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
          gear: state.gear,
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

  // Clear the shift-flash timer on unmount so a stale setTimeout cannot
  // fire after the component (and its setShiftFlash setter) has been
  // disposed by a route change.
  useEffect(() => {
    return () => {
      if (shiftFlashTimerRef.current) {
        clearTimeout(shiftFlashTimerRef.current)
        shiftFlashTimerRef.current = null
      }
    }
  }, [])

  // Run the countdown lights, then start the race.
  const startCountdown = useCallback(() => {
    setPhase('countdown')
    finishedRef.current = false
    setFinishEvent(null)
    // Reset the game state to spawn.
    const fresh = spawnAtLane(initDragGameState(path), path.spawn, LANE_OFFSET_M)
    stateRef.current = fresh
    goAtMsRef.current = null
    speedRef.current = 0
    topSpeedRef.current = 0
    // Wipe the previous lap's recording so the next finish only captures
    // the upcoming attempt. nextSampleAt is anchored at 0 so the first
    // sample lands at t=0 (GO) and successive samples step at the fixed
    // cadence.
    recordingBufferRef.current = []
    nextSampleAtRef.current = 0
    recordedReplayRef.current = null
    setCountdownStartedAt(performance.now())
    setCountdownFouled(false)
    setShiftFlash(null)
    if (shiftFlashTimerRef.current) {
      clearTimeout(shiftFlashTimerRef.current)
      shiftFlashTimerRef.current = null
    }
    redlineIntensityRef.current = 0
    setHud({
      elapsedMs: 0,
      speed: 0,
      fouled: false,
      reactionTimeMs: null,
      splits: [],
      topSpeed: 0,
      gear: 1,
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
    // Stamp the current livery onto the submitted loadout so a future
    // race can rebuild the ghost in the exact car the player drove.
    // The stored DragLoadout already carries optional paint and
    // racingNumber fields; we fill them from the live control settings.
    const submittedLoadout: DragLoadout = {
      ...loadout,
      paint: controlSettings.carPaint ?? undefined,
      racingNumber: controlSettings.racingNumber,
    }
    void submitDragRun({
      slug,
      versionHash,
      finishEvent,
      loadout: submittedLoadout,
      replay: recordedReplayRef.current ?? undefined,
    })
      .then(async () => {
        const entries = await refreshLeaderboard()
        if (entries !== null) setLeaderboard(entries)
      })
      .catch(() => {
        // ignore; user can retry by racing again.
      })
  }, [
    finishEvent,
    slug,
    versionHash,
    loadout,
    controlSettings.carPaint,
    controlSettings.racingNumber,
    refreshLeaderboard,
  ])

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

  useEffect(() => {
    ghostSourceRef.current = ghost.source === 'none' ? 'auto' : ghost.source
  }, [ghost.source])

  // Load the ghost's replay whenever the selected nonce changes. The
  // primary candidate comes from `selectDragGhost`; if its byNonce lookup
  // 404s (e.g., a legacy entry submitted before drag replay recording
  // shipped, or a row with no stored replay for any other reason), walk
  // through the remaining leaderboard entries in best-time order and use
  // the first one that does have a replay. The matching nameplate meta is
  // updated alongside so the floating "WHO + TIME" plate tracks whichever
  // candidate we ended up loading.
  useEffect(() => {
    if (!ghost.nonce) {
      ghostReplayRef.current = null
      ghostMetaRef.current = null
      return undefined
    }
    // Sorted candidate queue: primary first, then everyone else with a
    // nonce, fastest to slowest. Skip entries without a nonce since
    // byNonce requires one. Dedupe so the primary is not retried at the
    // bottom of the queue. The full leaderboard entry rides along so a
    // successful load can also dress the ghost in the original racer's
    // livery (paint + racing-number plate from their stored loadout).
    type GhostCandidate = {
      nonce: string
      initials: string
      lapTimeMs: number
      entry: LeaderboardEntry | null
    }
    const sortedRest = [...leaderboard]
      .filter((e) => e.nonce !== null && e.nonce !== ghost.nonce)
      .sort((a, b) => a.lapTimeMs - b.lapTimeMs || a.rank - b.rank)
    const primary = leaderboard.find((e) => e.nonce === ghost.nonce) ?? null
    const queue: GhostCandidate[] = []
    if (primary && primary.nonce) {
      queue.push({
        nonce: primary.nonce,
        initials: primary.initials,
        lapTimeMs: primary.lapTimeMs,
        entry: primary,
      })
    } else {
      // primary entry is no longer on the leaderboard; fall through to
      // the rest of the board.
      queue.push({
        nonce: ghost.nonce,
        initials: '???',
        lapTimeMs: 0,
        entry: null,
      })
    }
    for (const entry of sortedRest) {
      if (entry.nonce) {
        queue.push({
          nonce: entry.nonce,
          initials: entry.initials,
          lapTimeMs: entry.lapTimeMs,
          entry,
        })
      }
    }

    let cancelled = false
    void (async () => {
      for (const candidate of queue) {
        try {
          const res = await fetch(
            `/api/replay/byNonce?slug=${encodeURIComponent(slug)}&v=${versionHash}&nonce=${candidate.nonce}`,
          )
          if (cancelled) return
          if (!res.ok) continue
          const data = (await res.json()) as unknown
          if (cancelled) return
          if (!data || typeof data !== 'object') continue
          ghostReplayRef.current = data as Replay
          ghostMetaRef.current = {
            initials: candidate.initials,
            lapTimeMs: candidate.lapTimeMs,
          }
          // Dress the ghost in the original racer's livery. Falls back to
          // stock GLB paint and no plate when the stored loadout omits a
          // value (legacy entries, current-user defaults). The setters
          // are buffered inside buildGhostCar so calling them before the
          // GLB resolves is safe.
          const liveryLoadout = candidate.entry?.loadout ?? null
          ghostSetPaintRef.current?.(liveryLoadout?.paint ?? null)
          ghostSetRacingNumberRef.current?.(
            liveryLoadout?.racingNumber ?? DEFAULT_RACING_NUMBER,
          )
          return
        } catch {
          if (cancelled) return
        }
      }
      // No candidate had a replay; clear so the rAF loop falls back to
      // the parked ghost.
      if (!cancelled) {
        ghostReplayRef.current = null
      }
    })()
    return () => {
      cancelled = true
    }
  }, [ghost.nonce, leaderboard, slug, versionHash])

  return (
    <div style={dragRootStyle}>
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />

      {/* Strip name + back chip. Matches the project's HUD chip look:
          panel background, rounded, subtle border, accent-color back link. */}
      <div style={raceHeaderStyle}>
        <Link href="/drag" style={raceHeaderBackStyle}>
          ‹ back
        </Link>
        <strong style={raceHeaderTitleStyle}>{strip.displayName}</strong>
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
        <>
          <DragRedlineTint intensityRef={redlineIntensityRef} />
          <DragHUD
            elapsedMs={hud.elapsedMs}
            fouled={hud.fouled}
            reactionTimeMs={hud.reactionTimeMs}
            splits={hud.splits}
            gear={hud.gear}
            gearCount={DRAG_MANUAL_GEAR_MAX}
          />
          <DragShiftFlash event={shiftFlash} />
        </>
      )}

      {(phase === 'racing' || phase === 'finished') &&
        controlSettings.showSpeedometer && (
          <DragSpeedometer
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
        showShifter
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
