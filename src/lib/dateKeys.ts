/**
 * Pure date-key helpers shared by every feature that needs a UTC
 * `YYYY-MM-DD` slot (daily challenge, daily streak, future daily-anything
 * features). Intentionally tiny and free of server-side imports so client
 * components can pull `dateKeyForUtc` straight in without dragging in any
 * of `dailyChallenge.ts`'s KV plumbing.
 */

/**
 * Pull "YYYY-MM-DD" out of an epoch-millis value, in UTC. UTC is intentional:
 * a player in Sydney and a player in San Francisco should see the same daily
 * slot so a shared link does not surprise the recipient with a different
 * featured track.
 */
export function dateKeyForUtc(nowMs: number): string {
  if (typeof nowMs !== 'number' || !Number.isFinite(nowMs)) {
    return dateKeyForUtc(Date.now())
  }
  const d = new Date(nowMs)
  if (Number.isNaN(d.getTime())) return dateKeyForUtc(Date.now())
  const yyyy = d.getUTCFullYear()
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}
