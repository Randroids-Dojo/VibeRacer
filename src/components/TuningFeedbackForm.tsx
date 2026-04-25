'use client'
import { useState, type CSSProperties } from 'react'
import {
  ASPECTS,
  type AspectId,
  type AspectRatings,
  type LikertScore,
} from '@/lib/tuningLab'

interface Props {
  initialRatings?: AspectRatings
  initialNotes?: string
  lapTimeMs: number | null
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
  onSubmit,
  onCancel,
}: Props) {
  const [ratings, setRatings] = useState<AspectRatings>(() => ({ ...(initialRatings ?? {}) }))
  const [notes, setNotes] = useState(initialNotes ?? '')

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
