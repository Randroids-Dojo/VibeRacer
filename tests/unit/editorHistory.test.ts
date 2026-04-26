import { describe, it, expect } from 'vitest'
import {
  EDITOR_HISTORY_MAX_PAST,
  canRedo,
  canUndo,
  createHistory,
  pushHistory,
  redoHistory,
  replacePresent,
  resetHistory,
  undoHistory,
} from '@/game/editorHistory'

describe('createHistory', () => {
  it('seeds with the initial value as present and empty stacks', () => {
    const h = createHistory<number>(7)
    expect(h.present).toBe(7)
    expect(h.past).toEqual([])
    expect(h.future).toEqual([])
  })

  it('preserves the value reference', () => {
    const obj = { v: 1 }
    const h = createHistory(obj)
    expect(h.present).toBe(obj)
  })

  it('can-undo and can-redo are false on a fresh history', () => {
    const h = createHistory(0)
    expect(canUndo(h)).toBe(false)
    expect(canRedo(h)).toBe(false)
  })
})

describe('pushHistory', () => {
  it('records the prior present onto past and sets the new present', () => {
    const h0 = createHistory(1)
    const h1 = pushHistory(h0, 2)
    expect(h1.present).toBe(2)
    expect(h1.past).toEqual([1])
    expect(h1.future).toEqual([])
    expect(canUndo(h1)).toBe(true)
    expect(canRedo(h1)).toBe(false)
  })

  it('clears the future stack on a fresh push so a redo branch is dropped', () => {
    const h0 = createHistory(1)
    const h1 = pushHistory(h0, 2)
    const h2 = pushHistory(h1, 3)
    const h2Undone = undoHistory(h2)
    expect(h2Undone.future).toEqual([3])
    const h3 = pushHistory(h2Undone, 4)
    expect(h3.future).toEqual([])
    expect(h3.past).toEqual([1, 2])
    expect(h3.present).toBe(4)
  })

  it('returns the same history when the next value equals the current present (reference equality)', () => {
    const obj = { v: 1 }
    const h0 = createHistory(obj)
    const h1 = pushHistory(h0, obj)
    expect(h1).toBe(h0)
  })

  it('treats new objects with equal contents as a fresh push (value, not deep, equality)', () => {
    const a = { v: 1 }
    const b = { v: 1 }
    const h0 = createHistory(a)
    const h1 = pushHistory(h0, b)
    expect(h1).not.toBe(h0)
    expect(h1.present).toBe(b)
    expect(h1.past).toEqual([a])
  })

  it('does not mutate the input history', () => {
    const h0 = createHistory(1)
    const beforePast = h0.past
    const beforeFuture = h0.future
    pushHistory(h0, 2)
    expect(h0.present).toBe(1)
    expect(h0.past).toBe(beforePast)
    expect(h0.future).toBe(beforeFuture)
  })

  it('caps the past stack at EDITOR_HISTORY_MAX_PAST entries by dropping the oldest', () => {
    let h = createHistory(0)
    // Push enough values to overflow the cap. The first push records the
    // initial value, so total past size after N pushes is min(N, cap).
    const total = EDITOR_HISTORY_MAX_PAST + 5
    for (let i = 1; i <= total; i++) {
      h = pushHistory(h, i)
    }
    expect(h.present).toBe(total)
    expect(h.past.length).toBe(EDITOR_HISTORY_MAX_PAST)
    // The very first state (0) should have fallen off; the most recent
    // past entry is the prior present (total - 1).
    expect(h.past[h.past.length - 1]).toBe(total - 1)
    expect(h.past.includes(0)).toBe(false)
  })
})

describe('undoHistory', () => {
  it('moves the latest past entry into present and the prior present into future', () => {
    const h0 = createHistory(1)
    const h1 = pushHistory(h0, 2)
    const h2 = pushHistory(h1, 3)
    const undone = undoHistory(h2)
    expect(undone.present).toBe(2)
    expect(undone.past).toEqual([1])
    expect(undone.future).toEqual([3])
    expect(canUndo(undone)).toBe(true)
    expect(canRedo(undone)).toBe(true)
  })

  it('reaches the seed value with as many undos as pushes', () => {
    const h0 = createHistory(0)
    const h1 = pushHistory(h0, 1)
    const h2 = pushHistory(h1, 2)
    const u1 = undoHistory(h2)
    const u2 = undoHistory(u1)
    expect(u2.present).toBe(0)
    expect(u2.past).toEqual([])
    expect(u2.future).toEqual([1, 2])
    expect(canUndo(u2)).toBe(false)
    expect(canRedo(u2)).toBe(true)
  })

  it('returns the same history when there is nothing to undo', () => {
    const h = createHistory(5)
    expect(undoHistory(h)).toBe(h)
  })

  it('does not mutate the input history', () => {
    const h0 = pushHistory(createHistory(1), 2)
    const beforePast = h0.past
    undoHistory(h0)
    expect(h0.past).toBe(beforePast)
    expect(h0.present).toBe(2)
  })
})

describe('redoHistory', () => {
  it('replays the next future entry into present', () => {
    const h0 = createHistory(1)
    const h1 = pushHistory(h0, 2)
    const undone = undoHistory(h1)
    expect(undone.present).toBe(1)
    const redone = redoHistory(undone)
    expect(redone.present).toBe(2)
    expect(redone.past).toEqual([1])
    expect(redone.future).toEqual([])
  })

  it('returns the same history when there is nothing to redo', () => {
    const h = createHistory(5)
    expect(redoHistory(h)).toBe(h)
    const pushed = pushHistory(h, 6)
    expect(redoHistory(pushed)).toBe(pushed)
  })

  it('round-trips through the future stack in order', () => {
    let h = createHistory(0)
    h = pushHistory(h, 1)
    h = pushHistory(h, 2)
    h = pushHistory(h, 3)
    const u1 = undoHistory(h)
    const u2 = undoHistory(u1)
    const u3 = undoHistory(u2)
    expect(u3.present).toBe(0)
    expect(u3.future).toEqual([1, 2, 3])
    const r1 = redoHistory(u3)
    const r2 = redoHistory(r1)
    const r3 = redoHistory(r2)
    expect(r1.present).toBe(1)
    expect(r2.present).toBe(2)
    expect(r3.present).toBe(3)
    expect(r3.future).toEqual([])
  })

  it('does not mutate the input history', () => {
    const h0 = pushHistory(createHistory(1), 2)
    const undone = undoHistory(h0)
    const beforeFuture = undone.future
    redoHistory(undone)
    expect(undone.future).toBe(beforeFuture)
    expect(undone.present).toBe(1)
  })
})

describe('replacePresent', () => {
  it('swaps the present without touching the past or future stacks', () => {
    const h0 = pushHistory(createHistory(1), 2)
    const replaced = replacePresent(h0, 99)
    expect(replaced.present).toBe(99)
    expect(replaced.past).toBe(h0.past)
    expect(replaced.future).toBe(h0.future)
  })

  it('returns the same history when the new value matches by reference', () => {
    const obj = { v: 1 }
    const h = createHistory(obj)
    expect(replacePresent(h, obj)).toBe(h)
  })

  it('does not record a new undo step', () => {
    const h0 = createHistory(1)
    const replaced = replacePresent(h0, 2)
    expect(replaced.past).toEqual([])
    expect(canUndo(replaced)).toBe(false)
  })
})

describe('resetHistory', () => {
  it('clears past and future and keeps the current present', () => {
    let h = createHistory(0)
    h = pushHistory(h, 1)
    h = pushHistory(h, 2)
    const undone = undoHistory(h)
    expect(undone.future.length).toBe(1)
    const cleared = resetHistory(undone)
    expect(cleared.present).toBe(undone.present)
    expect(cleared.past).toEqual([])
    expect(cleared.future).toEqual([])
    expect(canUndo(cleared)).toBe(false)
    expect(canRedo(cleared)).toBe(false)
  })

  it('returns the same history when both stacks are already empty', () => {
    const h = createHistory(7)
    expect(resetHistory(h)).toBe(h)
  })
})

describe('integration', () => {
  it('models a typical edit / undo / redo / new-edit sequence', () => {
    let h = createHistory<string[]>([])
    h = pushHistory(h, ['straight'])
    h = pushHistory(h, ['straight', 'left90'])
    h = pushHistory(h, ['straight', 'left90', 'right90'])
    expect(h.present).toEqual(['straight', 'left90', 'right90'])

    h = undoHistory(h)
    expect(h.present).toEqual(['straight', 'left90'])
    expect(canRedo(h)).toBe(true)

    h = pushHistory(h, ['straight', 'left90', 'scurve'])
    expect(h.future).toEqual([])
    expect(h.past.length).toBe(3)
    expect(h.present).toEqual(['straight', 'left90', 'scurve'])

    h = undoHistory(h)
    h = undoHistory(h)
    h = undoHistory(h)
    expect(h.present).toEqual([])
    expect(canUndo(h)).toBe(false)
  })
})
