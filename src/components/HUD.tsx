'use client'

function formatLapTime(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '--:--.---'
  const total = Math.max(0, Math.round(ms))
  const minutes = Math.floor(total / 60000)
  const seconds = Math.floor((total % 60000) / 1000)
  const millis = total % 1000
  const mm = String(minutes).padStart(2, '0')
  const ss = String(seconds).padStart(2, '0')
  const mmm = String(millis).padStart(3, '0')
  return `${mm}:${ss}.${mmm}`
}

interface HudProps {
  currentMs: number
  lastLapMs: number | null
  bestSessionMs: number | null
  bestAllTimeMs: number | null
  overallRecord: { initials: string; lapTimeMs: number } | null
  lapCount: number
  onTrack: boolean
  toast: string | null
  initials: string | null
}

function StatBlock({
  label,
  value,
  big,
  alignRight,
}: {
  label: string
  value: string | number
  big?: boolean
  alignRight?: boolean
}) {
  return (
    <div style={{ ...block, ...(alignRight ? alignRightStyle : null) }}>
      <div style={labelStyle}>{label}</div>
      <div style={big ? timeBig : timeSm}>{value}</div>
    </div>
  )
}

function timeOrDash(ms: number | null): string {
  return ms !== null ? formatLapTime(ms) : '--'
}

export function HUD(props: HudProps) {
  const recordValue = props.overallRecord
    ? `${props.overallRecord.initials} ${formatLapTime(props.overallRecord.lapTimeMs)}`
    : '--'
  return (
    <div style={wrap}>
      <div style={topRow}>
        <StatBlock label="CURRENT" value={formatLapTime(props.currentMs)} big />
        <StatBlock label="LAST LAP" value={timeOrDash(props.lastLapMs)} />
        <StatBlock label="BEST (SESSION)" value={timeOrDash(props.bestSessionMs)} />
        <StatBlock label="BEST (ALL TIME)" value={timeOrDash(props.bestAllTimeMs)} />
        <StatBlock label="RECORD" value={recordValue} />
        <StatBlock label="LAP" value={props.lapCount} />
        <StatBlock label="RACER" value={props.initials ?? '---'} alignRight />
      </div>
      {!props.onTrack ? <div style={offTrack}>OFF TRACK</div> : null}
      {props.toast ? <div style={toastStyle}>{props.toast}</div> : null}
    </div>
  )
}

const wrap: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  pointerEvents: 'none',
  color: 'white',
  fontFamily: 'system-ui, sans-serif',
  textShadow: '0 1px 4px rgba(0,0,0,0.6)',
  zIndex: 10,
}
const topRow: React.CSSProperties = {
  position: 'absolute',
  top: 12,
  left: 16,
  right: 16,
  display: 'flex',
  gap: 24,
  alignItems: 'flex-start',
}
const block: React.CSSProperties = {
  background: 'rgba(0,0,0,0.35)',
  padding: '6px 10px',
  borderRadius: 6,
  minWidth: 90,
}
const alignRightStyle: React.CSSProperties = { marginLeft: 'auto' }
const labelStyle: React.CSSProperties = {
  fontSize: 10,
  opacity: 0.75,
  letterSpacing: 1.5,
}
const timeBig: React.CSSProperties = {
  fontSize: 28,
  fontFamily: 'monospace',
  fontWeight: 700,
}
const timeSm: React.CSSProperties = {
  fontSize: 18,
  fontFamily: 'monospace',
}
const offTrack: React.CSSProperties = {
  position: 'absolute',
  top: '18%',
  left: 0,
  right: 0,
  textAlign: 'center',
  fontSize: 32,
  fontWeight: 800,
  color: '#ffb34d',
}
const toastStyle: React.CSSProperties = {
  position: 'absolute',
  top: '30%',
  left: 0,
  right: 0,
  textAlign: 'center',
  fontSize: 28,
  fontWeight: 700,
  color: '#5fe08a',
  animation: 'fade 1.6s linear',
}
