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

interface Student3dCameraControlsWithTarget {
  target: { x: number; y: number; z: number };
  object: { position: { x: number; y: number; z: number } };
  update?: () => void;
}

/** Keep mouse mappings enabled independently of viewport size or pointer media queries. */
export function configureStudent3dInputMappings(controls: Student3dOrbitInputControls): void {
  Object.assign(controls.mouseButtons, {
    LEFT: MOUSE.ROTATE,
    MIDDLE: MOUSE.PAN,
    RIGHT: MOUSE.PAN,
  });
  Object.assign(controls.touches, {
    ONE: TOUCH.ROTATE,
    TWO: TOUCH.DOLLY_PAN,
  });
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
