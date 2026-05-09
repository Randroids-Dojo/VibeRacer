// Validated KV read helpers. Each helper imports `getKv` from `./kv` so a
// vitest `vi.mock('@/lib/kv', ...)` swap of `getKv` flows through here too.
// Keeping these in a separate module from `./kv` keeps that mocking story
// reliable: an in-module call inside `./kv` would use the original `getKv`
// regardless of what the test mocked.

import type { ZodTypeAny, infer as zInfer } from 'zod'
import { getKv } from './kv'

// Validated JSON read. Upstash sometimes returns the parsed object and
// sometimes the raw JSON string depending on driver version, so this helper
// tolerates both. Returns null on a missing key, a JSON parse failure, or a
// schema rejection so the caller never has to special-case any of those.
export async function kvGetJson<S extends ZodTypeAny>(
  key: string,
  schema: S,
): Promise<zInfer<S> | null> {
  const raw = await getKv().get(key)
  if (raw === null || raw === undefined) return null
  let value: unknown
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw)
    } catch {
      return null
    }
  } else {
    value = raw
  }
  const parsed = schema.safeParse(value)
  return parsed.success ? parsed.data : null
}
