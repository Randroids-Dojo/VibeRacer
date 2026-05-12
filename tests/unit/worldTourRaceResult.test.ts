import { describe, it, expect } from 'vitest'
import {
  PLACEMENT_POINTS,
  PLACEMENT_PURSE,
  TOUR_COMPLETION_BONUS,
  aggregatePoints,
  buildRaceResult,
  placementPoints,
  placementPurse,
} from '@/game/worldTourRaceResult'
import {
  STANDARD_CHAMPIONSHIP,
  VELVET_COAST_TOUR_ID,
} from '@/data/worldTourChampionship'
import { defaultCareer, type WorldTourCareer } from '@/game/worldTourCareer'
import type { RaceSessionState } from '@/game/worldTourRaceSession'
import { DEFAULT_CAR_PARAMS } from '@/game/physics'

function makeState(
  finishingOrder: number[],
  carConfigs: Array<{
    isPlayer?: boolean
    driverId?: string | null
    status?: 'finished' | 'dnf'
    carId?: string
  }>,
): RaceSessionState {
  return {
    tick: 0,
    phase: 'finished',
    countdownRemainingSec: 0,
    elapsedMs: 60000,
    totalLaps: 1,
    finishingOrder,
    cars: carConfigs.map((c, i) => ({
      index: i,
      isPlayer: c.isPlayer ?? i === 0,
      driverId: c.driverId ?? (i === 0 ? null : `driver-${i}`),
      carId: c.carId ?? (i === 0 ? 'starter' : `ai-${i}`),
      params: { ...DEFAULT_CAR_PARAMS },
      damageAbsorb: 1,
      physics: { x: 0, z: 0, heading: 0, speed: 0 },
      aiState: i === 0 ? null : null,
      lap: 1,
      distanceTraveled: 200,
      status: c.status ?? 'finished',
      finishedAtMs: 60000,
      noProgressMs: 0,
      offTrackMs: 0,
      damage: 0,
      lastDistance: 200,
    })),
  }
}

describe('placementPoints / placementPurse', () => {
  it('returns the documented values from the table', () => {
    expect(placementPoints(1)).toBe(PLACEMENT_POINTS[0])
    expect(placementPoints(2)).toBe(PLACEMENT_POINTS[1])
    expect(placementPoints(3)).toBe(PLACEMENT_POINTS[2])
    expect(placementPurse(1)).toBe(PLACEMENT_PURSE[0])
  })

  it('returns 0 for an out-of-range or non-finite placement', () => {
    expect(placementPoints(0)).toBe(0)
    expect(placementPoints(-1)).toBe(0)
    expect(placementPoints(99)).toBe(0)
    expect(placementPoints(NaN)).toBe(0)
    expect(placementPurse(99)).toBe(0)
  })

  it('floors a fractional placement', () => {
    expect(placementPoints(1.9)).toBe(PLACEMENT_POINTS[0])
    expect(placementPoints(2.4)).toBe(PLACEMENT_POINTS[1])
  })
})

describe('buildRaceResult (mid-tour)', () => {
  it('records the player placement and points for race 0 of a tour', () => {
    const state = makeState(
      [0, 1, 2, 3],
      [{}, {}, {}, {}],
    )
    const result = buildRaceResult({
      finalState: state,
      career: defaultCareer(),
      championship: STANDARD_CHAMPIONSHIP,
      tourId: VELVET_COAST_TOUR_ID,
      trackIndex: 0,
      playerCarId: 'starter',
    })
    expect(result.playerPlacement).toBe(1)
    expect(result.pointsEarned).toBe(PLACEMENT_POINTS[0])
    expect(result.cashBaseEarned).toBe(PLACEMENT_PURSE[0])
    expect(result.bonusEarned).toBe(0)
    expect(result.tourProgress.completed).toBe(false)
    expect(result.tourProgress.passed).toBeNull()
    expect(result.tourProgress.nextRaceIndex).toBe(1)
    expect(result.nextRace).not.toBeNull()
    expect(result.nextRace!.trackId).toBe('velvet-coast-2')
  })

  it('DNF zeros out the player points and cash', () => {
    const state = makeState(
      [1, 2, 3, 0],
      [
        { status: 'dnf' },
        {},
        {},
        {},
      ],
    )
    const result = buildRaceResult({
      finalState: state,
      career: defaultCareer(),
      championship: STANDARD_CHAMPIONSHIP,
      tourId: VELVET_COAST_TOUR_ID,
      trackIndex: 0,
      playerCarId: 'starter',
    })
    expect(result.playerDnf).toBe(true)
    expect(result.pointsEarned).toBe(0)
    expect(result.cashBaseEarned).toBe(0)
  })
})

describe('buildRaceResult (final race of a tour)', () => {
  it('flips tourProgress.completed and surfaces passed when the player meets the gate', () => {
    const career: WorldTourCareer = {
      ...defaultCareer(),
      activeTour: {
        tourId: VELVET_COAST_TOUR_ID,
        raceIndex: 3,
        results: [
          { trackId: 'velvet-coast-1', placement: 1, dnf: false, cashEarned: 500 },
          { trackId: 'velvet-coast-2', placement: 1, dnf: false, cashEarned: 500 },
          { trackId: 'velvet-coast-3', placement: 1, dnf: false, cashEarned: 500 },
        ],
      },
    }
    const state = makeState(
      [0, 1, 2, 3],
      [{}, {}, {}, {}],
    )
    const result = buildRaceResult({
      finalState: state,
      career,
      championship: STANDARD_CHAMPIONSHIP,
      tourId: VELVET_COAST_TOUR_ID,
      trackIndex: 3,
      playerCarId: 'starter',
    })
    expect(result.tourProgress.completed).toBe(true)
    expect(result.tourProgress.passed).toBe(true)
    expect(result.tourProgress.playerStanding).toBe(1)
    expect(result.tourProgress.nextRaceIndex).toBeNull()
    expect(result.nextRace).toBeNull()
    expect(result.bonusEarned).toBe(TOUR_COMPLETION_BONUS)
    expect(result.cashEarned).toBe(PLACEMENT_PURSE[0] + TOUR_COMPLETION_BONUS)
  })

  it('flips tourProgress.passed to false when the player misses the gate', () => {
    const career: WorldTourCareer = {
      ...defaultCareer(),
      activeTour: {
        tourId: VELVET_COAST_TOUR_ID,
        raceIndex: 3,
        results: [
          { trackId: 'velvet-coast-1', placement: 4, dnf: false, cashEarned: 0 },
          { trackId: 'velvet-coast-2', placement: 4, dnf: false, cashEarned: 0 },
          { trackId: 'velvet-coast-3', placement: 4, dnf: false, cashEarned: 0 },
        ],
      },
    }
    // Player finishes 4th of 4; required standing is 2.
    const state = makeState(
      [1, 2, 3, 0],
      [{}, {}, {}, {}],
    )
    const result = buildRaceResult({
      finalState: state,
      career,
      championship: STANDARD_CHAMPIONSHIP,
      tourId: VELVET_COAST_TOUR_ID,
      trackIndex: 3,
      playerCarId: 'starter',
    })
    expect(result.tourProgress.completed).toBe(true)
    expect(result.tourProgress.passed).toBe(false)
    expect(result.bonusEarned).toBe(0)
  })
})

describe('buildRaceResult (errors)', () => {
  it('throws on an unknown tour id', () => {
    const state = makeState([0], [{}])
    expect(() =>
      buildRaceResult({
        finalState: state,
        career: defaultCareer(),
        championship: STANDARD_CHAMPIONSHIP,
        tourId: 'nope',
        trackIndex: 0,
        playerCarId: 'starter',
      }),
    ).toThrow(/unknown tour/)
  })

  it('throws on an out-of-range trackIndex', () => {
    const state = makeState([0], [{}])
    expect(() =>
      buildRaceResult({
        finalState: state,
        career: defaultCareer(),
        championship: STANDARD_CHAMPIONSHIP,
        tourId: VELVET_COAST_TOUR_ID,
        trackIndex: 99,
        playerCarId: 'starter',
      }),
    ).toThrow(/out of range/)
  })
})

describe('aggregatePoints', () => {
  it('returns playerStanding 1 when the player has more points than every other car', () => {
    const career: WorldTourCareer = {
      ...defaultCareer(),
      activeTour: {
        tourId: VELVET_COAST_TOUR_ID,
        raceIndex: 3,
        results: [
          { trackId: 'velvet-coast-1', placement: 1, dnf: false, cashEarned: 500 },
          { trackId: 'velvet-coast-2', placement: 1, dnf: false, cashEarned: 500 },
          { trackId: 'velvet-coast-3', placement: 1, dnf: false, cashEarned: 500 },
        ],
      },
    }
    const tour = STANDARD_CHAMPIONSHIP.tours[0]!
    const standings = [
      {
        carIndex: 0,
        isPlayer: true,
        driverId: null,
        carId: 'starter',
        placement: 1,
        dnf: false,
        points: PLACEMENT_POINTS[0]!,
        cashEarned: PLACEMENT_PURSE[0]!,
      },
      {
        carIndex: 1,
        isPlayer: false,
        driverId: 'driver-1',
        carId: 'driver-1',
        placement: 2,
        dnf: false,
        points: PLACEMENT_POINTS[1]!,
        cashEarned: PLACEMENT_PURSE[1]!,
      },
    ]
    const out = aggregatePoints({ career, tour, finalRaceStandings: standings })
    expect(out.playerStanding).toBe(1)
  })
})
