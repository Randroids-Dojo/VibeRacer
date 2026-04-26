/**
 * Race calendar heatmap helper. Builds a multi-week grid showing whether the
 * player raced on each UTC day so the home page can render a richer activity
 * view than the seven-day strip in the daily-streak widget.
 *
 * Inspired by the GitHub contribution graph: vertical = day-of-week (Sun..Sat),
 * horizontal = week. Newest week sits on the right with today's cell at the
 * end of the run. Cells past today are flagged `isFuture` so the renderer can
 * paint them as muted placeholders rather than empty "no race" cells, which
 * would imply the player skipped a day they have not yet had.
 *
 * Pure helpers only. Reads no DOM and no storage; the React component pulls
 * the raw history through `readDailyStreakDays` and hands it in. Defensive
 * against malformed entries through `sanitizeDailyStreakDays`.
 */

import {
  MS_PER_DAY,
  parseDateKeyToUtcMs,
  sanitizeDailyStreakDays,
  type DailyStreakDay,
} from './dailyStreak'

/**
 * Default number of weeks the heatmap surfaces. Twelve covers roughly three
 * months of activity, which is enough to read seasonal patterns without
 * overflowing the home-page card on phone widths.
 */
export const RACE_CALENDAR_DEFAULT_WEEKS = 12

/**
 * Hard cap on weeks so a misconfigured caller (or a future widget that wants
 * a "max zoom out" view) cannot blow up the render cost. One year of weeks
 * is well past anything the home page needs.
 */
export const RACE_CALENDAR_MAX_WEEKS = 53

/**
 * Single cell in the calendar grid. `weekday` is 0..6 with 0 = Sunday so the
 * renderer can label the row axis without recomputing it.
 */
export interface RaceCalendarCell {
  // UTC date key (`YYYY-MM-DD`) for this cell.
  dateKey: string
  // True when the player raced on this day.
  raced: boolean
  // True when the cell is strictly after today's UTC date. The renderer
  // paints these as faint placeholders so the right edge of the latest
  // (partial) week reads honestly.
  isFuture: boolean
  // True when the cell is exactly today's UTC date. The renderer rings this
  // cell with the cyan accent so the player can find "now" at a glance.
  isToday: boolean
  // 0..6 with 0 = Sunday. Mirrors `Date.prototype.getUTCDay`.
  weekday: number
}

/**
 * One column of the heatmap grid. Always exactly 7 cells, ordered Sun..Sat.
 * Cells outside the date range (e.g. days BEFORE the start of the oldest
 * week) are excluded from the result so the leftmost and rightmost columns
 * can be partial weeks; the renderer should treat the cell array as the
 * authoritative shape.
 */
export interface RaceCalendarWeek {
  // Index of this week within the grid (0 = oldest, weeks-1 = newest).
  index: number
  // 0-based ISO week-of-year for the Sunday that anchors this column. Used
  // by callers that want a tooltip or aria label without a separate Date
  // computation. Defensive: returns -1 on malformed anchor input.
  weekOfYear: number
  // Always 7 cells, one per weekday. Cells whose `isFuture` is true OR
  // whose `dateKey` falls outside the (today - weeks*7 + 1) ... today range
  // are still present in this array; the renderer decides how to paint
  // them.
  cells: RaceCalendarCell[]
}

/**
 * Snapshot returned by `buildRaceCalendarGrid`. The renderer uses these
 * fields to compose the heatmap header (label strip), the cell grid, and
 * the totals strip below.
 */
export interface RaceCalendarGrid {
  // The week columns, oldest first. Length is `weeks` (the requested
  // number, post-clamp).
  weeks: RaceCalendarWeek[]
  // Number of distinct days inside the visible range that the player raced
  // on. Useful for the renderer's "N race days in 12 weeks" footer.
  racedCount: number
  // Total days the renderer paints (weeks * 7). Useful for percentage math.
  totalCells: number
  // Number of cells that are strictly in the past or today. Excludes future
  // cells so a percentage computed against `racedCount / coveredCells` does
  // not artificially shrink because the latest week is half empty.
  coveredCells: number
  // The UTC date key of today (the rightmost cell, or the cell just past
  // the rightmost depending on how the grid aligns to Saturday). Echoed
  // back so the renderer's tooltip can include it without a second call.
  todayKey: string
}

/**
 * UTC weekday for a date key. Returns 0..6 with 0 = Sunday. Returns -1 on
 * a malformed key so callers can branch defensively without a try/catch.
 */
export function utcWeekdayForDateKey(dateKey: string): number {
  const ms = parseDateKeyToUtcMs(dateKey)
  if (ms === null) return -1
  const d = new Date(ms)
  if (Number.isNaN(d.getTime())) return -1
  return d.getUTCDay()
}

/**
 * Convert a UTC ms instant to a `YYYY-MM-DD` UTC date key. Local helper so
 * the grid builder does not have to import `dateKeyForUtc` from the SSR
 * layer (avoiding a server-only re-import chain in unit tests).
 */
function utcInstantToDateKey(ms: number): string {
  const d = new Date(ms)
  if (Number.isNaN(d.getTime())) return ''
  const yyyy = d.getUTCFullYear()
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

/**
 * Walk back to the most recent Sunday on or before `dateMs`. The heatmap's
 * rightmost column always ends on the Saturday on or after today, so the
 * grid's leftmost column starts on a Sunday `(weeks - 1)` weeks before
 * that Saturday. Returns the epoch-ms instant of that Sunday's 00:00 UTC.
 *
 * Defensive: returns null when the input is not finite so callers can
 * short-circuit cleanly.
 */
function startOfWeekUtc(dateMs: number): number | null {
  if (!Number.isFinite(dateMs)) return null
  const d = new Date(dateMs)
  if (Number.isNaN(d.getTime())) return null
  const dow = d.getUTCDay()
  // Snap to 00:00 UTC of the same day, then back up to Sunday.
  const midnight = Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate(),
  )
  return midnight - dow * MS_PER_DAY
}

/**
 * 0-based ISO week-of-year for a UTC instant. The renderer uses this for
 * tooltips; the value is stable across years (a Sunday in early January
 * may belong to the previous year's week 52, which is fine for a simple
 * "week N" label). Returns -1 on bad input so callers can branch.
 */
function weekOfYearUtc(dateMs: number): number {
  if (!Number.isFinite(dateMs)) return -1
  const d = new Date(dateMs)
  if (Number.isNaN(d.getTime())) return -1
  const startOfYear = Date.UTC(d.getUTCFullYear(), 0, 1)
  const days = Math.floor((dateMs - startOfYear) / MS_PER_DAY)
  // 0-based: the first Sunday of the year is week 0, the next Sunday is
  // week 1, etc. Good enough for our tooltip; we are not trying to match
  // ISO 8601's Monday-first / week-1-contains-Jan-4 rule.
  return Math.floor(days / 7)
}

/**
 * Build the heatmap grid for the home-page widget. Always returns the
 * requested number of weeks (clamped to `[1, RACE_CALENDAR_MAX_WEEKS]`)
 * with cells in Sun..Sat order per column and oldest week on the left.
 *
 * Defensive against:
 * - malformed entries in `days` (sanitized through `sanitizeDailyStreakDays`)
 * - malformed `todayKey` (returns an empty grid with the todayKey echoed)
 * - non-finite or non-positive `weeks` (collapses to the default)
 */
export function buildRaceCalendarGrid(
  days: readonly DailyStreakDay[],
  todayKey: string,
  weeks: number = RACE_CALENDAR_DEFAULT_WEEKS,
): RaceCalendarGrid {
  const sanitized = sanitizeDailyStreakDays(days)
  const set = new Set(sanitized)
  const safeWeeks =
    Number.isFinite(weeks) && weeks > 0
      ? Math.min(Math.floor(weeks), RACE_CALENDAR_MAX_WEEKS)
      : RACE_CALENDAR_DEFAULT_WEEKS

  const todayMs = parseDateKeyToUtcMs(todayKey)
  if (todayMs === null) {
    return {
      weeks: [],
      racedCount: 0,
      totalCells: 0,
      coveredCells: 0,
      todayKey,
    }
  }

  // Anchor the rightmost column on the SUNDAY of the week containing today.
  // The newest column then runs Sun..Sat covering today plus any remaining
  // future days in this same week. Cells past today are flagged `isFuture`.
  const newestSundayMs = startOfWeekUtc(todayMs)!
  const oldestSundayMs = newestSundayMs - (safeWeeks - 1) * 7 * MS_PER_DAY

  const weekColumns: RaceCalendarWeek[] = []
  let racedCount = 0
  let coveredCells = 0
  for (let w = 0; w < safeWeeks; w++) {
    const sundayMs = oldestSundayMs + w * 7 * MS_PER_DAY
    const cells: RaceCalendarCell[] = []
    for (let d = 0; d < 7; d++) {
      const cellMs = sundayMs + d * MS_PER_DAY
      const cellKey = utcInstantToDateKey(cellMs)
      const isFuture = cellMs > todayMs
      const isToday = cellKey === todayKey
      const raced = !isFuture && set.has(cellKey)
      if (raced) racedCount++
      if (!isFuture) coveredCells++
      cells.push({
        dateKey: cellKey,
        raced,
        isFuture,
        isToday,
        weekday: d,
      })
    }
    weekColumns.push({
      index: w,
      weekOfYear: weekOfYearUtc(sundayMs),
      cells,
    })
  }

  return {
    weeks: weekColumns,
    racedCount,
    totalCells: safeWeeks * 7,
    coveredCells,
    todayKey,
  }
}

/**
 * Format the racedCount / coveredCells fraction as a percentage label for
 * the heatmap footer. Defensive against zero or negative `coveredCells`
 * (returns "0%" rather than NaN). Always returns an integer percent so the
 * label stays compact ("17%" not "16.7%").
 */
export function formatRacePercent(
  racedCount: number,
  coveredCells: number,
): string {
  if (
    !Number.isFinite(racedCount) ||
    !Number.isFinite(coveredCells) ||
    coveredCells <= 0 ||
    racedCount < 0
  ) {
    return '0%'
  }
  const pct = Math.round((racedCount / coveredCells) * 100)
  // Clamp into [0, 100] so a hand-edited racedCount can never produce a
  // confusing "120%" label.
  const clamped = Math.max(0, Math.min(100, pct))
  return `${clamped}%`
}

/**
 * Short month label (e.g. "Apr") for the first cell of a column. The
 * renderer uses this to sparsely label the top of the grid: only columns
 * that contain the 1st through 7th of a month get a label so the strip
 * does not get crowded. Returns the month label or null when this column
 * does not contain that range.
 *
 * Defensive: a malformed week (no cells) returns null.
 */
export function monthLabelForWeek(week: RaceCalendarWeek): string | null {
  if (!week || !Array.isArray(week.cells) || week.cells.length === 0) {
    return null
  }
  // Look for a cell whose day-of-month is between 1 and 7. The first such
  // cell anchors the month label for the column.
  for (const cell of week.cells) {
    const ms = parseDateKeyToUtcMs(cell.dateKey)
    if (ms === null) continue
    const day = new Date(ms).getUTCDate()
    if (day >= 1 && day <= 7) {
      return MONTH_LABELS[new Date(ms).getUTCMonth()] ?? null
    }
  }
  return null
}

const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const
