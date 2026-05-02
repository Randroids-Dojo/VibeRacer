'use client'
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { MenuButton, MenuToggle, menuTheme } from './MenuUI'
import {
  getActiveMusicStep,
  setGameIntensity,
  setMusicLapIndex,
  setMusicOffTrack,
} from '@/game/music'

export type LoopLength = 1 | 2 | 4

const LOOP_LENGTHS: readonly LoopLength[] = [1, 2, 4]
const STEPS_PER_BAR = 16
const AUTO_SWEEP_PERIOD_SEC = 8
const AUTO_SWEEP_TICK_MS = 60

/**
 * Sticky transport bar pinned to the top of the music editor. Owns playback
 * state (Play / Stop, loop length grouping for the bar counter, simulated
 * intensity / lap / off-track inputs) and emits the current 16th-note step so
 * voice grids can show a playhead that lines up with audible playback.
 *
 * The engine loops the game track every 16 steps automatically. The
 * `loopLength` selector here groups bars for the on-screen counter and for an
 * optional auto-sweep that oscillates intensity over an 8-bar cycle, so the
 * user can audition the dynamic curve without holding a slider.
 */
export function MusicTransport({
  playing,
  onPlayToggle,
}: {
  playing: boolean
  onPlayToggle: () => void
}) {
  const [loopLength, setLoopLength] = useState<LoopLength>(1)
  const [step, setStep] = useState(0)
  const [bar, setBar] = useState(1)
  const [loopCount, setLoopCount] = useState(0)
  const [intensity, setIntensity] = useState(0.5)
  const [autoSweep, setAutoSweep] = useState(false)
  const [lap, setLap] = useState(0)
  const [offTrack, setOffTrack] = useState(false)

  const lastStepRef = useRef(-1)
  const sweepStartRef = useRef<number | null>(null)
  const intensityRef = useRef(intensity)
  intensityRef.current = intensity

  // Poll the engine's current step and roll the bar / loop counters.
  useEffect(() => {
    if (!playing) {
      setStep(0)
      setBar(1)
      setLoopCount(0)
      lastStepRef.current = -1
      return
    }
    let raf = 0
    const tick = () => {
      const current = getActiveMusicStep()
      if (current !== null) {
        if (current !== lastStepRef.current) {
          if (lastStepRef.current >= 0 && current < lastStepRef.current) {
            setBar((prev) => {
              const next = prev + 1
              if (next > loopLength) {
                setLoopCount((c) => c + 1)
                return 1
              }
              return next
            })
          }
          setStep(current)
          lastStepRef.current = current
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, loopLength])

  // Push the simulated intensity to the engine so live preview reflects it.
  useEffect(() => {
    setGameIntensity(intensity)
  }, [intensity])

  useEffect(() => {
    setMusicLapIndex(lap)
  }, [lap])

  useEffect(() => {
    setMusicOffTrack(offTrack)
  }, [offTrack])

  // Auto-sweep oscillates intensity across an 8-bar cycle. Implemented as a
  // setInterval rather than rAF since the cadence is coarse and the loop
  // would otherwise battle the playhead poller for frame budget.
  useEffect(() => {
    if (!autoSweep || !playing) return
    sweepStartRef.current = performance.now()
    const id = setInterval(() => {
      const start = sweepStartRef.current ?? performance.now()
      const elapsed = (performance.now() - start) / 1000
      const phase = (elapsed % AUTO_SWEEP_PERIOD_SEC) / AUTO_SWEEP_PERIOD_SEC
      const next = 0.5 + 0.5 * Math.sin(phase * Math.PI * 2)
      intensityRef.current = next
      setIntensity(next)
    }, AUTO_SWEEP_TICK_MS)
    return () => clearInterval(id)
  }, [autoSweep, playing])

  return (
    <div style={wrap} aria-label="Music transport">
      <div style={topRow}>
        <MenuButton
          variant={playing ? 'ghost' : 'primary'}
          fullWidth={false}
          onClick={onPlayToggle}
          click="confirm"
        >
          {playing ? 'Stop' : 'Play'}
        </MenuButton>
        <div style={loopChips} role="radiogroup" aria-label="Loop length">
          {LOOP_LENGTHS.map((value) => {
            const active = value === loopLength
            return (
              <button
                type="button"
                key={value}
                role="radio"
                aria-checked={active}
                onClick={() => setLoopLength(value)}
                style={active ? chipActive : chipInactive}
              >
                {value} bar{value === 1 ? '' : 's'}
              </button>
            )
          })}
        </div>
        <div style={counterStyle}>
          <span style={counterStrong}>Bar {bar}</span>
          <span style={counterMuted}>of {loopLength}</span>
          <span style={counterMuted}>· loop {loopCount}</span>
        </div>
      </div>
      <Playhead step={step} active={playing} />
      <div style={simRow}>
        <label style={simLabel}>
          <span style={simLabelText}>Intensity</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={intensity}
            disabled={autoSweep}
            onChange={(event) => setIntensity(Number(event.target.value))}
            style={sliderStyle}
          />
          <span style={simValue}>{Math.round(intensity * 100)}%</span>
        </label>
        <MenuToggle
          label="Auto-sweep"
          value={autoSweep}
          onChange={setAutoSweep}
        />
        <div style={lapStepper}>
          <span style={simLabelText}>Sim lap</span>
          <button
            type="button"
            style={stepBtn}
            onClick={() => setLap((v) => Math.max(0, v - 1))}
            aria-label="Decrease simulated lap"
          >
            -
          </button>
          <span style={lapValue}>{lap}</span>
          <button
            type="button"
            style={stepBtn}
            onClick={() => setLap((v) => v + 1)}
            aria-label="Increase simulated lap"
          >
            +
          </button>
        </div>
        <MenuToggle
          label="Off-track"
          value={offTrack}
          onChange={setOffTrack}
        />
      </div>
    </div>
  )
}

function Playhead({ step, active }: { step: number; active: boolean }) {
  return (
    <div style={playheadWrap} aria-hidden>
      {Array.from({ length: STEPS_PER_BAR }, (_, index) => {
        const on = active && index === step
        return (
          <div
            key={index}
            style={{
              ...playheadCell,
              background: on ? menuTheme.accent : menuTheme.ghostBorder,
              opacity: on ? 1 : 0.5,
            }}
          />
        )
      })}
    </div>
  )
}

const wrap: CSSProperties = {
  position: 'sticky',
  top: 0,
  zIndex: 5,
  background: 'rgba(22,22,22,0.96)',
  backdropFilter: 'blur(6px)',
  padding: '12px 14px',
  borderRadius: 10,
  border: `1px solid ${menuTheme.panelBorder}`,
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
}
const topRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  flexWrap: 'wrap',
}
const loopChips: CSSProperties = {
  display: 'flex',
  gap: 4,
  background: menuTheme.inputBg,
  borderRadius: 8,
  padding: 3,
  border: `1px solid ${menuTheme.ghostBorder}`,
}
const chipBase: CSSProperties = {
  border: 'none',
  background: 'transparent',
  color: menuTheme.textMuted,
  borderRadius: 6,
  padding: '6px 10px',
  fontSize: 13,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'inherit',
}
const chipActive: CSSProperties = {
  ...chipBase,
  background: menuTheme.accent,
  color: menuTheme.accentText,
}
const chipInactive: CSSProperties = chipBase
const counterStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 6,
  marginLeft: 'auto',
  fontFamily: 'monospace',
  fontSize: 13,
}
const counterStrong: CSSProperties = {
  fontWeight: 800,
  color: menuTheme.textPrimary,
}
const counterMuted: CSSProperties = {
  color: menuTheme.textMuted,
}
const playheadWrap: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: `repeat(${STEPS_PER_BAR}, 1fr)`,
  gap: 4,
  height: 6,
  borderRadius: 3,
  overflow: 'hidden',
}
const playheadCell: CSSProperties = {
  height: '100%',
  borderRadius: 2,
  transition: 'background 80ms linear, opacity 80ms linear',
}
const simRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  flexWrap: 'wrap',
}
const simLabel: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flex: '1 1 200px',
  minWidth: 200,
}
const simLabelText: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: 0.6,
  textTransform: 'uppercase',
  color: menuTheme.textMuted,
}
const sliderStyle: CSSProperties = {
  flex: 1,
  accentColor: menuTheme.accent,
  height: 24,
}
const simValue: CSSProperties = {
  fontFamily: 'monospace',
  fontSize: 13,
  width: 42,
  textAlign: 'right',
  color: menuTheme.textPrimary,
}
const lapStepper: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
}
const stepBtn: CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: 6,
  border: `1px solid ${menuTheme.ghostBorder}`,
  background: menuTheme.inputBg,
  color: menuTheme.textPrimary,
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 16,
  fontWeight: 700,
}
const lapValue: CSSProperties = {
  fontFamily: 'monospace',
  fontWeight: 700,
  width: 28,
  textAlign: 'center',
}

