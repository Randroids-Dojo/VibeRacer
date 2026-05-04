import { describe, expect, it } from 'vitest'
import type { Piece } from '@/lib/schemas'
import { connectorPortsOf } from '@/game/track'
import { CELL_SIZE } from '@/game/trackPath'
import {
  DEFAULT_FRAME_EPSILON_POS,
  DEFAULT_FRAME_EPSILON_THETA,
  FRAME_CELL_SIZE,
  framesConnect,
  frameOfPort,
  tangentsAreAntiparallel,
} from '@/game/pieceFrames'

describe('pieceFrames constants', () => {
  it('keeps FRAME_CELL_SIZE in sync with the path module', () => {
    // pieceFrames duplicates CELL_SIZE locally to avoid an import cycle
    // with track.ts. If trackPath ever changes the constant, the duplicate
    // must move with it. This test pins them together.
    expect(FRAME_CELL_SIZE).toBe(CELL_SIZE)
  })
})

describe('frameOfPort', () => {
  it('places a south-facing entry on the south edge midpoint of the cell', () => {
    const piece: Piece = {
      type: 'straight',
      row: 2,
      col: 3,
      rotation: 0,
    }
    const [entry] = connectorPortsOf(piece)
    const frame = frameOfPort(piece, entry)
    // Cell (2, 3) center is at (3 * CELL_SIZE, 2 * CELL_SIZE) = (60, 40).
    // South edge midpoint is at z = 40 + CELL_SIZE/2 = 50, x = 60.
    expect(frame.x).toBeCloseTo(3 * CELL_SIZE, 6)
    expect(frame.z).toBeCloseTo(2 * CELL_SIZE + CELL_SIZE / 2, 6)
    // Outward tangent at south = -PI/2 (facing south, +Z direction).
    expect(frame.theta).toBeCloseTo(-Math.PI / 2, 6)
  })

  it('places a north-facing exit on the north edge midpoint of the cell', () => {
    const piece: Piece = {
      type: 'straight',
      row: 2,
      col: 3,
      rotation: 0,
    }
    const [, exit] = connectorPortsOf(piece)
    const frame = frameOfPort(piece, exit)
    expect(frame.x).toBeCloseTo(3 * CELL_SIZE, 6)
    expect(frame.z).toBeCloseTo(2 * CELL_SIZE - CELL_SIZE / 2, 6)
    // Outward tangent at north = +PI/2.
    expect(frame.theta).toBeCloseTo(Math.PI / 2, 6)
  })

  it('honors the port cell offset for multi-cell pieces', () => {
    // hairpin at rotation 0 has ports at (-1, 0) and (1, 0) of the anchor.
    const piece: Piece = {
      type: 'hairpin',
      row: 5,
      col: 5,
      rotation: 0,
    }
    const ports = connectorPortsOf(piece)
    const top = frameOfPort(piece, ports[0])
    const bottom = frameOfPort(piece, ports[1])
    // Top port lives at row 4, west edge midpoint: x = col*CELL_SIZE - HALF.
    expect(top.x).toBeCloseTo(5 * CELL_SIZE - CELL_SIZE / 2, 6)
    expect(top.z).toBeCloseTo(4 * CELL_SIZE, 6)
    // Bottom port lives at row 6, west edge midpoint.
    expect(bottom.x).toBeCloseTo(5 * CELL_SIZE - CELL_SIZE / 2, 6)
    expect(bottom.z).toBeCloseTo(6 * CELL_SIZE, 6)
  })
})

describe('framesConnect', () => {
  it('connects exact-opposite frames at the same position', () => {
    expect(
      framesConnect(
        { x: 10, z: 0, theta: 0 },
        { x: 10, z: 0, theta: Math.PI },
      ),
    ).toBe(true)
  })

  it('rejects frames separated by more than the position epsilon', () => {
    const farther = DEFAULT_FRAME_EPSILON_POS * 2
    expect(
      framesConnect(
        { x: 10, z: 0, theta: 0 },
        { x: 10 + farther, z: 0, theta: Math.PI },
      ),
    ).toBe(false)
  })

  it('accepts frames within the position epsilon', () => {
    const closer = DEFAULT_FRAME_EPSILON_POS * 0.5
    expect(
      framesConnect(
        { x: 10, z: 0, theta: 0 },
        { x: 10 + closer, z: 0, theta: Math.PI },
      ),
    ).toBe(true)
  })

  it('rejects frames whose tangents are not antiparallel', () => {
    expect(
      framesConnect(
        { x: 0, z: 0, theta: 0 },
        { x: 0, z: 0, theta: 0 },
      ),
    ).toBe(false)
    expect(
      framesConnect(
        { x: 0, z: 0, theta: Math.PI / 2 },
        { x: 0, z: 0, theta: Math.PI / 2 },
      ),
    ).toBe(false)
  })

  it('handles antiparallel angles that wrap across the +PI boundary', () => {
    // A tangent of 3*PI/4 should connect to one of -PI/4 (their difference is PI).
    expect(
      framesConnect(
        { x: 0, z: 0, theta: (3 * Math.PI) / 4 },
        { x: 0, z: 0, theta: -Math.PI / 4 },
      ),
    ).toBe(true)
  })

  it('respects custom epsilons', () => {
    const tightPos = 0.001
    const tightTheta = 0.001
    expect(
      framesConnect(
        { x: 0, z: 0, theta: 0 },
        { x: 0.5, z: 0, theta: Math.PI },
        { epsilonPos: tightPos },
      ),
    ).toBe(false)
    expect(
      framesConnect(
        { x: 0, z: 0, theta: 0 },
        { x: 0, z: 0, theta: Math.PI + 0.05 },
        { epsilonTheta: tightTheta },
      ),
    ).toBe(false)
  })
})

describe('tangentsAreAntiparallel', () => {
  it('returns true for an exact PI gap', () => {
    expect(tangentsAreAntiparallel(0, Math.PI, DEFAULT_FRAME_EPSILON_THETA)).toBe(true)
  })

  it('returns true within the angular epsilon', () => {
    const half = DEFAULT_FRAME_EPSILON_THETA * 0.5
    expect(tangentsAreAntiparallel(0, Math.PI + half, DEFAULT_FRAME_EPSILON_THETA))
      .toBe(true)
  })

  it('returns false outside the angular epsilon', () => {
    const overshoot = DEFAULT_FRAME_EPSILON_THETA * 2
    expect(tangentsAreAntiparallel(0, Math.PI + overshoot, DEFAULT_FRAME_EPSILON_THETA))
      .toBe(false)
  })

  it('handles wrap-around', () => {
    expect(
      tangentsAreAntiparallel(Math.PI, -Math.PI, DEFAULT_FRAME_EPSILON_THETA),
    ).toBe(false)
    expect(
      tangentsAreAntiparallel(Math.PI / 2, -Math.PI / 2, DEFAULT_FRAME_EPSILON_THETA),
    ).toBe(true)
  })

  it('returns true when antiparallel sits across the +PI / -PI seam', () => {
    // a = 179 degrees, b = -1 degree: difference is 180, antiparallel.
    const a = (179 * Math.PI) / 180
    const b = (-1 * Math.PI) / 180
    expect(tangentsAreAntiparallel(a, b, DEFAULT_FRAME_EPSILON_THETA)).toBe(true)
    // Mirror: a = -179 degrees, b = 1 degree.
    expect(
      tangentsAreAntiparallel(-a, -b, DEFAULT_FRAME_EPSILON_THETA),
    ).toBe(true)
  })

  it('returns false for two near-parallel tangents on opposite sides of the +PI seam', () => {
    // a = 179 degrees, b = -179 degrees: only 2 degrees apart in reality.
    // A naive subtraction reads 358 degrees; the wrap brings it back to -2.
    // |((a - b) - PI) mod 2*PI| then sits near PI, well outside the 2-degree
    // antiparallel epsilon, so the matcher must reject.
    const a = (179 * Math.PI) / 180
    const b = (-179 * Math.PI) / 180
    expect(tangentsAreAntiparallel(a, b, DEFAULT_FRAME_EPSILON_THETA)).toBe(false)
  })

  it('rejects exactly parallel tangents', () => {
    // a == b: delta = -PI after subtracting PI. The wrap leaves it at -PI
    // (strict < -PI guard), so |delta| = PI which is well outside epsilon.
    expect(
      tangentsAreAntiparallel(0.7, 0.7, DEFAULT_FRAME_EPSILON_THETA),
    ).toBe(false)
  })
})

describe('cell-aligned legacy pieces still match exactly', () => {
  // Regression: every existing piece is on integer grid cells, so its
  // frame-based connector matches must hit zero distance and zero angular
  // error. This guards against subtle drift when future pieces add
  // floating-point geometry.
  it('matching ports between two adjacent straights yield exact frames', () => {
    const a: Piece = { type: 'straight', row: 0, col: 0, rotation: 0 }
    const b: Piece = { type: 'straight', row: -1, col: 0, rotation: 0 }
    const aPorts = connectorPortsOf(a)
    const bPorts = connectorPortsOf(b)
    // Find the frames that should match: a's exit (north) and b's entry (south).
    let foundExact = false
    for (const ap of aPorts) {
      const af = frameOfPort(a, ap)
      for (const bp of bPorts) {
        const bf = frameOfPort(b, bp)
        if (framesConnect(af, bf)) {
          foundExact = true
          // Cell-aligned pieces hit zero distance.
          expect(Math.hypot(af.x - bf.x, af.z - bf.z)).toBeLessThan(1e-9)
        }
      }
    }
    expect(foundExact).toBe(true)
  })
})
