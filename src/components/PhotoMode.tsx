'use client'
import { useCallback, useEffect, useState, type MutableRefObject } from 'react'
import {
  MenuButton,
  MenuHeader,
  MenuHint,
  MenuPanel,
  MenuOverlay,
  MenuSection,
} from './MenuUI'
import { MenuNavProvider } from './MenuNav'
import {
  PHOTO_JPG_QUALITY,
  buildPhotoFilename,
  downloadDataUrl,
  mimeForFormat,
  type PhotoFormat,
} from '@/lib/photoMode'

// Confirmation feedback timeout. Long enough for a player to see the green
// flash, short enough that they can capture again without an awkward delay.
const STATUS_TIMEOUT_MS = 1800

interface PhotoModeProps {
  slug: string
  // Capture function exposed by RaceCanvas. Returns a data URL for the
  // current frame at the requested mime type, or null when the capture
  // failed (renderer unmounted, GPU read tainted, etc.).
  captureRef: MutableRefObject<
    ((mimeType?: string, quality?: number) => string | null) | null
  >
  onClose: () => void
}

type CaptureStatus =
  | { kind: 'idle' }
  | { kind: 'success'; filename: string; format: PhotoFormat }
  | { kind: 'error'; message: string }

// Photo Mode pause pane. Hides the rest of the pause UI while the player is
// here so they can frame and capture the scene without HUD chrome on top.
// The Game.tsx caller is responsible for that hiding (it knows whether the
// HUD is on screen). This component only owns the capture controls.
export function PhotoMode({ slug, captureRef, onClose }: PhotoModeProps) {
  const [status, setStatus] = useState<CaptureStatus>({ kind: 'idle' })

  useEffect(() => {
    if (status.kind === 'idle') return
    const t = setTimeout(() => setStatus({ kind: 'idle' }), STATUS_TIMEOUT_MS)
    return () => clearTimeout(t)
  }, [status])

  const handleCapture = useCallback(
    (format: PhotoFormat) => {
      const fn = captureRef.current
      if (!fn) {
        setStatus({
          kind: 'error',
          message: 'Renderer not ready. Try again in a moment.',
        })
        return
      }
      const mime = mimeForFormat(format)
      const quality = format === 'jpg' ? PHOTO_JPG_QUALITY : undefined
      const dataUrl = fn(mime, quality)
      if (!dataUrl) {
        setStatus({
          kind: 'error',
          message: 'Could not read the canvas. Try again.',
        })
        return
      }
      const filename = buildPhotoFilename(slug, format, new Date())
      const ok = downloadDataUrl(dataUrl, filename)
      if (!ok) {
        setStatus({
          kind: 'error',
          message: 'Browser blocked the download.',
        })
        return
      }
      setStatus({ kind: 'success', filename, format })
    },
    [captureRef, slug],
  )

  return (
    <MenuOverlay zIndex={100}>
      <MenuNavProvider onBack={onClose}>
        <MenuPanel>
        <MenuHeader title="PHOTO MODE" onClose={onClose} />
        <MenuHint>
          Saves a screenshot of just the 3D scene (no HUD, no menu overlay).
          The image captures the current camera, paint, weather, and time of
          day. Pick a format below.
        </MenuHint>
        <MenuSection title="Capture">
          <MenuButton
            variant="primary"
            click="confirm"
            onClick={() => handleCapture('png')}
          >
            Save as PNG
          </MenuButton>
          <MenuButton click="confirm" onClick={() => handleCapture('jpg')}>
            Save as JPG
          </MenuButton>
        </MenuSection>
        <div
          style={{
            minHeight: 36,
            fontSize: 12,
            textAlign: 'center',
            padding: '6px 8px',
            borderRadius: 8,
            background:
              status.kind === 'success'
                ? 'rgba(110, 231, 130, 0.18)'
                : status.kind === 'error'
                  ? 'rgba(255, 107, 53, 0.18)'
                  : 'transparent',
            color:
              status.kind === 'success'
                ? '#7be09a'
                : status.kind === 'error'
                  ? '#ff8a5c'
                  : 'rgba(255,255,255,0.5)',
            border:
              status.kind === 'idle'
                ? '1px dashed rgba(255,255,255,0.12)'
                : 'none',
            transition: 'background 120ms ease, color 120ms ease',
          }}
          role="status"
          aria-live="polite"
        >
          {status.kind === 'success'
            ? `Saved ${status.filename}`
            : status.kind === 'error'
              ? status.message
              : 'Pick a format to save the current frame.'}
        </div>
        </MenuPanel>
      </MenuNavProvider>
    </MenuOverlay>
  )
}
