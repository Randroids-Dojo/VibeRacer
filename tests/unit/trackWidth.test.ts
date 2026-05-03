import { describe, expect, it } from 'vitest'
import { DEFAULT_TRACK_PIECES } from '@/lib/defaultTrack'
import { buildTrackPath, TRACK_WIDTH } from '@/game/trackPath'
import { DEFAULT_TRACK_WIDTH, halfWidthAt, widthAt } from '@/game/trackWidth'

describe('track width helpers', () => {
  it('preserves the legacy track width export', () => {
    expect(DEFAULT_TRACK_WIDTH).toBe(8)
    expect(TRACK_WIDTH).toBe(DEFAULT_TRACK_WIDTH)
  })

  it('returns the default width for every point on existing pieces', () => {
    const path = buildTrackPath(DEFAULT_TRACK_PIECES)

    for (const op of path.order) {
      expect(widthAt(op, 0)).toBe(DEFAULT_TRACK_WIDTH)
      expect(widthAt(op, 0.5)).toBe(DEFAULT_TRACK_WIDTH)
      expect(widthAt(op, 1)).toBe(DEFAULT_TRACK_WIDTH)
      expect(halfWidthAt(op, 0.5)).toBe(DEFAULT_TRACK_WIDTH / 2)
    }
  })
})
