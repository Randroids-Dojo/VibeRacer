import { describe, it, expect } from 'vitest'
import {
  COUNTDOWN_SECONDS_DEFAULT,
  createRaceSession,
  finishingStandings,
  sortFinishingOrderByMs,
  stepRaceSession,
  type RaceSessionConfig,
  type RaceSessionState,
  type StepInput,
} from '@/game/worldTourRaceSession'
import { DEFAULT_CAR_PARAMS } from '@/game/physics'
import type { AiTrackView } from '@/game/worldTourAi'

const ROSTER = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]

const FLAT_STRAIGHT: AiTrackView = {
  centerXAt: () => 0,
  curveAt: () => 0,
}

const CONFIG: RaceSessionConfig = {
  totalLaps: 1,
  lapDistanceMeters: 200,
}

function freshSession(): RaceSessionState {
  return createRaceSession({
    slotCount: 4,
    laneCount: 2,
    aiDrivers: ROSTER,
    seed: 1,
    totalLaps: 1,
    lapDistanceMeters: 200,
    playerCarId: 'starter',
  })
}

const FULL_THROTTLE: StepInput = {
  playerInput: { throttle: 1, steer: 0, handbrake: false },
  dt: 1 / 60,
  track: FLAT_STRAIGHT,
  aiStats: { topSpeed: DEFAULT_CAR_PARAMS.maxSpeed },
}

describe('createRaceSession', () => {
  it('seeds the field with the player on the pole and AI in the remaining slots', () => {
    const s = freshSession()
    expect(s.cars).toHaveLength(4)
    expect(s.cars[0]!.isPlayer).toBe(true)
    expect(s.cars[0]!.driverId).toBeNull()
    expect(s.cars[0]!.aiState).toBeNull()
    for (let i = 1; i < 4; i++) {
      expect(s.cars[i]!.isPlayer).toBe(false)
      expect(s.cars[i]!.aiState).not.toBeNull()
    }
  })

  it('starts in countdown with the documented length', () => {
    const s = freshSession()
    expect(s.phase).toBe('countdown')
    expect(s.countdownRemainingSec).toBe(COUNTDOWN_SECONDS_DEFAULT)
    expect(s.elapsedMs).toBe(0)
    expect(s.tick).toBe(0)
  })

  it('places all cars at their grid slot positions', () => {
    const s = freshSession()
    for (const car of s.cars) {
      expect(car.physics.speed).toBe(0)
      expect(car.physics.heading).toBe(0)
    }
  })

  it('carries the playerInitialDamage onto the player car', () => {
    const s = createRaceSession({
      slotCount: 2,
      laneCount: 1,
      aiDrivers: [{ id: 'a' }],
      seed: 1,
      totalLaps: 1,
      lapDistanceMeters: 200,
      playerCarId: 'starter',
      playerInitialDamage: 0.4,
    })
    expect(s.cars[0]!.damage).toBeCloseTo(0.4)
    expect(s.cars[1]!.damage).toBe(0)
  })

  it('clamps an out-of-range playerInitialDamage and defaults to 0', () => {
    const a = createRaceSession({
      slotCount: 1,
      laneCount: 1,
      aiDrivers: [],
      seed: 1,
      totalLaps: 1,
      lapDistanceMeters: 200,
      playerCarId: 'starter',
      playerInitialDamage: 2,
    })
    expect(a.cars[0]!.damage).toBe(1)
    const b = createRaceSession({
      slotCount: 1,
      laneCount: 1,
      aiDrivers: [],
      seed: 1,
      totalLaps: 1,
      lapDistanceMeters: 200,
      playerCarId: 'starter',
    })
    expect(b.cars[0]!.damage).toBe(0)
  })
})

describe('createRaceSession (upgrades)', () => {
  it('resolves the player CarParams from the supplied upgrade tiers', () => {
    const baseSession = createRaceSession({
      slotCount: 1,
      laneCount: 1,
      aiDrivers: [],
      seed: 1,
      totalLaps: 1,
      lapDistanceMeters: 100,
      playerCarId: 'starter',
    })
    const upgradedSession = createRaceSession({
      slotCount: 1,
      laneCount: 1,
      aiDrivers: [],
      seed: 1,
      totalLaps: 1,
      lapDistanceMeters: 100,
      playerCarId: 'starter',
      playerUpgrades: { engine: 3, tires: 0, brakes: 0, body: 0 },
    })
    expect(upgradedSession.cars[0]!.params.maxSpeed).toBeGreaterThan(
      baseSession.cars[0]!.params.maxSpeed,
    )
  })

  it('uses the catalog base params for the player carId', () => {
    const onStarter = createRaceSession({
      slotCount: 1,
      laneCount: 1,
      aiDrivers: [],
      seed: 1,
      totalLaps: 1,
      lapDistanceMeters: 100,
      playerCarId: 'starter',
    })
    const onApex = createRaceSession({
      slotCount: 1,
      laneCount: 1,
      aiDrivers: [],
      seed: 1,
      totalLaps: 1,
      lapDistanceMeters: 100,
      playerCarId: 'apex',
    })
    expect(onApex.cars[0]!.params.maxSpeed).toBeGreaterThan(
      onStarter.cars[0]!.params.maxSpeed,
    )
  })

  it('keeps AI cars at the supplied AI tiers', () => {
    const s = createRaceSession({
      slotCount: 2,
      laneCount: 1,
      aiDrivers: [{ id: 'rival' }],
      seed: 1,
      totalLaps: 1,
      lapDistanceMeters: 100,
      playerCarId: 'starter',
      playerUpgrades: { engine: 3, tires: 0, brakes: 0, body: 0 },
      aiUpgrades: { engine: 0, tires: 0, brakes: 0, body: 0 },
    })
    expect(s.cars[1]!.params.maxSpeed).toBeLessThan(s.cars[0]!.params.maxSpeed)
  })
})

describe('stepRaceSession (countdown)', () => {
  it('counts down without moving cars', () => {
    let s = freshSession()
    const originalX = s.cars.map((c) => c.physics.x)
    for (let i = 0; i < 30; i++) {
      s = stepRaceSession(s, FULL_THROTTLE, CONFIG)
    }
    expect(s.phase).toBe('countdown')
    for (let i = 0; i < s.cars.length; i++) {
      expect(s.cars[i]!.physics.x).toBe(originalX[i])
      expect(s.cars[i]!.physics.speed).toBe(0)
    }
  })

  it('flips to racing once the countdown elapses', () => {
    let s = freshSession()
    // Step enough frames to exceed the countdown.
    for (let i = 0; i < (COUNTDOWN_SECONDS_DEFAULT + 1) * 60; i++) {
      s = stepRaceSession(s, FULL_THROTTLE, CONFIG)
    }
    expect(s.phase).not.toBe('countdown')
  })
})

describe('stepRaceSession (racing)', () => {
  it('integrates physics for the player when racing', () => {
    let s = freshSession()
    // Burn through the countdown.
    for (let i = 0; i < (COUNTDOWN_SECONDS_DEFAULT + 1) * 60; i++) {
      s = stepRaceSession(s, FULL_THROTTLE, CONFIG)
    }
    expect(s.cars[0]!.physics.speed).toBeGreaterThan(0)
  })

  it('integrates physics for every AI car when racing', () => {
    let s = freshSession()
    for (let i = 0; i < (COUNTDOWN_SECONDS_DEFAULT + 1) * 60; i++) {
      s = stepRaceSession(s, FULL_THROTTLE, CONFIG)
    }
    for (let i = 1; i < s.cars.length; i++) {
      expect(s.cars[i]!.physics.speed).toBeGreaterThan(0)
    }
  })

  it('is deterministic under identical inputs and seed', () => {
    let a = freshSession()
    let b = freshSession()
    for (let i = 0; i < 600; i++) {
      a = stepRaceSession(a, FULL_THROTTLE, CONFIG)
      b = stepRaceSession(b, FULL_THROTTLE, CONFIG)
    }
    expect(a.cars.map((c) => c.physics.x)).toEqual(b.cars.map((c) => c.physics.x))
    expect(a.cars.map((c) => c.physics.z)).toEqual(b.cars.map((c) => c.physics.z))
    expect(a.cars.map((c) => c.physics.speed)).toEqual(
      b.cars.map((c) => c.physics.speed),
    )
  })

  it('flips a car to finished after distanceTraveled exceeds the lap distance', () => {
    const session = createRaceSession({
      slotCount: 1,
      laneCount: 1,
      aiDrivers: [],
      seed: 1,
      totalLaps: 1,
      lapDistanceMeters: 20,
      playerCarId: 'starter',
    })
    let s = session
    // Step enough that the player must travel 20 m. Full throttle at
    // base accel reaches plenty of speed in a few seconds.
    for (let i = 0; i < 60 * 8; i++) {
      s = stepRaceSession(s, FULL_THROTTLE, {
        totalLaps: 1,
        lapDistanceMeters: 20,
      })
      if (s.phase === 'finished') break
    }
    expect(s.cars[0]!.status).toBe('finished')
    expect(s.cars[0]!.finishedAtMs).not.toBeNull()
    expect(s.finishingOrder).toContain(0)
  })

  it('flips a car to DNF when it sits with no forward progress for the timeout', () => {
    const config: RaceSessionConfig = {
      totalLaps: 1,
      lapDistanceMeters: 200,
    }
    const session = createRaceSession({
      slotCount: 1,
      laneCount: 1,
      aiDrivers: [],
      seed: 1,
      totalLaps: 1,
      lapDistanceMeters: 200,
      playerCarId: 'starter',
    })
    let s = session
    const NEUTRAL: StepInput = {
      playerInput: { throttle: 0, steer: 0, handbrake: false },
      dt: 1 / 30,
      track: FLAT_STRAIGHT,
      aiStats: { topSpeed: DEFAULT_CAR_PARAMS.maxSpeed },
    }
    // Burn through the countdown without throttle, then sit for the
    // no-progress timeout (60 s).
    for (let i = 0; i < (COUNTDOWN_SECONDS_DEFAULT + 61) * 30; i++) {
      s = stepRaceSession(s, NEUTRAL, config)
      if (s.cars[0]!.status === 'dnf') break
    }
    expect(s.cars[0]!.status).toBe('dnf')
  })

  it('moves to finished once every car has finished or DNF d', () => {
    const session = createRaceSession({
      slotCount: 2,
      laneCount: 1,
      aiDrivers: [{ id: 'rival' }],
      seed: 1,
      totalLaps: 1,
      lapDistanceMeters: 30,
      playerCarId: 'starter',
    })
    let s = session
    for (let i = 0; i < 60 * 12; i++) {
      s = stepRaceSession(s, FULL_THROTTLE, {
        totalLaps: 1,
        lapDistanceMeters: 30,
      })
      if (s.phase === 'finished') break
    }
    expect(s.phase).toBe('finished')
    expect(s.cars.every((c) => c.status !== 'racing')).toBe(true)
  })

  it('does not advance further once finished', () => {
    let s = freshSession()
    // Force the phase.
    s = { ...s, phase: 'finished' }
    const before = s.tick
    s = stepRaceSession(s, FULL_THROTTLE, CONFIG)
    expect(s.phase).toBe('finished')
    expect(s.tick).toBe(before + 1)
  })
})

describe('sortFinishingOrderByMs', () => {
  it('rebuilds finishingOrder by ascending finishedAtMs (regression: player pushed first wins by slow time)', () => {
    const session = freshSession()
    // Externally seeded scenario the tour route can produce: the
    // player (slot 0) is pushed into finishingOrder first because the
    // 3D canvas owns their finish-line cross, then the AI sim runs
    // to completion. Player's finishedAtMs is much later than the
    // AI cars' but they sit at index 0 of finishingOrder.
    const state: RaceSessionState = {
      ...session,
      cars: session.cars.map((c, i) => ({
        ...c,
        physics: { ...c.physics },
        status: 'finished',
        finishedAtMs: [80_000, 55_000, 60_000, 65_000][i] ?? 0,
      })),
      finishingOrder: [0, 1, 2, 3],
    }
    const out = sortFinishingOrderByMs(state)
    expect(out.finishingOrder).toEqual([1, 2, 3, 0])
  })

  it('pins still-racing cars to the back of the order', () => {
    const session = freshSession()
    const state: RaceSessionState = {
      ...session,
      cars: session.cars.map((c, i) => ({
        ...c,
        physics: { ...c.physics },
        status: i === 0 ? 'racing' : 'finished',
        finishedAtMs: i === 0 ? null : [null, 50_000, 60_000, 70_000][i]!,
      })),
      finishingOrder: [],
    }
    const out = sortFinishingOrderByMs(state)
    expect(out.finishingOrder).toEqual([1, 2, 3, 0])
  })

  it('breaks ties on car index so the order is deterministic', () => {
    const session = freshSession()
    const state: RaceSessionState = {
      ...session,
      cars: session.cars.map((c) => ({
        ...c,
        physics: { ...c.physics },
        status: 'finished',
        finishedAtMs: 50_000,
      })),
      finishingOrder: [],
    }
    const out = sortFinishingOrderByMs(state)
    expect(out.finishingOrder).toEqual([0, 1, 2, 3])
  })
})

describe('finishingStandings', () => {
  it('returns the finishing order followed by any unfinished cars', () => {
    const session = freshSession()
    const state: RaceSessionState = {
      ...session,
      finishingOrder: [2, 0],
    }
    expect(finishingStandings(state)).toEqual([2, 0, 1, 3])
  })

  it('is exactly the finishing order when every car has crossed the line', () => {
    const session = freshSession()
    const state: RaceSessionState = {
      ...session,
      finishingOrder: [0, 3, 1, 2],
    }
    expect(finishingStandings(state)).toEqual([0, 3, 1, 2])
  })
})

describe('stepRaceSession driven by the real AI track view', () => {
  // Replaces the legacy "synthesized-final-state" path that randomized
  // AI finish times. With a real rail-backed track view in hand the
  // session must produce a deterministic finishing order from the
  // same (seed, dt) inputs.
  it('produces a deterministic finishingStandings across two identical sims', async () => {
    const { buildRail } = await import('@/game/worldTourRail')
    const { buildTrackPath } = await import('@/game/trackPath')
    const { getTrackTemplate } = await import('@/game/trackTemplates')
    const { buildAiTrackView } = await import('@/game/worldTourTrackView')

    const template = getTrackTemplate('top-gear-opener')!
    const rail = buildRail(buildTrackPath(template.pieces))
    const aiTrack = buildAiTrackView(rail)
    const FINAL_DT = 1 / 60

    function runOnce(): number[] {
      let s = createRaceSession({
        slotCount: 4,
        laneCount: 2,
        aiDrivers: ROSTER,
        seed: 42,
        totalLaps: 1,
        lapDistanceMeters: rail.totalLength,
        playerCarId: 'starter',
        countdownSeconds: 0,
      })
      const step = {
        playerInput: { throttle: 0, steer: 0, handbrake: false },
        dt: FINAL_DT,
        track: aiTrack,
        aiStats: { topSpeed: DEFAULT_CAR_PARAMS.maxSpeed },
      }
      const config = {
        totalLaps: 1,
        lapDistanceMeters: rail.totalLength,
      }
      let safety = 0
      while (s.phase !== 'finished' && safety < 60 * 60 * 5) {
        s = stepRaceSession(s, step, config)
        safety++
      }
      return finishingStandings(s)
    }

    const a = runOnce()
    const b = runOnce()
    expect(a).toEqual(b)
    expect(a).toHaveLength(4)
  })

  it('a stationary player does NOT mysteriously finish first (regression: the legacy random-offset bug)', async () => {
    // Replays the user-reported scenario: a player who never throttles
    // the car should not be awarded 1st place. With the real AI sim
    // running against the rail, the AI cars must lap the rail and
    // finish ahead while the player (slot 0) sits at speed 0.
    const { buildRail } = await import('@/game/worldTourRail')
    const { buildTrackPath } = await import('@/game/trackPath')
    const { getTrackTemplate } = await import('@/game/trackTemplates')
    const { buildAiTrackView } = await import('@/game/worldTourTrackView')

    const template = getTrackTemplate('top-gear-opener')!
    const rail = buildRail(buildTrackPath(template.pieces))
    const aiTrack = buildAiTrackView(rail)
    const FINAL_DT = 1 / 60

    let s = createRaceSession({
      slotCount: 4,
      laneCount: 2,
      aiDrivers: ROSTER,
      seed: 7,
      totalLaps: 1,
      lapDistanceMeters: rail.totalLength,
      playerCarId: 'starter',
      countdownSeconds: 0,
    })
    const step = {
      // The player slot 0 sits with throttle 0 for the entire race.
      playerInput: { throttle: 0, steer: 0, handbrake: false },
      dt: FINAL_DT,
      track: aiTrack,
      aiStats: { topSpeed: DEFAULT_CAR_PARAMS.maxSpeed },
    }
    const config = { totalLaps: 1, lapDistanceMeters: rail.totalLength }
    let safety = 0
    while (s.phase !== 'finished' && safety < 60 * 60 * 5) {
      s = stepRaceSession(s, step, config)
      safety++
    }
    const order = finishingStandings(s)
    // Slot 0 (the player) must be in the back half of the field. With
    // the synthesizeFinalState stub the player was 1st with a random
    // +1.5s bias regardless of throttle input; the real session has
    // them DNF'd or last because they never advanced any distance.
    expect(order.indexOf(0)).toBeGreaterThan(0)
  })

  it('AI cars stay close to the rail centerline across a full loop (regression: progress drift drove the field off road)', async () => {
    // The earlier wiring integrated `progress += speed * dt` every
    // tick without grounding it against the car's actual position;
    // over a few corners the centerline lookup ended up tens of
    // meters ahead of where the car physically was and the AI
    // chased a phantom centerline into the grass. This test races
    // a 4-car field for one full lap of `top-gear-opener` and
    // asserts no AI ends up more than half a track-width past the
    // edge of the road (a generous bound that catches the "drove
    // off into the trees" bug without false-failing on a wide
    // racing line).
    const { buildRail, projectToRail, sampleRailAt } = await import(
      '@/game/worldTourRail'
    )
    const { buildTrackPath } = await import('@/game/trackPath')
    const { getTrackTemplate } = await import('@/game/trackTemplates')
    const { buildAiTrackView } = await import('@/game/worldTourTrackView')
    const { DEFAULT_TRACK_WIDTH } = await import('@/game/trackWidth')

    const template = getTrackTemplate('top-gear-opener')!
    const rail = buildRail(buildTrackPath(template.pieces))
    const aiTrack = buildAiTrackView(rail)

    let s = createRaceSession({
      slotCount: 4,
      laneCount: 2,
      aiDrivers: ROSTER,
      seed: 3,
      totalLaps: 1,
      lapDistanceMeters: rail.totalLength,
      playerCarId: 'starter',
      countdownSeconds: 0,
    })
    // Mirror the tour route's resetRace: place each AI car on the
    // rail at a small negative progress (lined up behind the start
    // line) with its world heading matching the rail. Without this
    // override the AI cars start at the session's grid-local origin,
    // which is wherever the rail seam happens to land in world coords.
    for (let i = 1; i < s.cars.length; i++) {
      const car = s.cars[i]!
      const lane = (i - 1) % 2 === 0 ? -2 : 2
      const startBack = 6 * (Math.floor((i - 1) / 2) + 1)
      const pose = sampleRailAt(rail, -startBack, lane)
      car.physics = {
        x: pose.x,
        z: pose.z,
        heading: pose.heading,
        speed: 0,
      }
      if (car.aiState) {
        const wrapped =
          ((-startBack) % rail.totalLength + rail.totalLength) % rail.totalLength
        car.aiState = { ...car.aiState, progress: wrapped }
      }
    }
    const step = {
      playerInput: { throttle: 0, steer: 0, handbrake: false },
      dt: 1 / 60,
      track: aiTrack,
      aiStats: { topSpeed: DEFAULT_CAR_PARAMS.maxSpeed },
    }
    const config = { totalLaps: 1, lapDistanceMeters: rail.totalLength }
    // Run until the AI completes the lap or 90 seconds of sim time.
    const maxTicks = 60 * 90
    let aiFinished = false
    const maxLateralMeters: number[] = [0, 0, 0]
    for (let t = 0; t < maxTicks; t++) {
      s = stepRaceSession(s, step, config)
      // Track each AI car's worst lateral deviation from the rail.
      for (let i = 1; i < s.cars.length; i++) {
        const car = s.cars[i]!
        if (car.status !== 'racing') continue
        const proj = projectToRail(rail, car.physics.x, car.physics.z)
        const pose = sampleRailAt(rail, proj, 0)
        const lateral = Math.hypot(
          car.physics.x - pose.x,
          car.physics.z - pose.z,
        )
        if (lateral > maxLateralMeters[i - 1]!) {
          maxLateralMeters[i - 1] = lateral
        }
      }
      const finished = s.cars
        .slice(1)
        .every((c) => c.status === 'finished' || c.status === 'dnf')
      if (finished) {
        aiFinished = true
        break
      }
    }
    expect(aiFinished, 'AI field never completed the lap').toBe(true)
    // No AI car should ever be more than 1.5 road-widths past the
    // centerline (8 m default track width, so 12 m total). A car
    // 12 m laterally off the rail is unambiguously in the trees.
    const limit = DEFAULT_TRACK_WIDTH * 1.5
    for (let i = 0; i < maxLateralMeters.length; i++) {
      expect(
        maxLateralMeters[i]!,
        `AI car ${i + 1} drifted ${maxLateralMeters[i]!.toFixed(1)} m off the rail`,
      ).toBeLessThan(limit)
    }
  })

  it('a stationary player does not cause AI cars to rear-end into mass DNF (regression: race-start pileup)', async () => {
    // A previous iteration of the start-line fix floored
    // followDistanceCap at MIN_AI_SPEED so the AI accelerated to
    // 8 m/s even when the leader was at speed 0. The trailing AI
    // then rear-ended the stationary player at full throttle, each
    // overlap tick added 0.02 damage, and within a second every AI
    // had DNF'd. The launch-hold gate now disables the follow cap
    // during the first 200 m of raced distance and the contact
    // damage is framerate-scaled; the test asserts the AI field
    // survives a stationary-player race start.
    const { buildRail } = await import('@/game/worldTourRail')
    const { buildTrackPath } = await import('@/game/trackPath')
    const { getTrackTemplate } = await import('@/game/trackTemplates')
    const { buildAiTrackView } = await import('@/game/worldTourTrackView')

    const template = getTrackTemplate('top-gear-opener')!
    const rail = buildRail(buildTrackPath(template.pieces))
    const aiTrack = buildAiTrackView(rail)

    let s = createRaceSession({
      slotCount: 4,
      laneCount: 2,
      aiDrivers: ROSTER,
      seed: 13,
      totalLaps: 1,
      lapDistanceMeters: rail.totalLength,
      playerCarId: 'starter',
      countdownSeconds: 0,
    })
    const step = {
      playerInput: { throttle: 0, steer: 0, handbrake: false },
      dt: 1 / 60,
      track: aiTrack,
      aiStats: { topSpeed: DEFAULT_CAR_PARAMS.maxSpeed },
    }
    const config = { totalLaps: 1, lapDistanceMeters: rail.totalLength }
    // Sim 5 seconds of race time. By then every AI car must have
    // cleared the start straight without DNFing from contact damage.
    for (let i = 0; i < 60 * 5; i++) {
      s = stepRaceSession(s, step, config)
    }
    const aiDnfCount = s.cars
      .slice(1)
      .filter((c) => c.status === 'dnf').length
    expect(aiDnfCount).toBe(0)
  })
})
