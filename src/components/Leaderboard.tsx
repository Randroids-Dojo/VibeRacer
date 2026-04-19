'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatDate, formatIsoDate } from '@/lib/formatDate'

interface LeaderboardProps {
  slug: string
  versionHash: string
  onBack: () => void
}

interface Entry {
  rank: number
  initials: string
  lapTimeMs: number
  ts: number
  isMe: boolean
}

interface LeaderboardApiResponse {
  entries: Entry[]
  meBestRank: number | null
}

interface VersionOption {
  hash: string
  createdAt: string | null
}

interface TrackApiResponse {
  versionHash: string | null
  versions: Array<{ hash: string; createdAt: string }>
}

type BoardState =
  | { kind: 'loading' }
  | { kind: 'ready'; entries: Entry[]; meBestRank: number | null }
  | { kind: 'error'; message: string }

type VersionsState =
  | { kind: 'loading' }
  | { kind: 'ready'; latestHash: string | null; versions: VersionOption[] }
  | { kind: 'error' }

function formatLapTime(ms: number): string {
  const total = Math.max(0, Math.round(ms))
  const minutes = Math.floor(total / 60000)
  const seconds = Math.floor((total % 60000) / 1000)
  const millis = total % 1000
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`
}

function shortHash(hash: string): string {
  return hash.slice(0, 8)
}

export function Leaderboard({ slug, versionHash, onBack }: LeaderboardProps) {
  const router = useRouter()
  const [selectedHash, setSelectedHash] = useState<string>(versionHash)
  const [board, setBoard] = useState<BoardState>({ kind: 'loading' })
  const [versionsState, setVersionsState] = useState<VersionsState>({
    kind: 'loading',
  })

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch(`/api/track/${encodeURIComponent(slug)}`, {
          cache: 'no-store',
        })
        if (!res.ok) throw new Error(`status ${res.status}`)
        const body = (await res.json()) as TrackApiResponse
        if (cancelled) return
        const versions: VersionOption[] = Array.isArray(body.versions)
          ? body.versions
              .filter((v) => v && typeof v.hash === 'string')
              .map((v) => ({ hash: v.hash, createdAt: v.createdAt }))
          : []
        const hasCurrent = versions.some((v) => v.hash === versionHash)
        if (!hasCurrent) {
          versions.unshift({ hash: versionHash, createdAt: null })
        }
        setVersionsState({
          kind: 'ready',
          latestHash: body.versionHash ?? null,
          versions,
        })
      } catch {
        if (cancelled) return
        setVersionsState({ kind: 'error' })
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [slug, versionHash])

  useEffect(() => {
    let cancelled = false
    setBoard({ kind: 'loading' })
    async function load() {
      try {
        const res = await fetch(
          `/api/leaderboard?slug=${encodeURIComponent(slug)}&v=${selectedHash}`,
          { cache: 'no-store' },
        )
        if (!res.ok) throw new Error(`status ${res.status}`)
        const body = (await res.json()) as LeaderboardApiResponse
        if (cancelled) return
        setBoard({
          kind: 'ready',
          entries: body.entries,
          meBestRank: body.meBestRank,
        })
      } catch (e) {
        if (cancelled) return
        setBoard({
          kind: 'error',
          message: e instanceof Error ? e.message : 'failed to load',
        })
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [slug, selectedHash])

  const dropdown = useMemo(() => {
    if (versionsState.kind !== 'ready') return null
    const latestHash = versionsState.latestHash
    const options = versionsState.versions.map((v) => {
      const labelParts: string[] = [`v${shortHash(v.hash)}`]
      const date = formatIsoDate(v.createdAt)
      if (date) labelParts.push(date)
      const tags: string[] = []
      if (v.hash === latestHash) tags.push('latest')
      if (v.hash === versionHash) tags.push('racing')
      const tagSuffix = tags.length > 0 ? ` (${tags.join(', ')})` : ''
      return {
        hash: v.hash,
        label: `${labelParts.join(' ')}${tagSuffix}`,
      }
    })
    return options
  }, [versionsState, versionHash])

  const latestHash =
    versionsState.kind === 'ready' ? versionsState.latestHash : null
  const isRacingSelected = selectedHash === versionHash
  const targetRaceHref =
    latestHash && selectedHash === latestHash
      ? `/${slug}`
      : `/${slug}?v=${selectedHash}`

  return (
    <div style={overlay}>
      <div style={panel}>
        <div style={header}>
          <button onClick={onBack} style={backBtn} aria-label="Back">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Back
          </button>
          <div style={titleStyle}>LEADERBOARD</div>
          <div style={versionStyle}>v{shortHash(selectedHash)}</div>
        </div>

        <div style={controlsRow}>
          <label style={dropdownLabel}>
            VERSION
            <select
              value={selectedHash}
              onChange={(e) => setSelectedHash(e.target.value)}
              style={selectStyle}
              disabled={dropdown === null || dropdown.length <= 1}
              aria-label="Track version"
            >
              {dropdown === null ? (
                <option value={selectedHash}>v{shortHash(selectedHash)}</option>
              ) : (
                dropdown.map((opt) => (
                  <option key={opt.hash} value={opt.hash}>
                    {opt.label}
                  </option>
                ))
              )}
            </select>
          </label>
          {!isRacingSelected ? (
            <button
              type="button"
              onClick={() => router.push(targetRaceHref)}
              style={raceBtn}
            >
              Race this version
            </button>
          ) : null}
        </div>

        {board.kind === 'loading' ? (
          <div style={status}>Loading leaderboard...</div>
        ) : board.kind === 'error' ? (
          <div style={status}>Could not load leaderboard.</div>
        ) : board.entries.length === 0 ? (
          <div style={status}>
            No times yet on this track. Be the first.
          </div>
        ) : (
          <div style={tableWrap}>
            <div style={headerRow}>
              <div style={{ ...cell, ...rankCell }}>#</div>
              <div style={{ ...cell, ...initialsCell }}>RACER</div>
              <div style={{ ...cell, ...timeCell }}>TIME</div>
              <div style={{ ...cell, ...dateCell }}>DATE</div>
            </div>
            <div style={scrollArea}>
              {board.entries.map((e) => (
                <div
                  key={`${e.rank}-${e.ts}`}
                  style={{ ...row, ...(e.isMe ? meRow : null) }}
                >
                  <div style={{ ...cell, ...rankCell }}>{e.rank}</div>
                  <div style={{ ...cell, ...initialsCell }}>
                    {e.initials}
                    {e.isMe ? <span style={meBadge}>you</span> : null}
                  </div>
                  <div style={{ ...cell, ...timeCell, fontFamily: 'monospace' }}>
                    {formatLapTime(e.lapTimeMs)}
                  </div>
                  <div style={{ ...cell, ...dateCell }}>{formatDate(e.ts)}</div>
                </div>
              ))}
            </div>
            {board.meBestRank !== null ? (
              <div style={footer}>Your best on this track: #{board.meBestRank}</div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}

const overlay: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.55)',
  display: 'grid',
  placeItems: 'center',
  zIndex: 100,
  fontFamily: 'system-ui, sans-serif',
}
const panel: React.CSSProperties = {
  background: '#1a1a1a',
  color: 'white',
  borderRadius: 12,
  padding: 20,
  width: 520,
  maxWidth: 'calc(100vw - 32px)',
  maxHeight: 'calc(100vh - 64px)',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
  border: '1px solid #333',
}
const header: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
}
const titleStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 800,
  letterSpacing: 2,
  flex: 1,
  textAlign: 'center',
}
const versionStyle: React.CSSProperties = {
  fontSize: 11,
  opacity: 0.55,
  fontFamily: 'monospace',
}
const backBtn: React.CSSProperties = {
  background: '#2a2a2a',
  color: 'white',
  border: 'none',
  borderRadius: 6,
  padding: '6px 10px',
  cursor: 'pointer',
  fontSize: 13,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  fontFamily: 'inherit',
}
const controlsRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-end',
  gap: 10,
  padding: '4px 2px 8px',
  borderBottom: '1px solid #2a2a2a',
}
const dropdownLabel: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  fontSize: 10,
  letterSpacing: 1.3,
  opacity: 0.65,
  flex: 1,
  minWidth: 0,
}
const selectStyle: React.CSSProperties = {
  background: '#2a2a2a',
  color: 'white',
  border: '1px solid #3a3a3a',
  borderRadius: 6,
  padding: '6px 8px',
  fontSize: 13,
  fontFamily: 'inherit',
  cursor: 'pointer',
  minWidth: 0,
  width: '100%',
}
const raceBtn: React.CSSProperties = {
  background: '#ff6b35',
  color: 'white',
  border: 'none',
  borderRadius: 6,
  padding: '8px 12px',
  cursor: 'pointer',
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: 0.6,
  fontFamily: 'inherit',
  whiteSpace: 'nowrap',
}
const status: React.CSSProperties = {
  textAlign: 'center',
  padding: 24,
  opacity: 0.7,
}
const tableWrap: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  minHeight: 0,
}
const scrollArea: React.CSSProperties = {
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
}
const headerRow: React.CSSProperties = {
  display: 'flex',
  fontSize: 11,
  letterSpacing: 1.3,
  opacity: 0.6,
  padding: '0 8px 4px',
  borderBottom: '1px solid #333',
}
const row: React.CSSProperties = {
  display: 'flex',
  padding: '6px 8px',
  borderRadius: 4,
  fontSize: 14,
}
const meRow: React.CSSProperties = {
  background: 'rgba(255,107,53,0.18)',
  fontWeight: 600,
}
const cell: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
}
const rankCell: React.CSSProperties = { width: 40 }
const initialsCell: React.CSSProperties = { flex: 1, gap: 6 }
const timeCell: React.CSSProperties = { width: 110 }
const dateCell: React.CSSProperties = { width: 100, opacity: 0.65, fontSize: 12 }
const meBadge: React.CSSProperties = {
  fontSize: 10,
  background: '#ff6b35',
  color: 'white',
  borderRadius: 3,
  padding: '1px 5px',
  letterSpacing: 0.8,
  fontWeight: 700,
}
const footer: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.7,
  textAlign: 'center',
  paddingTop: 6,
  borderTop: '1px solid #333',
}
