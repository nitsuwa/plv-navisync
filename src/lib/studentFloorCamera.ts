/**
 * A portrait phone needs a little more than the SVG's whole-canvas fit so
 * room names and door details are legible when an indoor floor first opens.
 * The reset/fit control deliberately continues to use zoom 1 for the full map.
 */
export const STUDENT_MOBILE_PORTRAIT_FLOOR_ZOOM = 1.55;

export function getStudentInitialFloorZoom(isMobilePortrait: boolean): number {
  return isMobilePortrait ? STUDENT_MOBILE_PORTRAIT_FLOOR_ZOOM : 1;
}
