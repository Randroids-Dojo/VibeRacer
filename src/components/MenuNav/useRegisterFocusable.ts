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
// ref. When no MenuNav provider is mounted (legacy routes, mouse-only
// flows), the hook is a no-op so primitives render normally.
export function useRegisterFocusable(
  ref: RefObject<HTMLElement | null>,
  options: RegisterOptions = {},
) {
  const nav = useMenuNav()
  const id = useId()
  const optsRef = useRef(options)
  optsRef.current = options
  useEffect(() => {
    if (!nav) return
    const dispose = nav.register({
      id,
      ref,
      axis: optsRef.current.axis ?? 'vertical',
      group: optsRef.current.group,
      order: optsRef.current.order,
      onActivate: optsRef.current.onActivate,
      disabled: optsRef.current.disabled,
    })
    return dispose
  }, [id, nav, ref, options.disabled, options.axis, options.group, options.order])
}
