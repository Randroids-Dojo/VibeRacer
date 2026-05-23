// Pure camera math for the Destruction Lab's car-relative compass
// views. Each cardinal direction places the camera at the matching
// side of the car (N=front, S=back, E=right, W=left), level with
// the car body (no top-down pitch), looking at the car's center.
// The camera tracks the car as it drives, so the selected side
// always faces the camera even through turns.

export type CompassDir = 'N' | 'S' | 'E' | 'W'

// Distance from car center to camera, in metres. 6.5 m is wide
// enough to frame the ~4 m Kenney sedan with margin so the player
// can see hits on the corners and detached panels arcing out, but
// close enough that the body fills a sensible portion of the
// viewport on portrait phones.
export const CARDINAL_DISTANCE = 6.5

// Camera Y in metres. Slightly above the car's mid-body height so
// the roof reads as part of the silhouette rather than disappearing
// behind the body. Lower would feel "ground-level dog cam"; higher
// would lose the "level with the car" feel the user asked for.
export const CARDINAL_HEIGHT = 1.6

// World-space point the camera looks at. Aimed at the car's
// approximate mid-body height (a hair below the camera height) so
// the car silhouette sits near vertical center of the frame.
export const CARDINAL_LOOK_HEIGHT = 1.0

// The physics module's heading describes the integrator's
// "forward" as `(cos h, -sin h)`. The VISIBLE car nose ends up in
// the opposite direction because the asset loader wraps the GLB in
// an inner group rotated by CAR_MODEL_YAW_OFFSET (= PI/2) so the
// model's default -Z-facing nose aligns with the chase camera's
// behind-direction. Net result: visible forward in the world frame
// is `(-cos h, 0, sin h)`. The compass uses VISIBLE directions so N
// genuinely shows the front of the car you can see, regardless of
// the physics integrator's internal sign convention. Visible right
// is the visible forward rotated 90 deg CW around +Y.
export function cardinalCameraPose(
  view: CompassDir,
  carX: number,
  carZ: number,
  carHeading: number,
  distance: number = CARDINAL_DISTANCE,
  height: number = CARDINAL_HEIGHT,
): {
  position: { x: number; y: number; z: number }
  lookAt: { x: number; y: number; z: number }
} {
  const visFwdX = -Math.cos(carHeading)
  const visFwdZ = Math.sin(carHeading)
  const visRightX = -Math.sin(carHeading)
  const visRightZ = -Math.cos(carHeading)
  let camX = carX
  let camZ = carZ
  switch (view) {
    case 'N':
      // In front of the car, looking back at it. Player sees the
      // front bumper / hood / windshield coming toward them.
      camX = carX + visFwdX * distance
      camZ = carZ + visFwdZ * distance
      break
    case 'S':
      // Behind the car. Player sees the rear bumper / trunk.
      camX = carX - visFwdX * distance
      camZ = carZ - visFwdZ * distance
      break
    case 'E':
      // Off the car's right side. Player sees the passenger door.
      camX = carX + visRightX * distance
      camZ = carZ + visRightZ * distance
      break
    case 'W':
      // Off the car's left side. Player sees the driver's door.
      camX = carX - visRightX * distance
      camZ = carZ - visRightZ * distance
      break
  }
  return {
    position: { x: camX, y: height, z: camZ },
    lookAt: { x: carX, y: CARDINAL_LOOK_HEIGHT, z: carZ },
  }
}
