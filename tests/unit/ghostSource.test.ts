import { describe, expect, it } from 'vitest'
import {
  DEFAULT_GHOST_SOURCE,
  GHOST_SOURCES,
  GHOST_SOURCE_DESCRIPTIONS,
  GHOST_SOURCE_LABELS,
  GhostSourceSchema,
  ghostSourceNeedsTopFetch,
  isGhostSource,
  pickGhostAfterPb,
  pickGhostMeta,
  pickGhostMetaAfterPb,
  pickGhostReplay,
} from '@/lib/ghostSource'
import type { Replay } from '@/lib/replay'
import type { GhostMeta } from '@/game/ghostNameplate'

const PB: Replay = {
  lapTimeMs: 12000,
  samples: [[0, 0, 0]],
}
const TOP: Replay = {
  lapTimeMs: 11000,
  samples: [[1, 1, 0]],
}
const NEW_PB: Replay = {
  lapTimeMs: 10000,
  samples: [[2, 2, 0]],
}
const LAST_LAP: Replay = {
  lapTimeMs: 13500,
  samples: [[3, 3, 0]],
}

describe('GHOST_SOURCES enumeration', () => {
  it('lists exactly auto, top, pb, lastLap', () => {
    expect(GHOST_SOURCES).toEqual(['auto', 'top', 'pb', 'lastLap'])
  })

  it('default source is auto so legacy behavior is preserved', () => {
    expect(DEFAULT_GHOST_SOURCE).toBe('auto')
  })

  it('every source has a label and description', () => {
    for (const s of GHOST_SOURCES) {
      expect(GHOST_SOURCE_LABELS[s]).toBeTruthy()
      expect(GHOST_SOURCE_DESCRIPTIONS[s]).toBeTruthy()
    }
  })

  it('labels and descriptions are unique across sources', () => {
    const labels = GHOST_SOURCES.map((s) => GHOST_SOURCE_LABELS[s])
    expect(new Set(labels).size).toBe(GHOST_SOURCES.length)
    const descs = GHOST_SOURCES.map((s) => GHOST_SOURCE_DESCRIPTIONS[s])
    expect(new Set(descs).size).toBe(GHOST_SOURCES.length)
  })
})

describe('GhostSourceSchema', () => {
  it('accepts every named source', () => {
    for (const s of GHOST_SOURCES) {
      expect(GhostSourceSchema.safeParse(s).success).toBe(true)
    }
  })

  it('rejects unknown strings', () => {
    expect(GhostSourceSchema.safeParse('unknown').success).toBe(false)
    expect(GhostSourceSchema.safeParse('').success).toBe(false)
  })

  it('rejects non-strings', () => {
    expect(GhostSourceSchema.safeParse(null).success).toBe(false)
    expect(GhostSourceSchema.safeParse(undefined).success).toBe(false)
    expect(GhostSourceSchema.safeParse(0).success).toBe(false)
  })
})

describe('isGhostSource', () => {
  it('returns true for known sources', () => {
    for (const s of GHOST_SOURCES) {
      expect(isGhostSource(s)).toBe(true)
    }
  })

  it('returns false for everything else', () => {
    expect(isGhostSource('off')).toBe(false)
    expect(isGhostSource('Auto')).toBe(false)
    expect(isGhostSource(null)).toBe(false)
    expect(isGhostSource(undefined)).toBe(false)
    expect(isGhostSource(7)).toBe(false)
    expect(isGhostSource({})).toBe(false)
  })
})

describe('pickGhostReplay', () => {
  it('auto: prefers local PB when present', () => {
    expect(pickGhostReplay('auto', PB, TOP)).toBe(PB)
  })

  it('auto: falls back to leaderboard top when local PB is missing', () => {
    expect(pickGhostReplay('auto', null, TOP)).toBe(TOP)
  })

  it('auto: returns null when both are missing', () => {
    expect(pickGhostReplay('auto', null, null)).toBe(null)
  })

  it('top: always returns the leaderboard top, even when a PB exists', () => {
    expect(pickGhostReplay('top', PB, TOP)).toBe(TOP)
  })

  it('top: returns null when no leaderboard replay is on file', () => {
    expect(pickGhostReplay('top', PB, null)).toBe(null)
  })

  it('pb: returns the local PB and never falls back to top', () => {
    expect(pickGhostReplay('pb', PB, TOP)).toBe(PB)
    expect(pickGhostReplay('pb', null, TOP)).toBe(null)
  })

  it('lastLap: returns the lastLap replay when present', () => {
    expect(pickGhostReplay('lastLap', PB, TOP, LAST_LAP)).toBe(LAST_LAP)
  })

  it('lastLap: returns null when no lap has completed yet this session', () => {
    expect(pickGhostReplay('lastLap', PB, TOP, null)).toBe(null)
    expect(pickGhostReplay('lastLap', null, null)).toBe(null)
  })

  it('lastLap: never falls back to PB or top even when both are available', () => {
    // Whole point of the source is to chase the freshest attempt, not a stale
    // PB or leaderboard recording.
    expect(pickGhostReplay('lastLap', PB, TOP, null)).toBe(null)
  })
})

describe('pickGhostAfterPb', () => {
  it('auto: swaps to the new local PB so the next lap chases the player', () => {
    expect(pickGhostAfterPb('auto', NEW_PB, TOP)).toBe(NEW_PB)
  })

  it('pb: also swaps to the new local PB', () => {
    expect(pickGhostAfterPb('pb', NEW_PB, PB)).toBe(NEW_PB)
  })

  it('top: keeps chasing the leaderboard top after the PB lap', () => {
    expect(pickGhostAfterPb('top', NEW_PB, TOP)).toBe(TOP)
  })

  it('top: returns the prior active even when it was null', () => {
    expect(pickGhostAfterPb('top', NEW_PB, null)).toBe(null)
  })

  it('lastLap: keeps the existing active ghost so the per-lap update path does not double-write', () => {
    // The post-PB swap is a no-op for lastLap since handleLapReplay (which
    // fires before handleLapComplete) already wrote the new lap into
    // activeGhostRef. Returning prevActive here keeps the two writers in sync.
    expect(pickGhostAfterPb('lastLap', NEW_PB, LAST_LAP)).toBe(LAST_LAP)
    expect(pickGhostAfterPb('lastLap', NEW_PB, null)).toBe(null)
  })
})

describe('ghostSourceNeedsTopFetch', () => {
  it('auto and top need the leaderboard top fetch', () => {
    expect(ghostSourceNeedsTopFetch('auto')).toBe(true)
    expect(ghostSourceNeedsTopFetch('top')).toBe(true)
  })

  it('pb skips the leaderboard top fetch entirely', () => {
    expect(ghostSourceNeedsTopFetch('pb')).toBe(false)
  })

  it('lastLap skips the leaderboard top fetch entirely', () => {
    // The lastLap source never falls back to the leaderboard top, so a
    // network round-trip on race load is wasted work.
    expect(ghostSourceNeedsTopFetch('lastLap')).toBe(false)
  })
})

describe('pickGhostMeta', () => {
  const PB_META: GhostMeta = { initials: 'YOU', lapTimeMs: 12000 }
  const TOP_META: GhostMeta = { initials: 'TOP', lapTimeMs: 11000 }
  const LAST_META: GhostMeta = { initials: 'YOU', lapTimeMs: 13500 }

  it('source pb returns the pb meta even when null and top exists', () => {
    expect(pickGhostMeta('pb', null, TOP_META, LAST_META)).toBeNull()
    expect(pickGhostMeta('pb', PB_META, TOP_META, LAST_META)).toBe(PB_META)
  })

  it('source top always returns the top meta even when pb beats it', () => {
    expect(pickGhostMeta('top', PB_META, TOP_META, LAST_META)).toBe(TOP_META)
    expect(pickGhostMeta('top', PB_META, null, LAST_META)).toBeNull()
  })

  it('source lastLap returns the lastLap meta with no fallback', () => {
    expect(pickGhostMeta('lastLap', PB_META, TOP_META, LAST_META)).toBe(LAST_META)
    expect(pickGhostMeta('lastLap', PB_META, TOP_META, null)).toBeNull()
  })

  it('source auto prefers pb when present', () => {
    expect(pickGhostMeta('auto', PB_META, TOP_META, LAST_META)).toBe(PB_META)
  })

  it('source auto falls back to top when pb is null', () => {
    expect(pickGhostMeta('auto', null, TOP_META, LAST_META)).toBe(TOP_META)
  })

  it('source auto returns null when both pb and top are null', () => {
    expect(pickGhostMeta('auto', null, null, LAST_META)).toBeNull()
  })

  it('matches pickGhostReplay branch-for-branch', () => {
    // Mirror invariant: every (source, present?, present?, present?) combo
    // resolves to the same picked-or-null shape between meta and replay so
    // the nameplate never desyncs from the ghost car.
    const cases: Array<[GhostMeta | null, GhostMeta | null, GhostMeta | null]> = [
      [PB_META, TOP_META, LAST_META],
      [null, TOP_META, LAST_META],
      [PB_META, null, LAST_META],
      [PB_META, TOP_META, null],
      [null, null, null],
    ]
    for (const [pb, top, last] of cases) {
      for (const src of GHOST_SOURCES) {
        const metaPick = pickGhostMeta(src, pb, top, last)
        // Build dummy replays whose presence matches the meta's presence.
        const pbReplay = pb ? PB : null
        const topReplay = top ? TOP : null
        const lastReplay = last ? LAST_LAP : null
        const replayPick = pickGhostReplay(src, pbReplay, topReplay, lastReplay)
        if (replayPick === null) {
          expect(metaPick).toBeNull()
        } else {
          // Whichever meta was picked, it must NOT be null when replayPick is non-null.
          expect(metaPick).not.toBeNull()
        }
      }
    }
  })
})

describe('pickGhostMetaAfterPb', () => {
  const NEW_PB_META: GhostMeta = { initials: 'YOU', lapTimeMs: 9500 }
  const PREV_TOP_META: GhostMeta = { initials: 'TOP', lapTimeMs: 11000 }

  it('top keeps the previous active meta', () => {
    expect(pickGhostMetaAfterPb('top', NEW_PB_META, PREV_TOP_META)).toBe(
      PREV_TOP_META,
    )
  })

  it('lastLap keeps the previous active meta (per-lap writer is canonical)', () => {
    expect(pickGhostMetaAfterPb('lastLap', NEW_PB_META, PREV_TOP_META)).toBe(
      PREV_TOP_META,
    )
  })

  it('auto and pb swap to the fresh PB meta', () => {
    expect(pickGhostMetaAfterPb('auto', NEW_PB_META, PREV_TOP_META)).toBe(
      NEW_PB_META,
    )
    expect(pickGhostMetaAfterPb('pb', NEW_PB_META, null)).toBe(NEW_PB_META)
  })
})
