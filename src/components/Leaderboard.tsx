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
import {
  DEFAULT_SORT_DIRECTION,
  LEADERBOARD_DEFAULT_LIMIT,
  sortLeaderboardEntries,
  type LeaderboardSortKey,
  type SortDirection,
} from '@/lib/leaderboard'
import { useClickSfx } from '@/hooks/useClickSfx'
import { shouldOfferChase, type RivalSelection } from '@/lib/rivalGhost'

interface LeaderboardProps {
  slug: string
  versionHash: string
  onBack: () => void
  // Optional: when provided, the "Try this setup" button on a board entry
  // applies that entry's tuning to the player's setup and closes the board.
  onApplyTuning?: (params: CarParams) => void
  // Optional: when provided, the "Chase" button on each entry hands the
  // selected rival to the parent (typically Game.tsx), which fetches the
  // matching replay and swaps it in as the active ghost. The leaderboard
  // closes itself after a successful pick so the player drops straight back
  // into the race.
  onChaseRival?: (rival: RivalSelection) => void
  // The rival currently being chased (if any), so the matching row can show
  // a "CHASING" pill in place of the Chase button. Lets the player toggle
  // back to the auto / pb / lastLap source via a Cancel chase action.
  activeRivalNonce?: string | null
  // Cancels the rival chase and returns the renderer to the player's stored
  // ghost source. Wired to the "Cancel chase" affordance that surfaces
  // alongside the Chase column header when a rival is active.
  onCancelChase?: () => void
}

// Local entry shape mirrors LeaderboardEntry but treats `nonce` as nullable so
// a response from a previous deploy that has not yet shipped the field still
// parses cleanly. shouldOfferChase rejects any entry whose nonce is missing or
// malformed, so a stale member value just hides the Chase button instead of
// poisoning the row.
interface Entry {
  rank: number
  initials: string
  lapTimeMs: number
  ts: number
  isMe: boolean
  tuning: CarParams | null
  inputMode: InputMode | null
  nonce: string | null
}

// Raw shape coming back from `/api/leaderboard`. Nonce is optional so a
// response from a previous deploy (no nonce field on entries yet) parses
// cleanly; the loader normalizes the value to `string | null` before storing
// in board state.
interface RawLeaderboardEntry extends Omit<Entry, 'nonce'> {
  nonce?: string | null
}
interface LeaderboardApiResponse {
  entries: RawLeaderboardEntry[]
  meBestRank: number | null
  pagination?: {
    offset: number
    limit: number
    total: number
    hasPrev: boolean
    hasNext: boolean
  }
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
  | {
      kind: 'ready'
      entries: Entry[]
      meBestRank: number | null
      pagination: LeaderboardApiResponse['pagination']
    }
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
  onChaseRival,
  activeRivalNonce,
  onCancelChase,
}: LeaderboardProps) {
  const router = useRouter()
  const [selectedHash, setSelectedHash] = useState<string>(versionHash)
  const [pageOffset, setPageOffset] = useState(0)
  const [board, setBoard] = useState<BoardState>({ kind: 'loading' })
  const [versionsState, setVersionsState] = useState<VersionsState>({
    kind: 'loading',
  })
  const [setupForEntry, setSetupForEntry] = useState<Entry | null>(null)
  // Default to rank ascending so the board reads as the server delivered it.
  const [sortKey, setSortKey] = useState<LeaderboardSortKey>('rank')
  const [sortDirection, setSortDirection] = useState<SortDirection>(
    DEFAULT_SORT_DIRECTION.rank,
  )
  const clickBack = useClickSfx('back')
  const clickConfirm = useClickSfx('confirm')
  const clickSort = useClickSfx('soft')

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
        const params = new URLSearchParams({
          slug,
          v: selectedHash,
          limit: String(LEADERBOARD_DEFAULT_LIMIT),
          offset: String(pageOffset),
        })
        const res = await fetch(
          `/api/leaderboard?${params.toString()}`,
          { cache: 'no-store' },
        )
        if (!res.ok) throw new Error(`status ${res.status}`)
        const body = (await res.json()) as LeaderboardApiResponse
        if (cancelled) return
        // Normalize the optional `nonce` field so a stale server response
        // (deploy that predates the field) lands in our `Entry` shape with
        // an explicit null instead of `undefined`. shouldOfferChase rejects
        // null nonces, so the affected rows just hide the Chase button.
        const entries: Entry[] = body.entries.map((raw) => ({
          ...raw,
          nonce: typeof raw.nonce === 'string' ? raw.nonce : null,
        }))
        setBoard({
          kind: 'ready',
          entries,
          meBestRank: body.meBestRank,
          pagination: body.pagination,
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
  }, [slug, selectedHash, pageOffset])

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
  const isLatestSelected = latestHash !== null && selectedHash === latestHash
  const targetRaceHref =
    latestHash && selectedHash === latestHash
      ? `/${slug}`
      : `/${slug}?v=${selectedHash}`
  // Forking the latest is identical to opening /<slug>/edit (which loads
  // latest by default). Forking an older version explicitly threads ?v=hash so
  // the editor seeds from that historical pieces array.
  const targetForkHref = isLatestSelected
    ? `/${slug}/edit`
    : `/${slug}/edit?v=${selectedHash}`

  // Sorted view of the entries. The original `rank` column always reflects
  // the server-side leaderboard rank so re-sorting by date or racer still
  // shows "you finished #3" honestly.
  const sortedEntries = useMemo(() => {
    if (board.kind !== 'ready') return []
    return sortLeaderboardEntries(board.entries, sortKey, sortDirection)
  }, [board, sortKey, sortDirection])
  const pagination = board.kind === 'ready' ? board.pagination : undefined
  const totalRows =
    pagination?.total ?? (board.kind === 'ready' ? board.entries.length : 0)
  const firstRow =
    pagination && board.kind === 'ready' && board.entries.length > 0
      ? pagination.offset + 1
      : 0
  const lastRow =
    pagination && board.kind === 'ready' && board.entries.length > 0
      ? pagination.offset + board.entries.length
      : 0

  function handleSort(key: LeaderboardSortKey) {
    clickSort()
    if (sortKey === key) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(key)
    setSortDirection(DEFAULT_SORT_DIRECTION[key])
  }

  return (
    <div style={overlay}>
      <div style={panel}>
        <div style={header}>
          <button
            onClick={() => {
              clickBack()
              onBack()
            }}
            style={backBtn}
            aria-label="Back"
          >
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
              onChange={(e) => {
                setSelectedHash(e.target.value)
                setPageOffset(0)
              }}
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
              onClick={() => {
                clickConfirm()
                router.push(targetRaceHref)
              }}
              style={raceBtn}
            >
              Race this version
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              clickConfirm()
              router.push(targetForkHref)
            }}
            style={forkBtn}
            title={
              isLatestSelected
                ? 'Open the editor on the latest pieces'
                : 'Open the editor seeded from this version. Saving creates a new version.'
            }
          >
            {isLatestSelected ? 'Edit latest' : 'Fork this version'}
          </button>
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
              <SortHeader
                style={{ ...cell, ...rankCell }}
                label="#"
                columnKey="rank"
                activeKey={sortKey}
                direction={sortDirection}
                onSort={handleSort}
              />
              <div style={{ ...cell, ...inputCell }} aria-label="Input device" />
              <SortHeader
                style={{ ...cell, ...initialsCell }}
                label="RACER"
                columnKey="racer"
                activeKey={sortKey}
                direction={sortDirection}
                onSort={handleSort}
              />
              <SortHeader
                style={{ ...cell, ...timeCell }}
                label="TIME"
                columnKey="time"
                activeKey={sortKey}
                direction={sortDirection}
                onSort={handleSort}
              />
              <SortHeader
                style={{ ...cell, ...dateCell }}
                label="DATE"
                columnKey="date"
                activeKey={sortKey}
                direction={sortDirection}
                onSort={handleSort}
              />
              <div style={{ ...cell, ...chaseCell }}>
                {typeof activeRivalNonce === 'string' && onCancelChase ? (
                  <button
                    type="button"
                    onClick={() => {
                      clickSort()
                      onCancelChase()
                    }}
                    style={cancelChaseBtnStyle}
                    title="Stop chasing the rival ghost and restore your normal ghost source"
                  >
                    Cancel chase
                  </button>
                ) : (
                  <span style={chaseHeaderLabel}>RIVAL</span>
                )}
              </div>
            </div>
            <div style={scrollArea}>
              {sortedEntries.map((e) => {
                const offerChase =
                  Boolean(onChaseRival) &&
                  shouldOfferChase({
                    isMe: e.isMe,
                    nonce: e.nonce ?? null,
                  })
                const isActiveRival =
                  typeof activeRivalNonce === 'string' &&
                  e.nonce === activeRivalNonce
                return (
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
                    <div style={{ ...cell, ...chaseCell }}>
                      {isActiveRival ? (
                        <span style={chasingPillStyle} title="Currently chasing this rival">
                          CHASING
                        </span>
                      ) : offerChase && e.nonce ? (
                        <button
                          type="button"
                          onClick={() => {
                            if (!onChaseRival || !e.nonce) return
                            clickConfirm()
                            onChaseRival({
                              nonce: e.nonce,
                              initials: e.initials,
                              lapTimeMs: e.lapTimeMs,
                              rank: e.rank,
                            })
                          }}
                          style={chaseBtnStyle}
                          title={`Race against ${e.initials}'s lap as your ghost`}
                        >
                          Chase
                        </button>
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </div>
            {pagination ? (
              <div style={pagerRow}>
                <button
                  type="button"
                  onClick={() => {
                    clickSort()
                    setPageOffset(Math.max(0, pagination.offset - pagination.limit))
                  }}
                  disabled={!pagination.hasPrev}
                  style={{
                    ...pagerBtn,
                    opacity: pagination.hasPrev ? 1 : 0.4,
                    cursor: pagination.hasPrev ? 'pointer' : 'not-allowed',
                  }}
                >
                  Prev
                </button>
                <div style={pagerLabel}>
                  {firstRow > 0 && lastRow > 0
                    ? `${firstRow}-${lastRow} of ${totalRows}`
                    : `0 of ${totalRows}`}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    clickSort()
                    setPageOffset(pagination.offset + pagination.limit)
                  }}
                  disabled={!pagination.hasNext}
                  style={{
                    ...pagerBtn,
                    opacity: pagination.hasNext ? 1 : 0.4,
                    cursor: pagination.hasNext ? 'pointer' : 'not-allowed',
                  }}
                >
                  Next
                </button>
              </div>
            ) : null}
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

function SortHeader({
  style,
  label,
  columnKey,
  activeKey,
  direction,
  onSort,
}: {
  style: React.CSSProperties
  label: string
  columnKey: LeaderboardSortKey
  activeKey: LeaderboardSortKey
  direction: SortDirection
  onSort: (key: LeaderboardSortKey) => void
}) {
  const isActive = activeKey === columnKey
  const ariaSort = isActive
    ? direction === 'asc'
      ? 'ascending'
      : 'descending'
    : 'none'
  const arrow = isActive ? (direction === 'asc' ? '↑' : '↓') : ''
  return (
    <button
      type="button"
      role="columnheader"
      aria-sort={ariaSort}
      onClick={() => onSort(columnKey)}
      style={{ ...sortHeaderBtn, ...style, ...(isActive ? sortHeaderActive : null) }}
      title={`Sort by ${label.toLowerCase() === '#' ? 'rank' : label.toLowerCase()}`}
    >
      <span>{label}</span>
      {arrow ? <span style={sortArrow}>{arrow}</span> : null}
    </button>
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
  if (mode === 'gamepad') {
    return (
      <span style={iconSlot} title="Raced with gamepad" aria-label="Gamepad">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 8h12a4 4 0 0 1 4 4v2a3 3 0 0 1-5.4 1.8L15 14H9l-1.6 1.8A3 3 0 0 1 2 14v-2a4 4 0 0 1 4-4z" />
          <line x1="7" y1="11" x2="7" y2="13" />
          <line x1="6" y1="12" x2="8" y2="12" />
          <circle cx="16" cy="11.5" r="0.6" fill="currentColor" />
          <circle cx="17.5" cy="13" r="0.6" fill="currentColor" />
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
  flexWrap: 'wrap',
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
const forkBtn: React.CSSProperties = {
  background: 'transparent',
  color: '#ffd36b',
  border: '1px solid rgba(255, 211, 107, 0.5)',
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
const pagerRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 10,
  padding: '8px 0 4px',
}
const pagerBtn: React.CSSProperties = {
  background: '#2a2a2a',
  color: 'white',
  border: '1px solid #3a3a3a',
  borderRadius: 6,
  padding: '6px 12px',
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: 0.6,
  fontFamily: 'inherit',
}
const pagerLabel: React.CSSProperties = {
  minWidth: 96,
  textAlign: 'center',
  fontSize: 12,
  opacity: 0.7,
  fontVariantNumeric: 'tabular-nums',
}
const headerRow: React.CSSProperties = {
  display: 'flex',
  fontSize: 11,
  letterSpacing: 1.3,
  opacity: 0.85,
  padding: '0 8px 4px',
  borderBottom: '1px solid #333',
}
const sortHeaderBtn: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: 'inherit',
  font: 'inherit',
  letterSpacing: 'inherit',
  padding: '4px 0',
  margin: 0,
  cursor: 'pointer',
  textAlign: 'left',
  opacity: 0.6,
  display: 'flex',
  alignItems: 'center',
  gap: 4,
}
const sortHeaderActive: React.CSSProperties = {
  opacity: 1,
  color: '#ffd36b',
}
const sortArrow: React.CSSProperties = {
  fontSize: 12,
  lineHeight: 1,
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
// Right-most column. Holds either the per-row Chase button, the CHASING pill
// for the active rival row, or the Cancel chase shortcut in the header. Sized
// to fit the longest of those affordances without wrapping at the default
// panel width.
const chaseCell: React.CSSProperties = {
  width: 70,
  justifyContent: 'flex-end',
}
const chaseHeaderLabel: React.CSSProperties = {
  fontSize: 11,
  letterSpacing: 1.3,
  opacity: 0.5,
  paddingRight: 4,
}
const chaseBtnStyle: React.CSSProperties = {
  background: 'rgba(120, 220, 255, 0.16)',
  color: '#7fe6ff',
  border: '1px solid rgba(120, 220, 255, 0.5)',
  borderRadius: 4,
  padding: '2px 8px',
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 0.6,
  fontFamily: 'inherit',
  cursor: 'pointer',
  textTransform: 'uppercase',
}
const chasingPillStyle: React.CSSProperties = {
  background: '#7fe6ff',
  color: '#0c2530',
  border: 'none',
  borderRadius: 4,
  padding: '2px 8px',
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: 0.8,
  fontFamily: 'inherit',
}
const cancelChaseBtnStyle: React.CSSProperties = {
  background: 'transparent',
  color: '#cdf2ff',
  border: '1px solid rgba(120, 220, 255, 0.45)',
  borderRadius: 4,
  padding: '2px 6px',
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: 0.6,
  fontFamily: 'inherit',
  cursor: 'pointer',
  textTransform: 'uppercase',
}
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
