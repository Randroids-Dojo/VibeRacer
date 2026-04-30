import { describe, it, expect } from 'vitest'
import {
  SCALES,
  finishStingerEventsForTune,
  gameStepEventsForTune,
  midiFreq,
  resolveTuneAutomation,
  scaleDeg,
} from '@/game/music'
import { DEFAULT_TRACK_MUSIC } from '@/lib/trackMusic'

describe('midiFreq', () => {
  it('A4 (midi 69) is 440 Hz', () => {
    expect(midiFreq(69)).toBeCloseTo(440, 6)
  })

  it('one octave up doubles the frequency', () => {
    expect(midiFreq(81) / midiFreq(69)).toBeCloseTo(2, 6)
  })

  it('one octave down halves the frequency', () => {
    expect(midiFreq(57) / midiFreq(69)).toBeCloseTo(0.5, 6)
  })

  it('is monotonic in midi number', () => {
    for (let n = 40; n < 90; n++) {
      expect(midiFreq(n + 1)).toBeGreaterThan(midiFreq(n))
    }
  })
})

describe('resolveTuneAutomation', () => {
  it('applies per-lap key changes to the tune root', () => {
    const tune = structuredClone(DEFAULT_TRACK_MUSIC)
    tune.automation.perLapSemitones = 2
    expect(resolveTuneAutomation(tune, { lapIndex: 3, offTrack: false })).toMatchObject({
      rootMidi: DEFAULT_TRACK_MUSIC.rootMidi + 6,
      scaleFlavor: DEFAULT_TRACK_MUSIC.scale,
      volumeDuck: 1,
    })
  })

  it('uses the off-track scale and duck amount while off track', () => {
    const tune = structuredClone(DEFAULT_TRACK_MUSIC)
    tune.automation.offTrackScale = 'dorian'
    tune.automation.offTrackDuck = 0.42
    expect(resolveTuneAutomation(tune, { lapIndex: 0, offTrack: true })).toMatchObject({
      rootMidi: DEFAULT_TRACK_MUSIC.rootMidi,
      scaleFlavor: 'dorian',
      scale: SCALES.dorian,
      volumeDuck: 0.42,
    })
  })

  it('keeps the base scale when off-track flavor is unset', () => {
    const tune = structuredClone(DEFAULT_TRACK_MUSIC)
    tune.automation.offTrackDuck = 0.2
    expect(resolveTuneAutomation(tune, { lapIndex: 0, offTrack: true })).toMatchObject({
      scaleFlavor: DEFAULT_TRACK_MUSIC.scale,
      volumeDuck: 0.2,
    })
  })
})

describe('finishStingerEventsForTune', () => {
  it('keeps phrase timing while skipping rests', () => {
    const tune = structuredClone(DEFAULT_TRACK_MUSIC)
    tune.automation.finishStinger = [0, null, 4, null, 7, null, null, 0]
    expect(finishStingerEventsForTune(tune)).toEqual([
      {
        step: 0,
        degree: 0,
        octave: 1,
        wave: 'triangle',
        volume: 0.11,
        durationBeats: 1.25,
      },
      {
        step: 2,
        degree: 4,
        octave: 1,
        wave: 'triangle',
        volume: 0.11,
        durationBeats: 1.25,
      },
      {
        step: 4,
        degree: 7,
        octave: 1,
        wave: 'triangle',
        volume: 0.11,
        durationBeats: 1.25,
      },
      {
        step: 7,
        degree: 0,
        octave: 1,
        wave: 'triangle',
        volume: 0.11,
        durationBeats: 1.25,
      },
    ])
  })

  it('returns no events when the tune has no custom finish stinger', () => {
    expect(finishStingerEventsForTune(DEFAULT_TRACK_MUSIC)).toEqual([])
  })
})

describe('scaleDeg', () => {
  it('degree 0 of C major (root 60) is C4 (midi 60)', () => {
    expect(scaleDeg(60, SCALES.major, 0)).toBeCloseTo(midiFreq(60), 6)
  })

  it('degree equal to scale length wraps one octave up', () => {
    const pent = SCALES.pentatonic
    expect(scaleDeg(60, pent, pent.length)).toBeCloseTo(midiFreq(72), 6)
  })

  it('negative degree wraps down', () => {
    const pent = SCALES.pentatonic
    // deg -1 should be one scale step below the root, i.e. 9 semitones up a octave below.
    // pent = [0,2,4,7,9], so deg -1 normalized = 4 (the 9), octave bonus = -1.
    // root 60 + 9 - 12 = 57 = A3.
    expect(scaleDeg(60, pent, -1)).toBeCloseTo(midiFreq(57), 6)
  })

  it('octave shift adds 12 semitones per octave', () => {
    const major = SCALES.major
    const base = scaleDeg(60, major, 2, 0)
    const up = scaleDeg(60, major, 2, 1)
    expect(up / base).toBeCloseTo(2, 6)
  })
})

describe('SCALES', () => {
  it('includes the canonical four VibeRacer scales', () => {
    expect(SCALES.major).toEqual([0, 2, 4, 5, 7, 9, 11])
    expect(SCALES.minor).toEqual([0, 2, 3, 5, 7, 8, 10])
    expect(SCALES.pentatonic).toEqual([0, 2, 4, 7, 9])
    expect(SCALES.dorian).toEqual([0, 2, 3, 5, 7, 9, 10])
  })
})

describe('gameStepEventsForTune', () => {
  it('renders the default tune like the legacy low-intensity first step', () => {
    expect(gameStepEventsForTune(DEFAULT_TRACK_MUSIC, 0, 0)).toEqual([
      {
        kind: 'note',
        voice: 'bass',
        degree: 0,
        octave: -1,
        wave: 'sawtooth',
        volume: 0.09,
        durationBeats: 2.6,
      },
      {
        kind: 'kick',
        volume: 0.1,
      },
    ])
  })

  it('renders the default tune like the legacy high-intensity drum step', () => {
    expect(gameStepEventsForTune(DEFAULT_TRACK_MUSIC, 4, 1)).toEqual([
      {
        kind: 'note',
        voice: 'bass',
        degree: 4,
        octave: -1,
        wave: 'sawtooth',
        volume: 0.16999999999999998,
        durationBeats: 2.6,
      },
      {
        kind: 'note',
        voice: 'melody',
        degree: 3,
        octave: 1,
        wave: 'square',
        volume: 0.16,
        durationBeats: 1.7,
      },
      {
        kind: 'note',
        voice: 'counter',
        degree: 2,
        octave: 0,
        wave: 'triangle',
        volume: 0.14,
        durationBeats: 3.6,
      },
      {
        kind: 'kick',
        volume: 0.2,
      },
      {
        kind: 'snare',
        volume: 0.14,
      },
    ])
  })

  it('honors authored voice toggles and volumes', () => {
    const tune = structuredClone(DEFAULT_TRACK_MUSIC)
    tune.voices.bass.enabled = false
    tune.voices.arp.enabled = true
    tune.voices.arp.volume = 1
    tune.drums.density = 0
    expect(gameStepEventsForTune(tune, 0, 0)).toEqual([
      {
        kind: 'note',
        voice: 'arp',
        degree: 0,
        octave: 2,
        wave: 'triangle',
        volume: 0.03,
        durationBeats: 0.6,
      },
      {
        kind: 'kick',
        volume: 0,
      },
    ])
  })
})
