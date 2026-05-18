'use client'
import { useMemo, useState, type CSSProperties } from 'react'
import type { CarParams } from '@/game/physics'
import {
  CONTROL_TYPE_LABELS,
  TRACK_TAG_LABELS,
  makeSavedTuning,
  makeTuningId,
  type ControlType,
  type RoundLog,
  type SavedTuning,
  type TrackTag,
} from '@/lib/tuningLab'
import {
  TUNING_PARAM_META,
  clampParams,
  cloneDefaultParams,
  isStockParams,
} from '@/lib/tuningSettings'

// Top-level manual tuning builder. Drives the same CarParams sliders the
// in-race TuningPanel uses but skips the lab test + questionnaire loop:
// the player names a setup, drags sliders, and saves it straight into the
// shared library. Empty ratings / null lap / empty notes mark the row as a
// hand-built tuning rather than a session output.

const CONTROL_OPTIONS: ControlType[] = [
  'keyboard',
  'touch_single',
  'touch_dual',
]
const TAG_OPTIONS: TrackTag[] = ['twisty', 'fast', 'mixed', 'technical']

interface Props {
  initialParams: CarParams
  initialControlType: ControlType
  initialTrackTags?: TrackTag[]
  onSaved: (saved: SavedTuning) => void
  onCancel: () => void
}

export function TuningManualBuilder({
  initialParams,
  initialControlType,
  initialTrackTags = [],
  onSaved,
  onCancel,
}: Props) {
  const [params, setParams] = useState<CarParams>(() =>
    clampParams(initialParams),
  )
  const [name, setName] = useState('')
  const [controlType, setControlType] = useState<ControlType>(initialControlType)
  const [trackTags, setTrackTags] = useState<TrackTag[]>(initialTrackTags)

  const stock = useMemo(() => isStockParams(params), [params])

  function updateParam(key: keyof CarParams, value: number) {
    setParams((prev) => clampParams({ ...prev, [key]: value }))
  }

  function resetAll() {
    setParams(cloneDefaultParams())
  }

  function toggleTag(tag: TrackTag) {
    setTrackTags((prev) =>
      prev.includes(tag)
        ? prev.filter((t) => t !== tag)
        : prev.length < 4
          ? [...prev, tag]
          : prev,
    )
  }

  function commitSave() {
    const trimmed = name.trim()
    if (trimmed === '') return
    const round: RoundLog = {
      params,
      ratings: {},
      notes: '',
      lapTimeMs: null,
    }
    const saved = makeSavedTuning({
      id: makeTuningId(),
      name: trimmed,
      round,
      controlType,
      trackTags,
    })
    onSaved(saved)
  }

  const saveDisabled = name.trim() === ''

  return (
    <div style={wrap}>
      <div style={metaSection}>
        <div style={statusRow}>
          {stock ? (
            <span style={stockChip}>STOCK</span>
          ) : (
            <span style={tunedChip}>TUNED</span>
          )}
          <span style={statusHint}>
            Drag sliders to build a setup, then name it and save. No test loop
            required.
          </span>
        </div>

        <label style={fieldLabel} htmlFor="manual-tuning-name">
          Name
        </label>
        <input
          id="manual-tuning-name"
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, 48))}
          placeholder="My custom setup"
          style={textField}
          maxLength={48}
        />

        <div style={fieldLabel}>Control</div>
        <div style={chipRow}>
          {CONTROL_OPTIONS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setControlType(c)}
              style={{
                ...chip,
                background: controlType === c ? '#ff6b35' : '#1d1d1d',
              }}
            >
              {CONTROL_TYPE_LABELS[c]}
            </button>
          ))}
        </div>

        <div style={fieldLabel}>Track type tags (up to 4)</div>
        <div style={chipRow}>
          {TAG_OPTIONS.map((t) => {
            const active = trackTags.includes(t)
            return (
              <button
                key={t}
                type="button"
                onClick={() => toggleTag(t)}
                style={{
                  ...chip,
                  background: active ? '#ff6b35' : '#1d1d1d',
                }}
              >
                {TRACK_TAG_LABELS[t]}
              </button>
            )
          })}
        </div>
      </div>

      <div style={paramsSection}>
        {TUNING_PARAM_META.map((meta) => (
          <SliderRow
            key={meta.key}
            paramKey={meta.key}
            value={params[meta.key]}
            onChange={(v) => updateParam(meta.key, v)}
          />
        ))}
      </div>

      <div style={footer}>
        <button type="button" onClick={onCancel} style={secondaryBtn}>
          Back
        </button>
        <button
          type="button"
          onClick={resetAll}
          style={secondaryBtn}
          disabled={stock}
        >
          Reset to defaults
        </button>
        <button
          type="button"
          onClick={commitSave}
          style={primaryBtn}
          disabled={saveDisabled}
          aria-disabled={saveDisabled}
        >
          Save tuning
        </button>
      </div>
    </div>
  )
}

function SliderRow({
  paramKey,
  value,
  onChange,
}: {
  paramKey: keyof CarParams
  value: number
  onChange: (v: number) => void
}) {
  const meta = TUNING_PARAM_META.find((m) => m.key === paramKey)!
  const defaults = cloneDefaultParams()
  const isDefault = Math.abs(value - defaults[paramKey]) < 1e-9
  return (
    <div style={row}>
      <div style={rowHeader}>
        <div style={rowLabel}>{meta.label}</div>
        <div style={valueBlock}>
          <input
            type="number"
            min={meta.min}
            max={meta.max}
            step={meta.step}
            value={value}
            onChange={(e) => {
              const v = Number(e.target.value)
              if (Number.isFinite(v)) onChange(v)
            }}
            style={numInput}
            aria-label={`${meta.label} value`}
          />
          <div style={unit}>{meta.unit}</div>
        </div>
      </div>
      <input
        type="range"
        min={meta.min}
        max={meta.max}
        step={meta.step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={range}
        aria-label={`${meta.label} slider`}
      />
      <div style={metaRow}>
        <span style={metaText}>
          {meta.min} - {meta.max} {meta.unit}
        </span>
        {!isDefault ? (
          <button
            type="button"
            onClick={() => onChange(defaults[paramKey])}
            style={resetFieldBtn}
            aria-label={`Reset ${meta.label}`}
          >
            reset
          </button>
        ) : null}
      </div>
      {meta.hint ? <div style={hintText}>{meta.hint}</div> : null}
    </div>
  )
}

const wrap: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
  color: 'white',
}
const metaSection: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  padding: 14,
  background: '#1d1d1d',
  border: '1px solid #2a2a2a',
  borderRadius: 10,
}
const statusRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flexWrap: 'wrap',
}
const stockChip: CSSProperties = {
  fontSize: 10,
  background: '#2a2a2a',
  color: '#cfcfcf',
  borderRadius: 3,
  padding: '2px 6px',
  letterSpacing: 1,
  fontWeight: 700,
}
const tunedChip: CSSProperties = {
  fontSize: 10,
  background: '#ff6b35',
  color: 'white',
  borderRadius: 3,
  padding: '2px 6px',
  letterSpacing: 1,
  fontWeight: 700,
}
const statusHint: CSSProperties = {
  fontSize: 12,
  opacity: 0.7,
  lineHeight: 1.4,
}
const fieldLabel: CSSProperties = {
  fontSize: 11,
  letterSpacing: 1.4,
  textTransform: 'uppercase',
  opacity: 0.7,
  marginTop: 4,
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
const paramsSection: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
}
const row: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  padding: '10px 10px',
  background: '#1d1d1d',
  borderRadius: 8,
}
const rowHeader: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
}
const rowLabel: CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
}
const valueBlock: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
}
const numInput: CSSProperties = {
  width: 78,
  background: '#0e0e0e',
  color: 'white',
  border: '1px solid #3a3a3a',
  borderRadius: 4,
  padding: '4px 6px',
  fontSize: 13,
  fontFamily: 'monospace',
  textAlign: 'right',
}
const unit: CSSProperties = {
  fontSize: 11,
  opacity: 0.6,
  minWidth: 36,
}
const range: CSSProperties = {
  width: '100%',
  accentColor: '#ff6b35',
}
const metaRow: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
}
const metaText: CSSProperties = {
  fontSize: 10,
  opacity: 0.5,
  fontFamily: 'monospace',
}
const resetFieldBtn: CSSProperties = {
  background: 'transparent',
  color: '#9aa0a6',
  border: 'none',
  cursor: 'pointer',
  fontSize: 11,
  letterSpacing: 0.6,
  textDecoration: 'underline',
  fontFamily: 'inherit',
}
const hintText: CSSProperties = {
  fontSize: 11,
  opacity: 0.55,
  lineHeight: 1.4,
}
const footer: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 8,
  flexWrap: 'wrap',
  marginTop: 4,
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
