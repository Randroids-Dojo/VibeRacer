import { describe, it, expect } from 'vitest'
import { SCALES, midiFreq, scaleDeg } from '@/game/music'

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
