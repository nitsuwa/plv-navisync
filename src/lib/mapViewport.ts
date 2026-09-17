export const STUDENT_MAP_MIN_ZOOM = 0.75;
export const STUDENT_MAP_MAX_ZOOM = 3.5;
export const STUDENT_MAP_ZOOM_STEP = 0.2;

/** Keep every student-map zoom input inside one predictable, readable range. */
export function clampStudentMapZoom(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Number(
    Math.max(STUDENT_MAP_MIN_ZOOM, Math.min(STUDENT_MAP_MAX_ZOOM, value)).toFixed(2),
  );
}
