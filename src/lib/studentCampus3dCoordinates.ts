/** Shared presentation transform from authored campus coordinates to Three world space. */
export const STUDENT_CAMPUS_3D_SCALE = 0.01;

export interface CampusMapPoint {
  x: number;
  y: number;
}

export interface StudentCampusWorldPoint {
  x: number;
  y: number;
  z: number;
}

export function campusMapPointToWorld(point: CampusMapPoint, elevation = 0): StudentCampusWorldPoint {
  return {
    x: point.x * STUDENT_CAMPUS_3D_SCALE,
    y: elevation,
    z: point.y * STUDENT_CAMPUS_3D_SCALE,
  };
}

export function campusMapSizeToWorld(size: number): number {
  return size * STUDENT_CAMPUS_3D_SCALE;
}
