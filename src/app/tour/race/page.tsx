'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  getStandardChampionship,
  STANDARD_CHAMPIONSHIP,
} from '@/data/worldTourChampionship'
import { findTour, tourDrivers, type Tour } from '@/lib/worldTourChampionship'
import {
  createRaceSession,
  sortFinishingOrderByMs,
  stepRaceSession,
  type RaceSessionState,
} from '@/game/worldTourRaceSession'
import { type CarParams, type PhysicsInput } from '@/game/physics'
import { buildAiTrackView } from '@/game/worldTourTrackView'
import { buildRaceResult } from '@/game/worldTourRaceResult'
import { applyRaceResult } from '@/game/worldTourProgress'
import { useKeyboard } from '@/hooks/useKeyboard'
import { useControlSettings } from '@/hooks/useControlSettings'
import { useAudioSettings } from '@/hooks/useAudioSettings'
import { cameraLerpsFor } from '@/lib/controlSettings'
import type { TransmissionMode } from '@/game/transmission'
import type { BrakeLightMode } from '@/lib/brakeLights'
import type { EngineNoiseMode } from '@/lib/audioSettings'
import type { TimeOfDay } from '@/lib/lighting'
import type { Weather } from '@/lib/weather'
import { shouldHeadlightsBeOn } from '@/lib/headlights'
import {
  readCareer,
  writeCareer,
} from '@/lib/worldTourCareerStorage'
import { defaultCareer, getActiveCar } from '@/game/worldTourCareer'
import {
  baseParamsFor,
} from '@/game/worldTourCars'
import { resolveCarParams } from '@/game/worldTourUpgrades'
import { WORLD_TOUR_LAST_RESULT_KEY } from '@/lib/worldTourLastResult'
import { TouchControls } from '@/components/TouchControls'
import { PauseMenu } from '@/components/PauseMenu'
import { SettingsPane } from '@/components/SettingsPane'
import { RaceCanvas, type OpponentPose } from '@/components/RaceCanvas'
import { Countdown } from '@/components/Countdown'
import { buildTrackPath } from '@/game/trackPath'
import {
  buildRail,
  sampleRailAt,
  type WorldTourRail,
} from '@/game/worldTourRail'
import { getTrackTemplate } from '@/game/trackTemplates'
import {
  DEFAULT_CAMERA_RIG,
  type CameraRigParams,
} from '@/game/sceneBuilder'
import type { LapCompleteEvent } from '@/game/tick'
import { MOBILE_GAME_SURFACE_STYLES } from '@/lib/mobileGameSurface'

const TOTAL_LAPS = 2
const INTRO_DURATION_MS = 2000
// Lateral offset (meters) from the centerline for the alternating
// AI lanes. TRACK_WIDTH is 8 in this codebase, so 2 m places opponent
// cars firmly on each side of the centerline without scraping the
// edge of the road.
const OPPONENT_LANE_OFFSET = 2
// Distance (meters) between successive grid rows behind the start
// line. Tuned so a 12-car field fits comfortably on the back-straight
// portion of the loop without folding past corners.
const OPPONENT_GRID_SPACING_M = 6
// Stable per-car color palette for opponent cars. Picked from a high-
// contrast set so the field reads at chase-cam distance against the
// dark asphalt and against each other.
const OPPONENT_PALETTE: ReadonlyArray<number> = [
  0xff4d6d, // crimson
  0x4dabf7, // sky blue
  0xffd43b, // sunflower
  0x51cf66, // mint
  0xb197fc, // lavender
  0xff922b, // orange
  0xff8cc8, // pink
  0x63e6be, // teal
  0xffe066, // butter
  0x99e9f2, // ice
  0xfab005, // amber
]

// MVP: all tour races run on the same 3D track template. Per-track
// templates are a follow-up; the championship data still threads through
// the right `trackId`, this layer just resolves them to one shape today.
const DEFAULT_TOUR_TEMPLATE_ID = 'top-gear-opener'

export default function TourRacePage() {
  return (
    <Suspense fallback={<main style={pageStyle} />}>
      <TourRacePageInner />
    </Suspense>
  )
}

function TourRacePageInner() {
  const router = useRouter()
  const params = useSearchParams()
  const championship = useMemo(() => getStandardChampionship(), [])
  const tourId = params.get('tour') ?? ''
  const rawRaceIndex = params.get('raceIndex')
  const tour = useMemo<Tour | null>(
    () => findTour(championship, tourId),
    [championship, tourId],
  )
  const raceIndex = clampRaceIndex(rawRaceIndex, tour?.trackIds.length ?? 1)
  const { settings, setSettings, resetSettings } = useControlSettings()
  const { settings: audioSettings } = useAudioSettings()
  const keys = useKeyboard(settings.keyBindings)

  // 3D track pieces. The template is resolved at mount; a tour with a
  // missing template falls back to an empty pieces array so the canvas
  // refuses to mount instead of rendering a broken loop.
  const pieces = useMemo(() => {
    const template = getTrackTemplate(DEFAULT_TOUR_TEMPLATE_ID)
    return template?.pieces ?? []
  }, [])

  // Rail used by the opponent AI loop. Flattens the track centerline
  // into a closed polyline so each AI car can advance a single scalar
  // distance and sample (x, z, heading) at that point.
  const rail = useMemo<WorldTourRail | null>(() => {
    if (pieces.length === 0) return null
    return buildRail(buildTrackPath(pieces))
  }, [pieces])

  // Career-derived player car params. Resolved at mount and pinned for
  // the duration of the race so a mid-race upgrade purchase in another
  // tab does not change handling under the player.
  const playerParams = useMemo<CarParams>(() => {
    const career =
      typeof window !== 'undefined' ? readCareer() : defaultCareer()
    const activeCar = getActiveCar(career)
    return resolveCarParams(baseParamsFor(career.activeCarId), activeCar.upgrades)
  }, [])

  const paramsRef = useRef<CarParams>(playerParams)
  paramsRef.current = playerParams

  // Camera rig mirrored from Settings, same poll-and-set pattern as
  // Game.tsx so a slider tweak in Settings lands on the next frame.
  const cameraRigRef = useRef<CameraRigParams | null>(null)
  {
    const lerps = cameraLerpsFor(settings.camera.followSpeed)
    cameraRigRef.current = {
      ...DEFAULT_CAMERA_RIG,
      height: settings.camera.height,
      distance: settings.camera.distance,
      lookAhead: settings.camera.lookAhead,
      positionLerp: lerps.positionLerp,
      targetLerp: lerps.targetLerp,
      fov: settings.camera.fov,
    }
  }

  // Refs RaceCanvas needs to drive its internal state machine. The tour
  // page owns the pause + race-start pulse; everything else stays at the
  // canvas defaults.
  const pausedRef = useRef(false)
  const resumeShiftRef = useRef(0)
  const pendingResetRef = useRef(false)
  const pendingRaceStartRef = useRef<number | null>(null)

  // Mirror the player's tuning preferences into live refs so the tour
  // race feels identical to Time Attack. Without these, RaceCanvas
  // falls back to automatic transmission, legacy linear accel, and the
  // baseline top-speed cap regardless of what the player set in
  // Settings, which makes the car feel sluggish to anyone used to the
  // tuned defaults.
  const transmissionRef = useRef<TransmissionMode>(settings.transmission)
  transmissionRef.current = settings.transmission
  const enhancedShiftingRef = useRef<boolean>(settings.enhancedShifting)
  enhancedShiftingRef.current = settings.enhancedShifting
  const extendedTopSpeedRef = useRef<boolean>(settings.extendedTopSpeed)
  extendedTopSpeedRef.current = settings.extendedTopSpeed

  // Lighting, weather, lamps, and audio profile: same poll-and-set
  // pattern Game.tsx uses so the tour shares the visual + audio feel
  // of Time Attack.
  const timeOfDayRef = useRef<TimeOfDay | null>(settings.timeOfDay)
  timeOfDayRef.current = settings.timeOfDay
  const weatherRef = useRef<Weather | null>(settings.weather)
  weatherRef.current = settings.weather
  const headlightsOnRef = useRef<boolean>(
    shouldHeadlightsBeOn(settings.headlights, settings.timeOfDay, settings.weather),
  )
  headlightsOnRef.current = shouldHeadlightsBeOn(
    settings.headlights,
    settings.timeOfDay,
    settings.weather,
  )
  const brakeLightModeRef = useRef<BrakeLightMode>(settings.brakeLights)
  brakeLightModeRef.current = settings.brakeLights
  const engineNoiseRef = useRef<EngineNoiseMode>(audioSettings.engineNoise)
  engineNoiseRef.current = audioSettings.engineNoise

  // Trackside visuals. Kerbs and scenery are what give a corner real
  // "approach" weight on a chase camera; without them the layout reads
  // as a flat tarmac slab.
  const showKerbsRef = useRef<boolean>(settings.showKerbs)
  showKerbsRef.current = settings.showKerbs
  const showSceneryRef = useRef<boolean>(settings.showScenery)
  showSceneryRef.current = settings.showScenery
  const showSkidMarksRef = useRef<boolean>(settings.showSkidMarks)
  showSkidMarksRef.current = settings.showSkidMarks
  const showTireSmokeRef = useRef<boolean>(settings.showTireSmoke)
  showTireSmokeRef.current = settings.showTireSmoke

  const submittedRef = useRef(false)
  const lapTimesMsRef = useRef<number[]>([])

  // Opponent AI state. The session reducer is the single source of
  // truth for AI position, speed, lap count, and finishing order; the
  // rAF loop below mirrors the session's AI poses into `opponentsRef`
  // so the existing renderer pipeline draws them, and the player's
  // own pose (owned by RaceCanvas) is mirrored back into car 0 of
  // the session so the AI's follow-distance scan reads the real player
  // position. Persists across the intro card and pause toggles so the
  // session does not reset every render.
  const opponentsRef = useRef<OpponentPose[] | null>(null)
  const sessionRef = useRef<RaceSessionState | null>(null)
  const aiColorsRef = useRef<number[]>([])
  // Live player-pose channel filled by RaceCanvas every frame. We
  // mirror this into the session's car 0 before each step so the AI
  // sees the real player position.
  const playerPoseRef = useRef<{ x: number; z: number; heading: number } | null>(
    null,
  )
  const playerSpeedRef = useRef<number>(0)
  // Write channel into RaceCanvas: a per-frame world-frame displacement
  // applied to the player car so a contact kick from the multi-car
  // session actually pushes the player. Without this the player car
  // ghosts through every AI: the session bounces the AI sideways but
  // the player pose gets re-mirrored from RaceCanvas every frame.
  const pendingPlayerKickRef = useRef<{ dx: number; dz: number } | null>(null)
  const [hudPhase, setHudPhase] = useState<
    'intro' | 'countdown' | 'racing' | 'finished'
  >('intro')
  const [hudLap, setHudLap] = useState(0)
  const [paused, setPaused] = useState(false)
  // Which sub-view the pause overlay is showing. Mirrors Game.tsx's
  // pauseView state machine, scoped to the subset of views the tour
  // pause menu currently exposes (menu + settings).
  const [pauseView, setPauseView] = useState<'menu' | 'settings'>('menu')
  const [showIntro, setShowIntro] = useState(true)

  // Reset the run from scratch. Used by both the route-change effect
  // (fresh tour or race index loaded) and by the pause menu Restart
  // button. `replayIntro` controls whether the player sees the intro
  // card again (true on route change, false on a mid-race restart).
  const resetRace = useCallback(
    (replayIntro: boolean) => {
      submittedRef.current = false
      lapTimesMsRef.current = []
      setHudLap(0)
      setHudPhase('intro')
      setPaused(false)
      setShowIntro(replayIntro)
      pausedRef.current = false
      pendingRaceStartRef.current = null
      // Tell RaceCanvas to teleport the player back to the spawn and
      // restart its internal countdown. Only meaningful for a mid-race
      // restart; harmless on a route change because RaceCanvas remounts
      // anyway when `pieces` changes.
      pendingResetRef.current = true

      if (!tour || !rail) {
        sessionRef.current = null
        aiColorsRef.current = []
        opponentsRef.current = null
        return
      }
      // Seed the multi-car session. The session reducer owns the AI
      // physics, lap accounting, and finishing order so the results
      // page reflects what actually happened on the track instead of
      // a random offset. Player car is index 0; AI cars fill 1..N.
      const seed = hashSeed(tour.id, raceIndex)
      const drivers = tourDrivers(STANDARD_CHAMPIONSHIP, tour) ?? []
      const career =
        typeof window !== 'undefined' ? readCareer() : defaultCareer()
      const activeCar = getActiveCar(career)
      const session = createRaceSession({
        slotCount: tour.fieldSize,
        laneCount: tour.fieldSize <= 4 ? 2 : 3,
        aiDrivers: drivers.map((d) => ({ id: d.id })),
        seed,
        totalLaps: TOTAL_LAPS,
        // Lap rollover in the simplified session reducer uses
        // `distanceTraveled / lapDistanceMeters`, so pin this to the
        // actual rail length so the AI laps at the same cadence as the
        // player crossing the 3D finish line.
        lapDistanceMeters: rail.totalLength,
        playerCarId: career.activeCarId,
        playerInitialDamage: activeCar.damage,
        playerUpgrades: activeCar.upgrades,
        // Skip the session's own countdown; the page renders a separate
        // `<Countdown>` overlay and the rAF loop only starts stepping
        // the session once `hudPhase === 'racing'`.
        countdownSeconds: 0,
      })
      // Place each AI car along the rail behind the start line so the
      // field reads as a proper grid lined up in world coordinates,
      // not at the grid-local origin the session's `spawnGrid` returns.
      // Player slot 0 stays at the spawn point; RaceCanvas owns its
      // 3D position from there.
      for (let i = 1; i < session.cars.length; i++) {
        const car = session.cars[i]!
        // Lane offset: alternate left / right of the centerline so a
        // 2-lane field stays inside the track ribbon. Same offset
        // pattern the legacy rail-only loop used.
        const lane = (i - 1) % 2 === 0 ? -OPPONENT_LANE_OFFSET : OPPONENT_LANE_OFFSET
        const startBack = OPPONENT_GRID_SPACING_M * (Math.floor((i - 1) / 2) + 1)
        const pose = sampleRailAt(rail, -startBack, lane)
        car.physics = {
          x: pose.x,
          z: pose.z,
          heading: pose.heading,
          speed: 0,
        }
        // Seed the AI's `progress` channel so the launch-hold blend and
        // the curve-aware target speed start from the same arc-length
        // the car is physically standing at.
        if (car.aiState) {
          const wrapped = ((-startBack) % rail.totalLength + rail.totalLength) % rail.totalLength
          car.aiState = { ...car.aiState, progress: wrapped }
        }
      }
      sessionRef.current = session
      aiColorsRef.current = []
      const aiCount = session.cars.length - 1
      for (let i = 0; i < aiCount; i++) {
        aiColorsRef.current.push(OPPONENT_PALETTE[i % OPPONENT_PALETTE.length]!)
      }
      opponentsRef.current = Array.from({ length: aiCount }, () => ({
        x: 0,
        z: 0,
        heading: 0,
        color: 0xffffff,
      }))
    },
    [tour, raceIndex, rail],
  )

  // Reset run state on route param changes. Replays the intro card so
  // the player sees the tour banner before the green flag.
  useEffect(() => {
    resetRace(true)
  }, [resetRace])

  // Race-session loop: advance the full multi-car session every rAF
  // tick. The session owns AI physics, lap counting, contact damage,
  // and finishing order; this loop mirrors the player's live pose
  // (owned by RaceCanvas) into car 0 before each step so the AI's
  // follow-distance scan reads the real player position, then mirrors
  // each AI car's pose back into `opponentsRef` so the existing
  // renderer pipeline draws them. Short-circuits during the intro,
  // pause, and countdown so opponents do not race away on the static
  // "READY" screen.
  useEffect(() => {
    if (!rail) return
    const aiTrack = buildAiTrackView(rail)
    const aiStats = { topSpeed: paramsRef.current.maxSpeed }
    const neutralInput: PhysicsInput = { throttle: 0, steer: 0, handbrake: false }
    let last = performance.now()
    let raf = 0
    const loop = (now: number) => {
      raf = window.requestAnimationFrame(loop)
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const opponents = opponentsRef.current
      const session = sessionRef.current
      if (!opponents || !session) return
      const racing = !showIntro && !paused && hudPhase === 'racing'
      // Mirror the player's live pose (from RaceCanvas) into car 0 so
      // the AI's follow-distance and contact scans see the real
      // player. We do this every frame regardless of whether the
      // session is racing so the grid view also reflects the spawn
      // position the canvas placed the player at.
      const pose = playerPoseRef.current
      const car0 = session.cars[0]
      if (car0 && pose) {
        car0.physics = {
          x: pose.x,
          z: pose.z,
          heading: pose.heading,
          speed: playerSpeedRef.current,
        }
      }
      if (racing) {
        // Capture car0's position before the step so we can recover
        // any contact kick the session's per-pair scan applies. The
        // integrator part of the step is fake (neutral input, fake
        // physics for car 0 because the 3D canvas owns the real
        // player) and we overwrite it below; the kick part is what
        // we actually want to feed back to the player.
        const prePose = pose
          ? { x: pose.x, z: pose.z, heading: pose.heading }
          : null
        const next = stepRaceSession(
          session,
          { playerInput: neutralInput, dt, track: aiTrack, aiStats },
          { totalLaps: session.totalLaps, lapDistanceMeters: rail.totalLength },
        )
        // Diff car0's post-step position against the player's live
        // pose. The session integrated car0 forward by neutral input
        // (which decelerates a stationary speed=0 car by zero) plus
        // applied a lateral kick on overlap. After subtracting the
        // expected integration (with the live player speed, not the
        // session's fake decay) the remainder is the kick. Pass it
        // through to RaceCanvas so the player car physically gets
        // pushed by the AI.
        const nextCar0 = next.cars[0]
        if (nextCar0 && prePose) {
          const speed = playerSpeedRef.current
          const fwdX = Math.cos(prePose.heading)
          const fwdZ = -Math.sin(prePose.heading)
          const expectedDx = speed * fwdX * dt
          const expectedDz = speed * fwdZ * dt
          const kickDx = nextCar0.physics.x - prePose.x - expectedDx
          const kickDz = nextCar0.physics.z - prePose.z - expectedDz
          const KICK_EPSILON = 1e-3
          if (Math.abs(kickDx) > KICK_EPSILON || Math.abs(kickDz) > KICK_EPSILON) {
            const pending = pendingPlayerKickRef.current
            pendingPlayerKickRef.current = pending
              ? { dx: pending.dx + kickDx, dz: pending.dz + kickDz }
              : { dx: kickDx, dz: kickDz }
          }
        }
        // Re-mirror the player's pose. The 3D canvas is the source of
        // truth for the player so we overwrite car 0's integrated pose
        // back to the live one. The kick we extracted above is fed
        // back to the canvas via `pendingPlayerKickRef` so the player
        // car actually moves on the next 3D frame.
        if (nextCar0 && pose) {
          nextCar0.physics = {
            x: pose.x,
            z: pose.z,
            heading: pose.heading,
            speed: playerSpeedRef.current,
          }
        }
        sessionRef.current = next
      }
      // Mirror AI poses into the renderer channel.
      const liveSession = sessionRef.current
      if (!liveSession) return
      const aiCount = Math.min(opponents.length, liveSession.cars.length - 1)
      for (let i = 0; i < aiCount; i++) {
        const car = liveSession.cars[i + 1]!
        const slot = opponents[i]!
        slot.x = car.physics.x
        slot.z = car.physics.z
        slot.heading = car.physics.heading
        slot.color = aiColorsRef.current[i] ?? 0xffffff
      }
    }
    raf = window.requestAnimationFrame(loop)
    return () => window.cancelAnimationFrame(raf)
  }, [rail, showIntro, paused, hudPhase])

  // Mirror the React paused state into the live ref RaceCanvas reads
  // each frame.
  useEffect(() => {
    pausedRef.current = paused
  }, [paused])

  // Auto-dismiss the intro card after the documented duration. On
  // dismiss, fire the race-start pulse so RaceCanvas drops out of its
  // hold and begins counting elapsed time on the first throttle press.
  useEffect(() => {
    if (!showIntro) return
    const timer = window.setTimeout(() => setShowIntro(false), INTRO_DURATION_MS)
    return () => window.clearTimeout(timer)
  }, [showIntro])

  useEffect(() => {
    if (showIntro) return
    if (hudPhase !== 'intro') return
    // RaceCanvas's reset block explicitly nulls pendingRaceStartRef
    // while it's consuming a pendingReset pulse, so if we transitioned
    // into the countdown in the same React tick we just requested a
    // reset, a stray pulse could be wiped before the next frame. Poll
    // until the reset ref is clear, then show the Red/Yellow/Green
    // countdown. The countdown's onDone arms pendingRaceStartRef and
    // flips hudPhase to 'racing'.
    let cancelled = false
    const armWhenResetDone = () => {
      if (cancelled) return
      if (pendingResetRef.current) {
        window.requestAnimationFrame(armWhenResetDone)
        return
      }
      setHudPhase('countdown')
    }
    window.requestAnimationFrame(armWhenResetDone)
    return () => {
      cancelled = true
    }
  }, [showIntro, hudPhase])

  const handleCountdownDone = useCallback(() => {
    pendingRaceStartRef.current = performance.now()
    setHudPhase('racing')
  }, [])

  // Route-level controls that are not part of the shared driving key map.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return
      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
        case 'KeyS':
        case 'ArrowDown':
        case 'KeyA':
        case 'ArrowLeft':
        case 'KeyD':
        case 'ArrowRight':
        case 'Space':
          setShowIntro(false)
          break
        case 'Escape':
          setShowIntro(false)
          // If already paused (any sub-view), Esc fully resumes and resets
          // the view back to the menu so the next pause opens clean. If
          // not paused, Esc pauses. Mirrors Game.tsx's idempotent
          // pause/resume so the MenuNav Esc handler firing in parallel
          // never double-toggles us.
          if (pausedRef.current) {
            setPauseView('menu')
            setPaused(false)
          } else {
            setPaused(true)
          }
          break
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  const submitResult = useCallback(
    (totalRaceMs: number) => {
      if (submittedRef.current) return
      if (!tour) return
      const liveSession = sessionRef.current
      if (!liveSession || !rail) return
      submittedRef.current = true
      const career = readCareer()
      const aiTrack = buildAiTrackView(rail)
      const aiStats = { topSpeed: paramsRef.current.maxSpeed }
      const neutralInput: PhysicsInput = { throttle: 0, steer: 0, handbrake: false }
      // Mark the player (car 0) finished at the real lap-aggregate time
      // the 3D canvas measured. The session reducer skips finished
      // cars, so this is a one-shot mutation before the deterministic
      // wrap-up loop.
      const player = liveSession.cars[0]
      if (player && player.status === 'racing') {
        player.status = 'finished'
        player.finishedAtMs = totalRaceMs
        player.lap = liveSession.totalLaps
        if (!liveSession.finishingOrder.includes(0)) {
          liveSession.finishingOrder.push(0)
        }
        if (liveSession.cars.every((c) => c.status !== 'racing')) {
          liveSession.phase = 'finished'
        }
      }
      // Advance the remaining AI cars to completion under a fixed dt so
      // the result is deterministic per (tour, raceIndex, player time).
      // Pure-physics steps are cheap; a few thousand iterations cover
      // even a slow back-marker without burning measurable wall time.
      const FINAL_DT = 1 / 60
      const FINAL_STEP_CAP = 60 * 60 * 5 // 5 minutes of sim wall-clock
      let session: RaceSessionState = liveSession
      let steps = 0
      while (session.phase !== 'finished' && steps < FINAL_STEP_CAP) {
        session = stepRaceSession(
          session,
          { playerInput: neutralInput, dt: FINAL_DT, track: aiTrack, aiStats },
          { totalLaps: session.totalLaps, lapDistanceMeters: rail.totalLength },
        )
        steps++
      }
      // Rebuild finishingOrder by finishedAtMs ascending. The player
      // is pushed into finishingOrder externally at the top of this
      // callback (before the AI wrap-up loop), so a slow player would
      // sit at index 0 and `buildStandings` would read them as the
      // winner. The helper sorts by actual finish time so the results
      // page reflects who really got there first.
      session = sortFinishingOrderByMs(session)
      sessionRef.current = session
      const raceResult = buildRaceResult({
        finalState: session,
        career,
        championship: STANDARD_CHAMPIONSHIP,
        tourId: tour.id,
        trackIndex: raceIndex,
        playerCarId: career.activeCarId,
      })
      const applied = applyRaceResult({
        career,
        raceResult,
        championship: STANDARD_CHAMPIONSHIP,
      })
      writeCareer(applied.career)
      try {
        window.sessionStorage.setItem(
          WORLD_TOUR_LAST_RESULT_KEY,
          JSON.stringify(raceResult),
        )
      } catch {
        // best effort
      }
      router.push('/tour/results')
    },
    [router, tour, raceIndex, rail],
  )

  const handleLapComplete = useCallback(
    (event: LapCompleteEvent) => {
      lapTimesMsRef.current.push(event.lapTimeMs)
      setHudLap(event.lapNumber)
      if (event.lapNumber >= TOTAL_LAPS) {
        const total = lapTimesMsRef.current.reduce((a, b) => a + b, 0)
        setHudPhase('finished')
        submitResult(total)
      }
    },
    [submitResult],
  )

  const handleHud = useCallback(() => {
    // Tour HUD is currently driven by lap-complete events and the
    // speed-ref poll below; the rich HUD payload from RaceCanvas is
    // unused for now. Required by the prop contract.
  }, [])

  const handleResume = useCallback(() => {
    setPauseView('menu')
    setPaused(false)
  }, [])
  const handleRestart = useCallback(() => {
    resetRace(false)
  }, [resetRace])
  const handleQuit = useCallback(() => {
    router.push('/tour/garage')
  }, [router])
  const handleOpenSettings = useCallback(() => setPauseView('settings'), [])
  const handleCloseSettings = useCallback(() => setPauseView('menu'), [])
  const handleTuningLab = useCallback(() => {
    router.push('/tune')
  }, [router])

  if (!tour) {
    return (
      <main style={pageStyle}>
        <div style={stageStyle}>
          <h1>Unknown tour</h1>
          <Link href="/tour" style={backLinkStyle}>Back to tours</Link>
        </div>
      </main>
    )
  }

  if (pieces.length === 0) {
    return (
      <main style={pageStyle}>
        <div style={stageStyle}>
          <h1>Track unavailable</h1>
          <p>Default tour track template is missing.</p>
          <Link href="/tour" style={backLinkStyle}>Back to tours</Link>
        </div>
      </main>
    )
  }

  return (
    <main style={pageStyle} data-testid="world-tour-race-page">
      <div style={stageStyle}>
        <header style={headerStyle}>
          <div>
            <h1 style={titleStyle}>{tour.name}</h1>
            <p style={tagStyle}>
              Race {raceIndex + 1} of {tour.trackIds.length} | Lap{' '}
              {Math.min(hudLap + 1, TOTAL_LAPS)}/{TOTAL_LAPS}
            </p>
          </div>
        </header>

        <div
          style={canvasStyle}
          data-testid="world-tour-race-canvas"
        >
          <RaceCanvas
            pieces={pieces}
            paramsRef={paramsRef}
            keys={keys}
            pausedRef={pausedRef}
            resumeShiftRef={resumeShiftRef}
            pendingResetRef={pendingResetRef}
            pendingRaceStartRef={pendingRaceStartRef}
            cameraRigRef={cameraRigRef}
            transmissionRef={transmissionRef}
            enhancedShiftingRef={enhancedShiftingRef}
            extendedTopSpeedRef={extendedTopSpeedRef}
            timeOfDayRef={timeOfDayRef}
            weatherRef={weatherRef}
            headlightsOnRef={headlightsOnRef}
            brakeLightModeRef={brakeLightModeRef}
            engineNoiseRef={engineNoiseRef}
            showKerbsRef={showKerbsRef}
            showSceneryRef={showSceneryRef}
            showSkidMarksRef={showSkidMarksRef}
            showTireSmokeRef={showTireSmokeRef}
            opponentsRef={opponentsRef}
            carPoseOutRef={playerPoseRef}
            speedOutRef={playerSpeedRef}
            pendingPlayerKickRef={pendingPlayerKickRef}
            onLapComplete={handleLapComplete}
            onHudUpdate={handleHud}
            disableMusicIntensity
            style={raceCanvasInnerStyle}
          />
        </div>

        {showIntro ? (
          <button
            type="button"
            style={{
              ...introOverlayStyle,
              background: `linear-gradient(135deg, ${tour.theme.secondary}cc 0%, ${tour.theme.primary}99 100%)`,
            }}
            onClick={() => setShowIntro(false)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' && e.key !== ' ') return
              e.preventDefault()
              e.stopPropagation()
              setShowIntro(false)
            }}
          >
            <div style={introTitleStyle}>{tour.name}</div>
            <div style={introMetaStyle}>
              {tour.region} | Race {raceIndex + 1} of {tour.trackIds.length}
              {' '}| {tour.weather}
            </div>
            <div style={introMetaStyle}>
              Top {tour.requiredStanding} in championship after {tour.trackIds.length} races
            </div>
          </button>
        ) : null}

        {hudPhase === 'countdown' && !paused ? (
          <Countdown onDone={handleCountdownDone} />
        ) : null}

        <TouchControls
          keys={keys}
          enabled={!showIntro && !paused && hudPhase !== 'finished'}
          mode={settings.touchMode}
        />
        {!showIntro && hudPhase !== 'finished' && !paused ? (
          <button
            type="button"
            onClick={() => setPaused(true)}
            aria-label="Pause World Tour race"
            aria-pressed={false}
            style={pauseButtonStyle}
          >
            II
          </button>
        ) : null}
        {paused && hudPhase !== 'finished' ? (
          pauseView === 'settings' ? (
            <SettingsPane
              settings={settings}
              onChange={setSettings}
              onClose={handleCloseSettings}
              onReset={resetSettings}
              inRace
            />
          ) : (
            <PauseMenu
              onResume={handleResume}
              onRestart={handleRestart}
              onSettings={handleOpenSettings}
              onTuningLab={handleTuningLab}
              onExit={handleQuit}
              exitLabel="Exit to garage"
              pieces={pieces}
            />
          )
        ) : null}
      </div>
    </main>
  )
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

function clampRaceIndex(raw: string | null, trackCount: number): number {
  const parsed = Number(raw ?? '0')
  if (!Number.isFinite(parsed)) return 0
  const max = Math.max(0, Math.floor(trackCount) - 1)
  return Math.min(max, Math.max(0, Math.floor(parsed)))
}

function hashSeed(tourId: string, raceIndex: number): number {
  let h = 0x811c9dc5
  const s = `${tourId}:${raceIndex}`
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

const pageStyle: React.CSSProperties = {
  ...MOBILE_GAME_SURFACE_STYLES,
  minHeight: '100dvh',
  padding: 0,
  background: '#080612',
  color: '#fff',
  fontFamily: 'system-ui, sans-serif',
}
const stageStyle: React.CSSProperties = {
  position: 'relative',
  width: '100%',
  height: '100%',
  overflow: 'hidden',
}
const headerStyle: React.CSSProperties = {
  position: 'fixed',
  top: 12,
  left: 12,
  right: 12,
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: 12,
  zIndex: 10,
  pointerEvents: 'none',
}
const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 'clamp(16px, 4vw, 22px)',
  fontWeight: 700,
  textShadow: '0 2px 10px rgba(0,0,0,0.7)',
}
const tagStyle: React.CSSProperties = {
  margin: '4px 0 0',
  fontSize: 'clamp(11px, 3vw, 13px)',
  opacity: 0.85,
  textShadow: '0 2px 10px rgba(0,0,0,0.7)',
}
const canvasStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  width: '100%',
  height: '100%',
  display: 'block',
  zIndex: 1,
}
const raceCanvasInnerStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  height: '100%',
}
const backLinkStyle: React.CSSProperties = {
  color: 'rgba(255,255,255,0.65)',
  textDecoration: 'none',
  pointerEvents: 'auto',
}
const introOverlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  width: '100%',
  height: '100%',
  border: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  borderRadius: 8,
  cursor: 'pointer',
  textAlign: 'center',
  color: '#fff',
  font: 'inherit',
  padding: 24,
  zIndex: 30,
  touchAction: 'manipulation',
}
const introTitleStyle: React.CSSProperties = {
  fontSize: 'clamp(28px, 10vw, 54px)',
  fontWeight: 800,
  letterSpacing: 1,
}
const introMetaStyle: React.CSSProperties = {
  fontSize: 'clamp(13px, 4vw, 16px)',
  opacity: 0.9,
}
const pauseButtonStyle: React.CSSProperties = {
  position: 'fixed',
  left: 20,
  bottom: 'calc(28px + env(safe-area-inset-bottom, 0px))',
  width: 64,
  height: 64,
  borderRadius: '50%',
  border: '2px solid rgba(255,255,255,0.25)',
  background: 'rgba(0,0,0,0.6)',
  color: '#fff',
  display: 'grid',
  placeItems: 'center',
  fontSize: 24,
  fontWeight: 900,
  boxShadow: '0 6px 18px rgba(0,0,0,0.45)',
  zIndex: 20,
  touchAction: 'manipulation',
}
