/**
 * Friend-challenge link helpers. A "challenge" is a share URL that pins the
 * recipient's race to a specific submitted lap so they race that exact ghost
 * (rather than the leaderboard top or their own PB).
 *
 * URL shape: `/<slug>?v=<hash>&challenge=<nonce>&from=<INI>&time=<MS>`
 *
 *  - `challenge` is the 32-hex submission nonce. The recipient's client fetches
 *    `/api/replay/byNonce?slug=X&v=HASH&nonce=N` and uses the resulting
 *    `Replay` as the active ghost for the race. The nonce alone is the lookup
 *    key; `from` and `time` are display metadata.
 *  - `from` is the sharer's three-letter initials; renders in the HUD banner.
 *  - `time` is the lap time in integer milliseconds; renders alongside the
 *    initials so the recipient sees the target before the race starts.
 *
 * All inputs are validated defensively. A malformed or tampered URL surfaces
 * as null from `parseChallengeFromSearchParams` so the caller can fall back to
 * the normal ghost-source flow without crashing the page.
 */

import { formatLapTime } from './share'

export interface ChallengePayload {
  /** 32-hex submission nonce from the original sender. */
  nonce: string
  /** Sender's three-letter initials, uppercase. */
  from: string
  /** Lap time in integer milliseconds. */
  timeMs: number
}

/**
 * Build the challenge URL pieces a player can share. Returns the full URL and
 * a friendly text blurb suitable for the Web Share API or clipboard fallback.
 * The `from` field is normalized to uppercase three letters so a hand-typed
 * value or a localStorage drift never produces a mismatched display.
 */
export interface ChallengeShareInputs {
  origin: string
  slug: string
  versionHash: string
  nonce: string
  from: string | null
  timeMs: number
}

const NONCE_REGEX = /^[a-f0-9]{32}$/
const INITIALS_REGEX = /^[A-Z]{3}$/

export function isValidChallengeNonce(value: unknown): boolean {
  return typeof value === 'string' && NONCE_REGEX.test(value)
}

function normalizeInitials(raw: string | null): string | null {
  if (raw === null) return null
  if (typeof raw !== 'string') return null
  const upper = raw.trim().toUpperCase()
  return INITIALS_REGEX.test(upper) ? upper : null
}

function normalizeTimeMs(raw: number): number | null {
  if (typeof raw !== 'number') return null
  if (!Number.isFinite(raw)) return null
  if (raw <= 0) return null
  // An hour is plenty of headroom for any plausible single-lap time. Anything
  // beyond that is almost certainly a bad input or a deliberate spoof.
  if (raw > 60 * 60 * 1000) return null
  return Math.round(raw)
}

export function buildChallengeUrl(inputs: ChallengeShareInputs): string {
  const base = inputs.origin.replace(/\/+$/, '')
  const slug = encodeURIComponent(inputs.slug)
  const params = new URLSearchParams()
  params.set('v', inputs.versionHash)
  params.set('challenge', inputs.nonce)
  const from = normalizeInitials(inputs.from)
  if (from) params.set('from', from)
  const timeMs = normalizeTimeMs(inputs.timeMs)
  if (timeMs !== null) params.set('time', String(timeMs))
  return `${base}/${slug}?${params.toString()}`
}

export function buildChallengeText(inputs: ChallengeShareInputs): string {
  const from = normalizeInitials(inputs.from)
  const timeMs = normalizeTimeMs(inputs.timeMs)
  const tag = from ? `${from} ` : ''
  const time = timeMs !== null ? formatLapTime(timeMs) : null
  if (time) {
    return `${tag}challenges you to beat ${time} on /${inputs.slug} in VibeRacer.`
  }
  return `${tag}challenges you on /${inputs.slug} in VibeRacer.`.trim()
}

export interface ChallengeSharePayload {
  title: string
  text: string
  url: string
}

export function buildChallengeSharePayload(
  inputs: ChallengeShareInputs,
): ChallengeSharePayload {
  return {
    title: `VibeRacer challenge / ${inputs.slug}`,
    text: buildChallengeText(inputs),
    url: buildChallengeUrl(inputs),
  }
}

/**
 * Parse a challenge payload out of URL search params. Returns null when any
 * required field is missing or invalid; the caller should treat that as "no
 * challenge" and fall back to the normal ghost flow.
 */
export function parseChallengeFromSearchParams(
  params: URLSearchParams,
): ChallengePayload | null {
  const nonce = params.get('challenge')
  if (!isValidChallengeNonce(nonce)) return null
  const from = normalizeInitials(params.get('from'))
  // `time` is required so the HUD banner can show the target. A challenge
  // without a target is just a regular link, so treat it as such.
  const timeRaw = params.get('time')
  if (timeRaw === null) return null
  const timeNum = Number(timeRaw)
  const timeMs = normalizeTimeMs(timeNum)
  if (timeMs === null) return null
  return {
    nonce: nonce as string,
    from: from ?? '???',
    timeMs,
  }
}
