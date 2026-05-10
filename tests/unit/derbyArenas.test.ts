import { describe, expect, it } from 'vitest'
import {
  ALL_DERBY_ARENAS,
  DERBY_ARENAS,
  derbyConfigCanonical,
} from '@/lib/derbyArenas'
import { DERBY_ARENA_SLUGS, DerbyArenaSlugSchema } from '@/lib/schemas'

describe('derby arenas', () => {
  it('exposes at least one arena', () => {
    expect(DERBY_ARENA_SLUGS.length).toBeGreaterThan(0)
    expect(new Set(DERBY_ARENA_SLUGS).size).toBe(DERBY_ARENA_SLUGS.length)
    expect(ALL_DERBY_ARENAS.length).toBe(DERBY_ARENA_SLUGS.length)
  })

  it('every slug parses through DerbyArenaSlugSchema', () => {
    for (const slug of DERBY_ARENA_SLUGS) {
      expect(() => DerbyArenaSlugSchema.parse(slug)).not.toThrow()
    }
  })

  it('every arena has plausible geometry and round duration', () => {
    for (const a of ALL_DERBY_ARENAS) {
      expect(a.radius).toBeGreaterThan(10)
      expect(a.radius).toBeLessThan(500)
      expect(a.roundDurationMs).toBeGreaterThanOrEqual(60_000)
      expect(a.roundDurationMs).toBeLessThanOrEqual(600_000)
      expect(a.cpuCount).toBeGreaterThanOrEqual(1)
      expect(a.cpuCount).toBeLessThanOrEqual(7)
      expect(a.surface).toBe('dirt')
    }
  })

  it('records lookup matches the slugs', () => {
    for (const a of ALL_DERBY_ARENAS) {
      expect(DERBY_ARENAS[a.slug]).toBe(a)
    }
  })

  it('canonical bytes ignore cosmetic fields', () => {
    const arena = DERBY_ARENAS['dust-bowl']
    const original = derbyConfigCanonical(arena)
    const tweaked = derbyConfigCanonical({
      ...arena,
      displayName: 'Renamed',
      blurb: 'Different',
      biome: 'beach',
      weather: 'cloudy',
      timeOfDay: 'morning',
      surface: 'dirt',
    })
    expect(tweaked).toBe(original)
  })

  it('canonical bytes change when arena radius changes', () => {
    const arena = DERBY_ARENAS['dust-bowl']
    const original = derbyConfigCanonical(arena)
    const tweaked = derbyConfigCanonical({ ...arena, radius: arena.radius + 1 })
    expect(tweaked).not.toBe(original)
  })
})
