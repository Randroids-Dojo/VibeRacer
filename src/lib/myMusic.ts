import { z } from 'zod'
import { SlugSchema } from './schemas'
import { TrackMusicSchema, type TrackMusic } from './trackMusic'

export const MY_MUSIC_STORAGE_KEY = 'viberacer.myMusic'
export const MUSIC_OVERRIDES_STORAGE_KEY = 'viberacer.musicOverrides'
export const KNOWN_MUSIC_STORAGE_KEY = 'viberacer.knownMusic'
export const MY_MUSIC_EVENT = 'viberacer:my-music-changed'
export const MUSIC_OVERRIDES_EVENT = 'viberacer:music-overrides-changed'
export const KNOWN_MUSIC_EVENT = 'viberacer:known-music-changed'

export interface MyMusicEntry {
  id: string
  name: string
  originSlug?: string
  music: TrackMusic
  createdAt: number
  updatedAt: number
}

export type MusicOverride =
  | { source: 'default' }
  | { source: 'mine'; id: string }
  | { source: 'visited'; slug: string }

const MyMusicEntrySchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().trim().min(1).max(80),
    originSlug: SlugSchema.optional(),
    music: TrackMusicSchema,
    createdAt: z.number().positive().finite(),
    updatedAt: z.number().positive().finite(),
  })
  .strict()

const MyMusicSchema = z.array(MyMusicEntrySchema)

const MusicOverrideSchema = z.discriminatedUnion('source', [
  z.object({ source: z.literal('default') }).strict(),
  z.object({ source: z.literal('mine'), id: z.string().uuid() }).strict(),
  z.object({ source: z.literal('visited'), slug: SlugSchema }).strict(),
])

const MusicOverridesSchema = z.record(SlugSchema, MusicOverrideSchema)
const KnownMusicSchema = z.record(SlugSchema, TrackMusicSchema)

function readJson(key: string): unknown {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(key)
    return raw === null ? null : JSON.parse(raw)
  } catch {
    return null
  }
}

function writeJson(key: string, value: unknown, eventName: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
    window.dispatchEvent(new CustomEvent(eventName, { detail: value }))
  } catch {
  }
}

export function parseMyMusic(raw: unknown): MyMusicEntry[] {
  const parsed = MyMusicSchema.safeParse(raw)
  if (!parsed.success) return []
  const byId = new Map<string, MyMusicEntry>()
  for (const entry of parsed.data) {
    const prior = byId.get(entry.id)
    if (!prior || entry.updatedAt > prior.updatedAt) byId.set(entry.id, entry)
  }
  return Array.from(byId.values()).sort((a, b) => b.updatedAt - a.updatedAt)
}

export function readMyMusic(): MyMusicEntry[] {
  return parseMyMusic(readJson(MY_MUSIC_STORAGE_KEY))
}

export function upsertMyMusic(entry: MyMusicEntry): MyMusicEntry[] {
  const parsed = MyMusicEntrySchema.safeParse(entry)
  if (!parsed.success) return readMyMusic()
  const next = readMyMusic().filter((item) => item.id !== parsed.data.id)
  next.push(parsed.data)
  const sorted = parseMyMusic(next)
  writeJson(MY_MUSIC_STORAGE_KEY, sorted, MY_MUSIC_EVENT)
  return sorted
}

export function deleteMyMusic(id: string): MyMusicEntry[] {
  const next = readMyMusic().filter((item) => item.id !== id)
  writeJson(MY_MUSIC_STORAGE_KEY, next, MY_MUSIC_EVENT)
  const overrides = readMusicOverrides()
  let changed = false
  for (const [slug, override] of Object.entries(overrides)) {
    if (override.source === 'mine' && override.id === id) {
      overrides[slug] = { source: 'default' }
      changed = true
    }
  }
  if (changed) writeMusicOverrides(overrides)
  return next
}

export function readMusicOverrides(): Record<string, MusicOverride> {
  const parsed = MusicOverridesSchema.safeParse(readJson(MUSIC_OVERRIDES_STORAGE_KEY))
  return parsed.success ? parsed.data : {}
}

function writeMusicOverrides(overrides: Record<string, MusicOverride>): void {
  writeJson(MUSIC_OVERRIDES_STORAGE_KEY, overrides, MUSIC_OVERRIDES_EVENT)
}

export function readMusicOverride(slug: string): MusicOverride {
  const slugParsed = SlugSchema.safeParse(slug)
  if (!slugParsed.success) return { source: 'default' }
  return readMusicOverrides()[slugParsed.data] ?? { source: 'default' }
}

export function writeMusicOverride(slug: string, override: MusicOverride): void {
  const slugParsed = SlugSchema.safeParse(slug)
  const overrideParsed = MusicOverrideSchema.safeParse(override)
  if (!slugParsed.success || !overrideParsed.success) return
  const overrides = readMusicOverrides()
  overrides[slugParsed.data] = overrideParsed.data
  writeMusicOverrides(overrides)
}

export function readAllKnownMusic(): Record<string, TrackMusic> {
  const parsed = KnownMusicSchema.safeParse(readJson(KNOWN_MUSIC_STORAGE_KEY))
  return parsed.success ? parsed.data : {}
}

export function readKnownMusic(slug: string): TrackMusic | null {
  const slugParsed = SlugSchema.safeParse(slug)
  if (!slugParsed.success) return null
  return readAllKnownMusic()[slugParsed.data] ?? null
}

export function recordKnownMusic(slug: string, music: TrackMusic | null): void {
  if (!music) return
  const slugParsed = SlugSchema.safeParse(slug)
  const musicParsed = TrackMusicSchema.safeParse(music)
  if (!slugParsed.success || !musicParsed.success) return
  const known = readAllKnownMusic()
  known[slugParsed.data] = musicParsed.data
  writeJson(KNOWN_MUSIC_STORAGE_KEY, known, KNOWN_MUSIC_EVENT)
}

export function resolvePersonalMusic(
  slug: string,
  defaultTrackMusic: TrackMusic | null,
): TrackMusic | null {
  const override = readMusicOverride(slug)
  if (override.source === 'mine') {
    const match = readMyMusic().find((entry) => entry.id === override.id)
    return match?.music ?? defaultTrackMusic
  }
  if (override.source === 'visited') {
    return readKnownMusic(override.slug) ?? defaultTrackMusic
  }
  return defaultTrackMusic
}
