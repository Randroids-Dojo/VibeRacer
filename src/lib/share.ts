/**
 * Share helpers for the pause-menu Share button (and any other surface that
 * wants to broadcast a track URL plus the player's personal best).
 *
 * The flow is "Web Share API first, clipboard fallback":
 *
 *  1. If `navigator.share` is available (most mobile browsers), invoke it with
 *     the formatted message so the OS share sheet opens.
 *  2. Otherwise, write the same message to `navigator.clipboard` and report
 *     back so the UI can flash a toast.
 *
 * Pure helpers (`formatLapTime`, `buildShareUrl`, `buildShareText`,
 * `buildSharePayload`) are exported separately so they can be unit-tested
 * without a DOM.
 */

export interface ShareInputs {
  origin: string
  slug: string
  versionHash: string
  /** Player's local PB on this slug + version, if any. */
  bestMs: number | null
  /** Track-wide top time at race start, if any. */
  record: { initials: string; lapTimeMs: number } | null
  /** Player's tag, used in the share text when available. */
  initials: string | null
}

export interface SharePayload {
  title: string
  text: string
  url: string
}

export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed'

export function formatLapTime(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '--:--.---'
  const total = Math.max(0, Math.round(ms))
  const minutes = Math.floor(total / 60000)
  const seconds = Math.floor((total % 60000) / 1000)
  const millis = total % 1000
  const mm = String(minutes).padStart(2, '0')
  const ss = String(seconds).padStart(2, '0')
  const mmm = String(millis).padStart(3, '0')
  return `${mm}:${ss}.${mmm}`
}

/**
 * Builds the canonical race URL for sharing. Pinning `?v=<hash>` ensures the
 * recipient races the exact track version the sharer was on, even if the
 * track has since been edited.
 */
export function buildShareUrl(inputs: Pick<ShareInputs, 'origin' | 'slug' | 'versionHash'>): string {
  const base = inputs.origin.replace(/\/+$/, '')
  const slug = encodeURIComponent(inputs.slug)
  return `${base}/${slug}?v=${inputs.versionHash}`
}

export function buildShareText(inputs: ShareInputs): string {
  const lines: string[] = []
  const tag = inputs.initials ? `${inputs.initials} ` : ''
  if (inputs.bestMs !== null) {
    lines.push(`${tag}ran ${formatLapTime(inputs.bestMs)} on /${inputs.slug} in VibeRacer.`)
  } else {
    lines.push(`Race me on /${inputs.slug} in VibeRacer.`)
  }
  if (inputs.record) {
    lines.push(
      `Track record: ${inputs.record.initials} ${formatLapTime(inputs.record.lapTimeMs)}.`,
    )
  }
  lines.push('Can you beat it?')
  return lines.join(' ')
}

export function buildSharePayload(inputs: ShareInputs): SharePayload {
  return {
    title: `VibeRacer / ${inputs.slug}`,
    text: buildShareText(inputs),
    url: buildShareUrl(inputs),
  }
}

interface ShareNavigator {
  share?: (data: SharePayload) => Promise<void>
  canShare?: (data: SharePayload) => boolean
  clipboard?: { writeText?: (text: string) => Promise<void> }
}

/**
 * Attempts the Web Share API first, then clipboard. Returns the outcome so the
 * caller can flash an appropriate toast. The clipboard fallback writes the URL
 * plus the lap-time text on a single line, since most sites and chat apps
 * preview the URL nicely if it sits at the end.
 */
export async function shareOrCopy(payload: SharePayload): Promise<ShareOutcome> {
  if (typeof navigator === 'undefined') return 'failed'
  const nav = navigator as ShareNavigator
  if (typeof nav.share === 'function') {
    try {
      if (typeof nav.canShare === 'function' && !nav.canShare(payload)) {
        // Fall through to clipboard.
      } else {
        await nav.share(payload)
        return 'shared'
      }
    } catch (e) {
      // AbortError fires when the user dismisses the share sheet. Treat as
      // cancelled rather than swapping to clipboard, otherwise we surprise the
      // user with a "copied!" toast they did not ask for.
      if (e instanceof Error && e.name === 'AbortError') return 'cancelled'
      // Other failures fall through to clipboard.
    }
  }
  const writeText = nav.clipboard?.writeText
  if (typeof writeText === 'function') {
    try {
      await writeText(`${payload.text} ${payload.url}`)
      return 'copied'
    } catch {
      return 'failed'
    }
  }
  return 'failed'
}
