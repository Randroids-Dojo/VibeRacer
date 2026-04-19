import { describe, it, expect } from 'vitest'
import { isValidRacerId, newRacerId, RACER_ID_COOKIE } from '@/lib/racerId'

describe('racerId', () => {
  it('newRacerId returns a UUID v4', () => {
    const id = newRacerId()
    expect(isValidRacerId(id)).toBe(true)
  })

  it('rejects non-UUIDv4 strings', () => {
    expect(isValidRacerId('not-a-uuid')).toBe(false)
    expect(isValidRacerId('')).toBe(false)
    expect(isValidRacerId('00000000-0000-1000-8000-000000000000')).toBe(false)
  })

  it('uses the documented cookie name', () => {
    expect(RACER_ID_COOKIE).toBe('viberacer.racerId')
  })
})
