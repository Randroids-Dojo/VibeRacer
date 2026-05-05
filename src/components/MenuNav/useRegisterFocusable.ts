'use client'
import { useEffect, useId, useRef, type RefObject } from 'react'
import { useMenuNav, type FocusAxis } from './MenuNavContext'

interface RegisterOptions {
  axis?: FocusAxis
  group?: string
  order?: number
  onActivate?: () => void
  disabled?: boolean
}

// Components opt into MenuNav focus tracking by calling this with their DOM
// ref. When no MenuNav provider is mounted (legacy routes, mouse-only flows),
// the hook is a no-op so primitives render normally.
export function useRegisterFocusable(
  ref: RefObject<HTMLElement | null>,
  options: RegisterOptions = {},
) {
  const nav = useMenuNav()
  const id = useId()
  const optsRef = useRef(options)
  optsRef.current = options
  // Re-register only when the ordering / membership inputs change. The
  // onActivate callback is read off the ref at activation time so a parent
  // passing an inline arrow does not churn the registration. We track whether
  // the caller actually supplied an onActivate so the registry can leave it
  // undefined for plain buttons. The MenuNav activate path checks the field's
  // presence to decide between "call onActivate" and "fall back to el.click()",
  // so wiring an always-truthy wrapper would silently swallow A-button presses
  // on every MenuButton / MenuToggle / MenuHeaderClose in the app.
  const { axis, group, order, disabled, onActivate } = options
  const hasOnActivate = !!onActivate
  useEffect(() => {
    if (!nav) return
    return nav.register({
      id,
      ref,
      axis: optsRef.current.axis ?? 'vertical',
      group: optsRef.current.group,
      order: optsRef.current.order,
      disabled: optsRef.current.disabled,
      onActivate: hasOnActivate
        ? () => optsRef.current.onActivate?.()
        : undefined,
    })
  }, [id, nav, ref, axis, group, order, disabled, hasOnActivate])
}

// Shorthand: combine a useRef with useRegisterFocusable so wrapper components
// can register their element in a single line.
export function useFocusableRef<T extends HTMLElement>(
  options: RegisterOptions = {},
): RefObject<T | null> {
  const ref = useRef<T | null>(null)
  useRegisterFocusable(ref as RefObject<HTMLElement | null>, options)
  return ref
}
