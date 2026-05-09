// Browser localStorage helpers wrapped around the SSR check, JSON parsing,
// zod validation, and quota error handling that every persistence layer in
// the app needs. Prefer these over bare `window.localStorage` calls so the
// "is window defined", "did JSON parse throw", "did the schema reject", and
// "did the write throw QuotaExceeded" cases are handled uniformly.

import type { ZodTypeAny, infer as zInfer } from 'zod'

function readRaw(key: string): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(key)
  } catch {
    // Safari private mode and a few hostile environments throw on access.
    // Treat as a missing entry so the caller falls back to a default.
    return null
  }
}

export function readJson<S extends ZodTypeAny>(
  key: string,
  schema: S,
): zInfer<S> | null {
  const raw = readRaw(key)
  if (raw === null || raw === '') return null
  try {
    const parsed = schema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export function writeJson<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Quota exceeded or storage disabled. Persistence is a best-effort
    // enhancement; failing silently keeps the rest of the flow working.
  }
}

// Read a finite number written via `writeNumber`. The optional predicate
// lets the caller reject numbers outside an expected range (negative,
// zero, above a sensible cap) without each site repeating the guard.
export function readNumber(
  key: string,
  predicate: (n: number) => boolean = (n) => n > 0,
): number | null {
  const raw = readRaw(key)
  if (raw === null || raw === '') return null
  const n = Number(raw)
  if (!Number.isFinite(n)) return null
  return predicate(n) ? n : null
}

export function writeNumber(key: string, value: number): void {
  if (typeof window === 'undefined') return
  if (!Number.isFinite(value)) return
  try {
    window.localStorage.setItem(key, String(value))
  } catch {
    // See writeJson: quota / disabled storage is non-fatal.
  }
}

export function removeKey(key: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(key)
  } catch {
    // No-op; mirrors writeJson's swallow-and-continue policy.
  }
}
