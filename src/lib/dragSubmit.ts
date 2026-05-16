import type { DragLapCompleteEvent } from '@/game/dragTick'
import type { DragLoadout } from './dragParts'
import type { DragStripSlug } from './dragStrips'
import type { Replay } from './replay'
import { readStoredInitials } from './initials'

// Submit a finished drag run to the leaderboard. Mirrors the closed-loop
// submission shape but flips `mode: 'drag'` so the API persists the
// loadout / topSpeed / fouled / reactionTimeMs metadata alongside the
// existing lap meta. Best-effort: a network error or a 400 (e.g. an
// expired token) surfaces as a resolved promise. The caller can race
// again to retry.

const FALLBACK_INITIALS = 'YOU'

export interface DragSubmitArgs {
  slug: DragStripSlug
  versionHash: string
  finishEvent: DragLapCompleteEvent
  loadout: DragLoadout
  // Optional recorded position trail. When present the server persists it
  // under the lap's nonce so a later race can render this run as a ghost.
  // Mirrors the closed-loop replay submission shape.
  replay?: Replay
}

interface RaceStartResponse {
  token?: unknown
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

async function mintRaceToken(
  slug: DragStripSlug,
  versionHash: string,
): Promise<string | null> {
  const res = await fetch(
    `/api/race/start?slug=${encodeURIComponent(slug)}&v=${versionHash}`,
    { method: 'POST' },
  )
  if (!res.ok) return null
  const data = (await res.json()) as RaceStartResponse
  return isString(data.token) ? data.token : null
}

export async function submitDragRun(args: DragSubmitArgs): Promise<void> {
  const { slug, versionHash, finishEvent, loadout, replay } = args
  const token = await mintRaceToken(slug, versionHash)
  if (!token) return

  // Reuse the project-wide initials helper instead of re-implementing the
  // localStorage lookup. Mirrors the closed-loop race flow so the player
  // sees the same initials on both leaderboards.
  const stored = readStoredInitials()
  const initials = stored ?? FALLBACK_INITIALS

  const body = {
    token,
    checkpoints: finishEvent.hits,
    lapTimeMs: finishEvent.finishTimeMs,
    initials,
    mode: 'drag' as const,
    loadout,
    topSpeed: finishEvent.topSpeed,
    fouled: finishEvent.fouled,
    reactionTimeMs: finishEvent.reactionTimeMs ?? undefined,
    replay,
  }
  await fetch(
    `/api/race/submit?slug=${encodeURIComponent(slug)}&v=${versionHash}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
  )
}
