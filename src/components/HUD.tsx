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
  toastKind: 'lap' | 'pb' | 'record' | null
  initials: string | null
}

const HUD_ANIMATIONS_CSS = `
@keyframes viberacer-fade { 0% { opacity: 1 } 100% { opacity: 0 } }
@keyframes viberacer-burst {
  0% { transform: translate(-50%, -50%) scale(0); opacity: 0.95 }
  60% { opacity: 0.6 }
  100% { transform: translate(-50%, -50%) scale(2.4); opacity: 0 }
}
@keyframes viberacer-edgeflash {
  0% { opacity: 0.0 }
  20% { opacity: 1 }
  100% { opacity: 0 }
}
`

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
  const celebrate = props.toastKind === 'pb' || props.toastKind === 'record'
  const isRecord = props.toastKind === 'record'
  return (
    <div style={wrap}>
      <style>{HUD_ANIMATIONS_CSS}</style>
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
      {celebrate ? (
        <>
          <div
            key={`burst-${isRecord ? 'r' : 'p'}-${props.toast}`}
            style={isRecord ? burstRecord : burstPb}
            aria-hidden
          />
          <div
            key={`flash-${isRecord ? 'r' : 'p'}-${props.toast}`}
            style={isRecord ? edgeFlashRecord : edgeFlashPb}
            aria-hidden
          />
        </>
      ) : null}
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
  top: 8,
  left: 8,
  right: 8,
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
  rowGap: 6,
  alignItems: 'flex-start',
}
const block: React.CSSProperties = {
  background: 'rgba(0,0,0,0.35)',
  padding: '4px 8px',
  borderRadius: 6,
  minWidth: 64,
}
const alignRightStyle: React.CSSProperties = { marginLeft: 'auto' }
const labelStyle: React.CSSProperties = {
  fontSize: 10,
  opacity: 0.75,
  letterSpacing: 1.5,
}
const timeBig: React.CSSProperties = {
  fontSize: 'clamp(18px, 5vw, 28px)',
  fontFamily: 'monospace',
  fontWeight: 700,
  lineHeight: 1.1,
}
const timeSm: React.CSSProperties = {
  fontSize: 'clamp(13px, 3.5vw, 18px)',
  fontFamily: 'monospace',
  lineHeight: 1.1,
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
  animation: 'viberacer-fade 1.6s linear',
}
const burstBase: React.CSSProperties = {
  position: 'absolute',
  top: '36%',
  left: '50%',
  width: 240,
  height: 240,
  borderRadius: '50%',
  pointerEvents: 'none',
  transform: 'translate(-50%, -50%) scale(0)',
  animation: 'viberacer-burst 1s ease-out forwards',
}
const burstPb: React.CSSProperties = {
  ...burstBase,
  background:
    'radial-gradient(circle, rgba(95,224,138,0.85) 0%, rgba(95,224,138,0.35) 45%, rgba(95,224,138,0) 70%)',
}
const burstRecord: React.CSSProperties = {
  ...burstBase,
  background:
    'radial-gradient(circle, rgba(255,210,90,0.9) 0%, rgba(255,170,60,0.4) 45%, rgba(255,140,40,0) 70%)',
}
const edgeFlashBase: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
  opacity: 0,
  animation: 'viberacer-edgeflash 0.7s ease-out forwards',
}
const edgeFlashPb: React.CSSProperties = {
  ...edgeFlashBase,
  boxShadow: 'inset 0 0 80px rgba(95,224,138,0.7)',
}
const edgeFlashRecord: React.CSSProperties = {
  ...edgeFlashBase,
  boxShadow: 'inset 0 0 90px rgba(255,200,80,0.85)',
}
