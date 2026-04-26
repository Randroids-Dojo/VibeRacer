import { describe, it, expect } from 'vitest'
import {
  DEFAULT_WEATHER,
  WEATHER_DESCRIPTIONS,
  WEATHER_LABELS,
  WEATHER_NAMES,
  WeatherSchema,
  getWeatherPreset,
  isWeather,
  mixColorHex,
} from '@/lib/weather'

describe('WEATHER_NAMES', () => {
  it('is non-empty so the picker always has at least one option', () => {
    expect(WEATHER_NAMES.length).toBeGreaterThan(0)
  })

  it('every name is unique', () => {
    const seen = new Set<string>()
    for (const n of WEATHER_NAMES) {
      expect(seen.has(n)).toBe(false)
      seen.add(n)
    }
  })

  it('has a label and description for every name', () => {
    for (const n of WEATHER_NAMES) {
      expect(typeof WEATHER_LABELS[n]).toBe('string')
      expect(WEATHER_LABELS[n].length).toBeGreaterThan(0)
      expect(typeof WEATHER_DESCRIPTIONS[n]).toBe('string')
      expect(WEATHER_DESCRIPTIONS[n].length).toBeGreaterThan(0)
    }
  })

  it("includes 'clear' so the legacy default round-trips", () => {
    expect((WEATHER_NAMES as readonly string[]).includes('clear')).toBe(true)
    expect(DEFAULT_WEATHER).toBe('clear')
  })
})

describe('WeatherSchema', () => {
  it('accepts every preset name', () => {
    for (const n of WEATHER_NAMES) {
      expect(WeatherSchema.parse(n)).toBe(n)
    }
  })

  it('rejects unknown strings', () => {
    expect(() => WeatherSchema.parse('snowy')).toThrow()
    expect(() => WeatherSchema.parse('')).toThrow()
    expect(() => WeatherSchema.parse(123)).toThrow()
  })
})

describe('isWeather', () => {
  it('returns true for known preset names', () => {
    for (const n of WEATHER_NAMES) {
      expect(isWeather(n)).toBe(true)
    }
  })

  it('returns false for unknown values', () => {
    expect(isWeather('snowy')).toBe(false)
    expect(isWeather(null)).toBe(false)
    expect(isWeather(undefined)).toBe(false)
    expect(isWeather(0)).toBe(false)
    expect(isWeather({})).toBe(false)
  })
})

describe('getWeatherPreset', () => {
  it('returns a fully-specified preset for every named slot', () => {
    for (const n of WEATHER_NAMES) {
      const p = getWeatherPreset(n)
      expect(p.fogDensity).toBeGreaterThanOrEqual(0)
      expect(Number.isFinite(p.fogDensity)).toBe(true)
      expect(p.fogColor).toBeGreaterThanOrEqual(0)
      expect(p.fogColor).toBeLessThanOrEqual(0xffffff)
      expect(p.skyTintMix).toBeGreaterThanOrEqual(0)
      expect(p.skyTintMix).toBeLessThanOrEqual(1)
      expect(p.ambientMultiplier).toBeGreaterThan(0)
      expect(p.sunMultiplier).toBeGreaterThan(0)
    }
  })

  it("the 'clear' preset is a true no-op", () => {
    const p = getWeatherPreset('clear')
    // Zero density makes FogExp2 a no-op so the legacy scene matches exactly.
    expect(p.fogDensity).toBe(0)
    // Zero tint mix means the sky color is left untouched.
    expect(p.skyTintMix).toBe(0)
    // Identity multipliers leave the time-of-day intensities alone.
    expect(p.ambientMultiplier).toBe(1)
    expect(p.sunMultiplier).toBe(1)
  })

  it("'foggy' is denser than 'cloudy' which is denser than 'clear'", () => {
    const clear = getWeatherPreset('clear')
    const cloudy = getWeatherPreset('cloudy')
    const foggy = getWeatherPreset('foggy')
    expect(cloudy.fogDensity).toBeGreaterThan(clear.fogDensity)
    expect(foggy.fogDensity).toBeGreaterThan(cloudy.fogDensity)
  })

  it("'foggy' tints the sky harder than 'cloudy'", () => {
    const cloudy = getWeatherPreset('cloudy')
    const foggy = getWeatherPreset('foggy')
    expect(foggy.skyTintMix).toBeGreaterThan(cloudy.skyTintMix)
  })

  it('overcast presets dim the sun versus clear', () => {
    const clear = getWeatherPreset('clear')
    const cloudy = getWeatherPreset('cloudy')
    const foggy = getWeatherPreset('foggy')
    expect(cloudy.sunMultiplier).toBeLessThan(clear.sunMultiplier)
    expect(foggy.sunMultiplier).toBeLessThan(cloudy.sunMultiplier)
  })

  it('overcast presets lift the ambient versus clear', () => {
    const clear = getWeatherPreset('clear')
    const cloudy = getWeatherPreset('cloudy')
    const foggy = getWeatherPreset('foggy')
    // Both cloudy and foggy should keep the road readable by lifting ambient
    // even as the sun dims out.
    expect(cloudy.ambientMultiplier).toBeGreaterThanOrEqual(
      clear.ambientMultiplier,
    )
    expect(foggy.ambientMultiplier).toBeGreaterThanOrEqual(
      clear.ambientMultiplier,
    )
  })

  it('falls back to the default preset for an unknown name (defensive)', () => {
    // The signature is typed, but JS callers can sneak through. Falling back
    // beats throwing in a code path that runs every frame.
    const bogus = getWeatherPreset('snowy' as never)
    const fallback = getWeatherPreset(DEFAULT_WEATHER)
    expect(bogus.fogDensity).toBe(fallback.fogDensity)
    expect(bogus.skyTintMix).toBe(fallback.skyTintMix)
  })

  it('returns a fresh object so callers can mutate safely', () => {
    const a = getWeatherPreset('foggy')
    a.fogDensity = 999
    a.skyTintMix = 999
    const b = getWeatherPreset('foggy')
    expect(b.fogDensity).not.toBe(999)
    expect(b.skyTintMix).not.toBe(999)
  })
})

describe('mixColorHex', () => {
  it('returns the first color at t = 0', () => {
    expect(mixColorHex(0xff0000, 0x00ff00, 0)).toBe(0xff0000)
  })

  it('returns the second color at t = 1', () => {
    expect(mixColorHex(0xff0000, 0x00ff00, 1)).toBe(0x00ff00)
  })

  it('mixes channels independently at t = 0.5', () => {
    // Halfway between pure red and pure blue is a dark purple. Each channel
    // gets averaged on its own so the result is (0x80, 0x00, 0x80) = 0x800080.
    const mix = mixColorHex(0xff0000, 0x0000ff, 0.5)
    expect(((mix >> 16) & 0xff)).toBe(0x80)
    expect(((mix >> 8) & 0xff)).toBe(0x00)
    expect((mix & 0xff)).toBe(0x80)
  })

  it('clamps t below 0 to 0 (returns the first color)', () => {
    expect(mixColorHex(0xabcdef, 0x123456, -5)).toBe(0xabcdef)
  })

  it('clamps t above 1 to 1 (returns the second color)', () => {
    expect(mixColorHex(0xabcdef, 0x123456, 5)).toBe(0x123456)
  })

  it('returns a value inside the 24-bit color range for any inputs', () => {
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const mix = mixColorHex(0x000000, 0xffffff, t)
      expect(mix).toBeGreaterThanOrEqual(0)
      expect(mix).toBeLessThanOrEqual(0xffffff)
    }
  })

  it('mixing identical colors at any t returns that color', () => {
    for (const t of [0, 0.3, 0.7, 1]) {
      expect(mixColorHex(0x9ad8ff, 0x9ad8ff, t)).toBe(0x9ad8ff)
    }
  })
})
