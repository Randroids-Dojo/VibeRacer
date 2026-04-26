import Link from 'next/link'
import { loadDailyChallengeSafe } from '@/lib/dailyChallenge'
import { buildTrackThumbnail } from '@/lib/trackThumbnail'
import { formatDate } from '@/lib/formatDate'
import { formatLapTime } from '@/lib/share'
import { TrackThumbnail } from './TrackThumbnail'

/**
 * Featured "Daily Challenge" card on the home page. Picks one community
 * track per UTC day so a returning player has a single fresh thing to race
 * without having to scroll the recent list. The pick is deterministic per
 * UTC date so two players landing on the same day see the same featured
 * track.
 *
 * Renders nothing when KV has no recent tracks (local dev with no data, or
 * a brand new instance) so the home page does not show an empty card. Links
 * straight into the race for the slug; the slug page resolves the latest
 * version itself, so the URL stays clean.
 */
export async function DailyChallenge() {
  const today = await loadDailyChallengeSafe()
  if (!today) return null
  const thumb = today.pieces ? buildTrackThumbnail(today.pieces) : null
  const top = today.topTime
  return (
    <section style={sectionStyle} aria-label="Daily Challenge">
      <div style={headerRowStyle}>
        <span style={headerStyle}>Today&apos;s Challenge</span>
        <span style={dateStyle}>{formatDate(today.updatedAt)}</span>
      </div>
      <Link href={`/${today.slug}`} style={cardStyle}>
        <span style={previewSlotStyle}>
          {thumb ? (
            <TrackThumbnail
              thumbnail={thumb}
              size={88}
              ariaLabel={`Preview of /${today.slug}`}
            />
          ) : (
            <span style={previewPlaceholderStyle} aria-hidden="true" />
          )}
        </span>
        <span style={textColStyle}>
          <span style={slugStyle}>/{today.slug}</span>
          {top ? (
            <span style={topRowStyle}>
              <span style={topLabelStyle}>Beat</span>
              <span style={topInitialsStyle}>{top.initials}</span>
              <span style={topValueStyle}>{formatLapTime(top.lapTimeMs)}</span>
            </span>
          ) : (
            <span style={emptyTopRowStyle}>No record yet, set the pace.</span>
          )}
        </span>
        <span style={ctaStyle} aria-hidden="true">
          Race
        </span>
      </Link>
    </section>
  )
}

const sectionStyle: React.CSSProperties = {
  paddingTop: 8,
}
// Header row with the section title on the left and the track's last-updated
// date on the right. The date answers "is this featured slot a fresh track or
// a deep-cut from the index" without making the player click in.
const headerRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  marginBottom: 10,
  gap: 8,
}
const headerStyle: React.CSSProperties = {
  fontSize: 12,
  letterSpacing: 1.5,
  textTransform: 'uppercase',
  opacity: 0.75,
  fontWeight: 600,
}
const dateStyle: React.CSSProperties = {
  fontSize: 11,
  opacity: 0.5,
  fontFamily: 'monospace',
}
// Card uses a warmer tint than the regular recent-list rows so the daily
// slot reads as a featured affordance even at a glance. The accent color
// matches the existing platinum-medal palette (cool gold) so it does not
// fight the orange-gold "PB" / "record" badges elsewhere on the page.
const cardStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  padding: '12px 16px',
  background: 'linear-gradient(135deg, rgba(255,221,128,0.18), rgba(255,107,71,0.14))',
  border: '1px solid rgba(255,221,128,0.5)',
  borderRadius: 12,
  textDecoration: 'none',
  color: 'white',
  fontSize: 14,
  boxShadow: '0 6px 18px rgba(0,0,0,0.25)',
}
const previewSlotStyle: React.CSSProperties = {
  width: 88,
  height: 88,
  flex: '0 0 auto',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
}
const previewPlaceholderStyle: React.CSSProperties = {
  width: 88,
  height: 88,
  borderRadius: 8,
  background:
    'repeating-linear-gradient(45deg, rgba(255,255,255,0.06), rgba(255,255,255,0.06) 4px, rgba(255,255,255,0.12) 4px, rgba(255,255,255,0.12) 8px)',
}
const textColStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  flex: 1,
  minWidth: 0,
}
const slugStyle: React.CSSProperties = {
  fontFamily: 'monospace',
  fontSize: 18,
  fontWeight: 700,
  letterSpacing: 0.5,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}
const topRowStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'baseline',
  gap: 6,
  fontSize: 12,
  fontFamily: 'monospace',
  letterSpacing: 0.5,
}
const topLabelStyle: React.CSSProperties = {
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: 1,
  opacity: 0.7,
}
const topInitialsStyle: React.CSSProperties = {
  color: '#ffd750',
  fontWeight: 700,
}
const topValueStyle: React.CSSProperties = {
  color: 'rgba(255,255,255,0.95)',
}
const emptyTopRowStyle: React.CSSProperties = {
  fontSize: 12,
  fontFamily: 'monospace',
  opacity: 0.7,
}
const ctaStyle: React.CSSProperties = {
  flex: '0 0 auto',
  padding: '10px 16px',
  background: '#e84a5f',
  color: 'white',
  borderRadius: 10,
  fontSize: 14,
  fontWeight: 700,
  letterSpacing: 0.5,
  boxShadow: '0 4px 0 #9c2a3c',
}
