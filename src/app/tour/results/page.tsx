'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { getStandardChampionship } from '@/data/worldTourChampionship'
import { findTour } from '@/lib/worldTourChampionship'
import {
  currentChampionshipStandings,
  type RaceResult,
} from '@/game/worldTourRaceResult'
import { buildTourCompletionSummary } from '@/game/worldTourProgress'
import {
  WORLD_TOUR_CAREER_EVENT,
  readCareer,
} from '@/lib/worldTourCareerStorage'
import {
  defaultCareer,
  type WorldTourCareer,
} from '@/game/worldTourCareer'
import { WORLD_TOUR_LAST_RESULT_KEY } from '@/lib/worldTourLastResult'
import { ConfettiOverlay } from '@/components/ConfettiOverlay'
import { ChampionshipStandingsPanel } from '@/components/ChampionshipStandingsPanel'

function readLastResult(): RaceResult | null {
  if (typeof window === 'undefined') return null
  let raw: string | null = null
  try {
    raw = window.sessionStorage.getItem(WORLD_TOUR_LAST_RESULT_KEY)
  } catch {
    return null
  }
  if (!raw) return null
  try {
    return JSON.parse(raw) as RaceResult
  } catch {
    return null
  }
}

export default function TourResultsPage() {
  const championship = useMemo(() => getStandardChampionship(), [])
  const [result, setResult] = useState<RaceResult | null>(null)
  const [career, setCareer] = useState<WorldTourCareer>(() => defaultCareer())

  useEffect(() => {
    setResult(readLastResult())
    setCareer(readCareer())
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<WorldTourCareer>).detail
      if (detail) setCareer(detail)
      else setCareer(readCareer())
    }
    window.addEventListener(WORLD_TOUR_CAREER_EVENT, onChange)
    return () => window.removeEventListener(WORLD_TOUR_CAREER_EVENT, onChange)
  }, [])

  if (!result) {
    return (
      <main style={pageStyle}>
        <div style={stageStyle}>
          <h1 style={headerStyle}>No recent result</h1>
          <p style={tagStyle}>Race through the tour to see your standings here.</p>
          <Link href="/tour" style={ctaStyle}>Back to tours</Link>
        </div>
      </main>
    )
  }

  const summary = buildTourCompletionSummary(championship, result)
  // Fire the celebration once per tour-complete pass.
  const showConfetti = summary?.passed === true
  // Mid-tour: route through the garage so the player can repair and
  // see the next race card before committing. Final-race: send back to
  // the tour selection screen.
  const continueHref = result.nextRace !== null ? '/tour/garage' : '/tour'
  // Mid-tour championship panel: only renders while the active tour
  // cursor is still around. After race 4 applyRaceResult clears
  // activeTour, and the tour summary block below carries the final
  // standing for the player.
  const tourForStandings = findTour(championship, result.tourProgress.tourId)
  const standings =
    tourForStandings && !result.tourProgress.completed
      ? currentChampionshipStandings({
          career,
          tour: tourForStandings,
          championship,
        })
      : null

  return (
    <main style={pageStyle}>
      {showConfetti ? <ConfettiOverlay kind="record" triggerKey={1} /> : null}
      <div style={stageStyle}>
        <header style={headerWrapStyle}>
          <h1 style={headerStyle}>
            Race {result.tourProgress.raceIndex + 1} complete
          </h1>
          <p style={tagStyle}>
            {result.playerDnf
              ? 'DNF.'
              : `You finished ${ordinal(result.playerPlacement)}.`}
          </p>
        </header>

        <section style={panelStyle}>
          <Row label="Placement points" value={result.pointsEarned} />
          <Row label="Race purse" value={`+${result.cashBaseEarned}c`} />
          {result.bonusEarned > 0 ? (
            <Row label="Tour bonus" value={`+${result.bonusEarned}c`} />
          ) : null}
          <Row label="Total earned" value={`+${result.cashEarned}c`} strong />
        </section>

        <section style={panelStyle}>
          <h2 style={subheaderStyle}>Finishing order</h2>
          <ol style={orderListStyle}>
            {result.finishingOrder.map((entry) => (
              <li
                key={entry.carIndex}
                style={{
                  ...orderRowStyle,
                  fontWeight: entry.isPlayer ? 700 : 400,
                }}
              >
                <span>{entry.placement}.</span>
                <span>{entry.isPlayer ? 'You' : (entry.driverId ?? entry.carId)}</span>
                <span style={{ opacity: 0.6 }}>
                  {entry.dnf ? 'DNF' : `${entry.points} pts`}
                </span>
              </li>
            ))}
          </ol>
        </section>

        {tourForStandings && standings ? (
          <ChampionshipStandingsPanel
            tour={tourForStandings}
            rows={standings.rows}
            playerStanding={standings.playerStanding}
            racesCompleted={standings.racesCompleted}
            totalRaces={tourForStandings.trackIds.length}
            requiredStanding={tourForStandings.requiredStanding}
            variant="results"
          />
        ) : null}

        {summary ? (
          <section style={panelStyle}>
            <h2 style={subheaderStyle}>
              Tour {summary.passed ? 'cleared' : 'failed'}
            </h2>
            <p style={{ margin: 0 }}>
              Final standing: {ordinal(summary.playerStanding)} of {summary.fieldSize}.
              {' '}
              {summary.passed
                ? `Top ${summary.requiredStanding} clears the gate.`
                : `Top ${summary.requiredStanding} was required.`}
            </p>
            {summary.passed && summary.nextTourName ? (
              <p style={{ margin: 0 }}>Next: {summary.nextTourName}.</p>
            ) : null}
          </section>
        ) : null}

        <Link href={continueHref} style={ctaStyle}>
          {result.nextRace ? 'To the garage' : 'Back to tours'}
        </Link>
      </div>
    </main>
  )
}

function ordinal(n: number): string {
  if (!Number.isFinite(n) || n < 1) return `${n}`
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`
}

function Row({
  label,
  value,
  strong,
}: {
  label: string
  value: number | string
  strong?: boolean
}) {
  return (
    <div style={rowStyle}>
      <span style={{ opacity: 0.7 }}>{label}</span>
      <span style={{ fontWeight: strong ? 700 : 500 }}>{value}</span>
    </div>
  )
}

const pageStyle: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
  background:
    'radial-gradient(ellipse at top, #2a1a3a 0%, #0a0a0a 60%, #050505 100%)',
  color: '#fff',
  fontFamily: 'system-ui, sans-serif',
}
const stageStyle: React.CSSProperties = {
  width: 'min(640px, 100%)',
  display: 'grid',
  gap: 18,
}
const headerWrapStyle: React.CSSProperties = {
  textAlign: 'center',
}
const headerStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 'clamp(28px, 6vw, 40px)',
  fontWeight: 800,
}
const subheaderStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 18,
  fontWeight: 700,
}
const tagStyle: React.CSSProperties = {
  margin: '8px 0 0',
  fontSize: 16,
  color: 'rgba(255,255,255,0.75)',
}
const panelStyle: React.CSSProperties = {
  background: 'rgba(0,0,0,0.45)',
  padding: 16,
  borderRadius: 12,
  display: 'grid',
  gap: 10,
}
const rowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  fontSize: 14,
}
const orderListStyle: React.CSSProperties = {
  margin: 0,
  padding: 0,
  listStyle: 'none',
  display: 'grid',
  gap: 6,
}
const orderRowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '24px 1fr auto',
  gap: 8,
  fontSize: 14,
}
const ctaStyle: React.CSSProperties = {
  textAlign: 'center',
  padding: '12px 20px',
  borderRadius: 10,
  background: '#5b3a8a',
  color: '#fff',
  textDecoration: 'none',
  fontWeight: 600,
}
