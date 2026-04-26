'use client'
import { useEffect, useRef, type CSSProperties, type MutableRefObject } from 'react'
import { PerspectiveCamera, WebGLRenderer } from 'three'
import type { Piece } from '@/lib/schemas'
import { buildTrackPath, worldToCell } from '@/game/trackPath'
import { cellKey } from '@/game/track'
import {
  expectedTangent,
  initWrongWayDetector,
  isWrongWayInstant,
  updateWrongWayDetector,
} from '@/game/wrongWay'
import {
  buildGhostCar,
  buildScene,
  initCameraRig,
  updateCameraRig,
  type CameraRigParams,
  type CameraRigState,
} from '@/game/sceneBuilder'
import type { TimeOfDay } from '@/lib/lighting'
import type { Weather } from '@/lib/weather'
import {
  initGameState,
  startRace,
  tick,
  type LapCompleteEvent,
} from '@/game/tick'
import type { CheckpointHit } from '@/lib/schemas'
import type { CarParams } from '@/game/physics'
import type { useKeyboard } from '@/hooks/useKeyboard'
import { setGameIntensity } from '@/game/music'
import {
  MAX_REPLAY_SAMPLES,
  REPLAY_SAMPLE_MS,
  interpolateGhostPose,
  type Replay,
} from '@/lib/replay'
import {
  skidIntensity,
  startEngineDrone,
  startSkid,
  stopEngineDrone,
  stopSkid,
  updateDriveSfx,
} from '@/game/audio'
import {
  shouldSpawnSkidMark,
  skidMarkPeakAlpha,
} from '@/game/skidMarks'
import {
  driftIntensity,
  initDriftSession,
  stepDriftSession,
  type DriftSessionState,
} from '@/game/drift'

export interface RaceCanvasHud {
  currentMs: number
  lapCount: number
  onTrack: boolean
  lastLapMs: number | null
  // True when the car has been driving against the lap direction long enough
  // for the warning to engage (debounced by the pure helper).
  wrongWay: boolean
  // Live drift score for the in-flight session (0 when not actively drifting).
  // The HUD pulses on this so the player gets immediate feedback during a slide.
  driftActive: boolean
  driftScore: number
  driftMultiplier: number
  // Best drift session score across the current lap. Resets on lap-complete.
  driftLapBest: number
}

const HUD_UPDATE_MS = 50

export interface RaceCanvasProps {
  pieces: Piece[]
  checkpointCount?: number
  paramsRef: MutableRefObject<CarParams>
  keys: ReturnType<typeof useKeyboard>
  pausedRef: MutableRefObject<boolean>
  resumeShiftRef: MutableRefObject<number>
  pendingResetRef: MutableRefObject<boolean>
  pendingRaceStartRef: MutableRefObject<number | null>
  // When set, the rAF loop teleports the car back to the spawn point and
  // restarts the lap timer without touching `lapCount`, the recorded PB, or
  // the React-side toast / split / history state. Distinct from
  // `pendingResetRef` (full session restart, replays the countdown) so a
  // mid-race lap restart does not clobber the running session.
  pendingLapResetRef?: MutableRefObject<boolean>
  onLapComplete: (event: LapCompleteEvent) => void
  onHudUpdate: (hud: RaceCanvasHud) => void
  // Active ghost replay to render alongside the player. Reading via a ref so
  // Game.tsx can swap it after a personal-best lap without re-mounting the
  // canvas. null disables the ghost.
  activeGhostRef?: MutableRefObject<Replay | null>
  // Toggle visibility from Settings without tearing down the renderer.
  showGhostRef?: MutableRefObject<boolean>
  // Live camera-rig overrides from Settings. The rAF loop reads this every
  // frame so a slider tweak in the pause menu takes effect on resume without
  // rebuilding the renderer.
  cameraRigRef?: MutableRefObject<CameraRigParams | null>
  // Live car-paint override from Settings. Same ref pattern as
  // `cameraRigRef`: the rAF loop polls it and reapplies whenever the value
  // changes so a swatch click in the pause menu repaints the car on the
  // next frame.
  carPaintRef?: MutableRefObject<string | null>
  // Live time-of-day lighting override from Settings. Same poll-and-set
  // pattern: the rAF loop checks for a change and reapplies the preset (sky
  // color, ambient, sun) without rebuilding the renderer.
  timeOfDayRef?: MutableRefObject<TimeOfDay | null>
  // Live weather override from Settings. Polled each frame so a swatch click
  // in the pause menu reskins fog density, sky tint, and ambient / sun
  // multipliers on the next frame without rebuilding the renderer.
  weatherRef?: MutableRefObject<Weather | null>
  // Toggle the dark skid-mark trail laid behind the rear wheels during
  // slides. Polled each frame so a Settings flip takes effect without
  // rebuilding the renderer. Default behavior when omitted: enabled.
  showSkidMarksRef?: MutableRefObject<boolean>
  // Toggle the alternating red / white kerbs at the inside of every corner.
  // Polled each frame so a Settings flip takes effect without rebuilding the
  // scene. Default behavior when omitted: enabled.
  showKerbsRef?: MutableRefObject<boolean>
  // Toggle the trackside scenery (trees, cones, barriers). Polled each frame
  // so a Settings flip takes effect without rebuilding the scene. Default
  // behavior when omitted: enabled.
  showSceneryRef?: MutableRefObject<boolean>
  // Toggle the racing-line overlay (a thin colored polyline floating above
  // the road that traces the active ghost replay). Polled each frame so a
  // Settings flip takes effect without rebuilding the scene. The line itself
  // is sourced from `activeGhostRef`. Default when omitted: disabled.
  showRacingLineRef?: MutableRefObject<boolean>
  // Optional second canvas the renderer draws a backward-facing pass into
  // every frame. The parent owns the canvas DOM element so the layout (and
  // a CSS-driven show/hide) stays inside the React tree. The backward pass
  // shares the same scene + car + ghost as the main view; it just uses a
  // separate renderer + PerspectiveCamera positioned behind the car.
  rearviewCanvasRef?: MutableRefObject<HTMLCanvasElement | null>
  // Toggle the rear-view rendering loop without remounting the renderer.
  // The pass short-circuits when the ref is false so a hidden mirror does
  // not pay the per-frame draw cost.
  showRearviewRef?: MutableRefObject<boolean>
  // Pose targets the rAF loop writes the player's current world pose into
  // every frame so peripheral overlays (the minimap, future telemetry) can
  // read it without re-rendering React 60 times per second. Optional so the
  // tuning lab can skip the wiring.
  carPoseOutRef?: MutableRefObject<{ x: number; z: number; heading: number } | null>
  ghostPoseOutRef?: MutableRefObject<{ x: number; z: number; heading: number } | null>
  // Same pattern for the player's signed speed (world units / second). The
  // speedometer overlay reads it from its own rAF loop.
  speedOutRef?: MutableRefObject<number>
  // Fired when the recorder finishes a lap. Game.tsx decides whether to
  // persist the path locally and bundle it into the next /race/submit.
  onLapReplay?: (replay: Replay) => void
  // Fired the frame the player crosses each in-lap checkpoint (i.e. every
  // hit that does not also complete the lap). The HUD's split-vs-PB tile
  // hangs off this so it never has to mirror the full hits array through
  // React state.
  onCheckpointHit?: (hit: CheckpointHit) => void
  // Fired with the best drift score the player accrued during the just-
  // completed lap. The receiver decides whether to surface a toast or
  // persist the score as a new local PB. Always emitted on lap complete
  // (even when the score is 0) so consumers can clear stale UI.
  onLapDriftBest?: (score: number) => void
  disableMusicIntensity?: boolean
  className?: string
  style?: CSSProperties
}

// Owns the WebGL renderer, scene, camera rig, and the rAF loop. The parent
// keeps owning all the pause / reset / countdown state via refs so this
// component stays a pure rendering primitive shared by the race flow and the
// tuning lab. Behavior is identical to the original inline effect.
export function RaceCanvas({
  pieces,
  checkpointCount,
  paramsRef,
  keys,
  pausedRef,
  resumeShiftRef,
  pendingResetRef,
  pendingLapResetRef,
  pendingRaceStartRef,
  onLapComplete,
  onHudUpdate,
  activeGhostRef,
  showGhostRef,
  cameraRigRef,
  carPaintRef,
  timeOfDayRef,
  weatherRef,
  showSkidMarksRef,
  showKerbsRef,
  showSceneryRef,
  showRacingLineRef,
  rearviewCanvasRef,
  showRearviewRef,
  carPoseOutRef,
  ghostPoseOutRef,
  speedOutRef,
  onLapReplay,
  onCheckpointHit,
  onLapDriftBest,
  disableMusicIntensity,
  className,
  style,
}: RaceCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const onLapCompleteRef = useRef(onLapComplete)
  const onHudUpdateRef = useRef(onHudUpdate)
  const onLapReplayRef = useRef(onLapReplay)
  const onCheckpointHitRef = useRef(onCheckpointHit)
  const onLapDriftBestRef = useRef(onLapDriftBest)
  const disableMusicRef = useRef(!!disableMusicIntensity)
  onLapCompleteRef.current = onLapComplete
  onHudUpdateRef.current = onHudUpdate
  onLapReplayRef.current = onLapReplay
  onCheckpointHitRef.current = onCheckpointHit
  onLapDriftBestRef.current = onLapDriftBest
  disableMusicRef.current = !!disableMusicIntensity

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const path = buildTrackPath(pieces, checkpointCount)
    const bundle = buildScene(path)
    const renderer = new WebGLRenderer({ canvas, antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

    // Apply the initial paint synchronously. The setter buffers internally
    // when the GLB is still loading, so this is safe even on a cold cache.
    let lastPaint: string | null | undefined = undefined
    function syncPaint() {
      const next = carPaintRef?.current ?? null
      if (next === lastPaint) return
      lastPaint = next
      bundle.setCarPaint(next)
    }
    syncPaint()

    // Same poll-and-set for the time-of-day lighting preset. The setter is
    // cheap (mutates existing colors / lights in place, no allocation) so
    // calling it on the no-op path is fine; we still short-circuit on string
    // equality to keep the common case branch-free.
    let lastTimeOfDay: TimeOfDay | null | undefined = undefined
    function syncTimeOfDay() {
      const next = timeOfDayRef?.current ?? null
      if (next === lastTimeOfDay) return
      lastTimeOfDay = next
      if (next !== null) bundle.setTimeOfDay(next)
    }
    syncTimeOfDay()

    // Same poll-and-set for the weather preset. The setter mutates the
    // existing FogExp2 plus the sky / lights in place; 'clear' is a no-op at
    // the renderer level (zero fog density) so the cost of leaving it on the
    // default is exactly the cost of having no weather feature at all.
    let lastWeather: Weather | null | undefined = undefined
    function syncWeather() {
      const next = weatherRef?.current ?? null
      if (next === lastWeather) return
      lastWeather = next
      if (next !== null) bundle.setWeather(next)
    }
    syncWeather()

    // Same poll-and-set for the inside-corner kerb visibility. The setter just
    // flips the parent group's visibility flag, which is O(1) and free per
    // frame; we still short-circuit on equality so the common path is a single
    // pointer compare and a boolean check.
    let lastShowKerbs: boolean | undefined = undefined
    function syncKerbs() {
      const next = showKerbsRef?.current ?? true
      if (next === lastShowKerbs) return
      lastShowKerbs = next
      bundle.kerbs.setVisible(next)
    }
    syncKerbs()

    // Same poll-and-set for the trackside scenery layer (trees, cones,
    // barriers). The setter just flips the parent group's visibility flag,
    // so the per-frame cost is a single boolean compare on the cached value.
    let lastShowScenery: boolean | undefined = undefined
    function syncScenery() {
      const next = showSceneryRef?.current ?? true
      if (next === lastShowScenery) return
      lastShowScenery = next
      bundle.scenery.setVisible(next)
    }
    syncScenery()

    // Racing-line overlay. Two refs feed this layer: the visibility toggle
    // (Settings) and the active replay source (the same ref the ghost car
    // reads). Both checks short-circuit on equality so the per-frame cost is
    // two pointer / boolean compares on the cached values until something
    // actually changes. Visible defaults to false because the racing line is
    // an opt-in coaching aid; if no replay is loaded yet we also keep the
    // line hidden until one resolves.
    let lastShowRacingLine: boolean | undefined = undefined
    let lastRacingLineReplay: Replay | null | undefined = undefined
    function syncRacingLine() {
      const wantVisible = showRacingLineRef?.current ?? false
      const replay = activeGhostRef?.current ?? null
      if (replay !== lastRacingLineReplay) {
        lastRacingLineReplay = replay
        bundle.racingLine.setReplay(replay)
      }
      // Hide the layer entirely when the player turned the toggle off OR
      // when no replay is available so an empty group does not flash on.
      const effectiveVisible = wantVisible && replay !== null
      if (effectiveVisible !== lastShowRacingLine) {
        lastShowRacingLine = effectiveVisible
        bundle.racingLine.setVisible(effectiveVisible)
      }
    }
    syncRacingLine()

    function resize() {
      const el = canvasRef.current
      if (!el) return
      renderer.setSize(el.clientWidth, el.clientHeight, false)
      bundle.camera.aspect = el.clientWidth / el.clientHeight
      bundle.camera.updateProjectionMatrix()
    }
    resize()
    window.addEventListener('resize', resize)

    // Optional rear-view pass. The renderer is created lazily once the parent
    // canvas ref resolves and shares the same scene as the main view; only the
    // camera differs (placed at the car looking backward). Both renderers are
    // disposed on unmount. The pass is a no-op when the ref is null or when
    // showRearviewRef is false, so a hidden mirror costs nothing per frame.
    let rearRenderer: WebGLRenderer | null = null
    const rearCamera = new PerspectiveCamera(80, 4, 0.1, 2000)
    let lastRearW = 0
    let lastRearH = 0
    function ensureRearRenderer(): WebGLRenderer | null {
      const el = rearviewCanvasRef?.current ?? null
      if (!el) return null
      if (rearRenderer) return rearRenderer
      rearRenderer = new WebGLRenderer({ canvas: el, antialias: true })
      rearRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      return rearRenderer
    }
    function syncRearSize(r: WebGLRenderer) {
      const el = rearviewCanvasRef?.current
      if (!el) return
      const w = el.clientWidth
      const h = el.clientHeight
      if (w === 0 || h === 0) return
      if (w === lastRearW && h === lastRearH) return
      lastRearW = w
      lastRearH = h
      r.setSize(w, h, false)
      rearCamera.aspect = w / h
      rearCamera.updateProjectionMatrix()
    }

    // Apply FOV from the camera rig ref each frame, but only call
    // updateProjectionMatrix when the value actually changes. The PerspectiveCamera
    // ships at 70 degrees so a no-op tweak is the common case.
    let lastFov: number | undefined = bundle.camera.fov
    function syncFov() {
      const next = cameraRigRef?.current?.fov
      if (next === undefined || next === lastFov) return
      lastFov = next
      bundle.camera.fov = next
      bundle.camera.updateProjectionMatrix()
    }
    syncFov()

    let state = initGameState(path)
    const rig: CameraRigState = initCameraRig(state.x, state.z, state.heading)

    function resetRigFromState() {
      Object.assign(rig, initCameraRig(state.x, state.z, state.heading))
    }

    bundle.car.position.set(state.x, 0, state.z)
    bundle.car.rotation.y = state.heading
    bundle.camera.position.set(rig.position.x, rig.position.y, rig.position.z)
    bundle.camera.lookAt(rig.target.x, rig.target.y, rig.target.z)
    renderer.render(bundle.scene, bundle.camera)

    const ghostBuild = buildGhostCar()
    const ghostMesh = ghostBuild.ghost
    ghostMesh.visible = false
    ghostMesh.position.set(state.x, 0, state.z)
    ghostMesh.rotation.y = state.heading
    bundle.scene.add(ghostMesh)

    // Per-lap recording. The buffer is interleaved [x, z, heading] triples and
    // is sampled at REPLAY_SAMPLE_MS offsets from raceStartMs so playback is a
    // constant-time array lookup. Buffer resets every time a lap completes
    // (tick.ts also resets raceStartMs at the same instant) and on full reset.
    let recordingBuffer: number[] = []
    let nextSampleAt = 0

    function resetRecording() {
      recordingBuffer = []
      nextSampleAt = 0
    }

    let raf = 0
    let lastTs = performance.now()
    let lastHudTs = 0
    let lastSkidSpawnTs = -Infinity
    let running = true
    let prevHud: RaceCanvasHud | null = null
    let prevOnTrack = true
    let droneStarted = false
    let prevHitsLen = 0
    let wrongWayState = initWrongWayDetector()
    // Drift scoring. The session machine accrues a score across consecutive
    // sliding frames; `lapBest` is the best single-session score this lap.
    // `lastEndedScore` is the score of the most recently finished session,
    // exposed in the HUD for ~2 seconds via the throttled HUD update so the
    // player can see how big a chain just landed.
    let driftSession: DriftSessionState = initDriftSession()
    let driftLapBest = 0

    function loop(ts: number) {
      if (!running) return

      // Reapply paint when the user picks a new swatch in Settings. Cheap:
      // the setter compares string equality and short-circuits on a no-op.
      syncPaint()
      // Same idea for FOV: poll the camera rig ref and call
      // updateProjectionMatrix only when the value changes.
      syncFov()
      // And the time-of-day lighting preset.
      syncTimeOfDay()
      // And the weather preset (fog density + sky tint + intensity multipliers).
      syncWeather()
      // And the inside-corner kerb visibility.
      syncKerbs()
      // And the trackside scenery visibility.
      syncScenery()
      // And the racing-line overlay (visibility + replay source).
      syncRacingLine()

      if (pendingResetRef.current) {
        state = initGameState(path)
        resetRigFromState()
        bundle.car.position.set(state.x, 0, state.z)
        bundle.car.rotation.y = state.heading
        bundle.camera.position.set(rig.position.x, rig.position.y, rig.position.z)
        bundle.camera.lookAt(rig.target.x, rig.target.y, rig.target.z)
        ghostMesh.visible = false
        if (carPoseOutRef) {
          carPoseOutRef.current = { x: state.x, z: state.z, heading: state.heading }
        }
        if (ghostPoseOutRef) ghostPoseOutRef.current = null
        if (speedOutRef) speedOutRef.current = 0
        resetRecording()
        bundle.skidMarks.clear()
        lastSkidSpawnTs = -Infinity
        renderer.render(bundle.scene, bundle.camera)
        pendingResetRef.current = false
        pendingRaceStartRef.current = null
        lastTs = ts
        prevHud = null
        prevOnTrack = true
        prevHitsLen = 0
        wrongWayState = initWrongWayDetector()
        driftSession = initDriftSession()
        driftLapBest = 0
        raf = requestAnimationFrame(loop)
        return
      }

      // Mid-race lap restart: teleport to spawn, zero the in-flight lap, but
      // preserve `lapCount` and `lastLapTimeMs` so the HUD's session tallies
      // and the on-disk PB do not get clobbered. The lap timer immediately
      // restarts at `ts` so the player can re-attempt the same lap without
      // sitting through the READY-SET-GO countdown.
      if (pendingLapResetRef?.current) {
        const fresh = initGameState(path)
        state = {
          ...fresh,
          // Carry the session's tallies forward.
          lapCount: state.lapCount,
          lastLapTimeMs: state.lastLapTimeMs,
          // Race is already in flight, so seed raceStartMs with the current
          // frame timestamp instead of leaving it null (which would freeze
          // physics until the next pendingRaceStartRef pulse).
          raceStartMs: ts,
        }
        resetRigFromState()
        bundle.car.position.set(state.x, 0, state.z)
        bundle.car.rotation.y = state.heading
        bundle.camera.position.set(rig.position.x, rig.position.y, rig.position.z)
        bundle.camera.lookAt(rig.target.x, rig.target.y, rig.target.z)
        if (carPoseOutRef) {
          carPoseOutRef.current = { x: state.x, z: state.z, heading: state.heading }
        }
        if (speedOutRef) speedOutRef.current = 0
        // Drop the in-flight recording buffer so the abandoned partial lap
        // never leaks into a future submit. Skid trails get cleared too so
        // the fresh attempt starts on a clean track surface.
        resetRecording()
        bundle.skidMarks.clear()
        lastSkidSpawnTs = -Infinity
        pendingLapResetRef.current = false
        // Discard accumulated pause shift: we just reseeded raceStartMs to
        // the frame timestamp so any pending shift is irrelevant and would
        // otherwise advance the new lap clock.
        resumeShiftRef.current = 0
        lastTs = ts
        prevOnTrack = true
        prevHitsLen = 0
        wrongWayState = initWrongWayDetector()
        driftSession = initDriftSession()
        driftLapBest = 0
        raf = requestAnimationFrame(loop)
        return
      }

      if (pausedRef.current) {
        // Duck the continuous voices while paused so they don't bleed under
        // the pause music. One call per frame is cheap; setTargetAtTime keeps
        // the ramp smooth.
        if (!disableMusicRef.current) {
          updateDriveSfx({
            speedAbs: 0,
            maxSpeed: paramsRef.current.maxSpeed,
            throttle: 0,
            steerAbs: 0,
            onTrack: true,
            prevOnTrack: true,
            racing: false,
          })
        }
        lastTs = ts
        raf = requestAnimationFrame(loop)
        return
      }

      if (resumeShiftRef.current > 0) {
        if (state.raceStartMs !== null) {
          state = {
            ...state,
            raceStartMs: state.raceStartMs + resumeShiftRef.current,
          }
        }
        resumeShiftRef.current = 0
        lastTs = ts
      }

      const dtMs = Math.min(50, ts - lastTs)
      lastTs = ts

      if (pendingRaceStartRef.current !== null) {
        state = startRace(state, pendingRaceStartRef.current)
        pendingRaceStartRef.current = null
      }

      const k = keys.current
      // Prefer analog axes when a gamepad has populated them this frame so
      // triggers + stick deflection feed stepPhysics directly. Falls back to
      // the boolean keyboard / touch derivation otherwise.
      const throttleInput = k.axes
        ? k.axes.throttle
        : (k.forward ? 1 : 0) + (k.backward ? -1 : 0)
      const steerInput = k.axes
        ? k.axes.steer
        : (k.left ? 1 : 0) + (k.right ? -1 : 0)
      const result = tick(
        state,
        {
          throttle: throttleInput,
          steer: steerInput,
          handbrake: k.handbrake,
        },
        dtMs,
        ts,
        path,
        paramsRef.current,
      )
      state = result.state

      // Fire the per-checkpoint callback when an in-lap hit is appended this
      // frame. The lap-complete branch below handles the final hit (it carries
      // the full lap info and is queued through onLapComplete instead).
      if (
        onCheckpointHitRef.current &&
        !result.lapComplete &&
        state.hits.length > prevHitsLen
      ) {
        // tick.ts only ever appends a single hit per frame, but iterate
        // defensively in case that ever changes.
        for (let i = prevHitsLen; i < state.hits.length; i++) {
          onCheckpointHitRef.current(state.hits[i])
        }
      }
      prevHitsLen = state.hits.length

      // Wrong-way detection. Project the car onto the centerline of its
      // current piece, compare the velocity direction (heading * sign(speed))
      // to the expected travel tangent, and run the result through the
      // debounced detector so brief sideways slides do not flash the warning.
      if (state.raceStartMs !== null) {
        const cellNow = worldToCell(state.x, state.z)
        const orderIdx = path.cellToOrderIdx.get(cellKey(cellNow.row, cellNow.col))
        let instantWrong = false
        if (orderIdx !== undefined) {
          const op = path.order[orderIdx]
          const expected = expectedTangent(op, state.x, state.z)
          instantWrong = isWrongWayInstant(state.heading, state.speed, expected)
        }
        wrongWayState = updateWrongWayDetector(wrongWayState, instantWrong)
      } else if (wrongWayState.active || wrongWayState.enterStreak > 0) {
        wrongWayState = initWrongWayDetector()
      }

      bundle.car.position.set(state.x, 0, state.z)
      bundle.car.rotation.y = state.heading
      // Publish the live pose for any overlays subscribed via a ref. Cheap
      // single-object write per frame; the consumer reads it from its own rAF
      // loop so React state never has to fan out.
      if (carPoseOutRef) {
        carPoseOutRef.current = { x: state.x, z: state.z, heading: state.heading }
      }
      if (speedOutRef) {
        speedOutRef.current = state.speed
      }
      updateCameraRig(
        rig,
        state.x,
        state.z,
        state.heading,
        cameraRigRef?.current ?? undefined,
      )
      bundle.camera.position.set(rig.position.x, rig.position.y, rig.position.z)
      bundle.camera.lookAt(rig.target.x, rig.target.y, rig.target.z)

      // Sample the player's pose into the recording buffer at fixed cadence.
      // Push every sample slot we crossed this frame so a long dt does not
      // create gaps. The pre-lap-complete state's raceStartMs is what we want
      // here: tick() resets raceStartMs to nowMs the moment a lap completes,
      // and we reset the buffer in the lap-complete branch below.
      if (state.raceStartMs !== null && recordingBuffer.length / 3 < MAX_REPLAY_SAMPLES) {
        const tLap = ts - state.raceStartMs
        while (
          tLap >= nextSampleAt &&
          recordingBuffer.length / 3 < MAX_REPLAY_SAMPLES
        ) {
          recordingBuffer.push(state.x, state.z, state.heading)
          nextSampleAt += REPLAY_SAMPLE_MS
        }
      }

      // Render the active ghost. Its time origin is the same raceStartMs the
      // player uses, so when tick resets raceStartMs on a finish-line crossing
      // the ghost automatically restarts from t=0 with the player.
      const replay = activeGhostRef?.current ?? null
      const showGhost = showGhostRef?.current ?? true
      if (replay && showGhost && state.raceStartMs !== null) {
        const tLap = ts - state.raceStartMs
        const pose = interpolateGhostPose(replay, tLap)
        if (pose) {
          ghostMesh.position.set(pose.x, 0, pose.z)
          ghostMesh.rotation.y = pose.heading
          ghostMesh.visible = true
          if (ghostPoseOutRef) {
            ghostPoseOutRef.current = {
              x: pose.x,
              z: pose.z,
              heading: pose.heading,
            }
          }
        } else {
          ghostMesh.visible = false
          if (ghostPoseOutRef) ghostPoseOutRef.current = null
        }
      } else {
        ghostMesh.visible = false
        if (ghostPoseOutRef) ghostPoseOutRef.current = null
      }

      // Skid marks: lay a paired stripe behind the rear wheels when the
      // player is sliding hard or off-track. The pure helper handles the
      // gating (interval + thresholds); the layer's `tick` fades existing
      // marks every frame so they ramp to zero independently. Disabled when
      // the Settings toggle is off, but the fade still ticks so any marks
      // already on the ground finish their fade rather than freezing.
      const showSkidMarks = showSkidMarksRef?.current ?? true
      if (state.raceStartMs !== null) {
        const skidSpeedAbs = Math.abs(state.speed)
        const skidSteerAbs = Math.abs(steerInput)
        const intensity = skidIntensity(
          skidSpeedAbs,
          paramsRef.current.maxSpeed,
          skidSteerAbs,
          state.onTrack,
        )
        const decision = shouldSpawnSkidMark(
          intensity,
          skidSpeedAbs,
          ts - lastSkidSpawnTs,
        )
        if (decision.spawn && showSkidMarks) {
          bundle.skidMarks.spawn(
            state.x,
            state.z,
            state.heading,
            skidMarkPeakAlpha(intensity),
            ts,
          )
          lastSkidSpawnTs = ts
        }
        // Drift scoring: independent of the skid spawn decision (we want a
        // continuous score, not just one tick per spawn). Uses the same
        // input shape so the audio cue and the score stay in sync.
        const dIntensity = driftIntensity(
          skidSpeedAbs,
          paramsRef.current.maxSpeed,
          skidSteerAbs,
        )
        const driftResult = stepDriftSession(driftSession, {
          intensity: dIntensity,
          steerSigned: steerInput,
          speedAbs: skidSpeedAbs,
          onTrack: state.onTrack,
          dtMs,
        })
        if (driftResult.ended) {
          // Session ended: capture the lap best (the score lives on the
          // PRIOR session's state because step returns the reset state on
          // end).
          if (driftSession.score > driftLapBest) {
            driftLapBest = driftSession.score
          }
        }
        driftSession = driftResult.state
        // Live track of "current best" includes the in-flight session so the
        // HUD shows progress before the player commits.
        if (driftSession.active && driftSession.score > driftLapBest) {
          driftLapBest = driftSession.score
        }
      } else {
        // Pre-race / between laps: keep drift state idle.
        driftSession = initDriftSession()
      }
      bundle.skidMarks.tick(ts)

      renderer.render(bundle.scene, bundle.camera)

      // Rear-view pass: same scene, camera placed at the car looking backward.
      // Skipped during countdown (state.raceStartMs === null) and when the
      // Settings toggle is off so a hidden mirror does not pay the per-frame
      // draw cost. Cheap; one render call, no extra scene traversal.
      const showRearview = showRearviewRef?.current ?? true
      if (
        showRearview &&
        state.raceStartMs !== null &&
        rearviewCanvasRef?.current
      ) {
        const r = ensureRearRenderer()
        if (r) {
          syncRearSize(r)
          // Position: in front of the car, slightly above, looking backward
          // along its forward axis. Front offset stays small enough that the
          // car body never enters the mirror frame; the look-at sits well
          // behind the car so the player sees the road and any chasing ghost.
          const cx = Math.cos(state.heading)
          const sz = -Math.sin(state.heading)
          const FRONT_OFFSET = 1.2
          const HEIGHT = 2.4
          const LOOK_BEHIND = 14
          rearCamera.position.set(
            state.x + cx * FRONT_OFFSET,
            HEIGHT,
            state.z + sz * FRONT_OFFSET,
          )
          rearCamera.lookAt(
            state.x - cx * LOOK_BEHIND,
            1.2,
            state.z - sz * LOOK_BEHIND,
          )
          r.render(bundle.scene, rearCamera)
        }
      }

      if (!disableMusicRef.current) {
        setGameIntensity(Math.abs(state.speed) / paramsRef.current.maxSpeed)
        const racing = state.raceStartMs !== null
        if (racing && !droneStarted) {
          startEngineDrone()
          startSkid()
          droneStarted = true
        }
        const steerAbs = Math.abs(steerInput)
        const throttle = throttleInput
        updateDriveSfx({
          speedAbs: Math.abs(state.speed),
          maxSpeed: paramsRef.current.maxSpeed,
          throttle,
          steerAbs,
          onTrack: state.onTrack,
          prevOnTrack,
          racing,
        })
        prevOnTrack = state.onTrack
      }

      if (result.lapComplete) {
        if (onLapReplayRef.current && recordingBuffer.length >= 3) {
          const sampleCount = recordingBuffer.length / 3
          const samples: Array<[number, number, number]> = new Array(sampleCount)
          for (let i = 0; i < sampleCount; i++) {
            const o = i * 3
            samples[i] = [
              recordingBuffer[o],
              recordingBuffer[o + 1],
              recordingBuffer[o + 2],
            ]
          }
          onLapReplayRef.current({
            samples,
            lapTimeMs: result.lapComplete.lapTimeMs,
          })
        }
        // Capture the lap best including any in-flight drift session, then
        // emit it for the consumer (Game.tsx persists the local PB and may
        // toast). Reset for the next lap.
        const finalLapBest = Math.max(driftLapBest, driftSession.score)
        onLapDriftBestRef.current?.(finalLapBest)
        driftLapBest = 0
        driftSession = initDriftSession()
        resetRecording()
        onLapCompleteRef.current(result.lapComplete)
      }

      if (ts - lastHudTs >= HUD_UPDATE_MS) {
        lastHudTs = ts
        const currentMs =
          state.raceStartMs !== null ? Math.round(ts - state.raceStartMs) : 0
        const driftActive = driftSession.active
        // Round the live score so the throttled HUD bail-out is stable; the
        // raw float wiggles by tiny amounts every frame even when nothing
        // visible changed, which would otherwise force a re-render every
        // 50 ms.
        const driftScoreInt = Math.round(driftSession.score)
        const driftLapBestInt = Math.round(driftLapBest)
        const driftMultInt = driftActive
          ? Math.round(
              Math.min(4, 1 + (driftSession.activeMs / 4000) * 3) * 10,
            ) / 10
          : 1
        const next: RaceCanvasHud = {
          currentMs,
          lapCount: state.lapCount,
          onTrack: state.onTrack,
          lastLapMs: state.lastLapTimeMs,
          wrongWay: wrongWayState.active,
          driftActive,
          driftScore: driftScoreInt,
          driftMultiplier: driftMultInt,
          driftLapBest: driftLapBestInt,
        }
        if (
          prevHud === null ||
          prevHud.currentMs !== next.currentMs ||
          prevHud.lapCount !== next.lapCount ||
          prevHud.onTrack !== next.onTrack ||
          prevHud.lastLapMs !== next.lastLapMs ||
          prevHud.wrongWay !== next.wrongWay ||
          prevHud.driftActive !== next.driftActive ||
          prevHud.driftScore !== next.driftScore ||
          prevHud.driftMultiplier !== next.driftMultiplier ||
          prevHud.driftLapBest !== next.driftLapBest
        ) {
          prevHud = next
          onHudUpdateRef.current(next)
        }
      }

      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    return () => {
      running = false
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      if (!disableMusicRef.current) {
        stopEngineDrone(0.1)
        stopSkid(0.1)
      }
      ghostBuild.dispose()
      bundle.scene.remove(ghostMesh)
      bundle.dispose()
      renderer.dispose()
      if (rearRenderer) {
        rearRenderer.dispose()
        rearRenderer = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pieces, checkpointCount])

  return <canvas ref={canvasRef} className={className} style={style} />
}
