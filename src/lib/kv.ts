import { Redis } from '@upstash/redis'
import type { Slug, VersionHash, RacerId } from './schemas'

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

let _kv: Redis | null = null

export function getKv(): Redis {
  if (!_kv) {
    _kv = new Redis({
      url: requireEnv('KV_REST_API_URL'),
      token: requireEnv('KV_REST_API_TOKEN'),
    })
  }
  return _kv
}

export const kvKeys = {
  trackLatest: (slug: Slug) => `track:${slug}:latest`,
  trackVersion: (slug: Slug, hash: VersionHash) =>
    `track:${slug}:version:${hash}`,
  trackVersions: (slug: Slug) => `track:${slug}:versions`,
  trackIndex: () => 'track:index',
  leaderboard: (slug: Slug, hash: VersionHash) => `lb:${slug}:${hash}`,
  raceToken: (nonce: string) => `race:token:${nonce}`,
  racerFirstSeen: (racerId: RacerId) => `racer:${racerId}:firstSeen`,
  racerLastSubmit: (racerId: RacerId) => `racer:${racerId}:lastSubmit`,
  ratelimitIp: (ip: string) => `ratelimit:submit:ip:${ip}`,
  ratelimitRacer: (racerId: RacerId) => `ratelimit:submit:racer:${racerId}`,
  ratelimitDaily: (ip: string) => `ratelimit:submit:daily:${ip}`,
} as const

export const TTL = {
  raceTokenSec: 15 * 60,
  ratelimitBurstSec: 60,
  ratelimitDailySec: 24 * 60 * 60,
} as const
