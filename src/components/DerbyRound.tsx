'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { DERBY_ARENAS } from '@/lib/derbyArenas'
import {
  DERBY_VEHICLES,
  type DerbyVehicleConfig,
} from '@/lib/derbyVehicles'
import type { DerbyArenaSlug, DerbyVehicleType } from '@/lib/schemas'
import { submitDerbyRun } from '@/lib/derbySubmit'
import { useKeyboard } from '@/hooks/useKeyboard'
import {
  DerbyHUD,
  POPUP_LIFETIME_MS,
  type DamagePopup,
  type DerbyHudState,
} from './DerbyHUD'
import {
  DerbyCanvas,
  type DerbyHitEvent,
  type DerbyHudSnapshot,
  type DerbyRoundSummary,
} from './DerbyCanvas'

// Top-level Derby round host. Owns:
// - the keyboard ref the canvas reads each frame
// - the HUD snapshot state and damage-popup pool
// - the post-round results panel
// The canvas runs the rAF loop and reports hits / round-end through
// callbacks; this component does no per-frame work itself.

const POPUP_POOL_SIZE = 8

interface DerbyRoundProps {
  arenaSlug: DerbyArenaSlug
  vehicle: DerbyVehicleType
  // Called when the player picks "Run it back" so the picker re-mounts
  // the round fresh.
  onRetry: () => void
}

export function DerbyRound({ arenaSlug, vehicle, onRetry }: DerbyRoundProps) {
  const arena = DERBY_ARENAS[arenaSlug]
  const playerConfig = DERBY_VEHICLES[vehicle]

  // CPU vehicle types: pick the three non-player vehicles deterministically
  // by carIdx so the lineup is the same every round for a given player
  // pick. Spec says one of each non-player type; total 4 cars.
  const cpuTypes = useCpuVehicleTypes(vehicle)
  const vehicleConfigs: DerbyVehicleConfig[] = [
    playerConfig,
    ...cpuTypes.map((t) => DERBY_VEHICLES[t]),
  ]

  const keysRef = useKeyboard()

  const [snapshot, setSnapshot] = useState<DerbyHudSnapshot>({
    place: 1,
    totalCars: vehicleConfigs.length,
    carsLeft: vehicleConfigs.length,
    scorePoints: 0,
    health: playerConfig.health,
    maxHealth: playerConfig.health,
  })
  const popupsRef = useRef<DamagePopup[]>([])
  const popupIdRef = useRef(1)
  const [popupsTick, setPopupsTick] = useState(0)
  const [summary, setSummary] = useState<DerbyRoundSummary | null>(null)

  // Trim expired popups every animation frame the round is active. Driven
  // by a rAF since useState would otherwise accumulate stale entries that
  // are still in the popupsRef pool until a new hit shoves them out.
  useEffect(() => {
    if (summary !== null) return
    let raf = 0
    let stopped = false
    function trim() {
      if (stopped) return
      raf = requestAnimationFrame(trim)
      const now = performance.now()
      const before = popupsRef.current.length
      popupsRef.current = popupsRef.current.filter(
        (p) => now - p.createdAtMs < POPUP_LIFETIME_MS,
      )
      if (popupsRef.current.length !== before) {
        setPopupsTick((n) => n + 1)
      }
    }
    raf = requestAnimationFrame(trim)
    return () => {
      stopped = true
      cancelAnimationFrame(raf)
    }
  }, [summary])

  const onHud = useCallback((s: DerbyHudSnapshot) => {
    setSnapshot(s)
  }, [])

  const onHit = useCallback((e: DerbyHitEvent) => {
    const id = popupIdRef.current
    popupIdRef.current = id + 1
    const next: DamagePopup = {
      id,
      amount: e.amount,
      screenX: e.screenX,
      screenY: e.screenY,
      createdAtMs: performance.now(),
    }
    const pool = popupsRef.current
    pool.push(next)
    if (pool.length > POPUP_POOL_SIZE) pool.shift()
    setPopupsTick((n) => n + 1)
  }, [])

  const onRoundEnd = useCallback(
    (outcome: 'win' | 'loss' | 'timeout', s: DerbyRoundSummary) => {
      setSummary(s)
      // Best-effort submit. Wins land on the leaderboard via writeDerbyEntry;
      // losses and timeouts hit the server too so a future analytics path
      // can record participation, but the route only ZADDs on outcome win.
      submitDerbyRun({
        arena: arenaSlug,
        vehicle,
        outcome,
        roundTimeMs: s.roundTimeMs,
        finalHealths: s.finalHealths,
        kills: s.kills,
        scorePoints: s.scorePoints,
      }).catch(() => {})
    },
    [arenaSlug, vehicle],
  )

  // popupsTick reads popupsRef into a memoized HUD state so the HUD
  // re-renders when we push or evict popups.
  const hudState: DerbyHudState = {
    ...snapshot,
    popups: popupsRef.current,
    nowMs: performance.now(),
  }

  return (
    <main style={pageStyle}>
      <DerbyCanvas
        arena={arena}
        vehicleConfigs={vehicleConfigs}
        keysRef={keysRef}
        onHud={onHud}
        onHit={onHit}
        onRoundEnd={onRoundEnd}
      />
      <DerbyHUD state={hudState} />
      {summary !== null ? (
        <ResultsPanel
          arenaName={arena.displayName}
          summary={summary}
          onRetry={onRetry}
        />
      ) : null}
      {/* tick marker so the popups state change forces a re-render */}
      <span style={{ display: 'none' }} data-popups-tick={popupsTick} />
    </main>
  )
}

function ResultsPanel({
  arenaName,
  summary,
  onRetry,
}: {
  arenaName: string
  summary: DerbyRoundSummary
  onRetry: () => void
}) {
  const headline =
    summary.outcome === 'win'
      ? 'You won the derby'
      : summary.outcome === 'loss'
        ? 'You were destroyed'
        : 'Time elapsed'
  const timeStr = `${(summary.roundTimeMs / 1000).toFixed(2)}s`
  return (
    <div style={resultsOverlay} data-derby-results="true">
      <div style={resultsCard}>
        <h2 style={resultsTitle}>{headline}</h2>
        <p style={resultsSubtitle}>{arenaName}</p>
        <div style={resultsStats}>
          <Stat label="TIME" value={timeStr} />
          <Stat label="KILLS" value={String(summary.kills)} />
          <Stat label="SCORE" value={String(summary.scorePoints)} />
        </div>
        <div style={resultsButtons}>
          <button type="button" style={primaryBtn} onClick={onRetry}>
            Run it back
          </button>
          <Link href="/derby" style={secondaryBtn}>
            Back to derby hub
          </Link>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={statBlock}>
      <div style={statLabel}>{label}</div>
      <div style={statValue}>{value}</div>
    </div>
  )
}

// Pick three CPU vehicle types given the player's pick. Strategy:
// preserve a varied lineup by always including one of each non-player
// vehicle type. With four shipping types and the player taking one, the
// remaining three slots fall out naturally.
function useCpuVehicleTypes(player: DerbyVehicleType): DerbyVehicleType[] {
  const types: DerbyVehicleType[] = ['car', 'schoolBus', 'bigTruck', 'racecar']
  return types.filter((t) => t !== player)
}

const pageStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: '#000',
  color: '#fff',
  overflow: 'hidden',
}
const resultsOverlay: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  background: 'rgba(0,0,0,0.7)',
  display: 'grid',
  placeItems: 'center',
  // Sits above every fixed app surface (HUD, dev toolbars) so the modal
  // cannot be obscured by a higher stacking layer below.
  zIndex: 1000,
}
const resultsCard: React.CSSProperties = {
  background: '#161616',
  border: '1px solid #2a2a2a',
  borderRadius: 16,
  padding: 24,
  width: 'min(420px, 90%)',
  display: 'grid',
  gap: 16,
  textAlign: 'center',
  boxShadow: '0 20px 50px rgba(0,0,0,0.55)',
}
const resultsTitle: React.CSSProperties = {
  margin: 0,
  fontSize: 28,
  fontWeight: 800,
  letterSpacing: 0.5,
}
const resultsSubtitle: React.CSSProperties = {
  margin: 0,
  fontSize: 14,
  opacity: 0.7,
}
const resultsStats: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: 10,
}
const statBlock: React.CSSProperties = {
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 10,
  padding: '10px 8px',
  fontVariantNumeric: 'tabular-nums',
}
const statLabel: React.CSSProperties = {
  fontSize: 10,
  letterSpacing: 1.5,
  opacity: 0.6,
}
const statValue: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 700,
}
const resultsButtons: React.CSSProperties = {
  display: 'grid',
  gap: 8,
}
const primaryBtn: React.CSSProperties = {
  padding: '12px 14px',
  background: '#e84a5f',
  color: '#fff',
  border: 0,
  borderRadius: 10,
  fontFamily: 'inherit',
  fontSize: 16,
  fontWeight: 700,
  cursor: 'pointer',
}
const secondaryBtn: React.CSSProperties = {
  padding: '10px 14px',
  background: 'rgba(255,255,255,0.1)',
  color: '#fff',
  border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: 10,
  fontFamily: 'inherit',
  fontSize: 14,
  fontWeight: 600,
  textDecoration: 'none',
}
