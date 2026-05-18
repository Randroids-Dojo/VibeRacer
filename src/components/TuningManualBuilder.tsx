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
import { MenuShellAction, MenuStartButton } from './MenuUI'
import { menuTheme } from './menuTheme'

// Top-level manual tuning builder. Drives the same CarParams sliders the
// in-race TuningPanel uses but skips the lab test + questionnaire loop:
// the player names a setup, drags sliders, and saves it straight into the
// shared library. Empty ratings / null lap / empty notes mark the row as
// a hand-built tuning rather than a session output.
//
// Visuals stay on the menu-shell cream-card family (cardBg + thick black
// border + amber drop shadow) so this surface reads as part of Free Race
// / Derby / Tour / Drag / Settings instead of a black dev panel.

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
  // When set, the form preloads from this saved tuning and saves back to
  // the same id so the edit replaces the existing library row rather than
  // creating a duplicate. The original createdAt and any prior ratings /
  // notes / lap time carry through unchanged.
  editing?: SavedTuning | null
  onSaved: (saved: SavedTuning) => void
  onCancel: () => void
}

export function TuningManualBuilder({
  initialParams,
  initialControlType,
  initialTrackTags = [],
  editing = null,
  onSaved,
  onCancel,
}: Props) {
  const [params, setParams] = useState<CarParams>(() =>
    clampParams(editing?.params ?? initialParams),
  )
  const [name, setName] = useState(editing?.name ?? '')
  const [controlType, setControlType] = useState<ControlType>(
    editing?.controlType ?? initialControlType,
  )
  const [trackTags, setTrackTags] = useState<TrackTag[]>(
    editing?.trackTags ?? initialTrackTags,
  )

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
      ratings: editing?.ratings ?? {},
      notes: editing?.notes ?? '',
      lapTimeMs: editing?.lapTimeMs ?? null,
    }
    const saved = makeSavedTuning({
      id: editing?.id ?? makeTuningId(),
      name: trimmed,
      round,
      controlType,
      trackTags,
    })
    onSaved(
      editing
        ? { ...saved, createdAt: editing.createdAt }
        : saved,
    )
  }

  const saveDisabled = name.trim() === ''
  const isEditing = editing !== null

  return (
    <div style={wrap}>
      <div style={metaCard}>
        <div style={statusRow}>
          {stock ? (
            <span style={stockChip}>STOCK</span>
          ) : (
            <span style={tunedChip}>TUNED</span>
          )}
          <span style={statusHint}>
            Drag the sliders, name it, and save. No test loop required.
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
            <ToggleChip
              key={c}
              label={CONTROL_TYPE_LABELS[c]}
              active={controlType === c}
              onClick={() => setControlType(c)}
            />
          ))}
        </div>

        <div style={fieldLabel}>Track type tags (up to 4)</div>
        <div style={chipRow}>
          {TAG_OPTIONS.map((t) => (
            <ToggleChip
              key={t}
              label={TRACK_TAG_LABELS[t]}
              active={trackTags.includes(t)}
              onClick={() => toggleTag(t)}
            />
          ))}
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
        <MenuShellAction onClick={onCancel} style={footerBtn}>
          Back
        </MenuShellAction>
        <MenuShellAction
          onClick={resetAll}
          disabled={stock}
          style={footerBtn}
        >
          Reset to defaults
        </MenuShellAction>
        <MenuStartButton
          onClick={commitSave}
          disabled={saveDisabled}
          style={footerBtn}
        >
          {isEditing ? 'Save changes' : 'Save tuning'}
        </MenuStartButton>
      </div>
    </div>
  )
}

function ToggleChip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        ...chip,
        background: active ? menuTheme.pickSelectedBg : menuTheme.cardBg,
        color: active ? menuTheme.pickSelectedText : menuTheme.cardText,
        borderColor: active
          ? menuTheme.pickSelectedBorder
          : menuTheme.cardBorder,
      }}
    >
      {label}
    </button>
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
}
const cardBase: CSSProperties = {
  background: menuTheme.cardBg,
  color: menuTheme.cardText,
  border: `2px solid ${menuTheme.cardBorder}`,
  borderRadius: 12,
  boxShadow: `0 4px 0 ${menuTheme.cardShadow}`,
}
const metaCard: CSSProperties = {
  ...cardBase,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  padding: 14,
}
const statusRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flexWrap: 'wrap',
}
const stockChip: CSSProperties = {
  fontSize: 10,
  background: 'rgba(0,0,0,0.08)',
  color: menuTheme.cardText,
  border: '1px solid rgba(0,0,0,0.35)',
  borderRadius: 4,
  padding: '2px 6px',
  letterSpacing: 1,
  fontWeight: 700,
}
const tunedChip: CSSProperties = {
  fontSize: 10,
  background: menuTheme.ctaBg,
  color: '#fff',
  border: `1px solid ${menuTheme.ctaShadow}`,
  borderRadius: 4,
  padding: '2px 6px',
  letterSpacing: 1,
  fontWeight: 700,
}
const statusHint: CSSProperties = {
  fontSize: 12,
  color: menuTheme.cardMutedText,
  lineHeight: 1.4,
}
const fieldLabel: CSSProperties = {
  fontSize: 11,
  letterSpacing: 1.4,
  textTransform: 'uppercase',
  color: menuTheme.cardMutedText,
  fontWeight: 700,
  marginTop: 4,
}
const textField: CSSProperties = {
  background: '#fffbe8',
  color: menuTheme.cardText,
  border: `2px solid ${menuTheme.cardBorder}`,
  borderRadius: 8,
  padding: '10px 12px',
  fontFamily: 'inherit',
  fontSize: 14,
  fontWeight: 600,
}
const chipRow: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
}
const chip: CSSProperties = {
  borderRadius: 999,
  padding: '8px 12px',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'inherit',
  border: '2px solid',
  letterSpacing: 0.3,
}
const paramsSection: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
}
const row: CSSProperties = {
  ...cardBase,
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  padding: '10px 12px',
}
const rowHeader: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
}
const rowLabel: CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  color: menuTheme.cardText,
}
const valueBlock: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
}
const numInput: CSSProperties = {
  width: 78,
  background: '#fffbe8',
  color: menuTheme.cardText,
  border: `2px solid ${menuTheme.cardBorder}`,
  borderRadius: 6,
  padding: '4px 6px',
  fontSize: 13,
  fontFamily: 'monospace',
  fontWeight: 700,
  textAlign: 'right',
}
const unit: CSSProperties = {
  fontSize: 11,
  color: menuTheme.cardMutedText,
  fontWeight: 600,
  minWidth: 36,
}
const range: CSSProperties = {
  width: '100%',
  accentColor: menuTheme.ctaBg,
}
const metaRow: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
}
const metaText: CSSProperties = {
  fontSize: 10,
  color: menuTheme.cardMutedText,
  fontFamily: 'monospace',
  fontWeight: 600,
}
const resetFieldBtn: CSSProperties = {
  background: 'transparent',
  color: menuTheme.ctaShadow,
  border: 'none',
  cursor: 'pointer',
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 0.6,
  textDecoration: 'underline',
  fontFamily: 'inherit',
}
const hintText: CSSProperties = {
  fontSize: 11,
  color: menuTheme.cardMutedText,
  lineHeight: 1.4,
}
const footer: CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 8,
  flexWrap: 'wrap',
  marginTop: 4,
}
const footerBtn: CSSProperties = {
  flex: '1 1 140px',
  minWidth: 0,
}
