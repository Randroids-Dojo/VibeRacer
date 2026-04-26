// Photo Mode helpers. Pure (no DOM imports at module load) so the filename
// math, format whitelist, and slug sanitizer can be unit-tested without a
// browser. The `downloadDataUrl` and `triggerCanvasDownload` wrappers do
// touch the DOM but defer every reference until call time.

export type PhotoFormat = 'png' | 'jpg'

// Most browsers send 'image/jpeg' for JPEG; we expose the friendly 'jpg'
// extension to the user and translate at the boundary.
export function mimeForFormat(format: PhotoFormat): string {
  return format === 'png' ? 'image/png' : 'image/jpeg'
}

export function extensionForFormat(format: PhotoFormat): string {
  return format === 'png' ? 'png' : 'jpg'
}

export const PHOTO_JPG_QUALITY = 0.92
export const PHOTO_FILENAME_PREFIX = 'viberacer'

// Strip anything that is not a kebab-safe slug character so a hostile slug
// (or one that picked up unicode in the URL) cannot inject path separators
// or spaces into the saved filename. Also caps the length so a wildly long
// slug does not produce an unwieldy file. Returns 'track' as a fallback so
// the player always gets a meaningful name.
export function sanitizeSlugForFilename(raw: string): string {
  if (typeof raw !== 'string') return 'track'
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .replace(/^-+/, '')
    .replace(/-+$/, '')
    .slice(0, 48)
  return cleaned.length > 0 ? cleaned : 'track'
}

// Format a Date as YYYYMMDD-HHmmss in local time. Plain digits and a single
// dash so the timestamp survives intact in any filesystem and reads chrono
// when sorted alphabetically. Uses UTC offsets from the Date methods so the
// helper stays deterministic when tests pass a fixed Date.
export function formatPhotoTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${date.getFullYear()}` +
    pad(date.getMonth() + 1) +
    pad(date.getDate()) +
    '-' +
    pad(date.getHours()) +
    pad(date.getMinutes()) +
    pad(date.getSeconds())
  )
}

// Build the saved filename. Always includes the prefix, sanitized slug,
// timestamp, and the format extension. Sample output:
// `viberacer-monaco-20260426-143055.png`
export function buildPhotoFilename(
  slug: string,
  format: PhotoFormat,
  date: Date,
): string {
  const safeSlug = sanitizeSlugForFilename(slug)
  const ts = formatPhotoTimestamp(date)
  const ext = extensionForFormat(format)
  return `${PHOTO_FILENAME_PREFIX}-${safeSlug}-${ts}.${ext}`
}

// Trigger a browser download for a `data:` URL. Creates a transient anchor,
// clicks it, then removes it on the next tick so the browser has time to
// pick up the click. Safe to call repeatedly: each call gets its own anchor.
//
// The function is a no-op (returns false) when there is no document (server
// render) or when the data URL is empty / falsy. Returns true on success so
// the caller can show / suppress confirmation feedback.
export function downloadDataUrl(
  dataUrl: string | null | undefined,
  filename: string,
): boolean {
  if (!dataUrl) return false
  if (typeof document === 'undefined') return false
  try {
    const anchor = document.createElement('a')
    anchor.href = dataUrl
    anchor.download = filename
    anchor.style.display = 'none'
    document.body.appendChild(anchor)
    anchor.click()
    setTimeout(() => {
      try {
        anchor.remove()
      } catch {
        // already removed (e.g. test teardown), ignore
      }
    }, 0)
    return true
  } catch {
    return false
  }
}
