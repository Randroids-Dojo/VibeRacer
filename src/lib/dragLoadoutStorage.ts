import {
  DEFAULT_DRAG_LOADOUT,
  DragLoadoutSchema,
  type DragLoadout,
} from './dragParts'
import type { DragStripSlug } from './dragStrips'

// localStorage helpers for drag-mode loadouts. Mirrors the per-track read
// pattern in src/lib/tuningSettings.ts: a single "last-used" entry plus a
// per-strip override that the garage page persists. Defensive against
// malformed JSON so a hand-edited payload falls back cleanly to the default.

const LAST_KEY = 'viberacer.drag.loadout.last'
const PER_STRIP_PREFIX = 'viberacer.drag.loadout.'

function perStripKey(slug: DragStripSlug): string {
  return `${PER_STRIP_PREFIX}${slug}`
}

function safeParseLoadout(raw: string | null): DragLoadout | null {
  if (!raw) return null
  try {
    const parsed = DragLoadoutSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

function readStorage(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function readDragLoadout(slug: DragStripSlug): DragLoadout {
  const storage = readStorage()
  if (!storage) return DEFAULT_DRAG_LOADOUT
  const perStrip = safeParseLoadout(storage.getItem(perStripKey(slug)))
  if (perStrip) return perStrip
  const last = safeParseLoadout(storage.getItem(LAST_KEY))
  if (last) return last
  return DEFAULT_DRAG_LOADOUT
}

export function writeDragLoadout(
  slug: DragStripSlug,
  loadout: DragLoadout,
): void {
  const storage = readStorage()
  if (!storage) return
  const json = JSON.stringify(loadout)
  try {
    storage.setItem(perStripKey(slug), json)
    storage.setItem(LAST_KEY, json)
  } catch {
    // Storage quota or privacy mode. Silent: the loadout is still in memory
    // and works for the current session.
  }
}

export function clearDragLoadout(slug: DragStripSlug): void {
  const storage = readStorage()
  if (!storage) return
  try {
    storage.removeItem(perStripKey(slug))
  } catch {
    // ignore
  }
}
