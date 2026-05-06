'use client'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import {
  isStockParams,
  isTrackPinned,
  readLastLoaded,
  readPerTrack,
} from '@/lib/tuningSettings'
import { readSavedTunings, type SavedTuning } from '@/lib/tuningLab'
import type { CarParams } from '@/game/physics'
import type { LeaderboardResponse } from '@/lib/leaderboard'
import {
  buildPreRaceOptions,
  type PreRaceSetupOption,
  type PreRaceTopEntry,
} from '@/lib/preRaceSetup'
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
  versionHash: string
  // Snapshot of the track author's car setup at save time. Null when the
  // version predates this field, in which case the "Track creator's setup"
  // option simply does not render.
  creatorTuning: CarParams | null
  onConfirm: (result: PreRaceSetupResult) => void
}

const OPEN_LAB_PROMPT =
  'Leave this race to open the Tuning Lab? You can pick a setup again when you come back.'

// Player-facing pre-race tuning picker. The picker now spells out the name
// of every choice (no more "Saved setup for this track" mystery box) and
// shows the highlighted choice in a header strip so it is always obvious
// which setup is about to drive the race. Pinning a track suppresses this
// modal entirely on the next visit; the pause menu's "Change car setup"
// action is the explicit override.
export function PreRaceSetup({
  slug,
  versionHash,
  creatorTuning,
  onConfirm,
}: Props) {
  const router = useRouter()
  const [hydrated, setHydrated] = useState(false)
  const [lastLoaded, setLastLoaded] = useState<CarParams | null>(null)
  const [perTrack, setPerTrack] = useState<CarParams | null>(null)
  const [pinned, setPinned] = useState(false)
  const [savedList, setSavedList] = useState<SavedTuning[]>([])
  const [topEntry, setTopEntry] = useState<PreRaceTopEntry | null>(null)

  useEffect(() => {
    setLastLoaded(readLastLoaded())
    setPerTrack(readPerTrack(slug))
    setPinned(isTrackPinned(slug))
    setSavedList(readSavedTunings())
    setHydrated(true)
  }, [slug])

  // Fetch the top leaderboard entry so we can offer "Top of the
  // leaderboard" as a one-click setup. The endpoint is best-effort: any
  // failure (no laps, network blip, missing meta) just hides the option
  // rather than blocking the modal. Reset state at the start of every
  // effect run, write the resolved value (including null) directly, and
  // gate the state write on a per-effect `cancelled` flag so a
  // (slug, version) change can never paint the previous track's entry
  // even if the prior fetch resolved between abort and cleanup.
  useEffect(() => {
    let cancelled = false
    setTopEntry(null)
    const controller = new AbortController()
    fetchTopEntry(slug, versionHash, controller.signal)
      .then((entry) => {
        if (!cancelled) setTopEntry(entry)
      })
      .catch(() => {})
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [slug, versionHash])

  const options: PreRaceSetupOption[] = useMemo(
    () =>
      buildPreRaceOptions({
        perTrack,
        lastLoaded,
        creatorTuning,
        topEntry,
        savedList,
      }),
    [perTrack, lastLoaded, creatorTuning, topEntry, savedList],
  )

  const [pickId, setPickId] = useState<string | null>(null)
  const [pin, setPin] = useState(false)

  // Pre-select the first option once we have hydrated state. Pinned tracks
  // pre-check pin so a quick re-pin is one click. Unpinned tracks default
  // pin off so a casual one-shot pick does not silently suppress next
  // visit's modal.
  useEffect(() => {
    if (!hydrated || pickId !== null) return
    setPickId(options[0]?.id ?? null)
    setPin(pinned)
  }, [hydrated, options, pinned, pickId])

  // The pickId/selected pair is internally consistent only after the
  // hydration pass has assigned a pickId. Bail until then so the
  // "Selected" banner and the radio rows always agree on the first paint.
  if (!hydrated || pickId === null) return null
  const selected = options.find((o) => o.id === pickId) ?? options[0]
  if (!selected) return null

  function handleRace() {
    onConfirm({ params: selected.params, pin })
  }

  function handleOpenLab() {
    if (typeof window !== 'undefined' && !window.confirm(OPEN_LAB_PROMPT)) {
      return
    }
    router.push('/tune')
  }

  return (
    <MenuOverlay zIndex={150} autoFocus>
      <MenuPanel width="narrow">
        <MenuTitle>SETUP</MenuTitle>
        <SelectedBanner option={selected} />
        <MenuHint>
          The highlighted setup is what your car will use this race. Toggle
          {' '}
          <strong>Always use this setup</strong> below to skip this picker on
          your next visit.
        </MenuHint>

        <div style={radioListStyle} role="radiogroup" aria-label="Race setup">
          {options.map((o) => (
            <RadioRow
              key={o.id}
              option={o}
              selected={o.id === pickId}
              onPick={() => setPickId(o.id)}
            />
          ))}
        </div>

        <MenuButton variant="ghost" onClick={handleOpenLab}>
          Create a new tuning in the Lab
        </MenuButton>

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

function SelectedBanner({ option }: { option: PreRaceSetupOption }) {
  return (
    <div style={selectedBannerStyle} aria-live="polite">
      <span style={selectedLabelStyle}>Selected</span>
      <span style={selectedNameStyle}>{option.label}</span>
      {isStockParams(option.params) ? (
        <span style={stockTagStyle}>STOCK</span>
      ) : null}
    </div>
  )
}

function RadioRow({
  option,
  selected,
  onPick,
}: {
  option: PreRaceSetupOption
  selected: boolean
  onPick: () => void
}) {
  const ref = useRef<HTMLButtonElement | null>(null)
  useRegisterFocusable(ref, { axis: 'vertical', onActivate: onPick })
  const stock = isStockParams(option.params)
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
      <span style={radioRowTextStyle}>
        <span style={radioRowLabelStyle}>{option.label}</span>
        {option.sublabel ? (
          <span
            style={{
              ...radioRowSublabelStyle,
              opacity: selected ? 0.85 : 0.6,
            }}
          >
            {option.sublabel}
          </span>
        ) : null}
      </span>
      {stock ? <span style={stockTagStyle}>STOCK</span> : null}
    </button>
  )
}

async function fetchTopEntry(
  slug: string,
  versionHash: string,
  signal: AbortSignal,
): Promise<PreRaceTopEntry | null> {
  const url = `/api/leaderboard?slug=${encodeURIComponent(slug)}&v=${encodeURIComponent(
    versionHash,
  )}&limit=1`
  const res = await fetch(url, { signal })
  if (!res.ok) return null
  const body = (await res.json()) as LeaderboardResponse
  const top = body.entries[0]
  if (!top || !top.tuning) return null
  return {
    initials: top.initials,
    lapTimeMs: top.lapTimeMs,
    params: top.tuning,
  }
}

const radioListStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  maxHeight: 260,
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

const radioRowTextStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  minWidth: 0,
}

const radioRowLabelStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
}

const radioRowSublabelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: 0.2,
}

const stockTagStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: 1.2,
  opacity: 0.7,
}

const selectedBannerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '8px 12px',
  borderRadius: 8,
  border: `1px solid ${menuTheme.accentBg}`,
  background: 'rgba(255, 107, 53, 0.12)',
}

const selectedLabelStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: 1.6,
  textTransform: 'uppercase',
  color: menuTheme.accent,
}

const selectedNameStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  color: 'white',
  flex: 1,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}
