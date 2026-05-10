import { createHmac, timingSafeEqual } from 'node:crypto'
import {
  DerbyTokenPayloadSchema,
  RaceTokenPayloadSchema,
  type DerbyTokenPayload,
  type RaceTokenPayload,
} from './schemas'

function b64urlEncode(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function b64urlDecode(input: string): Buffer {
  const pad = 4 - (input.length % 4)
  const padded = input + (pad < 4 ? '='.repeat(pad) : '')
  return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
}

function secret(): string {
  const s = process.env.RACE_SIGNING_SECRET
  if (!s) throw new Error('Missing RACE_SIGNING_SECRET')
  return s
}

function hmac(secretKey: string, message: string): Buffer {
  return createHmac('sha256', secretKey).update(message).digest()
}

export function signRaceToken(payload: RaceTokenPayload): string {
  const parsed = RaceTokenPayloadSchema.parse(payload)
  const body = b64urlEncode(JSON.stringify(parsed))
  const sig = b64urlEncode(hmac(secret(), body))
  return `${body}.${sig}`
}

export function verifyRaceToken(token: string): RaceTokenPayload | null {
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [body, sig] = parts
  const expected = hmac(secret(), body)
  const provided = b64urlDecode(sig)
  if (expected.length !== provided.length) return null
  if (!timingSafeEqual(expected, provided)) return null
  try {
    const json = JSON.parse(b64urlDecode(body).toString('utf8'))
    const parsed = RaceTokenPayloadSchema.safeParse(json)
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

// Derby tokens reuse the same HMAC secret. Cross-domain forgery is not
// viable because the schemas are structurally distinct: a derby payload
// requires `arena`, `vehicle`, and `configHash` fields that the loop
// payload does not have, so verifyRaceToken on a derby-signed body
// returns null at schema parse time, and vice versa.

export function signDerbyToken(payload: DerbyTokenPayload): string {
  const parsed = DerbyTokenPayloadSchema.parse(payload)
  const body = b64urlEncode(JSON.stringify(parsed))
  const sig = b64urlEncode(hmac(secret(), body))
  return `${body}.${sig}`
}

export function verifyDerbyToken(token: string): DerbyTokenPayload | null {
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [body, sig] = parts
  const expected = hmac(secret(), body)
  const provided = b64urlDecode(sig)
  if (expected.length !== provided.length) return null
  if (!timingSafeEqual(expected, provided)) return null
  try {
    const json = JSON.parse(b64urlDecode(body).toString('utf8'))
    const parsed = DerbyTokenPayloadSchema.safeParse(json)
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}
