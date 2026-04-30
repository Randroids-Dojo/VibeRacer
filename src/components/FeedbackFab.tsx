'use client'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { initConsoleCapture, getCapturedLogs } from '@/lib/consoleCapture'
import { menuTheme } from './MenuUI'
import { MenuNavProvider, useRegisterFocusable } from './MenuNav'

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
  const [mounted, setMounted] = useState(false)
  const fabRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    initConsoleCapture()
    setMounted(true)
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
  const messageLength = message.trim().length

  const content = (
    <>
      <button
        ref={fabRef}
        onClick={toggle}
        aria-label={isOpen ? 'Close feedback' : 'Send feedback'}
        style={{
          ...fabStyle,
          background: isOpen ? menuTheme.secondaryBg : menuTheme.accentBg,
          borderColor: isOpen ? menuTheme.ghostBorder : '#ff9b75',
        }}
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
        <MenuNavProvider onBack={() => setView('closed')} autoFocus={false}>
        <div ref={panelRef} style={panelStyle}>
          <div style={panelHeader}>
            <div>
              <div style={eyebrowStyle}>Paused report</div>
              <div style={panelTitle}>Feedback</div>
            </div>
            <FeedbackCloseButton onClick={() => setView('closed')} />
          </div>

          {submitState !== 'success' ? (
            <form onSubmit={handleSubmit} style={formStyle}>
              <div style={panelIntro}>
                Send the current route, a small screenshot, and recent console
                logs with your note.
              </div>
              <label style={fieldLabel} htmlFor="feedback-message">
                Message
              </label>
              <FeedbackTextarea
                textareaRef={textareaRef}
                value={message}
                onChange={setMessage}
              />
              <div style={metaRow}>
                <span>{messageLength > 0 ? `${messageLength} chars` : 'Ready'}</span>
                <span style={capturePills}>
                  <span style={capturePill}>Screenshot</span>
                  <span style={capturePill}>Console logs</span>
                </span>
              </div>
              <FeedbackSubmitButton
                submitState={submitState}
                messageLength={messageLength}
              />
              <span style={hintStyle} aria-live="polite">
                {submitState === 'error'
                  ? 'Submission failed. Your message is still here.'
                  : 'Posted as a GitHub issue for the current track.'}
              </span>
            </form>
          ) : (
            <div style={successStyle}>
              <div style={successMark}>✓</div>
              <p style={{ margin: '6px 0 0', fontWeight: 700 }}>
                Thanks for the feedback!
              </p>
              <p style={{ margin: '2px 0 0', opacity: 0.7, fontSize: 13 }}>
                Your message has been submitted.
              </p>
            </div>
          )}
        </div>
        </MenuNavProvider>
      ) : null}
    </>
  )

  if (!mounted) return content
  return createPortal(content, document.body)
}

function FeedbackCloseButton({ onClick }: { onClick: () => void }) {
  const ref = useRef<HTMLButtonElement | null>(null)
  useRegisterFocusable(ref, { axis: 'vertical' })
  return (
    <button
      ref={ref}
      type="button"
      aria-label="Close panel"
      onClick={onClick}
      style={panelClose}
    >
      Close
    </button>
  )
}

function FeedbackTextarea({
  textareaRef,
  value,
  onChange,
}: {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  value: string
  onChange: (next: string) => void
}) {
  useRegisterFocusable(
    textareaRef as React.RefObject<HTMLElement | null>,
    { axis: 'vertical' },
  )
  return (
    <textarea
      id="feedback-message"
      ref={textareaRef}
      placeholder="What's on your mind?"
      rows={4}
      required
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={textareaStyle}
    />
  )
}

function FeedbackSubmitButton({
  submitState,
  messageLength,
}: {
  submitState: SubmitState
  messageLength: number
}) {
  const ref = useRef<HTMLButtonElement | null>(null)
  useRegisterFocusable(ref, {
    axis: 'vertical',
    disabled: submitState === 'sending' || messageLength === 0,
  })
  return (
    <button
      ref={ref}
      type="submit"
      disabled={submitState === 'sending' || messageLength === 0}
      style={{
        ...submitBtn,
        background:
          submitState === 'error'
            ? '#b84a3a'
            : submitState === 'sending'
              ? '#555'
              : '#ff6b35',
        cursor: submitState === 'sending' ? 'wait' : 'pointer',
        opacity: messageLength === 0 ? 0.55 : 1,
      }}
    >
      {submitState === 'sending'
        ? 'Sending...'
        : submitState === 'error'
          ? 'Failed, try again'
          : 'Send Feedback'}
    </button>
  )
}

const fabStyle: CSSProperties = {
  position: 'fixed',
  right: 20,
  bottom: 20,
  width: 52,
  height: 52,
  borderRadius: '50%',
  border: '1px solid',
  color: 'white',
  cursor: 'pointer',
  display: 'grid',
  placeItems: 'center',
  boxShadow: '0 14px 34px rgba(0,0,0,0.42)',
  zIndex: 1001,
  fontFamily: menuTheme.font,
}
const panelStyle: CSSProperties = {
  position: 'fixed',
  right: 20,
  bottom: 84,
  width: 360,
  maxWidth: 'calc(100vw - 40px)',
  background: menuTheme.panelBg,
  color: menuTheme.textPrimary,
  borderRadius: 12,
  padding: 16,
  boxShadow: menuTheme.panelShadow,
  zIndex: 1001,
  fontFamily: menuTheme.font,
  border: `1px solid ${menuTheme.panelBorder}`,
  boxSizing: 'border-box',
}
const panelHeader: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 16,
  marginBottom: 12,
}
const eyebrowStyle: CSSProperties = {
  fontSize: 12,
  letterSpacing: 1.5,
  textTransform: 'uppercase',
  color: menuTheme.textMuted,
}
const panelTitle: CSSProperties = {
  fontSize: 24,
  fontWeight: 800,
  letterSpacing: 1.2,
  marginTop: 2,
}
const panelClose: CSSProperties = {
  border: `1px solid ${menuTheme.ghostBorder}`,
  borderRadius: 8,
  background: 'transparent',
  color: '#cfcfcf',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: 1,
  padding: '7px 10px',
  textTransform: 'uppercase',
}
const formStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
}
const panelIntro: CSSProperties = {
  color: menuTheme.textHint,
  fontSize: 13,
  lineHeight: 1.45,
}
const fieldLabel: CSSProperties = {
  color: menuTheme.textMuted,
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: 1.2,
  textTransform: 'uppercase',
}
const textareaStyle: CSSProperties = {
  background: menuTheme.inputBg,
  color: menuTheme.textPrimary,
  border: `1px solid ${menuTheme.ghostBorder}`,
  borderRadius: 8,
  padding: 11,
  fontFamily: 'inherit',
  fontSize: 14,
  lineHeight: 1.45,
  minHeight: 104,
  resize: 'vertical',
  outline: 'none',
  boxSizing: 'border-box',
}
const metaRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 10,
  color: menuTheme.textMuted,
  fontSize: 11,
}
const capturePills: CSSProperties = {
  display: 'flex',
  gap: 6,
  flexWrap: 'wrap',
  justifyContent: 'flex-end',
}
const capturePill: CSSProperties = {
  border: `1px solid ${menuTheme.ghostBorder}`,
  borderRadius: 999,
  padding: '3px 7px',
  color: menuTheme.textHint,
}
const submitBtn: CSSProperties = {
  color: menuTheme.accentText,
  border: 'none',
  borderRadius: 8,
  padding: '11px 14px',
  fontWeight: 800,
  fontSize: 14,
  fontFamily: 'inherit',
  minHeight: 42,
}
const hintStyle: CSSProperties = {
  color: menuTheme.textMuted,
  fontSize: 12,
  lineHeight: 1.35,
}
const successStyle: CSSProperties = {
  textAlign: 'center',
  padding: '14px 0 8px',
}
const successMark: CSSProperties = {
  display: 'inline-grid',
  placeItems: 'center',
  width: 48,
  height: 48,
  borderRadius: '50%',
  background: 'rgba(95,224,138,0.13)',
  color: '#5fe08a',
  fontSize: 34,
  fontWeight: 800,
}
