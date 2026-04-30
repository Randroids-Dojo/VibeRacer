'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { CarParams } from '@/game/physics'
import {
  TUNING_HISTORY_DEBOUNCE_MS,
  TUNING_HISTORY_KEY,
  type TuningChangeSource,
  type TuningHistoryEntry,
  appendStoredTuningHistory,
  diffParams,
  paramsEqual,
  readTuningHistory,
} from '@/lib/tuningHistory'

// Recorder for the tuning history audit log. Owns the in-memory list,
// hydrates from localStorage on mount, listens for cross-tab `storage` events
// (read-only refresh, never appends so a self-echo from another tab does not
// double-count), and debounces slider sources so a single drag becomes one
// entry instead of hundreds.

export interface RecordChangeArgs {
  next: CarParams
  source: TuningChangeSource
  label?: string | null
  slug: string
  // Bypass the slider-debounce. Used for discrete intents (saved-applied,
  // recommended, reset, imported, leaderboard, historyRevert).
  immediate?: boolean
}

interface PendingSliderEntry {
  next: CarParams
  prevParams: CarParams | null
  source: TuningChangeSource
  label: string | null
  slug: string
  changedAt: number
}

export function useTuningRecorder(): {
  history: TuningHistoryEntry[]
  hydrated: boolean
  record: (args: RecordChangeArgs) => void
  flush: () => void
} {
  const [history, setHistory] = useState<TuningHistoryEntry[]>([])
  const [hydrated, setHydrated] = useState(false)

  // Tracks the previous-params snapshot per slug so the diff is correct even
  // when the player toggles between tracks in the same session.
  const prevParamsBySlug = useRef<Map<string, CarParams>>(new Map())
  const pendingRef = useRef<PendingSliderEntry | null>(null)
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    setHistory(readTuningHistory())
    setHydrated(true)
  }, [])

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== TUNING_HISTORY_KEY) return
      // Cross-tab updates: refresh the in-memory copy without appending. The
      // tab that produced the change is responsible for its own append.
      setHistory(readTuningHistory())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // Emit any pending debounced slider entry now. Safe to call when there is
  // nothing pending (no-op).
  const flush = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
    const pending = pendingRef.current
    if (!pending) return
    pendingRef.current = null
    const next = appendStoredTuningHistory(
      {
        params: pending.next,
        source: pending.source,
        label: pending.label,
        slug: pending.slug,
        changedAt: pending.changedAt,
        changedKeys: diffParams(pending.prevParams, pending.next),
      },
      pending.prevParams,
    )
    setHistory(next)
    prevParamsBySlug.current.set(pending.slug, pending.next)
  }, [])

  const record = useCallback(
    (args: RecordChangeArgs) => {
      const slug = args.slug
      const prev = prevParamsBySlug.current.get(slug) ?? null
      // Skip no-op writes regardless of source: if the params landed at the
      // same place as the previous record on this slug, there is nothing to
      // log. This collapses repeated reset clicks and "apply current saved
      // tuning again" double-taps.
      if (prev && paramsEqual(prev, args.next)) return

      const isSlider = args.source === 'slider' && !args.immediate

      if (!isSlider) {
        // Discrete intent. Flush any pending slider drag first so the order
        // in the log reflects the order the player produced events. Then
        // append immediately.
        if (pendingRef.current) flush()
        const result = appendStoredTuningHistory(
          {
            params: args.next,
            source: args.source,
            label: args.label ?? null,
            slug,
            changedKeys: diffParams(prev, args.next),
          },
          prev,
        )
        setHistory(result)
        prevParamsBySlug.current.set(slug, args.next)
        return
      }

      // Slider source: stash a pending entry, replacing any prior pending
      // entry for the same slug (the user is mid-drag). The `prevParams` is
      // captured once at the start of the drag, not on every tick, so the
      // final delta reads as "+max speed 26 to 30" rather than the last
      // single-tick delta of "+max speed 29.5 to 30".
      const existing = pendingRef.current
      pendingRef.current = {
        next: args.next,
        prevParams: existing ? existing.prevParams : prev,
        source: args.source,
        label: args.label ?? null,
        slug,
        changedAt: Date.now(),
      }
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null
        flush()
      }, TUNING_HISTORY_DEBOUNCE_MS)
    },
    [flush],
  )

  // Always flush a pending slider entry on unmount so a half-finished drag
  // does not vanish if the player navigates away.
  useEffect(() => {
    return () => {
      if (pendingRef.current) {
        // Synchronous flush: write directly to storage without going through
        // the React state setter, since the component is unmounting.
        const pending = pendingRef.current
        if (timerRef.current !== null) {
          window.clearTimeout(timerRef.current)
          timerRef.current = null
        }
        pendingRef.current = null
        appendStoredTuningHistory(
          {
            params: pending.next,
            source: pending.source,
            label: pending.label,
            slug: pending.slug,
            changedAt: pending.changedAt,
            changedKeys: diffParams(pending.prevParams, pending.next),
          },
          pending.prevParams,
        )
      }
    }
  }, [])

  return { history, hydrated, record, flush }
}
