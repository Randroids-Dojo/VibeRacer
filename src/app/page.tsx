import Link from 'next/link'

export default function HomePage() {
  return (
    <main style={main}>
      <div style={card}>
        <h1 style={title}>VibeRacer</h1>
        <p style={sub}>Every URL is a track. Pick one and drive.</p>
        <div style={grid}>
          <Link href="/start" style={btn}>
            Play default track
          </Link>
          <Link href="/oval" style={btnAlt}>
            /oval
          </Link>
          <Link href="/sandbox" style={btnAlt}>
            /sandbox
          </Link>
        </div>
        <p style={hint}>
          Or type any path into the URL bar. Every slug is its own track.
        </p>
      </div>
    </main>
  )
}

const main: React.CSSProperties = {
  minHeight: '100vh',
  display: 'grid',
  placeItems: 'center',
  background: 'linear-gradient(180deg, #9ad8ff 0%, #5fa3ce 100%)',
  fontFamily: 'system-ui, sans-serif',
  color: 'white',
  padding: 24,
}
const card: React.CSSProperties = {
  background: 'rgba(0,0,0,0.35)',
  padding: 32,
  borderRadius: 16,
  textAlign: 'center',
  maxWidth: 460,
}
const title: React.CSSProperties = {
  fontSize: 52,
  margin: 0,
  letterSpacing: 1,
}
const sub: React.CSSProperties = {
  marginTop: 4,
  marginBottom: 24,
  opacity: 0.85,
}
const grid: React.CSSProperties = {
  display: 'grid',
  gap: 10,
}
const btn: React.CSSProperties = {
  padding: '12px 24px',
  background: '#e84a5f',
  color: 'white',
  textDecoration: 'none',
  borderRadius: 8,
  fontSize: 18,
  fontWeight: 600,
}
const btnAlt: React.CSSProperties = {
  padding: '10px 20px',
  background: 'rgba(255,255,255,0.15)',
  color: 'white',
  textDecoration: 'none',
  borderRadius: 8,
  fontFamily: 'monospace',
}
const hint: React.CSSProperties = {
  marginTop: 20,
  fontSize: 13,
  opacity: 0.7,
}
