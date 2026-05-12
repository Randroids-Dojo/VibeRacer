'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import {
  getStandardChampionship,
} from '@/data/worldTourChampionship'
import type { Tour } from '@/lib/worldTourChampionship'
import { defaultCareer, type WorldTourCareer } from '@/game/worldTourCareer'
import {
  WORLD_TOUR_CAREER_EVENT,
  readCareer,
  writeCareer,
} from '@/lib/worldTourCareerStorage'

type TourCardState = 'available' | 'in-progress' | 'completed' | 'locked'

interface TourCard {
  tour: Tour
  state: TourCardState
  raceIndex: number | null
}

function classifyTour(tour: Tour, career: WorldTourCareer): TourCard {
  if (career.activeTour?.tourId === tour.id) {
    return { tour, state: 'in-progress', raceIndex: career.activeTour.raceIndex }
  }
  if (career.completedTourIds.includes(tour.id)) {
    return { tour, state: 'completed', raceIndex: null }
  }
  if (career.unlockedTourIds.includes(tour.id)) {
    return { tour, state: 'available', raceIndex: null }
  }
  return { tour, state: 'locked', raceIndex: null }
}

export default function TourSelectionPage() {
  const router = useRouter()
  const championship = useMemo(() => getStandardChampionship(), [])
  const [career, setCareer] = useState<WorldTourCareer>(() => defaultCareer())

  // Sync the career on mount and on the storage change event.
  useEffect(() => {
    setCareer(readCareer())
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<WorldTourCareer>).detail
      if (detail) setCareer(detail)
      else setCareer(readCareer())
    }
    window.addEventListener(WORLD_TOUR_CAREER_EVENT, onChange)
    return () => window.removeEventListener(WORLD_TOUR_CAREER_EVENT, onChange)
  }, [])

  const cards = championship.tours.map((t) => classifyTour(t, career))

  function enterTour(card: TourCard) {
    if (card.state === 'locked') return
    let nextCareer: WorldTourCareer = career
    let raceIndex = 0
    if (card.state === 'in-progress' && career.activeTour) {
      raceIndex = career.activeTour.raceIndex
    } else {
      nextCareer = {
        ...career,
        activeTour: {
          tourId: card.tour.id,
          raceIndex: 0,
          results: [],
        },
      }
      const result = writeCareer(nextCareer)
      if (result.ok) nextCareer = result.career
    }
    router.push(
      `/tour/race?tour=${encodeURIComponent(card.tour.id)}&raceIndex=${raceIndex}`,
    )
  }

  return (
    <main style={pageStyle}>
      <div style={stageStyle}>
        <header style={logoWrapStyle}>
          <h1 style={logoStyle}>World Tour</h1>
          <p style={tagStyle}>
            Eight tours, four races each. Place inside the gate to unlock the
            next region.
          </p>
        </header>

        <section style={summaryStyle}>
          <div style={summaryRowStyle}>
            <span style={summaryLabelStyle}>Credits</span>
            <strong>{career.money.toLocaleString()}</strong>
          </div>
          <div style={summaryRowStyle}>
            <span style={summaryLabelStyle}>Active car</span>
            <strong>{career.activeCarId}</strong>
          </div>
          <div style={summaryRowStyle}>
            <span style={summaryLabelStyle}>Completed tours</span>
            <strong>{career.completedTourIds.length}</strong>
          </div>
        </section>

        <div style={menuStyle}>
          <div style={cardGridStyle}>
            {cards.map((card) => (
              <button
                key={card.tour.id}
                type="button"
                disabled={card.state === 'locked'}
                onClick={() => enterTour(card)}
                style={{
                  ...cardStyle,
                  opacity: card.state === 'locked' ? 0.45 : 1,
                  cursor: card.state === 'locked' ? 'not-allowed' : 'pointer',
                }}
              >
                <div style={cardTitleStyle}>{card.tour.name}</div>
                <div style={cardBlurbStyle}>
                  {card.tour.region} | Weather: {card.tour.weather} |{' '}
                  {card.tour.trackIds.length} races
                </div>
                <div style={pillRowStyle}>
                  <Pill>Top {card.tour.requiredStanding} of {card.tour.fieldSize}</Pill>
                  <Pill>{stateLabel(card)}</Pill>
                </div>
              </button>
            ))}
          </div>
          <Link href="/" style={backLinkStyle}>
            {'‹'} back to title
          </Link>
        </div>
      </div>
    </main>
  )
}

function stateLabel(card: TourCard): string {
  if (card.state === 'locked') return 'Locked'
  if (card.state === 'completed') return 'Completed'
  if (card.state === 'in-progress' && card.raceIndex !== null) {
    return `Race ${card.raceIndex + 1} of 4`
  }
  return 'Available'
}

function Pill({ children }: { children: React.ReactNode }) {
  return <span style={pillStyle}>{children}</span>
}

const pageStyle: React.CSSProperties = {
  position: 'relative',
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
  background:
    'radial-gradient(ellipse at top, #2a1a3a 0%, #0a0a0a 60%, #050505 100%)',
  color: '#fff',
  fontFamily: 'system-ui, sans-serif',
  boxSizing: 'border-box',
}
const stageStyle: React.CSSProperties = {
  position: 'relative',
  width: 'min(760px, 100%)',
  display: 'grid',
  gap: 24,
}
const logoWrapStyle: React.CSSProperties = {
  textAlign: 'center',
  textShadow: '0 4px 0 rgba(0,0,0,0.25), 0 10px 24px rgba(0,0,0,0.35)',
}
const logoStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 'clamp(40px, 9vw, 64px)',
  fontWeight: 800,
  color: '#fff',
  letterSpacing: 1,
}
const tagStyle: React.CSSProperties = {
  fontSize: 16,
  color: 'rgba(255,255,255,0.8)',
  margin: '8px 0 0',
}
const summaryStyle: React.CSSProperties = {
  background: 'rgba(0,0,0,0.45)',
  padding: '12px 16px',
  borderRadius: 12,
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: 12,
}
const summaryRowStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  fontSize: 14,
}
const summaryLabelStyle: React.CSSProperties = {
  opacity: 0.6,
  fontSize: 12,
  textTransform: 'uppercase',
  letterSpacing: 0.4,
}
const menuStyle: React.CSSProperties = {
  background: 'rgba(0,0,0,0.45)',
  padding: 20,
  borderRadius: 12,
  display: 'grid',
  gap: 16,
}
const cardGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: 12,
}
const cardStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.12)',
  color: 'inherit',
  textAlign: 'left',
  padding: 14,
  borderRadius: 10,
  display: 'grid',
  gap: 6,
  fontFamily: 'inherit',
}
const cardTitleStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 700,
}
const cardBlurbStyle: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.75,
}
const pillRowStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
}
const pillStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.1)',
  borderRadius: 999,
  fontSize: 11,
  padding: '2px 8px',
  textTransform: 'uppercase',
  letterSpacing: 0.4,
}
const backLinkStyle: React.CSSProperties = {
  textAlign: 'center',
  color: 'rgba(255,255,255,0.65)',
  textDecoration: 'none',
  fontSize: 14,
}
