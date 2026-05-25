import { describe, it, expect } from 'vitest'
import {
  PLACEMENT_POINTS,
  PLACEMENT_PURSE,
  TOUR_COMPLETION_BONUS,
  aggregatePoints,
  buildRaceResult,
  currentChampionshipStandings,
  placementPoints,
  placementPurse,
} from '@/game/worldTourRaceResult'
import {
  IRON_BOROUGH_TOUR_ID,
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
          {
            trackId: 'velvet-coast-1',
            placement: 1,
            dnf: false,
            cashEarned: 500,
            entries: [
              { driverId: null, carId: 'starter', placement: 1, dnf: false, points: PLACEMENT_POINTS[0]!, isPlayer: true },
              { driverId: 'driver-1', carId: 'driver-1', placement: 2, dnf: false, points: PLACEMENT_POINTS[1]!, isPlayer: false },
              { driverId: 'driver-2', carId: 'driver-2', placement: 3, dnf: false, points: PLACEMENT_POINTS[2]!, isPlayer: false },
              { driverId: 'driver-3', carId: 'driver-3', placement: 4, dnf: false, points: PLACEMENT_POINTS[3]!, isPlayer: false },
            ],
          },
          {
            trackId: 'velvet-coast-2',
            placement: 1,
            dnf: false,
            cashEarned: 500,
            entries: [
              { driverId: null, carId: 'starter', placement: 1, dnf: false, points: PLACEMENT_POINTS[0]!, isPlayer: true },
              { driverId: 'driver-1', carId: 'driver-1', placement: 2, dnf: false, points: PLACEMENT_POINTS[1]!, isPlayer: false },
              { driverId: 'driver-2', carId: 'driver-2', placement: 3, dnf: false, points: PLACEMENT_POINTS[2]!, isPlayer: false },
              { driverId: 'driver-3', carId: 'driver-3', placement: 4, dnf: false, points: PLACEMENT_POINTS[3]!, isPlayer: false },
            ],
          },
          {
            trackId: 'velvet-coast-3',
            placement: 1,
            dnf: false,
            cashEarned: 500,
            entries: [
              { driverId: null, carId: 'starter', placement: 1, dnf: false, points: PLACEMENT_POINTS[0]!, isPlayer: true },
              { driverId: 'driver-1', carId: 'driver-1', placement: 2, dnf: false, points: PLACEMENT_POINTS[1]!, isPlayer: false },
              { driverId: 'driver-2', carId: 'driver-2', placement: 3, dnf: false, points: PLACEMENT_POINTS[2]!, isPlayer: false },
              { driverId: 'driver-3', carId: 'driver-3', placement: 4, dnf: false, points: PLACEMENT_POINTS[3]!, isPlayer: false },
            ],
          },
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
          {
            trackId: 'velvet-coast-1',
            placement: 4,
            dnf: false,
            cashEarned: 0,
            entries: [
              { driverId: 'driver-1', carId: 'driver-1', placement: 1, dnf: false, points: PLACEMENT_POINTS[0]!, isPlayer: false },
              { driverId: 'driver-2', carId: 'driver-2', placement: 2, dnf: false, points: PLACEMENT_POINTS[1]!, isPlayer: false },
              { driverId: 'driver-3', carId: 'driver-3', placement: 3, dnf: false, points: PLACEMENT_POINTS[2]!, isPlayer: false },
              { driverId: null, carId: 'starter', placement: 4, dnf: false, points: PLACEMENT_POINTS[3]!, isPlayer: true },
            ],
          },
          {
            trackId: 'velvet-coast-2',
            placement: 4,
            dnf: false,
            cashEarned: 0,
            entries: [
              { driverId: 'driver-1', carId: 'driver-1', placement: 1, dnf: false, points: PLACEMENT_POINTS[0]!, isPlayer: false },
              { driverId: 'driver-2', carId: 'driver-2', placement: 2, dnf: false, points: PLACEMENT_POINTS[1]!, isPlayer: false },
              { driverId: 'driver-3', carId: 'driver-3', placement: 3, dnf: false, points: PLACEMENT_POINTS[2]!, isPlayer: false },
              { driverId: null, carId: 'starter', placement: 4, dnf: false, points: PLACEMENT_POINTS[3]!, isPlayer: true },
            ],
          },
          {
            trackId: 'velvet-coast-3',
            placement: 4,
            dnf: false,
            cashEarned: 0,
            entries: [
              { driverId: 'driver-1', carId: 'driver-1', placement: 1, dnf: false, points: PLACEMENT_POINTS[0]!, isPlayer: false },
              { driverId: 'driver-2', carId: 'driver-2', placement: 2, dnf: false, points: PLACEMENT_POINTS[1]!, isPlayer: false },
              { driverId: 'driver-3', carId: 'driver-3', placement: 3, dnf: false, points: PLACEMENT_POINTS[2]!, isPlayer: false },
              { driverId: null, carId: 'starter', placement: 4, dnf: false, points: PLACEMENT_POINTS[3]!, isPlayer: true },
            ],
          },
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

describe('full race -> result pipeline', () => {
  it('produces a deterministic result under identical inputs', async () => {
    const session = await import('@/game/worldTourRaceSession')
    const flat = { centerXAt: () => 0, curveAt: () => 0 }
    function run() {
      let s = session.createRaceSession({
        slotCount: 4,
        laneCount: 2,
        aiDrivers: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
        seed: 99,
        totalLaps: 1,
        lapDistanceMeters: 60,
        playerCarId: 'starter',
      })
      const fullThrottle = { throttle: 1, steer: 0, handbrake: false }
      for (let i = 0; i < 60 * 12; i++) {
        s = session.stepRaceSession(
          s,
          {
            playerInput: fullThrottle,
            dt: 1 / 60,
            track: flat,
            aiStats: { topSpeed: DEFAULT_CAR_PARAMS.maxSpeed },
          },
          { totalLaps: 1, lapDistanceMeters: 60 },
        )
        if (s.phase === 'finished') break
      }
      return buildRaceResult({
        finalState: s,
        career: defaultCareer(),
        championship: STANDARD_CHAMPIONSHIP,
        tourId: VELVET_COAST_TOUR_ID,
        trackIndex: 0,
        playerCarId: 'starter',
      })
    }
    const a = run()
    const b = run()
    expect(a.finishingOrder).toEqual(b.finishingOrder)
    expect(a.playerPlacement).toBe(b.playerPlacement)
    expect(a.pointsEarned).toBe(b.pointsEarned)
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
          {
            trackId: 'velvet-coast-1',
            placement: 1,
            dnf: false,
            cashEarned: 500,
            entries: [
              { driverId: null, carId: 'starter', placement: 1, dnf: false, points: PLACEMENT_POINTS[0]!, isPlayer: true },
              { driverId: 'driver-1', carId: 'driver-1', placement: 2, dnf: false, points: PLACEMENT_POINTS[1]!, isPlayer: false },
              { driverId: 'driver-2', carId: 'driver-2', placement: 3, dnf: false, points: PLACEMENT_POINTS[2]!, isPlayer: false },
              { driverId: 'driver-3', carId: 'driver-3', placement: 4, dnf: false, points: PLACEMENT_POINTS[3]!, isPlayer: false },
            ],
          },
          {
            trackId: 'velvet-coast-2',
            placement: 1,
            dnf: false,
            cashEarned: 500,
            entries: [
              { driverId: null, carId: 'starter', placement: 1, dnf: false, points: PLACEMENT_POINTS[0]!, isPlayer: true },
              { driverId: 'driver-1', carId: 'driver-1', placement: 2, dnf: false, points: PLACEMENT_POINTS[1]!, isPlayer: false },
              { driverId: 'driver-2', carId: 'driver-2', placement: 3, dnf: false, points: PLACEMENT_POINTS[2]!, isPlayer: false },
              { driverId: 'driver-3', carId: 'driver-3', placement: 4, dnf: false, points: PLACEMENT_POINTS[3]!, isPlayer: false },
            ],
          },
          {
            trackId: 'velvet-coast-3',
            placement: 1,
            dnf: false,
            cashEarned: 500,
            entries: [
              { driverId: null, carId: 'starter', placement: 1, dnf: false, points: PLACEMENT_POINTS[0]!, isPlayer: true },
              { driverId: 'driver-1', carId: 'driver-1', placement: 2, dnf: false, points: PLACEMENT_POINTS[1]!, isPlayer: false },
              { driverId: 'driver-2', carId: 'driver-2', placement: 3, dnf: false, points: PLACEMENT_POINTS[2]!, isPlayer: false },
              { driverId: 'driver-3', carId: 'driver-3', placement: 4, dnf: false, points: PLACEMENT_POINTS[3]!, isPlayer: false },
            ],
          },
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

  it('sums real per-race AI points instead of projecting the final race backward', () => {
    // driver-1 across four races: 1st, 4th, 2nd, 3rd
    // expected total = 10 + 3 + 7 + 5 = 25
    // driver-2 across four races: 2nd, 1st, 3rd, 2nd
    // expected total = 7 + 10 + 5 + 7 = 29
    // player across four races: 3rd, 2nd, 1st, 1st
    // expected total = 5 + 7 + 10 + 10 = 32 (player wins the championship)
    const career: WorldTourCareer = {
      ...defaultCareer(),
      activeTour: {
        tourId: VELVET_COAST_TOUR_ID,
        raceIndex: 3,
        results: [
          {
            trackId: 'velvet-coast-1',
            placement: 3,
            dnf: false,
            cashEarned: 250,
            entries: [
              { driverId: 'driver-1', carId: 'driver-1', placement: 1, dnf: false, points: 10, isPlayer: false },
              { driverId: 'driver-2', carId: 'driver-2', placement: 2, dnf: false, points: 7, isPlayer: false },
              { driverId: null, carId: 'starter', placement: 3, dnf: false, points: 5, isPlayer: true },
              { driverId: 'driver-3', carId: 'driver-3', placement: 4, dnf: false, points: 3, isPlayer: false },
            ],
          },
          {
            trackId: 'velvet-coast-2',
            placement: 2,
            dnf: false,
            cashEarned: 350,
            entries: [
              { driverId: 'driver-2', carId: 'driver-2', placement: 1, dnf: false, points: 10, isPlayer: false },
              { driverId: null, carId: 'starter', placement: 2, dnf: false, points: 7, isPlayer: true },
              { driverId: 'driver-3', carId: 'driver-3', placement: 3, dnf: false, points: 5, isPlayer: false },
              { driverId: 'driver-1', carId: 'driver-1', placement: 4, dnf: false, points: 3, isPlayer: false },
            ],
          },
          {
            trackId: 'velvet-coast-3',
            placement: 1,
            dnf: false,
            cashEarned: 500,
            entries: [
              { driverId: null, carId: 'starter', placement: 1, dnf: false, points: 10, isPlayer: true },
              { driverId: 'driver-1', carId: 'driver-1', placement: 2, dnf: false, points: 7, isPlayer: false },
              { driverId: 'driver-2', carId: 'driver-2', placement: 3, dnf: false, points: 5, isPlayer: false },
              { driverId: 'driver-3', carId: 'driver-3', placement: 4, dnf: false, points: 3, isPlayer: false },
            ],
          },
        ],
      },
    }
    const tour = STANDARD_CHAMPIONSHIP.tours[0]!
    // Final race: player 1st, driver-2 2nd, driver-1 3rd, driver-3 4th
    const standings = [
      { carIndex: 0, isPlayer: true, driverId: null, carId: 'starter', placement: 1, dnf: false, points: 10, cashEarned: 500 },
      { carIndex: 1, isPlayer: false, driverId: 'driver-2', carId: 'driver-2', placement: 2, dnf: false, points: 7, cashEarned: 350 },
      { carIndex: 2, isPlayer: false, driverId: 'driver-1', carId: 'driver-1', placement: 3, dnf: false, points: 5, cashEarned: 250 },
      { carIndex: 3, isPlayer: false, driverId: 'driver-3', carId: 'driver-3', placement: 4, dnf: false, points: 3, cashEarned: 150 },
    ]
    const out = aggregatePoints({ career, tour, finalRaceStandings: standings })
    expect(out.pointsByCar.get('player')).toBe(32)
    expect(out.pointsByCar.get('driver-1')).toBe(25)
    expect(out.pointsByCar.get('driver-2')).toBe(29)
    expect(out.pointsByCar.get('driver-3')).toBe(14)
    expect(out.playerStanding).toBe(1)
  })
})

describe('currentChampionshipStandings', () => {
  it('returns null when there is no active tour', () => {
    const career = defaultCareer()
    const out = currentChampionshipStandings({
      career,
      tour: STANDARD_CHAMPIONSHIP.tours[0]!,
      championship: STANDARD_CHAMPIONSHIP,
    })
    expect(out).toBeNull()
  })

  it('returns null when the active tour does not match the requested tour', () => {
    const career: WorldTourCareer = {
      ...defaultCareer(),
      activeTour: { tourId: IRON_BOROUGH_TOUR_ID, raceIndex: 0, results: [] },
    }
    const out = currentChampionshipStandings({
      career,
      tour: STANDARD_CHAMPIONSHIP.tours[0]!,
      championship: STANDARD_CHAMPIONSHIP,
    })
    expect(out).toBeNull()
  })

  it('on a freshly entered tour returns the player ahead of every ghost AI row', () => {
    const career: WorldTourCareer = {
      ...defaultCareer(),
      activeTour: { tourId: VELVET_COAST_TOUR_ID, raceIndex: 0, results: [] },
    }
    const out = currentChampionshipStandings({
      career,
      tour: STANDARD_CHAMPIONSHIP.tours[0]!,
      championship: STANDARD_CHAMPIONSHIP,
    })
    expect(out).not.toBeNull()
    expect(out!.racesCompleted).toBe(0)
    expect(out!.playerStanding).toBe(1)
    expect(out!.fieldSize).toBe(STANDARD_CHAMPIONSHIP.tours[0]!.fieldSize)
    // First row is the player; remaining rows are roster ghosts.
    expect(out!.rows[0]!.isPlayer).toBe(true)
    expect(out!.rows[0]!.points).toBe(0)
    for (let i = 1; i < out!.rows.length; i++) {
      expect(out!.rows[i]!.isGhost).toBe(true)
      expect(out!.rows[i]!.points).toBe(0)
    }
  })

  it('sorts rows by points desc, labels the player as You, and breaks player-ties in the player favor', () => {
    // Player at 17, driver-1 at 17 (tied), driver-2 at 10, driver-3 at 5.
    const career: WorldTourCareer = {
      ...defaultCareer(),
      activeTour: {
        tourId: VELVET_COAST_TOUR_ID,
        raceIndex: 2,
        results: [
          {
            trackId: 'velvet-coast-1',
            placement: 1,
            dnf: false,
            cashEarned: 500,
            entries: [
              { driverId: null, carId: 'starter', placement: 1, dnf: false, points: 10, isPlayer: true },
              { driverId: 'driver-1', carId: 'driver-1', placement: 2, dnf: false, points: 7, isPlayer: false },
              { driverId: 'driver-2', carId: 'driver-2', placement: 3, dnf: false, points: 5, isPlayer: false },
              { driverId: 'driver-3', carId: 'driver-3', placement: 4, dnf: false, points: 3, isPlayer: false },
            ],
          },
          {
            trackId: 'velvet-coast-2',
            placement: 2,
            dnf: false,
            cashEarned: 350,
            entries: [
              { driverId: 'driver-1', carId: 'driver-1', placement: 1, dnf: false, points: 10, isPlayer: false },
              { driverId: null, carId: 'starter', placement: 2, dnf: false, points: 7, isPlayer: true },
              { driverId: 'driver-2', carId: 'driver-2', placement: 3, dnf: false, points: 5, isPlayer: false },
              { driverId: 'driver-3', carId: 'driver-3', placement: 4, dnf: false, points: 3, isPlayer: false },
            ],
          },
        ],
      },
    }
    const out = currentChampionshipStandings({
      career,
      tour: STANDARD_CHAMPIONSHIP.tours[0]!,
      championship: STANDARD_CHAMPIONSHIP,
    })
    expect(out).not.toBeNull()
    expect(out!.racesCompleted).toBe(2)
    expect(out!.playerStanding).toBe(1)
    expect(out!.rows[0]!.isPlayer).toBe(true)
    expect(out!.rows[0]!.label).toBe('You')
    expect(out!.rows[0]!.points).toBe(17)
    // driver-1 is the closest competitor with the same points; the
    // player-tiebreak rule pushes the player on top.
    expect(out!.rows[1]!.isPlayer).toBe(false)
    expect(out!.rows[1]!.key).toBe('driver-1')
    expect(out!.rows[1]!.points).toBe(17)
    expect(out!.rows[2]!.points).toBe(10)
    expect(out!.rows[3]!.points).toBe(6)
  })
})
