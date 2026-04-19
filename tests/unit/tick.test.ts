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
  })

  it('before startRace, physics does not progress', () => {
    const s = initGameState(path)
    const r = tick(s, { throttle: 1, steer: 0, handbrake: false }, 16, 1000, path)
    expect(r.state.x).toBeCloseTo(s.x, 6)
    expect(r.state.speed).toBe(0)
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
})
