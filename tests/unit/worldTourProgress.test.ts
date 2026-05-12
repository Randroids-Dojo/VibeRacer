import { describe, it, expect } from 'vitest'
import {
  applyRaceResult,
  buildTourCompletionSummary,
} from '@/game/worldTourProgress'
import {
  STANDARD_CHAMPIONSHIP,
  VELVET_COAST_TOUR_ID,
} from '@/data/worldTourChampionship'
import {
  defaultCareer,
  type WorldTourCareer,
} from '@/game/worldTourCareer'
import type { RaceResult } from '@/game/worldTourRaceResult'

function midTourResult(overrides: Partial<RaceResult> = {}): RaceResult {
  return {
    trackId: 'velvet-coast-1',
    totalLaps: 1,
    finishingOrder: [],
    playerPlacement: 1,
    playerDnf: false,
    pointsEarned: 10,
    cashBaseEarned: 500,
    bonusEarned: 0,
    cashEarned: 500,
    tourProgress: {
      tourId: VELVET_COAST_TOUR_ID,
      raceIndex: 0,
      nextRaceIndex: 1,
      completed: false,
      passed: null,
      playerStanding: null,
    },
    nextRace: {
      tourId: VELVET_COAST_TOUR_ID,
      raceIndex: 1,
      trackId: 'velvet-coast-2',
    },
    ...overrides,
  }
}

function finalTourResult(overrides: Partial<RaceResult> = {}): RaceResult {
  return {
    trackId: 'velvet-coast-4',
    totalLaps: 1,
    finishingOrder: [],
    playerPlacement: 1,
    playerDnf: false,
    pointsEarned: 10,
    cashBaseEarned: 500,
    bonusEarned: 1000,
    cashEarned: 1500,
    tourProgress: {
      tourId: VELVET_COAST_TOUR_ID,
      raceIndex: 3,
      nextRaceIndex: null,
      completed: true,
      passed: true,
      playerStanding: 1,
    },
    nextRace: null,
    ...overrides,
  }
}

describe('applyRaceResult (mid-tour)', () => {
  it('seeds activeTour on the first race and credits cash', () => {
    const out = applyRaceResult({
      career: defaultCareer(),
      raceResult: midTourResult(),
      championship: STANDARD_CHAMPIONSHIP,
    })
    expect(out.career.activeTour).not.toBeNull()
    expect(out.career.activeTour!.tourId).toBe(VELVET_COAST_TOUR_ID)
    expect(out.career.activeTour!.raceIndex).toBe(1)
    expect(out.career.activeTour!.results).toHaveLength(1)
    expect(out.career.money).toBe(defaultCareer().money + 500)
  })

  it('appends to existing results on subsequent races', () => {
    const seed = applyRaceResult({
      career: defaultCareer(),
      raceResult: midTourResult(),
      championship: STANDARD_CHAMPIONSHIP,
    })
    const out = applyRaceResult({
      career: seed.career,
      raceResult: midTourResult({
        trackId: 'velvet-coast-2',
        tourProgress: {
          tourId: VELVET_COAST_TOUR_ID,
          raceIndex: 1,
          nextRaceIndex: 2,
          completed: false,
          passed: null,
          playerStanding: null,
        },
      }),
      championship: STANDARD_CHAMPIONSHIP,
    })
    expect(out.career.activeTour!.raceIndex).toBe(2)
    expect(out.career.activeTour!.results).toHaveLength(2)
  })

  it('is idempotent when the same race index is applied twice', () => {
    const seed = applyRaceResult({
      career: defaultCareer(),
      raceResult: midTourResult(),
      championship: STANDARD_CHAMPIONSHIP,
    })
    const repeat = applyRaceResult({
      career: seed.career,
      raceResult: midTourResult(),
      championship: STANDARD_CHAMPIONSHIP,
    })
    expect(repeat.career).toEqual(seed.career)
    expect(repeat.career.money).toBe(seed.career.money)
  })
})

describe('applyRaceResult (final race, pass)', () => {
  it('clears activeTour, marks the tour completed, and credits the bonus', () => {
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
    const out = applyRaceResult({
      career,
      raceResult: finalTourResult(),
      championship: STANDARD_CHAMPIONSHIP,
    })
    expect(out.career.activeTour).toBeNull()
    expect(out.career.completedTourIds).toContain(VELVET_COAST_TOUR_ID)
    expect(out.career.money).toBe(career.money + 1500)
  })

  it('does not double-add a completed tour id', () => {
    const career: WorldTourCareer = {
      ...defaultCareer(),
      completedTourIds: [VELVET_COAST_TOUR_ID],
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
    const out = applyRaceResult({
      career,
      raceResult: finalTourResult(),
      championship: STANDARD_CHAMPIONSHIP,
    })
    expect(out.career.completedTourIds).toEqual([VELVET_COAST_TOUR_ID])
  })
})

describe('applyRaceResult (final race, fail)', () => {
  it('clears activeTour but does not mark the tour completed', () => {
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
    const failResult = finalTourResult({
      playerPlacement: 4,
      pointsEarned: 0,
      cashBaseEarned: 0,
      bonusEarned: 0,
      cashEarned: 0,
      tourProgress: {
        tourId: VELVET_COAST_TOUR_ID,
        raceIndex: 3,
        nextRaceIndex: null,
        completed: true,
        passed: false,
        playerStanding: 4,
      },
    })
    const out = applyRaceResult({
      career,
      raceResult: failResult,
      championship: STANDARD_CHAMPIONSHIP,
    })
    expect(out.career.activeTour).toBeNull()
    expect(out.career.completedTourIds).not.toContain(VELVET_COAST_TOUR_ID)
    // Money and upgrades retained per the plan (no permadeath).
    expect(out.career.money).toBe(career.money)
  })

  it('keeps the failed tour in unlockedTourIds so the player can retry', () => {
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
    const failResult = finalTourResult({
      tourProgress: {
        tourId: VELVET_COAST_TOUR_ID,
        raceIndex: 3,
        nextRaceIndex: null,
        completed: true,
        passed: false,
        playerStanding: 4,
      },
    })
    const out = applyRaceResult({
      career,
      raceResult: failResult,
      championship: STANDARD_CHAMPIONSHIP,
    })
    expect(out.career.unlockedTourIds).toContain(VELVET_COAST_TOUR_ID)
  })
})

describe('buildTourCompletionSummary', () => {
  it('returns null for a mid-tour result', () => {
    const summary = buildTourCompletionSummary(
      STANDARD_CHAMPIONSHIP,
      midTourResult(),
    )
    expect(summary).toBeNull()
  })

  it('returns the pass summary on a final race', () => {
    const summary = buildTourCompletionSummary(
      STANDARD_CHAMPIONSHIP,
      finalTourResult(),
    )
    expect(summary).not.toBeNull()
    expect(summary!.passed).toBe(true)
    expect(summary!.tourId).toBe(VELVET_COAST_TOUR_ID)
    expect(summary!.tourName).toBe('Velvet Coast')
    expect(summary!.playerStanding).toBe(1)
    expect(summary!.requiredStanding).toBe(2)
    expect(summary!.bonusEarned).toBe(1000)
  })

  it('returns the fail summary on a missed gate', () => {
    const summary = buildTourCompletionSummary(
      STANDARD_CHAMPIONSHIP,
      finalTourResult({
        tourProgress: {
          tourId: VELVET_COAST_TOUR_ID,
          raceIndex: 3,
          nextRaceIndex: null,
          completed: true,
          passed: false,
          playerStanding: 4,
        },
        bonusEarned: 0,
      }),
    )
    expect(summary).not.toBeNull()
    expect(summary!.passed).toBe(false)
    expect(summary!.playerStanding).toBe(4)
    expect(summary!.bonusEarned).toBe(0)
  })
})
