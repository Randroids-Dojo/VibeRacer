'use client'
import { useEffect, useRef, type CSSProperties, type MutableRefObject } from 'react'
import { WebGLRenderer } from 'three'
import type { Piece } from '@/lib/schemas'
import { buildTrackPath } from '@/game/trackPath'
import {
  buildGhostCar,
  buildScene,
  initCameraRig,
  updateCameraRig,
  type CameraRigParams,
  type CameraRigState,
} from '@/game/sceneBuilder'
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

export interface RaceCanvasHud {
  currentMs: number
  lapCount: number
  onTrack: boolean
  lastLapMs: number | null
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
  // Toggle the dark skid-mark trail laid behind the rear wheels during
  // slides. Polled each frame so a Settings flip takes effect without
  // rebuilding the renderer. Default behavior when omitted: enabled.
  showSkidMarksRef?: MutableRefObject<boolean>
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
  pendingRaceStartRef,
  onLapComplete,
  onHudUpdate,
  activeGhostRef,
  showGhostRef,
  cameraRigRef,
  carPaintRef,
  showSkidMarksRef,
  carPoseOutRef,
  ghostPoseOutRef,
  speedOutRef,
  onLapReplay,
  onCheckpointHit,
  disableMusicIntensity,
  className,
  style,
}: RaceCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const onLapCompleteRef = useRef(onLapComplete)
  const onHudUpdateRef = useRef(onHudUpdate)
  const onLapReplayRef = useRef(onLapReplay)
  const onCheckpointHitRef = useRef(onCheckpointHit)
  const disableMusicRef = useRef(!!disableMusicIntensity)
  onLapCompleteRef.current = onLapComplete
  onHudUpdateRef.current = onHudUpdate
  onLapReplayRef.current = onLapReplay
  onCheckpointHitRef.current = onCheckpointHit
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

    function resize() {
      const el = canvasRef.current
      if (!el) return
      renderer.setSize(el.clientWidth, el.clientHeight, false)
      bundle.camera.aspect = el.clientWidth / el.clientHeight
      bundle.camera.updateProjectionMatrix()
    }
    resize()
    window.addEventListener('resize', resize)

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

    function loop(ts: number) {
      if (!running) return

      // Reapply paint when the user picks a new swatch in Settings. Cheap:
      // the setter compares string equality and short-circuits on a no-op.
      syncPaint()

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
      }
      bundle.skidMarks.tick(ts)

      renderer.render(bundle.scene, bundle.camera)

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
        resetRecording()
        onLapCompleteRef.current(result.lapComplete)
      }

      if (ts - lastHudTs >= HUD_UPDATE_MS) {
        lastHudTs = ts
        const currentMs =
          state.raceStartMs !== null ? Math.round(ts - state.raceStartMs) : 0
        const next: RaceCanvasHud = {
          currentMs,
          lapCount: state.lapCount,
          onTrack: state.onTrack,
          lastLapMs: state.lastLapTimeMs,
        }
        if (
          prevHud === null ||
          prevHud.currentMs !== next.currentMs ||
          prevHud.lapCount !== next.lapCount ||
          prevHud.onTrack !== next.onTrack ||
          prevHud.lastLapMs !== next.lastLapMs
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
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pieces, checkpointCount])

  return <canvas ref={canvasRef} className={className} style={style} />
}
