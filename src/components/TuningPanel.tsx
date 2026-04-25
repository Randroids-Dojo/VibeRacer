'use client'
import { useMemo } from 'react'
import type { CarParams } from '@/game/physics'
import {
  TUNING_PARAM_META,
  cloneDefaultParams,
  clampParams,
  isStockParams,
} from '@/lib/tuningSettings'

interface TuningPanelProps {
  params: CarParams
  onChange: (next: CarParams) => void
  onReset: () => void
  onClose: () => void
}

export function TuningPanel({
  params,
  onChange,
  onReset,
  onClose,
}: TuningPanelProps) {
  const stock = useMemo(() => isStockParams(params), [params])

  function update(key: keyof CarParams, value: number) {
    onChange(clampParams({ ...params, [key]: value }))
  }

  return (
    <div style={overlay}>
      <div style={panel}>
        <div style={header}>
          <div style={title}>SETUP</div>
          <button onClick={onClose} style={closeBtn} aria-label="Close tuning">
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
            const value = params[m.key]
            const defaults = cloneDefaultParams()
            const isDefault = Math.abs(value - defaults[m.key]) < 1e-9
            return (
              <div key={m.key} style={row}>
                <div style={rowHeader}>
                  <div style={label}>{m.label}</div>
                  <div style={valueBlock}>
                    <input
                      type="number"
                      min={m.min}
                      max={m.max}
                      step={m.step}
                      value={value}
                      onChange={(e) => {
                        const v = Number(e.target.value)
                        if (Number.isFinite(v)) update(m.key, v)
                      }}
                      style={numInput}
                      aria-label={`${m.label} value`}
                    />
                    <div style={unit}>{m.unit}</div>
                  </div>
                </div>
                <input
                  type="range"
                  min={m.min}
                  max={m.max}
                  step={m.step}
                  value={value}
                  onChange={(e) => update(m.key, Number(e.target.value))}
                  style={range}
                  aria-label={`${m.label} slider`}
                />
                <div style={metaRow}>
                  <span style={metaText}>
                    {m.min} - {m.max} {m.unit}
                  </span>
                  {!isDefault ? (
                    <button
                      type="button"
                      onClick={() => update(m.key, defaults[m.key])}
                      style={resetFieldBtn}
                      aria-label={`Reset ${m.label}`}
                    >
                      reset
                    </button>
                  ) : null}
                </div>
                {m.hint ? <div style={hintText}>{m.hint}</div> : null}
              </div>
            )
          })}
        </div>

        <div style={footer}>
          <button onClick={onReset} style={resetAllBtn}>
            Reset to defaults
          </button>
          <button onClick={onClose} style={doneBtn}>
            Done
          </button>
        </div>
      </div>
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
