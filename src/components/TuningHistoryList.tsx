'use client'
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import type { CarParams } from '@/game/physics'
import { formatPbAge } from '@/lib/pbHistory'
import {
  TUNING_SOURCE_LABELS,
  paramsEqual,
  sortTuningHistoryNewestFirst,
  summarizeChangedKeys,
  type TuningChangeSource,
  type TuningHistoryEntry,
} from '@/lib/tuningHistory'
import { formatTuningValue, getTuningParamMeta } from '@/lib/tuningSettings'
import { menuTheme } from './menuTheme'

export interface TuningHistoryListProps {
  entries: TuningHistoryEntry[]
  liveParams: CarParams
  onApply: (entry: TuningHistoryEntry) => void
  onSavePreset?: (entry: TuningHistoryEntry) => void
  // When set, default-scope to entries whose slug matches; the UI exposes a
  // toggle to widen back to all slugs. When null, show every entry.
  scopeSlug?: string | null
  emptyHint?: ReactNode
}

// Cartoony source pills. The accent picks the surface fill, and the text
// always lands on dark ink so the pill reads on the cream card surface.
const SOURCE_ACCENT: Record<TuningChangeSource, string> = {
  slider: '#9fd3ff',
  savedApplied: '#ffc89e',
  recommended: '#d4b8ff',
  reset: '#e5e5e5',
  imported: '#b3ecc6',
  leaderboard: '#ffe1a1',
  historyRevert: '#f0e2c8',
}

export function TuningHistoryList({
  entries,
  liveParams,
  onApply,
  onSavePreset,
  scopeSlug = null,
  emptyHint,
}: TuningHistoryListProps) {
  const [showAll, setShowAll] = useState(scopeSlug === null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const filtered = useMemo(() => {
    const sorted = sortTuningHistoryNewestFirst(entries)
    if (showAll || scopeSlug === null) return sorted
    return sorted.filter((e) => e.slug === scopeSlug)
  }, [entries, showAll, scopeSlug])

  if (entries.length === 0) {
    return (
      <div style={emptyBox}>
        {emptyHint ??
          'Recent tuning changes show up here. Tweak a slider, apply a saved tuning, or accept a recommendation to start the log.'}
      </div>
    )
  }

  return (
    <div style={wrap}>
      {scopeSlug !== null ? (
        <div style={filterRow}>
          <button
            onClick={() => setShowAll(false)}
            style={chipStyle(!showAll)}
            aria-pressed={!showAll}
          >
            This track
          </button>
          <button
            onClick={() => setShowAll(true)}
            style={chipStyle(showAll)}
            aria-pressed={showAll}
          >
            All tracks
          </button>
          <span style={{ flex: 1 }} />
          <span style={countLabel}>{filtered.length} entries</span>
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <div style={emptyBox}>No changes for this track yet.</div>
      ) : null}

      {filtered.map((entry) => {
        const isLive = paramsEqual(entry.params, liveParams)
        const isOpen = expanded[entry.id] ?? false
        return (
          <div
            key={entry.id}
            style={{
              ...row,
              borderLeftColor: isLive ? menuTheme.ctaBg : 'transparent',
            }}
          >
            <div style={rowHead}>
              <span style={timeStamp}>{formatPbAge(entry.changedAt)}</span>
              <span
                style={{
                  ...sourcePill,
                  background: SOURCE_ACCENT[entry.source],
                }}
              >
                {TUNING_SOURCE_LABELS[entry.source]}
              </span>
              {entry.label ? <span style={labelText}>{entry.label}</span> : null}
              {isLive ? <span style={liveTag}>LIVE</span> : null}
              <span style={{ flex: 1 }} />
              <span style={slugText}>
                {entry.slug === '__lab__' ? 'lab' : entry.slug}
              </span>
            </div>
            <button
              onClick={() =>
                setExpanded((prev) => ({ ...prev, [entry.id]: !isOpen }))
              }
              style={summaryBtn}
              aria-expanded={isOpen}
            >
              {summarizeChangedKeys(entry, 2)}
              <span style={chevron}>{isOpen ? '▴' : '▾'}</span>
            </button>
            {isOpen ? <DeltaTable entry={entry} /> : null}
            <div style={actions}>
              <button
                onClick={() => onApply(entry)}
                style={applyBtn}
                disabled={isLive}
                title={isLive ? 'Already applied' : 'Apply this tuning'}
              >
                {isLive ? 'Applied' : 'Apply'}
              </button>
              {onSavePreset ? (
                <button
                  onClick={() => onSavePreset(entry)}
                  style={ghostBtn}
                  title="Save this snapshot to your saved tunings"
                >
                  Save as preset
                </button>
              ) : null}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function DeltaTable({ entry }: { entry: TuningHistoryEntry }) {
  const keys = Object.keys(entry.changedKeys) as (keyof CarParams)[]
  if (keys.length === 0) {
    return <div style={emptyBox}>No fields changed.</div>
  }
  return (
    <div style={deltaWrap}>
      {keys.map((k) => {
        const meta = getTuningParamMeta(k)
        const d = entry.changedKeys[k]!
        return (
          <div key={k} style={deltaRow}>
            <span style={deltaLabel}>{meta.label}</span>
            <span style={deltaNums}>
              <span style={deltaFrom}>{formatTuningValue(d.from)}</span>
              <span style={deltaArrow}>{'→'}</span>
              <span style={deltaTo}>{formatTuningValue(d.to)}</span>
              <span style={deltaUnit}>{meta.unit}</span>
            </span>
          </div>
        )
      })}
    </div>
  )
}

const wrap: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
}

const filterRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  paddingBottom: 4,
}

function chipStyle(active: boolean): CSSProperties {
  return {
    background: active ? menuTheme.pickSelectedBg : menuTheme.cardBg,
    color: active ? menuTheme.pickSelectedText : menuTheme.cardText,
    border: `2px solid ${active ? menuTheme.pickSelectedBorder : menuTheme.cardBorder}`,
    borderRadius: 999,
    padding: '4px 10px',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'inherit',
    letterSpacing: 0.3,
  }
}

const countLabel: CSSProperties = {
  fontSize: 11,
  color: menuTheme.cardMutedText,
  fontWeight: 600,
}

const row: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  padding: '10px 12px',
  background: menuTheme.cardBg,
  color: menuTheme.cardText,
  border: `2px solid ${menuTheme.cardBorder}`,
  borderLeft: '4px solid transparent',
  borderRadius: 12,
  boxShadow: `0 3px 0 ${menuTheme.cardShadow}`,
}

const rowHead: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flexWrap: 'wrap',
}

const timeStamp: CSSProperties = {
  fontSize: 12,
  color: menuTheme.cardText,
  fontWeight: 700,
}

const sourcePill: CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: 0.6,
  textTransform: 'uppercase',
  padding: '2px 8px',
  borderRadius: 999,
  color: '#1b1b1b',
  border: '1px solid rgba(0,0,0,0.35)',
}

const labelText: CSSProperties = {
  fontSize: 12,
  color: menuTheme.cardText,
  fontWeight: 600,
}

const liveTag: CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: 0.8,
  color: '#fff',
  background: menuTheme.ctaBg,
  border: `1px solid ${menuTheme.ctaShadow}`,
  padding: '2px 6px',
  borderRadius: 4,
}

const slugText: CSSProperties = {
  fontSize: 10,
  color: menuTheme.cardMutedText,
  fontFamily: 'ui-monospace, monospace',
  fontWeight: 700,
}

const summaryBtn: CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: menuTheme.cardText,
  fontSize: 12,
  fontWeight: 600,
  textAlign: 'left',
  padding: 0,
  cursor: 'pointer',
  fontFamily: 'inherit',
  display: 'flex',
  alignItems: 'center',
  gap: 6,
}

const chevron: CSSProperties = {
  fontSize: 10,
  color: menuTheme.cardMutedText,
}

const deltaWrap: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  padding: '6px 8px',
  background: '#fffbe8',
  border: `1px solid ${menuTheme.cardBorder}`,
  borderRadius: 6,
  fontSize: 12,
}

const deltaRow: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 12,
}

const deltaLabel: CSSProperties = {
  color: menuTheme.cardText,
  fontWeight: 600,
}

const deltaNums: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 4,
  fontFamily: 'ui-monospace, monospace',
}

const deltaFrom: CSSProperties = {
  color: menuTheme.cardMutedText,
}

const deltaArrow: CSSProperties = {
  color: menuTheme.cardMutedText,
}

const deltaTo: CSSProperties = {
  color: menuTheme.cardText,
  fontWeight: 700,
}

const deltaUnit: CSSProperties = {
  color: menuTheme.cardMutedText,
  fontSize: 10,
}

const actions: CSSProperties = {
  display: 'flex',
  gap: 6,
  marginTop: 4,
}

const applyBtn: CSSProperties = {
  background: menuTheme.ctaBg,
  color: '#fff',
  border: `2px solid ${menuTheme.ctaShadow}`,
  borderRadius: 8,
  padding: '6px 12px',
  fontSize: 12,
  fontWeight: 800,
  cursor: 'pointer',
  fontFamily: 'inherit',
  boxShadow: `0 3px 0 ${menuTheme.ctaShadow}`,
}

const ghostBtn: CSSProperties = {
  background: '#fffbe8',
  color: menuTheme.cardText,
  border: `2px solid ${menuTheme.cardBorder}`,
  borderRadius: 8,
  padding: '6px 10px',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const emptyBox: CSSProperties = {
  padding: 12,
  background: menuTheme.cardBg,
  border: `2px dashed ${menuTheme.cardBorder}`,
  borderRadius: 12,
  color: menuTheme.cardMutedText,
  fontSize: 12,
  lineHeight: 1.4,
  fontWeight: 600,
}
