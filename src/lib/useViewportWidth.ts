'use client'
import { useCallback, useEffect, useState } from 'react'

export function useViewportWidth(compactBelowPx = 600): {
  width: number
  compact: boolean
} {
  const readWidth = useCallback(
    () => (typeof window === 'undefined' ? compactBelowPx : window.innerWidth),
    [compactBelowPx],
  )

  const [width, setWidth] = useState(readWidth)

  useEffect(() => {
    function onResize() {
      setWidth(readWidth())
    }
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [readWidth])

  return { width, compact: width < compactBelowPx }
}
