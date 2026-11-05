import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { buildStudentRouteRibbonGeometry, studentRouteHaloColor, type StudentRouteRibbonPoint } from "../studentRouteRibbonGeometry";

function triangleAreas(geometry: THREE.BufferGeometry): number[] {
  const positions = geometry.getAttribute("position");
  const areas: number[] = [];
  for (let index = 0; index < positions.count; index += 3) {
    const a = new THREE.Vector3().fromBufferAttribute(positions, index);
    const b = new THREE.Vector3().fromBufferAttribute(positions, index + 1);
    const c = new THREE.Vector3().fromBufferAttribute(positions, index + 2);
    areas.push(new THREE.Triangle(a, b, c).getArea());
  }
  return areas;
}

function expectCleanRibbon(points: StudentRouteRibbonPoint[]) {
  const geometry = buildStudentRouteRibbonGeometry(points, 8, 0.12);
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox!;
  const positions = geometry.getAttribute("position");
  expect(positions.count).toBeGreaterThan(0);
  expect(Array.from(positions.array).every(Number.isFinite)).toBe(true);
  expect(Array.from(positions.array).filter((_, index) => index % 3 === 1).every((y) => Math.abs(y - 0.12) < 1e-6)).toBe(true);
  expect(triangleAreas(geometry).every((area) => area > 1e-8)).toBe(true);
  // Test paths are one map unit or less wide; bends and caps stay within the
  // route's half-width of their authored centerline bounds.
  expect(bounds.min.x).toBeGreaterThanOrEqual(-0.05);
  expect(bounds.min.z).toBeGreaterThanOrEqual(-0.05);
  expect(bounds.max.x).toBeLessThanOrEqual(2.05);
  expect(bounds.max.z).toBeLessThanOrEqual(2.05);
  geometry.dispose();
  return geometry;
}

describe("student outdoor route ribbon geometry", () => {
  it.each([
    [[{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }]],
    [[{ x: 0, y: 0 }, { x: 100, y: 35 }, { x: 180, y: 130 }]],
    [[{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 200, y: 100 }, { x: 200, y: 200 }]],
  ])("keeps corners continuous and bounded for authored bends", (points) => {
    const geometry = expectCleanRibbon(points as StudentRouteRibbonPoint[]);
    expect(geometry.index?.count).toBeGreaterThan(0);
  });

  it("removes duplicate and very short points without creating degenerate faces", () => {
    const geometry = expectCleanRibbon([
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 0.001, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 100, y: 100 },
      { x: Number.NaN, y: 3 },
    ]);
    expect(triangleAreas(geometry).every((area) => area > 1e-8)).toBe(true);
  });

  it("keeps the outline narrow relative to the colored route core", () => {
    const route = buildStudentRouteRibbonGeometry([{ x: 0, y: 0 }, { x: 100, y: 0 }], 8, 0.12);
    const outline = buildStudentRouteRibbonGeometry([{ x: 0, y: 0 }, { x: 100, y: 0 }], 10, 0.105);
    route.computeBoundingBox();
    outline.computeBoundingBox();
    expect(outline.boundingBox!.getSize(new THREE.Vector3()).z - route.boundingBox!.getSize(new THREE.Vector3()).z).toBeCloseTo(0.02, 5);
    route.dispose();
    outline.dispose();
  });

  it.each(["#1769e0", "#16a34a", "#dc2626"]) ("keeps a white casing around the %s route body", (color) => {
    const halo = studentRouteHaloColor(color);
    expect(halo.getHexString()).toBe("ffffff");
  });
});
