import { cookies } from 'next/headers'
import type { RacerId } from './schemas'

export const RACER_ID_COOKIE = 'viberacer.racerId'
export const RACER_ID_COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 365

export async function readRacerId(): Promise<RacerId | null> {
  const jar = await cookies()
  const v = jar.get(RACER_ID_COOKIE)?.value
  return v ?? null
}

export function isValidRacerId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
    value,
  )
}

export function newRacerId(): RacerId {
  return crypto.randomUUID()
}
