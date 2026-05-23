'use client'
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
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
import type { TuningHistoryEntry } from '@/lib/tuningHistory'
import { MenuShellAction, MenuStartButton } from './MenuUI'
import { menuTheme } from './menuTheme'
import { TuningHistoryList } from './TuningHistoryList'

// Unified tuning editor. Drives the same colorful cream UI in two contexts:
//
// - In-race "Open Setup" overlay: parent passes `onChange` so each slider
//   tweak is mirrored into the live car params on the next frame. `history`
//   + `onApplyHistoryEntry` light up the Recent changes section so a player
//   can revert mid-race. No name / control / tags inputs in this mode.
//
// - Tuning Lab "Build tuning manually": parent omits `onChange`; the editor
//   owns the working draft locally and `onSaved` commits a SavedTuning to
//   the library. `editing` preloads from an existing row so saving upserts
//   back into the same id (Edit flow) rather than minting a new row.

const CONTROL_OPTIONS: ControlType[] = [
  'keyboard',
  'touch_single',
  'touch_dual',
]
const TAG_OPTIONS: TrackTag[] = ['twisty', 'fast', 'mixed', 'technical']

interface Props {
  // Seed for the working params. When `onChange` is provided, this also
  // mirrors any external updates (e.g. the parent applying a history entry
  // while the editor is open).
  params: CarParams
  // When set, the editor runs in "live apply" mode: every slider edit is
  // propagated upstream immediately. When absent, edits stage in local
  // state until the player hits Save.
  onChange?: (next: CarParams) => void
  // Optional callback for reset; receives nothing because both modes reset
  // to the same defaults. Live mode usually piggybacks on this to clear
  // the per-track persisted setup.
  onReset?: () => void
  // Dismiss the editor (Done in live mode, Back in library mode).
  onClose: () => void
  closeLabel?: string

  // Library-mode props. Setting `onSaved` switches the editor into the
  // library flow (renders Name / Control / Tags inputs + a Save button).
  onSaved?: (saved: SavedTuning) => void
  editing?: SavedTuning | null
  initialControlType?: ControlType
  initialTrackTags?: TrackTag[]

  // Live-mode props. Setting `history` + `onApplyHistoryEntry` reveals the
  // collapsible Recent changes section so a mid-race player can revert.
  history?: TuningHistoryEntry[]
  liveSlug?: string
  onApplyHistoryEntry?: (entry: TuningHistoryEntry) => void

  // Optional banner copy under the STOCK / TUNED chip. Defaults to the
  // live "sliders apply live and save per track" hint when no override is
  // supplied and `onChange` is set; library mode falls back to a "name
  // your setup" hint.
  hint?: ReactNode
}

export function TuningEditor({
  params,
  onChange,
  onReset,
  onClose,
  closeLabel,
  onSaved,
  editing = null,
  initialControlType = 'keyboard',
  initialTrackTags = [],
  history,
  liveSlug,
  onApplyHistoryEntry,
  hint,
}: Props) {
  const liveControlled = typeof onChange === 'function'
  const libraryMode = typeof onSaved === 'function'

  // Library-mode owns its own draft so unsaved tweaks don't leak into the
  // race car. Live-mode is fully controlled by the parent.
  const [draft, setDraft] = useState<CarParams>(() =>
    clampParams(editing?.params ?? params),
  )
  const workingParams = liveControlled ? params : draft

  const [name, setName] = useState(editing?.name ?? '')
  const [controlType, setControlType] = useState<ControlType>(
    editing?.controlType ?? initialControlType,
  )
  const [trackTags, setTrackTags] = useState<TrackTag[]>(
    editing?.trackTags ?? initialTrackTags,
  )
  const [historyOpen, setHistoryOpen] = useState(false)

  const stock = useMemo(() => isStockParams(workingParams), [workingParams])

  const applyParams = useCallback(
    (next: CarParams) => {
      const safe = clampParams(next)
      if (liveControlled) {
        onChange?.(safe)
      } else {
        setDraft(safe)
      }
    },
    [liveControlled, onChange],
  )

  const updateParam = useCallback(
    (key: keyof CarParams, value: number) => {
      applyParams({ ...workingParams, [key]: value })
    },
    [applyParams, workingParams],
  )

  const updateSteering = useCallback(
    (low: number, high: number) => {
      applyParams({
        ...workingParams,
        steerRateLow: low,
        steerRateHigh: high,
      })
    },
    [applyParams, workingParams],
  )

  function resetAll() {
    applyParams(cloneDefaultParams())
    onReset?.()
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
    if (!onSaved) return
    const trimmed = name.trim()
    if (trimmed === '') return
    const round: RoundLog = {
      params: workingParams,
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

  const saveDisabled = libraryMode && name.trim() === ''
  const isEditing = editing !== null
  const showHistory =
    history !== undefined &&
    onApplyHistoryEntry !== undefined &&
    history.length > 0
  const scopedHistoryCount =
    history && liveSlug
      ? history.filter((e) => e.slug === liveSlug).length
      : history?.length ?? 0

  const effectiveHint =
    hint ??
    (liveControlled
      ? 'Sliders apply live and save per track. New tracks start from your last setup.'
      : 'Drag the sliders, name it, and save. No test loop required.')
  const closeText = closeLabel ?? (libraryMode ? 'Back' : 'Done')
  const saveText = isEditing ? 'Save changes' : 'Save tuning'

  return (
    <div style={wrap}>
      <div style={metaCard}>
        <div style={statusRow}>
          {stock ? (
            <span style={stockChip}>STOCK</span>
          ) : (
            <span style={tunedChip}>TUNED</span>
          )}
          <span style={statusHint}>{effectiveHint}</span>
        </div>

        {libraryMode ? (
          <>
            <label style={fieldLabel} htmlFor="tuning-editor-name">
              Name
            </label>
            <input
              id="tuning-editor-name"
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
          </>
        ) : null}
      </div>

      <div style={paramsSection}>
        {TUNING_PARAM_META.map((meta) => {
          // Steering response is rendered once as a combined low + high pad.
          if (meta.key === 'steerRateHigh') return null
          if (meta.key === 'steerRateLow') {
            return (
              <SteeringRow
                key="steering"
                low={workingParams.steerRateLow}
                high={workingParams.steerRateHigh}
                onChange={updateSteering}
              />
            )
          }
          return (
            <SliderRow
              key={meta.key}
              paramKey={meta.key}
              value={workingParams[meta.key]}
              onChange={(v) => updateParam(meta.key, v)}
            />
          )
        })}
      </div>

      {showHistory && history && onApplyHistoryEntry ? (
        <div style={historySection}>
          <button
            type="button"
            onClick={() => setHistoryOpen((v) => !v)}
            style={historyToggleBtn}
            aria-expanded={historyOpen}
          >
            <span>
              Recent changes
              {scopedHistoryCount > 0 ? ` (${scopedHistoryCount})` : ''}
            </span>
            <span style={historyChevron}>{historyOpen ? '▴' : '▾'}</span>
          </button>
          {historyOpen ? (
            <div style={historyBody}>
              <TuningHistoryList
                entries={history}
                liveParams={workingParams}
                scopeSlug={liveSlug ?? null}
                onApply={onApplyHistoryEntry}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      <div style={footer}>
        <MenuShellAction onClick={onClose} style={footerBtn}>
          {closeText}
        </MenuShellAction>
        <MenuShellAction
          onClick={resetAll}
          disabled={stock}
          style={footerBtn}
        >
          Reset to defaults
        </MenuShellAction>
        {libraryMode ? (
          <MenuStartButton
            onClick={commitSave}
            disabled={saveDisabled}
            style={footerBtn}
          >
            {saveText}
          </MenuStartButton>
        ) : null}
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

function SteeringRow({
  low,
  high,
  onChange,
}: {
  low: number
  high: number
  onChange: (low: number, high: number) => void
}) {
  const lowMeta = TUNING_PARAM_META.find((m) => m.key === 'steerRateLow')!
  const highMeta = TUNING_PARAM_META.find((m) => m.key === 'steerRateHigh')!
  const defaults = cloneDefaultParams()
  const isDefault =
    Math.abs(low - defaults.steerRateLow) < 1e-9 &&
    Math.abs(high - defaults.steerRateHigh) < 1e-9
  return (
    <div style={row}>
      <div style={rowHeader}>
        <div style={rowLabel}>Steering response</div>
        {!isDefault ? (
          <button
            type="button"
            onClick={() =>
              onChange(defaults.steerRateLow, defaults.steerRateHigh)
            }
            style={resetFieldBtn}
            aria-label="Reset steering response"
          >
            reset
          </button>
        ) : null}
      </div>
      <div style={steeringHint}>
        Drag the pad: horizontal sets steering at low speed, vertical sets it
        at top speed. Lower top-speed steering tames twitchiness on straights.
      </div>
      <div style={steeringBody}>
        <XYPad
          x={low}
          y={high}
          xMin={lowMeta.min}
          xMax={lowMeta.max}
          yMin={highMeta.min}
          yMax={highMeta.max}
          defaultX={defaults.steerRateLow}
          defaultY={defaults.steerRateHigh}
          onChange={onChange}
        />
        <div style={steeringInputs}>
          <NumberAxisInput
            meta={lowMeta}
            value={low}
            onChange={(v) => onChange(v, high)}
          />
          <NumberAxisInput
            meta={highMeta}
            value={high}
            onChange={(v) => onChange(low, v)}
          />
        </div>
      </div>
    </div>
  )
}

function NumberAxisInput({
  meta,
  value,
  onChange,
}: {
  meta: {
    key: keyof CarParams
    label: string
    min: number
    max: number
    step: number
    unit: string
  }
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div style={axisInputWrap}>
      <div style={axisLabel}>{meta.label.replace('Steer rate ', '')}</div>
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
  )
}

function XYPad({
  x,
  y,
  xMin,
  xMax,
  yMin,
  yMax,
  defaultX,
  defaultY,
  onChange,
}: {
  x: number
  y: number
  xMin: number
  xMax: number
  yMin: number
  yMax: number
  defaultX: number
  defaultY: number
  onChange: (x: number, y: number) => void
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const draggingRef = useRef(false)

  const fx = (x - xMin) / Math.max(xMax - xMin, 1e-6)
  const fy = (y - yMin) / Math.max(yMax - yMin, 1e-6)
  const dotLeft = `${Math.max(0, Math.min(1, fx)) * 100}%`
  const dotBottom = `${Math.max(0, Math.min(1, fy)) * 100}%`
  const defLeft = `${((defaultX - xMin) / (xMax - xMin)) * 100}%`
  const defBottom = `${((defaultY - yMin) / (yMax - yMin)) * 100}%`

  const setFromEvent = useCallback(
    (clientX: number, clientY: number) => {
      const el = ref.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const tx = Math.max(
        0,
        Math.min(1, (clientX - rect.left) / Math.max(rect.width, 1)),
      )
      const ty = Math.max(
        0,
        Math.min(1, 1 - (clientY - rect.top) / Math.max(rect.height, 1)),
      )
      onChange(xMin + tx * (xMax - xMin), yMin + ty * (yMax - yMin))
    },
    [onChange, xMin, xMax, yMin, yMax],
  )

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    draggingRef.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
    setFromEvent(e.clientX, e.clientY)
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return
    setFromEvent(e.clientX, e.clientY)
  }
  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    draggingRef.current = false
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
  }

  return (
    <div
      ref={ref}
      aria-label={`Steering response 2D pad, low ${x.toFixed(2)} rad/s, high ${y.toFixed(2)} rad/s`}
      tabIndex={0}
      style={padBox}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div style={padGridV} />
      <div style={padGridH} />
      <div
        style={{
          ...padDefaultDot,
          left: defLeft,
          bottom: defBottom,
        }}
        title="Default"
      />
      <div
        style={{
          ...padDot,
          left: dotLeft,
          bottom: dotBottom,
        }}
      />
      <div style={padAxisLabelLow}>low {xMin}</div>
      <div style={padAxisLabelLowRight}>{xMax}</div>
      <div style={padAxisLabelHigh}>high {yMax}</div>
      <div style={padAxisLabelHighBottom}>{yMin}</div>
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
const steeringHint: CSSProperties = {
  fontSize: 11,
  color: menuTheme.cardMutedText,
  lineHeight: 1.4,
}
const steeringBody: CSSProperties = {
  display: 'flex',
  alignItems: 'stretch',
  gap: 12,
}
const steeringInputs: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'space-between',
  gap: 8,
  flex: 1,
  minWidth: 0,
}
const axisInputWrap: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  background: '#fffbe8',
  border: `2px solid ${menuTheme.cardBorder}`,
  borderRadius: 8,
  padding: '6px 8px',
}
const axisLabel: CSSProperties = {
  fontSize: 10,
  letterSpacing: 1,
  textTransform: 'uppercase',
  color: menuTheme.cardMutedText,
  fontWeight: 700,
}
const padBox: CSSProperties = {
  position: 'relative',
  width: 160,
  height: 160,
  flexShrink: 0,
  background: '#fffbe8',
  border: `2px solid ${menuTheme.cardBorder}`,
  borderRadius: 8,
  cursor: 'crosshair',
  touchAction: 'none',
  userSelect: 'none',
  overflow: 'hidden',
}
const padGridV: CSSProperties = {
  position: 'absolute',
  left: '50%',
  top: 0,
  bottom: 0,
  width: 1,
  background: 'rgba(0,0,0,0.18)',
}
const padGridH: CSSProperties = {
  position: 'absolute',
  top: '50%',
  left: 0,
  right: 0,
  height: 1,
  background: 'rgba(0,0,0,0.18)',
}
const padDot: CSSProperties = {
  position: 'absolute',
  width: 14,
  height: 14,
  marginLeft: -7,
  marginBottom: -7,
  borderRadius: '50%',
  background: menuTheme.ctaBg,
  border: `2px solid ${menuTheme.ctaShadow}`,
  boxShadow: `0 0 0 3px rgba(232,74,95,0.18)`,
  pointerEvents: 'none',
}
const padDefaultDot: CSSProperties = {
  position: 'absolute',
  width: 6,
  height: 6,
  marginLeft: -3,
  marginBottom: -3,
  borderRadius: '50%',
  background: 'rgba(0,0,0,0.35)',
  pointerEvents: 'none',
}
const padAxisLabelLow: CSSProperties = {
  position: 'absolute',
  left: 4,
  bottom: 4,
  fontSize: 9,
  color: menuTheme.cardMutedText,
  fontFamily: 'monospace',
  fontWeight: 700,
  pointerEvents: 'none',
}
const padAxisLabelLowRight: CSSProperties = {
  position: 'absolute',
  right: 4,
  bottom: 4,
  fontSize: 9,
  color: menuTheme.cardMutedText,
  fontFamily: 'monospace',
  fontWeight: 700,
  pointerEvents: 'none',
}
const padAxisLabelHigh: CSSProperties = {
  position: 'absolute',
  left: 4,
  top: 4,
  fontSize: 9,
  color: menuTheme.cardMutedText,
  fontFamily: 'monospace',
  fontWeight: 700,
  pointerEvents: 'none',
}
const padAxisLabelHighBottom: CSSProperties = {
  position: 'absolute',
  right: 4,
  top: 4,
  fontSize: 9,
  color: menuTheme.cardMutedText,
  fontFamily: 'monospace',
  fontWeight: 700,
  pointerEvents: 'none',
}
const historySection: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  padding: '8px 0',
  borderTop: `2px solid ${menuTheme.cardBorder}`,
}
const historyToggleBtn: CSSProperties = {
  background: menuTheme.cardBg,
  color: menuTheme.cardText,
  border: `2px solid ${menuTheme.cardBorder}`,
  borderRadius: 10,
  padding: '8px 12px',
  fontSize: 13,
  fontWeight: 700,
  textAlign: 'left',
  cursor: 'pointer',
  fontFamily: 'inherit',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  boxShadow: `0 3px 0 ${menuTheme.cardShadow}`,
}
const historyChevron: CSSProperties = {
  fontSize: 11,
  color: menuTheme.cardMutedText,
  marginLeft: 8,
}
const historyBody: CSSProperties = {
  paddingTop: 6,
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
