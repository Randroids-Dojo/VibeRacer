import { describe, expect, it } from 'vitest'
import { parseBooleanEnv } from '@/lib/editorFeatureFlags'

describe('parseBooleanEnv', () => {
  // Pin every accepted truthy form so a future regression that quietly
  // drops one (and silently turns the editor off for users who set the
  // flag through that form) fails this test.
  it.each(['1', 'true', 'on', 'yes', 'TRUE', ' Yes ', 'On'])(
    'returns true for %s',
    (value) => {
      expect(parseBooleanEnv(value)).toBe(true)
    },
  )

  // Defense against the string-truthiness footgun: literal "false" must
  // NOT read as truthy. Same for "0", "off", "no", and other falsey
  // strings that environments commonly emit.
  it.each(['0', 'false', 'off', 'no', '', 'random', 'False', 'Off'])(
    'returns false for %s',
    (value) => {
      expect(parseBooleanEnv(value)).toBe(false)
    },
  )

  it('returns false when the env value is undefined', () => {
    expect(parseBooleanEnv(undefined)).toBe(false)
  })
})
