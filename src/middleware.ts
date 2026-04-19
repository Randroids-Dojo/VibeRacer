import { NextResponse, type NextRequest } from 'next/server'
import {
  RACER_ID_COOKIE,
  RACER_ID_COOKIE_MAX_AGE_SEC,
  isValidRacerId,
  newRacerId,
} from '@/lib/racerId'

export async function middleware(req: NextRequest) {
  const existing = req.cookies.get(RACER_ID_COOKIE)?.value
  if (existing && isValidRacerId(existing)) {
    return NextResponse.next()
  }

  const racerId = newRacerId()
  const res = NextResponse.next()
  res.cookies.set({
    name: RACER_ID_COOKIE,
    value: racerId,
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: RACER_ID_COOKIE_MAX_AGE_SEC,
  })

  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    try {
      const { getKv, kvKeys } = await import('@/lib/kv')
      await getKv().set(kvKeys.racerFirstSeen(racerId), new Date().toISOString())
    } catch {
      // Best-effort; never block the response on KV errors.
    }
  }

  return res
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)',
  ],
}
