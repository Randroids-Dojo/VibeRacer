import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  buildSharePayload,
  buildShareText,
  buildShareUrl,
  formatLapTime,
  shareOrCopy,
  type SharePayload,
  type ShareInputs,
} from '@/lib/share'

describe('share helpers', () => {
  describe('formatLapTime', () => {
    it('formats whole seconds with leading zeros', () => {
      expect(formatLapTime(0)).toBe('00:00.000')
      expect(formatLapTime(1234)).toBe('00:01.234')
      expect(formatLapTime(60_000)).toBe('01:00.000')
      expect(formatLapTime(123_456)).toBe('02:03.456')
    })

    it('returns a placeholder for invalid input', () => {
      expect(formatLapTime(Number.NaN)).toBe('--:--.---')
      expect(formatLapTime(-5)).toBe('--:--.---')
    })
  })

  describe('buildShareUrl', () => {
    it('always pins the version hash so recipients race the same track', () => {
      const url = buildShareUrl({
        origin: 'https://viberacer.app',
        slug: 'my-loop',
        versionHash: 'abc123',
      })
      expect(url).toBe('https://viberacer.app/my-loop?v=abc123')
    })

    it('strips trailing slashes from the origin', () => {
      const url = buildShareUrl({
        origin: 'https://viberacer.app/',
        slug: 'loop',
        versionHash: 'h',
      })
      expect(url).toBe('https://viberacer.app/loop?v=h')
    })

    it('encodes slug characters that need escaping', () => {
      const url = buildShareUrl({
        origin: 'https://x',
        slug: 'a b',
        versionHash: 'h',
      })
      expect(url).toBe('https://x/a%20b?v=h')
    })
  })

  describe('buildShareText', () => {
    const base: ShareInputs = {
      origin: 'https://x',
      slug: 'loop',
      versionHash: 'h',
      bestMs: null,
      record: null,
      initials: null,
    }

    it('omits the PB line when there is no best yet', () => {
      const text = buildShareText(base)
      expect(text).toContain('Race me on /loop')
      expect(text).not.toContain(':')
    })

    it('mentions initials and PB when present', () => {
      const text = buildShareText({
        ...base,
        bestMs: 73_456,
        initials: 'RAL',
      })
      expect(text).toContain('RAL ran 01:13.456 on /loop')
    })

    it('includes the track record when known', () => {
      const text = buildShareText({
        ...base,
        bestMs: 80_000,
        initials: 'AAA',
        record: { initials: 'ZZZ', lapTimeMs: 60_000 },
      })
      expect(text).toContain('Track record: ZZZ 01:00.000')
    })
  })

  describe('buildSharePayload', () => {
    it('combines title, text, and url for the Web Share API', () => {
      const payload = buildSharePayload({
        origin: 'https://x',
        slug: 'loop',
        versionHash: 'h',
        bestMs: 60_000,
        record: null,
        initials: 'AAA',
      })
      expect(payload.title).toBe('VibeRacer / loop')
      expect(payload.url).toBe('https://x/loop?v=h')
      expect(payload.text).toContain('AAA ran 01:00.000')
    })
  })
})

describe('shareOrCopy', () => {
  const payload: SharePayload = {
    title: 'VibeRacer / loop',
    text: 'AAA ran 01:00.000 on /loop in VibeRacer. Can you beat it?',
    url: 'https://x/loop?v=h',
  }

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns "shared" when navigator.share resolves', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { share })
    const outcome = await shareOrCopy(payload)
    expect(outcome).toBe('shared')
    expect(share).toHaveBeenCalledWith(payload)
  })

  it('returns "cancelled" when the share sheet is dismissed', async () => {
    const share = vi.fn().mockRejectedValue(
      Object.assign(new Error('cancelled'), { name: 'AbortError' }),
    )
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { share, clipboard: { writeText } })
    const outcome = await shareOrCopy(payload)
    expect(outcome).toBe('cancelled')
    expect(writeText).not.toHaveBeenCalled()
  })

  it('falls back to clipboard when navigator.share is missing', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const outcome = await shareOrCopy(payload)
    expect(outcome).toBe('copied')
    expect(writeText).toHaveBeenCalledWith(`${payload.text} ${payload.url}`)
  })

  it('falls back to clipboard when share rejects with a non-abort error', async () => {
    const share = vi.fn().mockRejectedValue(new Error('not allowed'))
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { share, clipboard: { writeText } })
    const outcome = await shareOrCopy(payload)
    expect(outcome).toBe('copied')
  })

  it('returns "failed" when neither share nor clipboard are available', async () => {
    vi.stubGlobal('navigator', {})
    const outcome = await shareOrCopy(payload)
    expect(outcome).toBe('failed')
  })

  it('returns "failed" when clipboard write rejects', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('blocked'))
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const outcome = await shareOrCopy(payload)
    expect(outcome).toBe('failed')
  })
})
