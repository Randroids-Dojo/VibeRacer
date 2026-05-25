import { describe, it, expect } from 'vitest'
import {
  listManifestEntries,
  trackTemplateFor,
  trackTemplateIdFor,
} from '@/game/worldTourTrackManifest'
import { STANDARD_CHAMPIONSHIP } from '@/data/worldTourChampionship'
import { TRACK_TEMPLATES } from '@/game/trackTemplates'
import { MAX_PIECES_PER_TRACK } from '@/lib/schemas'

describe('worldTourTrackManifest', () => {
  it('returns a template for every track id in the championship', () => {
    for (const tour of STANDARD_CHAMPIONSHIP.tours) {
      for (const trackId of tour.trackIds) {
        const template = trackTemplateFor(trackId)
        expect(template, `missing template for ${trackId}`).not.toBeNull()
      }
    }
  })

  it('every resolved template fits the per-track piece limit', () => {
    for (const tour of STANDARD_CHAMPIONSHIP.tours) {
      for (const trackId of tour.trackIds) {
        const template = trackTemplateFor(trackId)!
        expect(template.pieces.length, `${trackId} exceeds piece limit`).toBeLessThanOrEqual(
          MAX_PIECES_PER_TRACK,
        )
      }
    }
  })

  it('resolves the same template every call (deterministic)', () => {
    const a = trackTemplateIdFor('velvet-coast-2')
    const b = trackTemplateIdFor('velvet-coast-2')
    expect(a).toBe(b)
  })

  it('rotates templates within a tour so the four races differ', () => {
    // Velvet Coast has 4 races; with 5 templates in the rotation, the
    // four resolved templates must all be distinct.
    const velvet = STANDARD_CHAMPIONSHIP.tours.find((t) => t.id === 'velvet-coast')!
    const resolved = velvet.trackIds.map((id) => trackTemplateIdFor(id))
    const unique = new Set(resolved)
    expect(unique.size).toBe(velvet.trackIds.length)
  })

  it('falls back to a known template on an unknown trackId', () => {
    const fallback = trackTemplateIdFor('made-up-id')
    expect(TRACK_TEMPLATES.find((t) => t.id === fallback)).toBeDefined()
  })

  it('listManifestEntries returns one entry per championship trackId', () => {
    const expected =
      STANDARD_CHAMPIONSHIP.tours.flatMap((t) => t.trackIds).length
    expect(listManifestEntries()).toHaveLength(expected)
  })
})
