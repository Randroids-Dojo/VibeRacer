'use client'
import { useState, useEffect, useRef } from 'react'
import { InitialsSchema } from '@/lib/schemas'
import {
  INITIALS_EVENT,
  INITIALS_STORAGE_KEY,
  readStoredInitials,
  writeStoredInitials,
} from '@/lib/initials'
import { MenuButton, MenuOverlay, MenuPanel } from './MenuUI'

// Re-export the storage helpers so existing imports (`@/components/InitialsPrompt`)
// keep working. New consumers should import from `@/lib/initials` directly.
export {
  INITIALS_EVENT,
  INITIALS_STORAGE_KEY,
  readStoredInitials,
  writeStoredInitials,
}

export function InitialsPrompt({
  onDone,
}: {
  onDone: (initials: string) => void
}) {
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
    <MenuOverlay zIndex={100}>
      <MenuPanel>
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 22 }}>Enter 3 initials</h2>
          <p style={{ opacity: 0.8, fontSize: 14, margin: '8px 0 4px' }}>
            They will tag your lap times on the leaderboards.
          </p>
        </div>
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
          autoComplete="off"
          spellCheck={false}
          style={{
            fontSize: 48,
            fontFamily: 'monospace',
            textAlign: 'center',
            width: 200,
            padding: 8,
            letterSpacing: 12,
            background: '#0d0d0d',
            color: 'white',
            border: '2px solid #555',
            borderRadius: 8,
            alignSelf: 'center',
          }}
        />
        {error ? (
          <div
            style={{
              color: '#ffb3b3',
              fontSize: 13,
              textAlign: 'center',
            }}
          >
            {error}
          </div>
        ) : null}
        <MenuButton variant="primary" click="confirm" onClick={submit}>
          Save
        </MenuButton>
      </MenuPanel>
    </MenuOverlay>
  )
}
