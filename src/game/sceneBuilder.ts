import {
  AdditiveBlending,
  AmbientLight,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DataTexture,
  DirectionalLight,
  FogExp2,
  Group,
  DynamicDrawUsage,
  Line,
  LineBasicMaterial,
  LineSegments,
  type Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NearestFilter,
  type Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Points,
  PointsMaterial,
  Quaternion,
  RGBAFormat,
  Scene,
  SphereGeometry,
  SpotLight,
  Sprite,
  SpriteMaterial,
  type Texture,
  UnsignedByteType,
  Vector3,
} from 'three'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import {
  CELL_SIZE,
  TRACK_WIDTH,
  trackCenter,
  type OrderedPiece,
  type TrackPath,
} from './trackPath'
import {
  SKID_MARK_LENGTH,
  SKID_MARK_POOL_SIZE,
  nextSkidMarkIndex,
  skidMarkAlpha,
  skidMarkPeakAlpha,
} from './skidMarks'
import {
  TIRE_SMOKE_BASE_Y,
  TIRE_SMOKE_POOL_SIZE,
  nextTireSmokeIndex,
  puffAlpha,
  puffRise,
  puffScale,
} from './tireSmoke'
import {
  DEFAULT_TIME_OF_DAY,
  SUN_DISTANCE,
  getLightingPreset,
  type TimeOfDay,
} from '@/lib/lighting'
import {
  DEFAULT_WEATHER,
  getWeatherPreset,
  mixColorHex,
  type Weather,
} from '@/lib/weather'
import {
  FINISH_GATE_BANNER_DEPTH,
  FINISH_GATE_BANNER_HEIGHT,
  FINISH_GATE_BANNER_OVERHANG,
  FINISH_GATE_POLE_HEIGHT,
  FINISH_GATE_POLE_INSET,
  FINISH_GATE_POLE_THICKNESS,
  FINISH_STRIPE_CHECK_COLUMNS,
  FINISH_STRIPE_CHECK_ROWS,
  FINISH_STRIPE_DEPTH,
  FINISH_TEXTURE_PIXELS_PER_SQUARE,
  buildCheckerTexturePixels,
  computeGatePolePositions,
  gatePoleSeparation,
} from './finishLine'
import { KERB_Y, buildTrackKerbTiles } from './kerbs'
import {
  RACING_LINE_COLOR_HEX,
  RACING_LINE_WIDTH_PX,
  samplesToPolyline,
} from './racingLine'
import {
  DEFAULT_RAIN_CONFIG,
  DEFAULT_RAIN_PARTICLES,
  RAIN_COLOR_HEX,
  RAIN_OPACITY,
  initRainParticles,
  makeRainRng,
  tickRainParticles,
  writeRainGeometry,
  type RainParticle,
} from './rain'
import {
  DEFAULT_SNOW_CONFIG,
  DEFAULT_SNOW_PARTICLES,
  SNOW_COLOR_HEX,
  SNOW_OPACITY,
  SNOW_POINT_SIZE,
  buildSnowflakeSprite,
  initSnowParticles,
  makeSnowRng,
  tickSnowParticles,
  writeSnowGeometry,
  type SnowParticle,
} from './snow'
import type { Replay } from '@/lib/replay'
import {
  SCENERY_BARRIER_HEX_RED,
  SCENERY_BARRIER_HEX_WHITE,
  buildScenery,
  type SceneryItem,
} from './scenery'
import {
  drawRacingNumberToCanvas,
  type RacingNumberSetting,
} from '@/lib/racingNumber'
import {
  NAMEPLATE_BG_HEX,
  NAMEPLATE_BORDER_HEX,
  NAMEPLATE_SOURCE_TAGS,
  NAMEPLATE_SPRITE_HEIGHT,
  NAMEPLATE_SPRITE_WIDTH,
  NAMEPLATE_TAG_HEX,
  NAMEPLATE_TEXT_HEX,
  NAMEPLATE_TEXTURE_HEIGHT,
  NAMEPLATE_TEXTURE_WIDTH,
  NAMEPLATE_Y_OFFSET,
  formatNameplateInitials,
  formatNameplateLapTime,
  nameplateCacheKey,
  type GhostMeta,
} from './ghostNameplate'
import type { GhostSource } from '@/lib/ghostSource'
import {
  HEADLIGHT_LAMP_COLOR_HEX,
  HEADLIGHT_LAMP_OFFSET_X,
  HEADLIGHT_LAMP_OFFSET_Y,
  HEADLIGHT_LAMP_OFFSET_Z,
  HEADLIGHT_LAMP_RADIUS,
  HEADLIGHT_SPOT_ANGLE,
  HEADLIGHT_SPOT_COLOR_HEX,
  HEADLIGHT_SPOT_DECAY,
  HEADLIGHT_SPOT_DISTANCE,
  HEADLIGHT_SPOT_INTENSITY,
  HEADLIGHT_SPOT_PENUMBRA,
  HEADLIGHT_SPOT_TARGET_X,
} from '@/lib/headlights'
import {
  BRAKE_LIGHT_COLOR_HEX,
  BRAKE_LIGHT_GLOW_OPACITY,
  BRAKE_LIGHT_GLOW_RADIUS,
  BRAKE_LIGHT_LAMP_OFFSET_X,
  BRAKE_LIGHT_LAMP_OFFSET_Y,
  BRAKE_LIGHT_LAMP_OFFSET_Z,
  BRAKE_LIGHT_LAMP_RADIUS,
} from '@/lib/brakeLights'

const CAR_MODEL_URL = '/models/car.glb'
// Remap model's local +Z forward to world +X (physics heading 0).
const CAR_MODEL_YAW_OFFSET = Math.PI / 2
const CAR_MODEL_SCALE = 1.65

let carGltfPromise: Promise<GLTF> | null = null
function loadCarGltf(): Promise<GLTF> {
  carGltfPromise ??= new GLTFLoader().loadAsync(CAR_MODEL_URL).catch((err) => {
    carGltfPromise = null
    throw err
  })
  return carGltfPromise
}

export interface SceneBundle {
  scene: Scene
  camera: PerspectiveCamera
  car: Group
  // Recolor the body mesh of the player car. `null` restores the stock
  // colormap baked into the GLB. Safe to call before the GLB has finished
  // loading: the requested paint is buffered and applied as soon as the
  // mesh appears.
  setCarPaint: (paintHex: string | null) => void
  // Apply the player's racing-number plate setting to the car. When
  // `enabled` is false the plate hides; otherwise the renderer redraws the
  // CanvasTexture (only when the value or colors changed) and shows the
  // plate. Cheap on no-op (single string compare); the rAF loop can poll-
  // and-set every frame without churning the GPU.
  setRacingNumber: (setting: RacingNumberSetting) => void
  // Toggle the headlight assembly on the player car. `true` shows the lamp
  // lenses and enables the SpotLights, `false` hides the whole light group.
  // Visual only; never affects physics or scoring. Cheap on no-op because the
  // rAF loop compares one cached boolean before flipping group visibility.
  setHeadlights: (on: boolean) => void
  // Toggle the cosmetic brake-light glow on the rear of the player car.
  // `true` lights the rear lamps red and shows the soft additive halo, `false`
  // dims them back to a flat dark housing. Pure cosmetic; never affects
  // physics. Cheap on no-op (single boolean compare on the cached value before
  // flipping the visibility flag).
  setBrakeLights: (on: boolean) => void
  // Apply a time-of-day lighting preset by name. Updates the sky color, the
  // ground material color, the ambient light, and the sun's color, intensity,
  // and direction in place. Cheap; no allocation per call so the rAF loop can
  // poll-and-set every frame without churn.
  setTimeOfDay: (name: TimeOfDay) => void
  // Apply a weather preset by name. Updates the scene's exponential fog
  // density and color, mixes the time-of-day sky color toward the fog color
  // by the preset's tint factor, and scales the time-of-day ambient and sun
  // intensities by the preset's multipliers. Cheap; no allocation per call
  // so the rAF loop can poll-and-set every frame without churn. Composes
  // with `setTimeOfDay`: callers should set time-of-day first, then weather.
  setWeather: (name: Weather) => void
  // Skid mark pool. Exposed on the bundle so the rAF loop can spawn into it
  // each frame and clear it on a full reset, without needing to reach into
  // the scene graph.
  skidMarks: SkidMarkLayer
  // Tire smoke puff pool. Soft white camera-facing sprites that puff up off
  // the rear wheels during hard slides and braking, then rise and fade. The
  // rAF loop calls `spawn` when its puff intensity gates pass and `tick` each
  // frame to advance ages; `clear` empties the pool on a full Restart so the
  // fresh race starts on a clean scene.
  tireSmoke: TireSmokeLayer
  // Inside-corner kerb tiles (the alternating red / white curb stones at the
  // apex of every turn). Exposed so the rAF loop can poll a Settings toggle
  // and flip visibility without rebuilding any geometry.
  kerbs: KerbLayer
  // Trackside scenery (trees on the grass, cones at every corner outside,
  // barriers at the start gate). Same poll-and-set pattern as kerbs so a
  // Settings toggle can hide everything in O(1).
  scenery: SceneryLayer
  // Optional racing-line overlay: a thin colored polyline lifted just above
  // the asphalt that traces the active ghost replay's path. Hidden by
  // default; the rAF loop polls a Settings ref and feeds the active replay
  // into `setReplay` whenever the source changes. Designed as a coaching aid
  // for players who want to see where the leaderboard top time drives.
  racingLine: RacingLineLayer
  // Falling rain particle layer. Hidden unless the active weather preset is
  // 'rainy'. Visibility is flipped inside `setWeather`; the rAF loop ticks
  // the layer with the camera position each frame so the streaks wrap into
  // a fresh box after the player drives a long distance.
  rain: RainLayer
  // Falling snow particle layer. Same lifecycle as `rain`: hidden unless the
  // active weather preset is 'snowy', visibility flipped inside `setWeather`,
  // and the rAF loop ticks the layer with the camera position each frame so
  // the flurry wraps into a fresh box and the sway phase advances naturally.
  snow: SnowLayer
  dispose: () => void
}

function buildFlatGeometry(verts: number[], idx: number[]): BufferGeometry {
  const geom = new BufferGeometry()
  geom.setAttribute(
    'position',
    new BufferAttribute(new Float32Array(verts), 3),
  )
  geom.setIndex(idx)
  geom.computeVertexNormals()
  return geom
}

function straightGeometry(op: OrderedPiece): BufferGeometry {
  const isVertical = op.entryDir === 0 || op.entryDir === 2
  const halfLong = CELL_SIZE / 2
  const halfShort = TRACK_WIDTH / 2
  const { x: cx, z: cz } = op.center
  const verts = isVertical
    ? [
        cx - halfShort, 0, cz - halfLong,
        cx + halfShort, 0, cz - halfLong,
        cx + halfShort, 0, cz + halfLong,
        cx - halfShort, 0, cz + halfLong,
      ]
    : [
        cx - halfLong, 0, cz - halfShort,
        cx + halfLong, 0, cz - halfShort,
        cx + halfLong, 0, cz + halfShort,
        cx - halfLong, 0, cz + halfShort,
      ]
  return buildFlatGeometry(verts, [0, 2, 1, 0, 3, 2])
}

function cornerGeometry(op: OrderedPiece, segments = 20): BufferGeometry {
  const { cx, cz } = op.arcCenter!
  const innerR = CELL_SIZE / 2 - TRACK_WIDTH / 2
  const outerR = CELL_SIZE / 2 + TRACK_WIDTH / 2

  const a1 = Math.atan2(op.entry.z - cz, op.entry.x - cx)
  const a2 = Math.atan2(op.exit.z - cz, op.exit.x - cx)
  let delta = a2 - a1
  while (delta > Math.PI) delta -= 2 * Math.PI
  while (delta < -Math.PI) delta += 2 * Math.PI

  const verts: number[] = []
  for (let i = 0; i <= segments; i++) {
    const a = a1 + delta * (i / segments)
    const ca = Math.cos(a)
    const sa = Math.sin(a)
    verts.push(cx + innerR * ca, 0, cz + innerR * sa)
    verts.push(cx + outerR * ca, 0, cz + outerR * sa)
  }
  // Triangle winding must yield a +Y normal. Flip if delta is negative.
  const ccw = delta > 0
  const idx: number[] = []
  for (let i = 0; i < segments; i++) {
    const base = i * 2
    if (ccw) {
      idx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3)
    } else {
      idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2)
    }
  }
  return buildFlatGeometry(verts, idx)
}

function polylineGeometry(op: OrderedPiece): BufferGeometry {
  const samples = op.samples!
  const half = TRACK_WIDTH / 2
  const verts: number[] = []
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i]
    // Build a tangent from neighboring samples (central difference at the
    // interior, forward / backward at the ends). The perpendicular in the
    // y=0 plane is (tz, -tx) rotated 90 CW, which yields the right-hand side
    // when standing at the sample looking along travel.
    let tx: number
    let tz: number
    if (i === 0) {
      tx = samples[i + 1].x - s.x
      tz = samples[i + 1].z - s.z
    } else if (i === samples.length - 1) {
      tx = s.x - samples[i - 1].x
      tz = s.z - samples[i - 1].z
    } else {
      tx = samples[i + 1].x - samples[i - 1].x
      tz = samples[i + 1].z - samples[i - 1].z
    }
    const tlen = Math.hypot(tx, tz) || 1
    tx /= tlen
    tz /= tlen
    // Right-hand perpendicular in the +Y up frame.
    const px = -tz
    const pz = tx
    verts.push(s.x + px * half, 0, s.z + pz * half)
    verts.push(s.x - px * half, 0, s.z - pz * half)
  }
  const idx: number[] = []
  for (let i = 0; i < samples.length - 1; i++) {
    const base = i * 2
    idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2)
  }
  return buildFlatGeometry(verts, idx)
}

function pieceGeometry(op: OrderedPiece): BufferGeometry {
  if (op.samples !== null) return polylineGeometry(op)
  return op.piece.type === 'straight' ? straightGeometry(op) : cornerGeometry(op)
}

function buildCarFrame(
  onLoaded?: (clone: Object3D) => void,
): { car: Group; cancel: () => void } {
  const outer = new Group()
  const inner = new Group()
  inner.rotation.y = CAR_MODEL_YAW_OFFSET
  inner.scale.setScalar(CAR_MODEL_SCALE)
  outer.add(inner)

  let cancelled = false
  loadCarGltf().then(
    (gltf) => {
      if (cancelled) return
      const clone = gltf.scene.clone()
      onLoaded?.(clone)
      inner.add(clone)
    },
    (err) => {
      console.error('Failed to load car model', err)
    },
  )

  return { car: outer, cancel: () => { cancelled = true } }
}

// Player car with a paint + racing-number hook. The Kenney race car GLB
// exposes the body as a single mesh node named "body" sharing the colormap
// atlas with the wheels. To recolor only the chassis we clone the material
// on the body node, drop the `.map` reference (the body region of the atlas
// is solid red, so dropping it gives a clean unicolor repaint), and tint to
// the requested hex. `null` restores the original shared material so wheels
// stay in the same family. The setters are exposed so live Settings updates
// can reach the renderer without rebuilding the scene.

// Texture resolution for the racing-number plate. 256 is enough for a 1-2
// digit number to stay crisp under the chase camera without paying for a
// large GPU upload on every settings tweak.
export const RACING_NUMBER_TEXTURE_SIZE = 256

// World-space dimensions of the sticker mesh on the car's roof. The sticker is
// square so the texture maps 1:1; height is in y above the car's pivot.
export const RACING_NUMBER_PLATE_SIZE = 1.18
export const RACING_NUMBER_PLATE_HEIGHT_Y = 1.28

function buildRacingNumberPlate(): {
  group: Group
  apply: (setting: RacingNumberSetting) => void
  dispose: () => void
} {
  const group = new Group()
  // Lift to the roof. Keep the sticker close enough to read as attached to
  // the body, while still avoiding z-fighting against the GLB roof mesh.
  group.position.y = RACING_NUMBER_PLATE_HEIGHT_Y
  // Default hidden so a fresh load with the toggle off costs nothing.
  group.visible = false

  // Detect SSR / no-canvas environments (Vitest's jsdom does not implement
  // 2D canvas). When unavailable we keep the plate hidden and skip every
  // draw; the schema-validated settings still round-trip cleanly.
  const hasCanvas =
    typeof document !== 'undefined' &&
    typeof document.createElement === 'function'

  let canvas: HTMLCanvasElement | null = null
  let ctx: CanvasRenderingContext2D | null = null
  let texture: CanvasTexture | null = null
  let mesh: Mesh | null = null
  let material: MeshStandardMaterial | null = null
  // Cache the last applied tuple so a no-op call (same settings, fired by
  // the rAF loop's poll-and-set) is a single string compare instead of a
  // canvas redraw + GPU upload.
  let lastKey: string | null = null

  function ensureMesh() {
    if (mesh || !hasCanvas) return
    canvas = document.createElement('canvas')
    canvas.width = RACING_NUMBER_TEXTURE_SIZE
    canvas.height = RACING_NUMBER_TEXTURE_SIZE
    ctx = canvas.getContext('2d')
    if (!ctx) {
      canvas = null
      return
    }
    texture = new CanvasTexture(canvas)
    // Crisp scale-down so the plate stays readable when the chase camera is
    // far away.
    texture.minFilter = NearestFilter
    texture.magFilter = NearestFilter
    texture.anisotropy = 1
    material = new MeshStandardMaterial({
      map: texture,
      roughness: 0.8,
      metalness: 0,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    })
    const geom = new PlaneGeometry(
      RACING_NUMBER_PLATE_SIZE,
      RACING_NUMBER_PLATE_SIZE,
    )
    mesh = new Mesh(geom, material)
    // Lay flat (texture faces +Y so a top-down camera reads it). The Kenney
    // chassis points its forward to world +X; orient the plate so the
    // number reads upright when viewed from the trailing chase camera by
    // rotating it so its texture's +X aligns with the car's forward (+X in
    // world space at heading 0).
    mesh.rotation.x = -Math.PI / 2
    mesh.rotation.z = -Math.PI / 2
    group.add(mesh)
  }

  function apply(setting: RacingNumberSetting) {
    if (!setting.enabled) {
      group.visible = false
      lastKey = null
      return
    }
    const key = `${setting.value}|${setting.plateHex}|${setting.textHex}`
    if (key === lastKey && mesh) {
      group.visible = true
      return
    }
    ensureMesh()
    if (!ctx || !texture) {
      // jsdom or canvas-less environment: stay hidden so we never reference
      // a half-initialized mesh.
      group.visible = false
      return
    }
    drawRacingNumberToCanvas(
      ctx,
      RACING_NUMBER_TEXTURE_SIZE,
      setting.value,
      setting.plateHex,
      setting.textHex,
    )
    texture.needsUpdate = true
    group.visible = true
    lastKey = key
  }

  function dispose() {
    if (texture) texture.dispose()
    if (material) material.dispose()
    if (mesh) mesh.geometry.dispose()
  }

  return { group, apply, dispose }
}

// Headlight assembly attached to the car's outer group. Two small lamp lenses
// at the front of the chassis carry SpotLight sources aimed down the road so
// nearby scenery and road surfaces pick up real light instead of fake cones.
function buildHeadlights(): {
  group: Group
  setVisible: (value: boolean) => void
  dispose: () => void
} {
  const group = new Group()
  // Default hidden so a fresh load with the toggle off costs nothing per
  // frame (the parent's `setVisible(false)` skips the entire subtree during
  // render-list traversal).
  group.visible = false

  // Shared lens resources so the visible parts remain cheap. The SpotLights
  // are per-lamp because each source has its own target.
  const lampGeom = new SphereGeometry(HEADLIGHT_LAMP_RADIUS, 16, 12)
  const lampMat = new MeshStandardMaterial({
    color: HEADLIGHT_LAMP_COLOR_HEX,
    emissive: HEADLIGHT_LAMP_COLOR_HEX,
    emissiveIntensity: 1.1,
    roughness: 0.25,
    metalness: 0,
  })
  const targets: Object3D[] = []

  function addAssembly(zSign: 1 | -1) {
    const lamp = new Mesh(lampGeom, lampMat)
    lamp.position.set(
      HEADLIGHT_LAMP_OFFSET_X,
      HEADLIGHT_LAMP_OFFSET_Y,
      HEADLIGHT_LAMP_OFFSET_Z * zSign,
    )
    group.add(lamp)

    const target = new Group()
    target.position.set(
      HEADLIGHT_SPOT_TARGET_X,
      HEADLIGHT_LAMP_OFFSET_Y,
      HEADLIGHT_LAMP_OFFSET_Z * zSign,
    )
    group.add(target)
    targets.push(target)

    const light = new SpotLight(
      HEADLIGHT_SPOT_COLOR_HEX,
      HEADLIGHT_SPOT_INTENSITY,
      HEADLIGHT_SPOT_DISTANCE,
      HEADLIGHT_SPOT_ANGLE,
      HEADLIGHT_SPOT_PENUMBRA,
      HEADLIGHT_SPOT_DECAY,
    )
    light.position.copy(lamp.position)
    light.target = target
    group.add(light)
  }

  addAssembly(1)
  addAssembly(-1)

  return {
    group,
    setVisible(value) {
      group.visible = value
    },
    dispose() {
      lampGeom.dispose()
      lampMat.dispose()
      targets.length = 0
    },
  }
}

function buildBrakeLights(): {
  group: Group
  setVisible: (value: boolean) => void
  dispose: () => void
} {
  const group = new Group()
  // Default hidden so a fresh load with the toggle off (or auto + not braking)
  // costs nothing per frame: the parent's `setVisible(false)` skips the entire
  // subtree during render-list traversal.
  group.visible = false

  // Shared resources so two lamps + two glow halos collapse to two materials
  // total. The lamp uses a flat color material (the rear lens itself) and the
  // glow uses an additive translucent material (the soft red halo around the
  // lit lens). When the parent group is hidden both vanish in one O(1) flip.
  const lampGeom = new SphereGeometry(BRAKE_LIGHT_LAMP_RADIUS, 16, 12)
  const lampMat = new MeshBasicMaterial({
    color: BRAKE_LIGHT_COLOR_HEX,
    transparent: false,
  })
  // The glow disc is a flat sphere drawn slightly larger than the lamp,
  // additive-blended so it reads as light spilling out of the lens against
  // either a bright body or a dark night scene.
  const glowGeom = new SphereGeometry(BRAKE_LIGHT_GLOW_RADIUS, 16, 12)
  const glowMat = new MeshBasicMaterial({
    color: BRAKE_LIGHT_COLOR_HEX,
    transparent: true,
    opacity: BRAKE_LIGHT_GLOW_OPACITY,
    depthWrite: false,
    blending: AdditiveBlending,
  })

  function addAssembly(zSign: 1 | -1) {
    const lamp = new Mesh(lampGeom, lampMat)
    lamp.position.set(
      BRAKE_LIGHT_LAMP_OFFSET_X,
      BRAKE_LIGHT_LAMP_OFFSET_Y,
      BRAKE_LIGHT_LAMP_OFFSET_Z * zSign,
    )
    group.add(lamp)

    const glow = new Mesh(glowGeom, glowMat)
    glow.position.copy(lamp.position)
    group.add(glow)
  }

  addAssembly(1)
  addAssembly(-1)

  return {
    group,
    setVisible(value) {
      group.visible = value
    },
    dispose() {
      lampGeom.dispose()
      lampMat.dispose()
      glowGeom.dispose()
      glowMat.dispose()
    },
  }
}

function buildCar(): {
  car: Group
  setPaint: (hex: string | null) => void
  setRacingNumber: (setting: RacingNumberSetting) => void
  setHeadlights: (on: boolean) => void
  setBrakeLights: (on: boolean) => void
  cancel: () => void
} {
  let bodyMesh: Mesh | null = null
  let originalBodyMaterial: Material | null = null
  let paintMaterial: MeshStandardMaterial | null = null
  // Buffer the paint requested before the GLB resolves so the first apply
  // happens the moment the mesh appears.
  let pendingHex: string | null = null

  function applyPaint(hex: string | null) {
    if (!bodyMesh || !originalBodyMaterial) return
    if (hex === null) {
      // Restore stock. Keep the paint material around so a re-apply can
      // reuse it without churning GPU resources.
      bodyMesh.material = originalBodyMaterial
      return
    }
    if (!paintMaterial) {
      paintMaterial = new MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.5,
        metalness: 0.05,
      })
    }
    paintMaterial.color.set(hex)
    bodyMesh.material = paintMaterial
  }

  const plate = buildRacingNumberPlate()
  const headlights = buildHeadlights()
  const brakeLights = buildBrakeLights()

  const { car, cancel: cancelLoad } = buildCarFrame((clone) => {
    clone.traverse((obj) => {
      if (bodyMesh) return
      const mesh = obj as Mesh
      if (!mesh.isMesh) return
      // The Kenney GLB names the chassis node "body". Match prefix so a
      // future re-export with a numeric suffix still works.
      if (typeof mesh.name === 'string' && mesh.name.startsWith('body')) {
        bodyMesh = mesh
        const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
        originalBodyMaterial = mat ?? null
      }
    })
    applyPaint(pendingHex)
  })
  // Attach the plate to the OUTER car group so it inherits the heading
  // rotation but not the inner GLB's yaw / scale tweaks.
  car.add(plate.group)
  // Same for the headlights: the offsets are expressed in the car's local
  // frame (forward = +X at heading 0) so they only need to inherit the
  // heading rotation, not the inner-group's GLB-orientation yaw / scale.
  car.add(headlights.group)
  // Mirror layout for the brake lights, just on the rear face.
  car.add(brakeLights.group)

  return {
    car,
    setPaint: (hex: string | null) => {
      pendingHex = hex
      applyPaint(hex)
    },
    setRacingNumber: plate.apply,
    setHeadlights: headlights.setVisible,
    setBrakeLights: brakeLights.setVisible,
    cancel: () => {
      cancelLoad()
      paintMaterial?.dispose()
      paintMaterial = null
      plate.dispose()
      headlights.dispose()
      brakeLights.dispose()
    },
  }
}

// Skid mark layer: a fixed-size pool of dark quads laid flat on the road
// that the rAF loop spawns into when the car is sliding. The pool is a ring
// buffer; the oldest mark is overwritten when capacity is hit so the GPU
// footprint stays bounded regardless of race length. Each quad owns its own
// material so per-mark alpha can fade independently without touching shaders.
//
// Spawn poses are passed in as world `(x, z, heading)` plus the slide's peak
// intensity. The renderer offsets each mark to the rear-axle stripes (left
// and right of the chassis) so the trail reads as two distinct tire marks.
export interface SkidMarkLayer {
  group: Group
  spawn: (x: number, z: number, heading: number, peakAlpha: number, nowMs: number) => void
  tick: (nowMs: number) => void
  clear: () => void
  dispose: () => void
}

interface SkidMarkSlot {
  mesh: Mesh
  mat: MeshBasicMaterial
  spawnedAt: number
  peak: number
  active: boolean
}

// Half the rear-axle width in world units. TRACK_WIDTH is 8; the car's
// rendered footprint is roughly 2 wide after the GLB scale, so 1.0 places
// the two stripes about a tire's width apart. Tuned visually so the marks
// read as paired stripes rather than a single smeared blob.
const SKID_MARK_REAR_OFFSET = 1.05
// How far behind the chassis center the rear axle sits. The car GLB pivots
// near its midpoint, so this is the back-half of the visible footprint.
const SKID_MARK_REAR_BACK = 1.4
// Sit slightly above the road plane (which itself sits at y=0.01) so the
// marks render on top without z-fighting the road material.
const SKID_MARK_Y = 0.02

export function buildSkidMarkLayer(
  poolSize = SKID_MARK_POOL_SIZE,
): SkidMarkLayer {
  const group = new Group()
  // One geometry shared across every quad in the pool. Each slot owns its
  // own material so per-mark alpha animates independently.
  const geom = new PlaneGeometry(TRACK_WIDTH * 0.08, SKID_MARK_LENGTH)
  const slots: SkidMarkSlot[] = []
  for (let i = 0; i < poolSize; i++) {
    const mat = new MeshBasicMaterial({
      color: 0x1a1a1a,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    })
    const mesh = new Mesh(geom, mat)
    mesh.rotation.x = -Math.PI / 2
    mesh.visible = false
    group.add(mesh)
    slots.push({ mesh, mat, spawnedAt: 0, peak: 0, active: false })
  }

  // Two slots per spawn (one stripe per rear wheel). Track them via a
  // single ring index that advances by 2 each spawn.
  let writeIdx = 0

  function placeSlot(
    slot: SkidMarkSlot,
    cx: number,
    cz: number,
    headingY: number,
    peak: number,
    nowMs: number,
  ) {
    slot.mesh.position.set(cx, SKID_MARK_Y, cz)
    // The plane started in the XY plane (width on X, length on Y). After
    // `rotation.x = -PI/2` the local +Y direction maps to world -Z, so a
    // mark with `rotation.y = 0` lays its length along world -Z. To align
    // the length with the car's heading we rotate about world Y by
    // `heading - PI/2`: at heading 0 (car facing +X) this is -PI/2, which
    // takes -Z back around to +X.
    slot.mesh.rotation.y = headingY - Math.PI / 2
    slot.spawnedAt = nowMs
    slot.peak = peak
    slot.active = true
    slot.mat.opacity = peak
    slot.mesh.visible = peak > 0
  }

  return {
    group,
    spawn(x, z, heading, peakAlpha, nowMs) {
      if (peakAlpha <= 0) return
      // Rear axle is back along the car's local -X (heading 0 looks +X).
      const cosH = Math.cos(heading)
      const sinH = -Math.sin(heading) // world Z = -sin(heading) for our coord system
      // The "back" vector is opposite of the heading.
      const backX = -cosH * SKID_MARK_REAR_BACK
      const backZ = -sinH * SKID_MARK_REAR_BACK
      // The "right" vector is perpendicular to heading in the XZ plane.
      // For heading 0 (+X), right is +Z. So right = (-sinH, cosH) but our
      // sinH already encodes the negation, so:
      const rightX = -sinH
      const rightZ = cosH
      const baseX = x + backX
      const baseZ = z + backZ
      const leftSlot = slots[writeIdx]
      const rightSlot = slots[(writeIdx + 1) % poolSize]
      placeSlot(
        leftSlot,
        baseX + rightX * -SKID_MARK_REAR_OFFSET,
        baseZ + rightZ * -SKID_MARK_REAR_OFFSET,
        heading,
        peakAlpha,
        nowMs,
      )
      placeSlot(
        rightSlot,
        baseX + rightX * SKID_MARK_REAR_OFFSET,
        baseZ + rightZ * SKID_MARK_REAR_OFFSET,
        heading,
        peakAlpha,
        nowMs,
      )
      writeIdx = nextSkidMarkIndex(
        nextSkidMarkIndex(writeIdx, poolSize),
        poolSize,
      )
    },
    tick(nowMs) {
      for (let i = 0; i < slots.length; i++) {
        const s = slots[i]
        if (!s.active) continue
        const age = nowMs - s.spawnedAt
        const a = skidMarkAlpha(age, s.peak)
        if (a <= 0) {
          s.active = false
          s.mesh.visible = false
          s.mat.opacity = 0
        } else {
          s.mat.opacity = a
        }
      }
    },
    clear() {
      for (let i = 0; i < slots.length; i++) {
        const s = slots[i]
        s.active = false
        s.mesh.visible = false
        s.mat.opacity = 0
      }
      writeIdx = 0
    },
    dispose() {
      for (let i = 0; i < slots.length; i++) {
        slots[i].mat.dispose()
      }
      geom.dispose()
    },
  }
}

// Re-export the pool helpers so RaceCanvas can reference the constants
// without reaching across modules.
export { skidMarkPeakAlpha }

// Tire smoke puff layer: a fixed pool of soft white camera-facing sprites
// recycled in a ring buffer. Each spawn places two puffs (one per rear wheel)
// at the same world position the skid mark layer uses, then the puff rises
// and fades over its lifetime. Camera-facing sprites avoid having to author
// per-frame billboard math; the SpriteMaterial renders the texture as if it
// always faces the camera, which reads as volumetric smoke from any angle.
export interface TireSmokeLayer {
  group: Group
  spawn: (
    x: number,
    z: number,
    heading: number,
    peakAlpha: number,
    nowMs: number,
  ) => void
  tick: (nowMs: number) => void
  clear: () => void
  dispose: () => void
}

interface TireSmokeSlot {
  sprite: Sprite
  mat: SpriteMaterial
  spawnedAt: number
  peak: number
  baseX: number
  baseZ: number
  active: boolean
}

// Build an alpha-feathered RGBA byte array used as the puff sprite texture.
// Soft circular falloff so the sprite reads as a fluffy round cloud rather
// than a hard square. Pure helper exported for unit testing without a WebGL
// context.
export function buildTireSmokePuffSprite(size: number): Uint8Array {
  if (!Number.isFinite(size) || size <= 0) {
    return new Uint8Array(0)
  }
  const px = Math.floor(size)
  const data = new Uint8Array(px * px * 4)
  const center = (px - 1) / 2
  const radius = px / 2
  for (let y = 0; y < px; y++) {
    for (let x = 0; x < px; x++) {
      const dx = x - center
      const dy = y - center
      const dist = Math.sqrt(dx * dx + dy * dy)
      // Soft cosine-style falloff. At the center alpha is full; at the
      // radius edge alpha is zero. Squared falloff hides the hard sprite
      // boundary and reads as a soft puff edge.
      const t = Math.max(0, 1 - dist / radius)
      const alpha = Math.round(255 * t * t)
      const idx = (y * px + x) * 4
      // White RGB; the alpha channel does the visible work.
      data[idx + 0] = 255
      data[idx + 1] = 255
      data[idx + 2] = 255
      data[idx + 3] = alpha
    }
  }
  return data
}

export function buildTireSmokeLayer(
  poolSize = TIRE_SMOKE_POOL_SIZE,
): TireSmokeLayer {
  const group = new Group()

  // Procedural soft round texture so no binary asset ships. 32x32 is plenty
  // for a sprite that scales up to a couple world units at most. NearestFilter
  // would alias the soft edge, so we let the default linear filter handle it.
  const SPRITE_PX = 32
  const spritePixels = buildTireSmokePuffSprite(SPRITE_PX)
  const spriteTex = new DataTexture(
    spritePixels,
    SPRITE_PX,
    SPRITE_PX,
    RGBAFormat,
    UnsignedByteType,
  )
  spriteTex.needsUpdate = true

  const slots: TireSmokeSlot[] = []
  for (let i = 0; i < poolSize; i++) {
    const mat = new SpriteMaterial({
      map: spriteTex,
      // Soft warm white reads as tire smoke against most asphalts. Slightly
      // cooler than pure white so it reads as smoke rather than a paper puff.
      color: 0xe8e8ec,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      // Normal blending (not additive) so the puff actually obscures what is
      // behind it rather than glowing through a dark scene like a flare. A
      // little additive bleed on top of dark asphalt would be fine but normal
      // blending reads more like a real cloud.
    })
    const sprite = new Sprite(mat)
    sprite.scale.set(1, 1, 1)
    sprite.visible = false
    group.add(sprite)
    slots.push({
      sprite,
      mat,
      spawnedAt: 0,
      peak: 0,
      baseX: 0,
      baseZ: 0,
      active: false,
    })
  }

  // Two slots per spawn (one puff per rear wheel). Track them via a single
  // ring index that advances by 2 each spawn.
  let writeIdx = 0

  function placeSlot(
    slot: TireSmokeSlot,
    x: number,
    z: number,
    peak: number,
    nowMs: number,
  ) {
    slot.baseX = x
    slot.baseZ = z
    slot.spawnedAt = nowMs
    slot.peak = peak
    slot.active = true
    slot.mat.opacity = peak
    slot.sprite.position.set(x, TIRE_SMOKE_BASE_Y, z)
    slot.sprite.scale.setScalar(0.7) // matches TIRE_SMOKE_START_SCALE
    slot.sprite.visible = peak > 0
  }

  return {
    group,
    spawn(x, z, heading, peakAlpha, nowMs) {
      if (peakAlpha <= 0) return
      // Same rear-axle math as the skid mark layer so the puffs land exactly
      // behind the wheels, paired stripes of smoke chasing the paired stripes
      // of mark.
      const cosH = Math.cos(heading)
      const sinH = -Math.sin(heading)
      const backX = -cosH * 1.4
      const backZ = -sinH * 1.4
      const rightX = -sinH
      const rightZ = cosH
      const baseX = x + backX
      const baseZ = z + backZ
      const offset = 1.05
      const leftSlot = slots[writeIdx]
      const rightSlot = slots[(writeIdx + 1) % poolSize]
      placeSlot(
        leftSlot,
        baseX + rightX * -offset,
        baseZ + rightZ * -offset,
        peakAlpha,
        nowMs,
      )
      placeSlot(
        rightSlot,
        baseX + rightX * offset,
        baseZ + rightZ * offset,
        peakAlpha,
        nowMs,
      )
      writeIdx = nextTireSmokeIndex(
        nextTireSmokeIndex(writeIdx, poolSize),
        poolSize,
      )
    },
    tick(nowMs) {
      for (let i = 0; i < slots.length; i++) {
        const s = slots[i]
        if (!s.active) continue
        const age = nowMs - s.spawnedAt
        const a = puffAlpha(age, s.peak)
        if (a <= 0) {
          s.active = false
          s.sprite.visible = false
          s.mat.opacity = 0
          continue
        }
        s.mat.opacity = a
        const scale = puffScale(age)
        s.sprite.scale.set(scale, scale, 1)
        const rise = puffRise(age)
        s.sprite.position.set(s.baseX, TIRE_SMOKE_BASE_Y + rise, s.baseZ)
      }
    },
    clear() {
      for (let i = 0; i < slots.length; i++) {
        const s = slots[i]
        s.active = false
        s.sprite.visible = false
        s.mat.opacity = 0
      }
      writeIdx = 0
    },
    dispose() {
      for (let i = 0; i < slots.length; i++) {
        slots[i].mat.dispose()
      }
      spriteTex.dispose()
    },
  }
}

// Inside-corner kerb layer. Each tile is a flat colored quad laid along the
// inner edge of a corner's centerline arc. Tiles alternate red and white so
// the kerb reads as a classic racing curb stone strip at the apex.
//
// One material is created per unique color (red and white), shared across every
// tile of that color, so disposing the layer releases at most two materials
// regardless of how many corners the track has. Geometry is also one shared
// PlaneGeometry sized to the per-tile length / depth from `KerbTile.length`
// and `KerbTile.depth` (which are uniform across all tiles in a given corner
// because we use a constant tile count per 90 degrees).
//
// The layer's `setVisible(value)` flag flips the parent group's visibility so
// the rAF loop can toggle kerbs in response to a Settings change in O(1)
// without touching individual meshes.
export interface KerbLayer {
  group: Group
  setVisible: (value: boolean) => void
  dispose: () => void
}

// Slight dimensional shrink so adjacent tiles of opposite color do not bleed
// into each other when the alternating pattern lands at extreme camera
// distances. Visual only; the math in kerbs.ts uses the unscaled tile length
// for arc-flush spacing.
const KERB_TILE_RENDER_SCALE = 0.96

export function buildKerbLayer(path: TrackPath): KerbLayer {
  const group = new Group()
  const tiles = buildTrackKerbTiles(path)
  // Cache one material per unique color across the whole track. The kerb
  // palette only has two colors so this collapses to at most two materials.
  const matCache = new Map<number, MeshBasicMaterial>()
  const geomCache = new Map<string, PlaneGeometry>()
  for (const tile of tiles) {
    let mat = matCache.get(tile.colorHex)
    if (!mat) {
      mat = new MeshBasicMaterial({
        color: tile.colorHex,
        // Flat shading so the kerb reads as paint regardless of sun direction.
        // BasicMaterial ignores lights, so the color stays vivid in every
        // time-of-day preset (which is what classic kerb stones look like).
      })
      matCache.set(tile.colorHex, mat)
    }
    // Per-corner the tile dims are constant; cache geometry by their string
    // key so we share one geometry per (length, depth) pair.
    const geomKey = `${tile.length.toFixed(4)}|${tile.depth.toFixed(4)}`
    let geom = geomCache.get(geomKey)
    if (!geom) {
      geom = new PlaneGeometry(
        tile.length * KERB_TILE_RENDER_SCALE,
        tile.depth * KERB_TILE_RENDER_SCALE,
      )
      geomCache.set(geomKey, geom)
    }
    const mesh = new Mesh(geom, mat)
    // PlaneGeometry sits in the XY plane by default. Lay it flat (XZ) by
    // rotating -90 degrees about +X. After this, the plane's local +X axis
    // still points along world +X (length axis), local +Y points along world
    // -Z (depth axis), and local +Z now points along world +Y. With Three's
    // default Euler XYZ order, a non-zero rotation.z applied AFTER rotation.x
    // therefore rotates about object-local +Z = world +Y, which is exactly the
    // yaw we want to align the tile's length axis with the tangent direction.
    mesh.rotation.set(-Math.PI / 2, 0, tile.rotationY)
    mesh.position.set(tile.x, KERB_Y, tile.z)
    group.add(mesh)
  }
  return {
    group,
    setVisible(value) {
      group.visible = value
    },
    dispose() {
      for (const mat of matCache.values()) mat.dispose()
      for (const geom of geomCache.values()) geom.dispose()
    },
  }
}

// Trackside scenery layer: trees scattered on the grass area, traffic cones
// at the outside of every corner, and red / white barriers framing the start
// gate. All meshes share a small set of geometries / materials cached in
// closures so a hundred trees collapses to two foliage materials, one trunk,
// and one shared cylinder + cone geometry pair.
export interface SceneryLayer {
  group: Group
  setVisible: (value: boolean) => void
  dispose: () => void
}

// Per-prop dimensions. Trees ship as a green cone (foliage) on a brown
// cylinder (trunk); the foliage cone scales to read as a stylized pine and
// the trunk peeks out underneath. Cones use a slim orange cone with a tiny
// flat base. Barriers are short rectangular blocks alternating red / white.
const TREE_TRUNK_HEIGHT = 1.2
const TREE_TRUNK_RADIUS = 0.28
const TREE_FOLIAGE_HEIGHT = 3.6
const TREE_FOLIAGE_RADIUS = 1.55
const CONE_HEIGHT = 1.1
const CONE_RADIUS = 0.45
const CONE_BASE_HEIGHT = 0.08
const CONE_BASE_HALF_WIDTH = 0.55
const BARRIER_LENGTH = 1.4
const BARRIER_HEIGHT = 0.7
const BARRIER_DEPTH = 0.55

export function buildSceneryLayer(path: TrackPath): SceneryLayer {
  const group = new Group()
  const items = buildScenery(path)

  // Cached materials and geometries. One entry per unique color so a hundred
  // trees with two foliage palettes collapses to two foliage materials.
  const colorMatCache = new Map<number, MeshStandardMaterial>()
  const trunkMat = new MeshStandardMaterial({
    color: 0x6b4423,
    roughness: 0.95,
  })
  const coneBaseMat = new MeshStandardMaterial({
    color: 0x111111,
    roughness: 0.9,
  })

  function getColorMat(hex: number): MeshStandardMaterial {
    let m = colorMatCache.get(hex)
    if (!m) {
      m = new MeshStandardMaterial({ color: hex, roughness: 0.85 })
      colorMatCache.set(hex, m)
    }
    return m
  }

  // Shared geometries. PlaneGeometry rotation tricks are not needed here
  // because cones and cylinders already point along +Y by default, which is
  // what we want for upright props. The foliage cone is offset along +Y at
  // construction so the prop's pivot can sit at the ground.
  const trunkGeom = new CylinderGeometry(
    TREE_TRUNK_RADIUS,
    TREE_TRUNK_RADIUS,
    TREE_TRUNK_HEIGHT,
    8,
  )
  const foliageGeom = new ConeGeometry(TREE_FOLIAGE_RADIUS, TREE_FOLIAGE_HEIGHT, 8)
  const coneGeom = new ConeGeometry(CONE_RADIUS, CONE_HEIGHT, 12)
  const coneBaseGeom = new BoxGeometry(
    CONE_BASE_HALF_WIDTH * 2,
    CONE_BASE_HEIGHT,
    CONE_BASE_HALF_WIDTH * 2,
  )
  const barrierGeom = new BoxGeometry(BARRIER_LENGTH, BARRIER_HEIGHT, BARRIER_DEPTH)

  function addTree(item: SceneryItem) {
    const tree = new Group()
    tree.position.set(item.x, 0, item.z)
    tree.rotation.y = item.rotationY
    tree.scale.setScalar(item.scale)

    const trunk = new Mesh(trunkGeom, trunkMat)
    trunk.position.y = TREE_TRUNK_HEIGHT / 2
    tree.add(trunk)

    const foliageMat = getColorMat(item.colorHex)
    const foliage = new Mesh(foliageGeom, foliageMat)
    // Sit the foliage cone on top of the trunk. The cone's pivot is at its
    // geometric center, so lift it by its half height plus the trunk height.
    foliage.position.y = TREE_TRUNK_HEIGHT + TREE_FOLIAGE_HEIGHT / 2 - 0.2
    tree.add(foliage)

    group.add(tree)
  }

  function addCone(item: SceneryItem) {
    const cone = new Group()
    cone.position.set(item.x, 0, item.z)
    cone.rotation.y = item.rotationY

    const base = new Mesh(coneBaseGeom, coneBaseMat)
    base.position.y = CONE_BASE_HEIGHT / 2
    cone.add(base)

    const body = new Mesh(coneGeom, getColorMat(item.colorHex))
    body.position.y = CONE_BASE_HEIGHT + CONE_HEIGHT / 2
    cone.add(body)

    group.add(cone)
  }

  function addBarrier(item: SceneryItem) {
    // Barriers always alternate red / white from the helper. The renderer
    // simply mirrors that color through the shared material cache so two
    // unique materials cover any number of barrier blocks.
    const mat = getColorMat(item.colorHex)
    const block = new Mesh(barrierGeom, mat)
    block.position.set(item.x, BARRIER_HEIGHT / 2, item.z)
    block.rotation.y = item.rotationY
    group.add(block)
  }

  for (const item of items) {
    if (item.kind === 'tree') addTree(item)
    else if (item.kind === 'cone') addCone(item)
    else if (item.kind === 'barrier') addBarrier(item)
  }

  // Force the barrier color cache to exist even if a track has no barriers
  // so the dispose path stays uniform across every code path.
  getColorMat(SCENERY_BARRIER_HEX_RED)
  getColorMat(SCENERY_BARRIER_HEX_WHITE)

  return {
    group,
    setVisible(value) {
      group.visible = value
    },
    dispose() {
      for (const m of colorMatCache.values()) m.dispose()
      trunkMat.dispose()
      coneBaseMat.dispose()
      trunkGeom.dispose()
      foliageGeom.dispose()
      coneGeom.dispose()
      coneBaseGeom.dispose()
      barrierGeom.dispose()
    },
  }
}

// Racing-line overlay layer. A single colored polyline floating just above
// the asphalt that traces the active ghost replay. The overlay rebuilds its
// geometry whenever a fresh `Replay` arrives (or `null` clears the line) and
// flips visibility through `setVisible` so a Settings toggle is O(1).
//
// The geometry is owned per-replay: rebuilding throws away the old
// BufferGeometry and creates a new one. This keeps memory bounded (one
// geometry at a time) at the cost of one allocation per replay swap, which
// happens at most a handful of times per session (race load, post-PB swap).
//
// The renderer uses `LineBasicMaterial`. WebGL ignores `linewidth` on most
// platforms (it always renders at 1px), so the line will be thin; this is
// acceptable for a coaching overlay and avoids pulling in `Line2` for a
// single overlay. A future upgrade can swap to `Line2` without changing the
// public layer API.
export interface RacingLineLayer {
  group: Group
  setReplay: (replay: Replay | null) => void
  setVisible: (value: boolean) => void
  dispose: () => void
}

export function buildRacingLineLayer(): RacingLineLayer {
  const group = new Group()
  // Hidden by default. The rAF loop reads the Settings ref each frame and
  // flips this; until then we render nothing so a fresh-load with the toggle
  // off costs zero draw calls.
  group.visible = false
  const mat = new LineBasicMaterial({
    color: RACING_LINE_COLOR_HEX,
    linewidth: RACING_LINE_WIDTH_PX,
    transparent: true,
    opacity: 0.85,
    // Render the line on top of the road and kerbs without z-fighting. The
    // line still occludes correctly against the car and ghost (which sit
    // higher in world Y).
    depthWrite: false,
  })
  let activeReplay: Replay | null = null
  let activeGeom: BufferGeometry | null = null
  let activeLine: Line | null = null

  function clearActive() {
    if (activeLine) {
      group.remove(activeLine)
      activeLine = null
    }
    if (activeGeom) {
      activeGeom.dispose()
      activeGeom = null
    }
    activeReplay = null
  }

  function setReplay(replay: Replay | null) {
    if (replay === activeReplay) return
    clearActive()
    if (!replay) return
    const verts = samplesToPolyline(replay.samples)
    if (!verts) return
    const geom = new BufferGeometry()
    geom.setAttribute('position', new BufferAttribute(verts, 3))
    const line = new Line(geom, mat)
    group.add(line)
    activeReplay = replay
    activeGeom = geom
    activeLine = line
  }

  return {
    group,
    setReplay,
    setVisible(value) {
      group.visible = value
    },
    dispose() {
      clearActive()
      mat.dispose()
    },
  }
}

// Rain particle layer. A pool of short line segments raining down inside a
// box that follows the player car each frame, so the player always sees a
// steady downpour regardless of where they are on the track. The layer is
// hidden by default; the rAF loop flips visibility when the active weather
// preset is 'rainy' and feeds the per-frame tick (dt + follow point) so the
// streaks fall and wrap.
//
// Implementation notes:
//
//  - One `LineSegments` mesh with two vertices per particle (start at the
//    particle's position, end one streak-length above). LineBasicMaterial's
//    `linewidth` is ignored by most WebGL backends so streaks are 1px; this
//    is fine because there are hundreds of them and the eye reads density.
//  - The follow point is the camera (computed by the rAF loop). Using the
//    camera (not the car) means the player always sees a full box even when
//    looking sideways.
//  - Vertex positions are written in world space so the underlying `Group`
//    stays at the origin; the per-frame cost is one Float32Array fill plus
//    one `needsUpdate = true` flip.
export interface RainLayer {
  group: Group
  // Advance every particle by `dtSec` seconds and write the resulting world
  // positions into the shared geometry buffer using the supplied follow
  // point. Cheap per frame: no allocations, no branch misses on the common
  // visible path.
  tick: (dtSec: number, followX: number, followY: number, followZ: number) => void
  // Toggle the layer on or off. When off the per-frame `tick` calls are
  // skipped entirely by the caller (via a poll-and-set in the rAF loop) so
  // the cost is exactly the cost of having no rain at all.
  setVisible: (value: boolean) => void
  // Reset particle positions back to the spawn distribution. Called when
  // the player restarts a race so the rain volume does not carry over an
  // unwrapped tail of streaks from the previous lap. Pure: no allocations.
  reset: () => void
  dispose: () => void
}

export function buildRainLayer(
  particleCount: number = DEFAULT_RAIN_PARTICLES,
): RainLayer {
  const group = new Group()
  group.visible = false

  // Stable RNG so two players who happen to run the same seed see the same
  // initial spawn pattern. The seed is arbitrary; the visible variety comes
  // from the wrap-on-floor-impact branch using `Math.random` at runtime.
  const rng = makeRainRng(0xc0ffee)
  const particles: RainParticle[] = initRainParticles(
    particleCount,
    rng,
    DEFAULT_RAIN_CONFIG,
  )

  const positions = new Float32Array(particleCount * 6)
  const geom = new BufferGeometry()
  const posAttr = new BufferAttribute(positions, 3)
  // Mark dynamic so Three.js uses the streaming path on each frame's
  // `needsUpdate = true` flip (gl.bufferSubData under the hood).
  posAttr.setUsage(DynamicDrawUsage)
  geom.setAttribute('position', posAttr)

  const mat = new LineBasicMaterial({
    color: RAIN_COLOR_HEX,
    transparent: true,
    opacity: RAIN_OPACITY,
    depthWrite: false,
  })
  const lines = new LineSegments(geom, mat)
  group.add(lines)

  // Re-use the same RNG for both spawn and wrap-on-impact so unit tests can
  // pin behavior without monkey-patching Math.random. The seed above has
  // already been advanced by `initRainParticles` above; subsequent reads
  // give a different sequence to keep the wraps from looking aligned.

  function tick(
    dtSec: number,
    followX: number,
    followY: number,
    followZ: number,
  ) {
    if (!group.visible) return
    tickRainParticles(particles, dtSec, rng, DEFAULT_RAIN_CONFIG)
    writeRainGeometry(
      particles,
      followX,
      followY,
      followZ,
      DEFAULT_RAIN_CONFIG.streakLength,
      positions,
    )
    posAttr.needsUpdate = true
  }

  function reset() {
    const fresh = initRainParticles(
      particles.length,
      makeRainRng(0xc0ffee),
      DEFAULT_RAIN_CONFIG,
    )
    for (let i = 0; i < particles.length; i++) {
      particles[i].ox = fresh[i].ox
      particles[i].oy = fresh[i].oy
      particles[i].oz = fresh[i].oz
    }
  }

  return {
    group,
    tick,
    setVisible(value) {
      group.visible = value
    },
    reset,
    dispose() {
      geom.dispose()
      mat.dispose()
    },
  }
}

// Snow particle layer. A pool of soft white points falling inside a box that
// follows the player car each frame, so the player always sees a steady
// flurry regardless of where they are on the track. The layer is hidden by
// default; the rAF loop flips visibility when the active weather preset is
// 'snowy' and feeds the per-frame tick (dt + nowSec + follow point) so the
// flakes drift, sway, and wrap.
//
// Implementation notes:
//
//  - One `Points` mesh with one vertex per particle. Cheap to render: a
//    single draw call for the whole flurry. PointsMaterial honors
//    `sizeAttenuation` so distant flakes shrink naturally.
//  - The follow point is the camera (computed by the rAF loop). Using the
//    camera (not the car) means the player always sees a full box even when
//    looking sideways.
//  - The point material uses a procedurally-generated alpha-feathered sprite
//    so each flake reads as a soft round dot instead of the default 1px
//    square; no asset needed.
//  - Vertex positions are written in world space so the underlying `Group`
//    stays at the origin; the per-frame cost is one Float32Array fill plus
//    one `needsUpdate = true` flip.
export interface SnowLayer {
  group: Group
  // Advance every particle by `dtSec` seconds, then write the resulting world
  // positions (with sway evaluated at `nowSec`) into the shared geometry
  // buffer using the supplied follow point. Cheap per frame: no allocations,
  // no branch misses on the common visible path.
  tick: (
    dtSec: number,
    nowSec: number,
    followX: number,
    followY: number,
    followZ: number,
  ) => void
  // Toggle the layer on or off. When off the per-frame `tick` calls are
  // skipped entirely by the caller (via a poll-and-set in the rAF loop) so
  // the cost is exactly the cost of having no snow at all.
  setVisible: (value: boolean) => void
  // Reset particle positions back to the spawn distribution. Called when the
  // player restarts a race so the flurry does not carry over an unwrapped
  // tail of flakes from the previous lap. Pure: no allocations.
  reset: () => void
  dispose: () => void
}

export function buildSnowLayer(
  particleCount: number = DEFAULT_SNOW_PARTICLES,
): SnowLayer {
  const group = new Group()
  group.visible = false

  // Stable RNG so two players who happen to run the same seed see the same
  // initial spawn pattern. The seed is arbitrary; the visible variety comes
  // from the wrap-on-floor-impact branch using fresh RNG draws at runtime.
  const rng = makeSnowRng(0xfeed5)
  const particles: SnowParticle[] = initSnowParticles(
    particleCount,
    rng,
    DEFAULT_SNOW_CONFIG,
  )

  const positions = new Float32Array(particleCount * 3)
  const geom = new BufferGeometry()
  const posAttr = new BufferAttribute(positions, 3)
  // Mark dynamic so Three.js uses the streaming path on each frame's
  // `needsUpdate = true` flip (gl.bufferSubData under the hood).
  posAttr.setUsage(DynamicDrawUsage)
  geom.setAttribute('position', posAttr)

  // Procedural alpha-feathered sprite so each Point reads as a soft round
  // flake. 32x32 pixels is plenty for a tiny dot and ships zero binary
  // assets. NearestFilter keeps the alpha edge crisp at the small render
  // sizes typical of distant flakes.
  const SPRITE_SIZE = 32
  const spritePixels = buildSnowflakeSprite(SPRITE_SIZE)
  const spriteTex = new DataTexture(
    spritePixels,
    SPRITE_SIZE,
    SPRITE_SIZE,
    RGBAFormat,
    UnsignedByteType,
  )
  spriteTex.magFilter = NearestFilter
  spriteTex.minFilter = NearestFilter
  spriteTex.needsUpdate = true

  const mat = new PointsMaterial({
    color: SNOW_COLOR_HEX,
    map: spriteTex,
    size: SNOW_POINT_SIZE,
    sizeAttenuation: true,
    transparent: true,
    opacity: SNOW_OPACITY,
    depthWrite: false,
    // Additive blending makes the flakes glow softly against dark asphalt
    // without turning into bright squares against the lighter overcast sky.
    blending: AdditiveBlending,
  })
  const points = new Points(geom, mat)
  group.add(points)

  function tick(
    dtSec: number,
    nowSec: number,
    followX: number,
    followY: number,
    followZ: number,
  ) {
    if (!group.visible) return
    tickSnowParticles(particles, dtSec, nowSec, rng, DEFAULT_SNOW_CONFIG)
    writeSnowGeometry(
      particles,
      followX,
      followY,
      followZ,
      nowSec,
      positions,
      DEFAULT_SNOW_CONFIG,
    )
    posAttr.needsUpdate = true
  }

  function reset() {
    const fresh = initSnowParticles(
      particles.length,
      makeSnowRng(0xfeed5),
      DEFAULT_SNOW_CONFIG,
    )
    for (let i = 0; i < particles.length; i++) {
      particles[i].ox = fresh[i].ox
      particles[i].oy = fresh[i].oy
      particles[i].oz = fresh[i].oz
      particles[i].phase = fresh[i].phase
      particles[i].freqScale = fresh[i].freqScale
    }
  }

  return {
    group,
    tick,
    setVisible(value) {
      group.visible = value
    },
    reset,
    dispose() {
      geom.dispose()
      mat.dispose()
      spriteTex.dispose()
    },
  }
}

// Ghost variant of the player car: same GLB clone, but every material is
// swapped for a translucent cyan tint so it reads as a recording rather than
// another vehicle. Returned `dispose` releases the override material.
export function buildGhostCar(): { ghost: Group; dispose: () => void } {
  const ghostMat = new MeshStandardMaterial({
    color: 0x66e3ff,
    emissive: 0x114a55,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
  })
  const { car, cancel } = buildCarFrame((clone) => {
    clone.traverse((obj) => {
      const mesh = obj as Mesh
      if (mesh.isMesh) mesh.material = ghostMat
    })
  })
  return {
    ghost: car,
    dispose: () => {
      cancel()
      ghostMat.dispose()
    },
  }
}

// Floating "WHO + TIME" nameplate that hovers above the ghost car. Uses a
// CanvasTexture-backed Sprite so the plate always faces the camera without
// any per-frame billboard math, and so the renderer pays the cost of one
// canvas redraw + GPU upload only when the meta tuple actually changes
// (a one-time cost when the player picks a different ghost source, or when
// they finish a fresh PB lap that swaps the active ghost).
//
// `apply(meta, source)` rebuilds the texture only on a cache-key change.
// Passing `meta = null` hides the sprite without disposing it so a quick
// flip back (or the next race load) does not pay the rebuild cost again.
//
// Caller (RaceCanvas.tsx) attaches the returned `group` as a child of the
// ghost car group so the plate inherits the ghost's world position; the
// plate sits `NAMEPLATE_Y_OFFSET` units above the ghost origin.
export interface GhostNameplate {
  group: Group
  apply: (meta: GhostMeta | null, source: GhostSource) => void
  setOpacity: (value: number) => void
  setVisible: (value: boolean) => void
  dispose: () => void
}

export function buildGhostNameplate(): GhostNameplate {
  const group = new Group()
  group.position.set(0, NAMEPLATE_Y_OFFSET, 0)
  group.visible = false

  // Detect SSR / no-canvas environments (Vitest's jsdom does not implement
  // 2D canvas). When unavailable we keep the plate hidden and skip every
  // draw; the rest of the renderer still wires up cleanly.
  const hasCanvas =
    typeof document !== 'undefined' &&
    typeof document.createElement === 'function'

  let canvas: HTMLCanvasElement | null = null
  let ctx: CanvasRenderingContext2D | null = null
  let texture: CanvasTexture | null = null
  let material: SpriteMaterial | null = null
  let sprite: Sprite | null = null
  let lastKey: string | null = null

  function ensureSprite() {
    if (sprite || !hasCanvas) return
    canvas = document.createElement('canvas')
    canvas.width = NAMEPLATE_TEXTURE_WIDTH
    canvas.height = NAMEPLATE_TEXTURE_HEIGHT
    ctx = canvas.getContext('2d')
    if (!ctx) {
      canvas = null
      return
    }
    texture = new CanvasTexture(canvas)
    // Sprite material with a transparent texture so the rounded plate
    // corners stay alpha-cut against the sky / track. depthTest stays on
    // so the plate occludes correctly behind / in front of scenery.
    material = new SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
    })
    sprite = new Sprite(material)
    sprite.scale.set(NAMEPLATE_SPRITE_WIDTH, NAMEPLATE_SPRITE_HEIGHT, 1)
    group.add(sprite)
  }

  function drawPlate(meta: GhostMeta, source: GhostSource) {
    if (!ctx) return
    const w = NAMEPLATE_TEXTURE_WIDTH
    const h = NAMEPLATE_TEXTURE_HEIGHT
    ctx.clearRect(0, 0, w, h)

    // Rounded-rectangle background (manual corner arcs so jsdom-friendly).
    const r = 18
    ctx.fillStyle = NAMEPLATE_BG_HEX
    ctx.beginPath()
    ctx.moveTo(r, 0)
    ctx.lineTo(w - r, 0)
    ctx.quadraticCurveTo(w, 0, w, r)
    ctx.lineTo(w, h - r)
    ctx.quadraticCurveTo(w, h, w - r, h)
    ctx.lineTo(r, h)
    ctx.quadraticCurveTo(0, h, 0, h - r)
    ctx.lineTo(0, r)
    ctx.quadraticCurveTo(0, 0, r, 0)
    ctx.closePath()
    ctx.fill()

    ctx.strokeStyle = NAMEPLATE_BORDER_HEX
    ctx.lineWidth = 4
    ctx.stroke()

    // Source tag (small, top): "GHOST" / "TOP" / "PB" / "LAST".
    ctx.fillStyle = NAMEPLATE_TAG_HEX
    ctx.font = 'bold 22px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(NAMEPLATE_SOURCE_TAGS[source], w / 2, 24)

    // Initials (big, middle): the player's 3-letter tag.
    ctx.fillStyle = NAMEPLATE_TEXT_HEX
    ctx.font = 'bold 44px sans-serif'
    ctx.fillText(formatNameplateInitials(meta.initials), w / 2, 64)

    // Lap time (small, bottom): formatted m:ss.mmm.
    ctx.fillStyle = NAMEPLATE_TEXT_HEX
    ctx.font = '24px monospace'
    ctx.fillText(formatNameplateLapTime(meta.lapTimeMs), w / 2, 104)
  }

  function apply(meta: GhostMeta | null, source: GhostSource) {
    if (meta === null) {
      group.visible = false
      lastKey = null
      return
    }
    const key = nameplateCacheKey(meta, source)
    if (key === lastKey && sprite) {
      group.visible = true
      return
    }
    ensureSprite()
    if (!ctx || !texture) {
      // Canvas-less environment (jsdom). Stay hidden so we never reference
      // a half-initialized sprite.
      group.visible = false
      return
    }
    drawPlate(meta, source)
    texture.needsUpdate = true
    group.visible = true
    lastKey = key
  }

  function setVisible(value: boolean) {
    if (!value) {
      group.visible = false
      return
    }
    if (sprite) group.visible = true
  }

  function setOpacity(value: number) {
    if (!material) return
    material.opacity = Math.max(0, Math.min(1, value))
  }

  function dispose() {
    if (texture) texture.dispose()
    if (material) material.dispose()
    sprite = null
    canvas = null
    ctx = null
    texture = null
    material = null
  }

  return { group, apply, setOpacity, setVisible, dispose }
}

export function buildScene(path: TrackPath): SceneBundle {
  const scene = new Scene()
  // Lighting preset is applied through `setTimeOfDay` below, which mutates the
  // sky color, ambient/sun lights, and ground material in place. Initialize
  // with a placeholder; the immediate setTimeOfDay call seeds noon so the
  // first frame matches legacy.
  const skyBackground = new Color(0x000000)
  scene.background = skyBackground

  const ambient = new AmbientLight(0xffffff, 0.55)
  scene.add(ambient)
  const sun = new DirectionalLight(0xffffff, 0.9)
  sun.position.set(80, 160, 60)
  scene.add(sun)

  // Exponential fog. Starts at zero density (preset 'clear' is a no-op) so the
  // legacy scene matches exactly. Color is updated in-place by `setWeather`.
  const fog = new FogExp2(0xffffff, 0)
  scene.fog = fog

  const trackMat = new MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.9 })
  for (const op of path.order) {
    const mesh = new Mesh(pieceGeometry(op), trackMat)
    mesh.position.y = 0.01
    scene.add(mesh)
  }

  const center = trackCenter(path)
  const groundMat = new MeshStandardMaterial({ color: 0x6fb26f, roughness: 1.0 })
  const ground = new Mesh(new PlaneGeometry(800, 800), groundMat)
  ground.rotation.x = -Math.PI / 2
  ground.position.set(center.x, -0.02, center.z)
  scene.add(ground)

  // Track the active time-of-day and weather names so each setter can
  // recompute the combined effect (sky tint, ambient / sun multipliers) from
  // the latest pair without recomputing the lighting preset twice. Both
  // setters short-circuit on a no-op via the rAF poll-and-set callers.
  let activeTimeOfDay: TimeOfDay = DEFAULT_TIME_OF_DAY
  let activeWeather: Weather = DEFAULT_WEATHER

  // Combined apply: read both presets and write the final color / intensity
  // values into the existing lights, sky, and fog. Splitting time-of-day and
  // weather setters out front keeps the public API tidy; both call this
  // helper internally so the math lives in one place.
  function applyTimeAndWeather() {
    const lighting = getLightingPreset(activeTimeOfDay)
    const weather = getWeatherPreset(activeWeather)
    // Sky: time-of-day picks the base color, weather mixes it toward the fog
    // color so the horizon blends instead of showing a hard cutoff.
    skyBackground.setHex(
      mixColorHex(lighting.skyColor, weather.fogColor, weather.skyTintMix),
    )
    groundMat.color.setHex(lighting.groundColor)
    // Lights: time-of-day picks the color and base intensity; weather scales
    // the intensity (overcast skies have no harsh shadows, ambient lifts to
    // keep the road readable).
    ambient.color.setHex(lighting.ambientColor)
    ambient.intensity = lighting.ambientIntensity * weather.ambientMultiplier
    sun.color.setHex(lighting.sunColor)
    sun.intensity = lighting.sunIntensity * weather.sunMultiplier
    sun.position.set(
      lighting.sunDirection.x * SUN_DISTANCE,
      lighting.sunDirection.y * SUN_DISTANCE,
      lighting.sunDirection.z * SUN_DISTANCE,
    )
    // Fog: weather picks density and color. Density 0 makes FogExp2 a no-op
    // so 'clear' costs nothing per frame.
    fog.density = weather.fogDensity
    fog.color.setHex(weather.fogColor)
    // Rain layer: only visible under the 'rainy' preset. Built later in this
    // function so the closure resolves it via a holder ref. Flipping the
    // group's `visible` flag is O(1); the rAF loop short-circuits the per-
    // frame tick when the layer is hidden so dry weather costs nothing.
    if (rainLayerHolder.layer) {
      rainLayerHolder.layer.setVisible(activeWeather === 'rainy')
    }
    // Snow layer: same lifecycle as rain, only visible under the 'snowy'
    // preset. Same poll-and-set pattern in the rAF loop short-circuits the
    // tick when hidden so non-snow weather costs nothing.
    if (snowLayerHolder.layer) {
      snowLayerHolder.layer.setVisible(activeWeather === 'snowy')
    }
  }

  // Holder so `applyTimeAndWeather` can flip the rain layer's visibility
  // even though the layer is constructed after this function is defined.
  // Populated below once `buildRainLayer` returns.
  const rainLayerHolder: { layer: RainLayer | null } = { layer: null }
  // Same holder pattern for the snow layer.
  const snowLayerHolder: { layer: SnowLayer | null } = { layer: null }

  function setTimeOfDay(name: TimeOfDay) {
    activeTimeOfDay = name
    applyTimeAndWeather()
  }

  function setWeather(name: Weather) {
    activeWeather = name
    applyTimeAndWeather()
  }
  // Seed with the defaults so the first paint matches the legacy hardcoded
  // scene exactly. The renderer's poll-and-set will overwrite with whatever
  // the player's stored preferences are on the next frame.
  applyTimeAndWeather()

  // Checkered start / finish stripe. Uses a procedurally-generated DataTexture
  // so we don't ship a binary asset and the unit tests can pin the exact
  // pixel layout. NearestFilter keeps the squares crisp regardless of camera
  // distance.
  const checker = buildCheckerTexturePixels(
    FINISH_STRIPE_CHECK_COLUMNS,
    FINISH_STRIPE_CHECK_ROWS,
    FINISH_TEXTURE_PIXELS_PER_SQUARE,
  )
  const checkerTexture = new DataTexture(
    checker.pixels,
    checker.width,
    checker.height,
    RGBAFormat,
    UnsignedByteType,
  )
  checkerTexture.magFilter = NearestFilter
  checkerTexture.minFilter = NearestFilter
  checkerTexture.needsUpdate = true
  const stripeGeom = new PlaneGeometry(TRACK_WIDTH, FINISH_STRIPE_DEPTH)
  const stripeMat = new MeshStandardMaterial({
    map: checkerTexture,
    roughness: 0.85,
  })
  const stripe = new Mesh(stripeGeom, stripeMat)
  stripe.rotation.x = -Math.PI / 2
  stripe.rotation.z = path.finishLine.heading - Math.PI / 2
  stripe.position.set(path.finishLine.position.x, 0.02, path.finishLine.position.z)
  scene.add(stripe)

  // Overhead gate: two side poles plus a horizontal banner spanning between
  // them. The banner reuses the same checkered texture so the gate reads as a
  // single coherent finish-line landmark from any approach angle.
  const polePositions = computeGatePolePositions(
    path.finishLine.position.x,
    path.finishLine.position.z,
    path.finishLine.heading,
    TRACK_WIDTH / 2,
    FINISH_GATE_POLE_INSET,
  )
  const poleMat = new MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.6 })
  const poleGeom = new BoxGeometry(
    FINISH_GATE_POLE_THICKNESS,
    FINISH_GATE_POLE_HEIGHT,
    FINISH_GATE_POLE_THICKNESS,
  )
  for (const p of [polePositions.left, polePositions.right]) {
    const pole = new Mesh(poleGeom, poleMat)
    pole.position.set(p.x, FINISH_GATE_POLE_HEIGHT / 2, p.z)
    scene.add(pole)
  }

  // Banner: oriented so its long axis spans pole-to-pole and its face turns
  // toward the approaching driver. Width = pole separation + a little extra
  // overhang on each side. Height matches FINISH_GATE_BANNER_HEIGHT. Depth
  // is the banner's thickness (along travel direction) so the back face is
  // visible to the driver who has already passed the gate.
  const bannerSpan = gatePoleSeparation(polePositions) + FINISH_GATE_BANNER_OVERHANG * 2
  const bannerGeom = new BoxGeometry(
    bannerSpan,
    FINISH_GATE_BANNER_HEIGHT,
    FINISH_GATE_BANNER_DEPTH,
  )
  const bannerCheckerTexture = checkerTexture.clone() as Texture
  bannerCheckerTexture.needsUpdate = true
  const bannerMat = new MeshStandardMaterial({
    map: bannerCheckerTexture,
    roughness: 0.7,
  })
  const banner = new Mesh(bannerGeom, bannerMat)
  banner.position.set(
    path.finishLine.position.x,
    FINISH_GATE_POLE_HEIGHT - FINISH_GATE_BANNER_HEIGHT / 2,
    path.finishLine.position.z,
  )
  // Default banner long-axis is +X. Rotate around +Y so it spans from one
  // pole to the other. Heading 0 means travel along +X (poles on +/- Z), so
  // the banner needs to turn 90 degrees from default to span Z. The general
  // formula is `heading + PI/2` (perpendicular to travel).
  banner.rotation.y = path.finishLine.heading + Math.PI / 2
  scene.add(banner)

  const {
    car,
    setPaint: setCarPaint,
    setRacingNumber,
    setHeadlights,
    setBrakeLights,
    cancel: cancelCar,
  } = buildCar()
  scene.add(car)

  const skidMarks = buildSkidMarkLayer()
  scene.add(skidMarks.group)

  const tireSmoke = buildTireSmokeLayer()
  scene.add(tireSmoke.group)

  const kerbs = buildKerbLayer(path)
  scene.add(kerbs.group)

  const scenery = buildSceneryLayer(path)
  scene.add(scenery.group)

  const racingLine = buildRacingLineLayer()
  scene.add(racingLine.group)

  const rain = buildRainLayer()
  rainLayerHolder.layer = rain
  scene.add(rain.group)
  const snow = buildSnowLayer()
  snowLayerHolder.layer = snow
  scene.add(snow.group)
  // Re-apply so the rain and snow visibility reflects whatever weather was
  // seeded before the layers existed. Cheap; just two boolean flips plus the
  // existing weather/sky math.
  applyTimeAndWeather()

  const camera = new PerspectiveCamera(70, 1, 0.1, 2000)
  camera.position.set(0, 10, 20)

  const dispose = () => {
    cancelCar()
    // The skid mark and tire smoke layers' materials and shared geometry
    // (or sprite texture) are picked up by the traversal below (each group
    // sits inside `scene` and dedupes the shared resources through `Set`
    // semantics on dispose). Calling `skidMarks.dispose()` or
    // `tireSmoke.dispose()` here would double-dispose the same resources.
    const mats = new Set<Material>()
    const geoms = new Set<BufferGeometry>()
    scene.traverse((obj) => {
      const mesh = obj as Mesh
      if (mesh.geometry) geoms.add(mesh.geometry)
      const mat = mesh.material
      if (Array.isArray(mat)) mat.forEach((m) => mats.add(m))
      else if (mat) mats.add(mat)
    })
    geoms.forEach((g) => g.dispose())
    mats.forEach((m) => m.dispose())
    // Procedural finish-line textures live on materials picked up by the
    // traversal but the traversal does not free GPU texture memory.
    checkerTexture.dispose()
    bannerCheckerTexture.dispose()
    // Tire smoke owns a procedurally-generated puff texture shared across
    // every sprite in its pool; the traversal frees the SpriteMaterials but
    // not the bound texture, so the layer's own dispose handles that.
    tireSmoke.dispose()
  }

  return {
    scene,
    camera,
    car,
    setCarPaint,
    setRacingNumber,
    setHeadlights,
    setBrakeLights,
    setTimeOfDay,
    setWeather,
    skidMarks,
    tireSmoke,
    kerbs,
    scenery,
    racingLine,
    rain,
    snow,
    dispose,
  }
}

export interface CameraRigParams {
  height: number
  distance: number
  lookAhead: number
  positionLerp: number
  targetLerp: number
  // Optional local camera X offset in car-forward units. Negative values are
  // chase views behind the car; positive values support cockpit, dash, hood,
  // and bumper presets. When omitted, derive from `-distance` for legacy
  // chase behavior.
  cameraForward?: number
  // Optional look target height. Defaults to the legacy center-body target.
  targetHeight?: number
  // Orientation uses quaternion slerp so camera rotation eases instead of
  // snapping directly to the latest look target. Defaults to `targetLerp`
  // for legacy callers.
  orientationLerp?: number
  // Vertical field of view in degrees. Optional so legacy callers that build
  // CameraRigParams ad-hoc keep working; the renderer reads it through the
  // ref each frame and only reapplies on change.
  fov?: number
}

export const DEFAULT_CAMERA_RIG: CameraRigParams = {
  height: 6,
  distance: 14,
  lookAhead: 6,
  positionLerp: 0.12,
  targetLerp: 0.2,
  fov: 70,
}

export interface CameraRigState {
  position: { x: number; y: number; z: number }
  target: { x: number; y: number; z: number }
  quaternion: Quaternion
}

const cameraLookHelper = new PerspectiveCamera()
const cameraLookPosition = new Vector3()
const cameraLookTarget = new Vector3()
const cameraLookQuaternion = new Quaternion()

function clampLerp(value: number): number {
  if (!Number.isFinite(value)) return 0
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

function quaternionForLookAt(
  position: { x: number; y: number; z: number },
  target: { x: number; y: number; z: number },
): Quaternion {
  cameraLookPosition.set(position.x, position.y, position.z)
  cameraLookTarget.set(target.x, target.y, target.z)
  cameraLookHelper.position.copy(cameraLookPosition)
  cameraLookHelper.lookAt(cameraLookTarget)
  return cameraLookQuaternion.copy(cameraLookHelper.quaternion)
}

export function initCameraRig(
  carX: number,
  carZ: number,
  heading: number,
  params: CameraRigParams = DEFAULT_CAMERA_RIG,
): CameraRigState {
  const cx = Math.cos(heading)
  const sz = -Math.sin(heading)
  const cameraForward = params.cameraForward ?? -params.distance
  const targetHeight = params.targetHeight ?? 1
  const rig = {
    position: {
      x: carX + cx * cameraForward,
      y: params.height,
      z: carZ + sz * cameraForward,
    },
    target: {
      x: carX + cx * params.lookAhead,
      y: targetHeight,
      z: carZ + sz * params.lookAhead,
    },
    quaternion: new Quaternion(),
  }
  rig.quaternion.copy(quaternionForLookAt(rig.position, rig.target))
  return rig
}

export function updateCameraRig(
  rig: CameraRigState,
  carX: number,
  carZ: number,
  heading: number,
  params: CameraRigParams = DEFAULT_CAMERA_RIG,
): void {
  const cx = Math.cos(heading)
  const sz = -Math.sin(heading)
  const cameraForward = params.cameraForward ?? -params.distance
  const targetHeight = params.targetHeight ?? 1
  const wantX = carX + cx * cameraForward
  const wantZ = carZ + sz * cameraForward
  const aheadX = carX + cx * params.lookAhead
  const aheadZ = carZ + sz * params.lookAhead

  rig.position.x += (wantX - rig.position.x) * params.positionLerp
  rig.position.y += (params.height - rig.position.y) * params.positionLerp
  rig.position.z += (wantZ - rig.position.z) * params.positionLerp
  rig.target.x += (aheadX - rig.target.x) * params.targetLerp
  rig.target.y += (targetHeight - rig.target.y) * params.targetLerp
  rig.target.z += (aheadZ - rig.target.z) * params.targetLerp

  const orientationLerp = clampLerp(params.orientationLerp ?? params.targetLerp)
  rig.quaternion.slerp(quaternionForLookAt(rig.position, rig.target), orientationLerp)
}

export function applyCameraRig(camera: PerspectiveCamera, rig: CameraRigState): void {
  camera.position.set(rig.position.x, rig.position.y, rig.position.z)
  camera.quaternion.copy(rig.quaternion)
}
