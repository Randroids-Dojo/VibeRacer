import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  INITIALS_EVENT,
  INITIALS_STORAGE_KEY,
  readStoredInitials,
  writeStoredInitials,
} from '@/lib/initials'

interface FakeWindow {
  localStorage: {
    getItem: (k: string) => string | null
    setItem: (k: string, v: string) => void
    removeItem: (k: string) => void
    clear: () => void
  }
  dispatchEvent: (e: Event) => boolean
  CustomEvent: typeof CustomEvent
}

describe('initials storage', () => {
  const originalWindow = (globalThis as { window?: unknown }).window
  let store: Record<string, string>
  let dispatched: Array<{ type: string; detail: unknown }>

  beforeEach(() => {
    store = {}
    dispatched = []
    const fakeWindow: FakeWindow = {
      localStorage: {
        getItem: (k) => (k in store ? store[k] : null),
        setItem: (k, v) => {
          store[k] = v
        },
        removeItem: (k) => {
          delete store[k]
        },
        clear: () => {
          store = {}
        },
      },
      dispatchEvent: (e: Event) => {
        const ce = e as CustomEvent
        dispatched.push({ type: ce.type, detail: ce.detail })
        return true
      },
      CustomEvent: globalThis.CustomEvent ?? class CustomEventPolyfill<T> {
        type: string
        detail: T
        constructor(type: string, init: { detail: T }) {
          this.type = type
          this.detail = init.detail
        }
      } as unknown as typeof CustomEvent,
    }
    ;(globalThis as { window?: unknown }).window = fakeWindow
  })

  afterEach(() => {
    if (originalWindow === undefined) {
      delete (globalThis as { window?: unknown }).window
    } else {
      ;(globalThis as { window?: unknown }).window = originalWindow
    }
  })

  it('returns null when storage is empty', () => {
    expect(readStoredInitials()).toBeNull()
  })

  it('returns null for malformed values', () => {
    store[INITIALS_STORAGE_KEY] = 'AB1'
    expect(readStoredInitials()).toBeNull()
    store[INITIALS_STORAGE_KEY] = 'TOOLONG'
    expect(readStoredInitials()).toBeNull()
  })

  it('uppercases and reads back what was written', () => {
    writeStoredInitials('xyz')
    expect(store[INITIALS_STORAGE_KEY]).toBe('xyz')
    // The schema uppercases on read.
    expect(readStoredInitials()).toBe('XYZ')
  })

  it('dispatches the INITIALS_EVENT with the new value when writing', () => {
    writeStoredInitials('ABC')
    expect(dispatched).toHaveLength(1)
    expect(dispatched[0].type).toBe(INITIALS_EVENT)
    expect(dispatched[0].detail).toBe('ABC')
  })
})
