import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  PHOTO_FILENAME_PREFIX,
  PHOTO_JPG_QUALITY,
  buildPhotoFilename,
  downloadDataUrl,
  extensionForFormat,
  formatPhotoTimestamp,
  mimeForFormat,
  sanitizeSlugForFilename,
} from '@/lib/photoMode'

describe('photoMode mime + extension helpers', () => {
  it('maps png and jpg to the right MIME type', () => {
    expect(mimeForFormat('png')).toBe('image/png')
    expect(mimeForFormat('jpg')).toBe('image/jpeg')
  })

  it('maps png and jpg to the right file extension', () => {
    expect(extensionForFormat('png')).toBe('png')
    expect(extensionForFormat('jpg')).toBe('jpg')
  })

  it('exposes a sane JPG quality (0..1, leans high)', () => {
    expect(PHOTO_JPG_QUALITY).toBeGreaterThan(0)
    expect(PHOTO_JPG_QUALITY).toBeLessThanOrEqual(1)
    expect(PHOTO_JPG_QUALITY).toBeGreaterThanOrEqual(0.8)
  })
})

describe('sanitizeSlugForFilename', () => {
  it('passes a clean kebab slug through unchanged', () => {
    expect(sanitizeSlugForFilename('monaco')).toBe('monaco')
    expect(sanitizeSlugForFilename('my-track-2')).toBe('my-track-2')
  })

  it('lowercases mixed-case input', () => {
    expect(sanitizeSlugForFilename('MyTrack')).toBe('mytrack')
  })

  it('strips path separators and unsafe punctuation', () => {
    expect(sanitizeSlugForFilename('foo/bar')).toBe('foobar')
    expect(sanitizeSlugForFilename('foo bar')).toBe('foobar')
    expect(sanitizeSlugForFilename('foo.bar')).toBe('foobar')
    expect(sanitizeSlugForFilename('foo\\bar')).toBe('foobar')
  })

  it('strips leading and trailing dashes', () => {
    expect(sanitizeSlugForFilename('--track--')).toBe('track')
  })

  it('caps length at 48 characters', () => {
    const long = 'a'.repeat(200)
    expect(sanitizeSlugForFilename(long).length).toBe(48)
  })

  it('returns "track" fallback for empty / unsafe input', () => {
    expect(sanitizeSlugForFilename('')).toBe('track')
    expect(sanitizeSlugForFilename('!!!')).toBe('track')
    expect(sanitizeSlugForFilename('---')).toBe('track')
  })

  it('returns "track" fallback for non-string input (defensive)', () => {
    expect(sanitizeSlugForFilename(null as unknown as string)).toBe('track')
    expect(sanitizeSlugForFilename(undefined as unknown as string)).toBe(
      'track',
    )
    expect(sanitizeSlugForFilename(42 as unknown as string)).toBe('track')
  })
})

describe('formatPhotoTimestamp', () => {
  it('formats year/month/day-hour/minute/second with zero padding', () => {
    // Jan 5, 2026, 03:04:05 local time. Use a fixed Date so the test does
    // not flake across timezones.
    const d = new Date(2026, 0, 5, 3, 4, 5)
    expect(formatPhotoTimestamp(d)).toBe('20260105-030405')
  })

  it('pads two-digit fields up to 11/30/23:59:59', () => {
    const d = new Date(2026, 10, 30, 23, 59, 59)
    expect(formatPhotoTimestamp(d)).toBe('20261130-235959')
  })

  it('produces strings that sort chronologically', () => {
    const a = formatPhotoTimestamp(new Date(2026, 0, 5, 3, 4, 5))
    const b = formatPhotoTimestamp(new Date(2026, 0, 5, 3, 4, 6))
    const c = formatPhotoTimestamp(new Date(2026, 0, 5, 3, 5, 0))
    expect(a < b).toBe(true)
    expect(b < c).toBe(true)
  })

  it('always emits exactly 15 characters (8 + 1 + 6)', () => {
    expect(formatPhotoTimestamp(new Date(2000, 0, 1, 0, 0, 0))).toHaveLength(15)
    expect(formatPhotoTimestamp(new Date(2099, 11, 31, 23, 59, 59))).toHaveLength(
      15,
    )
  })
})

describe('buildPhotoFilename', () => {
  const date = new Date(2026, 3, 26, 14, 30, 55)

  it('combines prefix, sanitized slug, timestamp, and extension', () => {
    expect(buildPhotoFilename('monaco', 'png', date)).toBe(
      'viberacer-monaco-20260426-143055.png',
    )
    expect(buildPhotoFilename('monaco', 'jpg', date)).toBe(
      'viberacer-monaco-20260426-143055.jpg',
    )
  })

  it('sanitizes hostile slugs', () => {
    expect(buildPhotoFilename('My Track/Name', 'png', date)).toBe(
      'viberacer-mytrackname-20260426-143055.png',
    )
  })

  it('falls back when slug is empty', () => {
    expect(buildPhotoFilename('', 'png', date)).toBe(
      'viberacer-track-20260426-143055.png',
    )
  })

  it('uses the well-known prefix', () => {
    const out = buildPhotoFilename('demo', 'png', date)
    expect(out.startsWith(`${PHOTO_FILENAME_PREFIX}-`)).toBe(true)
  })
})

interface FakeAnchor {
  href: string
  download: string
  style: { display: string }
  clicked: number
  removed: boolean
  click(): void
  remove(): void
}

describe('downloadDataUrl', () => {
  const originalDocument = (globalThis as { document?: unknown }).document
  const originalSetTimeout = globalThis.setTimeout
  let appended: FakeAnchor[]

  beforeEach(() => {
    appended = []
    const fakeDocument = {
      createElement: (tag: string): FakeAnchor => {
        if (tag !== 'a') throw new Error(`unexpected tag ${tag}`)
        const a: FakeAnchor = {
          href: '',
          download: '',
          style: { display: '' },
          clicked: 0,
          removed: false,
          click() {
            this.clicked += 1
          },
          remove() {
            this.removed = true
          },
        }
        return a
      },
      body: {
        appendChild: (a: FakeAnchor) => {
          appended.push(a)
          return a
        },
      },
    }
    ;(globalThis as { document?: unknown }).document = fakeDocument
    // Run the cleanup callback synchronously so we can assert anchor.remove().
    ;(globalThis as { setTimeout: typeof setTimeout }).setTimeout = ((
      fn: () => void,
    ) => {
      fn()
      return 0 as unknown as ReturnType<typeof setTimeout>
    }) as typeof setTimeout
  })

  afterEach(() => {
    if (originalDocument === undefined) {
      delete (globalThis as { document?: unknown }).document
    } else {
      ;(globalThis as { document?: unknown }).document = originalDocument
    }
    globalThis.setTimeout = originalSetTimeout
  })

  it('returns false on null / empty data URL', () => {
    expect(downloadDataUrl(null, 'foo.png')).toBe(false)
    expect(downloadDataUrl('', 'foo.png')).toBe(false)
    expect(downloadDataUrl(undefined, 'foo.png')).toBe(false)
  })

  it('creates an anchor, sets href and download, clicks, and cleans up', () => {
    const ok = downloadDataUrl('data:image/png;base64,abc', 'shot.png')
    expect(ok).toBe(true)
    expect(appended).toHaveLength(1)
    const a = appended[0]
    expect(a.href).toBe('data:image/png;base64,abc')
    expect(a.download).toBe('shot.png')
    expect(a.clicked).toBe(1)
    expect(a.removed).toBe(true)
  })

  it('returns false when there is no document (SSR)', () => {
    delete (globalThis as { document?: unknown }).document
    expect(downloadDataUrl('data:image/png;base64,abc', 'shot.png')).toBe(false)
  })
})
