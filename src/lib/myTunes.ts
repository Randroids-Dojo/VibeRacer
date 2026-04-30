import { z } from 'zod'
import { SlugSchema } from './schemas'
import { TrackTuneSchema, type TrackTune } from './tunes'

export const MY_TUNES_STORAGE_KEY = 'viberacer.myTunes'
export const TUNE_OVERRIDES_STORAGE_KEY = 'viberacer.tuneOverrides'
export const KNOWN_TUNES_STORAGE_KEY = 'viberacer.knownTunes'
export const MY_TUNES_EVENT = 'viberacer:my-tunes-changed'
export const TUNE_OVERRIDES_EVENT = 'viberacer:tune-overrides-changed'
export const KNOWN_TUNES_EVENT = 'viberacer:known-tunes-changed'

export interface MyTuneEntry {
  id: string
  name: string
  originSlug?: string
  tune: TrackTune
  createdAt: number
  updatedAt: number
}

export type TuneOverride =
  | { source: 'default' }
  | { source: 'mine'; id: string }
  | { source: 'visited'; slug: string }

const MyTuneEntrySchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().trim().min(1).max(80),
    originSlug: SlugSchema.optional(),
    tune: TrackTuneSchema,
    createdAt: z.number().positive().finite(),
    updatedAt: z.number().positive().finite(),
  })
  .strict()

const MyTunesSchema = z.array(MyTuneEntrySchema)

const TuneOverrideSchema = z.discriminatedUnion('source', [
  z.object({ source: z.literal('default') }).strict(),
  z.object({ source: z.literal('mine'), id: z.string().uuid() }).strict(),
  z.object({ source: z.literal('visited'), slug: SlugSchema }).strict(),
])

const TuneOverridesSchema = z.record(SlugSchema, TuneOverrideSchema)
const KnownTunesSchema = z.record(SlugSchema, TrackTuneSchema)

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

export function parseMyTunes(raw: unknown): MyTuneEntry[] {
  const parsed = MyTunesSchema.safeParse(raw)
  if (!parsed.success) return []
  const byId = new Map<string, MyTuneEntry>()
  for (const entry of parsed.data) {
    const prior = byId.get(entry.id)
    if (!prior || entry.updatedAt > prior.updatedAt) byId.set(entry.id, entry)
  }
  return Array.from(byId.values()).sort((a, b) => b.updatedAt - a.updatedAt)
}

export function readMyTunes(): MyTuneEntry[] {
  return parseMyTunes(readJson(MY_TUNES_STORAGE_KEY))
}

export function upsertMyTune(entry: MyTuneEntry): MyTuneEntry[] {
  const parsed = MyTuneEntrySchema.safeParse(entry)
  if (!parsed.success) return readMyTunes()
  const next = readMyTunes().filter((item) => item.id !== parsed.data.id)
  next.push(parsed.data)
  const sorted = parseMyTunes(next)
  writeJson(MY_TUNES_STORAGE_KEY, sorted, MY_TUNES_EVENT)
  return sorted
}

export function deleteMyTune(id: string): MyTuneEntry[] {
  const next = readMyTunes().filter((item) => item.id !== id)
  writeJson(MY_TUNES_STORAGE_KEY, next, MY_TUNES_EVENT)
  const overrides = readTuneOverrides()
  let changed = false
  for (const [slug, override] of Object.entries(overrides)) {
    if (override.source === 'mine' && override.id === id) {
      overrides[slug] = { source: 'default' }
      changed = true
    }
  }
  if (changed) writeTuneOverrides(overrides)
  return next
}

export function readTuneOverrides(): Record<string, TuneOverride> {
  const parsed = TuneOverridesSchema.safeParse(readJson(TUNE_OVERRIDES_STORAGE_KEY))
  return parsed.success ? parsed.data : {}
}

function writeTuneOverrides(overrides: Record<string, TuneOverride>): void {
  writeJson(TUNE_OVERRIDES_STORAGE_KEY, overrides, TUNE_OVERRIDES_EVENT)
}

export function readTuneOverride(slug: string): TuneOverride {
  const slugParsed = SlugSchema.safeParse(slug)
  if (!slugParsed.success) return { source: 'default' }
  return readTuneOverrides()[slugParsed.data] ?? { source: 'default' }
}

export function writeTuneOverride(slug: string, override: TuneOverride): void {
  const slugParsed = SlugSchema.safeParse(slug)
  const overrideParsed = TuneOverrideSchema.safeParse(override)
  if (!slugParsed.success || !overrideParsed.success) return
  const overrides = readTuneOverrides()
  overrides[slugParsed.data] = overrideParsed.data
  writeTuneOverrides(overrides)
}

export function readKnownTunes(): Record<string, TrackTune> {
  const parsed = KnownTunesSchema.safeParse(readJson(KNOWN_TUNES_STORAGE_KEY))
  return parsed.success ? parsed.data : {}
}

export function readKnownTune(slug: string): TrackTune | null {
  const slugParsed = SlugSchema.safeParse(slug)
  if (!slugParsed.success) return null
  return readKnownTunes()[slugParsed.data] ?? null
}

export function recordKnownTune(slug: string, tune: TrackTune | null): void {
  if (!tune) return
  const slugParsed = SlugSchema.safeParse(slug)
  const tuneParsed = TrackTuneSchema.safeParse(tune)
  if (!slugParsed.success || !tuneParsed.success) return
  const known = readKnownTunes()
  known[slugParsed.data] = tuneParsed.data
  writeJson(KNOWN_TUNES_STORAGE_KEY, known, KNOWN_TUNES_EVENT)
}

export function resolvePersonalTune(
  slug: string,
  defaultTune: TrackTune | null,
): TrackTune | null {
  const override = readTuneOverride(slug)
  if (override.source === 'mine') {
    const match = readMyTunes().find((entry) => entry.id === override.id)
    return match?.tune ?? defaultTune
  }
  if (override.source === 'visited') {
    return readKnownTune(override.slug) ?? defaultTune
  }
  return defaultTune
}
