import { describe, expect, it } from 'vitest'
import {
  BRAKE_LIGHT_COLOR_HEX,
  BRAKE_LIGHT_GLOW_OPACITY,
  BRAKE_LIGHT_GLOW_RADIUS,
  BRAKE_LIGHT_LAMP_OFFSET_X,
  BRAKE_LIGHT_LAMP_OFFSET_Y,
  BRAKE_LIGHT_LAMP_OFFSET_Z,
  BRAKE_LIGHT_LAMP_RADIUS,
  BRAKE_LIGHT_MIN_FORWARD_SPEED,
  BRAKE_LIGHT_MODES,
  BRAKE_LIGHT_MODE_DESCRIPTIONS,
  BRAKE_LIGHT_MODE_LABELS,
  BrakeLightModeSchema,
  DEFAULT_BRAKE_LIGHT_MODE,
  isBrakeLightMode,
  isBrakingNow,
  shouldBrakeLightsLight,
} from '@/lib/brakeLights'

describe('BRAKE_LIGHT_MODES', () => {
  it('exposes exactly the three documented modes in stable order', () => {
    expect(BRAKE_LIGHT_MODES).toEqual(['off', 'auto', 'on'])
  })

  it('every mode has a label and description', () => {
    for (const mode of BRAKE_LIGHT_MODES) {
      expect(BRAKE_LIGHT_MODE_LABELS[mode]).toMatch(/\S/)
      expect(BRAKE_LIGHT_MODE_DESCRIPTIONS[mode]).toMatch(/\S/)
    }
  })

  it('labels and descriptions never use em-dashes (writing rule)', () => {
    for (const mode of BRAKE_LIGHT_MODES) {
      expect(BRAKE_LIGHT_MODE_LABELS[mode]).not.toContain('—')
      expect(BRAKE_LIGHT_MODE_DESCRIPTIONS[mode]).not.toContain('—')
    }
  })
})

describe('DEFAULT_BRAKE_LIGHT_MODE', () => {
  it("defaults to 'auto' so legacy stored payloads glow on brake without action", () => {
    expect(DEFAULT_BRAKE_LIGHT_MODE).toBe('auto')
    expect(BRAKE_LIGHT_MODES).toContain(DEFAULT_BRAKE_LIGHT_MODE)
  })
})

describe('BrakeLightModeSchema', () => {
  it.each(BRAKE_LIGHT_MODES)('accepts %s', (mode) => {
    expect(BrakeLightModeSchema.safeParse(mode).success).toBe(true)
  })

  it.each(['flicker', '', 'AUTO', 0, null, undefined, {}])(
    'rejects %p',
    (value) => {
      expect(BrakeLightModeSchema.safeParse(value).success).toBe(false)
    },
  )
})

describe('isBrakeLightMode', () => {
  it.each(BRAKE_LIGHT_MODES)('accepts %s', (mode) => {
    expect(isBrakeLightMode(mode)).toBe(true)
  })

  it.each(['flicker', 'AUTO', 0, null, undefined, {}, []])(
    'rejects %p',
    (value) => {
      expect(isBrakeLightMode(value)).toBe(false)
    },
  )
})

describe('isBrakingNow', () => {
  it('handbrake held = always braking, even at zero speed or with throttle pressed', () => {
    expect(isBrakingNow(0, 0, true)).toBe(true)
    expect(isBrakingNow(1, 20, true)).toBe(true)
    expect(isBrakingNow(-1, 0, true)).toBe(true)
  })

  it('throttle negative + moving forward = braking', () => {
    expect(isBrakingNow(-1, 10, false)).toBe(true)
    expect(isBrakingNow(-0.3, 5, false)).toBe(true)
  })

  it('throttle positive = not braking, regardless of speed', () => {
    expect(isBrakingNow(1, 0, false)).toBe(false)
    expect(isBrakingNow(0.5, 20, false)).toBe(false)
    expect(isBrakingNow(0.001, 10, false)).toBe(false)
  })

  it('throttle zero = not braking (coasting is not braking)', () => {
    expect(isBrakingNow(0, 10, false)).toBe(false)
    expect(isBrakingNow(0, 0, false)).toBe(false)
  })

  it('throttle negative + already reversing = not braking (player is intentionally reversing)', () => {
    // Speed at or below the small forward floor reads as "not moving forward",
    // so a negative throttle there is reverse-acceleration, not braking.
    expect(isBrakingNow(-1, 0, false)).toBe(false)
    expect(isBrakingNow(-1, -5, false)).toBe(false)
    expect(isBrakingNow(-1, BRAKE_LIGHT_MIN_FORWARD_SPEED, false)).toBe(false)
  })

  it('returns false on non-finite throttle / speed (defensive)', () => {
    expect(isBrakingNow(Number.NaN, 10, false)).toBe(false)
    expect(isBrakingNow(-1, Number.NaN, false)).toBe(false)
    expect(isBrakingNow(Number.POSITIVE_INFINITY, 10, false)).toBe(false)
    expect(isBrakingNow(-1, Number.NEGATIVE_INFINITY, false)).toBe(false)
  })

  it('handbrake overrides the non-finite guard so a held handbrake always glows', () => {
    expect(isBrakingNow(Number.NaN, Number.NaN, true)).toBe(true)
  })

  it('forward floor is positive (otherwise reversing-on-throttle would flicker the lamps)', () => {
    expect(BRAKE_LIGHT_MIN_FORWARD_SPEED).toBeGreaterThan(0)
  })
})

describe('shouldBrakeLightsLight', () => {
  it("'off' is always dark, regardless of braking", () => {
    expect(shouldBrakeLightsLight('off', true)).toBe(false)
    expect(shouldBrakeLightsLight('off', false)).toBe(false)
  })

  it("'on' is always lit, regardless of braking", () => {
    expect(shouldBrakeLightsLight('on', true)).toBe(true)
    expect(shouldBrakeLightsLight('on', false)).toBe(true)
  })

  it("'auto' tracks the live braking predicate", () => {
    expect(shouldBrakeLightsLight('auto', true)).toBe(true)
    expect(shouldBrakeLightsLight('auto', false)).toBe(false)
  })
})

describe('brake-light visual constants', () => {
  it('lamp Y / Z offsets are positive and finite', () => {
    expect(Number.isFinite(BRAKE_LIGHT_LAMP_OFFSET_Y)).toBe(true)
    expect(BRAKE_LIGHT_LAMP_OFFSET_Y).toBeGreaterThan(0)
    expect(BRAKE_LIGHT_LAMP_OFFSET_Z).toBeGreaterThan(0)
  })

  it('lamp X offset is negative so the lamps sit on the rear of the car', () => {
    // Heading 0 means the car faces +X, so a negative X is the back end.
    // This is what distinguishes brake lights from headlights, which sit at
    // a positive X.
    expect(Number.isFinite(BRAKE_LIGHT_LAMP_OFFSET_X)).toBe(true)
    expect(BRAKE_LIGHT_LAMP_OFFSET_X).toBeLessThan(0)
  })

  it('lamp radius is small (under 0.5 world units)', () => {
    expect(BRAKE_LIGHT_LAMP_RADIUS).toBeGreaterThan(0)
    expect(BRAKE_LIGHT_LAMP_RADIUS).toBeLessThan(0.5)
  })

  it('glow disc is wider than the lamp (the halo flares around the lamp)', () => {
    expect(BRAKE_LIGHT_GLOW_RADIUS).toBeGreaterThan(BRAKE_LIGHT_LAMP_RADIUS)
  })

  it('glow opacity is in (0..1), excluding both endpoints', () => {
    expect(BRAKE_LIGHT_GLOW_OPACITY).toBeGreaterThan(0)
    expect(BRAKE_LIGHT_GLOW_OPACITY).toBeLessThan(1)
  })

  it('lamp color fits in the 24-bit color channel range', () => {
    expect(BRAKE_LIGHT_COLOR_HEX).toBeGreaterThanOrEqual(0)
    expect(BRAKE_LIGHT_COLOR_HEX).toBeLessThanOrEqual(0xffffff)
  })

  it('lamp color is dominantly red so the brake cue reads at a glance', () => {
    // Mask out the red channel and require it to be more than green + blue
    // so a future palette tweak that breaks the "glowing red" affordance gets
    // caught here rather than in a bug report.
    const r = (BRAKE_LIGHT_COLOR_HEX >> 16) & 0xff
    const g = (BRAKE_LIGHT_COLOR_HEX >> 8) & 0xff
    const b = BRAKE_LIGHT_COLOR_HEX & 0xff
    expect(r).toBeGreaterThan(g)
    expect(r).toBeGreaterThan(b)
  })
})
