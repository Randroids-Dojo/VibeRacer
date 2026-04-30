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

// Module-scoped flag the racing-input hooks consult so a focused menu does not
// leak Space (handbrake) / W (forward) / etc into the physics tick. Set true
// while at least one MenuNav provider is active. Wrapping the title page does
// not flip this on, since the title page does not mount a MenuNav (see
// docs/plan).
let menuNavOpenCount = 0
export function isMenuNavOpen(): boolean {
  return menuNavOpenCount > 0
}

export type FocusAxis = 'vertical' | 'horizontal' | 'both'

export interface FocusableEntry {
  id: string
  ref: RefObject<HTMLElement | null>
  axis: FocusAxis
  // Optional group id so registrations from radio rows / tab bars can be
  // selected as a unit when LB / RB switch tabs.
  group?: string
  // Optional explicit ordinal that wins over DOM order. We keep this as an
  // escape hatch (mainly for test fixtures); production code relies on DOM
  // order.
  order?: number
  // Optional override invoked instead of `ref.current.click()` when the user
  // presses A / Enter on the focusable. Used by custom focusables that need
  // bespoke activation logic.
  onActivate?: () => void
  disabled?: boolean
}

export interface MenuNavApi {
  register: (entry: FocusableEntry) => () => void
  focusFirst: () => void
  focusEntry: (id: string) => void
  focusedId: string | null
  // Movement intents. The provider resolves these into DOM focus calls.
  move: (dir: 'up' | 'down' | 'left' | 'right' | 'next' | 'prev') => void
  activate: () => void
  back: () => void
  // Whether the provider is currently the topmost (only the topmost provider
  // listens to keyboard / gamepad). Children read this to decide whether to
  // render focus hints, etc.
  isTop: boolean
  // Set true while a key-capture flow is running (e.g. SettingsPane's rebind
  // prompt). The provider stops handling keyboard navigation while this is
  // true so the user's keypress reaches the capture handler intact.
  setSuppressed: (suppressed: boolean) => void
}

const MenuNavContext = createContext<MenuNavApi | null>(null)

export function useMenuNav(): MenuNavApi | null {
  return useContext(MenuNavContext)
}

interface MenuNavProviderProps {
  children: ReactNode
  // Called when the user hits Esc / B / the close button. If omitted Esc is a
  // no-op. The provider does not call this on its own; it is the parent's
  // onClose / onResume callback.
  onBack?: () => void
  // Optional tab-step callbacks. Bound to LB / RB on the gamepad. Pages with
  // a tab bar (SettingsPane) supply these so users can switch tabs from
  // anywhere in the panel without having to walk focus back to the tab strip.
  onTabPrev?: () => void
  onTabNext?: () => void
  // When provided focus is restored to this element on unmount. Falls back to
  // the document.activeElement at mount time.
  returnFocus?: RefObject<HTMLElement | null>
  // Disables auto-focus on mount. Most overlays want auto-focus, but a few
  // (FeedbackFab, InitialsPrompt) already focus a specific input themselves.
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
  const [focusedId, setFocusedId] = useState<string | null>(null)
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

  // Track open count for cross-module suppression of racing input.
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
    // Demote whoever was previously top.
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

  // Snapshot active element for focus restore.
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
    arr.sort((a, b) => {
      if (a.order !== undefined || b.order !== undefined) {
        return (a.order ?? 1e9) - (b.order ?? 1e9)
      }
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

  const focusEntry = useCallback((id: string) => {
    const entry = entriesRef.current.get(id)
    if (!entry || entry.disabled) return
    const el = entry.ref.current
    if (!el) return
    el.focus()
    setFocusedId(id)
  }, [])

  const focusFirst = useCallback(() => {
    const list = orderedEntries()
    if (list.length === 0) return
    focusEntry(list[0].id)
  }, [focusEntry, orderedEntries])

  const register = useCallback(
    (entry: FocusableEntry) => {
      entriesRef.current.set(entry.id, entry)
      return () => {
        entriesRef.current.delete(entry.id)
        if (focusedId === entry.id) setFocusedId(null)
      }
    },
    [focusedId],
  )

  const move = useCallback(
    (dir: 'up' | 'down' | 'left' | 'right' | 'next' | 'prev') => {
      const allEntries = orderedEntries()
      if (allEntries.length === 0) return
      const currentId = focusedId ?? allEntries[0].id
      const currentInAll = allEntries.findIndex((e) => e.id === currentId)
      const current = allEntries[currentInAll >= 0 ? currentInAll : 0]

      let step = 0
      if (dir === 'next' || dir === 'down' || dir === 'right') step = 1
      else if (dir === 'prev' || dir === 'up' || dir === 'left') step = -1

      // Honor the focused entry's axis: vertical groups ignore left / right,
      // horizontal groups ignore up / down. 'next' / 'prev' always work.
      if ((dir === 'left' || dir === 'right') && current.axis === 'vertical') {
        return
      }
      if ((dir === 'up' || dir === 'down') && current.axis === 'horizontal') {
        return
      }

      // When the focused entry has a `group` (e.g. a tab in a tab bar, or a
      // radio in a radio row), arrow navigation is restricted to siblings of
      // the same group so arrow-right on a tab does not jump into the tab
      // body. Items without a group navigate against the full list (the
      // common case for a vertical pause menu).
      const list = current.group
        ? allEntries.filter((e) => e.group === current.group)
        : allEntries
      const currentIdx = list.findIndex((e) => e.id === currentId)
      let nextIdx = (currentIdx >= 0 ? currentIdx : 0) + step
      if (nextIdx < 0) nextIdx = list.length - 1
      if (nextIdx >= list.length) nextIdx = 0
      focusEntry(list[nextIdx].id)
    },
    [focusEntry, focusedId, orderedEntries],
  )

  const activate = useCallback(() => {
    const list = orderedEntries()
    const id = focusedId ?? list[0]?.id
    if (!id) return
    const entry = entriesRef.current.get(id)
    if (!entry || entry.disabled) return
    if (entry.onActivate) {
      entry.onActivate()
      return
    }
    const el = entry.ref.current
    if (!el) return
    if (typeof (el as HTMLButtonElement).click === 'function') {
      ;(el as HTMLButtonElement).click()
    }
  }, [focusedId, orderedEntries])

  const back = useCallback(() => {
    onBackRef.current?.()
  }, [])

  const setSuppressed = useCallback((suppressed: boolean) => {
    suppressedRef.current = suppressed
  }, [])

  // Gamepad navigation. The hook owns its own rAF loop and starts when active.
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

  // Auto-focus first focusable shortly after mount once children have
  // registered. We poll a few frames because some focusables register inside
  // an effect that runs after the provider's mount effect.
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

  // Keyboard navigation. Only the topmost provider listens.
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
      // Enter / Space activates focused element. Native button click handles
      // this on its own; we only intercept when the focused element is not a
      // button (e.g. a div with onActivate).
      if (key === 'Enter') {
        if (!target || target.tagName !== 'BUTTON') {
          // Pass through: let the native form / link handle it.
        }
        return
      }
      // Arrow key handling: pass-through for text inputs / textareas.
      if (key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight') {
        if (isEditable && !isRange) {
          // text caret navigation - pass through
          return
        }
        if (isRange && (key === 'ArrowLeft' || key === 'ArrowRight')) {
          // range natively handles horizontal step - pass through
          return
        }
        e.preventDefault()
        if (key === 'ArrowUp') move('up')
        else if (key === 'ArrowDown') move('down')
        else if (key === 'ArrowLeft') move('left')
        else if (key === 'ArrowRight') move('right')
        return
      }
      if (key === 'Tab') {
        // Let browser handle Tab natively but keep focusedId in sync after.
        // We do not preventDefault here.
        setTimeout(() => {
          const active = document.activeElement as HTMLElement | null
          if (!active) return
          for (const entry of entriesRef.current.values()) {
            if (entry.ref.current === active) {
              setFocusedId(entry.id)
              return
            }
          }
        }, 0)
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
      focusedId,
      move,
      activate,
      back,
      isTop,
      setSuppressed,
    }),
    [
      register,
      focusFirst,
      focusEntry,
      focusedId,
      move,
      activate,
      back,
      isTop,
      setSuppressed,
    ],
  )

  return <MenuNavContext.Provider value={api}>{children}</MenuNavContext.Provider>
}
