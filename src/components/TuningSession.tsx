'use client'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import {
  ASPECTS,
  CONTROL_TYPE_LABELS,
  TRACK_TAG_LABELS,
  createDefaultDamping,
  makeSavedTuning,
  makeTuningId,
  persistLabLastLoaded,
  recommendNextParams,
  upsertTuning,
  TUNING_LAB_SYNTHETIC_SLUG,
  type AspectRatings,
  type ControlType,
  type Damping,
  type ParamDeltas,
  type RoundLog,
  type SavedTuning,
  type TrackTag,
} from '@/lib/tuningLab'
import {
  applyContinuousSuggestion,
  suggestContinuousTuningTweaks,
  type ContinuousSuggestion,
} from '@/lib/continuousTuning'
import { useTuningRecorder } from '@/hooks/useTuningRecorder'
import { TUNING_HISTORY_DEBOUNCE_MS } from '@/lib/tuningHistory'
import { TUNING_PARAM_META } from '@/lib/tuningSettings'
import { TUNING_LAB_TRACK_PIECES } from '@/lib/tuningLabTrack'
import { useKeyboard } from '@/hooks/useKeyboard'
import { useGamepad } from '@/hooks/useGamepad'
import { useControlSettings } from '@/hooks/useControlSettings'
import { useAudioSettings } from '@/hooks/useAudioSettings'
import { cameraLerpsFor } from '@/lib/controlSettings'
import { MOBILE_GAME_SURFACE_STYLES } from '@/lib/mobileGameSurface'
import type { TimeOfDay } from '@/lib/lighting'
import type { Weather } from '@/lib/weather'
import { shouldHeadlightsBeOn } from '@/lib/headlights'
import type { BrakeLightMode } from '@/lib/brakeLights'
import type { CameraRigParams } from '@/game/sceneBuilder'
import { Countdown } from './Countdown'
import { TouchControls } from './TouchControls'
import { RaceCanvas, type RaceCanvasHud } from './RaceCanvas'
import { TuningFeedbackForm } from './TuningFeedbackForm'
import { TuningEditor } from './TuningEditor'
import type { CarParams } from '@/game/physics'
import type { LapCompleteEvent } from '@/game/tick'
import type { LapTelemetry, OffTrackEvent } from '@/game/offTrackEvents'

export type SessionDoneReason = 'saved' | 'discarded'

interface Props {
  initialParams: CarParams
  initialControlType: ControlType
  initialTrackTags: TrackTag[]
  onSaved: (saved: SavedTuning, rounds: RoundLog[]) => void
  onDiscard: (rounds: RoundLog[]) => void
}

type Phase =
  | 'intro'
  | 'countdown'
  | 'drive'
  | 'continuous'
  | 'feedback'
  | 'recommend'
  | 'save'

const TAG_OPTIONS: TrackTag[] = ['twisty', 'fast', 'mixed', 'technical']
const CONTROL_OPTIONS: ControlType[] = [
  'keyboard',
  'touch_single',
  'touch_dual',
]

export function TuningSession({
  initialParams,
  initialControlType,
  initialTrackTags,
  onSaved,
  onDiscard,
}: Props) {
  const { settings } = useControlSettings()
  const { settings: audioSettings } = useAudioSettings()
  const keys = useKeyboard(settings.keyBindings)
  const { record: recordTuningChange } = useTuningRecorder()
  // Gamepad polling shares the same KeyInput ref so analog axes feed straight
  // into RaceCanvas. The Tuning Lab has no pause concept, so the toggle
  // callback is a no-op. The user's saved bindings are applied here as well so
  // a controller rebind in Settings carries into the lab.
  useGamepad(keys, undefined, settings.gamepadBindings)

  const [phase, setPhase] = useState<Phase>('intro')
  const [params, setParams] = useState<CarParams>(initialParams)
  const [damping, setDamping] = useState<Damping>(createDefaultDamping)
  const [prevDeltas, setPrevDeltas] = useState<ParamDeltas>({})
  const [rounds, setRounds] = useState<RoundLog[]>([])
  const [pendingRound, setPendingRound] = useState<{
    lapTimeMs: number | null
    offTrackEvents: OffTrackEvent[]
    telemetry: LapTelemetry | null
  } | null>(null)
  const [pendingRecommendation, setPendingRecommendation] = useState<{
    ratings: AspectRatings
    notes: string
    nextParams: CarParams
    perParamDelta: ParamDeltas
  } | null>(null)
  // Continuous-tuning suggestions for the current lap freeze. Computed from
  // the pending round's telemetry the moment the lap completes; cleared the
  // moment the player picks one or skips.
  const [continuousSuggestions, setContinuousSuggestions] = useState<
    ContinuousSuggestion[]
  >([])
  // Running count of laps completed in continuous mode so the freeze panel
  // can show "After lap N" without relying on RaceCanvas's HUD state (which
  // resets between laps).
  const [continuousLapCount, setContinuousLapCount] = useState(0)
  const [controlType, setControlType] = useState<ControlType>(
    initialControlType,
  )
  const [trackTags, setTrackTags] = useState<TrackTag[]>(initialTrackTags)
  const [hud, setHud] = useState<RaceCanvasHud>({
    currentMs: 0,
    lapCount: 0,
    onTrack: true,
    lastLapMs: null,
    wrongWay: false,
    driftActive: false,
    driftScore: 0,
    driftMultiplier: 1,
    driftLapBest: 0,
    ghostGapMs: null,
    paceNote: null,
    gear: 1,
    gearProgress: 0,
  })
  const [saveName, setSaveName] = useState('')

  const paramsRef = useRef<CarParams>(params)
  paramsRef.current = params
  // Auto-save state: a single in-progress SavedTuning entry per session.
  // The id is minted once on mount and reused by both the debounced
  // auto-save effect and the explicit commitSave path so naming a session
  // updates the same row instead of creating a duplicate. The default
  // name anchors the session's birth timestamp so it stays stable across
  // writes and is easy to recognise in the saved-tunings list.
  const sessionIdRef = useRef<string>(makeTuningId())
  const defaultNameRef = useRef<string>(
    `Lab session ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`,
  )
  // didMutateRef gates the auto-save effect: it stays false until params
  // diverge from initialParams, so a user who lands in Intro and bails
  // without driving leaves no library row behind.
  const didMutateRef = useRef<boolean>(false)
  const autoSaveTimerRef = useRef<number | null>(null)
  const pausedRef = useRef(false)
  const resumeShiftRef = useRef(0)
  // Wall-clock at the moment the in-drive sliders panel opened. The
  // canvas's rAF loop bails early while pausedRef is true but does not
  // shift its lap clock, so on resume we feed the elapsed pause delta
  // into resumeShiftRef. Mirrors the Game.tsx pause/resume pattern.
  const driveSlidersPauseStartRef = useRef<number | null>(null)
  const [driveSlidersOpen, setDriveSlidersOpen] = useState(false)
  const pendingResetRef = useRef(false)
  const pendingRaceStartRef = useRef<number | null>(null)
  // Per-lap telemetry buffers. The off-track event ref accumulates as the
  // car leaves and returns to the track during the active lap; the
  // telemetry ref captures the per-lap envelope (positions + speeds + final
  // event list) the canvas emits at lap completion. Both clear on lap
  // capture, on countdown start, on a mid-run restart, and on abort so a
  // fresh attempt never inherits stale data.
  const offTrackEventsRef = useRef<OffTrackEvent[]>([])
  const lastTelemetryRef = useRef<LapTelemetry | null>(null)
  // Synchronous flush hook the canvas installs while mounted. abortDrive
  // calls it to force-close any in-flight off-track excursion as a final
  // event before the rAF loop pauses, so the feedback survey reflects the
  // run faithfully even when the player hits Stop run while still off the
  // track. Null when the canvas is not mounted or the renderer torn down.
  const flushOffTrackEventsRef = useRef<(() => OffTrackEvent | null) | null>(
    null,
  )
  // Mirror the player's chosen camera rig into the lab so the practice loop
  // matches the view they will race with.
  const cameraRigRef = useRef<CameraRigParams | null>(null)
  {
    const lerps = cameraLerpsFor(settings.camera.followSpeed)
    cameraRigRef.current = {
      height: settings.camera.height,
      distance: settings.camera.distance,
      lookAhead: settings.camera.lookAhead,
      positionLerp: lerps.positionLerp,
      targetLerp: lerps.targetLerp,
      cameraForward: settings.camera.cameraForward,
      targetHeight: settings.camera.targetHeight,
      fov: settings.camera.fov,
    }
  }
  // Same idea for car paint: the lab car wears the player's chosen color.
  const carPaintRef = useRef<string | null>(settings.carPaint)
  carPaintRef.current = settings.carPaint
  // And the racing-number plate, so the lab car wears the player's chosen
  // plate decal too.
  const racingNumberRef = useRef(settings.racingNumber)
  racingNumberRef.current = settings.racingNumber
  // And the time-of-day lighting preset, so the lab matches the race scene.
  const timeOfDayRef = useRef<TimeOfDay | null>(settings.timeOfDay)
  timeOfDayRef.current = settings.timeOfDay
  // And the weather preset, so the lab gets the same fog / sky tint as the
  // race scene.
  const weatherRef = useRef<Weather | null>(settings.weather)
  weatherRef.current = settings.weather
  // Headlights: resolve from the player's HeadlightMode pick + the lab's
  // active scene (no track mood in the lab, so it reads the player's own
  // timeOfDay / weather directly). Keeps the lab car visually consistent with
  // the race car so a player who flips the lamps on at night sees them in
  // both contexts.
  const headlightsOn = shouldHeadlightsBeOn(
    settings.headlights,
    settings.timeOfDay,
    settings.weather,
  )
  const headlightsOnRef = useRef<boolean>(headlightsOn)
  headlightsOnRef.current = headlightsOn
  // Brake-light mode pick. The renderer combines this with its own per-frame
  // braking detection so the rear lamps glow on the same frame the player
  // touches the brake. Mirrors `headlightsOn` from the race renderer so the
  // lab car visually matches the race car.
  const brakeLightModeRef = useRef<BrakeLightMode>(settings.brakeLights)
  brakeLightModeRef.current = settings.brakeLights
  const engineNoiseRef = useRef(audioSettings.engineNoise)
  engineNoiseRef.current = audioSettings.engineNoise
  // Mirror the experimental drive-feel flags so the Tuning Lab runs the
  // same car the player races in Game. Without this, tuning sliders are
  // evaluated against the legacy baseline regardless of Settings.
  const enhancedShiftingRef = useRef<boolean>(settings.enhancedShifting)
  enhancedShiftingRef.current = settings.enhancedShifting
  const extendedTopSpeedRef = useRef<boolean>(settings.extendedTopSpeed)
  extendedTopSpeedRef.current = settings.extendedTopSpeed
  const phaseRef = useRef<Phase>(phase)
  phaseRef.current = phase

  const handleHud = useCallback((next: RaceCanvasHud) => {
    setHud(next)
  }, [])

  const handleLapComplete = useCallback((event: LapCompleteEvent) => {
    if (phaseRef.current !== 'drive') return
    // Snapshot whatever was sampled this lap, clear the refs for the next
    // attempt, and freeze the rAF loop while the continuous-tuning panel
    // shows the player up to a few A/B suggestions to choose from. The
    // classic Likert feedback survey still exists but only fires when the
    // player ends the session.
    const pending = {
      lapTimeMs: event.lapTimeMs,
      offTrackEvents: offTrackEventsRef.current.slice(),
      telemetry: lastTelemetryRef.current,
    }
    setPendingRound(pending)
    offTrackEventsRef.current = []
    lastTelemetryRef.current = null
    pausedRef.current = true
    const suggestions = suggestContinuousTuningTweaks({
      params: paramsRef.current,
      lapTimeMs: pending.lapTimeMs,
      offTrackEvents: pending.offTrackEvents,
      telemetry: pending.telemetry,
    })
    setContinuousSuggestions(suggestions)
    setContinuousLapCount((n) => n + 1)
    setPhase('continuous')
  }, [])

  const handleOffTrackEvent = useCallback((event: OffTrackEvent) => {
    offTrackEventsRef.current.push(event)
  }, [])

  const handleLapTelemetry = useCallback((telemetry: LapTelemetry) => {
    lastTelemetryRef.current = telemetry
  }, [])

  function startCountdown() {
    pausedRef.current = false
    pendingResetRef.current = true
    pendingRaceStartRef.current = null
    setPendingRound(null)
    offTrackEventsRef.current = []
    lastTelemetryRef.current = null
    setHud({
      currentMs: 0,
      lapCount: 0,
      onTrack: true,
      lastLapMs: null,
      wrongWay: false,
      driftActive: false,
      driftScore: 0,
      driftMultiplier: 1,
      driftLapBest: 0,
      ghostGapMs: null,
      paceNote: null,
      gear: 1,
      gearProgress: 0,
    })
    setPhase('countdown')
  }

  function onCountdownDone() {
    pendingRaceStartRef.current = performance.now()
    setPhase('drive')
  }

  function abortDrive() {
    // Force-close any in-flight excursion before the rAF loop pauses so
    // the feedback survey shows it. The canvas's flush hook re-emits the
    // event through `onOffTrackEvent`, which has already pushed it into
    // `offTrackEventsRef.current` by the time the call returns. Snapshot
    // after the flush.
    flushOffTrackEventsRef.current?.()
    // The canvas only emits a per-lap telemetry envelope at lap-complete,
    // and `lastTelemetryRef` is cleared on lap capture / countdown /
    // restart, so `telemetry` is always null on abort. The feedback form
    // renders the "No telemetry recorded" placeholder in that case.
    setPendingRound({
      lapTimeMs: null,
      offTrackEvents: offTrackEventsRef.current.slice(),
      telemetry: null,
    })
    offTrackEventsRef.current = []
    lastTelemetryRef.current = null
    pausedRef.current = true
    setPhase('feedback')
  }

  function onFeedbackSubmit(ratings: AspectRatings, notes: string) {
    const result = recommendNextParams(params, ratings, prevDeltas, damping)
    setPendingRecommendation({
      ratings,
      notes,
      nextParams: result.next,
      perParamDelta: result.perParamDelta,
    })
    setRounds((prev) => [
      ...prev,
      {
        params,
        ratings,
        notes,
        lapTimeMs: pendingRound?.lapTimeMs ?? null,
        offTrackEvents: pendingRound?.offTrackEvents,
        telemetry: pendingRound?.telemetry ?? undefined,
      },
    ])
    setPrevDeltas(result.perParamDelta)
    setDamping(result.newDamping)
    setPhase('recommend')
  }

  function onFeedbackCancel() {
    flushAutoSave()
    onDiscard(rounds)
  }

  function applyRecommendationAndDriveAgain() {
    if (!pendingRecommendation) return
    setParams(pendingRecommendation.nextParams)
    recordTuningChange({
      next: pendingRecommendation.nextParams,
      source: 'recommended',
      label: 'Lab recommendation',
      slug: TUNING_LAB_SYNTHETIC_SLUG,
      immediate: true,
    })
    setPendingRecommendation(null)
    startCountdown()
  }

  function acceptContinuousSuggestion(suggestion: ContinuousSuggestion) {
    const nextParams = applyContinuousSuggestion(params, suggestion.delta)
    setParams(nextParams)
    recordTuningChange({
      next: nextParams,
      source: 'recommended',
      label: suggestion.title,
      slug: TUNING_LAB_SYNTHETIC_SLUG,
      immediate: true,
    })
    setContinuousSuggestions([])
    startCountdown()
  }

  function skipContinuousSuggestion() {
    setContinuousSuggestions([])
    startCountdown()
  }

  function endContinuousSessionToFeedback() {
    // Continuous mode keeps a live snapshot of the lap that just completed
    // (pendingRound) and the cumulative params from any accepted picks. The
    // classic survey reads both, so the End-session pick lands the player
    // straight in the Likert form for the most recent lap.
    setContinuousSuggestions([])
    pausedRef.current = true
    setPhase('feedback')
  }

  const handleManualParamsChange = useCallback(
    (next: CarParams) => {
      setParams(next)
      recordTuningChange({
        next,
        source: 'slider',
        label: 'Manual slider tweak',
        slug: TUNING_LAB_SYNTHETIC_SLUG,
      })
    },
    [recordTuningChange],
  )

  function openDriveSliders() {
    if (driveSlidersOpen) return
    // Only meaningful during the drive phase; freeze panels manage their
    // own paused state.
    if (phaseRef.current !== 'drive') return
    driveSlidersPauseStartRef.current = performance.now()
    pausedRef.current = true
    setDriveSlidersOpen(true)
  }

  function closeDriveSliders() {
    if (!driveSlidersOpen) return
    if (driveSlidersPauseStartRef.current !== null) {
      resumeShiftRef.current +=
        performance.now() - driveSlidersPauseStartRef.current
      driveSlidersPauseStartRef.current = null
    }
    // Only flip pausedRef back to false if we're still in the drive
    // phase. If a lap completed while the player was tweaking (it can't,
    // because the loop is paused), or the player navigated away through
    // another control path, we don't want to silently resume.
    if (phaseRef.current === 'drive') pausedRef.current = false
    setDriveSlidersOpen(false)
  }

  function gotoSave() {
    if (!pendingRecommendation) return
    setSaveName('')
    setPhase('save')
  }

  function discardSession() {
    flushAutoSave()
    onDiscard(rounds)
  }

  function commitSave() {
    if (!pendingRecommendation) return
    const finalRound: RoundLog = {
      params,
      ratings: pendingRecommendation.ratings,
      notes: pendingRecommendation.notes,
      lapTimeMs: pendingRound?.lapTimeMs ?? null,
      offTrackEvents: pendingRound?.offTrackEvents,
      telemetry: pendingRound?.telemetry ?? undefined,
    }
    const saved = makeSavedTuning({
      id: sessionIdRef.current,
      name: saveName.trim() || defaultNameRef.current,
      round: finalRound,
      controlType,
      trackTags,
    })
    if (autoSaveTimerRef.current !== null) {
      window.clearTimeout(autoSaveTimerRef.current)
      autoSaveTimerRef.current = null
    }
    upsertTuning(saved)
    onSaved(saved, [...rounds])
  }

  // Reset pause/state-related refs whenever leaving drive phase to avoid
  // stale references mutating the next mount of RaceCanvas.
  useEffect(() => {
    if (phase !== 'drive' && phase !== 'countdown') {
      pausedRef.current = true
    }
  }, [phase])

  // Snapshot the lab's live params into lastLoaded on every change so an
  // unsaved session still carries its most-recent setup forward when the
  // user leaves the lab. The initial write is a no-op (initialParams already
  // came from the same key) but keeps the contract simple.
  useEffect(() => {
    persistLabLastLoaded(params)
  }, [params])

  // Auto-save the live session as a single in-progress SavedTuning entry,
  // keyed by sessionIdRef so commitSave updates the same row instead of
  // creating a duplicate. We treat any session progress as worth saving:
  // a tweaked param, a completed lap (rounds), an in-flight feedback
  // round, or a pending recommendation. Pure intro-only abandons leave
  // no row in the library because none of those signals have fired.
  useEffect(() => {
    const hasProgress =
      rounds.length > 0 ||
      pendingRound !== null ||
      pendingRecommendation !== null ||
      params !== initialParams
    if (!didMutateRef.current && !hasProgress) return
    didMutateRef.current = true
    if (autoSaveTimerRef.current !== null) {
      window.clearTimeout(autoSaveTimerRef.current)
    }
    autoSaveTimerRef.current = window.setTimeout(() => {
      autoSaveTimerRef.current = null
      const saved = makeSavedTuning({
        id: sessionIdRef.current,
        name: defaultNameRef.current,
        round: buildAutoSaveRound(),
        controlType,
        trackTags,
      })
      upsertTuning(saved)
    }, TUNING_HISTORY_DEBOUNCE_MS)
    return () => {
      if (autoSaveTimerRef.current !== null) {
        window.clearTimeout(autoSaveTimerRef.current)
        autoSaveTimerRef.current = null
      }
    }
    // buildAutoSaveRound is a per-render closure that reads the latest
    // session state; including it would re-create the timer on every render
    // and defeat the debounce. initialParams is intentionally read via the
    // ref-equality gate, not as a dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, controlType, trackTags, rounds, pendingRound, pendingRecommendation])

  // Cancel any pending debounced auto-save and write the current snapshot
  // synchronously. Called on discard / feedback-cancel paths so the latest
  // params land in the library even when the component is about to unmount.
  function flushAutoSave() {
    if (autoSaveTimerRef.current !== null) {
      window.clearTimeout(autoSaveTimerRef.current)
      autoSaveTimerRef.current = null
    }
    if (!didMutateRef.current) return
    const saved = makeSavedTuning({
      id: sessionIdRef.current,
      name: defaultNameRef.current,
      round: buildAutoSaveRound(),
      controlType,
      trackTags,
    })
    upsertTuning(saved)
  }

  function buildAutoSaveRound(): RoundLog {
    const last = rounds.at(-1)
    if (last) {
      return {
        params,
        ratings: last.ratings,
        notes: last.notes,
        lapTimeMs: last.lapTimeMs,
        offTrackEvents: last.offTrackEvents,
        telemetry: last.telemetry,
      }
    }
    return {
      params,
      ratings: {},
      notes: '',
      lapTimeMs: null,
    }
  }

  function restartCurrentRun() {
    pausedRef.current = false
    pendingResetRef.current = true
    pendingRaceStartRef.current = null
    setPendingRound(null)
    offTrackEventsRef.current = []
    lastTelemetryRef.current = null
    setHud({
      currentMs: 0,
      lapCount: 0,
      onTrack: true,
      lastLapMs: null,
      wrongWay: false,
      driftActive: false,
      driftScore: 0,
      driftMultiplier: 1,
      driftLapBest: 0,
      ghostGapMs: null,
      paceNote: null,
      gear: 1,
      gearProgress: 0,
    })
    setPhase('countdown')
  }

  // Keep the canvas mounted under the continuous-tuning freeze panel so the
  // background scene reads as a paused race instead of a hard cut to a menu.
  // pausedRef stops the rAF loop while the overlay is up.
  const showCanvas =
    phase === 'countdown' || phase === 'drive' || phase === 'continuous'

  return (
    <div style={shell}>
      {phase === 'intro' ? (
        <IntroView
          controlType={controlType}
          trackTags={trackTags}
          onChangeControl={setControlType}
          onToggleTag={(tag) =>
            setTrackTags((prev) =>
              prev.includes(tag)
                ? prev.filter((t) => t !== tag)
                : prev.length < 4
                  ? [...prev, tag]
                  : prev,
            )
          }
          onStart={startCountdown}
          onCancel={() => onDiscard(rounds)}
        />
      ) : null}

      {showCanvas ? (
        <div style={driveLayer}>
          <RaceCanvas
            pieces={TUNING_LAB_TRACK_PIECES}
            paramsRef={paramsRef}
            keys={keys}
            pausedRef={pausedRef}
            resumeShiftRef={resumeShiftRef}
            pendingResetRef={pendingResetRef}
            pendingRaceStartRef={pendingRaceStartRef}
            onLapComplete={handleLapComplete}
            onOffTrackEvent={handleOffTrackEvent}
            onLapTelemetry={handleLapTelemetry}
            flushOffTrackEventsRef={flushOffTrackEventsRef}
            onHudUpdate={handleHud}
            cameraRigRef={cameraRigRef}
            carPaintRef={carPaintRef}
            racingNumberRef={racingNumberRef}
            headlightsOnRef={headlightsOnRef}
            brakeLightModeRef={brakeLightModeRef}
            engineNoiseRef={engineNoiseRef}
            enhancedShiftingRef={enhancedShiftingRef}
            extendedTopSpeedRef={extendedTopSpeedRef}
            timeOfDayRef={timeOfDayRef}
            weatherRef={weatherRef}
            disableMusicIntensity
            style={canvasStyle}
          />
          <DriveHud hud={hud} />
          <TouchControls
            keys={keys}
            enabled={phase === 'drive' && !driveSlidersOpen}
            mode={settings.touchMode}
          />
          {phase === 'drive' ? (
            <div style={driveActions}>
              <button
                onClick={restartCurrentRun}
                style={driveActionBtn}
                aria-label="Restart run"
              >
                Restart
              </button>
              <button
                onClick={openDriveSliders}
                style={driveActionBtn}
                aria-label="Open tuning sliders"
              >
                Tuning
              </button>
              <button
                onClick={abortDrive}
                style={driveActionBtn}
                aria-label="End session"
              >
                End session
              </button>
            </div>
          ) : null}
          {driveSlidersOpen ? (
            <div
              style={continuousOverlay}
              role="dialog"
              aria-label="Tuning sliders"
            >
              <div style={continuousCard}>
                <div style={continuousHeader}>
                  <span style={continuousLap}>TUNING</span>
                  <span style={continuousLapTime}>paused</span>
                </div>
                <h2 style={cardTitle}>All tuning sliders</h2>
                <p style={cardCopy}>
                  Sliders apply to the live car. The lap clock is paused while
                  this panel is open. Close to resume driving.
                </p>
                <TuningEditor
                  params={params}
                  onChange={handleManualParamsChange}
                  onClose={closeDriveSliders}
                  closeLabel="Resume"
                  hint="Sliders apply to the live car."
                />
              </div>
            </div>
          ) : null}
          {phase === 'countdown' ? <Countdown onDone={onCountdownDone} /> : null}
          {phase === 'continuous' ? (
            <ContinuousSuggestView
              lapNumber={continuousLapCount}
              lapTimeMs={pendingRound?.lapTimeMs ?? null}
              offTrackCount={pendingRound?.offTrackEvents?.length ?? 0}
              suggestions={continuousSuggestions}
              params={params}
              onParamsChange={handleManualParamsChange}
              onAccept={acceptContinuousSuggestion}
              onSkip={skipContinuousSuggestion}
              onEndSession={endContinuousSessionToFeedback}
            />
          ) : null}
        </div>
      ) : null}

      {phase === 'feedback' ? (
        <div style={formScroll}>
          <TuningFeedbackForm
            lapTimeMs={pendingRound?.lapTimeMs ?? null}
            offTrackEvents={pendingRound?.offTrackEvents ?? []}
            telemetry={pendingRound?.telemetry ?? null}
            params={params}
            pieces={TUNING_LAB_TRACK_PIECES}
            onSubmit={onFeedbackSubmit}
            onCancel={onFeedbackCancel}
          />
        </div>
      ) : null}

      {phase === 'recommend' && pendingRecommendation ? (
        <RecommendView
          oldParams={params}
          newParams={pendingRecommendation.nextParams}
          deltas={pendingRecommendation.perParamDelta}
          ratings={pendingRecommendation.ratings}
          onDriveAgain={applyRecommendationAndDriveAgain}
          onSave={gotoSave}
          onDiscard={discardSession}
        />
      ) : null}

      {phase === 'save' && pendingRecommendation ? (
        <SaveView
          name={saveName}
          controlType={controlType}
          trackTags={trackTags}
          onChangeName={setSaveName}
          onChangeControl={setControlType}
          onToggleTag={(tag) =>
            setTrackTags((prev) =>
              prev.includes(tag)
                ? prev.filter((t) => t !== tag)
                : prev.length < 4
                  ? [...prev, tag]
                  : prev,
            )
          }
          onSave={commitSave}
          onBack={() => setPhase('recommend')}
        />
      ) : null}
    </div>
  )
}

function IntroView({
  controlType,
  trackTags,
  onChangeControl,
  onToggleTag,
  onStart,
  onCancel,
}: {
  controlType: ControlType
  trackTags: TrackTag[]
  onChangeControl: (c: ControlType) => void
  onToggleTag: (t: TrackTag) => void
  onStart: () => void
  onCancel: () => void
}) {
  return (
    <div style={card}>
      <h2 style={cardTitle}>New tuning session</h2>
      <p style={cardCopy}>
        Drive a short curated loop with straights, turns, an S-curve, and a
        hairpin. After every lap the lab freezes and shows a few small tuning
        tweaks drawn from how you actually drove the lap. Pick one, skip, and
        keep driving. End the session when you are done to rate the lap and
        save the setup.
      </p>

      <div style={cardLabel}>Control</div>
      <div style={chipRow}>
        {CONTROL_OPTIONS.map((c) => (
          <button
            key={c}
            onClick={() => onChangeControl(c)}
            style={{
              ...chip,
              background: controlType === c ? '#ff6b35' : '#1d1d1d',
            }}
          >
            {CONTROL_TYPE_LABELS[c]}
          </button>
        ))}
      </div>

      <div style={cardLabel}>Track type tags (up to 4)</div>
      <div style={chipRow}>
        {TAG_OPTIONS.map((t) => {
          const active = trackTags.includes(t)
          return (
            <button
              key={t}
              onClick={() => onToggleTag(t)}
              style={{ ...chip, background: active ? '#ff6b35' : '#1d1d1d' }}
            >
              {TRACK_TAG_LABELS[t]}
            </button>
          )
        })}
      </div>

      <div style={ctaRow}>
        <button onClick={onCancel} style={secondaryBtn}>
          Back
        </button>
        <button onClick={onStart} style={primaryBtn}>
          Start drive
        </button>
      </div>
    </div>
  )
}

function DriveHud({ hud }: { hud: RaceCanvasHud }) {
  const sec = (hud.currentMs / 1000).toFixed(2)
  const last = hud.lastLapMs !== null ? (hud.lastLapMs / 1000).toFixed(2) : null
  return (
    <div style={driveHud}>
      <div style={driveHudRow}>
        <span style={driveHudKey}>TIME</span>
        <span style={driveHudVal}>{sec}s</span>
      </div>
      <div style={driveHudRow}>
        <span style={driveHudKey}>LAP</span>
        <span style={driveHudVal}>{hud.lapCount}</span>
      </div>
      {last ? (
        <div style={driveHudRow}>
          <span style={driveHudKey}>LAST</span>
          <span style={driveHudVal}>{last}s</span>
        </div>
      ) : null}
      {hud.wrongWay ? (
        <div style={wrongWayBadge}>WRONG WAY</div>
      ) : !hud.onTrack ? (
        <div style={offTrackBadge}>OFF TRACK</div>
      ) : null}
    </div>
  )
}

function RecommendView({
  oldParams,
  newParams,
  deltas,
  ratings,
  onDriveAgain,
  onSave,
  onDiscard,
}: {
  oldParams: CarParams
  newParams: CarParams
  deltas: ParamDeltas
  ratings: AspectRatings
  onDriveAgain: () => void
  onSave: () => void
  onDiscard: () => void
}) {
  const allGood = useMemo(() => {
    return ASPECTS.every((a) => {
      const r = ratings[a.id]
      return r === null || r === undefined || r === 3
    })
  }, [ratings])

  return (
    <div style={card}>
      <h2 style={cardTitle}>Recommendation</h2>
      <p style={cardCopy}>
        {allGood
          ? 'Every rated aspect was just right. You can save this setup as is, or drive it again to confirm.'
          : 'Based on your ratings, here is the suggested next setup. The lab dampens any param that flips direction across rounds.'}
      </p>

      <div style={diffTable}>
        {TUNING_PARAM_META.map((m) => {
          const oldV = oldParams[m.key]
          const newV = newParams[m.key]
          const d = deltas[m.key] ?? newV - oldV
          if (Math.abs(newV - oldV) < 1e-6) return null
          return (
            <div key={m.key} style={diffRow}>
              <span style={diffLabel}>{m.label}</span>
              <span style={diffNums}>
                {oldV.toFixed(2)} <Arrow up={d > 0} /> {newV.toFixed(2)}{' '}
                <span style={diffUnit}>{m.unit}</span>
              </span>
            </div>
          )
        })}
        {Object.keys(deltas).length === 0 ? (
          <div style={diffEmpty}>No parameter changes.</div>
        ) : null}
      </div>

      <div style={ctaCol}>
        <button onClick={onDriveAgain} style={primaryBtn}>
          Drive again with these params
        </button>
        <button onClick={onSave} style={secondaryBtn}>
          {allGood ? 'Save and exit' : 'Save anyway and exit'}
        </button>
        <button onClick={onDiscard} style={dangerBtn}>
          Discard session
        </button>
      </div>
    </div>
  )
}

function ContinuousSuggestView({
  lapNumber,
  lapTimeMs,
  offTrackCount,
  suggestions,
  params,
  onParamsChange,
  onAccept,
  onSkip,
  onEndSession,
}: {
  lapNumber: number
  lapTimeMs: number | null
  offTrackCount: number
  suggestions: ContinuousSuggestion[]
  params: CarParams
  onParamsChange: (next: CarParams) => void
  onAccept: (s: ContinuousSuggestion) => void
  onSkip: () => void
  onEndSession: () => void
}) {
  const [slidersOpen, setSlidersOpen] = useState(false)
  const lapStr =
    lapTimeMs !== null ? `${(lapTimeMs / 1000).toFixed(2)}s` : 'lap pending'
  return (
    <div style={continuousOverlay} role="dialog" aria-label="Tuning suggestions">
      <div style={continuousCard}>
        <div style={continuousHeader}>
          <span style={continuousLap}>LAP {lapNumber}</span>
          <span style={continuousLapTime}>{lapStr}</span>
          {offTrackCount > 0 ? (
            <span style={continuousOffBadge}>
              {offTrackCount}x off-track
            </span>
          ) : (
            <span style={continuousCleanBadge}>clean lap</span>
          )}
        </div>
        <h2 style={cardTitle}>
          {suggestions.length === 0
            ? 'Nothing to tweak'
            : 'Pick a tuning tweak'}
        </h2>
        <p style={cardCopy}>
          {suggestions.length === 0
            ? 'That lap looked clean. No recommendations this round. Drive another or end the session.'
            : 'Based on how you drove that lap, choose one nudge to apply, or skip to drive the same setup again.'}
        </p>

        {suggestions.length > 0 ? (
          <div style={suggestionList}>
            {suggestions.map((s, i) => (
              <button
                key={s.id}
                onClick={() => onAccept(s)}
                style={suggestionRow}
                aria-label={`Apply: ${s.title}`}
              >
                <div style={suggestionRowHead}>
                  <span style={suggestionLetter}>
                    {String.fromCharCode(65 + i)}
                  </span>
                  <span style={suggestionTitle}>{s.title}</span>
                </div>
                <div style={suggestionReason}>{s.reason}</div>
                <div style={suggestionDeltaRow}>
                  {Object.keys(s.delta).map((k) => {
                    const key = k as keyof CarParams
                    const meta = TUNING_PARAM_META.find((m) => m.key === key)
                    if (!meta) return null
                    const d = s.delta[key] ?? 0
                    const up = d > 0
                    return (
                      <span key={k} style={suggestionDeltaChip}>
                        {meta.label} <Arrow up={up} />{' '}
                        {(up ? '+' : '') + d.toFixed(2)} {meta.unit}
                      </span>
                    )
                  })}
                </div>
              </button>
            ))}
          </div>
        ) : null}

        <button
          onClick={() => setSlidersOpen((v) => !v)}
          style={slidersToggle}
          aria-expanded={slidersOpen}
          aria-controls="continuous-sliders-region"
        >
          <span style={slidersChevron} aria-hidden>
            {slidersOpen ? 'v' : '>'}
          </span>
          {slidersOpen ? 'Hide all tuning sliders' : 'Show all tuning sliders'}
        </button>
        {slidersOpen ? (
          <div id="continuous-sliders-region" style={slidersRegion}>
            <TuningEditor
              params={params}
              onChange={onParamsChange}
              onClose={() => setSlidersOpen(false)}
              closeLabel="Done"
              hint="Sliders apply to the live car. Drive the next lap to feel them."
            />
          </div>
        ) : null}

        <div style={ctaCol}>
          <button onClick={onSkip} style={primaryBtn}>
            No change, drive again
          </button>
          <button onClick={onEndSession} style={secondaryBtn}>
            End session and review
          </button>
        </div>
      </div>
    </div>
  )
}

function Arrow({ up }: { up: boolean }) {
  return (
    <span
      aria-hidden
      style={{ color: up ? '#5fe08a' : '#ff8a8a', fontWeight: 700 }}
    >
      {up ? '↑' : '↓'}
    </span>
  )
}

function SaveView({
  name,
  controlType,
  trackTags,
  onChangeName,
  onChangeControl,
  onToggleTag,
  onSave,
  onBack,
}: {
  name: string
  controlType: ControlType
  trackTags: TrackTag[]
  onChangeName: (s: string) => void
  onChangeControl: (c: ControlType) => void
  onToggleTag: (t: TrackTag) => void
  onSave: () => void
  onBack: () => void
}) {
  return (
    <div style={card}>
      <h2 style={cardTitle}>Save tuning</h2>
      <div style={cardLabel}>Name</div>
      <input
        value={name}
        onChange={(e) => onChangeName(e.target.value.slice(0, 48))}
        placeholder="Mobile twisty, dual stick"
        style={textField}
      />

      <div style={cardLabel}>Control</div>
      <div style={chipRow}>
        {CONTROL_OPTIONS.map((c) => (
          <button
            key={c}
            onClick={() => onChangeControl(c)}
            style={{
              ...chip,
              background: controlType === c ? '#ff6b35' : '#1d1d1d',
            }}
          >
            {CONTROL_TYPE_LABELS[c]}
          </button>
        ))}
      </div>

      <div style={cardLabel}>Track type tags</div>
      <div style={chipRow}>
        {TAG_OPTIONS.map((t) => {
          const active = trackTags.includes(t)
          return (
            <button
              key={t}
              onClick={() => onToggleTag(t)}
              style={{ ...chip, background: active ? '#ff6b35' : '#1d1d1d' }}
            >
              {TRACK_TAG_LABELS[t]}
            </button>
          )
        })}
      </div>

      <div style={ctaRow}>
        <button onClick={onBack} style={secondaryBtn}>
          Back
        </button>
        <button onClick={onSave} style={primaryBtn} disabled={name.trim() === ''}>
          Save
        </button>
      </div>
    </div>
  )
}

const shell: CSSProperties = {
  position: 'relative',
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'stretch',
}
const driveLayer: CSSProperties = {
  ...MOBILE_GAME_SURFACE_STYLES,
  background: '#9ad8ff',
  zIndex: 5,
}
const canvasStyle: CSSProperties = {
  display: 'block',
  width: '100%',
  height: '100%',
}
const driveHud: CSSProperties = {
  position: 'fixed',
  top: 12,
  right: 12,
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  background: 'rgba(0,0,0,0.55)',
  color: 'white',
  padding: '10px 14px',
  borderRadius: 10,
  zIndex: 10,
  fontFamily: 'system-ui, sans-serif',
  fontSize: 14,
}
const driveHudRow: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 16,
  fontFamily: 'monospace',
}
const driveHudKey: CSSProperties = {
  opacity: 0.6,
  letterSpacing: 1,
  fontSize: 11,
}
const driveHudVal: CSSProperties = {
  fontWeight: 700,
}
const offTrackBadge: CSSProperties = {
  background: '#ff8a3c',
  color: '#1a1a1a',
  fontSize: 11,
  fontWeight: 800,
  padding: '4px 8px',
  borderRadius: 6,
  textAlign: 'center',
  letterSpacing: 1,
}
const wrongWayBadge: CSSProperties = {
  background: '#d32f2f',
  color: '#fff5d6',
  fontSize: 11,
  fontWeight: 800,
  padding: '4px 8px',
  borderRadius: 6,
  textAlign: 'center',
  letterSpacing: 1,
  border: '1px solid rgba(255, 240, 180, 0.85)',
}
const driveActions: CSSProperties = {
  position: 'fixed',
  left: 16,
  bottom: 20,
  display: 'flex',
  gap: 8,
  zIndex: 20,
}
const driveActionBtn: CSSProperties = {
  background: 'rgba(0,0,0,0.55)',
  color: 'white',
  border: 'none',
  borderRadius: 999,
  padding: '10px 16px',
  fontSize: 13,
  cursor: 'pointer',
  fontFamily: 'inherit',
}
const formScroll: CSSProperties = {
  width: '100%',
  display: 'flex',
  justifyContent: 'center',
  padding: 16,
}
const card: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  padding: 18,
  background: '#1d1d1d',
  border: '1px solid #2a2a2a',
  borderRadius: 12,
  color: 'white',
  width: '100%',
  maxWidth: 520,
  margin: '0 auto',
}
const cardTitle: CSSProperties = {
  margin: 0,
  fontSize: 22,
  fontWeight: 800,
  letterSpacing: 1,
}
const cardCopy: CSSProperties = {
  margin: 0,
  fontSize: 13,
  opacity: 0.8,
  lineHeight: 1.4,
}
const cardLabel: CSSProperties = {
  fontSize: 11,
  letterSpacing: 1.4,
  textTransform: 'uppercase',
  opacity: 0.7,
  marginTop: 4,
}
const chipRow: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
}
const chip: CSSProperties = {
  background: '#1d1d1d',
  color: 'white',
  border: '1px solid #2a2a2a',
  borderRadius: 999,
  padding: '8px 12px',
  fontSize: 12,
  cursor: 'pointer',
  fontFamily: 'inherit',
}
const ctaRow: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 8,
  marginTop: 6,
}
const ctaCol: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  marginTop: 6,
}
const primaryBtn: CSSProperties = {
  background: '#ff6b35',
  color: 'white',
  border: 'none',
  borderRadius: 8,
  padding: '12px 18px',
  fontSize: 15,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'inherit',
}
const secondaryBtn: CSSProperties = {
  background: 'transparent',
  color: '#cfcfcf',
  border: '1px solid #3a3a3a',
  borderRadius: 8,
  padding: '12px 18px',
  fontSize: 14,
  cursor: 'pointer',
  fontFamily: 'inherit',
}
const dangerBtn: CSSProperties = {
  background: 'transparent',
  color: '#ff8a8a',
  border: '1px solid #553030',
  borderRadius: 8,
  padding: '10px 16px',
  fontSize: 13,
  cursor: 'pointer',
  fontFamily: 'inherit',
}
const diffTable: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  padding: 8,
  background: '#0e0e0e',
  borderRadius: 8,
  border: '1px solid #2a2a2a',
  marginTop: 6,
}
const diffRow: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  fontSize: 12,
  fontFamily: 'monospace',
  padding: '4px 6px',
}
const diffLabel: CSSProperties = {
  opacity: 0.85,
}
const diffNums: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
}
const diffUnit: CSSProperties = {
  opacity: 0.5,
}
const diffEmpty: CSSProperties = {
  fontSize: 12,
  opacity: 0.6,
  fontStyle: 'italic',
  padding: 8,
}
const textField: CSSProperties = {
  background: '#0e0e0e',
  color: 'white',
  border: '1px solid #3a3a3a',
  borderRadius: 8,
  padding: '10px 12px',
  fontFamily: 'inherit',
  fontSize: 14,
}
const continuousOverlay: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.55)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
  zIndex: 30,
  fontFamily: 'system-ui, sans-serif',
}
const continuousCard: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  padding: 18,
  background: '#1d1d1d',
  border: '1px solid #2a2a2a',
  borderRadius: 12,
  color: 'white',
  width: '100%',
  maxWidth: 540,
  maxHeight: '90vh',
  overflowY: 'auto',
  boxShadow: '0 10px 40px rgba(0,0,0,0.55)',
}
const continuousHeader: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontFamily: 'monospace',
  fontSize: 12,
}
const continuousLap: CSSProperties = {
  background: '#ff6b35',
  color: 'white',
  padding: '4px 8px',
  borderRadius: 6,
  fontWeight: 700,
  letterSpacing: 1,
}
const continuousLapTime: CSSProperties = {
  color: 'white',
  fontWeight: 700,
  fontSize: 14,
}
const continuousOffBadge: CSSProperties = {
  marginLeft: 'auto',
  background: '#552d2d',
  color: '#ff9a9a',
  padding: '4px 8px',
  borderRadius: 6,
  fontSize: 11,
  letterSpacing: 0.5,
  textTransform: 'uppercase',
}
const continuousCleanBadge: CSSProperties = {
  marginLeft: 'auto',
  background: '#1f3f29',
  color: '#5fe08a',
  padding: '4px 8px',
  borderRadius: 6,
  fontSize: 11,
  letterSpacing: 0.5,
  textTransform: 'uppercase',
}
const suggestionList: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
}
const suggestionRow: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  padding: 12,
  background: '#0e0e0e',
  border: '1px solid #3a3a3a',
  borderLeft: '3px solid #ff6b35',
  borderRadius: 8,
  textAlign: 'left',
  color: 'white',
  cursor: 'pointer',
  fontFamily: 'inherit',
}
const suggestionRowHead: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
}
const suggestionLetter: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 24,
  height: 24,
  borderRadius: 6,
  background: '#ff6b35',
  color: 'white',
  fontWeight: 800,
  fontSize: 13,
  letterSpacing: 0,
}
const suggestionTitle: CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
}
const suggestionReason: CSSProperties = {
  fontSize: 12,
  opacity: 0.8,
  lineHeight: 1.4,
}
const suggestionDeltaRow: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
  fontFamily: 'monospace',
  fontSize: 11,
}
const suggestionDeltaChip: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '3px 8px',
  background: '#1d1d1d',
  border: '1px solid #3a3a3a',
  borderRadius: 999,
  color: '#cfcfcf',
}
const slidersToggle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '10px 12px',
  background: '#0e0e0e',
  border: '1px solid #3a3a3a',
  borderRadius: 8,
  color: '#cfcfcf',
  fontFamily: 'inherit',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  textAlign: 'left',
}
const slidersChevron: CSSProperties = {
  display: 'inline-block',
  width: 14,
  textAlign: 'center',
  fontFamily: 'monospace',
  color: '#ff8a3c',
}
const slidersRegion: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  padding: 8,
  background: '#0a0a0a',
  border: '1px solid #2a2a2a',
  borderRadius: 8,
}
