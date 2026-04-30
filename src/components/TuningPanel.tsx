'use client'
import { useCallback, useMemo, useRef, useState } from 'react'
import type { CarParams } from '@/game/physics'
import {
  TUNING_PARAM_META,
  cloneDefaultParams,
  clampParams,
  isStockParams,
} from '@/lib/tuningSettings'
import { useClickSfx } from '@/hooks/useClickSfx'
import { TuningHistoryList } from './TuningHistoryList'
import type { TuningHistoryEntry } from '@/lib/tuningHistory'

interface TuningPanelProps {
  params: CarParams
  onChange: (next: CarParams) => void
  onReset: () => void
  onClose: () => void
  // Optional audit log integration. When omitted the panel renders without a
  // history section so the lab's TuningSession (which has its own history
  // surface) can keep its existing layout.
  history?: TuningHistoryEntry[]
  liveSlug?: string
  onApplyHistoryEntry?: (entry: TuningHistoryEntry) => void
}

export function TuningPanel({
  params,
  onChange,
  onReset,
  onClose,
  history,
  liveSlug,
  onApplyHistoryEntry,
}: TuningPanelProps) {
  const stock = useMemo(() => isStockParams(params), [params])
  const clickConfirm = useClickSfx('confirm')
  const clickBack = useClickSfx('back')
  const clickSoft = useClickSfx('soft')
  const [historyOpen, setHistoryOpen] = useState(false)
  const showHistory =
    history !== undefined &&
    onApplyHistoryEntry !== undefined &&
    history.length > 0
  const scopedHistoryCount =
    history && liveSlug
      ? history.filter((e) => e.slug === liveSlug).length
      : history?.length ?? 0

  function update(key: keyof CarParams, value: number) {
    onChange(clampParams({ ...params, [key]: value }))
  }

  return (
    <div style={overlay}>
      <div style={panel}>
        <div style={header}>
          <div style={title}>SETUP</div>
          <button
            onClick={() => {
              clickBack()
              onClose()
            }}
            style={closeBtn}
            aria-label="Close tuning"
          >
            CLOSE
          </button>
        </div>

        <div style={status}>
          {stock ? (
            <span style={stockChip}>STOCK</span>
          ) : (
            <span style={tunedChip}>TUNED</span>
          )}
          <span style={hint}>
            Sliders apply live and save per track. New tracks start from your last setup.
          </span>
        </div>

        <div style={list}>
          {TUNING_PARAM_META.map((m) => {
            // The two steer rate fields share a combined 2D-pad row that we
            // render once at the position of steerRateLow.
            if (m.key === 'steerRateHigh') return null
            if (m.key === 'steerRateLow') {
              return (
                <SteeringRow
                  key="steering"
                  low={params.steerRateLow}
                  high={params.steerRateHigh}
                  onChange={(low, high) =>
                    onChange(
                      clampParams({
                        ...params,
                        steerRateLow: low,
                        steerRateHigh: high,
                      }),
                    )
                  }
                />
              )
            }
            return (
              <ParamRow
                key={m.key}
                paramKey={m.key}
                value={params[m.key]}
                onChange={(v) => update(m.key, v)}
              />
            )
          })}
        </div>

        {showHistory && history && onApplyHistoryEntry ? (
          <div style={historySection}>
            <button
              type="button"
              onClick={() => {
                clickSoft()
                setHistoryOpen((v) => !v)
              }}
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
                  liveParams={params}
                  scopeSlug={liveSlug ?? null}
                  onApply={(entry) => {
                    clickConfirm()
                    onApplyHistoryEntry(entry)
                  }}
                />
              </div>
            ) : null}
          </div>
        ) : null}

        <div style={footer}>
          <button
            onClick={() => {
              clickSoft()
              onReset()
            }}
            style={resetAllBtn}
          >
            Reset to defaults
          </button>
          <button
            onClick={() => {
              clickConfirm()
              onClose()
            }}
            style={doneBtn}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

function ParamRow({
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
        <div style={label}>{meta.label}</div>
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
        <div style={label}>Steering response</div>
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
        Drag the pad: horizontal sets steering at low speed, vertical sets it at top speed.
        Lower top-speed steering tames twitchiness on straights.
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
  meta: { key: keyof CarParams; label: string; min: number; max: number; step: number; unit: string }
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

const overlay: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.6)',
  display: 'grid',
  placeItems: 'center',
  zIndex: 110,
  fontFamily: 'system-ui, sans-serif',
  padding: 16,
}
const panel: React.CSSProperties = {
  background: '#161616',
  color: 'white',
  borderRadius: 12,
  padding: '20px 22px',
  minWidth: 320,
  maxWidth: 520,
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
  boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
  border: '1px solid #2a2a2a',
  maxHeight: 'calc(100vh - 32px)',
  overflow: 'auto',
}
const header: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
}
const title: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 800,
  letterSpacing: 2,
}
const closeBtn: React.CSSProperties = {
  border: 'none',
  background: 'transparent',
  color: '#ccc',
  cursor: 'pointer',
  fontSize: 12,
  letterSpacing: 1,
  fontFamily: 'inherit',
}
const status: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
}
const stockChip: React.CSSProperties = {
  fontSize: 10,
  background: '#2a2a2a',
  color: '#cfcfcf',
  borderRadius: 3,
  padding: '2px 6px',
  letterSpacing: 1,
  fontWeight: 700,
}
const tunedChip: React.CSSProperties = {
  fontSize: 10,
  background: '#ff6b35',
  color: 'white',
  borderRadius: 3,
  padding: '2px 6px',
  letterSpacing: 1,
  fontWeight: 700,
}
const hint: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.7,
  lineHeight: 1.4,
}
const list: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
}
const row: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  padding: '10px 10px',
  background: '#1d1d1d',
  borderRadius: 8,
}
const rowHeader: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
}
const label: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
}
const valueBlock: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
}
const numInput: React.CSSProperties = {
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
const unit: React.CSSProperties = {
  fontSize: 11,
  opacity: 0.6,
  minWidth: 36,
}
const range: React.CSSProperties = {
  width: '100%',
  accentColor: '#ff6b35',
}
const metaRow: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
}
const metaText: React.CSSProperties = {
  fontSize: 10,
  opacity: 0.5,
  fontFamily: 'monospace',
}
const resetFieldBtn: React.CSSProperties = {
  background: 'transparent',
  color: '#9aa0a6',
  border: 'none',
  cursor: 'pointer',
  fontSize: 11,
  letterSpacing: 0.6,
  textDecoration: 'underline',
  fontFamily: 'inherit',
}
const hintText: React.CSSProperties = {
  fontSize: 11,
  opacity: 0.55,
  lineHeight: 1.4,
}
const historySection: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  padding: '8px 0',
  borderTop: '1px solid #2a2a2a',
}
const historyToggleBtn: React.CSSProperties = {
  background: 'transparent',
  color: '#cfcfcf',
  border: 'none',
  padding: '6px 0',
  fontSize: 13,
  fontWeight: 600,
  textAlign: 'left',
  cursor: 'pointer',
  fontFamily: 'inherit',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
}
const historyChevron: React.CSSProperties = {
  fontSize: 11,
  color: '#9aa0a6',
  marginLeft: 8,
}
const historyBody: React.CSSProperties = {
  paddingTop: 6,
}
const footer: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 8,
  marginTop: 4,
}
const resetAllBtn: React.CSSProperties = {
  background: 'transparent',
  color: '#cfcfcf',
  border: '1px solid #3a3a3a',
  borderRadius: 8,
  padding: '8px 12px',
  fontSize: 13,
  cursor: 'pointer',
  fontFamily: 'inherit',
}
const doneBtn: React.CSSProperties = {
  background: '#ff6b35',
  color: 'white',
  border: 'none',
  borderRadius: 8,
  padding: '10px 18px',
  fontSize: 14,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'inherit',
}
const steeringHint: React.CSSProperties = {
  fontSize: 11,
  opacity: 0.65,
  lineHeight: 1.4,
}
const steeringBody: React.CSSProperties = {
  display: 'flex',
  alignItems: 'stretch',
  gap: 12,
}
const steeringInputs: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'space-between',
  gap: 8,
  flex: 1,
  minWidth: 0,
}
const axisInputWrap: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  background: '#141414',
  border: '1px solid #2a2a2a',
  borderRadius: 6,
  padding: '6px 8px',
}
const axisLabel: React.CSSProperties = {
  fontSize: 10,
  letterSpacing: 1,
  textTransform: 'uppercase',
  opacity: 0.7,
}
const padBox: React.CSSProperties = {
  position: 'relative',
  width: 160,
  height: 160,
  flexShrink: 0,
  background: '#0e0e0e',
  border: '1px solid #2a2a2a',
  borderRadius: 8,
  cursor: 'crosshair',
  touchAction: 'none',
  userSelect: 'none',
  overflow: 'hidden',
}
const padGridV: React.CSSProperties = {
  position: 'absolute',
  left: '50%',
  top: 0,
  bottom: 0,
  width: 1,
  background: '#222',
}
const padGridH: React.CSSProperties = {
  position: 'absolute',
  top: '50%',
  left: 0,
  right: 0,
  height: 1,
  background: '#222',
}
const padDot: React.CSSProperties = {
  position: 'absolute',
  width: 14,
  height: 14,
  marginLeft: -7,
  marginBottom: -7,
  borderRadius: '50%',
  background: '#ff6b35',
  boxShadow: '0 0 0 2px rgba(255,107,53,0.25)',
  pointerEvents: 'none',
}
const padDefaultDot: React.CSSProperties = {
  position: 'absolute',
  width: 6,
  height: 6,
  marginLeft: -3,
  marginBottom: -3,
  borderRadius: '50%',
  background: '#444',
  pointerEvents: 'none',
}
const padAxisLabelLow: React.CSSProperties = {
  position: 'absolute',
  left: 4,
  bottom: 4,
  fontSize: 9,
  opacity: 0.45,
  fontFamily: 'monospace',
  pointerEvents: 'none',
}
const padAxisLabelLowRight: React.CSSProperties = {
  position: 'absolute',
  right: 4,
  bottom: 4,
  fontSize: 9,
  opacity: 0.45,
  fontFamily: 'monospace',
  pointerEvents: 'none',
}
const padAxisLabelHigh: React.CSSProperties = {
  position: 'absolute',
  left: 4,
  top: 4,
  fontSize: 9,
  opacity: 0.45,
  fontFamily: 'monospace',
  pointerEvents: 'none',
}
const padAxisLabelHighBottom: React.CSSProperties = {
  position: 'absolute',
  right: 4,
  top: 4,
  fontSize: 9,
  opacity: 0.45,
  fontFamily: 'monospace',
  pointerEvents: 'none',
}
