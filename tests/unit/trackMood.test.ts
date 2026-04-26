import { describe, expect, it } from 'vitest'
import {
  resolveActiveMood,
  sanitizeTrackMood,
  trackHasMood,
} from '@/game/trackMood'
import type { TrackMood } from '@/lib/schemas'

const PLAYER = {
  playerTimeOfDay: 'noon' as const,
  playerWeather: 'clear' as const,
  respectTrackMood: true,
}

describe('resolveActiveMood', () => {
  it('falls back to player picks when trackMood is null', () => {
    expect(resolveActiveMood({ ...PLAYER, trackMood: null })).toEqual({
      timeOfDay: 'noon',
      weather: 'clear',
    })
  })

  it('falls back to player picks when trackMood is undefined', () => {
    expect(resolveActiveMood({ ...PLAYER, trackMood: undefined })).toEqual({
      timeOfDay: 'noon',
      weather: 'clear',
    })
  })

  it('uses author timeOfDay when set', () => {
    expect(
      resolveActiveMood({ ...PLAYER, trackMood: { timeOfDay: 'sunset' } }),
    ).toEqual({ timeOfDay: 'sunset', weather: 'clear' })
  })

  it('uses author weather when set', () => {
    expect(
      resolveActiveMood({ ...PLAYER, trackMood: { weather: 'foggy' } }),
    ).toEqual({ timeOfDay: 'noon', weather: 'foggy' })
  })

  it('uses both author fields when set', () => {
    expect(
      resolveActiveMood({
        ...PLAYER,
        trackMood: { timeOfDay: 'night', weather: 'cloudy' },
      }),
    ).toEqual({ timeOfDay: 'night', weather: 'cloudy' })
  })

  it('ignores trackMood entirely when respectTrackMood is false', () => {
    expect(
      resolveActiveMood({
        ...PLAYER,
        respectTrackMood: false,
        trackMood: { timeOfDay: 'sunset', weather: 'foggy' },
      }),
    ).toEqual({ timeOfDay: 'noon', weather: 'clear' })
  })

  it('treats a malformed timeOfDay as not set and falls back to player', () => {
    const trackMood = { timeOfDay: 'midnight' as unknown as TrackMood['timeOfDay'] }
    expect(resolveActiveMood({ ...PLAYER, trackMood })).toEqual({
      timeOfDay: 'noon',
      weather: 'clear',
    })
  })

  it('treats a malformed weather as not set and falls back to player', () => {
    const trackMood = { weather: 'tornado' as unknown as TrackMood['weather'] }
    expect(resolveActiveMood({ ...PLAYER, trackMood })).toEqual({
      timeOfDay: 'noon',
      weather: 'clear',
    })
  })

  it('returns a fresh object on each call', () => {
    const a = resolveActiveMood({ ...PLAYER, trackMood: null })
    const b = resolveActiveMood({ ...PLAYER, trackMood: null })
    expect(a).not.toBe(b)
  })

  it('honors player picks other than the default', () => {
    expect(
      resolveActiveMood({
        playerTimeOfDay: 'morning',
        playerWeather: 'cloudy',
        respectTrackMood: true,
        trackMood: null,
      }),
    ).toEqual({ timeOfDay: 'morning', weather: 'cloudy' })
  })
})

describe('trackHasMood', () => {
  it('returns false for null / undefined', () => {
    expect(trackHasMood(null)).toBe(false)
    expect(trackHasMood(undefined)).toBe(false)
  })

  it('returns false for an empty mood object', () => {
    expect(trackHasMood({})).toBe(false)
  })

  it('returns true when timeOfDay is set', () => {
    expect(trackHasMood({ timeOfDay: 'night' })).toBe(true)
  })

  it('returns true when weather is set', () => {
    expect(trackHasMood({ weather: 'foggy' })).toBe(true)
  })

  it('returns true when both fields are set', () => {
    expect(trackHasMood({ timeOfDay: 'sunset', weather: 'cloudy' })).toBe(true)
  })

  it('returns false when fields are present but malformed', () => {
    expect(
      trackHasMood({
        timeOfDay: 'tomorrow' as unknown as TrackMood['timeOfDay'],
        weather: 'monsoon' as unknown as TrackMood['weather'],
      }),
    ).toBe(false)
  })
})

describe('sanitizeTrackMood', () => {
  it('returns null for null / undefined input', () => {
    expect(sanitizeTrackMood(null)).toBeNull()
    expect(sanitizeTrackMood(undefined)).toBeNull()
  })

  it('returns null when no fields are set', () => {
    expect(sanitizeTrackMood({})).toBeNull()
  })

  it('returns null when fields are malformed', () => {
    expect(
      sanitizeTrackMood({
        timeOfDay: 'lunchtime' as unknown as TrackMood['timeOfDay'],
        weather: 'rain' as unknown as TrackMood['weather'],
      }),
    ).toBeNull()
  })

  it('keeps a valid timeOfDay only', () => {
    expect(sanitizeTrackMood({ timeOfDay: 'morning' })).toEqual({
      timeOfDay: 'morning',
    })
  })

  it('keeps a valid weather only', () => {
    expect(sanitizeTrackMood({ weather: 'foggy' })).toEqual({
      weather: 'foggy',
    })
  })

  it('keeps both valid fields', () => {
    expect(
      sanitizeTrackMood({ timeOfDay: 'sunset', weather: 'cloudy' }),
    ).toEqual({ timeOfDay: 'sunset', weather: 'cloudy' })
  })

  it('drops a malformed field but keeps the valid one', () => {
    expect(
      sanitizeTrackMood({
        timeOfDay: 'sunset',
        weather: 'sandstorm' as unknown as TrackMood['weather'],
      }),
    ).toEqual({ timeOfDay: 'sunset' })
  })

  it('returns a fresh object', () => {
    const input = { timeOfDay: 'noon' as const }
    const out = sanitizeTrackMood(input)
    expect(out).not.toBe(input)
  })
})
