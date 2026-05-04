import { describe, expect, it } from 'vitest'
import { validateClosedLoop } from '@/game/track'
import {
  TRACK_TEMPLATES,
  cloneTemplatePieces,
  getTrackTemplate,
  templateFitsTrackLimit,
} from '@/game/trackTemplates'

describe('TRACK_TEMPLATES', () => {
  it('has unique stable ids', () => {
    const ids = TRACK_TEMPLATES.map((template) => template.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('keeps every template inside the piece cap', () => {
    for (const template of TRACK_TEMPLATES) {
      expect(templateFitsTrackLimit(template)).toBe(true)
    }
  })

  it('ships only valid closed loops', () => {
    for (const template of TRACK_TEMPLATES) {
      expect(validateClosedLoop(template.pieces)).toEqual({ ok: true })
    }
  })

  it('provides human labels without banned dash glyphs', () => {
    for (const template of TRACK_TEMPLATES) {
      expect(template.label).not.toMatch(/[\u2013\u2014]/)
      expect(template.description).not.toMatch(/[\u2013\u2014]/)
    }
  })

  it('returns null for an unknown template id', () => {
    expect(getTrackTemplate('missing')).toBeNull()
  })

  it('returns the matching template by id', () => {
    expect(getTrackTemplate(TRACK_TEMPLATES[0].id)).toBe(TRACK_TEMPLATES[0])
  })

  it('includes the reference GP replica template', () => {
    const template = getTrackTemplate('reference-gp')

    expect(template?.label).toBe('Reference GP')
    expect(template?.pieces.length).toBe(58)
    expect(validateClosedLoop(template?.pieces ?? [])).toEqual({ ok: true })
  })

  it('clones pieces so callers can mutate safely', () => {
    const original = TRACK_TEMPLATES[0]
    const clone = cloneTemplatePieces(original)

    expect(clone).toEqual(original.pieces)
    expect(clone).not.toBe(original.pieces)
    expect(clone[0]).not.toBe(original.pieces[0])

    clone[0].row += 10
    expect(original.pieces[0].row).not.toBe(clone[0].row)
  })
})
