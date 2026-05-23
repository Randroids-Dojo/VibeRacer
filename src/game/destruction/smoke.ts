import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  NormalBlending,
  type Object3D,
  Sprite,
  SpriteMaterial,
} from 'three'

// Sprite-billboard emitter for smoke and fire. Both emitter kinds share
// the same particle pool; the emitter kind determines the texture,
// color tint, blending, lifetime, and rise speed. Particles are
// parented to the world scene (not the car) so a moving car leaves a
// trail of smoke instead of dragging the plume along.
//
// Cap: a small pool (40 active total across smoke + fire) keeps the
// alpha-blended overdraw bounded. New emissions over the cap recycle
// the oldest particle.

const PARTICLE_CAP = 40
const SMOKE_TEXTURE_SIZE = 96
const FIRE_TEXTURE_SIZE = 96

export type EmitterKind = 'smoke' | 'fire'

interface Particle {
  sprite: Sprite
  ageSec: number
  lifetimeSec: number
  // World-space velocity (mainly +y, plus small horizontal drift).
  vx: number
  vy: number
  vz: number
  // Initial size and growth rate so the puff expands as it rises.
  initSize: number
  growth: number
  kind: EmitterKind
}

export interface Emitter {
  // Set the spawn rate as a 0..1 intensity. The emitter scales its
  // internal rate by this value; 0 disables spawning, 1 emits up to
  // the per-kind max.
  setIntensity01(kind: EmitterKind, value: number): void
  // Advance the emitter by dtSec seconds. `spawnPos` is the world
  // position where new particles emerge (typically the car's engine
  // bay). Pure side effects on the parent scene.
  tick(dtSec: number, spawnPos: { x: number; y: number; z: number }): void
  // Drop every particle. Called on Repair so a freshly fixed car has a
  // clean slate.
  reset(): void
  dispose(): void
  readonly aliveCount: number
}

// Per-kind tuning. The numbers below are chosen so smoke reads as a
// slow drifting plume while fire is a tighter, brighter, shorter
// shower of orange. Both keep the particle pool small enough that the
// alpha-blended cost stays cheap.
const SMOKE_MAX_PER_SEC = 22
const FIRE_MAX_PER_SEC = 28
const SMOKE_LIFETIME = 2.2
const FIRE_LIFETIME = 0.9

export function createEmitter(scene: Object3D, rng: () => number): Emitter {
  const smokeTexture = makeSmokeTexture()
  const fireTexture = makeFireTexture()

  const smokeMaterial = new SpriteMaterial({
    map: smokeTexture,
    transparent: true,
    depthWrite: false,
    color: new Color(0xbbbbbb),
    blending: NormalBlending,
  })
  const fireMaterial = new SpriteMaterial({
    map: fireTexture,
    transparent: true,
    depthWrite: false,
    color: new Color(0xff7733),
    blending: AdditiveBlending,
  })

  const particles: Particle[] = []
  const intensity: Record<EmitterKind, number> = { smoke: 0, fire: 0 }
  // Accumulators so spawn rates can be fractional per frame without
  // dropping particles to integer truncation.
  const spawnAccum: Record<EmitterKind, number> = { smoke: 0, fire: 0 }

  function setIntensity01(kind: EmitterKind, value: number): void {
    if (!Number.isFinite(value)) {
      intensity[kind] = 0
      return
    }
    if (value <= 0) intensity[kind] = 0
    else if (value >= 1) intensity[kind] = 1
    else intensity[kind] = value
  }

  function spawnOne(kind: EmitterKind, spawnPos: { x: number; y: number; z: number }): void {
    const material = kind === 'smoke' ? smokeMaterial : fireMaterial
    const sprite = new Sprite(material.clone())
    sprite.name = `destruction.${kind}.particle`
    // Mild horizontal jitter so the plume reads as a column, not a
    // single point source.
    const jx = (rng() - 0.5) * 0.6
    const jz = (rng() - 0.5) * 0.6
    sprite.position.set(spawnPos.x + jx, spawnPos.y, spawnPos.z + jz)
    const init = kind === 'smoke' ? 0.6 + rng() * 0.4 : 0.4 + rng() * 0.3
    sprite.scale.set(init, init, init)
    scene.add(sprite)
    particles.push({
      sprite,
      ageSec: 0,
      lifetimeSec: kind === 'smoke' ? SMOKE_LIFETIME : FIRE_LIFETIME,
      vx: (rng() - 0.5) * 0.6,
      vy: kind === 'smoke' ? 1.4 + rng() * 0.8 : 2.4 + rng() * 1.2,
      vz: (rng() - 0.5) * 0.6,
      initSize: init,
      growth: kind === 'smoke' ? 0.8 : 0.4,
      kind,
    })
    if (particles.length > PARTICLE_CAP) {
      const dead = particles.shift()
      if (dead) {
        scene.remove(dead.sprite)
        ;(dead.sprite.material as SpriteMaterial).dispose()
      }
    }
  }

  function tick(dtSec: number, spawnPos: { x: number; y: number; z: number }): void {
    for (const kind of ['smoke', 'fire'] as EmitterKind[]) {
      const ratePerSec =
        kind === 'smoke' ? SMOKE_MAX_PER_SEC : FIRE_MAX_PER_SEC
      spawnAccum[kind] += intensity[kind] * ratePerSec * dtSec
      while (spawnAccum[kind] >= 1) {
        spawnOne(kind, spawnPos)
        spawnAccum[kind] -= 1
      }
    }
    // Age every particle and recycle when its lifetime expires.
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i]
      p.ageSec += dtSec
      if (p.ageSec >= p.lifetimeSec) {
        scene.remove(p.sprite)
        ;(p.sprite.material as SpriteMaterial).dispose()
        // Mark for compaction at the end of the loop.
        ;(p as Particle & { _dead?: boolean })._dead = true
        continue
      }
      p.sprite.position.x += p.vx * dtSec
      p.sprite.position.y += p.vy * dtSec
      p.sprite.position.z += p.vz * dtSec
      const t = p.ageSec / p.lifetimeSec
      const size = p.initSize + p.growth * t
      p.sprite.scale.set(size, size, size)
      const material = p.sprite.material as SpriteMaterial
      // Fade in fast, then fade out. The shape mimics the typical
      // smoke puff lifecycle: rapid bloom, slow dissipation.
      const alpha = t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85
      material.opacity = Math.max(0, Math.min(1, alpha))
    }
    // Compact the array in-place to avoid per-frame allocation.
    let write = 0
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i] as Particle & { _dead?: boolean }
      if (!p._dead) particles[write++] = particles[i]
    }
    particles.length = write
  }

  function reset(): void {
    for (const p of particles) {
      scene.remove(p.sprite)
      ;(p.sprite.material as SpriteMaterial).dispose()
    }
    particles.length = 0
    spawnAccum.smoke = 0
    spawnAccum.fire = 0
  }

  function dispose(): void {
    reset()
    smokeMaterial.dispose()
    fireMaterial.dispose()
    smokeTexture.dispose()
    fireTexture.dispose()
  }

  return {
    setIntensity01,
    tick,
    reset,
    dispose,
    get aliveCount() {
      return particles.length
    },
  }
}

function makeSmokeTexture(): CanvasTexture {
  if (typeof document === 'undefined') {
    return new CanvasTexture(null as unknown as HTMLCanvasElement)
  }
  const canvas = document.createElement('canvas')
  canvas.width = SMOKE_TEXTURE_SIZE
  canvas.height = SMOKE_TEXTURE_SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('smoke: 2D canvas context unavailable')
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  const cx = canvas.width / 2
  const cy = canvas.height / 2
  const r = Math.min(cx, cy)
  const grad = ctx.createRadialGradient(cx, cy, r * 0.05, cx, cy, r)
  grad.addColorStop(0, 'rgba(180, 180, 180, 0.85)')
  grad.addColorStop(0.4, 'rgba(120, 120, 120, 0.6)')
  grad.addColorStop(1, 'rgba(80, 80, 80, 0)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  const tex = new CanvasTexture(canvas)
  tex.needsUpdate = true
  return tex
}

function makeFireTexture(): CanvasTexture {
  if (typeof document === 'undefined') {
    return new CanvasTexture(null as unknown as HTMLCanvasElement)
  }
  const canvas = document.createElement('canvas')
  canvas.width = FIRE_TEXTURE_SIZE
  canvas.height = FIRE_TEXTURE_SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('fire: 2D canvas context unavailable')
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  const cx = canvas.width / 2
  const cy = canvas.height / 2
  const r = Math.min(cx, cy)
  const grad = ctx.createRadialGradient(cx, cy, r * 0.05, cx, cy, r)
  grad.addColorStop(0, 'rgba(255, 240, 200, 1.0)')
  grad.addColorStop(0.3, 'rgba(255, 140, 40, 0.85)')
  grad.addColorStop(0.7, 'rgba(180, 60, 20, 0.4)')
  grad.addColorStop(1, 'rgba(120, 40, 20, 0)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  const tex = new CanvasTexture(canvas)
  tex.needsUpdate = true
  return tex
}
