'use client'
import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { MenuButton, MenuToggle, menuTheme } from './MenuUI'
import {
  applyVibePad,
  vibeFromMusic,
  vibeLabel,
  type VibePadPosition,
} from '@/lib/musicVibe'
import {
  generateMusicFromSeed,
  type TrackMusic,
} from '@/lib/trackMusic'

const ROLL_SUFFIXES = [
  'pulse',
  'drift',
  'rush',
  'echo',
  'glow',
  'midnight',
  'sunset',
  'nebula',
  'arcade',
  'breeze',
  'static',
  'cascade',
] as const

const ROLL_PREFIXES = [
  'neon',
  'velvet',
  'turbo',
  'paper',
  'cosmic',
  'gritty',
  'lunar',
  'pixel',
  'twilight',
  'crystal',
  'sodium',
  'ember',
] as const

const ROLL_REELS: Array<readonly string[]> = [
  ROLL_PREFIXES,
  ROLL_SUFFIXES,
  ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
]

const ROLL_DURATION_MS = 700

function randomSeedWord(): string {
  const prefix = ROLL_PREFIXES[Math.floor(Math.random() * ROLL_PREFIXES.length)]
  const suffix = ROLL_SUFFIXES[Math.floor(Math.random() * ROLL_SUFFIXES.length)]
  return `${prefix} ${suffix}`
}

function randomVibe(): VibePadPosition {
  return { energy: Math.random(), mood: Math.random() }
}

/**
 * The "vibing" surface. A 2D drag pad whose puck position drives the music's
 * energy and mood dimensions. Roll re-seeds the rhythm bytes via
 * `generateMusicFromSeed`, then re-applies the current pad position so a
 * locked vibe survives a fresh shuffle. Lock pins the puck.
 */
export function MusicVibePad({
  music,
  onMusicChange,
}: {
  music: TrackMusic
  onMusicChange: (music: TrackMusic) => void
}) {
  const padId = useId()
  const padRef = useRef<HTMLDivElement | null>(null)
  const [vibe, setVibe] = useState<VibePadPosition>(() => vibeFromMusic(music))
  const [seed, setSeed] = useState(music.seedWord ?? '')
  const [locked, setLocked] = useState(false)
  const [rolling, setRolling] = useState(false)
  const [reels, setReels] = useState(['', '', ''])
  const seedRef = useRef(seed)
  seedRef.current = seed
  const lockedRef = useRef(locked)
  lockedRef.current = locked
  // Set whenever this component itself emits a music change (drag, Roll). The
  // resulting prop bounce-back skips the re-derive below, so a user dragging
  // the puck through a scale boundary does not see the puck snap to the
  // quantized mood mid-drag. Cleared on the next effect run.
  const internalCommitRef = useRef(false)

  // Re-derive the puck position only when the music came from outside the
  // pad (e.g. library load, slider edit, fresh seed roll). vibeFromMusic
  // quantizes mood across discrete scale flavors, so calling it on every
  // pad-driven commit would visibly snap the puck.
  useEffect(() => {
    if (internalCommitRef.current) {
      internalCommitRef.current = false
      return
    }
    setVibe(vibeFromMusic(music))
    if (music.seedWord && music.seedWord !== seedRef.current) {
      setSeed(music.seedWord)
    }
  }, [music])

  function commit(nextVibe: VibePadPosition, base: TrackMusic = music): void {
    const next = applyVibePad(base, nextVibe)
    internalCommitRef.current = true
    onMusicChange(next)
  }

  function handlePointer(event: React.PointerEvent<HTMLDivElement>): void {
    const pad = padRef.current
    if (!pad) return
    const rect = pad.getBoundingClientRect()
    const x = (event.clientX - rect.left) / rect.width
    const y = 1 - (event.clientY - rect.top) / rect.height
    const next = {
      energy: Math.max(0, Math.min(1, x)),
      mood: Math.max(0, Math.min(1, y)),
    }
    setVibe(next)
    commit(next)
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>): void {
    if (locked) return
    const pad = padRef.current
    if (!pad) return
    pad.setPointerCapture(event.pointerId)
    handlePointer(event)
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>): void {
    if (locked) return
    if (event.buttons === 0) return
    handlePointer(event)
  }

  function onPointerUp(event: React.PointerEvent<HTMLDivElement>): void {
    const pad = padRef.current
    if (pad?.hasPointerCapture(event.pointerId)) {
      pad.releasePointerCapture(event.pointerId)
    }
  }

  // Slot-machine animation. Cycles through reel labels for ~700 ms then
  // settles on the rolled values. The actual music change happens at start so
  // the user hears the new vibe before the visual settles.
  function roll(): void {
    if (rolling) return
    const word = (seedRef.current.trim() || randomSeedWord())
    setSeed(word)
    const generated = generateMusicFromSeed(word)
    const padPosition = lockedRef.current
      ? vibe
      : (() => {
          const fresh = randomVibe()
          setVibe(fresh)
          return fresh
        })()
    const next = applyVibePad(generated, padPosition)
    internalCommitRef.current = true
    onMusicChange(next)
    setRolling(true)
    const start = performance.now()
    const id = window.setInterval(() => {
      const reelValues = ROLL_REELS.map(
        (options) => options[Math.floor(Math.random() * options.length)],
      )
      setReels(reelValues)
      if (performance.now() - start >= ROLL_DURATION_MS) {
        window.clearInterval(id)
        setReels([
          word.split(' ')[0] ?? word,
          word.split(' ')[1] ?? '',
          generated.scale.toUpperCase().slice(0, 3),
        ])
        setRolling(false)
      }
    }, 70)
  }

  function setSeedAndRoll(): void {
    if (!seed.trim()) {
      setSeed(randomSeedWord())
    }
    roll()
  }

  const energyPct = `${(vibe.energy * 100).toFixed(0)}%`
  const moodPct = `${(vibe.mood * 100).toFixed(0)}%`
  const label = vibeLabel(vibe)
  const puckLeft = `${vibe.energy * 100}%`
  const puckTop = `${(1 - vibe.mood) * 100}%`

  return (
    <div style={wrap} aria-label="Vibe pad">
      <div style={padHeader}>
        <span style={vibeLabelText}>Vibe: {label}</span>
        <span style={vibeReadout}>
          energy {energyPct} · mood {moodPct}
        </span>
      </div>
      <div
        ref={padRef}
        id={padId}
        aria-label="Drag to set music energy and mood"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{
          ...padStyle,
          cursor: locked ? 'not-allowed' : 'crosshair',
          touchAction: 'none',
        }}
      >
        <span style={{ ...corner, top: 8, left: 10 }}>sunlit drift</span>
        <span style={{ ...corner, top: 8, right: 10, textAlign: 'right' }}>
          neon rush
        </span>
        <span style={{ ...corner, bottom: 8, left: 10 }}>moody cruise</span>
        <span
          style={{ ...corner, bottom: 8, right: 10, textAlign: 'right' }}
        >
          gritty thrash
        </span>
        <div style={axisLabels.x}>energy</div>
        <div style={axisLabels.y}>mood</div>
        <div
          aria-hidden
          style={{
            ...puck,
            left: puckLeft,
            top: puckTop,
            background: locked ? menuTheme.textMuted : menuTheme.accent,
          }}
        />
      </div>
      <div style={controlsRow}>
        <input
          aria-label="Seed word"
          value={seed}
          onChange={(event) => setSeed(event.target.value)}
          placeholder="seed word"
          style={seedInput}
        />
        <MenuButton fullWidth={false} onClick={setSeedAndRoll} click="confirm">
          {rolling ? 'Rolling...' : 'Roll'}
        </MenuButton>
        <MenuToggle label="Lock vibe" value={locked} onChange={setLocked} />
      </div>
      <div style={reelsRow} aria-hidden>
        {reels.map((value, index) => (
          <div key={index} style={reel}>
            <span style={reelLabel}>
              {['groove', 'harmony', 'voicing'][index]}
            </span>
            <span style={reelValue}>{value || '---'}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

const wrap: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
}
const padHeader: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  gap: 12,
}
const vibeLabelText: CSSProperties = {
  fontWeight: 800,
  letterSpacing: 0.5,
  color: menuTheme.textPrimary,
}
const vibeReadout: CSSProperties = {
  fontFamily: 'monospace',
  fontSize: 12,
  color: menuTheme.textMuted,
}
const padStyle: CSSProperties = {
  position: 'relative',
  width: '100%',
  aspectRatio: '1.4 / 1',
  borderRadius: 14,
  border: `1px solid ${menuTheme.panelBorder}`,
  background:
    'radial-gradient(120% 120% at 100% 0%, rgba(255,107,53,0.55), transparent 55%), radial-gradient(120% 120% at 0% 100%, rgba(70,130,200,0.45), transparent 55%), linear-gradient(180deg, #1a1d28 0%, #0c0e15 100%)',
  overflow: 'hidden',
  userSelect: 'none',
}
const corner: CSSProperties = {
  position: 'absolute',
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 0.5,
  textTransform: 'uppercase',
  color: 'rgba(255,255,255,0.55)',
}
const axisLabels = {
  x: {
    position: 'absolute' as const,
    bottom: 4,
    left: '50%',
    transform: 'translateX(-50%)',
    fontSize: 10,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 1.4,
    textTransform: 'uppercase' as const,
  } satisfies CSSProperties,
  y: {
    position: 'absolute' as const,
    top: '50%',
    left: 6,
    transform: 'translateY(-50%) rotate(-90deg)',
    transformOrigin: 'left top',
    fontSize: 10,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 1.4,
    textTransform: 'uppercase' as const,
  } satisfies CSSProperties,
}
const puck: CSSProperties = {
  position: 'absolute',
  width: 28,
  height: 28,
  borderRadius: '50%',
  transform: 'translate(-50%, -50%)',
  border: '3px solid rgba(255,255,255,0.85)',
  boxShadow: '0 4px 14px rgba(0,0,0,0.45)',
  pointerEvents: 'none',
}
const controlsRow: CSSProperties = {
  display: 'flex',
  gap: 10,
  alignItems: 'center',
  flexWrap: 'wrap',
}
const seedInput: CSSProperties = {
  flex: 1,
  minWidth: 160,
  background: menuTheme.inputBg,
  color: menuTheme.textPrimary,
  border: `1px solid ${menuTheme.ghostBorder}`,
  borderRadius: 8,
  padding: '10px 12px',
  font: 'inherit',
}
const reelsRow: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: 8,
}
const reel: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  padding: '6px 8px',
  borderRadius: 8,
  background: menuTheme.inputBg,
  border: `1px solid ${menuTheme.ghostBorder}`,
  gap: 2,
}
const reelLabel: CSSProperties = {
  fontSize: 10,
  letterSpacing: 1,
  textTransform: 'uppercase',
  color: menuTheme.textMuted,
}
const reelValue: CSSProperties = {
  fontFamily: 'monospace',
  fontSize: 13,
  fontWeight: 700,
  color: menuTheme.textPrimary,
}
