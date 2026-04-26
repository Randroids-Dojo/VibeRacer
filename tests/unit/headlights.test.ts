import { describe, expect, it } from 'vitest'
import {
  DEFAULT_HEADLIGHT_MODE,
  HEADLIGHT_BEAM_COLOR_HEX,
  HEADLIGHT_BEAM_LENGTH,
  HEADLIGHT_BEAM_OPACITY,
  HEADLIGHT_BEAM_RADIUS,
  HEADLIGHT_LAMP_COLOR_HEX,
  HEADLIGHT_LAMP_OFFSET_X,
  HEADLIGHT_LAMP_OFFSET_Y,
  HEADLIGHT_LAMP_OFFSET_Z,
  HEADLIGHT_LAMP_RADIUS,
  HEADLIGHT_MODES,
  HEADLIGHT_MODE_DESCRIPTIONS,
  HEADLIGHT_MODE_LABELS,
  HeadlightModeSchema,
  isHeadlightMode,
  shouldHeadlightsBeOn,
} from '@/lib/headlights'
import { TIME_OF_DAY_NAMES } from '@/lib/lighting'
import { WEATHER_NAMES } from '@/lib/weather'

describe('HEADLIGHT_MODES', () => {
  it('exposes exactly the three documented modes in stable order', () => {
    expect(HEADLIGHT_MODES).toEqual(['off', 'auto', 'on'])
  })

  it('every mode has a label and description', () => {
    for (const mode of HEADLIGHT_MODES) {
      expect(HEADLIGHT_MODE_LABELS[mode]).toMatch(/\S/)
      expect(HEADLIGHT_MODE_DESCRIPTIONS[mode]).toMatch(/\S/)
    }
  })

  it('labels and descriptions never use em-dashes (writing rule)', () => {
    for (const mode of HEADLIGHT_MODES) {
      expect(HEADLIGHT_MODE_LABELS[mode]).not.toContain('—')
      expect(HEADLIGHT_MODE_DESCRIPTIONS[mode]).not.toContain('—')
    }
  })
})

describe('DEFAULT_HEADLIGHT_MODE', () => {
  it("defaults to 'auto' so legacy stored payloads light up at night without action", () => {
    expect(DEFAULT_HEADLIGHT_MODE).toBe('auto')
    expect(HEADLIGHT_MODES).toContain(DEFAULT_HEADLIGHT_MODE)
  })
})

describe('HeadlightModeSchema', () => {
  it.each(HEADLIGHT_MODES)('accepts %s', (mode) => {
    expect(HeadlightModeSchema.safeParse(mode).success).toBe(true)
  })

  it.each(['flicker', '', 'AUTO', 0, null, undefined, {}])(
    'rejects %p',
    (value) => {
      expect(HeadlightModeSchema.safeParse(value).success).toBe(false)
    },
  )
})

describe('isHeadlightMode', () => {
  it.each(HEADLIGHT_MODES)('accepts %s', (mode) => {
    expect(isHeadlightMode(mode)).toBe(true)
  })

  it.each(['flicker', 'AUTO', 0, null, undefined, {}, []])(
    'rejects %p',
    (value) => {
      expect(isHeadlightMode(value)).toBe(false)
    },
  )
})

describe('shouldHeadlightsBeOn', () => {
  it("'off' is always dark, regardless of mood", () => {
    for (const t of TIME_OF_DAY_NAMES) {
      for (const w of WEATHER_NAMES) {
        expect(shouldHeadlightsBeOn('off', t, w)).toBe(false)
      }
    }
  })

  it("'on' is always lit, regardless of mood", () => {
    for (const t of TIME_OF_DAY_NAMES) {
      for (const w of WEATHER_NAMES) {
        expect(shouldHeadlightsBeOn('on', t, w)).toBe(true)
      }
    }
  })

  it("'auto' lights up at night under any weather", () => {
    for (const w of WEATHER_NAMES) {
      expect(shouldHeadlightsBeOn('auto', 'night', w)).toBe(true)
    }
  })

  it("'auto' lights up at sunset under any weather", () => {
    for (const w of WEATHER_NAMES) {
      expect(shouldHeadlightsBeOn('auto', 'sunset', w)).toBe(true)
    }
  })

  it("'auto' lights up at dawn under any weather", () => {
    for (const w of WEATHER_NAMES) {
      expect(shouldHeadlightsBeOn('auto', 'dawn', w)).toBe(true)
    }
  })

  it("'auto' lights up at dusk under any weather", () => {
    for (const w of WEATHER_NAMES) {
      expect(shouldHeadlightsBeOn('auto', 'dusk', w)).toBe(true)
    }
  })

  it("'auto' lights up in foggy weather even at noon", () => {
    expect(shouldHeadlightsBeOn('auto', 'noon', 'foggy')).toBe(true)
  })

  it("'auto' lights up in snowy weather even at noon", () => {
    expect(shouldHeadlightsBeOn('auto', 'noon', 'snowy')).toBe(true)
  })

  it("'auto' lights up in rainy weather even at noon", () => {
    expect(shouldHeadlightsBeOn('auto', 'noon', 'rainy')).toBe(true)
  })

  it("'auto' stays dark at noon in clear weather", () => {
    expect(shouldHeadlightsBeOn('auto', 'noon', 'clear')).toBe(false)
  })

  it("'auto' stays dark in the morning under clear weather", () => {
    expect(shouldHeadlightsBeOn('auto', 'morning', 'clear')).toBe(false)
  })

  it("'auto' stays dark in the morning under cloudy weather (overcast not dim enough)", () => {
    expect(shouldHeadlightsBeOn('auto', 'morning', 'cloudy')).toBe(false)
  })

  it("'auto' stays dark at noon in cloudy weather (overcast not dim enough)", () => {
    expect(shouldHeadlightsBeOn('auto', 'noon', 'cloudy')).toBe(false)
  })
})

describe('headlight visual constants', () => {
  it('lamp position offsets are positive and finite', () => {
    expect(Number.isFinite(HEADLIGHT_LAMP_OFFSET_X)).toBe(true)
    expect(HEADLIGHT_LAMP_OFFSET_X).toBeGreaterThan(0)
    expect(HEADLIGHT_LAMP_OFFSET_Y).toBeGreaterThan(0)
    expect(HEADLIGHT_LAMP_OFFSET_Z).toBeGreaterThan(0)
  })

  it('lamp radius is small (under 0.5 world units)', () => {
    expect(HEADLIGHT_LAMP_RADIUS).toBeGreaterThan(0)
    expect(HEADLIGHT_LAMP_RADIUS).toBeLessThan(0.5)
  })

  it('beam length is at least three lamp widths so the cone reads as a beam, not a stub', () => {
    expect(HEADLIGHT_BEAM_LENGTH).toBeGreaterThan(HEADLIGHT_LAMP_RADIUS * 6)
  })

  it('beam radius is wider than a lamp (the cone flares outward from the lamp)', () => {
    expect(HEADLIGHT_BEAM_RADIUS).toBeGreaterThan(HEADLIGHT_LAMP_RADIUS)
  })

  it('beam opacity is in (0..1), excluding both endpoints', () => {
    expect(HEADLIGHT_BEAM_OPACITY).toBeGreaterThan(0)
    expect(HEADLIGHT_BEAM_OPACITY).toBeLessThan(1)
  })

  it('lamp / beam colors fit in the 24-bit color channel range', () => {
    expect(HEADLIGHT_LAMP_COLOR_HEX).toBeGreaterThanOrEqual(0)
    expect(HEADLIGHT_LAMP_COLOR_HEX).toBeLessThanOrEqual(0xffffff)
    expect(HEADLIGHT_BEAM_COLOR_HEX).toBeGreaterThanOrEqual(0)
    expect(HEADLIGHT_BEAM_COLOR_HEX).toBeLessThanOrEqual(0xffffff)
  })
})
