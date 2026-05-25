'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { getStandardChampionship } from '@/data/worldTourChampionship'
import { findTour } from '@/lib/worldTourChampionship'
import {
  applyFullRepair,
  difficultyTierForCareer,
  nextRaceFor,
  repairCost,
} from '@/game/worldTourGarage'
import {
  UPGRADE_MAX_TIER,
  applyUpgradePurchase,
  nextTierCost,
  type UpgradeZone,
} from '@/game/worldTourUpgrades'
import {
  CAR_CATALOG,
  buyCarPreflight,
  findCarSpec,
} from '@/game/worldTourCars'
import { addOwnedCar, setActiveCar } from '@/game/worldTourCareer'
import {
  defaultCareer,
  getActiveCar,
  withActiveCarState,
  type WorldTourCareer,
} from '@/game/worldTourCareer'
import { currentChampionshipStandings } from '@/game/worldTourRaceResult'
import {
  WORLD_TOUR_CAREER_EVENT,
  readCareer,
  writeCareer,
} from '@/lib/worldTourCareerStorage'
import { ChampionshipStandingsPanel } from '@/components/ChampionshipStandingsPanel'

export default function TourGaragePage() {
  const router = useRouter()
  const championship = useMemo(() => getStandardChampionship(), [])
  const [career, setCareer] = useState<WorldTourCareer>(() => defaultCareer())
  const [feedback, setFeedback] = useState<string | null>(null)

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

  const activeCar = getActiveCar(career)
  const tier = difficultyTierForCareer(championship, career)
  const cost = repairCost(activeCar.damage, tier)
  const damagePercent = Math.round(activeCar.damage * 100)
  const canRepair = activeCar.damage > 0 && career.money >= cost
  const next = nextRaceFor(championship, career)
  const activeTourId = career.activeTour?.tourId ?? null
  const activeTour = activeTourId ? findTour(championship, activeTourId) : null
  const standings = activeTour
    ? currentChampionshipStandings({ career, tour: activeTour, championship })
    : null

  function doRepair() {
    setFeedback(null)
    const result = applyFullRepair(career, championship)
    if (!result.ok) {
      if (result.reason === 'insufficient-funds') {
        setFeedback('Not enough credits.')
      } else {
        setFeedback('Car is already at full health.')
      }
      return
    }
    const written = writeCareer(result.career)
    if (written.ok) {
      setCareer(written.career)
      setFeedback(`Repaired. -${result.spent} credits.`)
    } else {
      setFeedback('Could not save the repair.')
    }
  }

  function buyUpgrade(zone: UpgradeZone) {
    setFeedback(null)
    const result = applyUpgradePurchase(
      activeCar.upgrades,
      zone,
      career.money,
    )
    if (!result.ok) {
      if (result.reason === 'insufficient-funds') {
        setFeedback('Not enough credits.')
      } else {
        setFeedback('Already at max tier.')
      }
      return
    }
    const patched = withActiveCarState(career, { upgrades: result.upgrades })
    const next: WorldTourCareer = {
      ...patched,
      money: career.money - result.spent,
    }
    const written = writeCareer(next)
    if (written.ok) {
      setCareer(written.career)
      setFeedback(`Upgraded ${zone}. -${result.spent}c`)
    } else {
      setFeedback('Could not save the upgrade.')
    }
  }

  function buyCar(carId: string) {
    setFeedback(null)
    const preflight = buyCarPreflight({
      carId,
      ownedCarIds: career.ownedCarIds,
      walletCredits: career.money,
    })
    if (!preflight.ok) {
      if (preflight.reason === 'insufficient-funds') {
        setFeedback('Not enough credits.')
      } else if (preflight.reason === 'already-owned') {
        setFeedback('Already owned.')
      } else {
        setFeedback('Unknown car.')
      }
      return
    }
    let next = addOwnedCar(career, carId)
    next = setActiveCar(next, carId)
    next = { ...next, money: career.money - preflight.spent }
    const written = writeCareer(next)
    if (written.ok) {
      setCareer(written.career)
      setFeedback(`Bought ${findCarSpec(carId)?.name ?? carId}. -${preflight.spent}c`)
    } else {
      setFeedback('Could not save the purchase.')
    }
  }

  function switchCar(carId: string) {
    if (carId === career.activeCarId) return
    const next = setActiveCar(career, carId)
    const written = writeCareer(next)
    if (written.ok) {
      setCareer(written.career)
      setFeedback(`Switched to ${findCarSpec(carId)?.name ?? carId}.`)
    }
  }

  function startNextRace() {
    if (!next) {
      router.push('/tour')
      return
    }
    router.push(
      `/tour/race?tour=${encodeURIComponent(next.tourId)}&raceIndex=${next.raceIndex}`,
    )
  }

  return (
    <main style={pageStyle}>
      <div style={stageStyle}>
        <header style={headerStyle}>
          <h1 style={titleStyle}>Garage</h1>
          <p style={tagStyle}>
            Fix the car. Roll into the next race when you are ready.
          </p>
        </header>

        {activeTour && standings ? (
          <ChampionshipStandingsPanel
            tour={activeTour}
            rows={standings.rows}
            playerStanding={standings.playerStanding}
            racesCompleted={standings.racesCompleted}
            totalRaces={activeTour.trackIds.length}
            requiredStanding={activeTour.requiredStanding}
            variant="results"
          />
        ) : null}

        <section style={panelStyle}>
          <h2 style={subheaderStyle}>Status</h2>
          <Row label="Credits" value={`${career.money.toLocaleString()}c`} />
          <Row
            label="Active car"
            value={findCarSpec(career.activeCarId)?.name ?? career.activeCarId}
          />
          <Row label="Damage" value={`${damagePercent}%`} />
          <Row label="Repair cost" value={cost > 0 ? `${cost}c` : '-'} />
        </section>

        <section style={panelStyle}>
          <h2 style={subheaderStyle}>Repair</h2>
          <button
            type="button"
            onClick={doRepair}
            disabled={!canRepair}
            style={{
              ...ctaStyle,
              background: canRepair ? '#5b3a8a' : '#2a2a2a',
              cursor: canRepair ? 'pointer' : 'not-allowed',
            }}
          >
            {activeCar.damage === 0
              ? 'No repairs needed'
              : `Repair fully (${cost}c)`}
          </button>
          {feedback ? <p style={feedbackStyle}>{feedback}</p> : null}
        </section>

        <section style={panelStyle}>
          <h2 style={subheaderStyle}>Upgrades</h2>
          <div style={upgradeGridStyle}>
            {(['engine', 'tires', 'brakes', 'body'] as UpgradeZone[]).map(
              (zone) => {
                const tier = activeCar.upgrades[zone]
                const cost = nextTierCost(activeCar.upgrades, zone)
                const maxed = tier >= UPGRADE_MAX_TIER
                const canBuy = !maxed && career.money >= cost
                return (
                  <div key={zone} style={upgradeRowStyle}>
                    <div style={upgradeNameStyle}>{zone}</div>
                    <div style={upgradeTierStyle}>
                      Tier {tier} / {UPGRADE_MAX_TIER}
                    </div>
                    <button
                      type="button"
                      onClick={() => buyUpgrade(zone)}
                      disabled={!canBuy}
                      style={{
                        ...upgradeBtnStyle,
                        background: canBuy ? '#3da9fc' : '#2a2a2a',
                        cursor: canBuy ? 'pointer' : 'not-allowed',
                      }}
                    >
                      {maxed ? 'Maxed' : `Buy (${cost}c)`}
                    </button>
                  </div>
                )
              },
            )}
          </div>
        </section>

        <section style={panelStyle}>
          <h2 style={subheaderStyle}>Cars</h2>
          <div style={upgradeGridStyle}>
            {CAR_CATALOG.map((spec) => {
              const owned = career.ownedCarIds.includes(spec.id)
              const active = spec.id === career.activeCarId
              const canBuy = !owned && career.money >= spec.price
              return (
                <div key={spec.id} style={upgradeRowStyle}>
                  <div style={upgradeNameStyle}>{spec.name}</div>
                  <div style={upgradeTierStyle}>
                    {owned ? (active ? 'Active' : 'Owned') : `${spec.price}c`}
                  </div>
                  {owned ? (
                    <button
                      type="button"
                      onClick={() => switchCar(spec.id)}
                      disabled={active}
                      style={{
                        ...upgradeBtnStyle,
                        background: active ? '#2a2a2a' : '#5b3a8a',
                        cursor: active ? 'default' : 'pointer',
                      }}
                    >
                      {active ? 'In use' : 'Switch'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => buyCar(spec.id)}
                      disabled={!canBuy}
                      style={{
                        ...upgradeBtnStyle,
                        background: canBuy ? '#3da9fc' : '#2a2a2a',
                        cursor: canBuy ? 'pointer' : 'not-allowed',
                      }}
                    >
                      Buy
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </section>

        <section style={panelStyle}>
          <h2 style={subheaderStyle}>Next up</h2>
          {next ? (
            <>
              <p style={{ margin: 0 }}>
                {next.tourName} | Race {next.raceIndex + 1}
              </p>
              <button
                type="button"
                onClick={startNextRace}
                style={{ ...ctaStyle, background: '#3da9fc' }}
              >
                Start next race
              </button>
            </>
          ) : (
            <>
              <p style={{ margin: 0 }}>
                No tour in progress. Pick a tour to start a new run.
              </p>
              <Link href="/tour" style={ctaStyle}>
                Back to tours
              </Link>
            </>
          )}
        </section>

        <Link href="/tour" style={backLinkStyle}>
          {'‹'} all tours
        </Link>
      </div>
    </main>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={rowStyle}>
      <span style={{ opacity: 0.7 }}>{label}</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
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
    'radial-gradient(ellipse at top, #1a2230 0%, #0a0a0a 60%, #050505 100%)',
  color: '#fff',
  fontFamily: 'system-ui, sans-serif',
}
const stageStyle: React.CSSProperties = {
  width: 'min(640px, 100%)',
  display: 'grid',
  gap: 16,
}
const headerStyle: React.CSSProperties = {
  textAlign: 'center',
}
const titleStyle: React.CSSProperties = {
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
  fontSize: 14,
  opacity: 0.75,
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
const ctaStyle: React.CSSProperties = {
  textAlign: 'center',
  padding: '10px 16px',
  borderRadius: 10,
  background: '#5b3a8a',
  color: '#fff',
  border: 'none',
  textDecoration: 'none',
  fontWeight: 600,
  fontFamily: 'inherit',
  fontSize: 15,
}
const feedbackStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 13,
  opacity: 0.8,
}
const upgradeGridStyle: React.CSSProperties = {
  display: 'grid',
  gap: 8,
}
const upgradeRowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '80px 1fr auto',
  gap: 12,
  alignItems: 'center',
  fontSize: 14,
}
const upgradeNameStyle: React.CSSProperties = {
  textTransform: 'capitalize',
  fontWeight: 600,
}
const upgradeTierStyle: React.CSSProperties = {
  opacity: 0.7,
}
const upgradeBtnStyle: React.CSSProperties = {
  padding: '6px 12px',
  borderRadius: 8,
  background: '#3da9fc',
  color: '#fff',
  border: 'none',
  fontFamily: 'inherit',
  fontSize: 13,
  fontWeight: 600,
}
const backLinkStyle: React.CSSProperties = {
  textAlign: 'center',
  color: 'rgba(255,255,255,0.65)',
  textDecoration: 'none',
  fontSize: 14,
}
