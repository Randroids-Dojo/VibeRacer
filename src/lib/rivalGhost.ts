// Pure helpers for the "Race rival ghost" flow. The leaderboard pane lets the
// player pick any leaderboard entry and chase that exact lap as their ghost
// car for the rest of the session (the choice persists until Restart or Exit).
//
// Kept DOM-free / React-free / network-free so the helpers can be unit-tested
// against synthetic payloads. The actual replay fetch lives in Game.tsx and
// reuses the existing `GET /api/replay/byNonce` route that already serves the
// friend-challenge flow.
//
// Three concerns live here:
//
//   1. `RivalSelection`: the picked entry's identity (initials + lap time +
//      rank + nonce). Surfaced to the HUD as a small banner so the player
//      always knows who they are racing.
//
//   2. `formatRivalBannerLabel(rival)`: the player-facing string. Plain-language
//      fallback for "no rival picked" so the helper is safe to call before the
//      first chase. No em-dashes (per AGENTS.md).
//
//   3. `isValidNonce(value)`: defensive shape check on the nonce string before
//      it goes out the wire to `/api/replay/byNonce`. The server validates again
//      but rejecting client-side avoids a doomed network round trip.

import { z } from 'zod'

// Race-token nonces are 16 random bytes encoded as lowercase hex. Mirrors the
// regex in `src/app/api/race/start/route.ts` and `byNonce/route.ts` so the
// three checks stay in lockstep.
export const NONCE_REGEX = /^[a-f0-9]{32}$/

// Schema for the pose carried into / out of `Game.tsx`. The renderer needs
// `nonce` to fetch the replay, the HUD needs `initials` + `lapTimeMs` to
// render the banner, and `rank` rounds the messaging out so the banner reads
// "RIVAL #3 XYZ 0:42.123" instead of just "RIVAL XYZ".
export const RivalSelectionSchema = z
  .object({
    nonce: z.string().regex(NONCE_REGEX),
    initials: z.string().min(1).max(8),
    lapTimeMs: z.number().int().positive(),
    rank: z.number().int().positive(),
  })
  .strict()
export type RivalSelection = z.infer<typeof RivalSelectionSchema>

export function isValidNonce(value: unknown): value is string {
  return typeof value === 'string' && NONCE_REGEX.test(value)
}

// Defensive guard for the full payload. Used at the trust boundary in Game.tsx
// before the rival is mounted into the renderer's refs so a malformed or
// stale row from a custom Leaderboard call cannot crash the rAF loop.
export function isRivalSelection(value: unknown): value is RivalSelection {
  return RivalSelectionSchema.safeParse(value).success
}

// "01:23.456" formatter shared with the HUD. Mirrors the formatter used in
// `Leaderboard.tsx` and `share.ts` so the rival banner reads with the same
// punctuation as the leaderboard time column. Defensive against negative /
// non-finite input so a corrupt leaderboard row never paints "NaN:NaN" into
// the HUD.
export function formatRivalLapTime(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '00:00.000'
  const total = Math.round(ms)
  const minutes = Math.floor(total / 60000)
  const seconds = Math.floor((total % 60000) / 1000)
  const millis = total % 1000
  return `${pad2(minutes)}:${pad2(seconds)}.${pad3(millis)}`
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

function pad3(n: number): string {
  if (n < 10) return `00${n}`
  if (n < 100) return `0${n}`
  return String(n)
}

// One-line banner copy. Reads as "RIVAL #3 XYZ chase 0:42.123" so the rank
// + initials are visible at a glance and the chase target is obvious.
export function formatRivalBannerLabel(rival: RivalSelection | null): string {
  if (rival === null) return ''
  return `RIVAL #${rival.rank} ${rival.initials} chase ${formatRivalLapTime(
    rival.lapTimeMs,
  )}`
}

// Pure summarizer of the "should we even show the Chase button" rule. The
// button is suppressed for the player's own rows (chasing yourself is what
// the existing PB / lastLap ghost sources are for) and for malformed rows
// (missing nonce). Centralizing the rule here so the UI and tests stay in
// lockstep.
export function shouldOfferChase(entry: {
  isMe: boolean
  nonce: string | null | undefined
}): boolean {
  if (entry.isMe) return false
  return isValidNonce(entry.nonce)
}
