import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TRACK_MUSIC,
  MUSIC_FINISH_STINGER_STEP_COUNT,
  TRACK_MUSIC_SCALE_FLAVORS,
  TRACK_MUSIC_VOICES,
  TRACK_MUSIC_WAVES,
  MUSIC_STEP_COUNT,
  TrackMusicSchema,
  generateMusicFromSeed,
} from '@/lib/trackMusic'

describe('TrackMusicSchema', () => {
  it('round-trips the default tune', () => {
    expect(TrackMusicSchema.parse(DEFAULT_TRACK_MUSIC)).toEqual(DEFAULT_TRACK_MUSIC)
  })

  it('rejects malformed step patterns', () => {
    const malformed = structuredClone(DEFAULT_TRACK_MUSIC)
    malformed.voices.bass.steps = malformed.voices.bass.steps.slice(0, 15)
    expect(TrackMusicSchema.safeParse(malformed).success).toBe(false)
  })

  it('accepts 8-step finish stingers', () => {
    const tune = structuredClone(DEFAULT_TRACK_MUSIC)
    tune.automation.finishStinger = [0, 2, 4, 7, 4, 2, 0, null]
    expect(tune.automation.finishStinger).toHaveLength(
      MUSIC_FINISH_STINGER_STEP_COUNT,
    )
    expect(TrackMusicSchema.parse(tune)).toEqual(tune)
  })

  it('rejects 16-step finish stingers', () => {
    const tune = structuredClone(DEFAULT_TRACK_MUSIC)
    tune.automation.finishStinger = Array.from({ length: 16 }, () => 0)
    expect(TrackMusicSchema.safeParse(tune).success).toBe(false)
  })

  it('rejects out-of-range musical globals', () => {
    const malformed = structuredClone(DEFAULT_TRACK_MUSIC)
    malformed.bpm = 221
    expect(TrackMusicSchema.safeParse(malformed).success).toBe(false)
  })
})

describe('generateMusicFromSeed', () => {
  it('is deterministic for the same seed word', () => {
    expect(generateMusicFromSeed('neon')).toEqual(generateMusicFromSeed('neon'))
  })

  it('normalizes blank words to a stable fallback', () => {
    expect(generateMusicFromSeed('')).toEqual(generateMusicFromSeed('   '))
    expect(generateMusicFromSeed('').seedWord).toBe('viberacer')
  })

  it('keeps generated tunes inside published menus and ranges', () => {
    const tune = generateMusicFromSeed('night-drive')
    expect(tune.schemaVersion).toBe(1)
    expect(tune.bpm).toBeGreaterThanOrEqual(96)
    expect(tune.bpm).toBeLessThanOrEqual(168)
    expect(tune.rootMidi).toBeGreaterThanOrEqual(48)
    expect(tune.rootMidi).toBeLessThanOrEqual(83)
    expect(TRACK_MUSIC_SCALE_FLAVORS).toContain(tune.scale)
    for (const voiceName of TRACK_MUSIC_VOICES) {
      const voice = tune.voices[voiceName]
      expect(TRACK_MUSIC_WAVES).toContain(voice.wave)
      expect(voice.steps).toHaveLength(MUSIC_STEP_COUNT)
      expect(voice.volume).toBeGreaterThanOrEqual(0)
      expect(voice.volume).toBeLessThanOrEqual(1)
    }
    expect(TrackMusicSchema.safeParse(tune).success).toBe(true)
  })

  it('usually produces different tune fingerprints for different words', () => {
    const neon = generateMusicFromSeed('neon')
    const canyon = generateMusicFromSeed('canyon')
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
