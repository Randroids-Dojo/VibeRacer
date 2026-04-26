import { describe, it, expect } from 'vitest'
import {
  CAR_PAINTS,
  CarPaintSchema,
  CarPaintSettingSchema,
  findPaintByHex,
  hexToColorInt,
} from '@/lib/carPaint'

describe('CAR_PAINTS palette', () => {
  it('every entry has a unique id, name, and lowercase hex', () => {
    const ids = new Set<string>()
    const names = new Set<string>()
    for (const paint of CAR_PAINTS) {
      expect(paint.id).toMatch(/^[a-z][a-z0-9-]*$/)
      expect(ids.has(paint.id)).toBe(false)
      expect(names.has(paint.name)).toBe(false)
      ids.add(paint.id)
      names.add(paint.name)
      expect(paint.hex).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  it('is non-empty so the swatch grid always renders something', () => {
    expect(CAR_PAINTS.length).toBeGreaterThan(0)
  })
})

describe('CarPaintSchema', () => {
  it('accepts a valid 7-char lowercase hex', () => {
    expect(CarPaintSchema.parse('#abcdef')).toBe('#abcdef')
  })

  it('lowercases uppercase hex on input', () => {
    expect(CarPaintSchema.parse('#ABCDEF')).toBe('#abcdef')
  })

  it('rejects malformed strings', () => {
    expect(() => CarPaintSchema.parse('abcdef')).toThrow()
    expect(() => CarPaintSchema.parse('#abc')).toThrow()
    expect(() => CarPaintSchema.parse('#xxxxxx')).toThrow()
    expect(() => CarPaintSchema.parse('')).toThrow()
  })
})

describe('CarPaintSettingSchema', () => {
  it('accepts null (stock paint)', () => {
    expect(CarPaintSettingSchema.parse(null)).toBeNull()
  })

  it('accepts a valid hex', () => {
    expect(CarPaintSettingSchema.parse('#3b6cf4')).toBe('#3b6cf4')
  })

  it('rejects malformed hex but lets null pass', () => {
    expect(() => CarPaintSettingSchema.parse('red')).toThrow()
  })
})

describe('findPaintByHex', () => {
  it('returns the matching palette entry for a known hex', () => {
    const teal = CAR_PAINTS.find((p) => p.id === 'teal')!
    expect(findPaintByHex(teal.hex)).toEqual(teal)
  })

  it('matches case-insensitively', () => {
    const teal = CAR_PAINTS.find((p) => p.id === 'teal')!
    expect(findPaintByHex(teal.hex.toUpperCase())).toEqual(teal)
  })

  it('returns null for an unknown hex', () => {
    expect(findPaintByHex('#123456')).toBeNull()
  })

  it('returns null for null (stock)', () => {
    expect(findPaintByHex(null)).toBeNull()
  })
})

describe('hexToColorInt', () => {
  it('parses #ff0000 to 0xff0000', () => {
    expect(hexToColorInt('#ff0000')).toBe(0xff0000)
  })

  it('parses lowercase or uppercase identically', () => {
    expect(hexToColorInt('#AABBCC')).toBe(0xaabbcc)
    expect(hexToColorInt('#aabbcc')).toBe(0xaabbcc)
  })

  it('returns null for null input', () => {
    expect(hexToColorInt(null)).toBeNull()
  })

  it('returns null for malformed input', () => {
    expect(hexToColorInt('#xyzxyz')).toBeNull()
    expect(hexToColorInt('ff0000')).toBeNull()
  })
})
