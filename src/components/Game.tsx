'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Piece, TrackCheckpoint, TrackMood } from '@/lib/schemas'
import type { LapCompleteEvent } from '@/game/tick'
import { resolveActiveMood, trackHasMood } from '@/game/trackMood'
import { useKeyboard } from '@/hooks/useKeyboard'
import { useGamepad } from '@/hooks/useGamepad'
import { useControlSettings } from '@/hooks/useControlSettings'
import { cameraLerpsFor } from '@/lib/controlSettings'
import type { TimeOfDay } from '@/lib/lighting'
import { TIME_OF_DAY_LABELS } from '@/lib/lighting'
import type { Weather } from '@/lib/weather'
import type { TransmissionMode } from '@/game/transmission'
import type { TrackBiome } from '@/lib/biomes'
import type { TrackDecoration } from '@/lib/decorations'
import type { TrackMusic } from '@/lib/trackMusic'
import {
  KNOWN_MUSIC_EVENT,
  MY_MUSIC_EVENT,
  MUSIC_OVERRIDES_EVENT,
  recordKnownMusic,
  resolvePersonalMusic,
} from '@/lib/myMusic'
import { WEATHER_LABELS } from '@/lib/weather'
import { shouldHeadlightsBeOn } from '@/lib/headlights'
import type { BrakeLightMode } from '@/lib/brakeLights'
import type { GamepadRumbleIntensity, HapticMode } from '@/lib/haptics'
import {
  TIME_OF_DAY_CYCLE_PERIOD_MS,
  activeTimeOfDayAt,
} from '@/lib/timeOfDayCycle'
import type { CameraRigParams } from '@/game/sceneBuilder'
import { useTuning } from '@/hooks/useTuning'
import { useTuningRecorder } from '@/hooks/useTuningRecorder'
import {
  applyTuningHistoryEntry,
  type TuningHistoryEntry,
} from '@/lib/tuningHistory'
import { InitialsPrompt } from './InitialsPrompt'
import {
  INITIALS_EVENT,
  INITIALS_STORAGE_KEY,
  readStoredInitials,
} from '@/lib/initials'
import { Countdown } from './Countdown'
import { HUD } from './HUD'
import { PauseMenu } from './PauseMenu'
import { RacePane } from './RacePane'
import { FeedbackFab } from './FeedbackFab'
import { TouchControls } from './TouchControls'
import { SettingsPane } from './SettingsPane'
import { TuningPanel } from './TuningPanel'
import { Minimap, type MinimapPose } from './Minimap'
import { RaceCanvas, type RaceCanvasHud } from './RaceCanvas'
import { Speedometer } from './Speedometer'
import { SpeedLinesOverlay } from './SpeedLinesOverlay'
import { useViewportWidth } from '@/lib/useViewportWidth'
import {
  readLocalBest,
  writeLocalBest,
  readLocalBestReplay,
  writeLocalBestReplay,
  readLocalBestSplits,
  writeLocalBestSplits,
  readLocalBestDrift,
  writeLocalBestDrift,
  readLocalBestSectors,
  writeLocalBestSectors,
  readTrackStats,
  writeTrackStats,
  freshTrackStats,
  readLocalBestPbStreak,
  writeLocalBestPbStreak,
  readLastSubmit,
  writeLastSubmit,
  readLocalBestReaction,
  writeLocalBestReaction,
  readLifetimeBestReaction,
  writeLifetimeBestReaction,
  readLocalBestRank,
  writeLocalBestRank,
  readLocalBestTopSpeed,
  writeLocalBestTopSpeed,
  readLifetimeBestTopSpeed,
  writeLifetimeBestTopSpeed,
} from '@/lib/localBest'
import {
  TOP_SPEED_PB_DISPLAY_MS,
  isTopSpeedPb,
  sanitizeTopSpeed,
} from '@/game/topSpeedPb'
import {
  REACTION_TIME_DISPLAY_MS,
  isReactionPb,
  sanitizeReactionTime,
} from '@/game/reactionTime'
import {
  incrementStreak,
  isStreakBest,
  resetStreak,
} from '@/game/pbStreak'
import {
  recordLap as recordTrackStatsLap,
  recordSession as recordTrackStatsSession,
  type TrackStats,
} from '@/game/trackStats'
import { TrackStatsPane } from './TrackStatsPane'
import { AchievementsPane } from './AchievementsPane'
import {
  ACHIEVEMENTS,
  achievementProgress,
  evaluateAchievements,
  unlockAchievements,
  getAchievementDef,
  type AchievementMap,
  type AchievementId,
} from '@/game/achievements'
import {
  buildAchievementProgress,
  type AchievementProgressMap,
} from '@/game/achievementProgress'
import { readLifetimeBests } from '@/lib/lifetimeBests'
import {
  ACHIEVEMENTS_EVENT,
  readAchievements,
  readVisitedSlugs,
  recordSlugVisit,
  writeAchievements,
} from '@/lib/achievements'
import { recordDailyStreakDay } from '@/lib/dailyStreakStorage'
import { dateKeyForUtc } from '@/lib/dateKeys'
import { medalForTime } from '@/game/medals'
import { writeMedalForTrack } from '@/lib/medalCabinet'
import type { CheckpointHit } from '@/lib/schemas'
import {
  SPLIT_DISPLAY_MS,
  computeSplitDeltaForLastHit,
  predictLapTimeFromHits,
  type LapPrediction,
  type SplitDelta,
} from '@/game/splits'
import {
  SECTOR_PB_DISPLAY_MS,
  compareSectorToBest,
  computeSectorDurations,
  hasCompleteOptimalLap,
  mergeBestSectors,
  optimalLapTime,
  type SectorDuration,
} from '@/game/optimalLap'
import { Leaderboard } from './Leaderboard'
import { LapHistory } from './LapHistory'
import { PbHistory } from './PbHistory'
import {
  appendStoredPbHistory,
  readPbHistory,
  type PbHistoryEntry,
} from '@/lib/pbHistory'
import { HowToPlay } from './HowToPlay'
import { PhotoMode } from './PhotoMode'
import { ConfettiOverlay, type ConfettiKind } from './ConfettiOverlay'
import { SessionSummary } from './SessionSummary'
import { summarizeSession } from '@/game/sessionSummary'
import { appendLap, type LapHistoryEntry } from '@/game/lapHistory'
import { computeLapConsistency } from '@/game/lapConsistency'
import type { CarParams } from '@/game/physics'
import {
  cloneDefaultParams,
  markTrackDecided,
  pinTrack,
  unpinTrack,
  type InputMode,
} from '@/lib/tuningSettings'
import { PreRaceSetup, type PreRaceSetupResult } from './PreRaceSetup'
import { ReplaySchema, type Replay } from '@/lib/replay'
import {
  ghostSourceNeedsTopFetch,
  pickGhostAfterPb,
  pickGhostMeta,
  pickGhostMetaAfterPb,
  pickGhostReplay,
} from '@/lib/ghostSource'
import type { GhostMeta } from '@/game/ghostNameplate'
import {
  buildChallengeSharePayload,
  type ChallengePayload,
} from '@/lib/challenge'
import {
  formatRivalBannerLabel,
  isValidNonce,
  type RivalSelection,
} from '@/lib/rivalGhost'
import {
  PAUSE_CROSSFADE_SEC,
  RACE_START_CROSSFADE_SEC,
  crossfadeTo,
  playFinishStinger,
  setActiveMusic,
  setMusicLapIndex,
  setMusicOffTrack,
  setMusicPersonalization,
} from '@/game/music'
import {
  NEUTRAL_PERSONALIZATION,
  personalizeForRacer,
  personalizeForSlug,
} from '@/game/musicPersonalization'
import { useAudioSettings } from '@/hooks/useAudioSettings'
import {
  playAchievementUnlockCue,
  playLapStinger,
  playPbFanfare,
  playWrongWayCue,
  silenceAllSfx,
} from '@/game/audio'
import { TitleMusic } from './TitleMusic'
import { buildSharePayload, shareOrCopy } from '@/lib/share'
import { buildToastWithRank, isLapRankInfo } from '@/lib/lapToast'
import {
  isRankUpgrade,
  sanitizeRankInfo,
  type LeaderboardRankInfo,
} from '@/game/leaderboardRank'
import {
  fireGamepadImpulse,
  fireHaptic,
  isTouchRuntime,
  padHasRumble,
  shouldGamepadRumbleFire,
  shouldTouchHapticFire,
  stopGamepadRumble,
} from '@/lib/haptics'
import {
  FAVORITE_TRACKS_EVENT,
  isFavoriteTrack,
  readFavoriteTracks,
  toggleFavoriteTrack,
} from '@/lib/favoriteTracks'

export type ToastKind = 'lap' | 'pb' | 'record'

export interface OverallRecord {
  initials: string
  lapTimeMs: number
}

const EMPTY_TRACK_DECORATIONS: readonly TrackDecoration[] = []

interface GameProps {
  slug: string
  versionHash: string
  pieces: Piece[]
  checkpointCount?: number
  checkpoints?: TrackCheckpoint[]
  trackBiome?: TrackBiome | null
  trackDecorations?: readonly TrackDecoration[]
  // Track-author baked mood (timeOfDay / weather). Null when the author has
  // not picked one, or when the version predates this feature. When set and
  // the player has `respectTrackMood: true` in Settings (the default), the
  // resolver overrides the player's own picks for whichever fields the
  // author set. Pure cosmetic; does not affect physics or hashing.
  trackMood?: TrackMood | null
  initialMusic?: TrackMusic | null
  initialRecord: OverallRecord | null
  // Friend-challenge payload parsed from the URL (?challenge=...&from=...&time=...).
  // Null when the player landed on the page through a normal link. When
  // present, the race uses the referenced replay as the active ghost and
  // shows a banner naming the sender + target lap time.
  challenge?: ChallengePayload | null
}

export function Game(props: GameProps) {
  const [initials, setInitials] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    setInitials(readStoredInitials())
  }, [])

  // Mirror the InitialsPrompt module's INITIALS_EVENT and the browser's
  // `storage` event so editing initials in Settings (or in another tab)
  // updates the HUD live without restarting the race.
  useEffect(() => {
    function onCustom(e: Event) {
      const detail = (e as CustomEvent<string>).detail
      if (typeof detail === 'string') setInitials(detail)
      else setInitials(readStoredInitials())
    }
    function onStorage(e: StorageEvent) {
      if (e.key !== INITIALS_STORAGE_KEY) return
      setInitials(readStoredInitials())
    }
    window.addEventListener(INITIALS_EVENT, onCustom)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(INITIALS_EVENT, onCustom)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  if (initials === undefined) {
    return <div style={loading}>Loading...</div>
  }

  if (initials === null) {
    return <InitialsPrompt onDone={(v) => setInitials(v)} />
  }

  return <GameSession {...props} initials={initials} />
}

type Phase = 'preRace' | 'countdown' | 'racing'

interface SessionProps extends GameProps {
  initials: string
}

interface HudState {
  currentMs: number
  lastLapMs: number | null
  bestSessionMs: number | null
  bestAllTimeMs: number | null
  // Theoretical-best lap time for this (slug, hash). Sum of the player's best
  // ever per-sector durations, recomputed every lap from the merged sector
  // map. null until at least one sector has been recorded.
  optimalLapMs: number | null
  // True once every sector on the current track has at least one recorded
  // best (i.e. the player has run a clean lap or stitched together coverage
  // across multiple laps). Drives the OPTIMAL block's tinting.
  optimalLapComplete: boolean
  overallRecord: OverallRecord | null
  lapCount: number
  onTrack: boolean
  // Mirrored from RaceCanvas's debounced wrong-way detector. Renders a
  // distinct HUD warning so a player who turned around or drove through
  // the start line in reverse knows why the lap is not progressing.
  wrongWay: boolean
  toast: string | null
  toastKind: ToastKind | null
  splitDelta: SplitDelta | null
  // Live projection of the final lap time, refreshed on every checkpoint
  // cross. Persists between checkpoints so the HUD keeps showing the latest
  // estimate while the player drives a sector. Cleared at lap completion and
  // on Restart / Restart Lap so a fresh lap starts blank.
  prediction: LapPrediction | null
  // Per-sector PB celebration. Populated only when the just-completed sector
  // beat the player's prior best for that cpId (or set the first-ever best for
  // that cpId). Auto-clears after SECTOR_PB_DISPLAY_MS, on lap completion, and
  // on Restart / Restart Lap so the HUD never freezes on a stale celebration.
  // The `generatedAtMs` plus React-key on the HUD give back-to-back sector PBs
  // a clean re-pop animation per cpId.
  sectorPb: { cpId: number; durationMs: number; generatedAtMs: number } | null
  // Drift state mirrored from RaceCanvas's per-frame session machine. The
  // HUD's drift block reads these directly; live score updates land at the
  // throttled HUD cadence (~20 Hz) which is plenty for the readout.
  driftActive: boolean
  driftScore: number
  driftMultiplier: number
  driftLapBest: number | null
  // Best drift score across every lap on this (slug, hash). Loaded from
  // localStorage on mount and rewritten when a new lap-best beats it.
  driftAllTimeBest: number | null
  // Live count of consecutive PB laps in the current session. Increments on
  // every lap that beats the all-time PB, resets to zero on any non-PB lap
  // and on Restart / Restart Lap. The HUD chip surfaces only when the live
  // count reaches STREAK_HUD_MIN so a single first-PB does not double up the
  // existing toast and confetti celebration.
  pbStreak: number
  // All-time best PB streak on this (slug, versionHash). Loaded from
  // localStorage on mount and rewritten whenever the live counter exceeds
  // it. Surfaced in the pause-menu Stats pane as a long-standing target so
  // a player who clears their streak today still sees the bar to beat.
  pbStreakBest: number | null
  // Live "ghost gap" in milliseconds: positive = player is BEHIND the ghost
  // car at the same world point, negative = AHEAD. null hides the chip
  // (no ghost on screen, no replay loaded, player has drifted off the line,
  // or the Settings toggle is off).
  ghostGapMs: number | null
  // Reaction time at the GO light. Populated the first frame the player
  // presses throttle after a fresh race-start. The HUD chip auto-clears
  // after REACTION_TIME_DISPLAY_MS so it does not crowd the mid-race HUD.
  // `pbReactionMs` mirrors the player's all-time best on this (slug, hash)
  // so the chip can flag a PB inline. Cleared on Restart so the next race
  // starts on a clean slate.
  reactionTime: { reactionMs: number; isPb: boolean; generatedAtMs: number } | null
  pbReactionMs: number | null
  // Top-speed personal-best on this (slug, versionHash), in raw "us" (world
  // units per second). Loaded from localStorage on mount so the chip in the
  // Stats pane and the celebration trigger both compare against the player's
  // true PB from the very first frame. null until the player has logged a
  // qualifying top speed on this layout.
  pbTopSpeedUs: number | null
  // Live top-speed PB celebration. Populated only when the live peak beats
  // the stored per-track PB by at least TOP_SPEED_PB_MIN_DELTA_US. Auto-clears
  // after TOP_SPEED_PB_DISPLAY_MS, on lap completion, and on Restart so the
  // HUD never freezes on a stale celebration. The `generatedAtMs` plus React
  // key on the HUD chip give back-to-back PB triggers a clean re-pop animation.
  topSpeedPb: { topSpeedUs: number; priorUs: number | null; generatedAtMs: number } | null
  // Player's best leaderboard placement on this (slug, versionHash). Loaded
  // from localStorage on mount so a recognized layout shows the rank chip
  // immediately, then refreshed on every successful race-submit response so
  // a fresh top-3 lap upgrades the chip in place. null until the player has
  // ever submitted a lap on this layout (the chip slot collapses cleanly
  // until then so a brand-new track does not show a misleading "ranked"
  // pill before the first submit lands).
  leaderboardRank: { rank: number; boardSize: number } | null
  // Pace-notes call-out for the upcoming track feature. Pre-formatted text
  // (e.g. "Sharp left next") plus a hex severity accent. null hides the chip
  // (off-track, Settings toggle off, no path data on file).
  paceNote: { text: string; accent: string } | null
  gear: number
}

type PauseView =
  | 'menu'
  | 'race'
  | 'leaderboard'
  | 'settings'
  | 'tuning'
  | 'lapHistory'
  | 'pbHistory'
  | 'stats'
  | 'achievements'
  | 'howToPlay'
  | 'photo'
  | 'sessionSummary'

function GameSession({
  slug,
  versionHash,
  pieces,
  checkpointCount,
  checkpoints,
  trackBiome = null,
  trackDecorations = EMPTY_TRACK_DECORATIONS,
  trackMood = null,
  initialMusic = null,
  initials,
  initialRecord,
  challenge = null,
}: SessionProps) {
  const router = useRouter()
  const { settings, setSettings, resetSettings } = useControlSettings()
  const { settings: audioSettings } = useAudioSettings()
  const {
    params: tuning,
    setParams: rawSetTuning,
    applyParams: rawApplyTuning,
    resetParams: rawResetTuning,
  } = useTuning(slug)
  const {
    history: tuningHistory,
    record: recordTuningChange,
    flush: flushTuningHistory,
  } = useTuningRecorder()
  // Wrap the useTuning writes so each one also lands in the audit log. The
  // recorder coalesces slider sources via debounce; non-slider sources flow
  // through with `immediate: true` so each discrete intent reads as one row.
  const setTuning = useCallback(
    (next: CarParams) => {
      rawSetTuning(next)
      recordTuningChange({ next, source: 'slider', slug })
    },
    [rawSetTuning, recordTuningChange, slug],
  )
  const applyTuning = useCallback(
    (next: CarParams, label?: string | null) => {
      rawApplyTuning(next)
      recordTuningChange({
        next,
        source: 'savedApplied',
        label: label ?? null,
        slug,
        immediate: true,
      })
    },
    [rawApplyTuning, recordTuningChange, slug],
  )
  const resetTuning = useCallback(() => {
    rawResetTuning()
    recordTuningChange({
      next: cloneDefaultParams(),
      source: 'reset',
      label: 'Reset to defaults',
      slug,
      immediate: true,
    })
  }, [rawResetTuning, recordTuningChange, slug])
  const handleApplyHistoryEntry = useCallback(
    (entry: TuningHistoryEntry) => {
      applyTuningHistoryEntry(entry, rawApplyTuning)
      recordTuningChange({
        next: entry.params,
        source: 'historyRevert',
        label: 'Reverted from history',
        slug,
        immediate: true,
      })
    },
    [rawApplyTuning, recordTuningChange, slug],
  )
  useEffect(() => {
    recordKnownMusic(slug, initialMusic)
    setActiveMusic(resolvePersonalMusic(slug, initialMusic))
    function refreshMusic() {
      setActiveMusic(resolvePersonalMusic(slug, initialMusic))
    }
    window.addEventListener(MY_MUSIC_EVENT, refreshMusic)
    window.addEventListener(MUSIC_OVERRIDES_EVENT, refreshMusic)
    window.addEventListener(KNOWN_MUSIC_EVENT, refreshMusic)
    window.addEventListener('storage', refreshMusic)
    return () => {
      window.removeEventListener(MY_MUSIC_EVENT, refreshMusic)
      window.removeEventListener(MUSIC_OVERRIDES_EVENT, refreshMusic)
      window.removeEventListener(KNOWN_MUSIC_EVENT, refreshMusic)
      window.removeEventListener('storage', refreshMusic)
      setMusicLapIndex(0)
      setMusicOffTrack(false)
      setActiveMusic(null)
    }
  }, [slug, initialMusic])

  // Apply per-slug music personalization. The music engine treats this as
  // idempotent (a no-op when the value matches the active one) so the effect
  // can safely re-fire on every dependency change. Falls back to the neutral
  // tweak when the player turned the feature off in Settings; the game track
  // will sound exactly like the legacy G-minor / 140-BPM loop in that case.
  // When the player also opted in to the initials mix, the slug seed gets
  // folded with a hash of their initials so two players on the same slug
  // hear distinct flavors. An initials edit in Settings re-fires the effect
  // through the dependency on `initials`.
  useEffect(() => {
    let next
    if (!audioSettings.musicPerTrack) {
      next = { ...NEUTRAL_PERSONALIZATION }
    } else if (audioSettings.musicMixInitials) {
      next = personalizeForRacer(slug, initials)
    } else {
      next = personalizeForSlug(slug)
    }
    setMusicPersonalization(next)
  }, [
    slug,
    initials,
    audioSettings.musicPerTrack,
    audioSettings.musicMixInitials,
  ])
  const keys = useKeyboard(settings.keyBindings)
  const tokenRef = useRef<string | null>(null)
  const submittingRef = useRef(false)
  // Wall-clock timestamp at session mount. Drives the "Time on page" row in
  // the end-of-session summary. Survives Restart and Restart Lap so the
  // counter measures how long the player has been on the page across
  // restarts; only a navigation away (which unmounts the component) reseeds
  // it. `Date.now()` rather than `performance.now()` so a brief tab sleep
  // does not undercount the session.
  const sessionStartedAtRef = useRef<number>(Date.now())
  // Player's all-time PB on this (slug, version) AT MOUNT, before any laps
  // were recorded this session. Drives the "Vs PB" tile in the end-of-session
  // summary so the player sees how their session best compared to the bar
  // they walked in with (rather than the post-session bar they may have
  // already moved). Updated on slug / version change so a navigation between
  // tracks resets the comparison reference cleanly.
  const sessionPriorPbRef = useRef<number | null>(
    readLocalBest(slug, versionHash),
  )
  // Player's all-time best sectors AT MOUNT, before any laps were recorded
  // this session. Drives the "Where you lost time" sector breakdown card in
  // the end-of-session summary so the per-sector deltas read against the bar
  // the player walked in with rather than the post-session bar that the
  // session itself just moved. Updated on slug / version change so a navigation
  // between tracks resets the comparison reference cleanly.
  const sessionPriorSectorsRef = useRef<SectorDuration[] | null>(
    readLocalBestSectors(slug, versionHash),
  )
  const pendingRaceStartRef = useRef<number | null>(null)
  const pendingResetRef = useRef(false)
  // Mid-race "restart this lap" pulse. The rAF loop in RaceCanvas drains it
  // by teleporting the car back to spawn and zeroing the in-flight lap. Lap
  // count, session PB, lap history, and toast state are preserved, so this is
  // a much lighter-weight reset than `pendingResetRef`.
  const pendingLapResetRef = useRef(false)
  const pausedRef = useRef(false)
  const pauseStartTsRef = useRef<number | null>(null)
  const resumeShiftRef = useRef(0)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Live tuning the rAF loop reads each frame. Updated whenever the
  // useTuning hook refreshes (player edited or migrated state).
  const paramsRef = useRef<CarParams>(tuning)
  paramsRef.current = tuning
  // Last-input-wins detector for the leaderboard input-mode badge. Defaults to
  // 'keyboard' on first paint; flips to 'touch' on the first touch pointerdown
  // and back on any keydown. Snapshot at submit time.
  const inputModeRef = useRef<InputMode>('keyboard')
  // Ghost replay being rendered alongside the player. Updated on mount from
  // local PB / leaderboard top, and after every personal-best lap. RaceCanvas
  // reads this each frame so swaps take effect on the next finish-line cross.
  const activeGhostRef = useRef<Replay | null>(null)
  // Replay buffer captured by RaceCanvas for the most recent lap, queued for
  // bundling into the next /api/race/submit POST.
  const pendingReplayForSubmitRef = useRef<Replay | null>(null)
  // Most recent COMPLETED lap's replay (regardless of PB status). Used by the
  // 'lastLap' ghost source so the player can chase their previous attempt
  // even when slowly slipping off pace. Updated by handleLapReplay on every
  // completed lap, including PB laps. Null until the first lap of the
  // session completes; cleared on Restart so a fresh race starts ghost-less
  // when the lastLap source is selected.
  const lastLapReplayRef = useRef<Replay | null>(null)
  // Whether the just-completed lap was a new local PB. Set inside the lap
  // complete handler before submitLap fires so the submit response handler
  // knows whether to promote the returned `submittedNonce` into the
  // last-submit pointer used by the friend-challenge link.
  const pendingPbForSubmitRef = useRef<{ lapTimeMs: number } | null>(null)
  // Mirrors settings.showGhost into the rAF loop without re-mounting the
  // canvas every time the toggle flips.
  const showGhostRef = useRef<boolean>(settings.showGhost)
  showGhostRef.current = settings.showGhost
  // Mirrors settings.ghostSource so the post-PB ghost swap inside
  // handleLapComplete reads the current preference even though the closure
  // captured a stale value at mount time.
  const ghostSourceRef = useRef(settings.ghostSource)
  ghostSourceRef.current = settings.ghostSource
  // Mirrors settings.showGhostNameplate into the rAF loop so a Settings
  // flip lands on the next frame without re-mounting the renderer.
  const showGhostNameplateRef = useRef<boolean>(settings.showGhostNameplate)
  showGhostNameplateRef.current = settings.showGhostNameplate
  // Mirrors settings.showGhostGap into the rAF loop so a Settings flip
  // takes effect on the next HUD tick. When false the renderer skips the
  // gap math entirely so a hidden chip costs zero per frame.
  const showGhostGapRef = useRef<boolean>(settings.showGhostGap)
  showGhostGapRef.current = settings.showGhostGap
  // Mirrors settings.showPaceNotes into the rAF loop so a Settings flip
  // takes effect on the next HUD tick. When false the renderer skips the
  // pace-notes look-up entirely so a hidden chip costs zero per frame.
  const showPaceNotesRef = useRef<boolean>(settings.showPaceNotes)
  showPaceNotesRef.current = settings.showPaceNotes
  // Identity tuple (initials + lap time) for the active ghost replay. Kept
  // in lockstep with `activeGhostRef` so the floating nameplate above the
  // ghost car always shows the right "WHO + TIME". null hides the plate
  // (e.g. while the leaderboard top fetch is in flight, or when the
  // 'lastLap' source has no completed lap yet this session).
  const activeGhostMetaRef = useRef<GhostMeta | null>(null)
  // Per-source meta tuples kept alongside the per-source replay refs so the
  // race-load resolver can pick the right one without a network round-trip.
  // PB meta updates whenever a fresh PB lands; top meta updates from the
  // /api/replay/top response (which now carries `initials` alongside the
  // replay); lastLap meta updates from `handleLapReplay` on every completed
  // lap, mirroring `lastLapReplayRef`.
  const localPbMetaRef = useRef<GhostMeta | null>(null)
  const topGhostMetaRef = useRef<GhostMeta | null>(null)
  const lastLapMetaRef = useRef<GhostMeta | null>(null)
  // Mirrors the player's camera tunables into the rAF loop the same way.
  // Recomputed every render from `settings.camera` so a slider tweak in
  // SettingsPane takes effect on the next frame.
  const cameraRigRef = useRef<CameraRigParams | null>(null)
  {
    const lerps = cameraLerpsFor(settings.camera.followSpeed)
    cameraRigRef.current = {
      height: settings.camera.height,
      distance: settings.camera.distance,
      lookAhead: settings.camera.lookAhead,
      positionLerp: lerps.positionLerp,
      targetLerp: lerps.targetLerp,
      cameraForward: settings.camera.cameraForward,
      targetHeight: settings.camera.targetHeight,
      fov: settings.camera.fov,
    }
  }
  // Mirrors the player's chosen paint into the rAF loop. Same pattern as
  // showGhostRef: RaceCanvas polls this each frame and reapplies on change.
  const carPaintRef = useRef<string | null>(settings.carPaint)
  carPaintRef.current = settings.carPaint
  // Mirrors the player's racing-number plate setting into the rAF loop.
  // Same pattern as carPaintRef: the renderer reads it each frame and
  // redraws the canvas-texture only when the value or colors changed.
  const racingNumberRef = useRef(settings.racingNumber)
  racingNumberRef.current = settings.racingNumber
  // Mirrors settings.showSkidMarks into the rAF loop without remounting the
  // canvas. Existing marks keep fading even after a flip-off so the toggle
  // does not snap a visible streak away mid-corner.
  const showSkidMarksRef = useRef<boolean>(settings.showSkidMarks)
  showSkidMarksRef.current = settings.showSkidMarks
  // Mirrors settings.showTireSmoke into the rAF loop. Existing puffs keep
  // fading after a flip-off, same idea as skid marks.
  const showTireSmokeRef = useRef<boolean>(settings.showTireSmoke)
  showTireSmokeRef.current = settings.showTireSmoke
  // Mirrors settings.showRearview into the rAF loop so the second renderer
  // can short-circuit its draw call when the mirror is hidden. The canvas
  // itself stays mounted (and CSS-hidden) so a flip back on resumes the pass
  // without rebuilding the second WebGL context.
  const showRearviewRef = useRef<boolean>(settings.showRearview)
  showRearviewRef.current = settings.showRearview
  // Mirrors settings.showKerbs into the rAF loop so a flip in Settings hides
  // (or shows) the inside-corner kerbs on the next frame without rebuilding
  // any geometry.
  const showKerbsRef = useRef<boolean>(settings.showKerbs)
  showKerbsRef.current = settings.showKerbs
  // Mirrors settings.showScenery into the rAF loop so a flip in Settings
  // hides (or shows) the trackside trees / cones / barriers on the next
  // frame without rebuilding any geometry.
  const showSceneryRef = useRef<boolean>(settings.showScenery)
  showSceneryRef.current = settings.showScenery
  // Mirrors settings.showRacingLine into the rAF loop so a flip in Settings
  // shows (or hides) the racing-line overlay on the next frame. The line
  // itself is sourced from `activeGhostRef`: there is no separate refresh
  // for the geometry because the layer rebuilds on its own when the replay
  // reference changes.
  const showRacingLineRef = useRef<boolean>(settings.showRacingLine)
  showRacingLineRef.current = settings.showRacingLine
  // Mirrors settings.transmission into the rAF loop so a flip from automatic
  // to manual (or back) takes effect on the next physics tick without
  // re-initing the canvas mid-race. HUD + TouchControls read the live value
  // straight off `settings` since they re-render on settings changes.
  const transmissionRef = useRef<TransmissionMode>(settings.transmission)
  transmissionRef.current = settings.transmission
  // Stable canvas ref the rear-view pass renders into. Held here at the
  // Game.tsx level so the inset survives across pause / resume without
  // retearing the renderer.
  const rearviewCanvasRef = useRef<HTMLCanvasElement | null>(null)
  // Photo Mode capture handle. RaceCanvas installs a function on this ref
  // (and clears it on unmount) that synchronously force-renders the scene
  // and returns a data URL of the current frame. PhotoMode.tsx calls it
  // when the player picks a format.
  const captureScreenshotRef = useRef<
    ((mimeType?: string, quality?: number) => string | null) | null
  >(null)
  // Resolve the active scene mood (timeOfDay + weather): a track author's
  // baked-in mood (saved alongside the track version) overrides the player's
  // own picks for whichever fields it sets, unless the player turned off
  // "Respect track mood" in Settings. The mood is purely cosmetic and does
  // not affect physics or hashing.
  const activeMood = resolveActiveMood({
    trackMood,
    playerTimeOfDay: settings.timeOfDay,
    playerWeather: settings.weather,
    respectTrackMood: settings.respectTrackMood,
  })
  // Time-of-day auto cycle. When `settings.timeOfDayCycle !== 'off'` an effect
  // below mutates `cycleTimeOfDayRef.current` on a wall-clock cadence so the
  // active sky rotates through noon -> morning -> sunset -> night even mid-race.
  // The render-time assignment to `timeOfDayRef.current` reads from this ref
  // (when cycle is on) so a re-render does not clobber the in-flight cycle.
  // Track-author baked moods are honored: when the author picked a time of day
  // and the player has "respect track mood" on, the cycle is suppressed (the
  // author's baked time is the entire point).
  const trackMoodLocksTimeOfDay =
    settings.respectTrackMood && Boolean(trackMood?.timeOfDay)
  const cycleEffective =
    settings.timeOfDayCycle !== 'off' && !trackMoodLocksTimeOfDay
  const cycleTimeOfDayRef = useRef<TimeOfDay>(
    activeMood.timeOfDay ?? settings.timeOfDay,
  )
  // The effective time-of-day for this render: the cycle's latest value when
  // the cycle is running, otherwise the resolver's baseline. Reading the ref
  // (not state) keeps the cycle from forcing 60Hz re-renders into the rest of
  // the HUD tree; the renderer notices via the same poll-and-set pattern as
  // every other settings ref.
  const effectiveTimeOfDay: TimeOfDay = cycleEffective
    ? cycleTimeOfDayRef.current
    : activeMood.timeOfDay ?? settings.timeOfDay
  // Mirrors the active time-of-day preset into the rAF loop. Same poll-and-set
  // pattern as carPaintRef: the renderer reads it each frame and reapplies the
  // sky / ambient / sun preset whenever the value changes.
  const timeOfDayRef = useRef<TimeOfDay | null>(effectiveTimeOfDay)
  timeOfDayRef.current = effectiveTimeOfDay
  const weatherRef = useRef<Weather | null>(activeMood.weather)
  weatherRef.current = activeMood.weather
  // Resolve the headlight visibility from the player's HeadlightMode pick plus
  // the active mood. Mirroring the boolean (not the mode) into the renderer ref
  // keeps the renderer-side logic dumb (just flip a group's visibility) and
  // means a track mood change automatically lights the lamps without any
  // additional renderer work. When the cycle rotates the sky into night the
  // headlights also pop on, so the cosmetic stays coherent.
  const headlightsOn = shouldHeadlightsBeOn(
    settings.headlights,
    effectiveTimeOfDay,
    activeMood.weather,
  )
  const headlightsOnRef = useRef<boolean>(headlightsOn)
  headlightsOnRef.current = headlightsOn
  // Brake-light mode pick. The renderer combines this with its own per-frame
  // braking detection (it knows the live throttle / handbrake / speed before
  // the rest of the visualization does) so the lamps glow on the same frame
  // the input lands. Mirroring the mode (not a resolved boolean) into the
  // ref keeps the source of truth in one place: the rAF loop reconciles the
  // live driver input against the player's preference each frame.
  const brakeLightModeRef = useRef<BrakeLightMode>(settings.brakeLights)
  brakeLightModeRef.current = settings.brakeLights
  // Engine-noise profile lives in Audio settings rather than vehicle
  // settings. The renderer polls it each frame so switching sound profiles
  // during a pause takes effect as soon as the race resumes.
  const engineNoiseRef = useRef(audioSettings.engineNoise)
  engineNoiseRef.current = audioSettings.engineNoise
  // Mirror the haptics mode into a ref so handleLapComplete reads the freshest
  // pick without depending on a stale closure. Mode (not a resolved boolean)
  // is the source of truth: shouldTouchHapticFire reconciles it against the
  // live touch-runtime detection at fire time so a player who plugs in a
  // phone mid-session feels the buzz on the next lap without restarting.
  // Gamepad rumble has its own mode and a separate shouldGamepadRumbleFire
  // gate just below so the two device paths stay independent.
  const hapticsModeRef = useRef<HapticMode>(settings.haptics)
  hapticsModeRef.current = settings.haptics
  // Same ref pattern for gamepad rumble. Mirrors `settings.gamepadRumble` so
  // RaceCanvas's per-frame rumble loop reads the freshest pick without
  // re-mounting on every Settings flip. shouldGamepadRumbleFire reconciles
  // the mode against the active pad's rumble capability at the call site.
  const gamepadRumbleModeRef = useRef<HapticMode>(settings.gamepadRumble)
  gamepadRumbleModeRef.current = settings.gamepadRumble
  const gamepadRumbleIntensityRef = useRef<GamepadRumbleIntensity>(
    settings.gamepadRumbleIntensity,
  )
  gamepadRumbleIntensityRef.current = settings.gamepadRumbleIntensity
  // The active Gamepad, owned by the parent so callbacks declared above the
  // useGamepad call (pause / resume) can reference it without hitting TDZ.
  // useGamepad receives this ref as `padOutRef` further down the component
  // and writes the live pad here every animation frame.
  const gamepadPadRef = useRef<Gamepad | null>(null)
  // Pause-menu indicator: surfaced in the menu so the player understands why
  // the scene looks different from their own picks. True when the track
  // author baked at least one mood field AND the player has the respect
  // toggle on.
  const trackMoodActive = settings.respectTrackMood && trackHasMood(trackMood)
  // Short label for the pause-menu chip describing what the author baked in.
  // Only includes fields the author actually set so the chip reads honestly:
  // "Sunset" for time-only, "Foggy" for weather-only, "Sunset, Foggy" for
  // both. Null when no track mood is active so the chip stays hidden.
  const trackMoodLabel = (() => {
    if (!trackMoodActive || !trackMood) return null
    const parts: string[] = []
    if (trackMood.timeOfDay) parts.push(TIME_OF_DAY_LABELS[trackMood.timeOfDay])
    if (trackMood.weather) parts.push(WEATHER_LABELS[trackMood.weather])
    return parts.length > 0 ? parts.join(', ') : null
  })()
  // Live pose channel for the minimap. RaceCanvas writes to these refs every
  // frame; the Minimap component reads them in its own rAF loop without going
  // through React state. Keeping the refs alive here means a Settings toggle
  // that mounts / unmounts the Minimap does not lose the live position.
  const minimapCarPoseRef = useRef<MinimapPose | null>(null)
  const minimapGhostPoseRef = useRef<MinimapPose | null>(null)
  // Live signed speed (world units / s). Speedometer overlay reads it from
  // its own rAF loop so the readout updates at 60 Hz without sending React
  // re-renders into the rest of the HUD tree.
  const speedRef = useRef<number>(0)
  // Mirrors the live tuning's maxSpeed for the gauge needle. Updated each
  // render from `tuning` so a slider tweak in TuningPanel reshapes the dial
  // immediately.
  const maxSpeedRef = useRef<number>(tuning.maxSpeed)
  maxSpeedRef.current = tuning.maxSpeed
  // Session top-speed (always >= 0). The Speedometer overlay updates this
  // inside its own rAF loop using `updateTopSpeed`; owning the ref here means
  // the peak survives the component's mount / unmount cycle on pause / resume,
  // and a full Restart can zero it without touching the renderer.
  const topSpeedRef = useRef<number>(0)
  // PB checkpoint splits. Loaded once on mount and overwritten each time the
  // player posts a new all-time PB so the live "delta vs PB" tile always
  // compares against the freshest reference. A ref (not state) so updates do
  // not re-render the canvas.
  const pbSplitsRef = useRef<CheckpointHit[] | null>(null)
  // PB lap time mirrored into a ref so the checkpoint handler can compute the
  // projected final lap time without closing over `hud.bestAllTimeMs` (which
  // would stale-close inside handleCheckpointHit between renders).
  const pbLapMsRef = useRef<number | null>(null)
  // Track-wide RECORD lap time mirrored into a ref so the same checkpoint
  // handler can compute the projection's "vs REC" delta without closing over
  // `hud.overallRecord` (which would stale-close inside handleCheckpointHit
  // between renders, just like pbLapMsRef). Updated alongside the HUD's
  // overallRecord wherever that field changes (initial seed, optimistic
  // post-PB swap, slug change).
  const recordLapMsRef = useRef<number | null>(
    initialRecord ? initialRecord.lapTimeMs : null,
  )
  const splitClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Best per-sector durations on this (slug, hash). Mirrored into a ref so
  // handleLapComplete can merge a fresh lap's sectors without going through
  // setState, then push the merged result into HudState in one call.
  const bestSectorsRef = useRef<SectorDuration[] | null>(null)
  // tMs of the previous in-lap checkpoint hit, used to compute the just-
  // completed sector's duration in handleCheckpointHit. Resets to 0 at lap
  // start, on lap completion, and on Restart / Restart Lap so the first
  // checkpoint of every fresh lap measures from the start line correctly.
  const prevHitTMsRef = useRef<number>(0)
  // Auto-clear timer for the per-sector PB celebration badge on HUD. Cleared
  // on every fresh sector PB, on lap completion, and on Restart / Restart Lap
  // so the badge never sticks when the player abandons the lap.
  const sectorPbClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  )
  // Auto-clear timer for the reaction-time HUD chip. Cleared on every fresh
  // measurement (so a Restart-followed-by-new-race instantly cancels the
  // stale fade) and on Restart so the chip never lingers across runs.
  const reactionTimeClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  )
  // Auto-clear timer for the top-speed PB HUD chip. Same lifecycle as the
  // reaction-time chip: cleared on a fresh PB so a quick second PB does not
  // leave a stale fade, and cleared on Restart / slug change so the chip
  // never lingers across runs.
  const topSpeedPbClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  )
  // Expected sector count for OPTIMAL completeness. Equals the track's
  // checkpoint count (one sector per checkpoint), which defaults to the
  // piece count when no override is set.
  const expectedSectorCount =
    checkpoints !== undefined && checkpoints.length > 0
      ? checkpoints.length + 1
      : checkpointCount ?? pieces.length
  const { compact: compactHud } = useViewportWidth(600)

  // Per-track engagement stats (lap count, total drive time, sessions, first /
  // last played). Loaded once on mount and updated through pure helpers on
  // session start and lap completion. State (not just a ref) so opening the
  // Stats pause pane re-renders with the freshest values.
  const [trackStats, setTrackStats] = useState<TrackStats>(
    () => readTrackStats(slug, versionHash) ?? freshTrackStats(),
  )
  // Mirror the live trackStats into a ref so the lap-complete handler can
  // compute the next snapshot without closing over a stale value (mirrors the
  // pbLapMsRef / recordLapMsRef pattern above).
  const trackStatsRef = useRef<TrackStats>(trackStats)
  // Tracks whether this Game instance has already counted itself toward the
  // session counter. Flipped exactly once on the first countdown -> racing
  // transition so a player who restarts the lap (or restarts the race) within
  // the same mount does not inflate the session count.
  const sessionCountedRef = useRef<boolean>(false)

  // Cross-track lifetime achievements. Loaded once on mount and updated through
  // the pure evaluator on every lap completion. State (not just a ref) so
  // opening the Achievements pane re-renders with the freshest unlock map.
  const [achievements, setAchievements] = useState<AchievementMap>(() =>
    readAchievements(),
  )
  const achievementsRef = useRef<AchievementMap>(achievements)
  achievementsRef.current = achievements
  // Transient toast surfaced when a lap completion unlocks one or more
  // achievements. Lives in its own state slot (not the lap-saved toast) so
  // a true PB lap that also unlocks an achievement shows both messages.
  const [achievementToast, setAchievementToast] = useState<string | null>(null)
  const achievementToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  )
  // Distinct-slug count seeded from disk and bumped exactly once per mount on
  // the first countdown -> racing transition. The achievement evaluator reads
  // the live count on every lap so a player who hits five distinct slugs in a
  // single sprint sees the badge fire on the very next lap.
  const distinctSlugCountRef = useRef<number>(
    typeof window === 'undefined' ? 0 : readVisitedSlugs().length,
  )
  // Live wrong-way flag for the current session. The HUD keeps a separate
  // mirror for the on-screen banner; this ref outlives the per-frame banner
  // so a brief wrong-way blip at any point in the race still credits the
  // achievement on the next lap completion. Reset on Restart so a fresh race
  // starts clean.
  const wrongWayTriggeredRef = useRef<boolean>(false)
  const wrongWayAudioActiveRef = useRef<boolean>(false)
  // Just-finished lap's drift peak. Set by handleLapDriftBest (which fires
  // immediately before handleLapComplete inside the rAF loop) so the
  // achievement evaluator sees the drift score for the SAME lap that just
  // completed without round-tripping through the throttled HUD setState.
  // Reset to null after each evaluation so a non-drift lap reads as null.
  const lastLapDriftScoreRef = useRef<number | null>(null)
  // Listen for cross-tab achievement updates plus the same-tab broadcast so
  // unlocking an achievement in another tab (or via a Test escape hatch)
  // immediately refreshes the live state.
  useEffect(() => {
    function onCustom(e: Event) {
      const detail = (e as CustomEvent<AchievementMap>).detail
      if (detail && typeof detail === 'object') setAchievements(detail)
      else setAchievements(readAchievements())
    }
    function onStorage(e: StorageEvent) {
      if (e.key !== 'viberacer.achievements') return
      setAchievements(readAchievements())
    }
    window.addEventListener(ACHIEVEMENTS_EVENT, onCustom)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(ACHIEVEMENTS_EVENT, onCustom)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  const [phase, setPhase] = useState<Phase>('preRace')
  const [paused, setPaused] = useState(false)
  const [pauseView, setPauseView] = useState<PauseView>('menu')
  // Confetti celebration trigger. `kind` flips on a PB / RECORD lap and stays
  // set so the overlay keeps simulating until its particles expire; the
  // monotonic `key` makes back-to-back PBs spawn a fresh batch even when the
  // kind is unchanged.
  const [confettiKind, setConfettiKind] = useState<ConfettiKind | null>(null)
  const [confettiKey, setConfettiKey] = useState(0)
  // Session-scoped lap log. Reset on Restart so a fresh race starts clean.
  // The local PB on disk persists across restarts; this list does not.
  const [lapHistory, setLapHistory] = useState<LapHistoryEntry[]>([])
  // Lifetime PB-progression log for this (slug, versionHash). Survives
  // Restart, page reload, and version changes (re-read on slug or hash change
  // via the loader effect below). Mutated only when handleLapComplete writes
  // a fresh PB; the React state mirrors the persisted list so the pause-menu
  // pane and the menu-row count badge stay in sync without a second read.
  const [pbHistoryEntries, setPbHistoryEntries] = useState<PbHistoryEntry[]>(
    () => readPbHistory(slug, versionHash),
  )
  const [hud, setHud] = useState<HudState>(() => {
    const initialSectors = readLocalBestSectors(slug, versionHash)
    bestSectorsRef.current = initialSectors
    return {
      currentMs: 0,
      lastLapMs: null,
      bestSessionMs: null,
      bestAllTimeMs: readLocalBest(slug, versionHash),
      optimalLapMs: optimalLapTime(initialSectors),
      optimalLapComplete: hasCompleteOptimalLap(
        initialSectors,
        expectedSectorCount,
      ),
      overallRecord: initialRecord,
      lapCount: 0,
      onTrack: true,
      wrongWay: false,
      toast: null,
      toastKind: null,
      splitDelta: null,
      prediction: null,
      sectorPb: null,
      driftActive: false,
      driftScore: 0,
      driftMultiplier: 1,
      driftLapBest: null,
      driftAllTimeBest: readLocalBestDrift(slug, versionHash),
      pbStreak: 0,
      pbStreakBest: readLocalBestPbStreak(slug, versionHash),
      ghostGapMs: null,
      reactionTime: null,
      pbReactionMs: readLocalBestReaction(slug, versionHash),
      pbTopSpeedUs: readLocalBestTopSpeed(slug, versionHash),
      topSpeedPb: null,
      leaderboardRank: readLocalBestRank(slug, versionHash),
      paceNote: null,
      gear: 1,
    }
  })

  useEffect(() => {
    setMusicLapIndex(Math.max(0, hud.lapCount - 1))
  }, [hud.lapCount])

  useEffect(() => {
    setMusicOffTrack(!hud.onTrack)
  }, [hud.onTrack])

  // Hydrate the PB-splits ref on mount / slug change. Stored alongside the
  // local PB lap time so a fresh page load shows a delta tile from the very
  // first checkpoint of the new race.
  useEffect(() => {
    pbSplitsRef.current = readLocalBestSplits(slug, versionHash)
    pbLapMsRef.current = readLocalBest(slug, versionHash)
    // Reseed the session prior-PB reference when the player navigates to a
    // different slug or version so the end-of-session summary's "Vs PB"
    // tile compares against the correct starting bar.
    sessionPriorPbRef.current = readLocalBest(slug, versionHash)
    const freshSectors = readLocalBestSectors(slug, versionHash)
    bestSectorsRef.current = freshSectors
    // Reseed the prior-sector reference too so the end-of-session sector
    // breakdown card compares against the right bar after a navigation.
    sessionPriorSectorsRef.current = freshSectors
    // Same idea for the drift PB and the optimal lap: a fresh slug load
    // should reflect what the player's banked on this track / version, not
    // whatever was in HudState from a prior slug.
    setHud((prev) => ({
      ...prev,
      driftAllTimeBest: readLocalBestDrift(slug, versionHash),
      optimalLapMs: optimalLapTime(freshSectors),
      optimalLapComplete: hasCompleteOptimalLap(
        freshSectors,
        expectedSectorCount,
      ),
      // PB streak is per (slug, versionHash). The live counter resets on a
      // slug change since "consecutive PBs" only makes sense within a single
      // track-version run; the all-time best loads from disk so a target the
      // player chases survives a navigation.
      pbStreak: 0,
      pbStreakBest: readLocalBestPbStreak(slug, versionHash),
      // Reaction-time PB is per (slug, versionHash) too. Reload from disk so
      // a navigation surfaces the right bar; the live chip clears since the
      // player has not produced a fresh measurement for this layout yet.
      reactionTime: null,
      pbReactionMs: readLocalBestReaction(slug, versionHash),
      // Top-speed PB is per (slug, versionHash) too. Reload from disk so a
      // navigation surfaces the right bar; clear the live celebration chip
      // since the player has not produced a fresh PB on this layout yet.
      pbTopSpeedUs: readLocalBestTopSpeed(slug, versionHash),
      topSpeedPb: null,
      // Leaderboard rank is per (slug, versionHash). Reload from disk so a
      // navigation between layouts surfaces the rank for the new track
      // immediately rather than carrying over the previous slug's chip.
      leaderboardRank: readLocalBestRank(slug, versionHash),
    }))
    // Engagement stats are also (slug, version)-scoped: reload them so the
    // pause-menu Stats pane reflects what the player banked on this layout
    // rather than whatever was in state from a prior slug. The session
    // counter is a per-mount latch and keeps its value across this effect
    // so navigating between two versions in the same tab does not double up.
    const freshStats = readTrackStats(slug, versionHash) ?? freshTrackStats()
    trackStatsRef.current = freshStats
    setTrackStats(freshStats)
    sessionCountedRef.current = false
  }, [slug, versionHash, expectedSectorCount])

  const onCanvasHud = useCallback((next: RaceCanvasHud) => {
    // Latch wrong-way detection for the achievement evaluator. The on-screen
    // banner toggles every time the player turns around; this ref stays true
    // for the rest of the session so a fleeting blip earns the badge on the
    // next lap completion. Reset on Restart (see the restart() handler).
    if (next.wrongWay) wrongWayTriggeredRef.current = true
    if (next.wrongWay && !wrongWayAudioActiveRef.current) {
      playWrongWayCue()
      if (
        shouldGamepadRumbleFire(
          gamepadRumbleModeRef.current,
          padHasRumble(gamepadPadRef.current),
        )
      ) {
        fireGamepadImpulse(
          'wrongWay',
          gamepadPadRef.current,
          gamepadRumbleIntensityRef.current,
        )
      }
    }
    wrongWayAudioActiveRef.current = next.wrongWay
    setHud((prev) => ({
      ...prev,
      currentMs: next.currentMs,
      lapCount: next.lapCount,
      onTrack: next.onTrack,
      wrongWay: next.wrongWay,
      lastLapMs: next.lastLapMs ?? prev.lastLapMs,
      driftActive: next.driftActive,
      driftScore: next.driftScore,
      driftMultiplier: next.driftMultiplier,
      driftLapBest:
        next.driftLapBest > 0
          ? Math.max(prev.driftLapBest ?? 0, next.driftLapBest)
          : prev.driftLapBest,
      ghostGapMs: next.ghostGapMs,
      paceNote: next.paceNote,
      gear: next.gear,
    }))
  }, [])

  const pause = useCallback(() => {
    if (pausedRef.current) return
    pausedRef.current = true
    pauseStartTsRef.current = performance.now()
    crossfadeTo('pause', PAUSE_CROSSFADE_SEC)
    setPauseView('menu')
    setPaused(true)
    // Stop the continuous gamepad rumble so the motor does not keep humming
    // while the menu is up. The per-frame loop will reassert magnitudes the
    // moment the player resumes.
    stopGamepadRumble(gamepadPadRef.current)
  }, [])

  const resume = useCallback(() => {
    if (!pausedRef.current) return
    if (pauseStartTsRef.current !== null) {
      resumeShiftRef.current += performance.now() - pauseStartTsRef.current
      pauseStartTsRef.current = null
    }
    pausedRef.current = false
    crossfadeTo('game', PAUSE_CROSSFADE_SEC)
    // Drop keyboard focus so driving keys land on document.body, not a lingering
    // input/button from the pause UI. Also clear any held-key state that may
    // have been mid-press when focus shifted into an input while paused.
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }
    keys.current.forward = false
    keys.current.backward = false
    keys.current.left = false
    keys.current.right = false
    keys.current.handbrake = false
    keys.current.shiftDown = false
    keys.current.shiftUp = false
    keys.current.axes = null
    setPaused(false)
  }, [keys])

  const restart = useCallback(() => {
    pausedRef.current = false
    pauseStartTsRef.current = null
    resumeShiftRef.current = 0
    pendingResetRef.current = true
    tokenRef.current = null
    prevHitTMsRef.current = 0
    // A full Restart zeroes the session peak so the new run starts on a clean
    // dial. Restart Lap (mid-race lap reset) intentionally keeps the running
    // peak: the player chasing a hot lap should not lose their best straight.
    topSpeedRef.current = 0
    // The lastLap ghost source tracks within-session laps only, so a full
    // Restart zeroes the captured replay. The ghost-source effect re-runs on
    // restart and re-resolves activeGhostRef from the player's source pick;
    // for 'lastLap' that resolves to null until a fresh lap completes.
    lastLapReplayRef.current = null
    // A rival pick is a within-session affordance: the player picked it from
    // the leaderboard for this exact run. Restart abandons that intent so
    // the next race resolves the ghost from the player's normal source pick.
    setRival(null)
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current)
      toastTimerRef.current = null
    }
    if (splitClearTimerRef.current) {
      clearTimeout(splitClearTimerRef.current)
      splitClearTimerRef.current = null
    }
    if (sectorPbClearTimerRef.current) {
      clearTimeout(sectorPbClearTimerRef.current)
      sectorPbClearTimerRef.current = null
    }
    if (reactionTimeClearTimerRef.current) {
      clearTimeout(reactionTimeClearTimerRef.current)
      reactionTimeClearTimerRef.current = null
    }
    if (topSpeedPbClearTimerRef.current) {
      clearTimeout(topSpeedPbClearTimerRef.current)
      topSpeedPbClearTimerRef.current = null
    }
    crossfadeTo('title', PAUSE_CROSSFADE_SEC)
    silenceAllSfx(0.05)
    setPaused(false)
    setLapHistory([])
    setConfettiKind(null)
    // A full restart abandons the session so a wrong-way blip from the prior
    // run no longer counts toward the achievement. Restart Lap intentionally
    // keeps it: the player did go the wrong way at some point in this session.
    wrongWayTriggeredRef.current = false
    wrongWayAudioActiveRef.current = false
    if (achievementToastTimerRef.current) {
      clearTimeout(achievementToastTimerRef.current)
      achievementToastTimerRef.current = null
    }
    setAchievementToast(null)
    setHud((prev) => ({
      ...prev,
      currentMs: 0,
      lastLapMs: null,
      bestSessionMs: null,
      lapCount: 0,
      onTrack: true,
      wrongWay: false,
      toast: null,
      toastKind: null,
      splitDelta: null,
      prediction: null,
      sectorPb: null,
      driftActive: false,
      driftScore: 0,
      driftMultiplier: 1,
      driftLapBest: null,
      // The live streak only counts within a continuous race session. A full
      // Restart abandons the session, so the counter zeroes; the all-time
      // best is preserved (it lives on disk and stays in HudState).
      pbStreak: 0,
      // Ghost gap clears so the chip slot collapses cleanly during the
      // post-restart countdown. RaceCanvas will repopulate it on the first
      // post-GO HUD tick.
      ghostGapMs: null,
      // Reaction time clears so the chip slot collapses on the post-restart
      // countdown. The pb baseline survives (it lives on disk) so the next
      // measurement still grades against the player's all-time best.
      reactionTime: null,
      // Top-speed PB chip clears so the slot collapses on the post-restart
      // countdown. The PB baseline survives (it lives on disk and stays in
      // HudState) so the next peak still grades against the player's true PB.
      topSpeedPb: null,
      // Pace notes clear so the chip slot collapses cleanly during the
      // post-restart countdown; RaceCanvas repopulates them on the first
      // post-GO HUD tick.
      paceNote: null,
    }))
    setPhase('preRace')
  }, [])

  // Internal lap-reset pulse. Drops the in-flight replay buffer and the
  // pending live-split tile, then arms the canvas-side ref so the next rAF
  // frame teleports the car to spawn and reseeds the lap timer. Caller is
  // responsible for the gating (countdown / pause); see `restartLap` and the
  // pause-menu handler.
  const armLapReset = useCallback(() => {
    pendingLapResetRef.current = true
    pendingReplayForSubmitRef.current = null
    prevHitTMsRef.current = 0
    if (splitClearTimerRef.current) {
      clearTimeout(splitClearTimerRef.current)
      splitClearTimerRef.current = null
    }
    if (sectorPbClearTimerRef.current) {
      clearTimeout(sectorPbClearTimerRef.current)
      sectorPbClearTimerRef.current = null
    }
    setHud((prev) => ({
      ...prev,
      currentMs: 0,
      onTrack: true,
      wrongWay: false,
      splitDelta: null,
      prediction: null,
      sectorPb: null,
      driftActive: false,
      driftScore: 0,
      driftMultiplier: 1,
      driftLapBest: null,
      // Restart Lap abandons the in-flight lap which the player almost
      // certainly intends to be a "do-over"; counting a streak across a
      // restart would feel like the chip is gaming the rules. Zero it.
      pbStreak: 0,
      // Ghost gap clears so the chip slot collapses cleanly during the
      // post-teleport frame; RaceCanvas will repopulate it on the next HUD
      // tick once the player crosses the start again.
      ghostGapMs: null,
      // Pace notes clear with the same rationale as the ghost gap: the chip
      // slot collapses for one frame and RaceCanvas repopulates it on the
      // next HUD tick once the teleported car settles into its piece.
      paceNote: null,
    }))
  }, [])

  // Restart only the current lap. The car teleports back to spawn, the lap
  // timer zeroes, the in-flight checkpoint progress is discarded, and the
  // pending replay buffer is dropped (so the abandoned lap never gets posted
  // to the leaderboard). Lap counter, session PB, on-disk PB, lap history,
  // and the live toast / split tile are preserved. Available only while the
  // race is in flight (not during the countdown), and short-circuits while
  // paused so a stray R press in the pause menu does not leak through.
  const restartLap = useCallback(() => {
    if (phase !== 'racing') return
    if (pausedRef.current) return
    armLapReset()
  }, [phase, armLapReset])

  const exitToTitle = useCallback(() => {
    router.push('/')
  }, [router])

  // Pause-menu Exit handler. When the player has at least one completed lap
  // we route through the SessionSummary pane so they get a satisfying
  // wrap-up of the session before leaving. With no laps there is nothing to
  // summarize, so we route straight out (this also keeps the "instant exit"
  // feel for a player who paused immediately and changed their mind).
  const handleExitClick = useCallback(() => {
    if (lapHistory.length > 0) {
      setPauseView('sessionSummary')
      return
    }
    exitToTitle()
  }, [lapHistory.length, exitToTitle])

  const editTrack = useCallback(() => {
    router.push(`/${slug}/edit`)
  }, [router, slug])

  // Pause menu shortcut to the Tuning Lab. Prompts the player before leaving
  // a live race so a misclick does not abandon a lap. Mirrors the same copy
  // SettingsPane uses, so the prompt feels identical regardless of entry
  // point.
  const openTuningLabFromPause = useCallback(() => {
    if (!window.confirm('Leave the race to open the Tuning Lab?')) return
    router.push('/tune')
  }, [router])

  // Pause-menu Share button. Wraps `shareOrCopy` and surfaces the result as a
  // transient label on the button itself (the HUD's toast lane is reserved for
  // celebratory PB feedback).
  const [shareLabel, setShareLabel] = useState<string | null>(null)
  const shareLabelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleShare = useCallback(async () => {
    if (typeof window === 'undefined') return
    const payload = buildSharePayload({
      origin: window.location.origin,
      slug,
      versionHash,
      bestMs: hud.bestAllTimeMs,
      record: hud.overallRecord,
      initials,
    })
    const outcome = await shareOrCopy(payload)
    const next =
      outcome === 'shared'
        ? 'Shared!'
        : outcome === 'copied'
          ? 'Link copied!'
          : outcome === 'cancelled'
            ? null
            : 'Could not share'
    if (next === null) return
    setShareLabel(next)
    if (shareLabelTimerRef.current) clearTimeout(shareLabelTimerRef.current)
    shareLabelTimerRef.current = setTimeout(() => {
      setShareLabel(null)
      shareLabelTimerRef.current = null
    }, 1600)
  }, [slug, versionHash, hud.bestAllTimeMs, hud.overallRecord, initials])

  useEffect(() => {
    return () => {
      if (shareLabelTimerRef.current) clearTimeout(shareLabelTimerRef.current)
    }
  }, [])

  // Tracks whether the player has a submitted PB ghost on this (slug, version).
  // Set on mount, refreshed on every PB lap completion (the only path that
  // promotes the last-submit pointer). Drives the disabled / enabled state of
  // the pause-menu Challenge button so it reads as available exactly when the
  // generated link will resolve to a real ghost.
  const [lastSubmit, setLastSubmit] = useState<{
    nonce: string
    lapTimeMs: number
  } | null>(null)
  useEffect(() => {
    setLastSubmit(readLastSubmit(slug, versionHash))
  }, [slug, versionHash])
  // Refresh when a PB lap completes so the button enables in-place. We
  // re-read from disk rather than threading the value through submitLap so a
  // failed write (quota / disabled storage) leaves the button correctly
  // disabled without a phantom-enabled state.
  useEffect(() => {
    setLastSubmit(readLastSubmit(slug, versionHash))
  }, [slug, versionHash, hud.bestAllTimeMs])
  // Reload the lifetime PB-progression list whenever the player navigates to
  // a different slug or version (the history is per (slug, version), so a
  // navigation from one layout to another should swap the list rather than
  // carrying stale entries across). The fresh read is cheap (one
  // localStorage.getItem + JSON.parse) so the effect runs on mount as well.
  useEffect(() => {
    setPbHistoryEntries(readPbHistory(slug, versionHash))
  }, [slug, versionHash])

  const [challengeLabel, setChallengeLabel] = useState<string | null>(null)
  const challengeLabelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  )
  const handleChallenge = useCallback(async () => {
    if (typeof window === 'undefined') return
    if (!lastSubmit) return
    const payload = buildChallengeSharePayload({
      origin: window.location.origin,
      slug,
      versionHash,
      nonce: lastSubmit.nonce,
      from: initials,
      timeMs: lastSubmit.lapTimeMs,
    })
    const outcome = await shareOrCopy(payload)
    const next =
      outcome === 'shared'
        ? 'Challenge sent!'
        : outcome === 'copied'
          ? 'Challenge copied!'
          : outcome === 'cancelled'
            ? null
            : 'Could not share'
    if (next === null) return
    setChallengeLabel(next)
    if (challengeLabelTimerRef.current) {
      clearTimeout(challengeLabelTimerRef.current)
    }
    challengeLabelTimerRef.current = setTimeout(() => {
      setChallengeLabel(null)
      challengeLabelTimerRef.current = null
    }, 1600)
  }, [slug, versionHash, initials, lastSubmit])
  useEffect(() => {
    return () => {
      if (challengeLabelTimerRef.current) {
        clearTimeout(challengeLabelTimerRef.current)
      }
    }
  }, [])

  // Favorite-track tracker. Mirrors the live localStorage favorites list so
  // the pause-menu Star button reads as toggled correctly even when another
  // tab (or the home page) modifies the list mid-session. Reads the slug
  // membership through `isFavoriteTrack` so a malformed stored payload (or
  // SSR) defaults to false.
  const [favorited, setFavorited] = useState(false)
  useEffect(() => {
    setFavorited(isFavoriteTrack(readFavoriteTracks(), slug))
    function refresh() {
      setFavorited(isFavoriteTrack(readFavoriteTracks(), slug))
    }
    window.addEventListener('storage', refresh)
    window.addEventListener(FAVORITE_TRACKS_EVENT, refresh as EventListener)
    return () => {
      window.removeEventListener('storage', refresh)
      window.removeEventListener(
        FAVORITE_TRACKS_EVENT,
        refresh as EventListener,
      )
    }
  }, [slug])
  const handleToggleFavorite = useCallback(() => {
    const next = toggleFavoriteTrack(slug)
    setFavorited(isFavoriteTrack(next, slug))
  }, [slug])

  // Rival ghost. The leaderboard's per-row "Chase" button hands a
  // RivalSelection here; we fetch the matching replay and swap activeGhostRef
  // + nameplate over to it. The pick persists for the rest of the session
  // (including across paused / resumed laps) until the player either taps
  // "Cancel chase", taps Restart, or navigates Exit. A non-null `rival`
  // suppresses the regular ghost-source-effect rewrites so a freshly recorded
  // PB does not yank the ghost away from the rival mid-session. The friend-
  // challenge banner already owns the cyan top-center slot so a rival uses
  // a slightly lower banner that does not collide.
  const [rival, setRival] = useState<RivalSelection | null>(null)
  const rivalRef = useRef<RivalSelection | null>(null)
  rivalRef.current = rival

  const handleChaseRival = useCallback(
    (selection: RivalSelection) => {
      if (!isValidNonce(selection.nonce)) return
      const params = new URLSearchParams({
        slug,
        v: versionHash,
        nonce: selection.nonce,
      })
      // Mark the rival immediately so the leaderboard row flips to the
      // CHASING pill on the next render even before the network resolves.
      // The renderer keeps painting the previous ghost until the replay
      // arrives, so the player sees no visual gap.
      setRival(selection)
      setPauseView('menu')
      fetch(`/api/replay/byNonce?${params.toString()}`)
        .then(async (res) => {
          if (!res.ok) return
          const body = await res.json().catch(() => null)
          const parsed = ReplaySchema.safeParse(body)
          if (!parsed.success) return
          // Only mount the new ghost when the player is still chasing this
          // rival; a rapid Cancel chase before the replay resolves should
          // leave the previous ghost in place.
          if (rivalRef.current?.nonce !== selection.nonce) return
          activeGhostRef.current = parsed.data
          activeGhostMetaRef.current = {
            initials: selection.initials,
            lapTimeMs: selection.lapTimeMs,
          }
        })
        .catch(() => {
          // Best-effort. If the rival's replay cannot be fetched (404 from a
          // legacy lap that predates the replay storage path) we keep the
          // previous ghost on screen and leave the CHASING pill visible so
          // the player understands why they did not get a new target. The
          // banner makes the chase explicit even if the ghost path itself
          // never updates.
        })
    },
    [slug, versionHash],
  )

  const handleCancelChase = useCallback(() => {
    if (rivalRef.current === null) return
    setRival(null)
    // Re-resolve the active ghost from the player's normal source pick so the
    // next finish-line cross immediately races whichever ghost the regular
    // flow would have shown. Mirrors the no-rival branch of the regular
    // ghost-resolution effect.
    const local = readLocalBestReplay(slug, versionHash)
    const source = ghostSourceRef.current
    activeGhostRef.current = pickGhostReplay(
      source,
      local,
      null,
      lastLapReplayRef.current,
    )
    activeGhostMetaRef.current = pickGhostMeta(
      source,
      localPbMetaRef.current,
      topGhostMetaRef.current,
      lastLapMetaRef.current,
    )
  }, [slug, versionHash])

  useEffect(() => {
    // Resolve the initial ghost based on the player's source preference:
    //   auto: prefer the local PB replay; fall back to leaderboard top.
    //   top:  always show the leaderboard top recording.
    //   pb:   only show the local PB; do not fall back to top.
    //   lastLap: show the most recent completed lap of THIS session; null
    //            until the first lap finishes (handleLapReplay swaps the
    //            ref live as new laps complete).
    // Once set, this ref is updated only on personal-best laps (see
    // handleLapComplete) so a swap mid-race waits for a clean lap boundary.
    let cancelled = false
    const local = readLocalBestReplay(slug, versionHash)
    const source = settings.ghostSource
    // Always refresh the per-source meta refs so a Cancel chase later in the
    // session restores the right plate without a second disk read. The
    // active ghost ref + meta ref are only rewritten when no rival is being
    // chased; otherwise the rival ghost stays on screen until the player
    // either hits Cancel chase or Restart.
    localPbMetaRef.current = local
      ? { initials, lapTimeMs: local.lapTimeMs }
      : null
    if (rivalRef.current === null) {
      // Apply the local-only resolution immediately so the player sees a ghost
      // (or nothing) on the first frame without waiting on the network. Pass
      // the live lastLap ref so re-running this effect after a source switch
      // mid-session immediately picks up the existing recorded lap.
      activeGhostRef.current = pickGhostReplay(
        source,
        local,
        null,
        lastLapReplayRef.current,
      )
      // Resolve the initial nameplate meta synchronously alongside the replay
      // so the plate paints with the right identity on the very first frame
      // when the source is 'pb' / 'lastLap' / 'auto' and a local PB exists.
      activeGhostMetaRef.current = pickGhostMeta(
        source,
        localPbMetaRef.current,
        topGhostMetaRef.current,
        lastLapMetaRef.current,
      )
    }
    if (!ghostSourceNeedsTopFetch(source)) {
      return () => {
        cancelled = true
      }
    }
    fetch(
      `/api/replay/top?slug=${encodeURIComponent(slug)}&v=${versionHash}`,
    )
      .then(async (res) => {
        if (!res.ok) return
        const body = await res.json().catch(() => null)
        const parsed = ReplaySchema.safeParse(body)
        if (cancelled || !parsed.success) return
        // Recompute against the freshly fetched top in case a PB lap landed
        // between the initial paint and the network resolve.
        const fresh = readLocalBestReplay(slug, versionHash)
        // Pull the optional `initials` field off the raw response (the
        // server adds it from the leaderboard top member; an empty board
        // returns null). Falls back to "???" so the plate never reads
        // blank when the leaderboard write predates the metadata path.
        const topInitials =
          body && typeof body === 'object' && 'initials' in body
            ? typeof (body as { initials?: unknown }).initials === 'string'
              ? ((body as { initials: string }).initials as string)
              : null
            : null
        topGhostMetaRef.current = {
          initials: topInitials ?? '???',
          lapTimeMs: parsed.data.lapTimeMs,
        }
        localPbMetaRef.current = fresh
          ? { initials, lapTimeMs: fresh.lapTimeMs }
          : null
        // Same rival-respect rule as the synchronous branch above: if the
        // player is mid-chase, do not yank the ghost away on the network
        // resolve. The rival ghost was already mounted by handleChaseRival
        // and stays put until Cancel chase or Restart.
        if (rivalRef.current === null) {
          activeGhostRef.current = pickGhostReplay(
            source,
            fresh,
            parsed.data,
            lastLapReplayRef.current,
          )
          activeGhostMetaRef.current = pickGhostMeta(
            source,
            localPbMetaRef.current,
            topGhostMetaRef.current,
            lastLapMetaRef.current,
          )
        }
      })
      .catch(() => {
        // Best-effort; absent ghost is a non-fatal degradation.
      })
    return () => {
      cancelled = true
    }
  }, [slug, versionHash, settings.ghostSource, initials])

  // Friend-challenge ghost. When the player opens a `?challenge=<nonce>` link,
  // override the active ghost with the referenced lap so the recipient races
  // the sender's exact ghost rather than the leaderboard top or their own PB.
  // Runs after the regular ghost-resolution effect so we always overwrite the
  // ref last; the network fetch order does not matter since this writes the
  // same ref on completion.
  useEffect(() => {
    if (!challenge) return
    let cancelled = false
    const params = new URLSearchParams({
      slug,
      v: versionHash,
      nonce: challenge.nonce,
    })
    fetch(`/api/replay/byNonce?${params.toString()}`)
      .then(async (res) => {
        if (!res.ok) return
        const body = await res.json().catch(() => null)
        const parsed = ReplaySchema.safeParse(body)
        if (cancelled || !parsed.success) return
        activeGhostRef.current = parsed.data
        // Surface the friend's identity above the ghost car. The challenge
        // payload carries the sender's initials and target time; both come
        // from the URL, so we trust them as far as a browsable link goes
        // (the `formatNameplate*` helpers sanitize anyway). Falls back to
        // the replay's own lap time when the challenge omits a target.
        activeGhostMetaRef.current = {
          initials: challenge.from ?? '???',
          lapTimeMs:
            typeof challenge.timeMs === 'number' && challenge.timeMs > 0
              ? challenge.timeMs
              : parsed.data.lapTimeMs,
        }
      })
      .catch(() => {
        // Best-effort; if the challenge replay cannot be loaded we degrade to
        // whichever ghost the regular flow resolved.
      })
    return () => {
      cancelled = true
    }
  }, [slug, versionHash, challenge])

  useEffect(() => {
    function onKeyDown() {
      inputModeRef.current = 'keyboard'
    }
    function onPointer(e: PointerEvent) {
      if (e.pointerType === 'touch') {
        inputModeRef.current = 'touch'
      }
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('pointerdown', onPointer)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('pointerdown', onPointer)
    }
  }, [])

  // Gamepad: routes Start to pause / resume and flags inputMode -> 'gamepad'
  // any time analog axes are populated. Last-input-wins is shared with the
  // keyboard / touch listeners above.
  const handlePadPause = useCallback(() => {
    if (phase !== 'racing') return
    if (pausedRef.current) resume()
    else pause()
  }, [phase, pause, resume])
  useGamepad(keys, handlePadPause, settings.gamepadBindings, gamepadPadRef)
  useEffect(() => {
    let raf = 0
    function check() {
      if (keys.current.axes !== null) {
        inputModeRef.current = 'gamepad'
      }
      raf = requestAnimationFrame(check)
    }
    raf = requestAnimationFrame(check)
    return () => cancelAnimationFrame(raf)
  }, [keys])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      if (phase !== 'racing') return
      e.preventDefault()
      if (pausedRef.current) resume()
      else pause()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, pause, resume])

  // One-shot keyboard listener for the restartLap action. Reads the current
  // bindings via a ref so a Settings remap takes effect without re-binding.
  const restartLapBindingsRef = useRef<string[]>(settings.keyBindings.restartLap)
  restartLapBindingsRef.current = settings.keyBindings.restartLap
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Skip when typing in an input (initials, feedback textarea, etc.).
      const target = e.target
      if (target instanceof HTMLElement) {
        if (
          target.isContentEditable ||
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT'
        ) {
          return
        }
      }
      if (e.repeat) return
      if (!restartLapBindingsRef.current.includes(e.code)) return
      e.preventDefault()
      restartLap()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [restartLap])

  // Time-of-day auto cycle. When the player picks 'slow' or 'fast' in Settings
  // (and no track-author baked time-of-day is locking the scene), a wall-clock
  // interval rotates `cycleTimeOfDayRef.current` through noon -> morning ->
  // sunset -> night at the picked cadence. The renderer reads the ref each
  // frame via `syncTimeOfDay` so the sky reskins on the next frame after the
  // ref advances; no React re-render is needed for the visual update. A small
  // setState forces the headlights / chip in the menu to refresh on each step
  // so the visible label and the physical scene stay in sync.
  const baseTimeOfDayForCycle = activeMood.timeOfDay ?? settings.timeOfDay
  const [, setCycleTick] = useState(0)
  useEffect(() => {
    if (settings.timeOfDayCycle === 'off' || trackMoodLocksTimeOfDay) {
      // Snap the cycle back to the base pick so a flip off lands on the
      // player's chosen sky on the next frame instead of stranding the scene
      // mid-rotation.
      cycleTimeOfDayRef.current = baseTimeOfDayForCycle
      return
    }
    const period = TIME_OF_DAY_CYCLE_PERIOD_MS[settings.timeOfDayCycle]
    if (!Number.isFinite(period) || period <= 0) return
    const startMs = Date.now()
    // Seed the cycle's starting value to whatever the base resolves to right
    // now so the first transition lands one period later, not immediately.
    cycleTimeOfDayRef.current = activeTimeOfDayAt(
      startMs,
      startMs,
      settings.timeOfDayCycle,
      baseTimeOfDayForCycle,
    )
    const id = window.setInterval(() => {
      const next = activeTimeOfDayAt(
        startMs,
        Date.now(),
        settings.timeOfDayCycle,
        baseTimeOfDayForCycle,
      )
      if (next !== cycleTimeOfDayRef.current) {
        cycleTimeOfDayRef.current = next
        // Bump local state so the headlight effect (and any other consumer of
        // `effectiveTimeOfDay`) picks up the new value on the next render.
        setCycleTick((n) => n + 1)
      }
    }, period)
    return () => window.clearInterval(id)
  }, [
    settings.timeOfDayCycle,
    trackMoodLocksTimeOfDay,
    baseTimeOfDayForCycle,
  ])

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
      if (splitClearTimerRef.current) clearTimeout(splitClearTimerRef.current)
      if (sectorPbClearTimerRef.current) {
        clearTimeout(sectorPbClearTimerRef.current)
      }
      if (topSpeedPbClearTimerRef.current) {
        clearTimeout(topSpeedPbClearTimerRef.current)
      }
      silenceAllSfx(0.05)
    }
  }, [])

  // Top-speed PB watcher. Polls `topSpeedRef` (which the Speedometer overlay
  // updates inside its own rAF loop using `updateTopSpeed`) at a calm cadence
  // so the cost stays well under the rendering budget. When the live peak
  // beats the player's stored per-track PB by at least the documented delta,
  // promote the new value, persist to disk, and surface a celebration chip
  // that auto-clears after TOP_SPEED_PB_DISPLAY_MS. The lifetime PB updates
  // independently so a fresh layout that does not beat the per-slug PB can
  // still set a new "fastest you've ever gone" mark.
  //
  // Gated on the racing phase so the chip never fires during the countdown
  // or while paused (the Speedometer's RAF loop also skips its own update
  // when the canvas is hidden, but the gate here makes the intent explicit).
  useEffect(() => {
    if (phase !== 'racing') return
    if (paused) return
    let cancelled = false
    const TOP_SPEED_POLL_MS = 250
    const interval = window.setInterval(() => {
      if (cancelled) return
      const peakUs = topSpeedRef.current
      const sanitized = sanitizeTopSpeed(peakUs)
      if (sanitized === null) return
      // Lifetime first so a brand-new layout still records a fresh lifetime
      // PB even when it does not beat the per-track value (e.g. the player
      // has been racing the same long track for months and a faster sandbox
      // run is what nudges the lifetime mark up).
      const lifetimePrev = readLifetimeBestTopSpeed()
      if (isTopSpeedPb(lifetimePrev, sanitized)) {
        writeLifetimeBestTopSpeed(sanitized)
      }
      // Per-track PB. Compare against the value mirrored into HudState so the
      // celebration chip and the persistent storage stay in lockstep.
      setHud((prev) => {
        if (!isTopSpeedPb(prev.pbTopSpeedUs, sanitized)) return prev
        writeLocalBestTopSpeed(slug, versionHash, sanitized)
        if (topSpeedPbClearTimerRef.current) {
          clearTimeout(topSpeedPbClearTimerRef.current)
          topSpeedPbClearTimerRef.current = null
        }
        topSpeedPbClearTimerRef.current = setTimeout(() => {
          setHud((p) => ({ ...p, topSpeedPb: null }))
          topSpeedPbClearTimerRef.current = null
        }, TOP_SPEED_PB_DISPLAY_MS)
        return {
          ...prev,
          pbTopSpeedUs: sanitized,
          topSpeedPb: {
            topSpeedUs: sanitized,
            priorUs: prev.pbTopSpeedUs,
            generatedAtMs: performance.now(),
          },
        }
      })
    }, TOP_SPEED_POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [phase, paused, slug, versionHash])

  function handleLapReplay(replay: Replay) {
    // Always queue the buffered replay for the next submit so the server can
    // store it. The PB swap happens in handleLapComplete where we know the
    // previous best from React state.
    pendingReplayForSubmitRef.current = replay
    // Capture the just-completed lap as the canonical "last lap" replay so
    // the lastLap ghost source can swap to it on the next finish-line cross.
    // Runs for every completed lap, even non-PB ones, so the player can
    // chase their most recent attempt even when slowly slipping off pace.
    lastLapReplayRef.current = replay
    // Mirror the lastLap meta tuple so the floating nameplate above the
    // ghost car shows the right initials + lap time on the very next frame
    // when the player picked the lastLap source (or switches to it later).
    lastLapMetaRef.current = { initials, lapTimeMs: replay.lapTimeMs }
    // When the player picked the lastLap ghost source, swap the active ghost
    // immediately so the next lap races against this latest attempt. Skip the
    // swap in friend-challenge mode (the friend's ghost takes priority) and
    // in rival-chase mode (the picked rival ghost stays on screen until the
    // player taps Cancel chase or Restart).
    if (
      challenge === null &&
      rivalRef.current === null &&
      ghostSourceRef.current === 'lastLap'
    ) {
      activeGhostRef.current = replay
      activeGhostMetaRef.current = lastLapMetaRef.current
    }
  }

  // Drift score for the just-completed lap. Compares against the all-time
  // local best for this (slug, hash); on a new high water mark, persists to
  // localStorage and surfaces a toast (uses the same lane as the lap-saved
  // toast, so a true PB lap takes precedence).
  function handleLapDriftBest(score: number) {
    // Capture the just-finished lap's drift peak in a ref so the next
    // handleLapComplete can feed it straight into the achievement evaluator
    // without waiting for the throttled HUD setState to settle.
    lastLapDriftScoreRef.current = score > 0 ? score : null
    setHud((prev) => {
      const lapBest = score > 0 ? score : prev.driftLapBest ?? 0
      const allTime = prev.driftAllTimeBest ?? 0
      const newAllTime = lapBest > allTime ? lapBest : null
      if (newAllTime !== null) {
        writeLocalBestDrift(slug, versionHash, newAllTime)
      }
      return {
        ...prev,
        driftLapBest: score > 0 ? score : prev.driftLapBest,
        driftAllTimeBest: newAllTime ?? prev.driftAllTimeBest,
      }
    })
  }

  // Reaction-time chip handler. Fires once per race-start the very first frame
  // the player presses throttle after the GO light. Persists a fresh PB to
  // localStorage (per-slug AND lifetime), updates HudState so the chip pops
  // with the right tier accent, and arms an auto-clear timer so the chip
  // fades after REACTION_TIME_DISPLAY_MS without crowding the mid-race HUD.
  function handleReactionTime(reactionMs: number) {
    const sanitized = sanitizeReactionTime(reactionMs)
    if (sanitized === null) return
    const generatedAtMs = performance.now()
    if (reactionTimeClearTimerRef.current) {
      clearTimeout(reactionTimeClearTimerRef.current)
      reactionTimeClearTimerRef.current = null
    }
    setHud((prev) => {
      const wasPb = isReactionPb(prev.pbReactionMs, sanitized)
      if (wasPb) {
        writeLocalBestReaction(slug, versionHash, sanitized)
      }
      // Lifetime best: a single number across every (slug, version). Updated
      // independently of the per-slug PB so a fresh layout that does not beat
      // the per-slug PB can still set a new lifetime best.
      const lifetimePrev = readLifetimeBestReaction()
      if (isReactionPb(lifetimePrev, sanitized)) {
        writeLifetimeBestReaction(sanitized)
      }
      return {
        ...prev,
        reactionTime: { reactionMs: sanitized, isPb: wasPb, generatedAtMs },
        pbReactionMs: wasPb ? sanitized : prev.pbReactionMs,
      }
    })
    reactionTimeClearTimerRef.current = setTimeout(() => {
      reactionTimeClearTimerRef.current = null
      setHud((prev) => ({ ...prev, reactionTime: null }))
    }, REACTION_TIME_DISPLAY_MS)
  }

  // Per-checkpoint live split tile. Re-computed each time the player crosses
  // an in-lap checkpoint by comparing their just-recorded hit against the PB
  // splits stored from their last all-time PB. The tile auto-clears after
  // SPLIT_DISPLAY_MS and resets between laps (handleLapComplete clears it).
  function handleCheckpointHit(hit: CheckpointHit) {
    const generatedAtMs = performance.now()
    // Per-sector PB detection. Runs independently of the PB-splits / projection
    // path so the very first lap of a brand-new track still flashes a sector
    // PB the moment a sector completes (no recorded best yet => first-time PB).
    const sectorOut = compareSectorToBest(
      hit,
      prevHitTMsRef.current,
      bestSectorsRef.current,
    )
    prevHitTMsRef.current = hit.tMs
    const sectorPb =
      sectorOut && sectorOut.isPb
        ? {
            cpId: sectorOut.cpId,
            durationMs: sectorOut.durationMs,
            generatedAtMs,
          }
        : null
    if (sectorPb) {
      if (sectorPbClearTimerRef.current) {
        clearTimeout(sectorPbClearTimerRef.current)
      }
      sectorPbClearTimerRef.current = setTimeout(() => {
        setHud((prev) => ({ ...prev, sectorPb: null }))
        sectorPbClearTimerRef.current = null
      }, SECTOR_PB_DISPLAY_MS)
    }

    const pb = pbSplitsRef.current
    if (!pb || pb.length === 0) {
      // No PB on file yet, but a sector PB might still want to flash.
      if (sectorPb) {
        setHud((prev) => ({ ...prev, sectorPb }))
      }
      return
    }
    const out = computeSplitDeltaForLastHit([hit], pb)
    if (!out) {
      if (sectorPb) {
        setHud((prev) => ({ ...prev, sectorPb }))
      }
      return
    }
    // Live projected lap time. Same input ingredients as the split tile, plus
    // the stored PB lap time. Only refreshes at checkpoints so it does not
    // jitter mid-sector. Persists in HudState until the next checkpoint or the
    // lap completes / restarts.
    const prediction = predictLapTimeFromHits(
      [hit],
      pb,
      pbLapMsRef.current,
      recordLapMsRef.current,
    )
    setHud((prev) => ({
      ...prev,
      splitDelta: { deltaMs: out.deltaMs, cpId: out.cpId, generatedAtMs },
      prediction: prediction ?? prev.prediction,
      sectorPb: sectorPb ?? prev.sectorPb,
    }))
    if (splitClearTimerRef.current) clearTimeout(splitClearTimerRef.current)
    splitClearTimerRef.current = setTimeout(() => {
      setHud((prev) => ({ ...prev, splitDelta: null }))
      splitClearTimerRef.current = null
    }, SPLIT_DISPLAY_MS)
  }

  function handleLapComplete(event: LapCompleteEvent) {
    const lapMs = event.lapTimeMs
    const outcomeRef: { current: ToastKind } = { current: 'lap' }
    // Mirror the values setHud computes inside its updater so the achievement
    // evaluator (which runs after the closure) reads from a single source of
    // truth without a second setState.
    const lapDerivedRef: {
      current: { isAllTimePb: boolean; nextStreak: number; lapBestAllTimeMs: number | null }
    } = {
      current: { isAllTimePb: false, nextStreak: 0, lapBestAllTimeMs: null },
    }
    // Merge the just-completed lap's per-sector durations into the running
    // best-sector map. Runs on every completed lap (not just PBs) because a
    // single sector can be a personal best even when the rest of the lap was
    // slow. The merge is pure and dedupes by cpId, so a stitched optimal
    // lap can be assembled across multiple imperfect laps.
    const lapSectors = computeSectorDurations(event.hits)
    const mergedSectors = mergeBestSectors(bestSectorsRef.current, lapSectors)
    bestSectorsRef.current = mergedSectors
    writeLocalBestSectors(slug, versionHash, mergedSectors)
    const newOptimal = optimalLapTime(mergedSectors)
    const newOptimalComplete = hasCompleteOptimalLap(
      mergedSectors,
      expectedSectorCount,
    )
    setHud((prev) => {
      const isSessionPb = prev.bestSessionMs === null || lapMs < prev.bestSessionMs
      const isAllTimePb = prev.bestAllTimeMs === null || lapMs < prev.bestAllTimeMs
      const isNewRecord =
        prev.overallRecord === null || lapMs < prev.overallRecord.lapTimeMs
      // Snapshot the prior PB before this lap rewrites it so the lap-history
      // entry shows the right delta. Captured inside the setHud closure so
      // back-to-back lap completions never compare against each other's
      // already-applied PB update.
      setLapHistory((current) =>
        appendLap(current, {
          lapNumber: event.lapNumber,
          lapTimeMs: lapMs,
          priorBestAllTimeMs: prev.bestAllTimeMs,
          // Carry the lap's per-sector durations into the history entry so the
          // Laps pane can expand the row into a sector breakdown without
          // going back to the raw checkpoint hits.
          sectors: lapSectors,
        }),
      )
      if (isNewRecord) {
        // Mirror the optimistic record swap into the prediction ref so the
        // next lap's "vs REC" projection compares against the freshest
        // baseline (matches the pbLapMsRef pattern below).
        recordLapMsRef.current = lapMs
      }
      if (isAllTimePb) {
        writeLocalBest(slug, versionHash, lapMs)
        // Append to the lifetime PB-progression log for this (slug, version).
        // The pure helper drops oldest entries past the cap, validates the
        // shape, and silently no-ops on storage-quota failures so the lap
        // flow stays unbroken. Mirror the result into local React state so the
        // pause-menu pane and the menu-row badge stay in sync without a
        // second read.
        const nextHistory = appendStoredPbHistory(slug, versionHash, {
          lapTimeMs: lapMs,
          // prev.bestAllTimeMs is the value being beaten right now (or null on
          // a fresh slug + version). Captured before the setHud reducer
          // promotes the new PB into bestAllTimeMs.
          priorBestMs: prev.bestAllTimeMs,
          achievedAt: Date.now(),
        })
        setPbHistoryEntries(nextHistory)
        // Mark this submit as a PB so the response handler knows to promote
        // the returned `submittedNonce` into the friend-challenge pointer.
        pendingPbForSubmitRef.current = { lapTimeMs: lapMs }
        // Capture the lap's checkpoint splits so the next lap's live delta
        // tile compares against this fresh reference. The hits array carries
        // {cpId, tMs} pairs in lap order, exactly what the splits helper
        // expects.
        writeLocalBestSplits(slug, versionHash, event.hits)
        pbSplitsRef.current = event.hits
        // Mirror the new PB lap time into the prediction ref so the very next
        // checkpoint of the next lap projects against the freshest baseline.
        pbLapMsRef.current = lapMs
        const pending = pendingReplayForSubmitRef.current
        if (pending) {
          writeLocalBestReplay(slug, versionHash, pending)
          // In challenge mode, keep racing the friend's ghost across PBs so
          // the player can keep trying to beat the same target. Otherwise
          // honor the player's source preference: 'top' keeps chasing the
          // leaderboard #1 even after a personal best; 'auto' and 'pb' swap
          // to the freshly recorded PB so the next lap chases the player's
          // own best path.
          // Mid-chase: keep the rival ghost on screen across PB laps so the
          // player can keep racing the same target after improving their own
          // best. localPbMetaRef is still kept fresh so a Cancel chase
          // immediately falls back to the right plate.
          const newPbMeta: GhostMeta = { initials, lapTimeMs: lapMs }
          localPbMetaRef.current = newPbMeta
          if (challenge === null && rivalRef.current === null) {
            activeGhostRef.current = pickGhostAfterPb(
              ghostSourceRef.current,
              pending,
              activeGhostRef.current,
            )
            // Mirror the meta swap so the floating nameplate above the
            // ghost car picks up the player's fresh PB (initials + lap
            // time) on the next finish-line cross. 'top' keeps showing
            // the leaderboard top's identity; 'lastLap' is handled by
            // handleLapReplay (the canonical writer for that source).
            activeGhostMetaRef.current = pickGhostMetaAfterPb(
              ghostSourceRef.current,
              newPbMeta,
              activeGhostMetaRef.current,
            )
          }
        }
      }
      // Maintain the consecutive-PB streak. A PB lap (or the first lap on a
      // fresh slug, since `isAllTimePb` is true when there is no prior best)
      // increments the live counter; any non-PB lap zeroes it. The all-time
      // best is bumped (and persisted) only when the live counter exceeds it
      // so a slow-and-steady weekend that never beats a peak streak does not
      // overwrite a hard-won record.
      const nextStreak = isAllTimePb
        ? incrementStreak(prev.pbStreak)
        : resetStreak()
      const nextStreakBest = isStreakBest(nextStreak, prev.pbStreakBest)
        ? nextStreak
        : prev.pbStreakBest
      if (
        nextStreakBest !== prev.pbStreakBest &&
        nextStreakBest !== null &&
        nextStreakBest > 0
      ) {
        writeLocalBestPbStreak(slug, versionHash, nextStreakBest)
      }
      const toastKind: ToastKind = isNewRecord
        ? 'record'
        : isAllTimePb
          ? 'pb'
          : 'lap'
      outcomeRef.current = toastKind
      lapDerivedRef.current = {
        isAllTimePb,
        nextStreak,
        lapBestAllTimeMs: isAllTimePb ? lapMs : prev.bestAllTimeMs,
      }
      const toast =
        toastKind === 'record'
          ? 'NEW RECORD!'
          : toastKind === 'pb'
            ? 'NEW PB!'
            : `lap ${event.lapNumber} saved`
      return {
        ...prev,
        bestSessionMs: isSessionPb ? lapMs : prev.bestSessionMs,
        bestAllTimeMs: isAllTimePb ? lapMs : prev.bestAllTimeMs,
        optimalLapMs: newOptimal,
        optimalLapComplete: newOptimalComplete,
        overallRecord: isNewRecord
          ? { initials, lapTimeMs: lapMs }
          : prev.overallRecord,
        toast,
        toastKind,
        // Reset the per-checkpoint delta tile so the next lap starts clean
        // rather than freezing on the final checkpoint's value. The first
        // checkpoint of the new lap will populate it again.
        splitDelta: null,
        // Same rule for the projected lap-time block. A finished lap's
        // projection is meaningless once a new lap has begun; clear it so the
        // PROJECTED slot disappears until the first checkpoint of the next lap.
        prediction: null,
        // Same rule for the sector PB badge: a finished lap's celebration
        // belongs to the lap that just ended; the next lap should start clean.
        sectorPb: null,
        pbStreak: nextStreak,
        pbStreakBest: nextStreakBest,
      }
    })
    // Reset the per-sector PB tracking ref so the very first checkpoint of the
    // next lap measures from the start line correctly.
    prevHitTMsRef.current = 0
    if (splitClearTimerRef.current) {
      clearTimeout(splitClearTimerRef.current)
      splitClearTimerRef.current = null
    }
    if (sectorPbClearTimerRef.current) {
      clearTimeout(sectorPbClearTimerRef.current)
      sectorPbClearTimerRef.current = null
    }
    const outcome = outcomeRef.current
    playFinishStinger()
    if (outcome === 'record') playPbFanfare('record')
    else if (outcome === 'pb') playPbFanfare('pb')
    else playLapStinger()
    // Touch path: mirrors the audio outcome with a short pulse for every lap,
    // a longer double-pulse for a fresh personal best, and a triple-pulse for
    // a fresh track-wide record. shouldTouchHapticFire folds the mode picker
    // (`settings.haptics`) and the live touch-runtime detection into a single
    // decision, so a desktop session with mode 'auto' never buzzes the phone
    // motor. The separate gamepad path below has its own mode and resolver.
    if (shouldTouchHapticFire(hapticsModeRef.current, isTouchRuntime())) {
      fireHaptic(outcome)
    }
    // Gamepad path: layered on top of the continuous rumble loop. The per-
    // frame loop in RaceCanvas reasserts the continuous magnitudes on the
    // next tick, so the impulse + continuous tracks coexist cleanly.
    if (
      shouldGamepadRumbleFire(
        gamepadRumbleModeRef.current,
        padHasRumble(gamepadPadRef.current),
      )
    ) {
      fireGamepadImpulse(
        outcome,
        gamepadPadRef.current,
        gamepadRumbleIntensityRef.current,
      )
    }
    if (outcome === 'record' || outcome === 'pb') {
      setConfettiKind(outcome)
      setConfettiKey((k) => k + 1)
    }
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => {
      setHud((prev) => ({ ...prev, toast: null, toastKind: null }))
      toastTimerRef.current = null
    }, 1800)

    // Update the per-track engagement record. Increments the all-time lap
    // count, adds the lap time to total drive time, and stamps `lastPlayedAt`
    // with the wall-clock moment the lap finished. Persisted through the
    // existing localStorage layer so the Stats pause pane reads the freshest
    // values on the next open.
    const nextStats = recordTrackStatsLap(
      trackStatsRef.current,
      lapMs,
      Date.now(),
    )
    trackStatsRef.current = nextStats
    setTrackStats(nextStats)
    writeTrackStats(slug, versionHash, nextStats)

    // Bookmark today's UTC date for the daily-streak widget on the home
    // page. Idempotent: a duplicate write is a no-op so multiple laps in
    // the same UTC day add nothing to the stored history. The streak is
    // intentionally cross-track so any completed lap counts.
    recordDailyStreakDay(dateKeyForUtc(Date.now()))

    // Evaluate achievements against the freshly-updated state. The evaluator
    // is pure and runs on every lap; the unlock helper merges only the ids
    // that were not previously unlocked so a repeat trigger is a no-op.
    const lapDerived = lapDerivedRef.current
    // Compare the freshly-updated all-time PB against the best record we know
    // for this version. The optimistic record swap inside the setHud closure
    // already handled the case where THIS lap took the record; for any other
    // lap we use the seeded initialRecord (server-side load) as the baseline.
    const recordTimeForMedal =
      lapDerived.lapBestAllTimeMs !== null && lapDerived.lapBestAllTimeMs <= lapMs
        ? // The player just took the record themselves: use the new lap as
          // its own target, which makes medalForTime resolve to platinum.
          lapMs
        : initialRecord?.lapTimeMs ?? null
    const medalTier = medalForTime(
      lapDerived.lapBestAllTimeMs,
      recordTimeForMedal,
    )
    // Persist the medal into the lifetime cabinet. The writer is monotonic so
    // a slower lap that no longer qualifies for the previously-earned tier
    // never demotes the stored value, and the call is a no-op when the lap
    // does not earn an upgrade. Lets the home page surface a "medal cabinet"
    // counts strip without re-deriving from KV on every page load.
    writeMedalForTrack(slug, versionHash, medalTier)
    const earned = evaluateAchievements({
      lapTimeMs: lapMs,
      isPb: lapDerived.isAllTimePb,
      driftLapScore: lastLapDriftScoreRef.current,
      pbStreak: lapDerived.nextStreak,
      trackLapCount: nextStats.lapCount,
      trackDriveMs: nextStats.totalDriveMs,
      optimalComplete: hasCompleteOptimalLap(
        bestSectorsRef.current,
        expectedSectorCount,
      ),
      distinctSlugCount: distinctSlugCountRef.current,
      wrongWayTriggered: wrongWayTriggeredRef.current,
      medalTier,
    })
    // Drop the drift cache so the next lap starts clean.
    lastLapDriftScoreRef.current = null
    if (earned.length > 0) {
      const meta = {
        unlockedAt: Date.now(),
        slug,
        versionHash,
      }
      const merge = unlockAchievements(achievementsRef.current, earned, meta)
      if (merge.unlocked.length > 0) {
        achievementsRef.current = merge.next
        setAchievements(merge.next)
        writeAchievements(merge.next)
        announceAchievementUnlock(merge.unlocked)
      }
    }

    void submitLap(event)
  }

  // Surface a brief toast for the freshest unlock so the player knows they
  // just earned something without having to open the pane. Multiple unlocks
  // in one lap (e.g. first-lap + first-pb on the very first lap of a fresh
  // browser) collapse to a single combined toast so the lap-saved lane never
  // queues a stack of overlapping notifications.
  function announceAchievementUnlock(ids: readonly AchievementId[]) {
    if (ids.length === 0) return
    const names = ids
      .map((id) => getAchievementDef(id)?.name ?? null)
      .filter((s): s is string => s !== null)
    if (names.length === 0) return
    playAchievementUnlockCue(names.length)
    if (
      shouldGamepadRumbleFire(
        gamepadRumbleModeRef.current,
        padHasRumble(gamepadPadRef.current),
      )
    ) {
      fireGamepadImpulse(
        'achievement',
        gamepadPadRef.current,
        gamepadRumbleIntensityRef.current,
      )
    }
    const label =
      names.length === 1
        ? `Achievement: ${names[0]}`
        : `Achievement x${names.length}: ${names.join(', ')}`
    if (achievementToastTimerRef.current) {
      clearTimeout(achievementToastTimerRef.current)
    }
    setAchievementToast(label)
    achievementToastTimerRef.current = setTimeout(() => {
      setAchievementToast(null)
      achievementToastTimerRef.current = null
    }, 3200)
  }

  async function startRaceServerSide() {
    try {
      const res = await fetch(
        `/api/race/start?slug=${encodeURIComponent(slug)}&v=${versionHash}`,
        { method: 'POST' },
      )
      if (!res.ok) throw new Error('race start failed')
      const body = (await res.json()) as { token: string }
      tokenRef.current = body.token
    } catch {
      tokenRef.current = null
    }
  }

  async function submitLap(event: LapCompleteEvent) {
    if (submittingRef.current) return
    const token = tokenRef.current
    if (!token) return
    submittingRef.current = true
    const replay = pendingReplayForSubmitRef.current
    pendingReplayForSubmitRef.current = null
    // Consume the PB flag latched by handleLapComplete so a slow lap that
    // submits after a fast PB submit cannot accidentally clobber the
    // last-submit pointer with the slower lap's nonce.
    const pbFlag = pendingPbForSubmitRef.current
    pendingPbForSubmitRef.current = null
    try {
      const res = await fetch(
        `/api/race/submit?slug=${encodeURIComponent(slug)}&v=${versionHash}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            token,
            checkpoints: event.hits,
            lapTimeMs: event.lapTimeMs,
            initials,
            tuning: paramsRef.current,
            inputMode: inputModeRef.current,
            ...(replay ? { replay } : {}),
          }),
        },
      )
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        nextToken?: string
        submittedNonce?: string
        submittedRank?: number | null
        boardSize?: number | null
      }
      if (body.ok && body.nextToken) tokenRef.current = body.nextToken
      // Persist the just-submitted nonce when this lap was both a local PB
      // (so the lap is the player's best) and the server actually accepted
      // it (so the nonce points at a real lap:replay:<nonce> entry on the
      // server). The pause-menu Challenge a Friend flow reads this pointer
      // to build a URL pinned to the player's current PB ghost.
      if (
        body.ok &&
        body.submittedNonce &&
        pbFlag !== null &&
        replay !== null
      ) {
        writeLastSubmit(slug, versionHash, {
          nonce: body.submittedNonce,
          lapTimeMs: pbFlag.lapTimeMs,
        })
      }
      // Surface the just-submitted lap's leaderboard placement inside the
      // existing lap-saved toast. The rank + boardSize round-trip is
      // best-effort: when the server omits or zeros them (KV outage, older
      // client) the toast keeps its legacy "lap N saved" / "NEW PB!"
      // phrasing. We only update if the toast is still showing (toastKind
      // not yet cleared by the auto-clear timer) so a slow round-trip never
      // races the timer to revive a cleared lane.
      if (body.ok) {
        const rankInfo = isLapRankInfo(
          body.submittedRank !== undefined && body.boardSize !== undefined
            ? { rank: body.submittedRank, boardSize: body.boardSize }
            : null,
        )
          ? { rank: body.submittedRank as number, boardSize: body.boardSize as number }
          : null
        if (rankInfo) {
          setHud((prev) => {
            const next: typeof prev = { ...prev }
            // Upgrade the toast in place so the existing celebratory phrasing
            // gains the rank suffix; bail when the toast already cleared so a
            // slow round-trip never revives a stale lane.
            if (prev.toast !== null && prev.toastKind !== null) {
              const upgraded = buildToastWithRank(prev.toast, prev.toastKind, rankInfo)
              if (upgraded !== prev.toast) next.toast = upgraded
            }
            // Mirror the placement into HudState so the persistent rank chip
            // refreshes the moment the server response lands. We always reflect
            // the latest known rank so the chip honestly tracks the player's
            // current standing (even if it slipped to a worse rank because
            // someone else posted a faster lap).
            next.leaderboardRank = rankInfo
            return next
          })
          // Persist the BEST observed rank to disk so a fresh page load on
          // this layout shows the chip immediately. Only write when the new
          // rank improves on the prior so a slower lap never demotes the
          // stored "best ever" badge that the player earned previously.
          const sanitized = sanitizeRankInfo(rankInfo)
          if (sanitized) {
            const prior: LeaderboardRankInfo | null = readLocalBestRank(slug, versionHash)
            if (isRankUpgrade(prior, sanitized)) {
              writeLocalBestRank(slug, versionHash, sanitized)
            }
          }
        }
      }
    } catch {
      // Local PB tracking already handled the lap.
    } finally {
      submittingRef.current = false
    }
  }

  // Confirm handler for the pre-race setup modal. Applies the picked params
  // (writes through to lastLoaded + per-track), records the pin choice, and
  // hands control to the standard countdown. The track is marked decided so
  // legacy per-track saves stop being highlighted on subsequent races.
  function handlePreRaceConfirm({ params, pin }: PreRaceSetupResult) {
    applyTuning(params, 'Pre-race pick')
    markTrackDecided(slug)
    if (pin) pinTrack(slug)
    else unpinTrack(slug)
    setPhase('countdown')
  }

  function beginRace() {
    void startRaceServerSide()
    pendingRaceStartRef.current = performance.now()
    crossfadeTo('game', RACE_START_CROSSFADE_SEC)
    setPhase('racing')
    // Count this drop into the racing phase as a session, exactly once per
    // mount. A Restart that re-mounts GameSession resets the latch and is
    // intentionally counted again, since the player has truly re-entered the
    // racing phase. Silent on the lap timeline so a counter bump never blocks
    // anything visible.
    if (!sessionCountedRef.current) {
      sessionCountedRef.current = true
      const next = recordTrackStatsSession(trackStatsRef.current, Date.now())
      trackStatsRef.current = next
      setTrackStats(next)
      writeTrackStats(slug, versionHash, next)
      // Bookmark this slug as visited so the Variety Pack achievement counts
      // toward its threshold on the very next lap completion. Idempotent: a
      // re-visit returns the existing distinct count without changing state.
      distinctSlugCountRef.current = recordSlugVisit(slug)
    }
  }

  return (
    <div style={root}>
      <TitleMusic />
      <RaceCanvas
        pieces={pieces}
        checkpointCount={checkpointCount}
        checkpoints={checkpoints}
        transmissionRef={transmissionRef}
        biome={trackBiome ?? null}
        decorations={trackDecorations}
        paramsRef={paramsRef}
        keys={keys}
        pausedRef={pausedRef}
        resumeShiftRef={resumeShiftRef}
        pendingResetRef={pendingResetRef}
        pendingLapResetRef={pendingLapResetRef}
        pendingRaceStartRef={pendingRaceStartRef}
        onLapComplete={handleLapComplete}
        onHudUpdate={onCanvasHud}
        activeGhostRef={activeGhostRef}
        showGhostRef={showGhostRef}
        activeGhostMetaRef={activeGhostMetaRef}
        ghostSourceRef={ghostSourceRef}
        showGhostNameplateRef={showGhostNameplateRef}
        showGhostGapRef={showGhostGapRef}
        showPaceNotesRef={showPaceNotesRef}
        cameraRigRef={cameraRigRef}
        carPaintRef={carPaintRef}
        racingNumberRef={racingNumberRef}
        headlightsOnRef={headlightsOnRef}
        brakeLightModeRef={brakeLightModeRef}
        engineNoiseRef={engineNoiseRef}
        gamepadRumbleModeRef={gamepadRumbleModeRef}
        gamepadRumbleIntensityRef={gamepadRumbleIntensityRef}
        gamepadPadRef={gamepadPadRef}
        timeOfDayRef={timeOfDayRef}
        weatherRef={weatherRef}
        showSkidMarksRef={showSkidMarksRef}
        showTireSmokeRef={showTireSmokeRef}
        showKerbsRef={showKerbsRef}
        showSceneryRef={showSceneryRef}
        showRacingLineRef={showRacingLineRef}
        rearviewCanvasRef={rearviewCanvasRef}
        showRearviewRef={showRearviewRef}
        carPoseOutRef={minimapCarPoseRef}
        ghostPoseOutRef={minimapGhostPoseRef}
        speedOutRef={speedRef}
        onLapReplay={handleLapReplay}
        onCheckpointHit={handleCheckpointHit}
        onLapDriftBest={handleLapDriftBest}
        onReactionTime={handleReactionTime}
        captureScreenshotRef={captureScreenshotRef}
        style={canvasStyle}
      />
      <canvas
        ref={rearviewCanvasRef}
        aria-hidden
        style={{
          ...rearviewStyle,
          display:
            settings.showRearview && phase === 'racing' && !paused
              ? 'block'
              : 'none',
        }}
        data-testid="rearview-mirror"
      />
      {settings.showMinimap ? (
        <Minimap
          pieces={pieces}
          checkpointCount={checkpointCount}
          checkpoints={checkpoints}
          carPoseRef={minimapCarPoseRef}
          ghostPoseRef={settings.showGhost ? minimapGhostPoseRef : undefined}
          compact={compactHud}
          placement="topRight"
        />
      ) : null}
      {settings.showSpeedometer && phase === 'racing' && !paused ? (
        <Speedometer
          speedRef={speedRef}
          maxSpeedRef={maxSpeedRef}
          unit={settings.speedUnit}
          topSpeedRef={topSpeedRef}
          showTopSpeedMarker={settings.showTopSpeedMarker}
        />
      ) : null}
      {settings.showSpeedLines && phase === 'racing' && !paused ? (
        <SpeedLinesOverlay speedRef={speedRef} maxSpeedRef={maxSpeedRef} />
      ) : null}
      <ConfettiOverlay kind={confettiKind} triggerKey={confettiKey} />
      <HUD
        currentMs={hud.currentMs}
        lastLapMs={hud.lastLapMs}
        bestSessionMs={hud.bestSessionMs}
        bestAllTimeMs={hud.bestAllTimeMs}
        optimalLapMs={hud.optimalLapMs}
        optimalLapComplete={hud.optimalLapComplete}
        overallRecord={hud.overallRecord}
        lapCount={hud.lapCount}
        onTrack={hud.onTrack}
        wrongWay={hud.wrongWay && phase === 'racing' && !paused}
        toast={hud.toast}
        toastKind={hud.toastKind}
        initials={initials}
        splitDeltaMs={hud.splitDelta?.deltaMs ?? null}
        splitCpId={hud.splitDelta?.cpId ?? null}
        prediction={hud.prediction}
        sectorPb={hud.sectorPb}
        driftActive={hud.driftActive && phase === 'racing' && !paused}
        driftScore={hud.driftScore}
        driftMultiplier={hud.driftMultiplier}
        driftLapBest={hud.driftLapBest}
        driftAllTimeBest={hud.driftAllTimeBest}
        showDrift={settings.showDrift}
        pbStreak={hud.pbStreak}
        challenge={
          challenge && phase === 'racing' && !paused
            ? { from: challenge.from, targetMs: challenge.timeMs }
            : null
        }
        rivalLabel={
          rival && phase === 'racing' && !paused
            ? formatRivalBannerLabel(rival)
            : null
        }
        ghostGapMs={
          phase === 'racing' && !paused && settings.showGhost && settings.showGhostGap
            ? hud.ghostGapMs
            : null
        }
        reactionTime={
          phase === 'racing' && !paused && settings.showReactionTime
            ? hud.reactionTime
            : null
        }
        leaderboardRank={
          settings.showLeaderboardRank ? hud.leaderboardRank : null
        }
        paceNote={
          phase === 'racing' && !paused && settings.showPaceNotes
            ? hud.paceNote
            : null
        }
        topSpeedPb={
          phase === 'racing' && !paused ? hud.topSpeedPb : null
        }
        speedUnit={settings.speedUnit}
        carMaxSpeed={tuning.maxSpeed}
        lapConsistency={computeLapConsistency(lapHistory)}
        gear={hud.gear}
        transmission={settings.transmission}
        compact={compactHud}
      />
      {achievementToast ? (
        <div style={achievementToastStyle} role="status" aria-live="polite">
          <span style={achievementToastGlyphStyle}>★</span>
          {achievementToast}
        </div>
      ) : null}
      {phase === 'preRace' ? (
        <PreRaceSetup slug={slug} onConfirm={handlePreRaceConfirm} />
      ) : null}
      {phase === 'countdown' ? <Countdown onDone={beginRace} /> : null}
      <TouchControls
        keys={keys}
        enabled={phase === 'racing' && !paused}
        mode={settings.touchMode}
        showShifter={settings.transmission === 'manual'}
      />
      {phase === 'racing' && !paused ? (
        <>
          <style>{PAUSE_BUTTON_CSS}</style>
          <button
            onClick={pause}
            aria-label="Pause"
            className="viberacer-pause-btn"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <rect x="6" y="5" width="4" height="14" rx="1" />
              <rect x="14" y="5" width="4" height="14" rx="1" />
            </svg>
          </button>
        </>
      ) : null}
      {paused ? (
        <>
          {pauseView === 'menu' ? (
            <PauseMenu
              onResume={resume}
              onRestart={restart}
              onRestartLap={() => {
                // Resume first so the rAF loop processes the pulse next
                // frame (`restartLap` itself bails when paused). Then arm
                // the lap-reset state.
                resume()
                armLapReset()
              }}
              onEditTrack={editTrack}
              onRace={() => setPauseView('race')}
              onSettings={() => setPauseView('settings')}
              onTuningLab={openTuningLabFromPause}
              trackMoodLabel={trackMoodLabel}
              pieces={pieces}
              onExit={handleExitClick}
            />
          ) : pauseView === 'race' ? (
            <RacePane
              onBack={() => setPauseView('menu')}
              onLeaderboards={() => setPauseView('leaderboard')}
              onLapHistory={() => setPauseView('lapHistory')}
              lapCount={lapHistory.length}
              onPbHistory={() => setPauseView('pbHistory')}
              pbHistoryCount={pbHistoryEntries.length}
              onStats={() => setPauseView('stats')}
              onAchievements={() => setPauseView('achievements')}
              achievementCount={achievementProgressCount(achievements)}
              achievementTotal={achievementTotalCount}
              onHowToPlay={() => setPauseView('howToPlay')}
              onPhotoMode={() => setPauseView('photo')}
              onShare={() => {
                void handleShare()
              }}
              shareLabel={shareLabel ?? undefined}
              onChallenge={() => {
                void handleChallenge()
              }}
              challengeAvailable={lastSubmit !== null}
              challengeLabel={challengeLabel ?? undefined}
              onToggleFavorite={handleToggleFavorite}
              isFavorite={favorited}
            />
          ) : pauseView === 'leaderboard' ? (
            <Leaderboard
              slug={slug}
              versionHash={versionHash}
              onBack={() => setPauseView('race')}
              onApplyTuning={(p) => {
                applyTuning(p, 'Rival lap')
                setPauseView('menu')
              }}
              onChaseRival={handleChaseRival}
              activeRivalNonce={rival?.nonce ?? null}
              onCancelChase={handleCancelChase}
            />
          ) : pauseView === 'lapHistory' ? (
            <LapHistory
              entries={lapHistory}
              bestAllTimeMs={hud.bestAllTimeMs}
              bestSectors={bestSectorsRef.current ?? []}
              onBack={() => setPauseView('race')}
            />
          ) : pauseView === 'pbHistory' ? (
            <PbHistory
              entries={pbHistoryEntries}
              onBack={() => setPauseView('race')}
            />
          ) : pauseView === 'stats' ? (
            <TrackStatsPane
              stats={trackStats}
              slug={slug}
              bestAllTimeMs={hud.bestAllTimeMs}
              pbStreakBestEver={hud.pbStreakBest}
              pbStreakLive={hud.pbStreak}
              bestReactionMs={hud.pbReactionMs}
              lifetimeBestReactionMs={readLifetimeBestReaction()}
              bestTopSpeedUs={hud.pbTopSpeedUs}
              lifetimeBestTopSpeedUs={readLifetimeBestTopSpeed()}
              speedUnit={settings.speedUnit}
              carMaxSpeed={tuning.maxSpeed}
              onBack={() => setPauseView('race')}
            />
          ) : pauseView === 'achievements' ? (
            <AchievementsPane
              achievements={achievements}
              progress={buildAchievementProgressForPane({
                achievements,
                trackStats,
                expectedSectorCount,
                bestSectors: bestSectorsRef.current,
                distinctSlugCount: distinctSlugCountRef.current,
                wrongWayTriggered: wrongWayTriggeredRef.current,
                hudPbStreakBest: hud.pbStreakBest,
              })}
              onBack={() => setPauseView('race')}
            />
          ) : pauseView === 'tuning' ? (
            <TuningPanel
              params={tuning}
              onChange={setTuning}
              onReset={resetTuning}
              onClose={() => {
                // Flush any pending slider drag so the most-recent tweak
                // lands as a history entry before the panel disappears.
                flushTuningHistory()
                setPauseView('menu')
              }}
              history={tuningHistory}
              liveSlug={slug}
              onApplyHistoryEntry={handleApplyHistoryEntry}
            />
          ) : pauseView === 'howToPlay' ? (
            <HowToPlay
              keyBindings={settings.keyBindings}
              gamepadBindings={settings.gamepadBindings}
              touchMode={settings.touchMode}
              onClose={() => setPauseView('race')}
            />
          ) : pauseView === 'photo' ? (
            <PhotoMode
              slug={slug}
              captureRef={captureScreenshotRef}
              onClose={() => setPauseView('race')}
            />
          ) : pauseView === 'sessionSummary' ? (
            <SessionSummary
              stats={summarizeSession({
                history: lapHistory,
                priorAllTimeMs: sessionPriorPbRef.current,
                priorAllTimeSectors: sessionPriorSectorsRef.current,
                driftBest: hud.driftLapBest,
                sessionDurationMs: Date.now() - sessionStartedAtRef.current,
              })}
              slug={slug}
              onBack={() => setPauseView('menu')}
              onRaceAgain={() => {
                setPauseView('menu')
                restart()
              }}
              onExit={exitToTitle}
              onShare={() => {
                void handleShare()
              }}
              shareLabel={shareLabel ?? undefined}
            />
          ) : (
            <SettingsPane
              settings={settings}
              onChange={setSettings}
              onClose={() => setPauseView('menu')}
              onReset={resetSettings}
              inRace
              slug={slug}
              onSetup={() => setPauseView('tuning')}
            />
          )}
          {pauseView !== 'photo' ? <FeedbackFab /> : null}
        </>
      ) : null}
    </div>
  )
}

const root: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: '#9ad8ff',
  overflow: 'hidden',
  touchAction: 'none',
  userSelect: 'none',
  WebkitUserSelect: 'none',
  WebkitTouchCallout: 'none',
}
// Achievement toast lane. Sits below the HUD's top row so a "lap saved" toast
// and an "Achievement unlocked" toast read as two independent messages rather
// than fighting for the same slot. Auto-dismisses after ~3.2s.
const achievementToastStyle: React.CSSProperties = {
  position: 'fixed',
  top: 88,
  left: '50%',
  transform: 'translateX(-50%)',
  background: 'rgba(20, 20, 20, 0.92)',
  color: '#f4d774',
  border: '1px solid #f4d774',
  borderRadius: 999,
  padding: '8px 16px',
  fontFamily: 'system-ui, sans-serif',
  fontSize: 13,
  fontWeight: 700,
  letterSpacing: 1,
  boxShadow: '0 6px 18px rgba(0, 0, 0, 0.45)',
  zIndex: 30,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  pointerEvents: 'none',
}
const achievementToastGlyphStyle: React.CSSProperties = {
  fontSize: 16,
  lineHeight: 1,
}
// Cached total achievement count so the pause-menu badge does not allocate a
// new computation per render.
const achievementTotalCount = ACHIEVEMENTS.length
// Cheap derivation reused by both the pause-menu badge and (potentially) other
// surfaces. The pure helper does the work; this thin wrapper keeps callers from
// destructuring three fields when they only want the unlocked tally.
function achievementProgressCount(map: AchievementMap): number {
  return achievementProgress(map).unlockedCount
}

// Build the per-achievement progress map for the AchievementsPane. Composes
// lifetime bests scanned from localStorage with the live in-session HUD state
// and per-track snapshots so each locked row can show "your best is X / target
// Y" without the pane reaching into storage itself. Called once per render of
// the achievements pause view so a quick lap that bumps the player's best
// reads as fresh on the next pause.
function buildAchievementProgressForPane(args: {
  achievements: AchievementMap
  trackStats: TrackStats
  expectedSectorCount: number
  bestSectors: SectorDuration[] | null
  distinctSlugCount: number
  wrongWayTriggered: boolean
  // The HUD's live PB-streak high-water mark for the current (slug, version).
  // Falls back to the lifetime aggregate when null so a fresh page load with a
  // streak set on a different version still shows progress.
  hudPbStreakBest: number | null
}): AchievementProgressMap {
  const lifetime = readLifetimeBests()
  const bestPbStreak =
    args.hudPbStreakBest !== null && args.hudPbStreakBest > 0
      ? Math.max(args.hudPbStreakBest, lifetime.bestPbStreak ?? 0)
      : lifetime.bestPbStreak
  return buildAchievementProgress(
    {
      lifetimeFastestLapMs: lifetime.fastestLapMs,
      lifetimeBestDriftScore: lifetime.bestDriftScore,
      lifetimeBestPbStreak: bestPbStreak,
      trackLapCount: args.trackStats.lapCount,
      trackDriveMs: args.trackStats.totalDriveMs,
      optimalComplete: hasCompleteOptimalLap(
        args.bestSectors,
        args.expectedSectorCount,
      ),
      distinctSlugCount: args.distinctSlugCount,
      // Binary milestones derive their "earned" state from the unlock map: once
      // unlocked we know the player has done the thing on this device.
      platinumEarnedAnywhere: !!args.achievements['platinum-medal'],
      wrongWayTriggered:
        args.wrongWayTriggered || !!args.achievements['wrong-way'],
    },
    args.achievements,
  )
}
const canvasStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  height: '100%',
}
// Rear-view mirror inset. Sits at the top-center, scaled with viewport width
// so the strip reads on phones without overwhelming the HUD on a desktop.
// 4:1 aspect ratio matches a stretched panoramic mirror you would see in a
// real car. Fixed positioning keeps the mirror in its own viewport band.
const rearviewStyle: React.CSSProperties = {
  position: 'fixed',
  top: 8,
  left: '50%',
  transform: 'translateX(-50%)',
  width: 'min(280px, 38vw)',
  height: 'min(70px, 9.5vw)',
  borderRadius: 10,
  border: '2px solid rgba(0,0,0,0.55)',
  boxShadow: '0 4px 14px rgba(0,0,0,0.45)',
  background: '#000',
  pointerEvents: 'none',
  zIndex: 12,
}
const loading: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  display: 'grid',
  placeItems: 'center',
  color: 'white',
  fontFamily: 'system-ui, sans-serif',
}
// Pause button. Always visible during the racing phase (per Section 9 of the
// GDD). Sizing is responsive to pointer kind: a fine pointer (mouse) gets a
// compact 48x48 hit target, while a coarse pointer (touch) gets a larger 64x64
// target with extra inset so a one-thumb reach lands cleanly without fighting
// the iOS home indicator or the Android nav bar (env safe-area-inset-bottom).
const PAUSE_BUTTON_CSS = `
.viberacer-pause-btn {
  position: fixed;
  left: 16px;
  bottom: calc(20px + env(safe-area-inset-bottom, 0px));
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.25);
  background: rgba(0, 0, 0, 0.55);
  color: white;
  cursor: pointer;
  display: grid;
  place-items: center;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
  z-index: 20;
  padding: 0;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}
.viberacer-pause-btn:focus-visible {
  outline: 2px solid #5fe08a;
  outline-offset: 2px;
}
.viberacer-pause-btn svg {
  width: 22px;
  height: 22px;
}
@media (any-pointer: coarse) {
  .viberacer-pause-btn {
    left: 20px;
    bottom: calc(28px + env(safe-area-inset-bottom, 0px));
    width: 64px;
    height: 64px;
    border-width: 2px;
    background: rgba(0, 0, 0, 0.6);
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.45);
  }
  .viberacer-pause-btn svg {
    width: 30px;
    height: 30px;
  }
}
`
