// Stage 2 Workstream B feature flags for the continuous-angle editor UX.
// Read docs/CONTINUOUS_ANGLE_PLAN.md "Stage 2 Workstream B" before adding
// flags here.
//
// The flags gate user-facing UX (rotate handle, free placement,
// long-press numeric input, reconciliation pass, OBB-vs-OBB overlap).
// They are deliberately off by default so the existing grid-snap editor
// stays the only path most users see. Stage 3 flips them on for
// everyone.
//
// Each flag reads a `NEXT_PUBLIC_*` env var so the same constant
// resolves the same way on the client and the server. Because Next.js
// inlines `NEXT_PUBLIC_*` values into the client bundle at build time,
// flipping a flag requires a redeploy: this is acceptable for the
// staged rollout (Stage 3 is itself a deploy that flips the default
// to on), but it does mean the flag is not a runtime kill switch.
// Internal preview testing flips the flag in a Vercel preview env and
// redeploys, not at runtime. Empty / missing env values default to
// off; any non-empty truthy string ("1", "true", "on", "yes") turns
// the flag on. This avoids a hidden string-truthiness footgun where
// "false" would otherwise read as truthy.

// Exported so the truthy-string parser can be unit-tested directly.
// `CONTINUOUS_ANGLE_EDITOR_ENABLED` itself is a module-scope constant
// that latches at import time, which makes mock-and-reimport patterns
// awkward; testing the pure function instead is cleaner and equivalent.
export function parseBooleanEnv(value: string | undefined): boolean {
  if (value === undefined) return false
  const normalized = value.trim().toLowerCase()
  return (
    normalized === '1' ||
    normalized === 'true' ||
    normalized === 'on' ||
    normalized === 'yes'
  )
}

// Master switch. When false the editor behaves exactly as it did before
// Workstream B; the rotate handle, free placement, long-press numeric
// input, reconciliation pass, and OBB overlap are all hidden. When true
// the editor exposes those affordances and validates non-projectable
// transforms end-to-end.
export const CONTINUOUS_ANGLE_EDITOR_ENABLED: boolean = parseBooleanEnv(
  process.env.NEXT_PUBLIC_CONTINUOUS_ANGLE_EDITOR,
)
