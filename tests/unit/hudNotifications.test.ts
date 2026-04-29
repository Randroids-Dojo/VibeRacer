import { describe, expect, it } from 'vitest'
import { selectHudNotificationStack } from '@/lib/hudNotifications'

describe('selectHudNotificationStack', () => {
  it('keeps the highest-priority entries within the slot limit', () => {
    const out = selectHudNotificationStack([
      { id: 'split', priority: 20, createdAtMs: 1, payload: 'split' },
      { id: 'toast', priority: 50, createdAtMs: 2, payload: 'toast' },
      { id: 'reaction', priority: 30, createdAtMs: 3, payload: 'reaction' },
    ])
    expect(out.map((entry) => entry.id)).toEqual(['toast', 'reaction'])
  })

  it('uses newest first when priorities tie', () => {
    const out = selectHudNotificationStack([
      { id: 'old', priority: 10, createdAtMs: 1, payload: null },
      { id: 'new', priority: 10, createdAtMs: 3, payload: null },
      { id: 'mid', priority: 10, createdAtMs: 2, payload: null },
    ])
    expect(out.map((entry) => entry.id)).toEqual(['new', 'mid'])
  })

  it('returns no entries for invalid slot counts or invalid priorities', () => {
    expect(selectHudNotificationStack([], 2)).toEqual([])
    expect(
      selectHudNotificationStack([
        { id: 'bad', priority: Number.NaN, createdAtMs: 1, payload: null },
      ]),
    ).toEqual([])
    expect(
      selectHudNotificationStack([
        { id: 'ok', priority: 1, createdAtMs: 1, payload: null },
      ], 0),
    ).toEqual([])
  })
})
