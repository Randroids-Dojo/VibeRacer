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

const SOURCE_ACCENT: Record<TuningChangeSource, string> = {
  slider: '#5fb4ff',
  savedApplied: '#ff6b35',
  recommended: '#a472ff',
  reset: '#9aa0a6',
  imported: '#7ad6a1',
  leaderboard: '#ffd166',
  historyRevert: '#cfcfcf',
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
            style={chip(!showAll)}
            aria-pressed={!showAll}
          >
            This track
          </button>
          <button
            onClick={() => setShowAll(true)}
            style={chip(showAll)}
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
              borderLeft: isLive
                ? '3px solid #ff6b35'
                : '3px solid transparent',
            }}
          >
            <div style={rowHead}>
              <span style={timeStamp}>{formatPbAge(entry.changedAt)}</span>
              <span
                style={{
                  ...sourcePill,
                  background: SOURCE_ACCENT[entry.source],
                  color: entry.source === 'reset' ? '#161616' : '#0e0e0e',
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

function chip(active: boolean): CSSProperties {
  return {
    background: active ? '#ff6b35' : '#1d1d1d',
    color: active ? '#161616' : '#cfcfcf',
    border: active ? '1px solid #ff6b35' : '1px solid #2a2a2a',
    borderRadius: 999,
    padding: '4px 10px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
  }
}

const countLabel: CSSProperties = {
  fontSize: 11,
  color: '#9aa0a6',
}

const row: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  padding: '10px 12px',
  background: '#1d1d1d',
  border: '1px solid #2a2a2a',
  borderRadius: 10,
}

const rowHead: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flexWrap: 'wrap',
}

const timeStamp: CSSProperties = {
  fontSize: 12,
  color: '#cfcfcf',
  fontWeight: 600,
}

const sourcePill: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: 0.6,
  textTransform: 'uppercase',
  padding: '2px 8px',
  borderRadius: 999,
}

const labelText: CSSProperties = {
  fontSize: 12,
  color: '#fff',
  opacity: 0.85,
}

const liveTag: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: 0.8,
  color: '#161616',
  background: '#ff6b35',
  padding: '2px 6px',
  borderRadius: 4,
}

const slugText: CSSProperties = {
  fontSize: 10,
  color: '#9aa0a6',
  fontFamily: 'ui-monospace, monospace',
}

const summaryBtn: CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#cfcfcf',
  fontSize: 12,
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
  color: '#9aa0a6',
}

const deltaWrap: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  padding: '6px 8px',
  background: '#0e0e0e',
  border: '1px solid #2a2a2a',
  borderRadius: 6,
  fontSize: 12,
}

const deltaRow: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 12,
}

const deltaLabel: CSSProperties = {
  color: '#cfcfcf',
}

const deltaNums: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 4,
  fontFamily: 'ui-monospace, monospace',
}

const deltaFrom: CSSProperties = {
  color: '#9aa0a6',
}

const deltaArrow: CSSProperties = {
  color: '#9aa0a6',
}

const deltaTo: CSSProperties = {
  color: '#fff',
  fontWeight: 600,
}

const deltaUnit: CSSProperties = {
  color: '#666',
  fontSize: 10,
}

const actions: CSSProperties = {
  display: 'flex',
  gap: 6,
  marginTop: 4,
}

const applyBtn: CSSProperties = {
  background: '#ff6b35',
  color: '#161616',
  border: 'none',
  borderRadius: 6,
  padding: '6px 12px',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const ghostBtn: CSSProperties = {
  background: 'transparent',
  color: '#cfcfcf',
  border: '1px solid #3a3a3a',
  borderRadius: 6,
  padding: '6px 10px',
  fontSize: 12,
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const emptyBox: CSSProperties = {
  padding: 12,
  background: '#1d1d1d',
  border: '1px dashed #2a2a2a',
  borderRadius: 8,
  color: '#9aa0a6',
  fontSize: 12,
  lineHeight: 1.4,
}
