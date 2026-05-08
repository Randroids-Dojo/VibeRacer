import type { LeaderboardEntry } from './leaderboard'

// Ghost rotation for drag mode. The chosen ghost depends on the player's PB
// on this strip relative to the leaderboard:
//
//   - Empty board: no ghost.
//   - No PB on this strip and the board has entries: ghost is the top entry.
//   - Player has a PB but is not at rank 1: ghost is the entry whose lap time
//     is the closest to the player's PB while still strictly faster than it.
//   - Player has a PB and IS at rank 1 (the top entry is theirs): ghost is
//     their own PB.
//
// "Me" is identified by `LeaderboardEntry.isMe`, which the server populates
// from the request's racerId cookie. Initials are NOT used: they collide.

export type DragGhostSource = 'top' | 'nextFaster' | 'ownPb' | 'none'

export interface DragGhostSelection {
  nonce: string | null
  source: DragGhostSource
}

export function selectDragGhost(
  leaderboard: readonly LeaderboardEntry[],
  playerPbMs: number | null,
): DragGhostSelection {
  const usable = leaderboard.filter((e) => e.nonce !== null)
  if (usable.length === 0) {
    return { nonce: null, source: 'none' }
  }

  const sorted = [...usable].sort((a, b) => a.lapTimeMs - b.lapTimeMs)

  if (playerPbMs === null) {
    return { nonce: sorted[0].nonce, source: 'top' }
  }

  const top = sorted[0]
  if (top.isMe && top.lapTimeMs === playerPbMs) {
    return { nonce: top.nonce, source: 'ownPb' }
  }

  // Walk from the fastest down. Pick the last entry strictly faster than the
  // player's PB; that is the row immediately above the player on the board.
  let candidate: LeaderboardEntry | null = null
  for (const entry of sorted) {
    if (entry.lapTimeMs < playerPbMs) {
      candidate = entry
    } else {
      break
    }
  }

  if (candidate) {
    return { nonce: candidate.nonce, source: 'nextFaster' }
  }

  // No row was strictly faster: the player is tied with or ahead of every
  // entry on the board. Treat this as "I'm at rank 1 on my own PB"; rotate
  // back to the top entry which is either the player or someone tied.
  return { nonce: top.nonce, source: top.isMe ? 'ownPb' : 'top' }
}
