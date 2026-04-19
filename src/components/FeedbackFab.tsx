'use client'
import { useEffect, useRef, useState } from 'react'
import { initConsoleCapture, getCapturedLogs } from '@/lib/consoleCapture'

type View = 'closed' | 'feedback'
type SubmitState = 'idle' | 'sending' | 'success' | 'error'

function captureScreenshot(): string | null {
  try {
    const canvas = document.querySelector('canvas')
    if (!canvas || canvas.width === 0 || canvas.height === 0) return null

    const maxWidth = 320
    const scale = Math.min(1, maxWidth / canvas.width)
    const w = Math.round(canvas.width * scale)
    const h = Math.round(canvas.height * scale)

    const tmp = document.createElement('canvas')
    tmp.width = w
    tmp.height = h
    const ctx = tmp.getContext('2d')
    if (!ctx) return null

    ctx.drawImage(canvas, 0, 0, w, h)
    return tmp.toDataURL('image/jpeg', 0.5)
  } catch {
    return null
  }
}

export function FeedbackFab() {
  const [view, setView] = useState<View>('closed')
  const [submitState, setSubmitState] = useState<SubmitState>('idle')
  const [message, setMessage] = useState('')
  const fabRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    initConsoleCapture()
  }, [])

  useEffect(() => {
    if (view !== 'feedback') return
    const t = setTimeout(() => textareaRef.current?.focus(), 50)
    return () => clearTimeout(t)
  }, [view])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      const t = e.target as Node
      if (
        view !== 'closed' &&
        !fabRef.current?.contains(t) &&
        !panelRef.current?.contains(t)
      ) {
        setView('closed')
      }
    }
    document.addEventListener('click', onClickOutside)
    return () => document.removeEventListener('click', onClickOutside)
  }, [view])

  function toggle() {
    setView((v) => (v === 'closed' ? 'feedback' : 'closed'))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!message.trim()) return

    const screenshot = captureScreenshot()
    const consoleLogs = getCapturedLogs()

    setSubmitState('sending')
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Player Feedback',
          body: message.trim(),
          context: {
            urlPath: window.location.pathname,
            userAgent: navigator.userAgent,
            viewport: `${window.innerWidth}x${window.innerHeight}`,
            timestamp: new Date().toISOString(),
            screenshot,
            consoleLogs: consoleLogs.length > 0 ? consoleLogs : null,
          },
        }),
      })
      if (!res.ok) throw new Error(`status ${res.status}`)
      setSubmitState('success')
      setMessage('')
      setTimeout(() => {
        setView('closed')
        setTimeout(() => setSubmitState('idle'), 350)
      }, 2000)
    } catch {
      setSubmitState('error')
      setTimeout(() => setSubmitState('idle'), 3000)
    }
  }

  const isOpen = view !== 'closed'

  return (
    <>
      <button
        ref={fabRef}
        onClick={toggle}
        aria-label={isOpen ? 'Close feedback' : 'Send feedback'}
        style={{ ...fabStyle, background: isOpen ? '#222' : '#ff6b35' }}
      >
        {isOpen ? (
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        )}
      </button>

      {isOpen ? (
        <div ref={panelRef} style={panelStyle}>
          <div style={panelHeader}>send feedback</div>

          {submitState !== 'success' ? (
            <form onSubmit={handleSubmit} style={formStyle}>
              <textarea
                ref={textareaRef}
                placeholder="What's on your mind?"
                rows={4}
                required
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                style={textareaStyle}
              />
              <button
                type="submit"
                disabled={submitState === 'sending' || !message.trim()}
                style={{
                  ...submitBtn,
                  background:
                    submitState === 'error'
                      ? '#b84a3a'
                      : submitState === 'sending'
                        ? '#555'
                        : '#ff6b35',
                  cursor: submitState === 'sending' ? 'wait' : 'pointer',
                  opacity: !message.trim() ? 0.5 : 1,
                }}
              >
                {submitState === 'sending'
                  ? 'Sending...'
                  : submitState === 'error'
                    ? 'Failed, try again'
                    : 'Send Feedback'}
              </button>
              <span style={hintStyle}>
                Posted as a GitHub issue. Screenshot included.
              </span>
            </form>
          ) : (
            <div style={successStyle}>
              <div style={{ fontSize: 36, color: '#5fe08a' }}>✓</div>
              <p style={{ margin: '6px 0 0', fontWeight: 700 }}>
                Thanks for the feedback!
              </p>
              <p style={{ margin: '2px 0 0', opacity: 0.7, fontSize: 13 }}>
                Your message has been submitted.
              </p>
            </div>
          )}
        </div>
      ) : null}
    </>
  )
}

const fabStyle: React.CSSProperties = {
  position: 'fixed',
  right: 20,
  bottom: 20,
  width: 52,
  height: 52,
  borderRadius: '50%',
  border: 'none',
  color: 'white',
  cursor: 'pointer',
  display: 'grid',
  placeItems: 'center',
  boxShadow: '0 6px 16px rgba(0,0,0,0.35)',
  zIndex: 1001,
  fontFamily: 'system-ui, sans-serif',
}
const panelStyle: React.CSSProperties = {
  position: 'fixed',
  right: 20,
  bottom: 84,
  width: 320,
  maxWidth: 'calc(100vw - 40px)',
  background: '#1a1a1a',
  color: 'white',
  borderRadius: 10,
  padding: 14,
  boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
  zIndex: 1001,
  fontFamily: 'system-ui, sans-serif',
  border: '1px solid #333',
}
const panelHeader: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.7,
  letterSpacing: 1.5,
  textTransform: 'uppercase',
  marginBottom: 8,
}
const formStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
}
const textareaStyle: React.CSSProperties = {
  background: '#111',
  color: 'white',
  border: '1px solid #333',
  borderRadius: 6,
  padding: 8,
  fontFamily: 'inherit',
  fontSize: 14,
  resize: 'vertical',
  outline: 'none',
}
const submitBtn: React.CSSProperties = {
  color: 'white',
  border: 'none',
  borderRadius: 6,
  padding: '9px 12px',
  fontWeight: 600,
  fontSize: 14,
  fontFamily: 'inherit',
}
const hintStyle: React.CSSProperties = {
  fontSize: 11,
  opacity: 0.55,
}
const successStyle: React.CSSProperties = {
  textAlign: 'center',
  padding: '10px 0 4px',
}
