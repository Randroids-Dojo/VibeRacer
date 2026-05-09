import {
  DEFAULT_DRAG_LOADOUT,
  DragLoadoutSchema,
  type DragLoadout,
} from './dragParts'
import type { DragStripSlug } from './dragStrips'
import { readJson, removeKey, writeJson } from './storage'

// localStorage helpers for drag-mode loadouts. Mirrors the per-track read
// pattern in src/lib/tuningSettings.ts: a single "last-used" entry plus a
// per-strip override that the garage page persists. Defensive against
// malformed JSON so a hand-edited payload falls back cleanly to the default.

const LAST_KEY = 'viberacer.drag.loadout.last'
const PER_STRIP_PREFIX = 'viberacer.drag.loadout.'

function perStripKey(slug: DragStripSlug): string {
  return `${PER_STRIP_PREFIX}${slug}`
}

export function readDragLoadout(slug: DragStripSlug): DragLoadout {
  return (
    readJson(perStripKey(slug), DragLoadoutSchema) ??
    readJson(LAST_KEY, DragLoadoutSchema) ??
    DEFAULT_DRAG_LOADOUT
  )
}

export function writeDragLoadout(
  slug: DragStripSlug,
  loadout: DragLoadout,
): void {
  writeJson(perStripKey(slug), loadout)
  writeJson(LAST_KEY, loadout)
}

export function clearDragLoadout(slug: DragStripSlug): void {
  removeKey(perStripKey(slug))
}
