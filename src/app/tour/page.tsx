'use client'

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
import { MenuPageShell, menuStyles } from '@/components/MenuPageShell'

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
    let raceIndex = 0
    if (card.state === 'in-progress' && career.activeTour) {
      raceIndex = career.activeTour.raceIndex
    } else {
      const nextCareer: WorldTourCareer = {
        ...career,
        activeTour: {
          tourId: card.tour.id,
          raceIndex: 0,
          results: [],
        },
      }
      writeCareer(nextCareer)
    }
    router.push(
      `/tour/race?tour=${encodeURIComponent(card.tour.id)}&raceIndex=${raceIndex}`,
    )
  }

  return (
    <MenuPageShell
      title="World Tour"
      blurb="Eight tours, four races each. Place inside the gate to unlock the next region."
      width="wide"
    >
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
          <span style={summaryLabelStyle}>Completed</span>
          <strong>{career.completedTourIds.length}</strong>
        </div>
      </section>

      <div style={menuStyles.section}>
        <div style={menuStyles.sectionHeader}>Tours</div>
        <div style={menuStyles.cardGrid}>
          {cards.map((card) => (
            <button
              key={card.tour.id}
              type="button"
              disabled={card.state === 'locked'}
              onClick={() => enterTour(card)}
              style={{
                ...menuStyles.card,
                background:
                  card.state === 'locked'
                    ? menuStyles.card.background
                    : `linear-gradient(135deg, ${card.tour.theme.secondary}66 0%, ${card.tour.theme.primary}33 100%)`,
                borderColor: card.tour.theme.accent + '55',
                opacity: card.state === 'locked' ? 0.45 : 1,
                cursor:
                  card.state === 'locked' ? 'not-allowed' : 'pointer',
              }}
            >
              <div
                style={{
                  ...menuStyles.cardTitle,
                  color: card.tour.theme.accent,
                }}
              >
                {card.tour.name}
              </div>
              <div style={menuStyles.cardBlurb}>
                {card.tour.region} | {card.tour.trackIds.length} races
              </div>
              <div style={menuStyles.pillRow}>
                <Pill>
                  Top {card.tour.requiredStanding} of {card.tour.fieldSize}
                </Pill>
                <Pill>{weatherLabel(card.tour.weather)}</Pill>
                <Pill>{stateLabel(card)}</Pill>
              </div>
            </button>
          ))}
        </div>
      </div>
    </MenuPageShell>
  )
}

function weatherLabel(w: string): string {
  switch (w) {
    case 'clear':
      return 'Clear'
    case 'cloudy':
      return 'Cloudy'
    case 'rainy':
      return 'Rain'
    case 'snow':
      return 'Snow'
    default:
      return w
  }
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
  return <span style={menuStyles.pill}>{children}</span>
}

const summaryStyle: React.CSSProperties = {
  background: 'rgba(0,0,0,0.35)',
  padding: '12px 16px',
  borderRadius: 12,
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: 12,
  border: '1px solid rgba(255,255,255,0.08)',
}
const summaryRowStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  fontSize: 14,
}
const summaryLabelStyle: React.CSSProperties = {
  opacity: 0.6,
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: 0.4,
}
