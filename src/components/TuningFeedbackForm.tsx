'use client'
import { useMemo, useState, type CSSProperties } from 'react'
import {
  ASPECTS,
  type AspectId,
  type AspectRatings,
  type LikertScore,
} from '@/lib/tuningLab'
import type { LapTelemetry, OffTrackEvent } from '@/game/offTrackEvents'
import type { CarParams } from '@/game/physics'
import type { Piece } from '@/lib/schemas'
import {
  formatDurationSec,
  formatLapTime,
  formatSigned,
} from '@/lib/speedTraceGraph'
import { SpeedTracePanel } from './SpeedTracePanel'

interface Props {
  initialRatings?: AspectRatings
  initialNotes?: string
  lapTimeMs: number | null
  offTrackEvents?: OffTrackEvent[]
  telemetry?: LapTelemetry | null
  /** The round's params, used to ground the speed trace's max-speed cap. */
  params?: CarParams
  /** Track pieces this lap was driven on. Required for the Track view. */
  pieces?: Piece[]
  onSubmit: (ratings: AspectRatings, notes: string) => void
  onCancel: () => void
}

const SEGMENTS: { score: LikertScore; label: string }[] = [
  { score: 1, label: '1' },
  { score: 2, label: '2' },
  { score: 3, label: '3' },
  { score: 4, label: '4' },
  { score: 5, label: '5' },
]

export function TuningFeedbackForm({
  initialRatings,
  initialNotes,
  lapTimeMs,
  offTrackEvents,
  telemetry,
  params,
  pieces,
  onSubmit,
  onCancel,
}: Props) {
  const [ratings, setRatings] = useState<AspectRatings>(() => ({ ...(initialRatings ?? {}) }))
  const [notes, setNotes] = useState(initialNotes ?? '')

  const events = useMemo(() => offTrackEvents ?? [], [offTrackEvents])
  const totalOffMs = useMemo(
    () => events.reduce((sum, e) => sum + e.durationMs, 0),
    [events],
  )

  function setScore(id: AspectId, score: LikertScore | null) {
    setRatings((prev) => ({ ...prev, [id]: score }))
  }

  return (
    <div style={panel}>
      <div style={header}>
        <div style={title}>HOW DID IT FEEL?</div>
        <div style={subtitle}>
          {lapTimeMs !== null
            ? `Lap ${(lapTimeMs / 1000).toFixed(2)}s. Rate each aspect 1 to 5. 3 means just right.`
            : 'Rate each aspect 1 to 5. 3 means just right.'}
        </div>
      </div>

      <OffTrackPanel
        events={events}
        totalOffMs={totalOffMs}
        lapTimeMs={lapTimeMs}
        maxSpeedRef={params?.maxSpeed ?? null}
      />

      {telemetry && telemetry.speeds.length >= 2 && pieces ? (
        <SpeedTracePanel
          telemetry={telemetry}
          pieces={pieces}
          maxSpeed={params?.maxSpeed}
        />
      ) : telemetry === undefined || telemetry === null ? null : (
        <div style={emptyTracePanel}>No telemetry recorded for this run.</div>
      )}

      <div style={cards}>
        {ASPECTS.map((aspect) => (
          <AspectCard
            key={aspect.id}
            label={aspect.label}
            question={aspect.question}
            lowLabel={aspect.lowLabel}
            highLabel={aspect.highLabel}
            score={ratings[aspect.id] ?? null}
            onSet={(s) => setScore(aspect.id, s)}
          />
        ))}
      </div>

      <div style={notesWrap}>
        <div style={notesLabel}>Notes for offline analysis (optional)</div>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value.slice(0, 500))}
          placeholder="Anything specific I should remember about this run?"
          style={notesField}
          rows={3}
        />
      </div>

      <div style={footer}>
        <button onClick={onCancel} style={cancelBtn}>
          Discard run
        </button>
        <button onClick={() => onSubmit(ratings, notes)} style={submitBtn}>
          Get recommendation
        </button>
      </div>
    </div>
  )
}

function AspectCard({
  label,
  question,
  lowLabel,
  highLabel,
  score,
  onSet,
}: {
  label: string
  question: string
  lowLabel: string
  highLabel: string
  score: LikertScore | null
  onSet: (s: LikertScore | null) => void
}) {
  return (
    <div style={card}>
      <div style={cardLabel}>{label}</div>
      <div style={cardQuestion}>{question}</div>
      <div style={axisRow}>
        <span>{lowLabel}</span>
        <span>{highLabel}</span>
      </div>
      <div role="radiogroup" aria-label={label} style={segments}>
        {SEGMENTS.map((seg) => {
          const active = score === seg.score
          return (
            <button
              key={seg.score}
              role="radio"
              aria-checked={active}
              onClick={() => onSet(active ? null : seg.score)}
              style={{
                ...segment,
                background: active ? '#ff6b35' : '#0e0e0e',
                color: active ? 'white' : '#cfcfcf',
                borderColor: active ? '#ff6b35' : '#3a3a3a',
              }}
            >
              {seg.label}
            </button>
          )
        })}
      </div>
      <div style={skipHint}>
        {score === null
          ? 'no opinion (skipped)'
          : 'tap your selection again to skip'}
      </div>
    </div>
  )
}

function OffTrackPanel({
  events,
  totalOffMs,
  lapTimeMs,
  maxSpeedRef,
}: {
  events: OffTrackEvent[]
  totalOffMs: number
  lapTimeMs: number | null
  maxSpeedRef: number | null
}) {
  if (events.length === 0) {
    return (
      <div style={offTrackEmpty}>
        <span style={offTrackEmptyDot} aria-hidden /> Stayed on track all lap.
      </div>
    )
  }
  const sharePct =
    lapTimeMs && lapTimeMs > 0
      ? Math.min(100, Math.round((totalOffMs / lapTimeMs) * 100))
      : null
  return (
    <div style={offPanel}>
      <div style={offHeader}>
        <div style={offTitle}>Off-track telemetry</div>
        <div style={offAggregate}>
          <span style={offAggKey}>{events.length}x</span>
          <span style={offAggVal}>{formatDurationSec(totalOffMs)}</span>
          {sharePct !== null ? (
            <span style={offAggSub}>{sharePct}% of lap</span>
          ) : null}
        </div>
      </div>
      <div style={offRows}>
        {events.map((ev, i) => (
          <OffTrackEventRow
            key={`off-${i}`}
            index={i + 1}
            event={ev}
            maxSpeedRef={maxSpeedRef}
          />
        ))}
      </div>
    </div>
  )
}

function OffTrackEventRow({
  index,
  event,
  maxSpeedRef,
}: {
  index: number
  event: OffTrackEvent
  maxSpeedRef: number | null
}) {
  const speedAbs = Math.abs(event.speed)
  const speedPct =
    maxSpeedRef && maxSpeedRef > 0
      ? Math.round((speedAbs / maxSpeedRef) * 100)
      : null
  const steerLabel = describeSteer(event.steer)
  const throttleLabel = formatSigned(event.throttle, 2)
  return (
    <div style={offRow}>
      <div style={offRowHeader}>
        <span style={offRowIndex}>#{index}</span>
        <span style={offRowTime}>{formatLapTime(event.lapMs)}</span>
        <span style={offRowDuration}>
          {formatDurationSec(event.durationMs)}
        </span>
      </div>
      <div style={offRowGrid}>
        <Field label="Speed">
          {speedAbs.toFixed(1)} m/s
          {speedPct !== null ? (
            <span style={fieldHint}> ({speedPct}% of cap)</span>
          ) : null}
        </Field>
        <Field label="Steer">{steerLabel}</Field>
        <Field label="Throttle">
          {throttleLabel}
          {event.handbrake ? <span style={fieldChip}>handbrake</span> : null}
        </Field>
        <Field label="Peak speed">{event.peakSpeed.toFixed(1)} m/s</Field>
        <Field label="Max off-line">
          {event.peakDistanceFromCenter.toFixed(1)} m
        </Field>
        <Field label="Heading">{(event.heading * (180 / Math.PI)).toFixed(0)} deg</Field>
      </div>
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div style={fieldWrap}>
      <span style={fieldLabel}>{label}</span>
      <span style={fieldValue}>{children}</span>
    </div>
  )
}

function describeSteer(steer: number): string {
  if (!Number.isFinite(steer)) return 'centered'
  const mag = Math.abs(steer)
  if (mag < 0.05) return 'centered'
  // Sign convention: in this codebase positive steer means LEFT (the
  // keyboard `left` key maps to +1 in RaceCanvas; the physics integrator
  // rotates heading positive for left turns when moving forward).
  const dir = steer > 0 ? 'Left' : 'Right'
  return `${dir} ${mag.toFixed(2)}`
}

const offPanel: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  padding: 12,
  background: '#1d1d1d',
  borderRadius: 8,
  color: 'white',
}
const offHeader: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  gap: 8,
}
const offTitle: CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  letterSpacing: 0.5,
}
const offAggregate: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 8,
  fontFamily: 'monospace',
  fontSize: 12,
}
const offAggKey: CSSProperties = {
  color: '#ff8a3c',
  fontWeight: 700,
}
const offAggVal: CSSProperties = {
  color: 'white',
  fontWeight: 600,
}
const offAggSub: CSSProperties = {
  color: '#9a9a9a',
  fontSize: 11,
}
const offRows: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  maxHeight: 280,
  overflowY: 'auto',
  paddingRight: 4,
}
const offRow: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  padding: 8,
  background: '#0e0e0e',
  borderLeft: '3px solid #ff8a3c',
  borderRadius: 4,
}
const offRowHeader: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 10,
  fontFamily: 'monospace',
  fontSize: 11,
}
const offRowIndex: CSSProperties = {
  color: '#ff8a3c',
  fontWeight: 700,
}
const offRowTime: CSSProperties = {
  color: 'white',
  fontWeight: 600,
}
const offRowDuration: CSSProperties = {
  color: '#9a9a9a',
  marginLeft: 'auto',
}
const offRowGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 6,
}
const fieldWrap: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  fontFamily: 'monospace',
  fontSize: 11,
}
const fieldLabel: CSSProperties = {
  color: '#9a9a9a',
  fontSize: 9,
  letterSpacing: 1,
  textTransform: 'uppercase',
}
const fieldValue: CSSProperties = {
  color: 'white',
}
const fieldHint: CSSProperties = {
  color: '#9a9a9a',
}
const fieldChip: CSSProperties = {
  display: 'inline-block',
  marginLeft: 4,
  padding: '0 4px',
  background: '#552d2d',
  color: '#ff9a9a',
  borderRadius: 3,
  fontSize: 9,
  letterSpacing: 0.5,
  textTransform: 'uppercase',
}
const offTrackEmpty: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 12,
  color: '#5fe08a',
  background: '#0e0e0e',
  border: '1px solid #1f3f29',
  borderRadius: 6,
  padding: '8px 10px',
}
const offTrackEmptyDot: CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: 999,
  background: '#5fe08a',
  display: 'inline-block',
}
const emptyTracePanel: CSSProperties = {
  fontSize: 12,
  fontStyle: 'italic',
  opacity: 0.6,
  padding: 10,
  background: '#1d1d1d',
  borderRadius: 8,
  color: 'white',
  textAlign: 'center',
}

const panel: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 18,
  width: '100%',
  maxWidth: 520,
  margin: '0 auto',
}
const header: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
}
const title: CSSProperties = {
  fontSize: 22,
  fontWeight: 800,
  letterSpacing: 2,
  color: 'white',
}
const subtitle: CSSProperties = {
  fontSize: 13,
  opacity: 0.75,
  color: 'white',
  lineHeight: 1.4,
}
const cards: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
}
const card: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  padding: 12,
  background: '#1d1d1d',
  borderRadius: 8,
  color: 'white',
}
const cardLabel: CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  letterSpacing: 0.5,
}
const cardQuestion: CSSProperties = {
  fontSize: 13,
  opacity: 0.8,
  lineHeight: 1.4,
}
const axisRow: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  fontSize: 11,
  opacity: 0.55,
  fontFamily: 'monospace',
}
const segments: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(5, 1fr)',
  gap: 6,
}
const segment: CSSProperties = {
  height: 44,
  border: '1px solid #3a3a3a',
  borderRadius: 8,
  fontSize: 16,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'inherit',
}
const skipHint: CSSProperties = {
  alignSelf: 'flex-end',
  fontSize: 11,
  opacity: 0.5,
  fontStyle: 'italic',
}
const notesWrap: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  color: 'white',
}
const notesLabel: CSSProperties = {
  fontSize: 12,
  letterSpacing: 1,
  textTransform: 'uppercase',
  opacity: 0.65,
}
const notesField: CSSProperties = {
  resize: 'vertical',
  minHeight: 64,
  background: '#0e0e0e',
  color: 'white',
  border: '1px solid #3a3a3a',
  borderRadius: 8,
  padding: 10,
  fontFamily: 'inherit',
  fontSize: 14,
}
const footer: CSSProperties = {
  display: 'flex',
  gap: 8,
  justifyContent: 'space-between',
}
const cancelBtn: CSSProperties = {
  background: 'transparent',
  color: '#cfcfcf',
  border: '1px solid #3a3a3a',
  borderRadius: 8,
  padding: '10px 14px',
  fontSize: 13,
  fontFamily: 'inherit',
  cursor: 'pointer',
}
const submitBtn: CSSProperties = {
  background: '#ff6b35',
  color: 'white',
  border: 'none',
  borderRadius: 8,
  padding: '12px 18px',
  fontSize: 15,
  fontWeight: 700,
  fontFamily: 'inherit',
  cursor: 'pointer',
}
