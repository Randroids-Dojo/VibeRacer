import type { Redis } from '@upstash/redis'

export interface RateLimitRule {
  key: string
  limit: number
  windowSec: number
}

export async function hitRateLimit(
  kv: Redis,
  rule: RateLimitRule,
): Promise<{ allowed: boolean; count: number }> {
  const count = await kv.incr(rule.key)
  if (count === 1) {
    await kv.expire(rule.key, rule.windowSec)
  }
  return { allowed: count <= rule.limit, count }
}

export const RATE_LIMITS = {
  burstPerMinute: 5,
  windowSec: 60,
  dailyPerIp: 500,
  daySec: 24 * 60 * 60,
} as const
