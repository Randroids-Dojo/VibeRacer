'use client'
import type { CSSProperties } from 'react'
import { menuTheme } from './MenuUI'
import type { MusicStepPattern, MusicStep } from '@/lib/trackMusic'

export function MusicStepGrid({
  label,
  steps,
  paintDegree,
  onChange,
}: {
  label: string
  steps: MusicStepPattern
  paintDegree: number
  onChange: (steps: MusicStepPattern) => void
}) {
  function setStep(index: number, value: MusicStep): void {
    const next = steps.slice()
    next[index] = value
    onChange(next)
  }
  return (
    <div style={wrap}>
      <div style={title}>{label}</div>
      <div style={grid} role="grid" aria-label={`${label} ${steps.length}-step pattern`}>
        {steps.map((step, index) => (
          <button
            key={index}
            type="button"
            role="gridcell"
            aria-label={`Step ${index + 1}: ${step === null ? 'rest' : step}`}
            onClick={() => setStep(index, step === null ? paintDegree : null)}
            onContextMenu={(event) => {
              event.preventDefault()
              const current = step ?? paintDegree
              setStep(index, current >= 7 ? -7 : current + 1)
            }}
            style={step === null ? cellRest : cellOn}
          >
            <span style={cellIndex}>{(index + 1) % 10}</span>
            <span>{step === null ? '.' : step}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

const wrap: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
}
const title: CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: 1,
  textTransform: 'uppercase',
  color: menuTheme.textMuted,
}
const grid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(8, minmax(36px, 1fr))',
  gap: 6,
}
const cellBase: CSSProperties = {
  minHeight: 44,
  borderRadius: 8,
  fontFamily: 'monospace',
  fontWeight: 800,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
}
const cellRest: CSSProperties = {
  ...cellBase,
  border: `1px solid ${menuTheme.ghostBorder}`,
  background: menuTheme.inputBg,
  color: menuTheme.textMuted,
}
const cellOn: CSSProperties = {
  ...cellBase,
  border: `1px solid ${menuTheme.accent}`,
  background: 'rgba(255,107,53,0.18)',
  color: menuTheme.textPrimary,
}
const cellIndex: CSSProperties = {
  fontSize: 10,
  opacity: 0.65,
}
