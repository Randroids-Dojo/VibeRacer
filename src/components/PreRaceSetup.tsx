'use client'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import {
  cloneDefaultParams,
  isStockParams,
  isTrackPinned,
  isTrackDecided,
  readLastLoaded,
  readPerTrack,
} from '@/lib/tuningSettings'
import { readSavedTunings, type SavedTuning } from '@/lib/tuningLab'
import type { CarParams } from '@/game/physics'
import {
  MenuButton,
  MenuHint,
  MenuOverlay,
  MenuPanel,
  MenuTitle,
  MenuToggle,
  menuTheme,
} from './MenuUI'
import { useRegisterFocusable } from './MenuNav'

export interface PreRaceSetupResult {
  params: CarParams
  pin: boolean
}

interface Props {
  slug: string
  onConfirm: (result: PreRaceSetupResult) => void
}

interface Option {
  id: string
  label: string
  params: CarParams
}

// Player-facing pre-race tuning picker. Shows a simple radio list of every
// reasonable starting setup (the global last-used carryover, the per-track
// save when one exists, the saved tunings library, and a default-car
// fallback) plus a single pin toggle controlling whether the picked setup
// becomes this track's pinned default. The host transitions out of the
// 'preRace' phase via onConfirm.
export function PreRaceSetup({ slug, onConfirm }: Props) {
  const [hydrated, setHydrated] = useState(false)
  const [lastLoaded, setLastLoaded] = useState<CarParams | null>(null)
  const [perTrack, setPerTrack] = useState<CarParams | null>(null)
  const [pinned, setPinned] = useState(false)
  const [decided, setDecided] = useState(false)
  const [savedList, setSavedList] = useState<SavedTuning[]>([])

  useEffect(() => {
    setLastLoaded(readLastLoaded())
    setPerTrack(readPerTrack(slug))
    setPinned(isTrackPinned(slug))
    setDecided(isTrackDecided(slug))
    setSavedList(readSavedTunings())
    setHydrated(true)
  }, [slug])

  const options: Option[] = useMemo(() => {
    const list: Option[] = []
    if (perTrack) {
      list.push({ id: 'perTrack', label: 'Saved setup for this track', params: perTrack })
    }
    if (lastLoaded && (!perTrack || !sameParams(lastLoaded, perTrack))) {
      list.push({ id: 'lastLoaded', label: 'Last used setup', params: lastLoaded })
    }
    list.push({ id: 'default', label: 'Default car', params: cloneDefaultParams() })
    for (const t of savedList) {
      list.push({ id: `saved:${t.id}`, label: t.name, params: t.params })
    }
    return list
  }, [perTrack, lastLoaded, savedList])

  const [pickId, setPickId] = useState<string | null>(null)
  const [pin, setPin] = useState(false)

  // Derive default selection + pin state once we have hydrated data and the
  // option list. Pinned tracks pre-select the per-track save. Legacy tracks
  // (have a per-track save but the player has not yet been asked) also
  // pre-select the per-track save and pre-check pin so just hitting Race
  // preserves their existing experience. Otherwise the global last-used
  // carryover is the default.
  useEffect(() => {
    if (!hydrated || pickId !== null) return
    let initialPick: string
    let initialPin = pinned
    if (perTrack && (pinned || !decided)) {
      initialPick = 'perTrack'
      if (!decided) initialPin = true
    } else if (lastLoaded) {
      initialPick = 'lastLoaded'
    } else {
      initialPick = 'default'
    }
    if (!options.some((o) => o.id === initialPick)) {
      initialPick = options[0]?.id ?? 'default'
    }
    setPickId(initialPick)
    setPin(initialPin)
  }, [hydrated, options, perTrack, pinned, decided, lastLoaded, pickId])

  function handleRace() {
    const opt = options.find((o) => o.id === pickId) ?? options[0]
    if (!opt) return
    onConfirm({ params: opt.params, pin })
  }

  if (!hydrated || pickId === null) return null

  return (
    <MenuOverlay zIndex={150} autoFocus>
      <MenuPanel width="narrow">
        <MenuTitle>SETUP</MenuTitle>
        <MenuHint>
          Pick a car setup for this race. Whatever you pick becomes your
          carryover for the next track too.
        </MenuHint>

        <div style={radioListStyle} role="radiogroup" aria-label="Race setup">
          {options.map((o) => {
            const selected = o.id === pickId
            return (
              <RadioRow
                key={o.id}
                label={o.label}
                stock={isStockParams(o.params)}
                selected={selected}
                onPick={() => setPickId(o.id)}
              />
            )
          })}
        </div>

        <MenuToggle
          label="Always use this setup for this track"
          value={pin}
          onChange={setPin}
        />

        <MenuButton variant="primary" onClick={handleRace}>
          Start race
        </MenuButton>
      </MenuPanel>
    </MenuOverlay>
  )
}

function RadioRow({
  label,
  stock,
  selected,
  onPick,
}: {
  label: string
  stock: boolean
  selected: boolean
  onPick: () => void
}) {
  const ref = useRef<HTMLButtonElement | null>(null)
  useRegisterFocusable(ref, { axis: 'vertical', onActivate: onPick })
  return (
    <button
      ref={ref}
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onPick}
      className="menuui-focusable"
      style={{
        ...radioRowStyle,
        background: selected ? menuTheme.accentBg : menuTheme.rowBg,
        color: selected ? menuTheme.accentText : 'white',
        borderColor: selected ? menuTheme.accentBg : menuTheme.panelBorder,
      }}
    >
      <span style={{ fontSize: 14, fontWeight: 600 }}>{label}</span>
      {stock ? <span style={stockTagStyle}>STOCK</span> : null}
    </button>
  )
}

function sameParams(a: CarParams, b: CarParams): boolean {
  for (const k of Object.keys(a) as Array<keyof CarParams>) {
    if (Math.abs(a[k] - b[k]) > 1e-9) return false
  }
  return true
}

const radioListStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  maxHeight: 280,
  overflowY: 'auto',
  paddingRight: 4,
}

const radioRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  padding: '10px 14px',
  borderRadius: 8,
  border: '1px solid',
  cursor: 'pointer',
  textAlign: 'left',
  fontFamily: 'inherit',
}

const stockTagStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: 1.2,
  opacity: 0.7,
}
