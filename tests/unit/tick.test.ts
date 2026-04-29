import { describe, it, expect } from 'vitest'
import { buildTrackPath } from '@/game/trackPath'
import { DEFAULT_TRACK_PIECES } from '@/lib/defaultTrack'
import { initGameState, startRace, tick } from '@/game/tick'

const path = buildTrackPath(DEFAULT_TRACK_PIECES)

describe('tick', () => {
  it('initGameState places car at spawn and on-track', () => {
    const s = initGameState(path)
    expect(s.x).toBeCloseTo(path.spawn.position.x, 6)
    expect(s.z).toBeCloseTo(path.spawn.position.z, 6)
    expect(s.heading).toBeCloseTo(path.spawn.heading, 6)
    expect(s.raceStartMs).toBeNull()
    expect(s.nextCpId).toBe(0)
    expect(s.gear).toBe(1)
  })

  it('before startRace, physics does not progress', () => {
    const s = initGameState(path)
    const r = tick(s, { throttle: 1, steer: 0, handbrake: false }, 16, 1000, path)
    expect(r.state.x).toBeCloseTo(s.x, 6)
    expect(r.state.speed).toBe(0)
  })

  it('shifts gears only when manual transmission is active', () => {
    const s = startRace(initGameState(path), 0)
    const automatic = tick(
      s,
      { throttle: 0, steer: 0, handbrake: false, shiftUp: true },
      16,
      16,
      path,
    )
    expect(automatic.state.gear).toBe(1)

    const manual = tick(
      s,
      { throttle: 0, steer: 0, handbrake: false, shiftUp: true },
      16,
      16,
      path,
      undefined,
      'manual',
    )
    expect(manual.state.gear).toBe(2)
  })

  it('manual low gear limits top speed below high gear', () => {
    const s = {
      ...startRace(initGameState(path), 0),
      gear: 1,
      speed: 100,
    }
    const low = tick(
      s,
      { throttle: 1, steer: 0, handbrake: false },
      16,
      16,
      path,
      undefined,
      'manual',
    )
    const high = tick(
      { ...s, gear: 5 },
      { throttle: 1, steer: 0, handbrake: false },
      16,
      16,
      path,
      undefined,
      'manual',
    )
    expect(low.state.speed).toBeLessThan(high.state.speed)
  })

  it('teleporting through checkpoints records hits in order and fires lap complete', () => {
    let s = startRace(initGameState(path), 0)
    let now = 0
    const N = path.order.length

    // Teleport through each expected cell to sidestep physics.
    for (let i = 0; i < N; i++) {
      now += 300
      const nextCell = path.order[(i + 1) % N].center
      s = { ...s, x: nextCell.x, z: nextCell.z }
      const r = tick(s, { throttle: 0, steer: 0, handbrake: false }, 16, now, path)
      s = r.state
      if (i < N - 1) {
        expect(r.lapComplete).toBeNull()
        expect(s.nextCpId).toBe(i + 1)
      } else {
        expect(r.lapComplete).not.toBeNull()
        expect(r.lapComplete!.hits.length).toBe(N)
        expect(r.lapComplete!.hits[0].cpId).toBe(0)
        expect(r.lapComplete!.hits[N - 1].cpId).toBe(N - 1)
        expect(s.lapCount).toBe(1)
        expect(s.nextCpId).toBe(0)
      }
    }
  })

  it('visiting an unexpected cell does not advance the checkpoint counter', () => {
    let s = startRace(initGameState(path), 0)
    // Jump the car far off track into a cell that is not the next expected piece.
    s = { ...s, x: 1000, z: 1000 }
    const r = tick(s, { throttle: 0, steer: 0, handbrake: false }, 16, 100, path)
    expect(r.state.nextCpId).toBe(0)
    expect(r.state.onTrack).toBe(false)
  })

  it('re-entering start piece mid-lap invalidates hits and restarts the timer', () => {
    let s = startRace(initGameState(path), 0)
    // Hit CP 0 by entering piece 1.
    const piece1 = path.order[1].center
    s = { ...s, x: piece1.x, z: piece1.z }
    let r = tick(s, { throttle: 0, steer: 0, handbrake: false }, 16, 300, path)
    expect(r.state.nextCpId).toBe(1)
    expect(r.state.hits.length).toBe(1)
    s = r.state

    // Now jump back to the start piece without completing the loop.
    const start = path.order[0].center
    s = { ...s, x: start.x, z: start.z }
    r = tick(s, { throttle: 0, steer: 0, handbrake: false }, 16, 900, path)

    expect(r.lapComplete).toBeNull()
    expect(r.state.nextCpId).toBe(0)
    expect(r.state.hits.length).toBe(0)
    expect(r.state.raceStartMs).toBe(900)
    expect(r.state.lapCount).toBe(0)
  })
})

describe('tick with reduced checkpointCount', () => {
  const sparsePath = buildTrackPath(DEFAULT_TRACK_PIECES, 4)

  it('completes the lap after K hits at the K trigger pieces', () => {
    let s = startRace(initGameState(sparsePath), 0)
    let now = 0
    const triggers = sparsePath.cpTriggerPieceIdx
    expect(triggers).toEqual([2, 4, 6, 0])

    for (let k = 0; k < triggers.length; k++) {
      now += 600
      const cell = sparsePath.order[triggers[k]].center
      s = { ...s, x: cell.x, z: cell.z }
      const r = tick(s, { throttle: 0, steer: 0, handbrake: false }, 16, now, sparsePath)
      s = r.state
      if (k < triggers.length - 1) {
        expect(r.lapComplete).toBeNull()
        expect(s.nextCpId).toBe(k + 1)
      } else {
        expect(r.lapComplete).not.toBeNull()
        expect(r.lapComplete!.hits.length).toBe(triggers.length)
        expect(s.lapCount).toBe(1)
        expect(s.nextCpId).toBe(0)
      }
    }
  })

  it('still resets when the car re-enters start before the final CP', () => {
    let s = startRace(initGameState(sparsePath), 0)
    // Hit CP 0 at piece 2.
    const cp0 = sparsePath.order[2].center
    s = { ...s, x: cp0.x, z: cp0.z }
    let r = tick(s, { throttle: 0, steer: 0, handbrake: false }, 16, 500, sparsePath)
    expect(r.state.nextCpId).toBe(1)
    s = r.state

    // Bail back to piece 0 instead of continuing.
    const start = sparsePath.order[0].center
    s = { ...s, x: start.x, z: start.z }
    r = tick(s, { throttle: 0, steer: 0, handbrake: false }, 16, 900, sparsePath)
    expect(r.lapComplete).toBeNull()
    expect(r.state.nextCpId).toBe(0)
    expect(r.state.hits.length).toBe(0)
  })
})
