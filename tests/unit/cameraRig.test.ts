import { describe, expect, it } from 'vitest'
import { Object3D, PerspectiveCamera, Vector3 } from 'three'
import {
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
  const obj = new Object3D()
  obj.position.set(position.x, position.y, position.z)
  obj.lookAt(new Vector3(target.x, target.y, target.z))
  return obj.quaternion
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
})
