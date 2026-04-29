'use client'
import { useEffect, useRef, type CSSProperties, type MutableRefObject } from 'react'
import { PerspectiveCamera, WebGLRenderer } from 'three'
import type { Piece, TrackCheckpoint } from '@/lib/schemas'
import type { TrackTransmissionMode } from '@/game/transmission'
import {
  TRACK_WIDTH,
  buildTrackPath,
  distanceToCenterline,
  worldToCell,
} from '@/game/trackPath'
import { cellKey } from '@/game/track'
import {
  expectedTangent,
  initWrongWayDetector,
  isWrongWayInstant,
  updateWrongWayDetector,
} from '@/game/wrongWay'
import {
  applyCameraRig,
  buildGhostCar,
  buildGhostNameplate,
  buildScene,
  initCameraRig,
  updateCameraRig,
  type CameraRigParams,
  type CameraRigState,
} from '@/game/sceneBuilder'
import {
  nameplateOpacityForDistance,
  type GhostMeta,
} from '@/game/ghostNameplate'
import type { GhostSource } from '@/lib/ghostSource'
import type { TimeOfDay } from '@/lib/lighting'
import type { Weather } from '@/lib/weather'
import type { RacingNumberSetting } from '@/lib/racingNumber'
import {
  isBrakingNow,
  shouldBrakeLightsLight,
  type BrakeLightMode,
} from '@/lib/brakeLights'
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
  puffIntensity,
  puffPeakAlpha,
  shouldSpawnTireSmoke,
} from '@/game/tireSmoke'
import {
  driftIntensity,
  initDriftSession,
  stepDriftSession,
  type DriftSessionState,
} from '@/game/drift'
import {
  flushOffTrackTracker,
  initOffTrackTracker,
  stepOffTrackTracker,
  type LapTelemetry,
  type OffTrackEvent,
} from '@/game/offTrackEvents'
import { ghostGapMs } from '@/game/ghostGap'
import { isReactionInputPressed } from '@/game/reactionTime'
import {
  PACE_NOTE_SEVERITY_COLORS,
  buildPaceNotes,
  formatPaceNoteChipText,
  lookAheadPaceNote,
} from '@/game/paceNotes'

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
  // Live "ghost gap" in milliseconds: positive = player is BEHIND the ghost,
  // negative = AHEAD. null when no ghost is active, the player has drifted
  // too far from the recorded path to measure honestly, or the gap toggle is
  // off in Settings. Computed every HUD frame from the active ghost replay
  // and the player's current world position.
  ghostGapMs: number | null
  // Pace-notes call-out for the upcoming track feature ("Sharp left next",
  // "S-curve in 2", "Finish"). null hides the chip (off-track, Settings
  // toggle off, no path data on file). Pre-formatted upstream so the HUD
  // does not need to know the pace-note shape.
  paceNote: { text: string; accent: string } | null
  gear: number
}

const HUD_UPDATE_MS = 50

export interface RaceCanvasProps {
  pieces: Piece[]
  checkpointCount?: number
  checkpoints?: TrackCheckpoint[]
  transmission?: TrackTransmissionMode
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
  // Live ghost-meta tuple (initials + lap time) the floating nameplate above
  // the ghost car displays. Polled each frame; the renderer cache-keys on
  // (meta, source) so an unchanged tuple is a single string compare instead
  // of a canvas redraw + GPU upload. null hides the nameplate (e.g. while
  // the leaderboard top fetch is in flight, or when the ghost itself is
  // hidden). Game.tsx writes this in lockstep with `activeGhostRef`.
  activeGhostMetaRef?: MutableRefObject<GhostMeta | null>
  // Mirrors the player's ghost-source pick so the nameplate's tag chip can
  // read "TOP" / "PB" / "LAST" / "GHOST" alongside the initials. Polled
  // each frame so a Settings flip lands on the next frame.
  ghostSourceRef?: MutableRefObject<GhostSource>
  // Toggle the floating nameplate without tearing down the sprite. Polled
  // each frame; setting it false hides the plate without disposing it so a
  // flip back is cheap.
  showGhostNameplateRef?: MutableRefObject<boolean>
  // Toggle the live ghost-gap chip. Polled each frame so a Settings flip
  // takes effect without rebuilding any state. When false, the gap math is
  // skipped entirely so a hidden chip costs zero per frame. Default when
  // omitted: enabled.
  showGhostGapRef?: MutableRefObject<boolean>
  // Toggle the pace-notes HUD chip ("co-driver call-outs"). Polled each
  // frame so a Settings flip takes effect without rebuilding any state.
  // When false, the look-up is skipped entirely so a hidden chip costs zero
  // per frame. Default when omitted: disabled (opt-in coaching aid).
  showPaceNotesRef?: MutableRefObject<boolean>
  // Live camera-rig overrides from Settings. The rAF loop reads this every
  // frame so a slider tweak in the pause menu takes effect on resume without
  // rebuilding the renderer.
  cameraRigRef?: MutableRefObject<CameraRigParams | null>
  // Live car-paint override from Settings. Same ref pattern as
  // `cameraRigRef`: the rAF loop polls it and reapplies whenever the value
  // changes so a swatch click in the pause menu repaints the car on the
  // next frame.
  carPaintRef?: MutableRefObject<string | null>
  // Live racing-number plate override from Settings. Polled each frame so a
  // swatch click in the pause menu redraws the plate on the next frame
  // without rebuilding the renderer. Setter short-circuits on a no-op.
  racingNumberRef?: MutableRefObject<RacingNumberSetting | null>
  // Live headlights toggle (already resolved from the player's HeadlightMode
  // pick + the active timeOfDay / weather by the parent). Polled each frame so
  // a Settings flip (or a time-of-day swap) lights or extinguishes the lamps
  // on the next frame without rebuilding the renderer.
  headlightsOnRef?: MutableRefObject<boolean>
  // Live brake-light mode pick from Settings ('off' / 'auto' / 'on'). The
  // renderer combines this with its per-frame braking detection so 'auto'
  // glows the lamps only while the player is actually slowing the car down.
  // Polled each frame so a Settings flip lands on the next frame without
  // rebuilding the renderer.
  brakeLightModeRef?: MutableRefObject<BrakeLightMode>
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
  // Toggle the soft white tire-smoke puffs that pop off the rear wheels
  // during hard slides and braking. Polled each frame so a Settings flip
  // takes effect without rebuilding the renderer. Existing puffs in flight
  // continue to fade naturally even after a flip-off so the toggle does not
  // snap a visible cloud away mid-corner. Default when omitted: enabled.
  showTireSmokeRef?: MutableRefObject<boolean>
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
  // Fired once per off-track excursion, on the falling edge when the car
  // returns to the track. The Tuning Lab's feedback survey buffers these
  // and renders one row per event so the player has hard physics evidence
  // (entry speed, steer, throttle, duration, peak speed, peak distance) to
  // rate the off-track penalty against. The race flow can ignore the prop;
  // when omitted the per-frame tracker is still active but emits to nobody.
  onOffTrackEvent?: (event: OffTrackEvent) => void
  // Fired once per lap-complete with a per-position speed trace plus all
  // off-track events captured during the lap. The Tuning Lab consumes the
  // bundle to render the speed-trace graph alongside the off-track rows.
  // Skipped when there are fewer than two recorded samples (aborted run).
  onLapTelemetry?: (telemetry: LapTelemetry) => void
  // Synchronous out-ref the parent can call to force-close any in-flight
  // off-track excursion as a final event with `exitLapMs: null`. The
  // Tuning Lab's "Stop run" button calls this from `abortDrive` so an
  // excursion that started mid-lap and was never returned from still
  // surfaces on the feedback survey instead of being silently dropped
  // when the rAF loop pauses. Returns the flushed event if the tracker
  // was active, or null when idle. The race flow ignores this ref.
  flushOffTrackEventsRef?: MutableRefObject<(() => OffTrackEvent | null) | null>

  // Fired the very first frame the player presses throttle after a fresh
  // race-start (the GO light). The argument is the elapsed milliseconds
  // between `state.raceStartMs` (seeded by `pendingRaceStartRef`) and the
  // first throttle press. Fires exactly once per race-start; the detection
  // resets on every full session restart and on the post-countdown pulse so
  // the next race produces a new measurement.
  onReactionTime?: (reactionMs: number) => void
  // Out-ref the parent can call to grab a synchronous screenshot of the
  // current scene. The function force-renders the latest scene + camera
  // before reading pixels so the buffer is always fresh, even when the
  // rAF loop is short-circuited by a pause. The returned data URL matches
  // the requested mime type (default 'image/png'); JPEG accepts a quality
  // value in [0..1]. Returns null when the canvas is unavailable or the
  // GPU read fails (e.g. cross-origin tainting after a glTF load from a
  // mismatched origin). See `src/components/PhotoMode.tsx` for the caller.
  captureScreenshotRef?: MutableRefObject<
    ((mimeType?: string, quality?: number) => string | null) | null
  >
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
  checkpoints,
  transmission = 'automatic',
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
  activeGhostMetaRef,
  ghostSourceRef,
  showGhostNameplateRef,
  showGhostGapRef,
  showPaceNotesRef,
  cameraRigRef,
  carPaintRef,
  racingNumberRef,
  headlightsOnRef,
  brakeLightModeRef,
  timeOfDayRef,
  weatherRef,
  showSkidMarksRef,
  showTireSmokeRef,
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
  onOffTrackEvent,
  onLapTelemetry,
  flushOffTrackEventsRef,
  onReactionTime,
  captureScreenshotRef,
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
  const onOffTrackEventRef = useRef(onOffTrackEvent)
  const onLapTelemetryRef = useRef(onLapTelemetry)
  const onReactionTimeRef = useRef(onReactionTime)
  const disableMusicRef = useRef(!!disableMusicIntensity)
  onLapCompleteRef.current = onLapComplete
  onHudUpdateRef.current = onHudUpdate
  onLapReplayRef.current = onLapReplay
  onCheckpointHitRef.current = onCheckpointHit
  onLapDriftBestRef.current = onLapDriftBest
  onOffTrackEventRef.current = onOffTrackEvent
  onLapTelemetryRef.current = onLapTelemetry
  onReactionTimeRef.current = onReactionTime
  disableMusicRef.current = !!disableMusicIntensity

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const path = buildTrackPath(pieces, checkpointCount, checkpoints)
    // Build the per-piece pace-notes table once per path so the rAF loop just
    // does a piece-index lookup each HUD frame. The table never changes
    // mid-race; a new pieces / checkpointCount value re-runs this effect and
    // rebuilds the table fresh.
    const paceNotesTable = buildPaceNotes(path)
    const bundle = buildScene(path)
    const renderer = new WebGLRenderer({ canvas, antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

    // Photo Mode capture hook. Force-render the latest scene + camera, then
    // immediately read the canvas pixels to a data URL inside the same JS
    // task so the WebGL drawing buffer is still valid (we did not opt into
    // preserveDrawingBuffer). The function is a pure read; it does not
    // mutate any game state. Returns null when the GPU read throws (e.g. a
    // cross-origin tainted texture).
    if (captureScreenshotRef) {
      captureScreenshotRef.current = (
        mimeType: string = 'image/png',
        quality?: number,
      ): string | null => {
        try {
          renderer.render(bundle.scene, bundle.camera)
          // toDataURL reads the back buffer immediately; combined with the
          // fresh render above this works even when paused (rAF stopped).
          return canvas.toDataURL(mimeType, quality)
        } catch {
          return null
        }
      }
    }

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

    // Racing-number plate. Same poll-and-set pattern as the paint setter:
    // the underlying mesh hook short-circuits its own canvas redraw on a
    // no-op (string-equality on the value + colors tuple), so calling it
    // every frame is cheap. We still gate at this layer on a reference
    // change so the common path is a single pointer compare. The setter is
    // safe to call before the GLB resolves; the plate is attached to the
    // outer car group which is always live.
    let lastRacingNumber: RacingNumberSetting | null | undefined = undefined
    function syncRacingNumber() {
      const next = racingNumberRef?.current ?? null
      if (next === lastRacingNumber) return
      lastRacingNumber = next
      if (next !== null) bundle.setRacingNumber(next)
    }
    syncRacingNumber()

    // Headlights toggle. The parent has already resolved the
    // HeadlightMode + active timeOfDay / weather into a plain boolean, so
    // the renderer just flips the parent group's visibility flag. Cheap
    // O(1) on no-op (single boolean compare on the cached value).
    let lastHeadlightsOn: boolean | undefined = undefined
    function syncHeadlights() {
      const next = headlightsOnRef?.current ?? false
      if (next === lastHeadlightsOn) return
      lastHeadlightsOn = next
      bundle.setHeadlights(next)
    }
    syncHeadlights()

    // Brake-light visibility. The parent passes a BrakeLightMode pick; the
    // renderer combines it with the per-frame braking predicate computed
    // inside the rAF loop (it knows the live throttle / handbrake / speed
    // before the rest of the visualization does). Cheap O(1) on no-op
    // (single boolean compare on the cached value before flipping the
    // parent group's visibility flag). The actual sync call lives inside
    // the loop because it needs the per-frame braking boolean; we cache
    // the last applied state here so the common path stays one compare.
    let lastBrakeLightsOn: boolean | undefined = undefined
    function applyBrakeLights(on: boolean) {
      if (on === lastBrakeLightsOn) return
      lastBrakeLightsOn = on
      bundle.setBrakeLights(on)
    }
    // Initial frame is unlit (the default mode is 'auto' and the player has
    // not pressed brake yet). Doing this explicitly avoids a single-frame
    // flicker if the parent group ever defaults visible somewhere down the
    // line.
    applyBrakeLights(false)

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
    const rig: CameraRigState = initCameraRig(
      state.x,
      state.z,
      state.heading,
      cameraRigRef?.current ?? undefined,
    )

    function resetRigFromState() {
      Object.assign(
        rig,
        initCameraRig(
          state.x,
          state.z,
          state.heading,
          cameraRigRef?.current ?? undefined,
        ),
      )
    }

    bundle.car.position.set(state.x, 0, state.z)
    bundle.car.rotation.y = state.heading
    applyCameraRig(bundle.camera, rig)
    renderer.render(bundle.scene, bundle.camera)

    const ghostBuild = buildGhostCar()
    const ghostMesh = ghostBuild.ghost
    ghostMesh.visible = false
    ghostMesh.position.set(state.x, 0, state.z)
    ghostMesh.rotation.y = state.heading
    bundle.scene.add(ghostMesh)

    // Floating nameplate that hovers above the ghost car. Attached as a
    // child of the ghost mesh so it inherits the ghost's world position
    // each frame without needing a separate position write. The Sprite is
    // camera-facing by construction so the plate always reads upright.
    const ghostNameplate = buildGhostNameplate()
    ghostMesh.add(ghostNameplate.group)
    // Track the last applied (meta-key, source) combo so a per-frame poll
    // is a single string compare when nothing changed.
    let lastNameplateKey: string | null = null
    let lastNameplateVisible = false

    // Per-lap recording. The buffer is interleaved [x, z, heading] triples and
    // is sampled at REPLAY_SAMPLE_MS offsets from raceStartMs so playback is a
    // constant-time array lookup. Buffer resets every time a lap completes
    // (tick.ts also resets raceStartMs at the same instant) and on full reset.
    let recordingBuffer: number[] = []
    // Parallel speed buffer. One absolute |speed| value per replay sample so
    // the post-run speed-trace graph in the Tuning Lab can plot speed against
    // either lap time or position without needing its own sampling pass.
    // Resets in lockstep with recordingBuffer.
    let speedSamples: number[] = []
    let nextSampleAt = 0

    function resetRecording() {
      recordingBuffer = []
      speedSamples = []
      nextSampleAt = 0
    }

    let raf = 0
    let lastTs = performance.now()
    let lastHudTs = 0
    let lastSkidSpawnTs = -Infinity
    let lastTireSmokeSpawnTs = -Infinity
    let running = true
    let prevHud: RaceCanvasHud | null = null
    let prevShiftDown = false
    let prevShiftUp = false
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
    // Off-track event tracker. Captures one event per excursion at the
    // off-track-to-on-track edge, plus a per-lap buffer flushed on lap
    // completion so the Tuning Lab feedback survey can render every instance.
    // Resets on lap completion, on a full reset, and on a lap-restart pulse
    // (mirrors how the drift session resets) so a teleport never carries a
    // stale active excursion forward.
    let offTrackTracker = initOffTrackTracker()
    let offTrackLapBuffer: OffTrackEvent[] = []
    // Synchronous flush hook for the Tuning Lab's "Stop run" abort path.
    // When the player stops mid-excursion the rAF loop is about to pause,
    // so an off-track event that never saw a return-to-track edge would
    // otherwise be silently dropped. The Tuning Lab calls this from its
    // abortDrive handler before pausing so the in-flight excursion gets a
    // final event with `exitLapMs: null` and shows up on the feedback
    // survey. The race flow does not touch the ref.
    if (flushOffTrackEventsRef) {
      flushOffTrackEventsRef.current = (): OffTrackEvent | null => {
        const flushed = flushOffTrackTracker(offTrackTracker)
        offTrackTracker = initOffTrackTracker()
        if (flushed) {
          offTrackLapBuffer.push(flushed)
          if (onOffTrackEventRef.current) {
            onOffTrackEventRef.current(flushed)
          }
        }
        return flushed
      }
    }
    // Hint index for the windowed ghost-gap search. Survives across HUD
    // ticks so the per-frame search stays O(W) instead of O(N). Reset on a
    // full Restart and on a lap-restart pulse so a teleport never carries a
    // stale hint into the new lap. The pure helper falls back to a wider
    // search when the hint is wrong, so even a stale value resolves cleanly.
    let ghostGapHintIdx = 0
    // Reaction-time detection. `armedRaceStartMs` holds the timestamp the
    // race actually started (set the same frame `pendingRaceStartRef` fires
    // and `state.raceStartMs` is seeded). The first frame we see throttle
    // input above the noise floor while armed, we fire `onReactionTime` with
    // the elapsed milliseconds and disarm so the next throttle press in the
    // same race does not re-fire. Reset on every full Restart so the next
    // run produces a new measurement; intentionally NOT reset on a lap
    // restart since reaction time is a per-RACE stat (the player did not
    // sit through a fresh GO light).
    let armedRaceStartMs: number | null = null

    function loop(ts: number) {
      if (!running) return

      // Reapply paint when the user picks a new swatch in Settings. Cheap:
      // the setter compares string equality and short-circuits on a no-op.
      syncPaint()
      // Same idea for the racing-number plate (value + plate / text colors).
      syncRacingNumber()
      // And the headlight assembly (visible / hidden from a single boolean).
      syncHeadlights()
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
        applyCameraRig(bundle.camera, rig)
        ghostMesh.visible = false
        ghostNameplate.setVisible(false)
        lastNameplateVisible = false
        lastNameplateKey = null
        if (carPoseOutRef) {
          carPoseOutRef.current = { x: state.x, z: state.z, heading: state.heading }
        }
        if (ghostPoseOutRef) ghostPoseOutRef.current = null
        if (speedOutRef) speedOutRef.current = 0
        resetRecording()
        bundle.skidMarks.clear()
        bundle.tireSmoke.clear()
        bundle.rain.reset()
        bundle.snow.reset()
        lastSkidSpawnTs = -Infinity
        lastTireSmokeSpawnTs = -Infinity
        renderer.render(bundle.scene, bundle.camera)
        pendingResetRef.current = false
        pendingRaceStartRef.current = null
        lastTs = ts
        prevHud = null
        prevShiftDown = false
        prevShiftUp = false
        prevOnTrack = true
        prevHitsLen = 0
        wrongWayState = initWrongWayDetector()
        driftSession = initDriftSession()
        driftLapBest = 0
        offTrackTracker = initOffTrackTracker()
        offTrackLapBuffer = []
        ghostGapHintIdx = 0
        // Disarm reaction-time detection; the next pendingRaceStartRef pulse
        // (after the post-restart countdown) re-arms it so the player gets a
        // fresh measurement on the new race.
        armedRaceStartMs = null
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
        applyCameraRig(bundle.camera, rig)
        if (carPoseOutRef) {
          carPoseOutRef.current = { x: state.x, z: state.z, heading: state.heading }
        }
        if (speedOutRef) speedOutRef.current = 0
        // Drop the in-flight recording buffer so the abandoned partial lap
        // never leaks into a future submit. Skid trails get cleared too so
        // the fresh attempt starts on a clean track surface.
        resetRecording()
        bundle.skidMarks.clear()
        bundle.tireSmoke.clear()
        lastSkidSpawnTs = -Infinity
        lastTireSmokeSpawnTs = -Infinity
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
        offTrackTracker = initOffTrackTracker()
        offTrackLapBuffer = []
        ghostGapHintIdx = 0
        prevShiftDown = false
        prevShiftUp = false
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
        // Arm reaction-time detection at the same race-start instant so the
        // next "first throttle press" frame can compute the elapsed ms. We
        // intentionally use the seeded raceStartMs (not `ts`) so a frame
        // straggler between countdown completion and the rAF tick does not
        // skew the measurement.
        armedRaceStartMs = state.raceStartMs
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
      const shiftDownPressed = k.shiftDown && !prevShiftDown
      const shiftUpPressed = k.shiftUp && !prevShiftUp
      prevShiftDown = k.shiftDown
      prevShiftUp = k.shiftUp

      // Reaction-time measurement at the GO light. Fires the first frame
      // throttle clears the noise floor after `pendingRaceStartRef` armed
      // the detector. Disarms immediately so the next throttle press in the
      // same race does not re-fire (the chip stays pinned by React state).
      if (
        armedRaceStartMs !== null &&
        onReactionTimeRef.current &&
        isReactionInputPressed(throttleInput)
      ) {
        const reactionMs = Math.max(0, Math.round(ts - armedRaceStartMs))
        armedRaceStartMs = null
        onReactionTimeRef.current(reactionMs)
      }
      // Snapshot the speed at the start of the frame (before stepPhysics
      // applies any off-track drag / cap) so the off-track tracker can record
      // the player's true approach speed on the entry frame instead of the
      // post-clamp value pinned at offTrackMaxSpeed.
      const preStepSpeed = state.speed
      // Snapshot raceStartMs before tick(): on a lap-complete frame tick()
      // resets raceStartMs to nowMs, so reading state.raceStartMs after the
      // tick would make `lapMs` jump back to ~0 and produce off-track events
      // with incorrect timestamps. Reading the pre-tick value keeps the
      // tracker on the lap clock that was in effect during the frame.
      const preStepRaceStartMs = state.raceStartMs
      const result = tick(
        state,
        {
          throttle: throttleInput,
          steer: steerInput,
          handbrake: k.handbrake,
          shiftDown: shiftDownPressed,
          shiftUp: shiftUpPressed,
        },
        dtMs,
        ts,
        path,
        paramsRef.current,
        transmission,
      )
      state = result.state

      // Brake-light glow. Resolve the live "should the rear lamps be lit"
      // boolean from the player's mode pick + the per-frame braking predicate
      // (any of: holding the brake key while moving forward, holding the
      // handbrake). Cheap on no-op (single boolean compare cached above).
      // Sits between the physics step and the rest of the visualization so
      // the lamps glow on the same frame the input lands.
      const brakeMode = brakeLightModeRef?.current ?? 'auto'
      const brakingNow = isBrakingNow(throttleInput, state.speed, k.handbrake)
      applyBrakeLights(shouldBrakeLightsLight(brakeMode, brakingNow))

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

      // Off-track event tracking. Drives the post-run feedback panel in the
      // Tuning Lab. Only sample while a lap is active; pre-race idling on
      // the start line should not emit a phantom event. The tracker is pure
      // and emits exactly one event per excursion at the off-track-to-on-
      // track edge, plus a flushed event at lap completion if the car
      // crossed the line while still off (handled in the lap-complete
      // branch below). Distance is read off the player's current piece's
      // centerline; off the path we fall back to TRACK_WIDTH/2 so the value
      // is always non-negative without faking a fake-precise number.
      //
      // The whole block is skipped when no telemetry consumer is wired
      // (race flow), so the normal per-frame cost of the worldToCell +
      // distanceToCenterline + tracker step does not apply outside the
      // Tuning Lab. We use preStepRaceStartMs so a lap-complete frame
      // (which resets state.raceStartMs to nowMs inside tick()) still
      // reads `lapMs` against the lap clock that was in effect during the
      // frame, not the freshly reseeded one.
      const offTrackTracking =
        onOffTrackEventRef.current !== undefined ||
        onLapTelemetryRef.current !== undefined ||
        flushOffTrackEventsRef !== undefined
      if (offTrackTracking && preStepRaceStartMs !== null) {
        const lapMs = ts - preStepRaceStartMs
        const cellOff = worldToCell(state.x, state.z)
        const orderIdxOff = path.cellToOrderIdx.get(
          cellKey(cellOff.row, cellOff.col),
        )
        const distFromCenter =
          orderIdxOff !== undefined
            ? distanceToCenterline(path.order[orderIdxOff], state.x, state.z)
            : Number.POSITIVE_INFINITY
        // Off the indexed path entirely (deep off-track, no piece under the
        // car this frame): fall back to TRACK_WIDTH / 2, which is the floor
        // for "off the track" and avoids under-reporting an excursion as a
        // centerline-aligned read of 0.
        const distSafe = Number.isFinite(distFromCenter)
          ? distFromCenter
          : TRACK_WIDTH / 2
        const offResult = stepOffTrackTracker(offTrackTracker, {
          onTrack: state.onTrack,
          lapMs,
          x: state.x,
          z: state.z,
          heading: state.heading,
          // Pre-step speed so the entry snapshot reads as the approach speed,
          // not the post-clamp value pinned at offTrackMaxSpeed. See the
          // tracker's docstring for the contract.
          speed: preStepSpeed,
          steer: steerInput,
          throttle: throttleInput,
          handbrake: k.handbrake,
          distanceFromCenter: distSafe,
        })
        offTrackTracker = offResult.state
        if (offResult.emitted) {
          offTrackLapBuffer.push(offResult.emitted)
          if (onOffTrackEventRef.current) {
            onOffTrackEventRef.current(offResult.emitted)
          }
        }
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
      applyCameraRig(bundle.camera, rig)

      // Sample the player's pose into the recording buffer at fixed cadence.
      // Push every sample slot we crossed this frame so a long dt does not
      // create gaps. The pre-lap-complete state's raceStartMs is what we want
      // here: tick() resets raceStartMs to nowMs the moment a lap completes,
      // and we reset the buffer in the lap-complete branch below.
      if (state.raceStartMs !== null && recordingBuffer.length / 3 < MAX_REPLAY_SAMPLES) {
        const tLap = ts - state.raceStartMs
        // Only sample speeds when a Tuning Lab telemetry consumer is wired
        // so the race flow does not pay the per-frame buffer-push cost
        // for data nobody reads. The position buffer (recordingBuffer)
        // still feeds ghost replays so it always samples.
        const collectSpeeds = onLapTelemetryRef.current !== undefined
        while (
          tLap >= nextSampleAt &&
          recordingBuffer.length / 3 < MAX_REPLAY_SAMPLES
        ) {
          recordingBuffer.push(state.x, state.z, state.heading)
          if (collectSpeeds) speedSamples.push(Math.abs(state.speed))
          nextSampleAt += REPLAY_SAMPLE_MS
        }
      }

      // Render the active ghost. Its time origin is the same raceStartMs the
      // player uses, so when tick resets raceStartMs on a finish-line crossing
      // the ghost automatically restarts from t=0 with the player.
      const replay = activeGhostRef?.current ?? null
      const showGhost = showGhostRef?.current ?? true
      let ghostVisibleThisFrame = false
      let ghostDistanceToPlayer = Number.POSITIVE_INFINITY
      if (replay && showGhost && state.raceStartMs !== null) {
        const tLap = ts - state.raceStartMs
        const pose = interpolateGhostPose(replay, tLap)
        if (pose) {
          ghostMesh.position.set(pose.x, 0, pose.z)
          ghostMesh.rotation.y = pose.heading
          ghostMesh.visible = true
          ghostVisibleThisFrame = true
          ghostDistanceToPlayer = Math.hypot(
            pose.x - state.x,
            pose.z - state.z,
          )
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

      // Sync the floating ghost nameplate. The plate is hidden whenever the
      // ghost car itself is hidden (no ghost on screen means no name to put
      // above it) or the player turned the toggle off. Otherwise the plate
      // shows the active meta tuple, fading out when the ghost is close to
      // the player so it cannot cover the player's car in chase cameras.
      const nameplateOn = showGhostNameplateRef?.current ?? true
      const nameplateOpacity =
        nameplateOpacityForDistance(ghostDistanceToPlayer)
      const wantNameplate =
        ghostVisibleThisFrame && nameplateOn && nameplateOpacity > 0
      if (wantNameplate) {
        const meta = activeGhostMetaRef?.current ?? null
        const source = ghostSourceRef?.current ?? 'auto'
        // Build a cheap key for the combined (meta, source) tuple so the
        // expensive canvas draw path runs only on a real change. The key
        // shape mirrors `nameplateCacheKey` but inlined here so we do not
        // import from sceneBuilder twice.
        const key =
          meta === null
            ? `<none>|${source}`
            : `${source}|${meta.initials}|${meta.lapTimeMs}`
        if (key !== lastNameplateKey || !lastNameplateVisible) {
          ghostNameplate.apply(meta, source)
          lastNameplateKey = key
          lastNameplateVisible = true
        }
        ghostNameplate.setOpacity(nameplateOpacity)
      } else if (lastNameplateVisible) {
        ghostNameplate.setVisible(false)
        lastNameplateVisible = false
        lastNameplateKey = null
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
        // Tire smoke puffs: a separate spawn decision because the brake-only
        // case (hard straight-line stop) should puff smoke even when the
        // skid-mark decision says no (no steering deflection). Same paired
        // rear-wheel placement as the skid layer, but the puffs rise + fade
        // off the road so the effect reads as volumetric rather than a streak.
        const showTireSmoke = showTireSmokeRef?.current ?? true
        const smokeIntensity = puffIntensity(
          skidSpeedAbs,
          paramsRef.current.maxSpeed,
          skidSteerAbs,
          brakingNow ? 1 : 0,
          state.onTrack,
        )
        const smokeDecision = shouldSpawnTireSmoke(
          smokeIntensity,
          skidSpeedAbs,
          ts - lastTireSmokeSpawnTs,
        )
        if (smokeDecision.spawn && showTireSmoke) {
          bundle.tireSmoke.spawn(
            state.x,
            state.z,
            state.heading,
            puffPeakAlpha(smokeIntensity),
            ts,
          )
          lastTireSmokeSpawnTs = ts
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
      // Tire smoke puffs share the same per-frame fade pass shape as the
      // skid mark layer, only the puff layer also advances each puff's
      // rise + scale. Cheap when nothing is active (slot-loop short-circuits
      // on the inactive flag) so dry coasting costs nothing.
      bundle.tireSmoke.tick(ts)

      // Rain particles. The layer's `tick` short-circuits when hidden so dry
      // weather costs nothing. The camera position is the follow point so the
      // rain box drifts with the player and never feels like it lags behind
      // the road. Capped to 50 ms / second steps via the same dt clamp the
      // physics tick uses, so a tab pause does not telport every drop to the
      // floor on resume.
      bundle.rain.tick(
        dtMs / 1000,
        bundle.camera.position.x,
        bundle.camera.position.y,
        bundle.camera.position.z,
      )

      // Snow particles. Same lifecycle as rain, only this layer also reads
      // wall-clock time so the per-flake sway phase advances naturally rather
      // than ticking in lockstep with the dt-clamped frame counter. The layer
      // short-circuits when hidden so non-snow weather costs nothing.
      bundle.snow.tick(
        dtMs / 1000,
        ts / 1000,
        bundle.camera.position.x,
        bundle.camera.position.y,
        bundle.camera.position.z,
      )

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
        // Force-close any in-flight off-track excursion as a final event so
        // a "left the track and crossed the line before returning" case
        // still surfaces in the per-lap buffer. Then emit the per-lap
        // telemetry envelope (positions + speeds + events) before the
        // recording buffer is reset for the next lap.
        const flushed = flushOffTrackTracker(offTrackTracker)
        if (flushed) {
          offTrackLapBuffer.push(flushed)
          if (onOffTrackEventRef.current) {
            onOffTrackEventRef.current(flushed)
          }
        }
        offTrackTracker = initOffTrackTracker()
        if (onLapTelemetryRef.current) {
          const sampleCount = recordingBuffer.length / 3
          if (sampleCount >= 2) {
            const positions: Array<[number, number]> = new Array(sampleCount)
            for (let i = 0; i < sampleCount; i++) {
              const o = i * 3
              positions[i] = [recordingBuffer[o], recordingBuffer[o + 1]]
            }
            onLapTelemetryRef.current({
              sampleMs: REPLAY_SAMPLE_MS,
              positions,
              speeds: speedSamples.slice(0, sampleCount),
              lapTimeMs: result.lapComplete.lapTimeMs,
              offTrackEvents: offTrackLapBuffer.slice(),
            })
          }
        }
        offTrackLapBuffer = []
        resetRecording()
        // Reset the ghost-gap hint: the player just crossed the finish line,
        // so the ghost replay restarts from sample 0 in lockstep. Holding a
        // stale large hint here would slow the windowed search until the
        // helper's nearest-pass widens it, but a clean zero is essentially
        // free.
        ghostGapHintIdx = 0
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
        // Live ghost gap: only computed when the chip is on AND the ghost
        // itself is on AND a replay is loaded AND the player has started
        // the lap. The pure helper short-circuits and returns null in every
        // other case so the chip slot collapses cleanly. The hint index
        // survives across HUD ticks so the per-tick search stays O(W).
        let ghostGapMsValue: number | null = null
        const gapShown = showGhostGapRef?.current ?? true
        const ghostShown = showGhostRef?.current ?? true
        const replayForGap = activeGhostRef?.current ?? null
        if (
          gapShown &&
          ghostShown &&
          replayForGap !== null &&
          state.raceStartMs !== null &&
          currentMs > 0
        ) {
          const result = ghostGapMs(
            replayForGap,
            state.x,
            state.z,
            currentMs,
            ghostGapHintIdx,
          )
          if (result) {
            ghostGapMsValue = result.gapMs
            ghostGapHintIdx = result.sampleIdx
          }
        }
        // Pace notes: resolve the upcoming track-feature call-out from the
        // player's current piece (read off `state.lastCellKey`). The look-up
        // is short-circuited when the toggle is off so a hidden chip costs
        // zero per frame. Off-track / unknown cells return null so the chip
        // hides cleanly rather than locking onto a stale call-out.
        let paceNoteValue: { text: string; accent: string } | null = null
        const paceNotesShown = showPaceNotesRef?.current ?? false
        if (paceNotesShown && paceNotesTable.length > 0) {
          const pieceIdx = path.cellToOrderIdx.get(state.lastCellKey)
          if (pieceIdx !== undefined) {
            const upcoming = lookAheadPaceNote(paceNotesTable, pieceIdx)
            if (upcoming) {
              const text = formatPaceNoteChipText(upcoming.note, upcoming.distance)
              if (text) {
                paceNoteValue = {
                  text,
                  accent: PACE_NOTE_SEVERITY_COLORS[upcoming.note.severity],
                }
              }
            }
          }
        }
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
          ghostGapMs: ghostGapMsValue,
          paceNote: paceNoteValue,
          gear: state.gear,
        }
        const prevPaceText = prevHud?.paceNote?.text ?? null
        const nextPaceText = next.paceNote?.text ?? null
        const prevPaceAccent = prevHud?.paceNote?.accent ?? null
        const nextPaceAccent = next.paceNote?.accent ?? null
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
          prevHud.driftLapBest !== next.driftLapBest ||
          prevHud.ghostGapMs !== next.ghostGapMs ||
          prevHud.gear !== next.gear ||
          prevPaceText !== nextPaceText ||
          prevPaceAccent !== nextPaceAccent
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
      ghostNameplate.dispose()
      ghostMesh.remove(ghostNameplate.group)
      ghostBuild.dispose()
      bundle.scene.remove(ghostMesh)
      bundle.dispose()
      renderer.dispose()
      if (rearRenderer) {
        rearRenderer.dispose()
        rearRenderer = null
      }
      // Detach the photo-mode hook so a stale closure cannot fire after the
      // renderer is disposed.
      if (captureScreenshotRef) {
        captureScreenshotRef.current = null
      }
      if (flushOffTrackEventsRef) {
        flushOffTrackEventsRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pieces, checkpointCount, checkpoints, transmission])

  return <canvas ref={canvasRef} className={className} style={style} />
}
