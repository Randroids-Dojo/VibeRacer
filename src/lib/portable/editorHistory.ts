/**
 * Pure undo / redo helpers for the Track Editor.
 *
 * The component owns React state and keyboard wiring; this module is
 * responsible for the immutable stack math:
 *
 *  - `createHistory(initial)` seeds a fresh history with one present entry
 *    and no past or future.
 *  - `pushHistory(history, next)` records the current present onto the past
 *    stack, sets `next` as the new present, clears the redo stack, and caps
 *    the past length at `EDITOR_HISTORY_MAX_PAST` so a long editing session
 *    cannot grow without bound.
 *  - `undoHistory(history)` pops the most recent past entry into the
 *    present and pushes the prior present onto the future stack so it can
 *    be redone.
 *  - `redoHistory(history)` pops the most recent future entry into the
 *    present and pushes the prior present onto the past stack.
 *  - `canUndo` / `canRedo` are O(1) flags the toolbar reads to disable
 *    buttons.
 *
 * Equality: when the caller pushes a value that is reference-equal to the
 * current present, the helpers return the same history object. This keeps
 * an idempotent state-setter callsite (e.g. tapping erase on an already
 * empty cell) from polluting the past stack with no-op duplicates.
 *
 * Generic `T` lets the same helpers wrap pieces, mood, or any future
 * editor-managed value. The Track Editor wraps `Piece[]`.
 */

// Hard cap on the number of past states kept around. Each entry is a
// shallow `Piece[]` reference (the helpers in `src/game/editor.ts` already
// produce new arrays on every mutation), so 100 entries is well under any
// memory concern even on a 64-piece track.
export const EDITOR_HISTORY_MAX_PAST = 100

export interface EditorHistory<T> {
  past: T[]
  present: T
  future: T[]
}

export function createHistory<T>(initial: T): EditorHistory<T> {
  return { past: [], present: initial, future: [] }
}

export function canUndo<T>(history: EditorHistory<T>): boolean {
  return history.past.length > 0
}

export function canRedo<T>(history: EditorHistory<T>): boolean {
  return history.future.length > 0
}

export function pushHistory<T>(
  history: EditorHistory<T>,
  next: T,
): EditorHistory<T> {
  // No-op when the value did not actually change. Keeps the past stack
  // free of duplicates from idempotent setters.
  if (next === history.present) return history
  // Use spread + bracket push instead of `Array.prototype.concat` so an
  // array-typed `T` is not auto-flattened into the past stack.
  const past = [...history.past, history.present]
  // Drop the oldest entry once we exceed the cap. The cap is a safety net,
  // not a feature, so a player who hits it just loses access to the
  // earliest few states rather than blowing up memory.
  while (past.length > EDITOR_HISTORY_MAX_PAST) past.shift()
  return { past, present: next, future: [] }
}

export function undoHistory<T>(history: EditorHistory<T>): EditorHistory<T> {
  if (!canUndo(history)) return history
  const past = history.past.slice(0, -1)
  const present = history.past[history.past.length - 1]
  const future = [history.present, ...history.future]
  return { past, present, future }
}

export function redoHistory<T>(history: EditorHistory<T>): EditorHistory<T> {
  if (!canRedo(history)) return history
  const present = history.future[0]
  const future = history.future.slice(1)
  // Spread instead of concat so an array-typed `T` is not auto-flattened.
  const past = [...history.past, history.present]
  return { past, present, future }
}

/**
 * Replace the present without touching the past or future stacks.
 *
 * Used by the editor for ambient state syncs (e.g. clamping the override
 * after a piece removal) where recording the change as a separate undo
 * step would be confusing for the player.
 */
export function replacePresent<T>(
  history: EditorHistory<T>,
  next: T,
): EditorHistory<T> {
  if (next === history.present) return history
  return { past: history.past, present: next, future: history.future }
}

/**
 * Clear all history but keep the current present. Used after the editor
 * commits a save and the next editing session should start on a clean
 * undo stack rather than allowing an "undo" to revert a saved track to
 * something the player has not seen on the canvas in a while.
 */
export function resetHistory<T>(history: EditorHistory<T>): EditorHistory<T> {
  if (history.past.length === 0 && history.future.length === 0) return history
  return { past: [], present: history.present, future: [] }
}
