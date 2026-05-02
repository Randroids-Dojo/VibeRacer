import { describe, expect, it } from 'vitest'
import {
  applyVibePad,
  NEUTRAL_VIBE,
  scaleByMood,
  vibeFromMusic,
  vibeLabel,
} from '@/lib/musicVibe'
import {
  DEFAULT_TRACK_MUSIC,
  TrackMusicSchema,
} from '@/lib/trackMusic'

describe('applyVibePad', () => {
  it('keeps the result valid against TrackMusicSchema across the pad corners', () => {
    for (const energy of [0, 0.5, 1]) {
      for (const mood of [0, 0.5, 1]) {
        const next = applyVibePad(DEFAULT_TRACK_MUSIC, { energy, mood })
        expect(() => TrackMusicSchema.parse(next)).not.toThrow()
      }
    }
  })

  it('clamps out-of-range vibe values', () => {
    const lowEnergy = applyVibePad(DEFAULT_TRACK_MUSIC, {
      energy: -1,
      mood: 0.5,
    })
    const highEnergy = applyVibePad(DEFAULT_TRACK_MUSIC, {
      energy: 5,
      mood: 0.5,
    })
    expect(lowEnergy.bpm).toBe(96)
    expect(highEnergy.bpm).toBe(168)
  })

  it('raises BPM as energy increases', () => {
    const low = applyVibePad(DEFAULT_TRACK_MUSIC, { energy: 0, mood: 0.5 })
    const high = applyVibePad(DEFAULT_TRACK_MUSIC, { energy: 1, mood: 0.5 })
    expect(high.bpm).toBeGreaterThan(low.bpm)
  })

  it('selects a brighter scale as mood rises', () => {
    const order = scaleByMood()
    const dark = applyVibePad(DEFAULT_TRACK_MUSIC, { energy: 0.5, mood: 0 })
    const bright = applyVibePad(DEFAULT_TRACK_MUSIC, { energy: 0.5, mood: 1 })
    expect(order.indexOf(bright.scale)).toBeGreaterThan(
      order.indexOf(dark.scale),
    )
  })

  it('enables the counter voice at high energy and disables it at low', () => {
    const low = applyVibePad(DEFAULT_TRACK_MUSIC, { energy: 0, mood: 0.5 })
    const high = applyVibePad(DEFAULT_TRACK_MUSIC, { energy: 1, mood: 0.5 })
    expect(low.voices.counter.enabled).toBe(false)
    expect(high.voices.counter.enabled).toBe(true)
  })

  it('preserves step patterns and automation that the pad does not control', () => {
    const before = DEFAULT_TRACK_MUSIC
    const after = applyVibePad(before, { energy: 0.8, mood: 0.2 })
    expect(after.voices.bass.steps).toEqual(before.voices.bass.steps)
    expect(after.voices.melody.steps).toEqual(before.voices.melody.steps)
    expect(after.automation.perLapSemitones).toBe(
      before.automation.perLapSemitones,
    )
    expect(after.automation.finishStinger).toBe(
      before.automation.finishStinger,
    )
  })

  it('is deterministic for the same vibe and base music', () => {
    const a = applyVibePad(DEFAULT_TRACK_MUSIC, { energy: 0.4, mood: 0.7 })
    const b = applyVibePad(DEFAULT_TRACK_MUSIC, { energy: 0.4, mood: 0.7 })
    expect(a).toEqual(b)
  })
})

describe('vibeFromMusic', () => {
  it('round-trips the neutral vibe through default music to a centred energy', () => {
    const seeded = applyVibePad(DEFAULT_TRACK_MUSIC, NEUTRAL_VIBE)
    const recovered = vibeFromMusic(seeded)
    expect(recovered.energy).toBeGreaterThan(0)
    expect(recovered.energy).toBeLessThan(1)
    expect(recovered.mood).toBeGreaterThan(0)
    expect(recovered.mood).toBeLessThan(1)
  })

  it('clamps recovered energy into [0,1] for tunes outside the pad bpm window', () => {
    const slow = { ...DEFAULT_TRACK_MUSIC, bpm: 60 }
    const fast = { ...DEFAULT_TRACK_MUSIC, bpm: 220 }
    expect(vibeFromMusic(slow).energy).toBe(0)
    expect(vibeFromMusic(fast).energy).toBe(1)
  })
})

describe('vibeLabel', () => {
  it('returns a label for each quadrant', () => {
    const labels = new Set<string>()
    labels.add(vibeLabel({ energy: 0.1, mood: 0.1 }))
    labels.add(vibeLabel({ energy: 0.1, mood: 0.9 }))
    labels.add(vibeLabel({ energy: 0.9, mood: 0.1 }))
    labels.add(vibeLabel({ energy: 0.9, mood: 0.9 }))
    expect(labels.size).toBe(4)
  })
})
