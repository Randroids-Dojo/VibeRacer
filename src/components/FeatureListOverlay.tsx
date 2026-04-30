'use client'
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { createPortal } from 'react-dom'
import { FEATURE_LIST, FEATURE_LIST_ITEM_COUNT } from '@/lib/featureList'
import { useClickSfx } from '@/hooks/useClickSfx'

interface FeatureListOverlayProps {
  onClose: () => void
}

export function FeatureListOverlay({ onClose }: FeatureListOverlayProps) {
  const [mounted, setMounted] = useState(false)
  const [paused, setPaused] = useState(false)
  const creditsRef = useRef<HTMLDivElement | null>(null)
  const pausedRef = useRef(false)
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  const offsetRef = useRef(0)
  const playBack = useClickSfx('back')
  const summary = `${FEATURE_LIST.length} sections, ${FEATURE_LIST_ITEM_COUNT} features`

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    pausedRef.current = paused
  }, [paused])

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeButtonRef.current?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        playBack()
        onClose()
      }
      if (event.key === ' ') {
        if (isKeyboardControlTarget(event.target)) return
        event.preventDefault()
        setPaused((value) => !value)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose, playBack])

  useEffect(() => {
    if (!mounted) return
    const credits = creditsRef.current
    if (!credits) return

    let frame = 0
    let last = performance.now()
    const step = (now: number) => {
      const dt = Math.min(64, now - last)
      last = now
      if (!pausedRef.current) {
        offsetRef.current += dt * 0.095
        const resetAt = credits.scrollHeight + window.innerHeight * 0.25
        if (offsetRef.current >= resetAt) offsetRef.current = 0
        credits.style.transform = `translate3d(0, ${-offsetRef.current}px, 0)`
      }
      frame = window.requestAnimationFrame(step)
    }
    frame = window.requestAnimationFrame(step)
    return () => window.cancelAnimationFrame(frame)
  }, [mounted])

  function close() {
    playBack()
    onClose()
  }

  const overlay = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="feature-list-title"
      style={overlayStyle}
    >
      <div aria-hidden="true" style={topFadeStyle} />
      <div aria-hidden="true" style={bottomFadeStyle} />

      <header style={headerStyle}>
        <div>
          <div style={eyebrowStyle}>Feature List</div>
          <h2 id="feature-list-title" style={titleStyle}>
            VibeRacer
          </h2>
          <div style={summaryStyle}>{summary}</div>
        </div>
        <button
          ref={closeButtonRef}
          type="button"
          onClick={close}
          style={closeButtonStyle}
        >
          Close
        </button>
      </header>

      <div
        style={scrollerStyle}
        onPointerDown={() => setPaused(true)}
        onWheel={() => setPaused(true)}
        tabIndex={0}
        aria-label="Feature List credits"
      >
        <div ref={creditsRef} data-testid="feature-list-roll">
          <div style={spacerStyle} />
          {FEATURE_LIST.map((category) => (
            <section key={category.title} style={categoryStyle}>
              <h3 style={categoryTitleStyle}>{category.title}</h3>
              <ul style={featureListStyle}>
                {category.items.map((feature) => (
                  <li key={feature} style={featureItemStyle}>
                    {feature}
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <div style={endingStyle}>See you on the grid.</div>
          <div style={spacerStyle} />
        </div>
      </div>

      <footer style={footerStyle}>
        <button
          type="button"
          onClick={() => setPaused((value) => !value)}
          aria-pressed={paused}
          aria-label={
            paused ? 'Resume Feature List scroll' : 'Pause Feature List scroll'
          }
          style={controlButtonStyle}
        >
          {paused ? 'Resume scroll' : 'Pause scroll'}
        </button>
      </footer>
    </div>
  )

  if (!mounted) return overlay
  return createPortal(overlay, document.body)
}

function isKeyboardControlTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  return ['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)
}

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 1100,
  background:
    'linear-gradient(180deg, #040404 0%, #111 38%, #070707 100%)',
  color: '#f7f3da',
  fontFamily: 'var(--font-cartoony), system-ui, sans-serif',
  overflow: 'hidden',
}

const headerStyle: CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  zIndex: 3,
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 16,
  padding: '28px clamp(18px, 5vw, 72px)',
  pointerEvents: 'none',
}

const eyebrowStyle: CSSProperties = {
  color: '#ffcf66',
  fontSize: 13,
  fontWeight: 800,
  letterSpacing: 3,
  textTransform: 'uppercase',
}

const titleStyle: CSSProperties = {
  margin: '4px 0 0',
  color: '#fff9c7',
  fontSize: 42,
  lineHeight: 1,
  letterSpacing: 2,
  WebkitTextStroke: '1px rgba(0,0,0,0.7)',
  textTransform: 'uppercase',
}

const summaryStyle: CSSProperties = {
  marginTop: 8,
  color: 'rgba(255,255,255,0.72)',
  fontFamily: 'system-ui, sans-serif',
  fontSize: 14,
}

const closeButtonStyle: CSSProperties = {
  pointerEvents: 'auto',
  border: '1px solid rgba(255,255,255,0.24)',
  borderRadius: 10,
  background: 'rgba(255,255,255,0.08)',
  color: 'white',
  padding: '10px 16px',
  fontFamily: 'inherit',
  fontSize: 14,
  fontWeight: 800,
  letterSpacing: 1.4,
  textTransform: 'uppercase',
  cursor: 'pointer',
}

const scrollerStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  overflowY: 'auto',
  padding: '0 clamp(22px, 8vw, 160px)',
  scrollbarWidth: 'thin',
}

const spacerStyle: CSSProperties = {
  height: '58vh',
}

const categoryStyle: CSSProperties = {
  width: 'min(920px, 100%)',
  margin: '0 auto 68px',
  textAlign: 'center',
}

const categoryTitleStyle: CSSProperties = {
  margin: '0 0 24px',
  color: '#ffcf66',
  fontSize: 28,
  lineHeight: 1.1,
  letterSpacing: 2,
  textTransform: 'uppercase',
}

const featureListStyle: CSSProperties = {
  margin: 0,
  padding: 0,
  listStyle: 'none',
  display: 'grid',
  gap: 12,
}

const featureItemStyle: CSSProperties = {
  color: 'rgba(255,255,255,0.92)',
  fontFamily: 'system-ui, sans-serif',
  fontSize: 'clamp(18px, 2vw, 28px)',
  fontWeight: 700,
  lineHeight: 1.22,
  textShadow: '0 2px 10px rgba(0,0,0,0.8)',
}

const endingStyle: CSSProperties = {
  margin: '36px auto 0',
  textAlign: 'center',
  color: '#ffcf66',
  fontSize: 30,
  fontWeight: 800,
  letterSpacing: 2,
  textTransform: 'uppercase',
}

const footerStyle: CSSProperties = {
  position: 'absolute',
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 3,
  display: 'flex',
  justifyContent: 'center',
  padding: '18px 24px 24px',
  pointerEvents: 'none',
}

const controlButtonStyle: CSSProperties = {
  pointerEvents: 'auto',
  border: '1px solid rgba(255,255,255,0.2)',
  borderRadius: 999,
  background: 'rgba(0,0,0,0.55)',
  color: 'rgba(255,255,255,0.85)',
  padding: '8px 14px',
  fontFamily: 'system-ui, sans-serif',
  fontSize: 13,
  fontWeight: 700,
  cursor: 'pointer',
}

const topFadeStyle: CSSProperties = {
  position: 'absolute',
  inset: '0 0 auto',
  height: '28vh',
  zIndex: 2,
  pointerEvents: 'none',
  background:
    'linear-gradient(180deg, rgba(4,4,4,0.96), rgba(4,4,4,0.58) 45%, rgba(4,4,4,0))',
}

const bottomFadeStyle: CSSProperties = {
  position: 'absolute',
  inset: 'auto 0 0',
  height: '24vh',
  zIndex: 2,
  pointerEvents: 'none',
  background:
    'linear-gradient(0deg, rgba(4,4,4,0.96), rgba(4,4,4,0.5) 50%, rgba(4,4,4,0))',
}
