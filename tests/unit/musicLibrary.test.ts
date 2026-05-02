import { describe, expect, it } from 'vitest'
import { buildLibraryItems } from '@/components/MusicLibrary'
import {
  DEFAULT_TRACK_MUSIC,
  type TrackMusic,
} from '@/lib/trackMusic'
import type { MyMusicEntry } from '@/lib/myMusic'

const sampleMusic: TrackMusic = {
  ...DEFAULT_TRACK_MUSIC,
  name: 'sample',
  seedWord: 'sample',
}

const myEntry = (
  id: string,
  name: string,
  originSlug: string | undefined,
  updatedAt: number,
): MyMusicEntry => ({
  id,
  name,
  originSlug,
  music: { ...sampleMusic, name },
  createdAt: updatedAt,
  updatedAt,
})

const known = (slug: string, name: string): TrackMusic => ({
  ...sampleMusic,
  name,
  seedWord: slug,
})

describe('buildLibraryItems', () => {
  const myMusic = [
    myEntry('11111111-1111-1111-1111-111111111111', 'Older Mine', 'cozy', 1),
    myEntry('22222222-2222-2222-2222-222222222222', 'Newer Mine', 'sandbox', 5),
  ]
  const knownMusic = {
    cozy: known('cozy', 'Cozy default'),
    sandbox: known('sandbox', 'Sandbox default'),
  }

  it('returns mine plus defaults under the All filter', () => {
    const items = buildLibraryItems(myMusic, knownMusic, 'all', 'cozy')
    const sources = items.map((item) => item.source)
    expect(sources.filter((s) => s === 'mine').length).toBe(myMusic.length)
    expect(sources.filter((s) => s === 'default').length).toBe(
      Object.keys(knownMusic).length,
    )
  })

  it('filters to mine only when the filter is "mine"', () => {
    const items = buildLibraryItems(myMusic, knownMusic, 'mine', 'cozy')
    expect(items.every((item) => item.source === 'mine')).toBe(true)
    expect(items.length).toBe(myMusic.length)
  })

  it('filters by current slug when the filter is "this"', () => {
    const items = buildLibraryItems(myMusic, knownMusic, 'this', 'cozy')
    const slugs = new Set(items.map((item) => item.originSlug))
    expect(slugs.size).toBe(1)
    expect(slugs.has('cozy')).toBe(true)
  })

  it('puts newer items first when no source dominates', () => {
    const items = buildLibraryItems(myMusic, knownMusic, 'mine', 'cozy')
    expect(items[0]?.name).toBe('Newer Mine')
  })

  it('returns only defaults under the defaults filter', () => {
    const items = buildLibraryItems(myMusic, knownMusic, 'defaults', 'cozy')
    expect(items.every((item) => item.source === 'default')).toBe(true)
    expect(items.length).toBe(Object.keys(knownMusic).length)
  })

  it('handles empty inputs gracefully', () => {
    expect(buildLibraryItems([], {}, 'all', 'cozy')).toEqual([])
    expect(buildLibraryItems([], {}, 'mine', 'cozy')).toEqual([])
  })
})
