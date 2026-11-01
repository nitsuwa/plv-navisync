/** Serializable camera position and look target for preserving a 3D map view. */
export interface Student3dCameraPose {
  position: [number, number, number];
  target: [number, number, number];
}

export interface Student3dCameraPoseRestoreRequest {
  nonce: number;
  contextKey: string;
  pose: Student3dCameraPose;
}

export type Student3dCameraOffset = [number, number, number];

/** Reorient attached Follow only after the route heading changes materially. */
export function student3dFollowCameraOrientationChanged(
  current: { x: number; y: number; z: number } | null | undefined,
  desired: { x: number; y: number; z: number },
  minimumDirectionDot = 0.985,
): boolean {
  if (!current) return true;
  const currentLength = Math.hypot(current.x, current.y, current.z);
  const desiredLength = Math.hypot(desired.x, desired.y, desired.z);
  if (currentLength < 1e-4 || desiredLength < 1e-4) return true;
  const directionDot = (current.x * desired.x + current.y * desired.y + current.z * desired.z) / (currentLength * desiredLength);
  return directionDot < Math.max(-1, Math.min(1, minimumDirectionDot));
}

/** A saved pose belongs only to the campus or Floor that produced it. */
export function student3dCameraPoseRestoreForContext(
  request: Student3dCameraPoseRestoreRequest | null | undefined,
  contextKey: string,
  allowRestore = true,
): Student3dCameraPoseRestoreRequest | null {
  return allowRestore && request?.contextKey === contextKey ? request : null;
}

/** Ignore completion from an old or unrelated renderer context. */
export function student3dCameraPoseRestoreCompletionMatches(
  request: Student3dCameraPoseRestoreRequest | null | undefined,
  nonce: number,
  contextKey: string,
): boolean {
  return Boolean(request && request.nonce === nonce && request.contextKey === contextKey);
}

/** Keep the live orbit when one route changes render context without resizing
 * its canvas. Floor-local waypoint arrays and viewport offsets may change at
 * an authored handoff; they do not identify a different route. */
export function shouldPreserveStudent3dFollowCameraOffset(input: {
  attachedFollow: boolean;
  sameRoute: boolean;
  sameViewportSize: boolean;
}): boolean {
  return input.attachedFollow && input.sameRoute && input.sameViewportSize;
}

/** Camera-to-target offset is the renderer-independent part of a Follow pose. */
export function student3dCameraOffsetFromPose(pose: Student3dCameraPose): Student3dCameraOffset {
  return [
    pose.position[0] - pose.target[0],
    pose.position[1] - pose.target[1],
    pose.position[2] - pose.target[2],
  ];
}

/** Rebase an orbit offset on a new canonical marker without changing its view. */
export function student3dCameraPoseAtTarget(
  offset: Student3dCameraOffset,
  target: [number, number, number],
): Student3dCameraPose {
  return {
    position: [target[0] + offset[0], target[1] + offset[1], target[2] + offset[2]],
    target: [...target],
  };
}

/** Keep a remembered Follow distance inside the active renderer's own limits. */
export function clampStudent3dCameraOffset(
  offset: Student3dCameraOffset,
  minDistance: number,
  maxDistance: number,
): Student3dCameraOffset {
  const safeMin = Math.max(0.1, Number.isFinite(minDistance) ? minDistance : 4);
  const safeMax = Math.max(safeMin, Number.isFinite(maxDistance) ? maxDistance : safeMin);
  const components = offset.map((component) => Number.isFinite(component) ? component : 0) as Student3dCameraOffset;
  const distance = Math.hypot(...components);
  const nextDistance = Math.min(safeMax, Math.max(safeMin, distance));
  if (distance < 0.0001) return [0, nextDistance * 0.74, nextDistance * 0.673];
  const scale = nextDistance / distance;
  return [components[0] * scale, components[1] * scale, components[2] * scale];
}

/** Choose a route-context bookmark, a live same-context pose, or a local Follow default. */
export function student3dFollowCameraOffsetForRecovery(
  preferredOffset: Student3dCameraOffset | null | undefined,
  currentOffset: Student3dCameraOffset,
  defaultOffset: Student3dCameraOffset,
  minDistance: number,
  maxDistance: number,
  preserveCurrentOffset: boolean,
): Student3dCameraOffset {
  const selectedOffset = preferredOffset ?? (preserveCurrentOffset ? currentOffset : defaultOffset);
  return clampStudent3dCameraOffset(selectedOffset, minDistance, maxDistance);
}
