import { describe, expect, it } from 'vitest'
import { PerspectiveCamera, Vector3 } from 'three'
import {
  RACING_NUMBER_PLATE_HEIGHT_Y,
  RACING_NUMBER_PLATE_SIZE,
  applyCameraRig,
  initCameraRig,
  updateCameraRig,
  type CameraRigParams,
} from '@/game/sceneBuilder'

const baseParams: CameraRigParams = {
  height: 6,
  distance: 14,
  lookAhead: 6,
  positionLerp: 1,
  targetLerp: 1,
  orientationLerp: 1,
  fov: 70,
}

function lookQuaternion(
  position: { x: number; y: number; z: number },
  target: { x: number; y: number; z: number },
) {
  const camera = new PerspectiveCamera()
  camera.position.set(position.x, position.y, position.z)
  camera.lookAt(new Vector3(target.x, target.y, target.z))
  return camera.quaternion
}

function forwardDirection(camera: PerspectiveCamera): Vector3 {
  const direction = new Vector3()
  camera.getWorldDirection(direction)
  return direction
}

describe('camera rig orientation', () => {
  it('initializes its quaternion toward the initial target', () => {
    const rig = initCameraRig(0, 0, 0)
    const expected = lookQuaternion(rig.position, rig.target)

    expect(rig.quaternion.angleTo(expected)).toBeLessThan(0.000001)
  })

  it('slerps all the way to the new look quaternion at orientationLerp 1', () => {
    const rig = initCameraRig(0, 0, 0)
    updateCameraRig(rig, 0, 0, Math.PI / 2, baseParams)
    const expected = lookQuaternion(rig.position, rig.target)

    expect(rig.quaternion.angleTo(expected)).toBeLessThan(0.000001)
  })

  it('preserves the prior quaternion at orientationLerp 0', () => {
    const rig = initCameraRig(0, 0, 0)
    const before = rig.quaternion.clone()
    updateCameraRig(rig, 0, 0, Math.PI / 2, {
      ...baseParams,
      orientationLerp: 0,
    })

    expect(rig.quaternion.angleTo(before)).toBeLessThan(0.000001)
  })

  it('applyCameraRig copies position and quaternion onto a PerspectiveCamera', () => {
    const rig = initCameraRig(3, 4, Math.PI / 4)
    const camera = new PerspectiveCamera()

    applyCameraRig(camera, rig)

    expect(camera.position.x).toBeCloseTo(rig.position.x, 6)
    expect(camera.position.y).toBeCloseTo(rig.position.y, 6)
    expect(camera.position.z).toBeCloseTo(rig.position.z, 6)
    expect(camera.quaternion.angleTo(rig.quaternion)).toBeLessThan(0.000001)
  })

  it('applied camera points at the target and pitches downward', () => {
    const rig = initCameraRig(0, 0, 0)
    const camera = new PerspectiveCamera()
    applyCameraRig(camera, rig)

    const forward = forwardDirection(camera)
    const toTarget = new Vector3(
      rig.target.x - rig.position.x,
      rig.target.y - rig.position.y,
      rig.target.z - rig.position.z,
    ).normalize()

    expect(forward.dot(toTarget)).toBeGreaterThan(0.999999)
    expect(forward.y).toBeLessThan(0)
  })

  it('supports a forward-mounted camera preset', () => {
    const rig = initCameraRig(10, 20, 0, {
      ...baseParams,
      cameraForward: 3,
      targetHeight: 0.8,
    })

    expect(rig.position.x).toBeCloseTo(13, 6)
    expect(rig.position.z).toBeCloseTo(20, 6)
    expect(rig.target.x).toBeCloseTo(10 + baseParams.lookAhead, 6)
    expect(rig.target.y).toBeCloseTo(0.8, 6)
  })
})

describe('racing number sticker constants', () => {
  it('keeps the roof sticker compact enough to read as attached', () => {
    expect(RACING_NUMBER_PLATE_SIZE).toBeGreaterThan(0.8)
    expect(RACING_NUMBER_PLATE_SIZE).toBeLessThan(1.3)
  })

  it('keeps the roof sticker close to the car roof', () => {
    expect(RACING_NUMBER_PLATE_HEIGHT_Y).toBeGreaterThan(1.1)
    expect(RACING_NUMBER_PLATE_HEIGHT_Y).toBeLessThan(1.4)
  })
})
