'use client'
import { useMemo, useState, type CSSProperties } from 'react'
import {
  CONTROL_TYPE_LABELS,
  TRACK_TAG_LABELS,
  computeOverallRating,
  filterSaved,
  sortSaved,
  type ControlType,
  type SavedTuning,
  type SortBy,
  type TrackTag,
} from '@/lib/tuningLab'

interface Props {
  items: SavedTuning[]
  onApply: (t: SavedTuning) => void
  onExport: (t: SavedTuning) => void
  onDelete: (id: string) => void
  onRename: (id: string, name: string) => void
}

const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: 'updatedDesc', label: 'Recently updated' },
  { value: 'overallRatingDesc', label: 'Highest rated' },
  { value: 'lapAsc', label: 'Fastest lap' },
  { value: 'nameAsc', label: 'Name A to Z' },
]

const CONTROL_FILTERS: (ControlType | 'all')[] = [
  'all',
  'keyboard',
  'touch_single',
  'touch_dual',
]

const TAG_FILTERS: (TrackTag | 'all')[] = [
  'all',
  'twisty',
  'fast',
  'mixed',
  'technical',
]

export function TuningSavedList({
  items,
  onApply,
  onExport,
  onDelete,
  onRename,
}: Props) {
  const [sortBy, setSortBy] = useState<SortBy>('updatedDesc')
  const [controlFilter, setControlFilter] = useState<ControlType | 'all'>('all')
  const [tagFilter, setTagFilter] = useState<TrackTag | 'all'>('all')
  const [search, setSearch] = useState('')

  const visible = useMemo(() => {
    const filtered = filterSaved(items, {
      controlType: controlFilter === 'all' ? undefined : controlFilter,
      trackTag: tagFilter === 'all' ? undefined : tagFilter,
      search,
    })
    return sortSaved(filtered, sortBy)
  }, [items, controlFilter, tagFilter, search, sortBy])

  return (
    <div style={wrap}>
      <div style={controls}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name"
          style={searchField}
        />
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortBy)}
          style={selectField}
          aria-label="Sort"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div style={filterRow} role="group" aria-label="Filter by control">
        {CONTROL_FILTERS.map((f) => {
          const label =
            f === 'all' ? 'Any control' : CONTROL_TYPE_LABELS[f as ControlType]
          const active = controlFilter === f
          return (
            <button
              key={f}
              onClick={() => setControlFilter(f)}
              style={{ ...chip, background: active ? '#ff6b35' : '#1d1d1d' }}
            >
              {label}
            </button>
          )
        })}
      </div>

      <div style={filterRow} role="group" aria-label="Filter by track tag">
        {TAG_FILTERS.map((f) => {
          const label =
            f === 'all' ? 'Any track' : TRACK_TAG_LABELS[f as TrackTag]
          const active = tagFilter === f
          return (
            <button
              key={f}
              onClick={() => setTagFilter(f)}
              style={{ ...chip, background: active ? '#ff6b35' : '#1d1d1d' }}
            >
              {label}
            </button>
          )
        })}
      </div>

      {visible.length === 0 ? (
        <div style={empty}>
          {items.length === 0
            ? 'No saved tunings yet. Run a session and save one.'
            : 'No tunings match these filters.'}
        </div>
      ) : (
        <div style={list}>
          {visible.map((t) => (
            <Row
              key={t.id}
              t={t}
              onApply={onApply}
              onExport={onExport}
              onDelete={onDelete}
              onRename={onRename}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function Row({
  t,
  onApply,
  onExport,
  onDelete,
  onRename,
}: {
  t: SavedTuning
  onApply: (t: SavedTuning) => void
  onExport: (t: SavedTuning) => void
  onDelete: (id: string) => void
  onRename: (id: string, name: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(t.name)
  const overall = computeOverallRating(t.ratings)
  const dots = Math.round(overall * 5)

  return (
    <div style={row}>
      <div style={rowHeader}>
        {editing ? (
          <input
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 48))}
            onBlur={() => {
              if (name.trim()) onRename(t.id, name.trim())
              setEditing(false)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                ;(e.target as HTMLInputElement).blur()
              } else if (e.key === 'Escape') {
                setName(t.name)
                setEditing(false)
              }
            }}
            autoFocus
            style={renameField}
          />
        ) : (
          <button
            onClick={() => setEditing(true)}
            style={rowName}
            aria-label={`Rename ${t.name}`}
          >
            {t.name}
          </button>
        )}
        <div style={ratingDots} aria-label={`Rating ${dots} of 5`}>
          {[0, 1, 2, 3, 4].map((i) => (
            <span
              key={i}
              style={{ ...dot, background: i < dots ? '#ff6b35' : '#3a3a3a' }}
            />
          ))}
        </div>
      </div>

      <div style={badges}>
        <span style={badge}>{CONTROL_TYPE_LABELS[t.controlType]}</span>
        {t.trackTags.map((tag) => (
          <span key={tag} style={badge}>
            {TRACK_TAG_LABELS[tag]}
          </span>
        ))}
        {t.lapTimeMs !== null ? (
          <span style={badge}>{(t.lapTimeMs / 1000).toFixed(2)}s</span>
        ) : null}
      </div>

      {t.notes ? <div style={noteText}>{t.notes}</div> : null}

      <div style={rowActions}>
        <button onClick={() => onApply(t)} style={primaryBtn}>
          Use this setup
        </button>
        <button onClick={() => onExport(t)} style={secondaryBtn}>
          Copy JSON
        </button>
        <button
          onClick={() => {
            if (window.confirm(`Delete "${t.name}"?`)) onDelete(t.id)
          }}
          style={dangerBtn}
        >
          Delete
        </button>
      </div>
    </div>
  )
}

const wrap: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  width: '100%',
}
const controls: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr auto',
  gap: 8,
}
const searchField: CSSProperties = {
  background: '#0e0e0e',
  color: 'white',
  border: '1px solid #3a3a3a',
  borderRadius: 8,
  padding: '10px 12px',
  fontFamily: 'inherit',
  fontSize: 14,
}
const selectField: CSSProperties = {
  background: '#0e0e0e',
  color: 'white',
  border: '1px solid #3a3a3a',
  borderRadius: 8,
  padding: '10px 12px',
  fontFamily: 'inherit',
  fontSize: 13,
}
const filterRow: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
}
const chip: CSSProperties = {
  background: '#1d1d1d',
  color: 'white',
  border: '1px solid #2a2a2a',
  borderRadius: 999,
  padding: '6px 12px',
  fontSize: 12,
  cursor: 'pointer',
  fontFamily: 'inherit',
}
const list: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
}
const row: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  padding: 12,
  background: '#1d1d1d',
  border: '1px solid #2a2a2a',
  borderRadius: 10,
}
const rowHeader: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 8,
}
const rowName: CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: 'white',
  fontSize: 16,
  fontWeight: 700,
  cursor: 'pointer',
  textAlign: 'left',
  padding: 0,
  fontFamily: 'inherit',
}
const renameField: CSSProperties = {
  background: '#0e0e0e',
  color: 'white',
  border: '1px solid #ff6b35',
  borderRadius: 6,
  padding: '6px 8px',
  fontFamily: 'inherit',
  fontSize: 15,
  flex: 1,
}
const ratingDots: CSSProperties = {
  display: 'flex',
  gap: 3,
}
const dot: CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: '50%',
  display: 'inline-block',
}
const badges: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
}
const badge: CSSProperties = {
  fontSize: 11,
  padding: '3px 8px',
  background: '#0e0e0e',
  color: '#cfcfcf',
  borderRadius: 999,
  letterSpacing: 0.5,
}
const noteText: CSSProperties = {
  fontSize: 12,
  opacity: 0.7,
  color: 'white',
  lineHeight: 1.4,
}
const rowActions: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
}
const primaryBtn: CSSProperties = {
  background: '#ff6b35',
  color: 'white',
  border: 'none',
  borderRadius: 6,
  padding: '8px 12px',
  fontSize: 13,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'inherit',
}
const secondaryBtn: CSSProperties = {
  background: 'transparent',
  color: '#cfcfcf',
  border: '1px solid #3a3a3a',
  borderRadius: 6,
  padding: '8px 12px',
  fontSize: 13,
  cursor: 'pointer',
  fontFamily: 'inherit',
}
const dangerBtn: CSSProperties = {
  background: 'transparent',
  color: '#ff8a8a',
  border: '1px solid #553030',
  borderRadius: 6,
  padding: '8px 12px',
  fontSize: 13,
  cursor: 'pointer',
  fontFamily: 'inherit',
}
const empty: CSSProperties = {
  color: '#9aa0a6',
  fontSize: 13,
  fontStyle: 'italic',
  padding: 16,
  textAlign: 'center',
  background: '#1d1d1d',
  borderRadius: 8,
}
