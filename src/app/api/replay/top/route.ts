import { NextResponse, type NextRequest } from 'next/server'
import { SlugSchema, VersionHashSchema } from '@/lib/schemas'
import { getKv, kvKeys } from '@/lib/kv'
import { ReplaySchema } from '@/lib/replay'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const slug = SlugSchema.safeParse(url.searchParams.get('slug') ?? '')
  const versionHash = VersionHashSchema.safeParse(url.searchParams.get('v') ?? '')
  if (!slug.success || !versionHash.success) {
    return NextResponse.json({ error: 'invalid params' }, { status: 400 })
  }

  try {
    const kv = getKv()
    const nonce = await kv.get<string>(
      kvKeys.topReplayPointer(slug.data, versionHash.data),
    )
    if (!nonce) {
      return NextResponse.json({ error: 'no replay' }, { status: 404 })
    }

    // Upstash returns parsed JSON for values stored as JSON strings; tolerate
    // the raw-string case too in case storage drivers diverge.
    const raw = await kv.get(kvKeys.lapReplay(nonce))
    if (!raw) {
      return NextResponse.json({ error: 'no replay' }, { status: 404 })
    }
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw
    const parsed = ReplaySchema.safeParse(value)
    if (!parsed.success) {
      return NextResponse.json({ error: 'no replay' }, { status: 404 })
    }
    return NextResponse.json(parsed.data)
  } catch {
    return NextResponse.json({ error: 'no replay' }, { status: 404 })
  }
}
