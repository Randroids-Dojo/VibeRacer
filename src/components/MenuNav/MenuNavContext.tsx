'use client'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'
import { useMenuGamepadNav } from './useMenuGamepadNav'

// Cross-module flag the racing input hooks read so a focused menu does not
// leak Space (handbrake) / W (forward) into the physics tick.
let menuNavOpenCount = 0
export function isMenuNavOpen(): boolean {
  return menuNavOpenCount > 0
}

export type FocusAxis = 'vertical' | 'horizontal' | 'both'

export interface FocusableEntry {
  id: string
  ref: RefObject<HTMLElement | null>
  axis: FocusAxis
  group?: string
  order?: number
  onActivate?: () => void
  disabled?: boolean
}

export interface MenuNavApi {
  register: (entry: FocusableEntry) => () => void
  focusFirst: () => void
  focusEntry: (id: string) => void
  move: (dir: 'up' | 'down' | 'left' | 'right' | 'next' | 'prev') => void
  activate: () => void
  back: () => void
  isTop: boolean
  // Set true while a key-capture flow is running (e.g. SettingsPane's rebind
  // prompt). The provider stops handling navigation while this is true so the
  // user's keypress reaches the capture handler intact.
  setSuppressed: (suppressed: boolean) => void
}

const MenuNavContext = createContext<MenuNavApi | null>(null)

export function useMenuNav(): MenuNavApi | null {
  return useContext(MenuNavContext)
}

interface MenuNavProviderProps {
  children: ReactNode
  onBack?: () => void
  onTabPrev?: () => void
  onTabNext?: () => void
  // When provided focus is restored to this element on unmount. Falls back to
  // the document.activeElement at mount time.
  returnFocus?: RefObject<HTMLElement | null>
  autoFocus?: boolean
}

let providerStack: { setIsTop: (top: boolean) => void; instance: number }[] = []
let providerCounter = 0

export function MenuNavProvider({
  children,
  onBack,
  onTabPrev,
  onTabNext,
  returnFocus,
  autoFocus = true,
}: MenuNavProviderProps) {
  const entriesRef = useRef<Map<string, FocusableEntry>>(new Map())
  const [isTop, setIsTop] = useState(true)
  const suppressedRef = useRef(false)
  const onBackRef = useRef(onBack)
  onBackRef.current = onBack
  const onTabPrevRef = useRef(onTabPrev)
  onTabPrevRef.current = onTabPrev
  const onTabNextRef = useRef(onTabNext)
  onTabNextRef.current = onTabNext
  const initialActiveRef = useRef<HTMLElement | null>(null)
  const instanceRef = useRef(++providerCounter)

  useEffect(() => {
    menuNavOpenCount += 1
    return () => {
      menuNavOpenCount = Math.max(0, menuNavOpenCount - 1)
    }
  }, [])

  // Maintain a global stack so only the topmost provider responds to events.
  useEffect(() => {
    const entry = { setIsTop, instance: instanceRef.current }
    providerStack.push(entry)
    if (providerStack.length > 1) {
      providerStack[providerStack.length - 2].setIsTop(false)
    }
    setIsTop(true)
    return () => {
      providerStack = providerStack.filter((e) => e !== entry)
      const next = providerStack[providerStack.length - 1]
      if (next) next.setIsTop(true)
    }
  }, [])

  useEffect(() => {
    if (typeof document !== 'undefined') {
      initialActiveRef.current = (document.activeElement as HTMLElement) ?? null
    }
    // We want returnFocus.current at unmount time, not at effect-setup time,
    // because the parent may set the ref after this effect runs.
    const returnFocusRef = returnFocus
    const initial = initialActiveRef
    return () => {
      const target = returnFocusRef?.current ?? initial.current
      if (target && typeof target.focus === 'function') {
        try {
          target.focus()
        } catch {}
      }
    }
  }, [returnFocus])

  const orderedEntries = useCallback((): FocusableEntry[] => {
    const arr = Array.from(entriesRef.current.values()).filter(
      (e) => !e.disabled,
    )
    // Compare by `order` first (default 1e9 so unordered items sit in the
    // middle and explicit values can push entries earlier or later); break
    // ties with DOM position so unordered items always read in document
    // order regardless of registration timing.
    arr.sort((a, b) => {
      const ao = a.order ?? 1e9
      const bo = b.order ?? 1e9
      if (ao !== bo) return ao - bo
      const ae = a.ref.current
      const be = b.ref.current
      if (!ae || !be) return 0
      const pos = ae.compareDocumentPosition(be)
      if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1
      if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1
      return 0
    })
    return arr
  }, [])

  // Returns the entry whose ref matches the current document.activeElement.
  // We read the DOM directly rather than tracking a `focusedId` state so
  // navigation callbacks stay reference-stable across focus shifts (otherwise
  // the gamepad poller's effect tears down and restarts on every key press).
  const currentEntry = useCallback(
    (list: FocusableEntry[]): FocusableEntry | null => {
      if (typeof document === 'undefined') return null
      const active = document.activeElement
      if (!active) return null
      return list.find((e) => e.ref.current === active) ?? null
    },
    [],
  )

  const focusEntry = useCallback((id: string) => {
    const entry = entriesRef.current.get(id)
    if (!entry || entry.disabled) return
    entry.ref.current?.focus()
  }, [])

  const focusFirst = useCallback(() => {
    const list = orderedEntries()
    if (list.length === 0) return
    focusEntry(list[0].id)
  }, [focusEntry, orderedEntries])

  const register = useCallback((entry: FocusableEntry) => {
    entriesRef.current.set(entry.id, entry)
    return () => {
      entriesRef.current.delete(entry.id)
    }
  }, [])

  const move = useCallback(
    (dir: 'up' | 'down' | 'left' | 'right' | 'next' | 'prev') => {
      const allEntries = orderedEntries()
      if (allEntries.length === 0) return
      const current = currentEntry(allEntries) ?? allEntries[0]

      let step = 0
      if (dir === 'next' || dir === 'down' || dir === 'right') step = 1
      else if (dir === 'prev' || dir === 'up' || dir === 'left') step = -1

      if ((dir === 'left' || dir === 'right') && current.axis === 'vertical') {
        return
      }
      if ((dir === 'up' || dir === 'down') && current.axis === 'horizontal') {
        return
      }

      // Group-restricted nav so arrow-right on a tab does not jump into the
      // tab body. Ungrouped items navigate against the full list.
      const list = current.group
        ? allEntries.filter((e) => e.group === current.group)
        : allEntries
      const currentIdx = list.findIndex((e) => e.id === current.id)
      let nextIdx = (currentIdx >= 0 ? currentIdx : 0) + step
      if (nextIdx < 0) nextIdx = list.length - 1
      if (nextIdx >= list.length) nextIdx = 0
      focusEntry(list[nextIdx].id)
    },
    [currentEntry, focusEntry, orderedEntries],
  )

  const activate = useCallback(() => {
    const list = orderedEntries()
    const entry = currentEntry(list) ?? list[0]
    if (!entry || entry.disabled) return
    if (entry.onActivate) {
      entry.onActivate()
      return
    }
    const el = entry.ref.current
    if (typeof (el as HTMLButtonElement | null)?.click === 'function') {
      ;(el as HTMLButtonElement).click()
    }
  }, [currentEntry, orderedEntries])

  const setSuppressed = useCallback((suppressed: boolean) => {
    suppressedRef.current = suppressed
  }, [])

  const gamepadHandlers = useMemo(
    () => ({
      move: (dir: 'up' | 'down' | 'left' | 'right') => {
        if (suppressedRef.current) return
        move(dir)
      },
      activate: () => {
        if (suppressedRef.current) return
        activate()
      },
      back: () => {
        if (suppressedRef.current) return
        onBackRef.current?.()
      },
      prevTab: () => {
        if (suppressedRef.current) return
        onTabPrevRef.current?.()
      },
      nextTab: () => {
        if (suppressedRef.current) return
        onTabNextRef.current?.()
      },
      getFocused: () =>
        typeof document !== 'undefined'
          ? (document.activeElement as HTMLElement | null)
          : null,
    }),
    [activate, move],
  )
  useMenuGamepadNav(isTop, gamepadHandlers)

  // Auto-focus on mount. We poll a few frames because focusables register
  // inside an effect that runs after the provider's mount effect.
  useEffect(() => {
    if (!autoFocus) return
    let cancelled = false
    let tries = 0
    function tryFocus() {
      if (cancelled) return
      const list = orderedEntries()
      if (list.length > 0) {
        focusFirst()
        return
      }
      tries += 1
      if (tries < 8) requestAnimationFrame(tryFocus)
    }
    requestAnimationFrame(tryFocus)
    return () => {
      cancelled = true
    }
  }, [autoFocus, focusFirst, orderedEntries])

  useEffect(() => {
    if (!isTop) return
    function onKey(e: KeyboardEvent) {
      if (suppressedRef.current) return
      const key = e.key
      const target = e.target as HTMLElement | null
      const isEditable =
        !!target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          (target as HTMLElement).isContentEditable === true)
      const isRange =
        !!target &&
        target.tagName === 'INPUT' &&
        (target as HTMLInputElement).type === 'range'

      if (key === 'Escape') {
        e.preventDefault()
        onBackRef.current?.()
        return
      }
      if (
        key === 'ArrowUp' ||
        key === 'ArrowDown' ||
        key === 'ArrowLeft' ||
        key === 'ArrowRight'
      ) {
        // Pass-through for text caret nav and native range step.
        if (isEditable && !isRange) return
        if (isRange && (key === 'ArrowLeft' || key === 'ArrowRight')) return
        e.preventDefault()
        if (key === 'ArrowUp') move('up')
        else if (key === 'ArrowDown') move('down')
        else if (key === 'ArrowLeft') move('left')
        else if (key === 'ArrowRight') move('right')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
    }
  }, [isTop, move])

  const api = useMemo<MenuNavApi>(
    () => ({
      register,
      focusFirst,
      focusEntry,
      move,
      activate,
      back: () => onBackRef.current?.(),
      isTop,
      setSuppressed,
    }),
    [register, focusFirst, focusEntry, move, activate, isTop, setSuppressed],
  )

  return <MenuNavContext.Provider value={api}>{children}</MenuNavContext.Provider>
}
