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
  type AspectRatings,
  type ControlType,
  type Damping,
  type ParamDeltas,
  type RoundLog,
  type SavedTuning,
  type TrackTag,
} from '@/lib/tuningLab'
import { TUNING_PARAM_META } from '@/lib/tuningSettings'
import { TUNING_LAB_TRACK_PIECES } from '@/lib/tuningLabTrack'
import { useKeyboard } from '@/hooks/useKeyboard'
import { useControlSettings } from '@/hooks/useControlSettings'
import { Countdown } from './Countdown'
import { TouchControls } from './TouchControls'
import { RaceCanvas, type RaceCanvasHud } from './RaceCanvas'
import { TuningFeedbackForm } from './TuningFeedbackForm'
import type { CarParams } from '@/game/physics'
import type { LapCompleteEvent } from '@/game/tick'

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
  const keys = useKeyboard(settings.keyBindings)

  const [phase, setPhase] = useState<Phase>('intro')
  const [params, setParams] = useState<CarParams>(initialParams)
  const [damping, setDamping] = useState<Damping>(createDefaultDamping)
  const [prevDeltas, setPrevDeltas] = useState<ParamDeltas>({})
  const [rounds, setRounds] = useState<RoundLog[]>([])
  const [pendingRound, setPendingRound] = useState<{
    lapTimeMs: number | null
  } | null>(null)
  const [pendingRecommendation, setPendingRecommendation] = useState<{
    ratings: AspectRatings
    notes: string
    nextParams: CarParams
    perParamDelta: ParamDeltas
  } | null>(null)
  const [controlType, setControlType] = useState<ControlType>(
    initialControlType,
  )
  const [trackTags, setTrackTags] = useState<TrackTag[]>(initialTrackTags)
  const [hud, setHud] = useState<RaceCanvasHud>({
    currentMs: 0,
    lapCount: 0,
    onTrack: true,
    lastLapMs: null,
  })
  const [saveName, setSaveName] = useState('')

  const paramsRef = useRef<CarParams>(params)
  paramsRef.current = params
  const pausedRef = useRef(false)
  const resumeShiftRef = useRef(0)
  const pendingResetRef = useRef(false)
  const pendingRaceStartRef = useRef<number | null>(null)
  const phaseRef = useRef<Phase>(phase)
  phaseRef.current = phase

  const handleHud = useCallback((next: RaceCanvasHud) => {
    setHud(next)
  }, [])

  const handleLapComplete = useCallback((event: LapCompleteEvent) => {
    if (phaseRef.current !== 'drive') return
    setPendingRound({ lapTimeMs: event.lapTimeMs })
    pausedRef.current = true
    setPhase('feedback')
  }, [])

  function startCountdown() {
    pausedRef.current = false
    pendingResetRef.current = true
    pendingRaceStartRef.current = null
    setPendingRound(null)
    setHud({ currentMs: 0, lapCount: 0, onTrack: true, lastLapMs: null })
    setPhase('countdown')
  }

  function onCountdownDone() {
    pendingRaceStartRef.current = performance.now()
    setPhase('drive')
  }

  function abortDrive() {
    setPendingRound({ lapTimeMs: null })
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
      },
    ])
    setPrevDeltas(result.perParamDelta)
    setDamping(result.newDamping)
    setPhase('recommend')
  }

  function onFeedbackCancel() {
    onDiscard(rounds)
  }

  function applyRecommendationAndDriveAgain() {
    if (!pendingRecommendation) return
    setParams(pendingRecommendation.nextParams)
    setPendingRecommendation(null)
    startCountdown()
  }

  function gotoSave() {
    if (!pendingRecommendation) return
    setSaveName('')
    setPhase('save')
  }

  function discardSession() {
    onDiscard(rounds)
  }

  function commitSave() {
    if (!pendingRecommendation) return
    const finalRound: RoundLog = {
      params,
      ratings: pendingRecommendation.ratings,
      notes: pendingRecommendation.notes,
      lapTimeMs: pendingRound?.lapTimeMs ?? null,
    }
    const saved = makeSavedTuning({
      id: makeTuningId(),
      name: saveName || 'Untitled setup',
      round: finalRound,
      controlType,
      trackTags,
    })
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

  function restartCurrentRun() {
    pausedRef.current = false
    pendingResetRef.current = true
    pendingRaceStartRef.current = null
    setPendingRound(null)
    setHud({ currentMs: 0, lapCount: 0, onTrack: true, lastLapMs: null })
    setPhase('countdown')
  }

  const showCanvas = phase === 'countdown' || phase === 'drive'

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
            onHudUpdate={handleHud}
            disableMusicIntensity
            style={canvasStyle}
          />
          <DriveHud hud={hud} />
          <TouchControls
            keys={keys}
            enabled={phase === 'drive'}
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
                onClick={abortDrive}
                style={driveActionBtn}
                aria-label="Stop run"
              >
                Stop run
              </button>
            </div>
          ) : null}
          {phase === 'countdown' ? <Countdown onDone={onCountdownDone} /> : null}
        </div>
      ) : null}

      {phase === 'feedback' ? (
        <div style={formScroll}>
          <TuningFeedbackForm
            lapTimeMs={pendingRound?.lapTimeMs ?? null}
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
        hairpin. After the lap, you will rate seven aspects of car feel and the
        lab will suggest new parameters. Repeat until everything feels right,
        then save the tuning.
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
      {!hud.onTrack ? (
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
  position: 'fixed',
  inset: 0,
  background: '#9ad8ff',
  touchAction: 'none',
  userSelect: 'none',
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
