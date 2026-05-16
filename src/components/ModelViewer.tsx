'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { Group, type Object3D } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import {
  loadDerbyVehicleAsset,
  meshesOf,
} from '@/game/derbyVehicleLoader'
import { createDamageVisualizer } from '@/game/derbyDamageVisuals'
import { DERBY_VEHICLES } from '@/lib/derbyVehicles'
import type { DerbyVehicleType } from '@/lib/schemas'
import type { DerbyCarState } from '@/game/derbyVehicleState'
import { ModelTile } from './ModelTile'
import { SharedModelStage } from './SharedModelStage'

// One entry per viewable car. `derbyType=null` means use the shared main
// race / drag car GLB rather than a derby asset; the visualizer is
// derby-only so those entries skip the destruction pass.
interface CatalogEntry {
  id: string
  label: string
  derbyType: DerbyVehicleType | null
  paintColor: number
}

const CATALOG: CatalogEntry[] = [
  {
    id: 'race',
    label: 'Main Race + Drag',
    derbyType: null,
    paintColor: 0xfff7b0,
  },
  { id: 'car', label: 'Derby: Sedan', derbyType: 'car', paintColor: 0xff5544 },
  {
    id: 'schoolBus',
    label: 'Derby: Ambulance',
    derbyType: 'schoolBus',
    paintColor: 0xffffff,
  },
  {
    id: 'bigTruck',
    label: 'Derby: Pickup Truck',
    derbyType: 'bigTruck',
    paintColor: 0x4488ff,
  },
  {
    id: 'racecar',
    label: 'Derby: Race Car',
    derbyType: 'racecar',
    paintColor: 0xff8822,
  },
]

// Standard contract submesh order used by derby cars; tiles below the
// hero row appear in this order so a side-by-side comparison of two
// variants always lines up.
const PART_ORDER = [
  'body',
  'hood',
  'trunk',
  'door_l',
  'door_r',
  'headlight_l',
  'headlight_r',
  'taillight_l',
  'taillight_r',
  'wheel_fl',
  'wheel_fr',
  'wheel_rl',
  'wheel_rr',
] as const

interface LoadedEntry {
  pristine: Group
  destroyed: Group | null
  parts: { name: string; node: Object3D }[]
  dispose: () => void
}

async function loadMainRaceCar(): Promise<Group> {
  const gltf = await new GLTFLoader().loadAsync('/models/car.glb')
  const group = new Group()
  group.name = 'mainRaceCar'
  for (const child of [...gltf.scene.children]) group.add(child)
  return group
}

async function buildDerbyDestroyed(
  type: DerbyVehicleType,
  paintColor: number,
): Promise<{ group: Group; dispose: () => void }> {
  const asset = await loadDerbyVehicleAsset(DERBY_VEHICLES[type], paintColor)
  let visualizer: ReturnType<typeof createDamageVisualizer> | null = null
  try {
    visualizer = createDamageVisualizer(asset)
    // Force critical tier (paint darkening, smoke + fire, broken lights)
    // by routing a state with health=0 through the visualizer's public
    // update API. Avoids exposing setTier just for this page.
    const state: DerbyCarState = {
      carIdx: 0,
      type,
      // physics is unused by the visualizer. `as never` keeps the
      // interface compile while signaling "do not read this field".
      physics: undefined as never,
      maxHealth: DERBY_VEHICLES[type].health,
      health: 0,
      status: 'destroyed',
      aliveMs: 0,
      kills: 0,
      lastHitAtMs: 0,
      stunUntilMs: Number.NEGATIVE_INFINITY,
      destroyedByIdx: null,
    }
    visualizer.update(state)
    // Try every panel direction so hood + trunk + (when present) doors
    // all detach. The visualizer skips panels not on the asset, so the
    // four-call sweep is safe for variants without overlay doors.
    // In gameplay the freshly detached panel sits at its on-car position
    // and then physics carries it away; the viewer is a single static
    // frame so we push each piece out in the direction it was hit and
    // tilt it so destruction reads at a glance.
    for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const debris = visualizer.applyHit(30, nx, nz, 0, Math.random)
      if (debris) {
        debris.position.x += nx * 1.4
        debris.position.z += nz * 1.4
        debris.position.y += 0.4
        debris.rotation.x += 0.4 * (nz === 0 ? 1 : 0)
        debris.rotation.z += 0.4 * (nx === 0 ? 1 : 0)
        asset.group.add(debris)
      }
    }
    const readyVisualizer = visualizer
    return {
      group: asset.group,
      dispose: () => {
        readyVisualizer.dispose()
        asset.dispose()
      },
    }
  } catch (err) {
    visualizer?.dispose()
    asset.dispose()
    throw err
  }
}

async function loadEntry(entry: CatalogEntry): Promise<LoadedEntry> {
  if (entry.derbyType === null) {
    const pristine = await loadMainRaceCar()
    // Parts: direct children of the main race car. The GLB has no contract
    // names, so we just enumerate every direct child with a visible mesh.
    const parts: { name: string; node: Object3D }[] = []
    for (const child of pristine.children) {
      if (meshesOf(child).length > 0) {
        parts.push({ name: child.name || 'part', node: child })
      }
    }
    return {
      pristine,
      destroyed: null,
      parts,
      dispose: () => {
        // GLTFLoader-produced meshes are owned by the scene; rely on the
        // top-level dispose-on-unmount in ModelTile to release WebGL
        // resources. No explicit teardown needed here.
      },
    }
  }
  const pristineAsset = await loadDerbyVehicleAsset(
    DERBY_VEHICLES[entry.derbyType],
    entry.paintColor,
  )
  let destroyed: Awaited<ReturnType<typeof buildDerbyDestroyed>>
  try {
    destroyed = await buildDerbyDestroyed(entry.derbyType, entry.paintColor)
  } catch (err) {
    pristineAsset.dispose()
    throw err
  }
  // Pull out individual parts for the bottom grid BEFORE handing the
  // group off to the tile. We clone each part so the pristine group still
  // has every panel attached for the hero tile.
  // Wheels arrive with the per-side Kenney rotation that mirrors left
  // wheels relative to right, so without normalization the parts grid
  // showed wheel_fl/rl from one face and wheel_fr/rr from the other.
  // For display we zero each wheel clone's local rotation so all four
  // share one canonical pose and the auto-rotate spins them through the
  // same view.
  const WHEEL_NAMES = new Set([
    'wheel_fl',
    'wheel_fr',
    'wheel_rl',
    'wheel_rr',
  ])
  const parts: { name: string; node: Object3D }[] = []
  for (const name of PART_ORDER) {
    const node = pristineAsset.submeshes[name]
    if (!node) continue
    const clone = node.clone(true)
    if (WHEEL_NAMES.has(name)) {
      clone.rotation.set(0, 0, 0)
      clone.scale.set(
        Math.abs(clone.scale.x),
        Math.abs(clone.scale.y),
        Math.abs(clone.scale.z),
      )
    }
    parts.push({ name, node: clone })
  }
  return {
    pristine: pristineAsset.group,
    destroyed: destroyed.group,
    parts,
    dispose: () => {
      pristineAsset.dispose()
      destroyed.dispose()
    },
  }
}

export function ModelViewer() {
  const [index, setIndex] = useState(0)
  const [loaded, setLoaded] = useState<LoadedEntry | null>(null)
  const [error, setError] = useState<string | null>(null)

  const entry = CATALOG[index]

  useEffect(() => {
    let cancelled = false
    let prev: LoadedEntry | null = null
    setLoaded(null)
    setError(null)
    loadEntry(entry)
      .then((next) => {
        if (cancelled) {
          next.dispose()
          return
        }
        prev = next
        setLoaded(next)
      })
      .catch((err) => {
        if (cancelled) return
        console.error('[model-viewer] failed to load', entry, err)
        setError(`Failed to load ${entry.label}`)
      })
    return () => {
      cancelled = true
      if (prev) prev.dispose()
    }
  }, [entry])

  const chips = useMemo(
    () =>
      CATALOG.map((c, i) => ({
        ...c,
        isActive: i === index,
        onClick: () => setIndex(i),
      })),
    [index],
  )

  const prev = () => setIndex((i) => (i - 1 + CATALOG.length) % CATALOG.length)
  const next = () => setIndex((i) => (i + 1) % CATALOG.length)

  return (
    <SharedModelStage>
    <main style={pageStyle}>
      <header style={headerStyle}>
        <Link href="/" style={backLinkStyle}>
          ‹ home
        </Link>
        <h1 style={titleStyle}>Model Viewer</h1>
        <div style={navStyle}>
          <button type="button" onClick={prev} style={navBtnStyle}>
            ‹ prev
          </button>
          <button type="button" onClick={next} style={navBtnStyle}>
            next ›
          </button>
        </div>
      </header>

      <div style={chipRowStyle}>
        {chips.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={c.onClick}
            aria-pressed={c.isActive}
            style={{
              ...chipStyle,
              background: c.isActive ? '#e84a5f' : 'rgba(255,255,255,0.08)',
              borderColor: c.isActive ? '#e84a5f' : 'rgba(255,255,255,0.15)',
            }}
          >
            {c.label}
          </button>
        ))}
      </div>

      {error && <div style={errorStyle}>{error}</div>}

      {loaded && (
        <>
          <section style={heroRowStyle}>
            <ModelTile object={loaded.pristine} label="Assembled" size={360} />
            <ModelTile
              object={loaded.destroyed ?? loaded.pristine}
              label="Destroyed"
              size={360}
              background={loaded.destroyed ? '#1a1a22' : '#2a2a32'}
              caption={loaded.destroyed ? undefined : 'No damage system'}
            />
          </section>

          <h2 style={subtitleStyle}>Individual parts</h2>
          <section style={partsGridStyle}>
            {loaded.parts.map((p, i) => (
              <ModelTile
                key={`${entry.id}:${p.name}:${i}`}
                object={p.node}
                label={p.name}
                size={170}
                background="#1f1f25"
              />
            ))}
          </section>
        </>
      )}

      {!loaded && !error && <div style={loadingStyle}>Loading {entry.label}…</div>}
    </main>
    </SharedModelStage>
  )
}

const pageStyle: React.CSSProperties = {
  minHeight: '100vh',
  background: '#0c0c10',
  color: 'white',
  fontFamily: 'var(--font-cartoony), system-ui, sans-serif',
  padding: '32px 28px 64px',
  display: 'flex',
  flexDirection: 'column',
  gap: 24,
}
const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 16,
  flexWrap: 'wrap',
}
const backLinkStyle: React.CSSProperties = {
  color: '#e84a5f',
  textDecoration: 'none',
  fontWeight: 600,
}
const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 36,
  fontWeight: 700,
  flex: 1,
}
const navStyle: React.CSSProperties = { display: 'flex', gap: 8 }
const navBtnStyle: React.CSSProperties = {
  padding: '10px 18px',
  background: 'rgba(255,255,255,0.08)',
  border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: 10,
  color: 'white',
  fontFamily: 'inherit',
  fontSize: 15,
  fontWeight: 600,
  cursor: 'pointer',
}
const chipRowStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
}
const chipStyle: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: 999,
  border: '1px solid rgba(255,255,255,0.15)',
  background: 'rgba(255,255,255,0.08)',
  color: 'white',
  fontFamily: 'inherit',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
}
const heroRowStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 24,
  justifyContent: 'center',
}
const subtitleStyle: React.CSSProperties = {
  margin: '12px 0 4px',
  fontSize: 20,
  fontWeight: 600,
  opacity: 0.85,
}
const partsGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))',
  gap: 16,
}
const loadingStyle: React.CSSProperties = {
  textAlign: 'center',
  padding: 48,
  fontSize: 16,
  opacity: 0.7,
}
const errorStyle: React.CSSProperties = {
  padding: 16,
  background: 'rgba(232,74,95,0.15)',
  border: '1px solid #e84a5f',
  borderRadius: 10,
  color: '#ffb0bb',
}
