'use client'
import { useState, useEffect, useRef } from 'react'
import { InitialsSchema } from '@/lib/schemas'

export const INITIALS_STORAGE_KEY = 'viberacer.initials'

export function readStoredInitials(): string | null {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(INITIALS_STORAGE_KEY)
  if (!raw) return null
  const parsed = InitialsSchema.safeParse(raw)
  return parsed.success ? parsed.data : null
}

export function writeStoredInitials(value: string): void {
  window.localStorage.setItem(INITIALS_STORAGE_KEY, value)
}

export function InitialsPrompt({ onDone }: { onDone: (initials: string) => void }) {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  function submit() {
    const parsed = InitialsSchema.safeParse(value)
    if (!parsed.success) {
      setError('3 letters, A to Z only.')
      return
    }
    writeStoredInitials(parsed.data)
    onDone(parsed.data)
  }

  return (
    <div style={overlay}>
      <div style={panel}>
        <h2 style={{ margin: 0, fontSize: 22 }}>Enter 3 initials</h2>
        <p style={{ opacity: 0.8, fontSize: 14, margin: '8px 0 16px' }}>
          They will tag your lap times on the leaderboards.
        </p>
        <input
          ref={inputRef}
          value={value}
          maxLength={3}
          onChange={(e) => {
            setValue(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))
            setError(null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
          }}
          style={input}
          autoComplete="off"
          spellCheck={false}
        />
        {error ? <div style={errStyle}>{error}</div> : null}
        <button onClick={submit} style={btn}>
          Save
        </button>
      </div>
    </div>
  )
}

const overlay: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.65)',
  display: 'grid',
  placeItems: 'center',
  zIndex: 100,
  fontFamily: 'system-ui, sans-serif',
  color: 'white',
}
const panel: React.CSSProperties = {
  background: '#1b1b1b',
  padding: 24,
  borderRadius: 12,
  width: 320,
  textAlign: 'center',
}
const input: React.CSSProperties = {
  fontSize: 48,
  fontFamily: 'monospace',
  textAlign: 'center',
  width: 180,
  padding: 8,
  letterSpacing: 12,
  background: '#0d0d0d',
  color: 'white',
  border: '2px solid #555',
  borderRadius: 8,
}
const btn: React.CSSProperties = {
  marginTop: 16,
  padding: '10px 24px',
  fontSize: 16,
  background: '#e84a5f',
  color: 'white',
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer',
}
const errStyle: React.CSSProperties = {
  color: '#ffb3b3',
  marginTop: 8,
  fontSize: 13,
}
