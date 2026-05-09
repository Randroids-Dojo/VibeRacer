// Smoothed third-person / cockpit chase camera. Pure state plus three
// imperative helpers (init, update, apply) so consumers can keep the rig in
// a ref and feed it into a three.js `PerspectiveCamera` each frame without
// pulling the rest of the scene builder.

import { PerspectiveCamera, Quaternion, Vector3 } from 'three'

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
