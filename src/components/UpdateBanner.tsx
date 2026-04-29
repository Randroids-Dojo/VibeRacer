'use client'

import { useEffect, useState } from 'react'
import {
  INITIAL_DELAY_MS,
  POLL_INTERVAL_MS,
  fetchVersion,
  isStaleVersion,
  shouldPoll,
} from '@/lib/updateCheck'

export function UpdateBanner() {
  const [isStale, setIsStale] = useState(false)

  useEffect(() => {
    const current = process.env.NEXT_PUBLIC_APP_VERSION
    if (!shouldPoll(current)) return

    let cancelled = false
    let intervalId: ReturnType<typeof setInterval> | undefined

    async function check() {
      const remote = await fetchVersion()
      if (cancelled) return
      if (isStaleVersion(current, remote)) setIsStale(true)
    }

    const initialId = setTimeout(() => {
      void check()
      intervalId = setInterval(() => {
        void check()
      }, POLL_INTERVAL_MS)
    }, INITIAL_DELAY_MS)

    return () => {
      cancelled = true
      clearTimeout(initialId)
      if (intervalId) clearInterval(intervalId)
    }
  }, [])

  if (!isStale) return null

  return (
    <div role="status" aria-live="polite" style={containerStyle}>
      <span style={labelStyle}>NEW VERSION AVAILABLE</span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        style={buttonStyle}
      >
        RELOAD
      </button>
    </div>
  )
}

export default UpdateBanner

const containerStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  zIndex: 9999,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 12,
  padding: '7px 16px',
  background: 'rgba(11,10,15,0.97)',
  borderBottom: '1px solid #e84a5f',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 12,
  letterSpacing: '0.08em',
  color: '#cbd5e1',
}

const labelStyle: React.CSSProperties = {
  fontWeight: 600,
}

const buttonStyle: React.CSSProperties = {
  background: 'rgba(232,74,95,0.15)',
  border: '1px solid #e84a5f',
  color: '#ffd1d8',
  padding: '3px 12px',
  fontFamily: 'inherit',
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: '0.08em',
  cursor: 'pointer',
  borderRadius: 4,
}
