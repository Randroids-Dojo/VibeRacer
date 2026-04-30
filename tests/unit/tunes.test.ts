import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TRACK_TUNE,
  TUNE_FINISH_STINGER_STEP_COUNT,
  TRACK_TUNE_SCALE_FLAVORS,
  TRACK_TUNE_VOICES,
  TRACK_TUNE_WAVES,
  TUNE_STEP_COUNT,
  TrackTuneSchema,
  generateTuneFromSeed,
} from '@/lib/tunes'

describe('TrackTuneSchema', () => {
  it('round-trips the default tune', () => {
    expect(TrackTuneSchema.parse(DEFAULT_TRACK_TUNE)).toEqual(DEFAULT_TRACK_TUNE)
  })

  it('rejects malformed step patterns', () => {
    const malformed = structuredClone(DEFAULT_TRACK_TUNE)
    malformed.voices.bass.steps = malformed.voices.bass.steps.slice(0, 15)
    expect(TrackTuneSchema.safeParse(malformed).success).toBe(false)
  })

  it('accepts 8-step finish stingers', () => {
    const tune = structuredClone(DEFAULT_TRACK_TUNE)
    tune.automation.finishStinger = [0, 2, 4, 7, 4, 2, 0, null]
    expect(tune.automation.finishStinger).toHaveLength(
      TUNE_FINISH_STINGER_STEP_COUNT,
    )
    expect(TrackTuneSchema.parse(tune)).toEqual(tune)
  })

  it('rejects 16-step finish stingers', () => {
    const tune = structuredClone(DEFAULT_TRACK_TUNE)
    tune.automation.finishStinger = Array.from({ length: 16 }, () => 0)
    expect(TrackTuneSchema.safeParse(tune).success).toBe(false)
  })

  it('rejects out-of-range musical globals', () => {
    const malformed = structuredClone(DEFAULT_TRACK_TUNE)
    malformed.bpm = 221
    expect(TrackTuneSchema.safeParse(malformed).success).toBe(false)
  })
})

describe('generateTuneFromSeed', () => {
  it('is deterministic for the same seed word', () => {
    expect(generateTuneFromSeed('neon')).toEqual(generateTuneFromSeed('neon'))
  })

  it('normalizes blank words to a stable fallback', () => {
    expect(generateTuneFromSeed('')).toEqual(generateTuneFromSeed('   '))
    expect(generateTuneFromSeed('').seedWord).toBe('viberacer')
  })

  it('keeps generated tunes inside published menus and ranges', () => {
    const tune = generateTuneFromSeed('night-drive')
    expect(tune.schemaVersion).toBe(1)
    expect(tune.bpm).toBeGreaterThanOrEqual(96)
    expect(tune.bpm).toBeLessThanOrEqual(168)
    expect(tune.rootMidi).toBeGreaterThanOrEqual(48)
    expect(tune.rootMidi).toBeLessThanOrEqual(83)
    expect(TRACK_TUNE_SCALE_FLAVORS).toContain(tune.scale)
    for (const voiceName of TRACK_TUNE_VOICES) {
      const voice = tune.voices[voiceName]
      expect(TRACK_TUNE_WAVES).toContain(voice.wave)
      expect(voice.steps).toHaveLength(TUNE_STEP_COUNT)
      expect(voice.volume).toBeGreaterThanOrEqual(0)
      expect(voice.volume).toBeLessThanOrEqual(1)
    }
    expect(TrackTuneSchema.safeParse(tune).success).toBe(true)
  })

  it('usually produces different tune fingerprints for different words', () => {
    const neon = generateTuneFromSeed('neon')
    const canyon = generateTuneFromSeed('canyon')
    expect({
      bpm: neon.bpm,
      rootMidi: neon.rootMidi,
      scale: neon.scale,
      bass: neon.voices.bass.steps,
      melody: neon.voices.melody.steps,
    }).not.toEqual({
      bpm: canyon.bpm,
      rootMidi: canyon.rootMidi,
      scale: canyon.scale,
      bass: canyon.voices.bass.steps,
      melody: canyon.voices.melody.steps,
    })
  })
})
