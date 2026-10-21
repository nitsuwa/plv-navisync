import { MOUSE, TOUCH } from "three";

export const STUDENT_3D_DRAG_THRESHOLD_PX = 7;

interface Student3dOrbitInputControls {
  mouseButtons: { LEFT: number; MIDDLE: number; RIGHT: number };
  touches: { ONE: number; TWO: number };
}

export interface Student3dCameraTargetBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

export type Student3dCameraGesture = "pan" | "orbit" | "zoom" | "none";

export interface Student3dTouchPoint {
  x: number;
  y: number;
}

export interface Student3dTouchGestureMotion {
  centroidDistance: number;
  pinchDistance: number;
}

export interface Student3dCameraAxes {
  x?: boolean;
  y?: boolean;
  z?: boolean;
}

interface Student3dCameraControlsWithTarget {
  target: { x: number; y: number; z: number };
  object: { position: { x: number; y: number; z: number } };
  update?: () => void;
}

/** Keep mouse gestures predictable in every viewport, including DevTools' mobile emulation. */
export function configureStudent3dInputMappings(controls: Student3dOrbitInputControls): void {
  Object.assign(controls.mouseButtons, {
    LEFT: MOUSE.PAN,
    MIDDLE: MOUSE.DOLLY,
    RIGHT: MOUSE.ROTATE,
  });
  Object.assign(controls.touches, {
    ONE: TOUCH.ROTATE,
    TWO: TOUCH.DOLLY_PAN,
  });
}

/** A purposeful camera drag may temporarily detach Follow after crossing its movement threshold. */
export function shouldPauseFollowForManualCameraGesture(followMode: boolean, crossedThreshold: boolean): boolean {
  return followMode && crossedThreshold;
}

/** Ignore the browser menu only when a right-button drag was consumed as camera rotation. */
export function shouldPreventStudent3dContextMenu(button: number, rightButtonDrag: boolean): boolean {
  return button === 2 && rightButtonDrag;
}

/** Keep orbit/pan targets inside the authored view volume without changing camera distance. */
export function clampStudent3dCameraTarget(
  controls: Student3dCameraControlsWithTarget,
  bounds: Student3dCameraTargetBounds,
): boolean {
  const { target, object } = controls;
  const nextX = Math.max(bounds.minX, Math.min(bounds.maxX, target.x));
  const nextY = Math.max(bounds.minY, Math.min(bounds.maxY, target.y));
  const nextZ = Math.max(bounds.minZ, Math.min(bounds.maxZ, target.z));
  const dx = nextX - target.x;
  const dy = nextY - target.y;
  const dz = nextZ - target.z;
  if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) < 1e-6) return false;
  target.x = nextX;
  target.y = nextY;
  target.z = nextZ;
  object.position.x += dx;
  object.position.y += dy;
  object.position.z += dz;
  controls.update?.();
  return true;
}

export function crossedStudent3dDragThreshold(
  start: { x: number; y: number },
  current: { x: number; y: number },
  threshold = STUDENT_3D_DRAG_THRESHOLD_PX,
): boolean {
  return Math.hypot(current.x - start.x, current.y - start.y) >= threshold;
}

/**
 * Classify camera input by the actual pointer gesture, never by viewport size.
 * Follow pauses only for a deliberate pan; orbit and zoom leave playback live.
 */
export function student3dCameraGesture(input: {
  pointerType: string;
  button: number;
  pointerCount: number;
  movement: number;
  pinchMovement?: number;
  threshold?: number;
}): Student3dCameraGesture {
  const threshold = input.threshold ?? STUDENT_3D_DRAG_THRESHOLD_PX;
  if (input.pointerType === "touch") {
    if (input.pointerCount >= 2) {
      // A pinch may also move its centroid. Treat the combined gesture as zoom
      // so it never pauses Follow as an accidental pan.
      if ((input.pinchMovement ?? 0) >= threshold) return "zoom";
      if (!Number.isFinite(input.movement) || input.movement < threshold) return "none";
      return "pan";
    }
    if (!Number.isFinite(input.movement) || input.movement < threshold) return "none";
    return input.pointerCount === 1 ? "orbit" : "none";
  }

  if (!Number.isFinite(input.movement) || input.movement < threshold) return "none";

  if (input.button === 0) return "pan";
  if (input.button === 1) return "zoom";
  if (input.button === 2) return "orbit";
  return "none";
}

/** Measure a two-finger touch gesture from its initial pair to the current pair. */
export function student3dTouchGestureMotion(
  start: readonly [Student3dTouchPoint, Student3dTouchPoint],
  current: readonly [Student3dTouchPoint, Student3dTouchPoint],
): Student3dTouchGestureMotion {
  const startCentroid = { x: (start[0].x + start[1].x) / 2, y: (start[0].y + start[1].y) / 2 };
  const currentCentroid = { x: (current[0].x + current[1].x) / 2, y: (current[0].y + current[1].y) / 2 };
  const startDistance = Math.hypot(start[1].x - start[0].x, start[1].y - start[0].y);
  const currentDistance = Math.hypot(current[1].x - current[0].x, current[1].y - current[0].y);
  return {
    centroidDistance: Math.hypot(currentCentroid.x - startCentroid.x, currentCentroid.y - startCentroid.y),
    pinchDistance: Math.abs(currentDistance - startDistance),
  };
}

/** Move a Follow target smoothly while translating the camera by the same delta. */
export function translateStudent3dFollowCamera(
  cameraPosition: { x: number; y: number; z: number },
  target: { x: number; y: number; z: number },
  nextTarget: { x: number; y: number; z: number },
  amount: number,
  axes: Student3dCameraAxes = {},
): void {
  const alpha = Math.max(0, Math.min(1, amount));
  const dx = axes.x === false ? 0 : (nextTarget.x - target.x) * alpha;
  const dy = axes.y === false ? 0 : (nextTarget.y - target.y) * alpha;
  const dz = axes.z === false ? 0 : (nextTarget.z - target.z) * alpha;
  target.x += dx;
  target.y += dy;
  target.z += dz;
  cameraPosition.x += dx;
  cameraPosition.y += dy;
  cameraPosition.z += dz;
}
