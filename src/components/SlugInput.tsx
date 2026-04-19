'use client'
import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { SlugSchema, normalizeSlug } from '@/lib/schemas'

export function SlugInput() {
  const router = useRouter()
  const [value, setValue] = useState('')
  const valid = SlugSchema.safeParse(value).success

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!valid) return
    router.push(`/${value}`)
  }

  return (
    <form onSubmit={onSubmit} style={formStyle} noValidate>
      <label style={fieldStyle}>
        <span style={prefixStyle} aria-hidden="true">
          /
        </span>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(normalizeSlug(e.target.value))}
          placeholder="your-track"
          aria-label="Track slug"
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          inputMode="url"
          enterKeyHint="go"
          maxLength={128}
          style={inputStyle}
        />
      </label>
      <button type="submit" disabled={!valid} style={goBtnStyle}>
        Go
      </button>
    </form>
  )
}

const formStyle: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  alignItems: 'stretch',
}
const fieldStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  background: 'rgba(255,255,255,0.12)',
  borderRadius: 8,
  padding: '0 12px',
  minHeight: 44,
}
const prefixStyle: React.CSSProperties = {
  fontFamily: 'monospace',
  fontSize: 14,
  opacity: 0.7,
  marginRight: 4,
}
const inputStyle: React.CSSProperties = {
  flex: 1,
  background: 'transparent',
  border: 'none',
  outline: 'none',
  color: 'white',
  fontFamily: 'monospace',
  fontSize: 14,
  padding: '10px 0',
  minWidth: 0,
}
const goBtnStyle: React.CSSProperties = {
  padding: '0 18px',
  minHeight: 44,
  background: '#e84a5f',
  color: 'white',
  border: 'none',
  borderRadius: 8,
  fontFamily: 'inherit',
  fontWeight: 700,
  fontSize: 15,
  letterSpacing: 0.5,
  cursor: 'pointer',
}
