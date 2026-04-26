import { z } from 'zod'

// Sample period and bounds for ghost-car replays. Recording is fixed-rate so
// playback is a constant-time array lookup plus a lerp; variable per-frame
// dtMs would force timestamp-based search at every frame.
export const REPLAY_SAMPLE_MS = 33
export const MAX_REPLAY_SAMPLES = 5400

const SampleSchema = z
  .tuple([z.number().finite(), z.number().finite(), z.number().finite()])

export const ReplaySchema = z.object({
  lapTimeMs: z.number().int().positive(),
  samples: z.array(SampleSchema).min(1).max(MAX_REPLAY_SAMPLES),
})
export type Replay = z.infer<typeof ReplaySchema>

export interface GhostPose {
  x: number
  z: number
  heading: number
}

// Wraps `delta` into the range (-PI, PI] so heading lerp takes the short way
// around the unit circle and never spins backwards across +/-PI.
function shortestArcDelta(from: number, to: number): number {
  let d = to - from
  while (d > Math.PI) d -= 2 * Math.PI
  while (d <= -Math.PI) d += 2 * Math.PI
  return d
}

export function shortestArcLerp(a: number, b: number, k: number): number {
  return a + shortestArcDelta(a, b) * k
}

// Look up the ghost's pose at `tMs` into the replay. Clamps before the first
// sample to t=0 and after the last sample to the final pose, which leaves the
// ghost frozen at the finish line if it crosses before the player.
export function interpolateGhostPose(
  replay: Replay,
  tMs: number,
): GhostPose | null {
  const samples = replay.samples
  if (samples.length === 0) return null
  if (tMs <= 0) {
    const [x, z, h] = samples[0]
    return { x, z, heading: h }
  }
  const lastIdx = samples.length - 1
  const maxT = lastIdx * REPLAY_SAMPLE_MS
  if (tMs >= maxT) {
    const [x, z, h] = samples[lastIdx]
    return { x, z, heading: h }
  }
  const slot = tMs / REPLAY_SAMPLE_MS
  const i = Math.floor(slot)
  const k = slot - i
  const [ax, az, ah] = samples[i]
  const [bx, bz, bh] = samples[i + 1]
  return {
    x: ax + (bx - ax) * k,
    z: az + (bz - az) * k,
    heading: shortestArcLerp(ah, bh, k),
  }
}
