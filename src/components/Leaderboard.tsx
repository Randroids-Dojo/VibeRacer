'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatDate, formatIsoDate } from '@/lib/formatDate'
import type { CarParams } from '@/game/physics'
import {
  TUNING_PARAM_META,
  cloneDefaultParams,
  isStockParams,
  type InputMode,
} from '@/lib/tuningSettings'

interface LeaderboardProps {
  slug: string
  versionHash: string
  onBack: () => void
  // Optional: when provided, the "Try this setup" button on a board entry
  // applies that entry's tuning to the player's setup and closes the board.
  onApplyTuning?: (params: CarParams) => void
}

interface Entry {
  rank: number
  initials: string
  lapTimeMs: number
  ts: number
  isMe: boolean
  tuning: CarParams | null
  inputMode: InputMode | null
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

export function Leaderboard({
  slug,
  versionHash,
  onBack,
  onApplyTuning,
}: LeaderboardProps) {
  const router = useRouter()
  const [selectedHash, setSelectedHash] = useState<string>(versionHash)
  const [board, setBoard] = useState<BoardState>({ kind: 'loading' })
  const [versionsState, setVersionsState] = useState<VersionsState>({
    kind: 'loading',
  })
  const [setupForEntry, setSetupForEntry] = useState<Entry | null>(null)

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
              <div style={{ ...cell, ...inputCell }} aria-label="Input device" />
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
                  <div style={{ ...cell, ...inputCell }}>
                    <InputModeIcon mode={e.inputMode} />
                  </div>
                  <div style={{ ...cell, ...initialsCell }}>
                    <span>{e.initials}</span>
                    {e.isMe ? <span style={meBadge}>you</span> : null}
                    <SetupChip entry={e} onView={() => setSetupForEntry(e)} />
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

      {setupForEntry ? (
        <SetupPopover
          entry={setupForEntry}
          canApply={Boolean(onApplyTuning) && setupForEntry.tuning !== null}
          onApply={() => {
            if (onApplyTuning && setupForEntry.tuning) {
              onApplyTuning(setupForEntry.tuning)
            }
            setSetupForEntry(null)
          }}
          onClose={() => setSetupForEntry(null)}
        />
      ) : null}
    </div>
  )
}

function InputModeIcon({ mode }: { mode: InputMode | null }) {
  if (mode === 'keyboard') {
    return (
      <span style={iconSlot} title="Raced with keyboard" aria-label="Keyboard">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="6" width="20" height="12" rx="2" />
          <line x1="6" y1="10" x2="6" y2="10" />
          <line x1="10" y1="10" x2="10" y2="10" />
          <line x1="14" y1="10" x2="14" y2="10" />
          <line x1="18" y1="10" x2="18" y2="10" />
          <line x1="7" y1="14" x2="17" y2="14" />
        </svg>
      </span>
    )
  }
  if (mode === 'touch') {
    return (
      <span style={iconSlot} title="Raced on touch" aria-label="Touch">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="6" y="2" width="12" height="20" rx="2" />
          <line x1="11" y1="18" x2="13" y2="18" />
        </svg>
      </span>
    )
  }
  return (
    <span style={{ ...iconSlot, opacity: 0.25 }} title="Unknown input" aria-label="Unknown input">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
      </svg>
    </span>
  )
}

function SetupChip({
  entry,
  onView,
}: {
  entry: Entry
  onView: () => void
}) {
  if (entry.tuning === null) return null
  const stock = isStockParams(entry.tuning)
  return (
    <button
      type="button"
      onClick={onView}
      style={stock ? stockChipStyle : tunedChipStyle}
      title={stock ? 'Stock setup' : 'Custom setup, tap to view'}
    >
      {stock ? 'STOCK' : 'SETUP'}
    </button>
  )
}

function SetupPopover({
  entry,
  canApply,
  onApply,
  onClose,
}: {
  entry: Entry
  canApply: boolean
  onApply: () => void
  onClose: () => void
}) {
  const tuning = entry.tuning
  const stock = tuning !== null && isStockParams(tuning)
  const defaults = cloneDefaultParams()

  async function copyJson() {
    if (!tuning) return
    try {
      await navigator.clipboard.writeText(JSON.stringify(tuning, null, 2))
    } catch {
      // ignore; clipboard can fail on insecure contexts
    }
  }

  return (
    <div style={popoverOverlay} onClick={onClose}>
      <div style={popoverPanel} onClick={(e) => e.stopPropagation()}>
        <div style={popoverHeader}>
          <div style={popoverTitle}>{entry.initials}&apos;s SETUP</div>
          <button onClick={onClose} style={closeBtn} aria-label="Close setup">
            CLOSE
          </button>
        </div>
        {tuning === null ? (
          <div style={status}>No setup recorded for this lap.</div>
        ) : (
          <>
            <div style={popoverSubtitle}>
              {stock ? (
                <span style={stockChipStyle}>STOCK</span>
              ) : (
                <span style={tunedChipStyle}>TUNED</span>
              )}
              <span style={{ fontSize: 11, opacity: 0.7 }}>
                {formatLapTime(entry.lapTimeMs)} on this lap
              </span>
            </div>
            <div style={paramList}>
              {TUNING_PARAM_META.map((m) => {
                const val = tuning[m.key]
                const def = defaults[m.key]
                const diff = Math.abs(val - def) > 1e-9
                return (
                  <div key={m.key} style={paramRow}>
                    <div style={paramLabel}>{m.label}</div>
                    <div
                      style={{
                        ...paramValue,
                        color: diff ? '#ff9966' : '#cfcfcf',
                      }}
                    >
                      {val}
                      <span style={paramUnit}>{m.unit}</span>
                    </div>
                    <div style={paramDefault}>def {def}</div>
                  </div>
                )
              })}
            </div>
            <div style={popoverFooter}>
              <button type="button" onClick={copyJson} style={copyBtn}>
                Copy JSON
              </button>
              <button
                type="button"
                onClick={onApply}
                disabled={!canApply}
                style={{
                  ...applyBtn,
                  opacity: canApply ? 1 : 0.45,
                  cursor: canApply ? 'pointer' : 'not-allowed',
                }}
              >
                Try this setup
              </button>
            </div>
          </>
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
  width: 560,
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
const rankCell: React.CSSProperties = { width: 32 }
const inputCell: React.CSSProperties = { width: 24, justifyContent: 'center' }
const initialsCell: React.CSSProperties = { flex: 1, gap: 6 }
const timeCell: React.CSSProperties = { width: 100 }
const dateCell: React.CSSProperties = { width: 88, opacity: 0.65, fontSize: 12 }
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
const iconSlot: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#cfcfcf',
}
const stockChipStyle: React.CSSProperties = {
  fontSize: 9,
  background: '#2a2a2a',
  color: '#cfcfcf',
  borderRadius: 3,
  padding: '2px 5px',
  letterSpacing: 1,
  fontWeight: 700,
  border: 'none',
  cursor: 'pointer',
  fontFamily: 'inherit',
}
const tunedChipStyle: React.CSSProperties = {
  fontSize: 9,
  background: '#ff6b35',
  color: 'white',
  borderRadius: 3,
  padding: '2px 5px',
  letterSpacing: 1,
  fontWeight: 700,
  border: 'none',
  cursor: 'pointer',
  fontFamily: 'inherit',
}
const popoverOverlay: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.65)',
  display: 'grid',
  placeItems: 'center',
  zIndex: 120,
  padding: 16,
}
const popoverPanel: React.CSSProperties = {
  background: '#161616',
  color: 'white',
  borderRadius: 12,
  padding: '20px 22px',
  minWidth: 320,
  maxWidth: 480,
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
  border: '1px solid #2a2a2a',
  maxHeight: 'calc(100vh - 32px)',
  overflow: 'auto',
}
const popoverHeader: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
}
const popoverTitle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 800,
  letterSpacing: 1.4,
}
const popoverSubtitle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
}
const closeBtn: React.CSSProperties = {
  border: 'none',
  background: 'transparent',
  color: '#ccc',
  cursor: 'pointer',
  fontSize: 12,
  letterSpacing: 1,
  fontFamily: 'inherit',
}
const paramList: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
}
const paramRow: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr auto auto',
  alignItems: 'baseline',
  gap: 10,
  padding: '4px 6px',
  background: '#1d1d1d',
  borderRadius: 4,
}
const paramLabel: React.CSSProperties = {
  fontSize: 12,
}
const paramValue: React.CSSProperties = {
  fontFamily: 'monospace',
  fontSize: 13,
}
const paramUnit: React.CSSProperties = {
  fontSize: 10,
  opacity: 0.6,
  marginLeft: 4,
}
const paramDefault: React.CSSProperties = {
  fontSize: 10,
  opacity: 0.5,
  fontFamily: 'monospace',
}
const popoverFooter: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 8,
  marginTop: 4,
}
const copyBtn: React.CSSProperties = {
  background: 'transparent',
  color: '#cfcfcf',
  border: '1px solid #3a3a3a',
  borderRadius: 8,
  padding: '8px 12px',
  fontSize: 12,
  cursor: 'pointer',
  fontFamily: 'inherit',
}
const applyBtn: React.CSSProperties = {
  background: '#ff6b35',
  color: 'white',
  border: 'none',
  borderRadius: 8,
  padding: '10px 18px',
  fontSize: 13,
  fontWeight: 700,
  fontFamily: 'inherit',
}
