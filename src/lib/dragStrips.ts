import { z } from 'zod'
import { CELL_SIZE } from '@/game/cellSize'
import {
  TrackBiomeSchema,
  type Piece,
  type Track,
  type TrackCheckpoint,
} from './schemas'
import { TimeOfDaySchema, type TimeOfDay } from './lighting'
import { WeatherSchema, type Weather } from './weather'
import type { TrackBiome } from './biomes'
import {
  verticalProfileFromNormalized,
  type VerticalProfile,
} from '@/game/dragVerticalProfile'
import type { SurfaceKey } from './dragParts'

// Drag racing strip catalog. Four predefined strips, each a chain of straight
// pieces in the (row, col) grid plus a vertical profile that gives the strip
// its visible hill shape. The vertical profile lives only on this config: it
// is not part of the persisted Track schema, so closed-loop tracks and their
// leaderboards remain entirely unaffected. Each strip's own leaderboard is
// keyed by `kvKeys.leaderboard(slug, dragStripVersionHash(strip))`; tweaking
// any stable field of the config (length, biome, weather, profile keyframes)
// rotates the version hash and retires the prior board cleanly. Cosmetic
// fields are excluded from the hash so visual polish does not wipe times.

export const DRAG_STRIP_SLUGS = [
  'salt-flats',
  'coastal-strip',
  'alpine-pass',
  'harbor-night',
] as const

export const DragStripSlugSchema = z.enum(DRAG_STRIP_SLUGS)
export type DragStripSlug = z.infer<typeof DragStripSlugSchema>

const DRAG_STRIP_FORMAT_VERSION = 1

export interface DragStripConfig {
  slug: DragStripSlug
  displayName: string
  // Number of cells along the strip. The strip is laid out at column 0 with
  // rows 0 through -(lengthCells - 1); pieces[0] is the start piece. Each
  // cell is CELL_SIZE world units; the world length is lengthCells * CELL_SIZE.
  lengthCells: number
  biome: TrackBiome
  weather: Weather
  timeOfDay: TimeOfDay
  // Vertical profile keyframes scaled to the strip's world length. Built from
  // a normalized helper so configs read in fractions of the strip.
  verticalProfile: VerticalProfile
  // Short blurb shown on the strip card.
  blurb: string
}

function stripWorldLength(lengthCells: number): number {
  return lengthCells * CELL_SIZE
}

const SALT_FLATS_LENGTH = 40
const COASTAL_LENGTH = 24
const ALPINE_LENGTH = 30
const HARBOR_LENGTH = 20

const SALT_FLATS_PROFILE = verticalProfileFromNormalized(
  stripWorldLength(SALT_FLATS_LENGTH),
  [
    { sFrac: 0, height: 0 },
    { sFrac: 1, height: 0 },
  ],
)

const COASTAL_PROFILE = verticalProfileFromNormalized(
  stripWorldLength(COASTAL_LENGTH),
  [
    { sFrac: 0, height: 0 },
    { sFrac: 0.25, height: 2 },
    { sFrac: 0.5, height: 0 },
    { sFrac: 0.75, height: -2 },
    { sFrac: 1, height: 0 },
  ],
)

const ALPINE_PROFILE = verticalProfileFromNormalized(
  stripWorldLength(ALPINE_LENGTH),
  [
    { sFrac: 0, height: 0 },
    { sFrac: 0.5, height: 3 },
    { sFrac: 1, height: 6 },
  ],
)

const HARBOR_PROFILE = verticalProfileFromNormalized(
  stripWorldLength(HARBOR_LENGTH),
  [
    { sFrac: 0, height: 0 },
    { sFrac: 0.85, height: -4 },
    { sFrac: 1, height: -3.6 },
  ],
)

export const DRAG_STRIPS: Record<DragStripSlug, DragStripConfig> = {
  'salt-flats': {
    slug: 'salt-flats',
    displayName: 'Salt Flats Mile',
    lengthCells: SALT_FLATS_LENGTH,
    biome: 'desert',
    weather: 'clear',
    timeOfDay: 'noon',
    verticalProfile: SALT_FLATS_PROFILE,
    blurb: 'Long flat strip baking under midday sun. Top end wins.',
  },
  'coastal-strip': {
    slug: 'coastal-strip',
    displayName: 'Coastal Strip',
    lengthCells: COASTAL_LENGTH,
    biome: 'beach',
    weather: 'cloudy',
    timeOfDay: 'morning',
    verticalProfile: COASTAL_PROFILE,
    blurb: 'Rolling dunes on a damp morning. Torque and rebound matter.',
  },
  'alpine-pass': {
    slug: 'alpine-pass',
    displayName: 'Alpine Pass',
    lengthCells: ALPINE_LENGTH,
    biome: 'mountains',
    weather: 'snowy',
    timeOfDay: 'dawn',
    verticalProfile: ALPINE_PROFILE,
    blurb: 'Steady climb through snowfall. Save weight, gear short.',
  },
  'harbor-night': {
    slug: 'harbor-night',
    displayName: 'Harbor Night Run',
    lengthCells: HARBOR_LENGTH,
    biome: 'city',
    weather: 'rainy',
    timeOfDay: 'night',
    verticalProfile: HARBOR_PROFILE,
    blurb: 'Wet downhill through the docks with a kicker before the line.',
  },
}

export function dragStripPieces(strip: DragStripConfig): Piece[] {
  const pieces: Piece[] = []
  for (let i = 0; i < strip.lengthCells; i++) {
    pieces.push({
      type: 'straight',
      row: i === 0 ? 0 : -i,
      col: 0,
      rotation: 0,
    })
  }
  return pieces
}

export function dragStripCheckpoints(
  strip: DragStripConfig,
): TrackCheckpoint[] {
  const last = strip.lengthCells - 1
  // Three checkpoints: a 60ft-equivalent split near the start, a midpoint
  // split, and the finish. None can land on the start piece (row 0). Indices
  // are clamped so very short strips still produce three distinct rows.
  const sixtyFt = Math.max(2, Math.min(last - 2, 2))
  const midpoint = Math.max(sixtyFt + 1, Math.floor(last / 2))
  const finish = last
  return [
    { row: -sixtyFt, col: 0 },
    { row: -midpoint, col: 0 },
    { row: -finish, col: 0 },
  ]
}

export function dragStripToTrack(strip: DragStripConfig): Track {
  return {
    pieces: dragStripPieces(strip),
    checkpoints: dragStripCheckpoints(strip),
    biome: strip.biome,
    mood: {
      timeOfDay: strip.timeOfDay,
      weather: strip.weather,
    },
  }
}

// Canonical bytes that the version hash is computed from. Exposed so the
// hash implementation can live in a separate environment-aware module
// (`dragStripVersionHash`) without re-deriving the canonical shape.
export function dragStripVersionPayload(strip: DragStripConfig): string {
  const payload = {
    formatVersion: DRAG_STRIP_FORMAT_VERSION,
    slug: strip.slug,
    lengthCells: strip.lengthCells,
    biome: strip.biome,
    weather: strip.weather,
    timeOfDay: strip.timeOfDay,
    verticalProfile: strip.verticalProfile.map((k) => ({
      s: k.s,
      height: k.height,
    })),
  }
  return JSON.stringify(payload)
}

// Synchronous SHA-256 of an ASCII string. Works in both Node and the
// browser bundle: tries `node:crypto` via `globalThis.process` to stay
// out of the webpack import graph, otherwise falls back to a pure-JS
// implementation of FIPS 180-4. The hashes are short and computed once
// per strip so the JS path is fine on the client even though it would
// be slower for hashing megabytes of data.
export function dragStripVersionHash(strip: DragStripConfig): string {
  return sha256Hex(dragStripVersionPayload(strip))
}

function sha256Hex(input: string): string {
  // Pure JS SHA-256. Adapted from FIPS 180-4. Avoids `node:crypto` so the
  // browser bundle does not need a polyfill, and matches Node's hex output
  // bit for bit.
  const bytes = utf8ToBytes(input)
  const padded = padMessage(bytes)
  const H = [
    0x6a09e667,
    0xbb67ae85,
    0x3c6ef372,
    0xa54ff53a,
    0x510e527f,
    0x9b05688c,
    0x1f83d9ab,
    0x5be0cd19,
  ]
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
    0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
    0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
    0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
    0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
    0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]
  const W = new Uint32Array(64)
  const blocks = padded.length / 64
  for (let block = 0; block < blocks; block++) {
    const off = block * 64
    for (let i = 0; i < 16; i++) {
      const j = off + i * 4
      W[i] =
        ((padded[j] << 24) |
          (padded[j + 1] << 16) |
          (padded[j + 2] << 8) |
          padded[j + 3]) >>>
        0
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(W[i - 15], 7) ^ rotr(W[i - 15], 18) ^ (W[i - 15] >>> 3)
      const s1 = rotr(W[i - 2], 17) ^ rotr(W[i - 2], 19) ^ (W[i - 2] >>> 10)
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0
    }
    let a = H[0], b = H[1], c = H[2], d = H[3]
    let e = H[4], f = H[5], g = H[6], h = H[7]
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)
      const ch = (e & f) ^ (~e & g)
      const temp1 = (h + S1 + ch + K[i] + W[i]) >>> 0
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)
      const mj = (a & b) ^ (a & c) ^ (b & c)
      const temp2 = (S0 + mj) >>> 0
      h = g
      g = f
      f = e
      e = (d + temp1) >>> 0
      d = c
      c = b
      b = a
      a = (temp1 + temp2) >>> 0
    }
    H[0] = (H[0] + a) >>> 0
    H[1] = (H[1] + b) >>> 0
    H[2] = (H[2] + c) >>> 0
    H[3] = (H[3] + d) >>> 0
    H[4] = (H[4] + e) >>> 0
    H[5] = (H[5] + f) >>> 0
    H[6] = (H[6] + g) >>> 0
    H[7] = (H[7] + h) >>> 0
  }
  return H.map(toHex).join('')
}

function rotr(x: number, n: number): number {
  return ((x >>> n) | (x << (32 - n))) >>> 0
}

function toHex(n: number): string {
  return n.toString(16).padStart(8, '0')
}

function utf8ToBytes(input: string): Uint8Array {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(input)
  }
  // Node 18+ ships TextEncoder globally so this branch is rarely hit.
  const bytes: number[] = []
  for (let i = 0; i < input.length; i++) {
    let code = input.charCodeAt(i)
    if (code < 0x80) bytes.push(code)
    else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f))
    } else if ((code & 0xfc00) === 0xd800 && i + 1 < input.length) {
      const next = input.charCodeAt(i + 1)
      if ((next & 0xfc00) === 0xdc00) {
        code = 0x10000 + ((code & 0x3ff) << 10) + (next & 0x3ff)
        bytes.push(
          0xf0 | (code >> 18),
          0x80 | ((code >> 12) & 0x3f),
          0x80 | ((code >> 6) & 0x3f),
          0x80 | (code & 0x3f),
        )
        i++
      } else {
        bytes.push(0xef, 0xbf, 0xbd)
      }
    } else {
      bytes.push(
        0xe0 | (code >> 12),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      )
    }
  }
  return new Uint8Array(bytes)
}

function padMessage(bytes: Uint8Array): Uint8Array {
  const bitLen = bytes.length * 8
  const totalLen = Math.ceil((bytes.length + 9) / 64) * 64
  const padded = new Uint8Array(totalLen)
  padded.set(bytes)
  padded[bytes.length] = 0x80
  // Length is appended as a big-endian 64-bit int. JS numbers cap at 2^53,
  // and the input string is short enough here that the high 32 bits stay 0.
  padded[totalLen - 4] = (bitLen >>> 24) & 0xff
  padded[totalLen - 3] = (bitLen >>> 16) & 0xff
  padded[totalLen - 2] = (bitLen >>> 8) & 0xff
  padded[totalLen - 1] = bitLen & 0xff
  return padded
}

// Pick the surface key the tire affinity table is keyed by, given the strip's
// biome and weather. A drag tire's per-surface multiplier is then looked up
// against this key. The mapping is intentionally simple: weather wins when it
// is decisive (rain implies wet, snow implies snow), otherwise the biome
// supplies the fallback (desert -> sand, beach -> dry, others -> dry). Future
// strips can map to other surface keys without expanding the catalog.
export function surfaceFromBiomeWeather(
  strip: Pick<DragStripConfig, 'biome' | 'weather'>,
): SurfaceKey {
  const { biome, weather } = strip
  if (weather === 'rainy' || weather === 'foggy') return 'wet'
  if (weather === 'snowy') return 'snow'
  if (biome === 'desert') return 'sand'
  if (biome === 'snow') return 'snow'
  return 'dry'
}

export const ALL_DRAG_STRIPS: readonly DragStripConfig[] = DRAG_STRIP_SLUGS.map(
  (slug) => DRAG_STRIPS[slug],
)

// Re-export the schemas so route handlers can validate without importing
// from multiple files.
export { TrackBiomeSchema, TimeOfDaySchema, WeatherSchema }
