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
  type RaceSessionState,
} from '@/game/worldTourRaceSession'
import { type CarParams } from '@/game/physics'
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
import {
  MenuButton,
  MenuOverlay,
  MenuPanel,
  MenuTitle,
} from '@/components/MenuUI'
import { RaceCanvas, type OpponentPose } from '@/components/RaceCanvas'
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
  const { settings } = useControlSettings()
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

  // Opponent AI state. One entry per AI rival; persists across the
  // intro card and pause toggles so progress on the rail does not
  // reset every render.
  const opponentsRef = useRef<OpponentPose[] | null>(null)
  const aiStateRef = useRef<
    { progress: number; speedMps: number; lateralM: number; color: number }[]
  >([])
  // Live speed channel RaceCanvas writes every frame. The footer reads
  // it via a 4 Hz rAF loop so the bottom-left readout matches the main
  // game's km/h convention without re-rendering React 60 times per
  // second.
  const speedRef = useRef<number>(0)

  const [hudPhase, setHudPhase] = useState<'intro' | 'racing' | 'finished'>(
    'intro',
  )
  const [hudLap, setHudLap] = useState(0)
  const [speedKmh, setSpeedKmh] = useState(0)
  const [paused, setPaused] = useState(false)
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

      if (!tour) {
        aiStateRef.current = []
        opponentsRef.current = null
        return
      }
      // Seed the AI field: one car per non-player grid slot, with a
      // stable lane offset and a per-car target speed derived from the
      // tour+race seed so an identical run reproduces an identical
      // field shape. Player slot (index 0) is intentionally absent --
      // the player drives the real car via RaceCanvas.
      const seed = hashSeed(tour.id, raceIndex)
      const rng = mulberry32(seed)
      const palette = OPPONENT_PALETTE
      const aiCount = Math.max(0, tour.fieldSize - 1)
      const state: typeof aiStateRef.current = []
      for (let i = 0; i < aiCount; i++) {
        // Alternate lanes so the field reads as a real grid, not a
        // conga line. Lane half-width is set so a 2-lane oval fits two
        // cars side-by-side inside the track ribbon (TRACK_WIDTH = 8).
        const lane = i % 2 === 0 ? -OPPONENT_LANE_OFFSET : OPPONENT_LANE_OFFSET
        // Stagger starts a few meters back so the field reads as a
        // grid lined up behind the start line at race-go.
        const startBack = OPPONENT_GRID_SPACING_M * (Math.floor(i / 2) + 1)
        // Per-car target speed in [16, 23] m/s. Below maxSpeed (26)
        // so the player can pass them with a clean lap.
        const speedMps = 16 + rng() * 7
        state.push({
          progress: -startBack,
          speedMps,
          lateralM: lane,
          color: palette[i % palette.length]!,
        })
      }
      aiStateRef.current = state
      opponentsRef.current = state.map(() => ({
        x: 0,
        z: 0,
        heading: 0,
        color: 0xffffff,
      }))
    },
    [tour, raceIndex],
  )

  // Reset run state on route param changes. Replays the intro card so
  // the player sees the tour banner before the green flag.
  useEffect(() => {
    resetRace(true)
  }, [resetRace])

  // AI loop: advance each opponent along the rail by `speed * dt` so
  // they read as racing the track in front of / alongside the player.
  // The loop runs at rAF cadence and short-circuits while paused or
  // before the player has dismissed the intro so opponents do not
  // race away during the static "READY" screen.
  useEffect(() => {
    if (!rail) return
    let last = performance.now()
    let raf = 0
    const loop = (now: number) => {
      raf = window.requestAnimationFrame(loop)
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const opponents = opponentsRef.current
      const ai = aiStateRef.current
      if (!opponents || opponents.length !== ai.length) return
      // Hold opponents on the grid until the player has dropped the
      // intro card. Same gate the player's race-start pulse uses.
      const racing = !showIntro && !paused && hudPhase !== 'finished'
      for (let i = 0; i < ai.length; i++) {
        const car = ai[i]!
        if (racing) {
          car.progress += car.speedMps * dt
        }
        const pose = sampleRailAt(rail, car.progress, car.lateralM)
        const slot = opponents[i]!
        slot.x = pose.x
        slot.z = pose.z
        // SampledPoint headings already match the main game's
        // state.heading convention (0 = +X east, PI/2 = -Z north),
        // which is exactly what bundle.car.rotation.y wants. No
        // conversion needed.
        slot.heading = pose.heading
        slot.color = car.color
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
    pendingRaceStartRef.current = performance.now()
    setHudPhase('racing')
  }, [showIntro, hudPhase])

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
          setPaused((v) => !v)
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
      submittedRef.current = true
      const career = readCareer()
      const finalState = synthesizeFinalState({
        tour,
        raceIndex,
        playerCarId: career.activeCarId,
        playerTotalMs: totalRaceMs,
      })
      const raceResult = buildRaceResult({
        finalState,
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
    [router, tour, raceIndex],
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
    setPaused(false)
  }, [])
  const handleRestart = useCallback(() => {
    resetRace(false)
  }, [resetRace])
  const handleQuit = useCallback(() => {
    router.push('/tour')
  }, [router])

  // Poll the live speed ref at 4 Hz so the bottom-left readout stays
  // in sync without re-rendering on every frame.
  useEffect(() => {
    const id = window.setInterval(() => {
      setSpeedKmh(Math.round(Math.abs(speedRef.current) * 3.6))
    }, 250)
    return () => window.clearInterval(id)
  }, [])

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
          <div style={hudStyle}>
            {hudPhase === 'intro' ? (
              <span>READY</span>
            ) : hudPhase === 'racing' ? (
              <span>{paused ? 'PAUSED' : 'GO'}</span>
            ) : (
              <span>Finishing...</span>
            )}
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
            onLapComplete={handleLapComplete}
            onHudUpdate={handleHud}
            speedOutRef={speedRef}
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
              Top {tour.requiredStanding} of {tour.fieldSize} to clear
            </div>
          </button>
        ) : null}

        <footer style={footerStyle}>
          <span>
            Drive with keyboard, touch, or mapped controls
            <br />
            <small>{speedKmh} km/h</small>
          </span>
          <Link href="/tour" style={backLinkStyle}>Quit race</Link>
        </footer>
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
          <MenuOverlay zIndex={100} onBack={handleResume}>
            <MenuPanel>
              <MenuTitle>PAUSED</MenuTitle>
              <div style={menuButtonStackStyle}>
                <MenuButton variant="primary" onClick={handleResume}>
                  Resume
                </MenuButton>
                <MenuButton onClick={handleRestart}>
                  Restart race
                </MenuButton>
                <MenuButton onClick={handleQuit}>
                  Quit to tours
                </MenuButton>
              </div>
            </MenuPanel>
          </MenuOverlay>
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

// Build a synthetic RaceSessionState in the 'finished' phase so the
// existing race-result builder can compute placement, points, and purse
// without a parallel multi-car simulation. The 3D player race is the
// source of truth for the player's lap time; AI cars get deterministic
// seeded offsets so finishing order is stable per tour+race.
function synthesizeFinalState(args: {
  tour: Tour
  raceIndex: number
  playerCarId: string
  playerTotalMs: number
}): RaceSessionState {
  const drivers = tourDrivers(STANDARD_CHAMPIONSHIP, args.tour) ?? []
  const seed = hashSeed(args.tour.id, args.raceIndex)
  const state = createRaceSession({
    slotCount: args.tour.fieldSize,
    laneCount: args.tour.fieldSize <= 4 ? 2 : 3,
    aiDrivers: drivers.map((d) => ({ id: d.id })),
    seed,
    totalLaps: TOTAL_LAPS,
    lapDistanceMeters: 300,
    playerCarId: args.playerCarId,
  })
  // Mutate the freshly-seeded state into a finished race. The player's
  // time comes from their actual 3D laps; AI cars get deterministic
  // offsets around the player so placement varies per tour without
  // running a parallel sim. Negative deltas put an AI ahead of the
  // player; positive deltas put them behind.
  const rng = mulberry32(seed)
  state.phase = 'finished'
  state.elapsedMs = args.playerTotalMs
  state.finishingOrder = []
  for (let i = 0; i < state.cars.length; i++) {
    const car = state.cars[i]!
    car.status = 'finished'
    if (car.isPlayer) {
      car.finishedAtMs = args.playerTotalMs
    } else {
      // Per-car offset in [-10s, +15s] around the player; the slight
      // upward bias means a clean run usually beats half the field.
      const delta = (rng() - 0.4) * 25_000
      car.finishedAtMs = Math.max(1000, args.playerTotalMs + delta)
    }
    car.lap = TOTAL_LAPS
  }
  state.finishingOrder = state.cars
    .map((c) => c.index)
    .slice()
    .sort((a, b) => {
      const aMs = state.cars[a]!.finishedAtMs ?? Number.POSITIVE_INFINITY
      const bMs = state.cars[b]!.finishedAtMs ?? Number.POSITIVE_INFINITY
      return aMs - bMs
    })
  return state
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

function mulberry32(seed: number): () => number {
  let t = seed >>> 0
  return () => {
    t = (t + 0x6d2b79f5) >>> 0
    let r = t
    r = Math.imul(r ^ (r >>> 15), r | 1)
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

const pageStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  minHeight: '100dvh',
  overflow: 'hidden',
  padding: 0,
  background: '#080612',
  color: '#fff',
  fontFamily: 'system-ui, sans-serif',
  touchAction: 'none',
  WebkitUserSelect: 'none',
  userSelect: 'none',
  WebkitTouchCallout: 'none',
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
const hudStyle: React.CSSProperties = {
  minWidth: 74,
  padding: '8px 10px',
  borderRadius: 8,
  background: 'rgba(0,0,0,0.5)',
  border: '1px solid rgba(255,255,255,0.18)',
  fontSize: 14,
  fontWeight: 700,
  textAlign: 'center',
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
const footerStyle: React.CSSProperties = {
  position: 'fixed',
  left: 12,
  right: 12,
  bottom: 'calc(12px + env(safe-area-inset-bottom, 0px))',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 12,
  fontSize: 12,
  opacity: 0.85,
  zIndex: 10,
  pointerEvents: 'none',
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
const menuButtonStackStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  marginTop: 18,
  width: '100%',
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
