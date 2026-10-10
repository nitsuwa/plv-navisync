import { MOUSE, TOUCH } from "three";

export const STUDENT_3D_DRAG_THRESHOLD_PX = 7;

interface Student3dOrbitInputControls {
  mouseButtons: { LEFT: number; MIDDLE: number; RIGHT: number };
  touches: { ONE: number; TWO: number };
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

export function crossedStudent3dDragThreshold(
  start: { x: number; y: number },
  current: { x: number; y: number },
  threshold = STUDENT_3D_DRAG_THRESHOLD_PX,
): boolean {
  return Math.hypot(current.x - start.x, current.y - start.y) >= threshold;
}
