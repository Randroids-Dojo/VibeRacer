export const INITIAL_DELAY_MS = 30_000
export const POLL_INTERVAL_MS = 60_000

export function shouldPoll(version: string | undefined | null): boolean {
  if (!version) return false
  if (version === 'dev') return false
  return true
}

export async function fetchVersion(
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  try {
    const res = await fetchImpl('/api/version', { cache: 'no-store' })
    if (!res.ok) return null
    const body = (await res.json()) as { version?: unknown }
    return typeof body.version === 'string' ? body.version : null
  } catch {
    return null
  }
}

export function isStaleVersion(
  current: string | undefined | null,
  remote: string | null,
): boolean {
  if (!current || !remote) return false
  return current !== remote
}
