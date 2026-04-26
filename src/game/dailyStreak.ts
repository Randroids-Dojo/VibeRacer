/**
 * Daily streak tracker. Records the distinct UTC dates on which the player
 * completed at least one lap (anywhere, on any track) and exposes pure
 * helpers that compute the current consecutive-day streak, the best
 * consecutive-day streak the player has ever logged, and a rolling
 * recent-week activity grid for the home-page widget.
 *
 * The "day" boundary is intentionally UTC so a player who races across
 * timezones never sees their streak silently roll over because they crossed
 * a meridian. This matches the daily-challenge feature's UTC scheme so the
 * two features align: the challenge resets at 00:00 UTC, and the streak
 * does too.
 *
 * Pure helpers only. The thin storage wrapper lives in
 * `src/lib/dailyStreakStorage.ts` so this module can be unit tested without
 * a DOM. Every input is treated as untrusted (a hand-edited stored payload
 * could carry duplicates, malformed strings, or non-finite numbers) and
 * every public function returns a fresh array / object so callers can hand
 * the result straight into React state without aliasing a shared default.
 */

// "YYYY-MM-DD" exactly. Matches `dateKeyForUtc` in
// `src/lib/dailyChallenge.ts` (intentional: a player who rolls into a new
// UTC day should see both their daily challenge AND their streak refresh
// at the same moment).
const DATE_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/

// One day in milliseconds. The streak math walks dates one day at a time
// in UTC by adding / subtracting this value to a parsed `Date.UTC` instant
// so DST and leap-second drift cannot bend the boundary.
export const MS_PER_DAY = 86_400_000

// Cap the stored history at one calendar year so a multi-year grind never
// grows the localStorage payload without bound. The summary only needs the
// current and best streaks plus the most recent week, so older entries
// would never be surfaced anyway. Trim happens on write inside
// `appendDailyStreakDay`.
export const DAILY_STREAK_MAX_HISTORY_DAYS = 366

// How many days the rolling activity grid surfaces on the home page. Seven
// days lets the player see "the last week" at a glance without exploding
// the layout. Width and height of the rendered dot strip live in the
// component; this constant is the data contract.
export const DAILY_STREAK_RECENT_WINDOW = 7

/**
 * A single recorded race day. The string is the UTC date key
 * (`YYYY-MM-DD`); duplicate keys are not allowed in the history list.
 */
export type DailyStreakDay = string

/**
 * Snapshot returned by `summarizeDailyStreak`. Drives the home-page widget
 * (`current`, `best`, `recent`) and the optional toast that fires when the
 * player extends their streak (`extendedToday`, `becameBest`).
 */
export interface DailyStreakSummary {
  // Number of consecutive UTC days ending on `todayKey` that contain at
  // least one race day. Zero when the player did not race today AND did not
  // race yesterday (a one-day gap breaks the streak the moment "today"
  // passes without a race).
  current: number
  // Longest consecutive-day streak the player has ever logged. Always at
  // least as large as `current`. Zero when the history is empty.
  best: number
  // Last `DAILY_STREAK_RECENT_WINDOW` days, oldest first, each annotated
  // with whether the player raced that day. The home-page widget renders
  // this as a left-to-right strip of dots so the player sees their week
  // at a glance.
  recent: { dateKey: string; raced: boolean }[]
  // True when `todayKey` itself is in the history. Lets callers gate the
  // post-lap "streak extended" toast so it only fires the first time the
  // player races on a given UTC day.
  racedToday: boolean
  // True when the most recent `appendDailyStreakDay` call grew the current
  // streak past the prior best. Used by the toast lane to flag a fresh PB.
  // The summary itself does not know which append produced it; callers
  // pass the prior best in via `priorBest`. Defaults to false when not
  // supplied.
  becameBest: boolean
}

/**
 * Recognize a properly-formatted UTC date key. Used both as a runtime
 * guard for stored payloads and as a sanity check before string math.
 */
export function isDateKey(value: unknown): value is DailyStreakDay {
  if (typeof value !== 'string') return false
  if (!DATE_KEY_REGEX.test(value)) return false
  // Reject values like `2026-13-40` that match the regex but do not parse
  // as a real calendar date.
  const ms = parseDateKeyToUtcMs(value)
  return ms !== null
}

/**
 * Parse a `YYYY-MM-DD` UTC date key into the epoch-millis instant of that
 * date's 00:00 UTC. Returns null on a malformed key OR when the parsed
 * date round-trips to a different key (catches `2026-02-31`-style values
 * that `Date.UTC` silently rolls forward).
 */
export function parseDateKeyToUtcMs(dateKey: string): number | null {
  if (typeof dateKey !== 'string') return null
  if (!DATE_KEY_REGEX.test(dateKey)) return null
  const yyyy = Number.parseInt(dateKey.slice(0, 4), 10)
  const mm = Number.parseInt(dateKey.slice(5, 7), 10)
  const dd = Number.parseInt(dateKey.slice(8, 10), 10)
  if (!Number.isFinite(yyyy) || !Number.isFinite(mm) || !Number.isFinite(dd)) {
    return null
  }
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null
  const ms = Date.UTC(yyyy, mm - 1, dd)
  if (!Number.isFinite(ms)) return null
  // Round-trip: if the parsed instant does not produce the same key, the
  // input named a non-existent calendar date (e.g. Feb 31).
  if (utcInstantToDateKey(ms) !== dateKey) return null
  return ms
}

/**
 * Format a UTC instant as a `YYYY-MM-DD` date key. Internal helper used
 * by the round-trip check; public callers should prefer `dateKeyForUtc`
 * in `dailyChallenge.ts` so the two features keep one canonical
 * formatter.
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
 * Sort a list of date keys ascending and dedupe in one pass. Drops
 * malformed entries so a hand-edited stored payload (or a renamed legacy
 * key) cannot poison downstream math. Returns a fresh array.
 */
export function sanitizeDailyStreakDays(
  raw: readonly unknown[],
): DailyStreakDay[] {
  const seen = new Set<string>()
  for (const v of raw) {
    if (!isDateKey(v)) continue
    seen.add(v)
  }
  const out = Array.from(seen)
  out.sort()
  return out
}

/**
 * Append a new race day to the history. Returns a fresh array (does not
 * mutate the input). A duplicate `dateKey` is a no-op (returns a clone of
 * the input). A malformed `dateKey` is also a no-op so callers can route
 * straight from a date-formatting helper without a separate guard.
 *
 * The output is always sorted ascending and capped at
 * `DAILY_STREAK_MAX_HISTORY_DAYS`; the OLDEST entries fall off the cap
 * since the streak math (and the rolling-week widget) only ever look at
 * the most recent days.
 */
export function appendDailyStreakDay(
  prev: readonly DailyStreakDay[],
  dateKey: string,
): DailyStreakDay[] {
  const sanitized = sanitizeDailyStreakDays(prev)
  if (!isDateKey(dateKey)) return sanitized
  if (sanitized.includes(dateKey)) return sanitized
  sanitized.push(dateKey)
  sanitized.sort()
  if (sanitized.length > DAILY_STREAK_MAX_HISTORY_DAYS) {
    return sanitized.slice(sanitized.length - DAILY_STREAK_MAX_HISTORY_DAYS)
  }
  return sanitized
}

/**
 * Walk the sorted history backward from `todayKey` and count the longest
 * consecutive-day run. Returns 0 when neither today nor yesterday is in
 * the history (a one-day gap breaks the streak). The forgiving "yesterday
 * still counts" rule lets the player open the page mid-day and see their
 * streak intact even before they have raced today; it only resets when
 * "today" itself passes without a race AND the next day's UTC midnight
 * elapses, at which point the most recent recorded date is two days
 * behind and the streak collapses to 0.
 */
export function currentStreakLength(
  days: readonly DailyStreakDay[],
  todayKey: string,
): number {
  const sanitized = sanitizeDailyStreakDays(days)
  if (sanitized.length === 0) return 0
  const todayMs = parseDateKeyToUtcMs(todayKey)
  if (todayMs === null) return 0
  // Use a Set for O(1) membership instead of array search.
  const set = new Set(sanitized)
  // Anchor: the most recent day in `set` that is on or before today. If
  // that anchor is more than one day in the past, the streak is broken.
  let anchorMs: number | null = null
  if (set.has(todayKey)) {
    anchorMs = todayMs
  } else {
    const yesterdayMs = todayMs - MS_PER_DAY
    const yesterdayKey = utcInstantToDateKey(yesterdayMs)
    if (set.has(yesterdayKey)) {
      anchorMs = yesterdayMs
    }
  }
  if (anchorMs === null) return 0
  let cursor = anchorMs
  let length = 0
  while (set.has(utcInstantToDateKey(cursor))) {
    length++
    cursor -= MS_PER_DAY
  }
  return length
}

/**
 * Longest consecutive-day run anywhere in the history. Walks the sorted
 * list once and tracks the running max. Returns 0 on an empty input.
 */
export function bestStreakLength(days: readonly DailyStreakDay[]): number {
  const sanitized = sanitizeDailyStreakDays(days)
  if (sanitized.length === 0) return 0
  let best = 1
  let run = 1
  let prevMs = parseDateKeyToUtcMs(sanitized[0]!)
  // `sanitizeDailyStreakDays` filters every malformed entry, so prevMs is
  // never null here. The defensive null check is kept so future edits to
  // the helper cannot silently produce a NaN run count.
  if (prevMs === null) return 0
  for (let i = 1; i < sanitized.length; i++) {
    const cur = parseDateKeyToUtcMs(sanitized[i]!)
    if (cur === null) continue
    const diff = cur - prevMs
    if (diff === MS_PER_DAY) {
      run++
      if (run > best) best = run
    } else if (diff > 0) {
      run = 1
    }
    // diff <= 0 cannot happen after sanitize+sort, but ignoring it keeps
    // the loop defensive against a future helper change.
    prevMs = cur
  }
  return best
}

/**
 * Build the rolling-window grid for the widget. Returns the last
 * `DAILY_STREAK_RECENT_WINDOW` days (oldest first) annotated with whether
 * the player raced that day. Always returns exactly that many entries so
 * the widget's grid shape is stable even on a fresh browser.
 */
export function buildRecentDays(
  days: readonly DailyStreakDay[],
  todayKey: string,
  windowSize: number = DAILY_STREAK_RECENT_WINDOW,
): { dateKey: string; raced: boolean }[] {
  const out: { dateKey: string; raced: boolean }[] = []
  const sanitized = sanitizeDailyStreakDays(days)
  const set = new Set(sanitized)
  const todayMs = parseDateKeyToUtcMs(todayKey)
  // Defensive: a non-finite or zero window collapses to a single day so
  // the caller still gets a valid array. A non-finite todayKey collapses
  // to an empty grid since we cannot anchor the window.
  const w =
    Number.isFinite(windowSize) && windowSize > 0 ? Math.floor(windowSize) : 1
  if (todayMs === null) return out
  for (let i = w - 1; i >= 0; i--) {
    const ms = todayMs - i * MS_PER_DAY
    const key = utcInstantToDateKey(ms)
    out.push({ dateKey: key, raced: set.has(key) })
  }
  return out
}

/**
 * Convenience aggregator used by the React component and the storage
 * subscriber. Returns the full snapshot in one call so the component can
 * render from a single state value. `priorBest` is optional and defaults
 * to the live best (so a passive read never claims `becameBest` is true).
 */
export function summarizeDailyStreak(
  days: readonly DailyStreakDay[],
  todayKey: string,
  priorBest?: number,
): DailyStreakSummary {
  const current = currentStreakLength(days, todayKey)
  const best = bestStreakLength(days)
  const recent = buildRecentDays(days, todayKey)
  const sanitized = sanitizeDailyStreakDays(days)
  const racedToday = sanitized.includes(todayKey)
  const safePrior =
    typeof priorBest === 'number' && Number.isFinite(priorBest) && priorBest >= 0
      ? Math.floor(priorBest)
      : best
  const becameBest = best > safePrior
  return {
    current,
    best,
    recent,
    racedToday,
    becameBest,
  }
}

/**
 * Format the home-page widget's primary number ("4 days" / "1 day" / "0").
 * Centralized so the singular vs plural rule lives in one place. Returns
 * a plain string so the renderer can drop it into a `<span>` without
 * extra logic.
 */
export function formatStreakLabel(streak: number): string {
  if (!Number.isFinite(streak) || streak <= 0) return '0 days'
  const n = Math.floor(streak)
  return n === 1 ? '1 day' : `${n} days`
}
