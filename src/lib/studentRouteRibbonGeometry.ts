import * as THREE from "three";
import { campusMapPointToWorld, campusMapSizeToWorld } from "./studentCampus3dCoordinates";

export interface StudentRouteRibbonPoint {
  x: number;
  y: number;
}

const ROUND_JOIN_STEP = Math.PI / 12;
const MAX_JOIN_STEPS = 12;

export function studentRouteHaloColor(routeColor: string): THREE.Color {
  // Preserve the deployed blue route with a clean white casing across route modes.
  void routeColor;
  return new THREE.Color("#ffffff");
}

/** Builds a slim, continuous flat route ribbon with bounded round joins/caps. */
export function buildStudentRouteRibbonGeometry(
  points: readonly StudentRouteRibbonPoint[],
  widthInMapUnits: number,
  elevation: number,
): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  const mapped: THREE.Vector3[] = points
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
    .map((point) => {
      const world = campusMapPointToWorld(point, elevation);
      return new THREE.Vector3(world.x, world.y, world.z);
    })
    .filter((point, index, all) => index === 0 || Math.hypot(point.x - all[index - 1].x, point.z - all[index - 1].z) > 1e-4);
  const halfWidth = Math.max(0, campusMapSizeToWorld(widthInMapUnits)) / 2;
  if (mapped.length < 2 || halfWidth <= 0) return geometry;

  const positions: number[] = [];
  const indices: number[] = [];
  const addTriangle = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => {
    // Keep the ribbon's front face oriented upward for consistent lighting.
    const signedArea = (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
    const ordered = signedArea > 0 ? [a, c, b] : [a, b, c];
    const offset = positions.length / 3;
    for (const point of ordered) positions.push(point.x, elevation, point.z);
    indices.push(offset, offset + 1, offset + 2);
  };
  const addArc = (center: THREE.Vector3, startAngle: number, sweep: number) => {
    const count = Math.max(1, Math.min(MAX_JOIN_STEPS, Math.ceil(Math.abs(sweep) / ROUND_JOIN_STEP)));
    let previous = new THREE.Vector3(center.x + Math.cos(startAngle) * halfWidth, elevation, center.z + Math.sin(startAngle) * halfWidth);
    for (let step = 1; step <= count; step += 1) {
      const angle = startAngle + sweep * (step / count);
      const next = new THREE.Vector3(center.x + Math.cos(angle) * halfWidth, elevation, center.z + Math.sin(angle) * halfWidth);
      addTriangle(center, previous, next);
      previous = next;
    }
  };

  const directions: Array<{ x: number; z: number; nx: number; nz: number }> = [];
  for (let index = 0; index < mapped.length - 1; index += 1) {
    const start = mapped[index];
    const end = mapped[index + 1];
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const length = Math.hypot(dx, dz);
    if (length <= 1e-4) continue;
    const x = dx / length;
    const z = dz / length;
    const nx = -z;
    const nz = x;
    directions.push({ x, z, nx, nz });

    const startLeft = new THREE.Vector3(start.x + nx * halfWidth, elevation, start.z + nz * halfWidth);
    const startRight = new THREE.Vector3(start.x - nx * halfWidth, elevation, start.z - nz * halfWidth);
    const endLeft = new THREE.Vector3(end.x + nx * halfWidth, elevation, end.z + nz * halfWidth);
    const endRight = new THREE.Vector3(end.x - nx * halfWidth, elevation, end.z - nz * halfWidth);
    addTriangle(startLeft, endLeft, startRight);
    addTriangle(startRight, endLeft, endRight);
  }

  for (let index = 1; index < mapped.length - 1; index += 1) {
    const incoming = directions[index - 1];
    const outgoing = directions[index];
    if (!incoming || !outgoing) continue;
    const cross = incoming.x * outgoing.z - incoming.z * outgoing.x;
    const dot = incoming.x * outgoing.x + incoming.z * outgoing.z;
    const turn = Math.atan2(cross, dot);
    const center = mapped[index];
    if (Math.abs(turn) < 1e-4) {
      if (dot < 0) addArc(center, Math.atan2(incoming.nz, incoming.nx), Math.PI * 2);
      continue;
    }
    // Fill only the outside of the bend; the two segment ribbons already
    // overlap safely on the inside. The arc sweep follows the bounded turn.
    const side = cross > 0 ? -1 : 1;
    const startAngle = Math.atan2(side * incoming.nz, side * incoming.nx);
    addArc(center, startAngle, turn);
  }

  const first = directions[0];
  const last = directions[directions.length - 1];
  if (first) addArc(mapped[0], Math.atan2(first.nz, first.nx), Math.PI);
  if (last) addArc(mapped[mapped.length - 1], Math.atan2(-last.nz, -last.nx), Math.PI);

  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
