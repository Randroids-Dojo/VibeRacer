import { describe, it, expect } from 'vitest'
import {
  DEFAULT_RACING_NUMBER,
  RACING_NUMBER_DEFAULT_PLATE_HEX,
  RACING_NUMBER_DEFAULT_TEXT_HEX,
  RACING_NUMBER_DEFAULT_VALUE,
  RACING_NUMBER_MAX_LENGTH,
  RACING_NUMBER_PLATE_COLORS,
  RACING_NUMBER_TEXT_COLORS,
  RacingNumberSettingSchema,
  drawRacingNumberToCanvas,
  findPlateColor,
  findTextColor,
  racingNumberFontSizePx,
  racingNumberHexToColorInt,
  sanitizeRacingNumber,
} from '@/lib/racingNumber'

describe('racing number palettes', () => {
  it('plate palette has unique ids, names, and lowercase hex', () => {
    const ids = new Set<string>()
    const names = new Set<string>()
    for (const sw of RACING_NUMBER_PLATE_COLORS) {
      expect(sw.id).toMatch(/^[a-z][a-z0-9-]*$/)
      expect(ids.has(sw.id)).toBe(false)
      expect(names.has(sw.name)).toBe(false)
      ids.add(sw.id)
      names.add(sw.name)
      expect(sw.hex).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  it('text palette has unique ids, names, and lowercase hex', () => {
    const ids = new Set<string>()
    for (const sw of RACING_NUMBER_TEXT_COLORS) {
      expect(sw.id).toMatch(/^[a-z][a-z0-9-]*$/)
      expect(ids.has(sw.id)).toBe(false)
      ids.add(sw.id)
      expect(sw.hex).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  it('both palettes are non-empty so the picker always renders', () => {
    expect(RACING_NUMBER_PLATE_COLORS.length).toBeGreaterThan(0)
    expect(RACING_NUMBER_TEXT_COLORS.length).toBeGreaterThan(0)
  })

  it('default plate / text hex are members of their palettes', () => {
    expect(
      RACING_NUMBER_PLATE_COLORS.some(
        (s) => s.hex === RACING_NUMBER_DEFAULT_PLATE_HEX,
      ),
    ).toBe(true)
    expect(
      RACING_NUMBER_TEXT_COLORS.some(
        (s) => s.hex === RACING_NUMBER_DEFAULT_TEXT_HEX,
      ),
    ).toBe(true)
  })
})

describe('DEFAULT_RACING_NUMBER', () => {
  it('is disabled by default so legacy users see no change', () => {
    expect(DEFAULT_RACING_NUMBER.enabled).toBe(false)
  })

  it('round-trips through the schema', () => {
    expect(RacingNumberSettingSchema.parse(DEFAULT_RACING_NUMBER)).toEqual(
      DEFAULT_RACING_NUMBER,
    )
  })

  it('uses the documented default value', () => {
    expect(DEFAULT_RACING_NUMBER.value).toBe(RACING_NUMBER_DEFAULT_VALUE)
  })
})

describe('RacingNumberSettingSchema', () => {
  it('accepts a well-formed setting', () => {
    expect(
      RacingNumberSettingSchema.parse({
        enabled: true,
        value: '42',
        plateHex: '#ffffff',
        textHex: '#1a1a1a',
      }),
    ).toEqual({
      enabled: true,
      value: '42',
      plateHex: '#ffffff',
      textHex: '#1a1a1a',
    })
  })

  it('accepts a single-digit value', () => {
    expect(
      RacingNumberSettingSchema.parse({
        enabled: true,
        value: '7',
        plateHex: '#ffffff',
        textHex: '#1a1a1a',
      }).value,
    ).toBe('7')
  })

  it('lowercases hex input', () => {
    const parsed = RacingNumberSettingSchema.parse({
      enabled: true,
      value: '7',
      plateHex: '#FFFFFF',
      textHex: '#1A1A1A',
    })
    expect(parsed.plateHex).toBe('#ffffff')
    expect(parsed.textHex).toBe('#1a1a1a')
  })

  it('trims whitespace around the value', () => {
    expect(
      RacingNumberSettingSchema.parse({
        enabled: true,
        value: ' 7 ',
        plateHex: '#ffffff',
        textHex: '#1a1a1a',
      }).value,
    ).toBe('7')
  })

  it('rejects 3-digit numbers', () => {
    expect(() =>
      RacingNumberSettingSchema.parse({
        enabled: true,
        value: '123',
        plateHex: '#ffffff',
        textHex: '#1a1a1a',
      }),
    ).toThrow()
  })

  it('rejects non-digit values', () => {
    expect(() =>
      RacingNumberSettingSchema.parse({
        enabled: true,
        value: 'AB',
        plateHex: '#ffffff',
        textHex: '#1a1a1a',
      }),
    ).toThrow()
  })

  it('rejects empty value strings', () => {
    expect(() =>
      RacingNumberSettingSchema.parse({
        enabled: true,
        value: '',
        plateHex: '#ffffff',
        textHex: '#1a1a1a',
      }),
    ).toThrow()
  })

  it('rejects malformed plate hex', () => {
    expect(() =>
      RacingNumberSettingSchema.parse({
        enabled: true,
        value: '7',
        plateHex: 'red',
        textHex: '#1a1a1a',
      }),
    ).toThrow()
  })

  it('rejects malformed text hex', () => {
    expect(() =>
      RacingNumberSettingSchema.parse({
        enabled: true,
        value: '7',
        plateHex: '#ffffff',
        textHex: '#xyz',
      }),
    ).toThrow()
  })
})

describe('sanitizeRacingNumber', () => {
  it('passes a clean value through', () => {
    expect(sanitizeRacingNumber('42')).toBe('42')
  })

  it('passes a clean single digit through', () => {
    expect(sanitizeRacingNumber('7')).toBe('7')
  })

  it('strips non-digit characters', () => {
    expect(sanitizeRacingNumber('1a2')).toBe('12')
  })

  it('caps at the documented max length', () => {
    const result = sanitizeRacingNumber('12345')
    expect(result.length).toBeLessThanOrEqual(RACING_NUMBER_MAX_LENGTH)
    expect(result).toBe('12')
  })

  it('falls back to the default when result is empty', () => {
    expect(sanitizeRacingNumber('')).toBe(RACING_NUMBER_DEFAULT_VALUE)
    expect(sanitizeRacingNumber('abc')).toBe(RACING_NUMBER_DEFAULT_VALUE)
  })

  it('falls back to the default for non-string input', () => {
    expect(sanitizeRacingNumber(undefined as unknown as string)).toBe(
      RACING_NUMBER_DEFAULT_VALUE,
    )
    expect(sanitizeRacingNumber(null as unknown as string)).toBe(
      RACING_NUMBER_DEFAULT_VALUE,
    )
    expect(sanitizeRacingNumber(42 as unknown as string)).toBe(
      RACING_NUMBER_DEFAULT_VALUE,
    )
  })
})

describe('findPlateColor / findTextColor', () => {
  it('returns the matching plate swatch for a known hex', () => {
    const yellow = RACING_NUMBER_PLATE_COLORS.find((s) => s.id === 'yellow')!
    expect(findPlateColor(yellow.hex)).toEqual(yellow)
  })

  it('plate match is case-insensitive', () => {
    const yellow = RACING_NUMBER_PLATE_COLORS.find((s) => s.id === 'yellow')!
    expect(findPlateColor(yellow.hex.toUpperCase())).toEqual(yellow)
  })

  it('returns null for an unknown plate hex', () => {
    expect(findPlateColor('#abcdef')).toBeNull()
  })

  it('returns null for null plate hex', () => {
    expect(findPlateColor(null)).toBeNull()
  })

  it('returns the matching text swatch for a known hex', () => {
    const black = RACING_NUMBER_TEXT_COLORS.find((s) => s.id === 'black')!
    expect(findTextColor(black.hex)).toEqual(black)
  })

  it('returns null for null text hex', () => {
    expect(findTextColor(null)).toBeNull()
  })
})

describe('racingNumberHexToColorInt', () => {
  it('parses a 7-char lowercase hex', () => {
    expect(racingNumberHexToColorInt('#ff8800')).toBe(0xff8800)
  })

  it('parses an uppercase hex by lowercasing first', () => {
    expect(racingNumberHexToColorInt('#FF8800')).toBe(0xff8800)
  })

  it('returns null for malformed input', () => {
    expect(racingNumberHexToColorInt('ff8800')).toBeNull()
    expect(racingNumberHexToColorInt('#abc')).toBeNull()
    expect(racingNumberHexToColorInt('#xxyyzz')).toBeNull()
  })
})

describe('racingNumberFontSizePx', () => {
  it('returns a larger size for single digits than two digits', () => {
    const single = racingNumberFontSizePx('7', 256)
    const double = racingNumberFontSizePx('77', 256)
    expect(single).toBeGreaterThan(double)
  })

  it('scales linearly with canvas size', () => {
    const small = racingNumberFontSizePx('7', 128)
    const large = racingNumberFontSizePx('7', 256)
    expect(large).toBeGreaterThan(small)
    // Within rounding tolerance, the ratio should be ~2.
    expect(large).toBeGreaterThan(small * 1.8)
    expect(large).toBeLessThan(small * 2.2)
  })

  it('treats a sanitized 1-digit number the same as a single digit', () => {
    // 'abc' -> default '7' (1 digit)
    expect(racingNumberFontSizePx('abc', 256)).toBe(
      racingNumberFontSizePx('7', 256),
    )
  })

  it('returns a positive integer', () => {
    const v = racingNumberFontSizePx('42', 256)
    expect(Number.isInteger(v)).toBe(true)
    expect(v).toBeGreaterThan(0)
  })
})

describe('drawRacingNumberToCanvas', () => {
  // Minimal CanvasRenderingContext2D stub so the helper runs in the unit
  // suite without requiring jsdom canvas support.
  function makeStubCtx() {
    const calls: Array<{ op: string; args: unknown[] }> = []
    const stub = {
      fillStyle: '',
      font: '',
      textAlign: '',
      textBaseline: '',
      fillRect(...args: unknown[]) {
        calls.push({ op: 'fillRect', args: [stub.fillStyle, ...args] })
      },
      fillText(...args: unknown[]) {
        calls.push({ op: 'fillText', args: [stub.fillStyle, stub.font, ...args] })
      },
    }
    return { stub, calls }
  }

  it('draws plate background, border, and number', () => {
    const { stub, calls } = makeStubCtx()
    drawRacingNumberToCanvas(
      stub as unknown as CanvasRenderingContext2D,
      256,
      '7',
      '#ffffff',
      '#1a1a1a',
    )
    // First fillRect is the plate background.
    const plate = calls[0]
    expect(plate.op).toBe('fillRect')
    expect(plate.args[0]).toBe('#ffffff')
    // Last call writes the number.
    const text = calls[calls.length - 1]
    expect(text.op).toBe('fillText')
    expect(text.args[0]).toBe('#1a1a1a')
    expect(text.args[2]).toBe('7') // first arg to fillText
  })

  it('renders 4 border bars after the plate background', () => {
    const { stub, calls } = makeStubCtx()
    drawRacingNumberToCanvas(
      stub as unknown as CanvasRenderingContext2D,
      256,
      '42',
      '#ffffff',
      '#1a1a1a',
    )
    const fillRects = calls.filter((c) => c.op === 'fillRect')
    // 1 plate + 4 border bars = 5 fillRect calls.
    expect(fillRects.length).toBe(5)
    // Borders are black.
    for (let i = 1; i < 5; i++) {
      expect(fillRects[i].args[0]).toBe('#000000')
    }
  })

  it('falls back to the default value when raw input is malformed', () => {
    const { stub, calls } = makeStubCtx()
    drawRacingNumberToCanvas(
      stub as unknown as CanvasRenderingContext2D,
      256,
      'abc',
      '#ffffff',
      '#1a1a1a',
    )
    const text = calls[calls.length - 1]
    expect(text.args[2]).toBe(RACING_NUMBER_DEFAULT_VALUE)
  })
})
