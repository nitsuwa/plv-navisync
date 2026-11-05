import { describe, expect, it } from "vitest";
import { createRoutePointSampler, createRouteWorldSampler, routeArrowPlacements } from "../studentRoute3dPresentation";

describe("3D route arrow presentation", () => {
  it("samples route progress from a cached polyline and reuses an output point", () => {
    const sample = createRoutePointSampler([{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 4 }]);
    const output = { x: 0, y: 0 };
    expect(sample(0.5, output)).toBe(output);
    expect(output).toEqual({ x: 3, y: 0.5 });
    expect(sample(1, output)).toBe(output);
    expect(output).toEqual({ x: 3, y: 4 });
    expect(createRoutePointSampler([])(0.5)).toBeNull();
  });

  it("orients arrows along the ordered route in all four map directions", () => {
    const cases = [
      { end: { x: 1000, y: 0 }, yaw: 0 },
      { end: { x: -1000, y: 0 }, yaw: -Math.PI },
      { end: { x: 0, y: 1000 }, yaw: -Math.PI / 2 },
      { end: { x: 0, y: -1000 }, yaw: Math.PI / 2 },
    ];
    for (const { end, yaw } of cases) {
      const arrows = routeArrowPlacements([{ x: 0, y: 0 }, end], { worldScale: 0.01 });
      expect(arrows.length).toBeGreaterThan(0);
      expect(arrows.every((arrow) => Math.abs(arrow.yaw - yaw) < 1e-6)).toBe(true);
    }
  });

  it("keeps evenly spaced arrows flowing through sharp corners", () => {
    const route = [
      { x: 0, y: 0 },
      { x: 1020, y: 0 },
      { x: 1020, y: 1020 },
    ];
    const arrows = routeArrowPlacements(route, { worldScale: 0.01, spacingWorld: 2.4 });
    expect(arrows).toHaveLength(7);
    expect(arrows.some((arrow) => Math.hypot(arrow.point.x - 1020, arrow.point.y) < 70)).toBe(true);
    for (let index = 1; index < arrows.length; index += 1) {
      expect(arrows[index].distance - arrows[index - 1].distance).toBeCloseTo(2.4);
    }
  });

  it("places multiple direction arrows along a long route with readable spacing", () => {
    const arrows = routeArrowPlacements([
      { x: 0, y: 0 }, { x: 1200, y: 0 }, { x: 1200, y: 1200 }, { x: 2400, y: 1200 },
    ], { worldScale: 0.01 });
    expect(arrows.length).toBeGreaterThan(8);
    expect(arrows.length).toBeLessThanOrEqual(36);
    for (let index = 1; index < arrows.length; index += 1) {
      expect(arrows[index].distance - arrows[index - 1].distance).toBeCloseTo(arrows[1].distance - arrows[0].distance);
    }
  });

  it("ignores duplicate points and keeps short routes uncluttered", () => {
    expect(routeArrowPlacements([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 50, y: 0 }], { worldScale: 0.01 })).toEqual([]);
    const arrows = routeArrowPlacements([{ x: 0, y: 0 }, { x: 450, y: 0 }], { worldScale: 0.01 });
    expect(arrows).toHaveLength(1);
    expect(arrows[0].point.x).toBeGreaterThan(0);
    expect(arrows[0].point.x).toBeLessThan(450);
  });

  it("samples flowing chevrons from the same world-scaled route tangent", () => {
    const sampler = createRouteWorldSampler([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }], 0.01);
    expect(sampler.totalLength).toBeCloseTo(2);
    expect(sampler.sample(0.5)).toEqual({ x: 50, y: 0 });
    expect(sampler.yawAt(0.5)).toBeCloseTo(0);
    expect(sampler.yawAt(1.5)).toBeCloseTo(-Math.PI / 2);
    expect(sampler.isNearCorner(1, 0.2)).toBe(true);
  });

  it("blends animated arrow heading across a corner", () => {
    const sampler = createRouteWorldSampler([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }], 0.01);
    const before = sampler.yawAt(0.8);
    const atCorner = sampler.yawAt(1);
    const after = sampler.yawAt(1.2);
    expect(before).toBeGreaterThan(atCorner);
    expect(atCorner).toBeGreaterThan(after);
    expect(sampler.sample(1)).toEqual({ x: 100, y: 0 });
  });
});
