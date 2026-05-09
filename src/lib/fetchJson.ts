// Typed `fetch` wrapper. Resolves to `{ data, raw }` on a 2xx + valid-JSON
// + schema-pass response, or `null` on every other outcome (network error,
// non-2xx status, JSON parse error, schema rejection). Callers that need
// the raw body (for fields the schema does not capture) use `raw`; the
// common case uses `data` only.

import type { ZodTypeAny, infer as zInfer } from 'zod'

export interface FetchJsonResult<T> {
  data: T
  raw: unknown
}

export async function fetchJson<S extends ZodTypeAny>(
  input: RequestInfo | URL,
  schema: S,
  init?: RequestInit,
): Promise<FetchJsonResult<zInfer<S>> | null> {
  let res: Response
  try {
    res = await fetch(input, init)
  } catch {
    return null
  }
  if (!res.ok) return null
  let raw: unknown
  try {
    raw = await res.json()
  } catch {
    return null
  }
  const parsed = schema.safeParse(raw)
  if (!parsed.success) return null
  return { data: parsed.data, raw }
}
