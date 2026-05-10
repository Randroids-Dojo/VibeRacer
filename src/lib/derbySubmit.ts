import type { DerbyArenaSlug, DerbyVehicleType } from './schemas'
import { readStoredInitials } from './initials'

// Client-side helper for the Derby submit pipeline. Best-effort: a network
// error or a 4xx surfaces as a resolved promise; the caller can run it
// back to retry. The wire shape is built here so the round host stays
// thin.

const FALLBACK_INITIALS = 'YOU'

export interface DerbySubmitArgs {
  arena: DerbyArenaSlug
  vehicle: DerbyVehicleType
  outcome: 'win' | 'loss' | 'timeout'
  roundTimeMs: number
  finalHealths: number[]
  kills: number
  scorePoints: number
}

interface DerbyStartResponse {
  token?: unknown
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

async function mintDerbyToken(
  arena: DerbyArenaSlug,
  vehicle: DerbyVehicleType,
): Promise<string | null> {
  const res = await fetch(
    `/api/derby/start?arena=${encodeURIComponent(arena)}&vehicle=${encodeURIComponent(vehicle)}`,
    { method: 'POST' },
  )
  if (!res.ok) return null
  const data = (await res.json()) as DerbyStartResponse
  return isString(data.token) ? data.token : null
}

export async function submitDerbyRun(args: DerbySubmitArgs): Promise<void> {
  const token = await mintDerbyToken(args.arena, args.vehicle)
  if (!token) return

  const stored = readStoredInitials()
  const initials = stored ?? FALLBACK_INITIALS

  const body = {
    token,
    outcome: args.outcome,
    roundTimeMs: Math.round(args.roundTimeMs),
    finalHealths: args.finalHealths.map((h) => Math.max(0, Math.min(100, Math.round(h)))),
    kills: args.kills,
    scorePoints: args.scorePoints,
    initials,
    vehicle: args.vehicle,
  }

  await fetch('/api/derby/submit', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}
