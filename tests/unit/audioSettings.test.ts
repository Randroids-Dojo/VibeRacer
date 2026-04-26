import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  AUDIO_SETTINGS_STORAGE_KEY,
  DEFAULT_AUDIO_SETTINGS,
  cloneDefaultAudioSettings,
  effectiveMusicGain,
  effectiveSfxGain,
  readStoredAudioSettings,
  writeStoredAudioSettings,
} from '@/lib/audioSettings'

describe('effectiveMusicGain / effectiveSfxGain', () => {
  it('returns 0 when the channel is disabled, regardless of volume', () => {
    expect(
      effectiveMusicGain({ ...DEFAULT_AUDIO_SETTINGS, musicEnabled: false }),
    ).toBe(0)
    expect(
      effectiveSfxGain({ ...DEFAULT_AUDIO_SETTINGS, sfxEnabled: false }),
    ).toBe(0)
  })

  it('returns the channel volume when enabled', () => {
    expect(
      effectiveMusicGain({ ...DEFAULT_AUDIO_SETTINGS, musicVolume: 0.5 }),
    ).toBeCloseTo(0.5, 6)
    expect(
      effectiveSfxGain({ ...DEFAULT_AUDIO_SETTINGS, sfxVolume: 0.25 }),
    ).toBeCloseTo(0.25, 6)
  })

  it('clamps out-of-range volumes', () => {
    expect(
      effectiveMusicGain({ ...DEFAULT_AUDIO_SETTINGS, musicVolume: 2 }),
    ).toBe(1)
    expect(
      effectiveSfxGain({ ...DEFAULT_AUDIO_SETTINGS, sfxVolume: -1 }),
    ).toBe(0)
  })
})

describe('localStorage round-trip', () => {
  const originalWindow = (globalThis as { window?: unknown }).window
  let store: Record<string, string>

  beforeEach(() => {
    store = {}
    const fakeWindow = {
      localStorage: {
        getItem: (k: string) => (k in store ? store[k] : null),
        setItem: (k: string, v: string) => {
          store[k] = v
        },
        removeItem: (k: string) => {
          delete store[k]
        },
        clear: () => {
          store = {}
        },
      },
    }
    ;(globalThis as { window?: unknown }).window = fakeWindow
  })

  afterEach(() => {
    if (originalWindow === undefined) {
      delete (globalThis as { window?: unknown }).window
    } else {
      ;(globalThis as { window?: unknown }).window = originalWindow
    }
  })

  it('returns defaults when storage is empty', () => {
    expect(readStoredAudioSettings()).toEqual(DEFAULT_AUDIO_SETTINGS)
  })

  it('returns defaults when storage holds garbage', () => {
    store[AUDIO_SETTINGS_STORAGE_KEY] = 'not-json'
    expect(readStoredAudioSettings()).toEqual(DEFAULT_AUDIO_SETTINGS)
  })

  it('returns defaults when storage holds a wrong shape', () => {
    store[AUDIO_SETTINGS_STORAGE_KEY] = JSON.stringify({ musicVolume: 0.5 })
    expect(readStoredAudioSettings()).toEqual(DEFAULT_AUDIO_SETTINGS)
  })

  it('rejects out-of-range volumes', () => {
    store[AUDIO_SETTINGS_STORAGE_KEY] = JSON.stringify({
      musicEnabled: true,
      sfxEnabled: true,
      musicVolume: 1.5,
      sfxVolume: 0.5,
    })
    expect(readStoredAudioSettings()).toEqual(DEFAULT_AUDIO_SETTINGS)
  })

  it('reads back what was written', () => {
    const custom = cloneDefaultAudioSettings()
    custom.musicEnabled = false
    custom.sfxVolume = 0.4
    writeStoredAudioSettings(custom)
    expect(readStoredAudioSettings()).toEqual(custom)
  })

  it('defaults musicPerTrack to true on a fresh defaults object', () => {
    expect(DEFAULT_AUDIO_SETTINGS.musicPerTrack).toBe(true)
  })

  it('round-trips musicPerTrack: false', () => {
    const custom = cloneDefaultAudioSettings()
    custom.musicPerTrack = false
    writeStoredAudioSettings(custom)
    expect(readStoredAudioSettings().musicPerTrack).toBe(false)
  })

  it('backfills musicPerTrack to true when the field is missing from a legacy stored payload', () => {
    // Write a legacy payload (no musicPerTrack field).
    store[AUDIO_SETTINGS_STORAGE_KEY] = JSON.stringify({
      musicEnabled: true,
      sfxEnabled: true,
      musicVolume: 0.6,
      sfxVolume: 0.5,
    })
    const read = readStoredAudioSettings()
    expect(read.musicPerTrack).toBe(true)
    // Other fields survive the backfill.
    expect(read.musicEnabled).toBe(true)
    expect(read.musicVolume).toBeCloseTo(0.6, 6)
    expect(read.sfxVolume).toBeCloseTo(0.5, 6)
  })

  it('defaults musicMixInitials to false on a fresh defaults object', () => {
    expect(DEFAULT_AUDIO_SETTINGS.musicMixInitials).toBe(false)
  })

  it('round-trips musicMixInitials: true', () => {
    const custom = cloneDefaultAudioSettings()
    custom.musicMixInitials = true
    writeStoredAudioSettings(custom)
    expect(readStoredAudioSettings().musicMixInitials).toBe(true)
  })

  it('backfills musicMixInitials to false when the field is missing from a legacy stored payload', () => {
    // Write a payload that has musicPerTrack but not musicMixInitials. This
    // mirrors the storage shape from the per-track-only release.
    store[AUDIO_SETTINGS_STORAGE_KEY] = JSON.stringify({
      musicEnabled: true,
      sfxEnabled: true,
      musicVolume: 0.6,
      sfxVolume: 0.5,
      musicPerTrack: true,
    })
    const read = readStoredAudioSettings()
    expect(read.musicMixInitials).toBe(false)
    // Other fields survive the backfill.
    expect(read.musicPerTrack).toBe(true)
    expect(read.musicVolume).toBeCloseTo(0.6, 6)
  })
})
