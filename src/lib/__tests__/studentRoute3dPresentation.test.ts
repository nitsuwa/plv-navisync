import { describe, expect, it } from "vitest";
import { createRoutePointSampler, createRouteWorldSampler, routeArrowDistanceAt, routeArrowPlacements, routePolylineWorldLength, routeVisualProgressWithEndpointClearance } from "../studentRoute3dPresentation";

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

  it("keeps a bounded arrow set on-route through many full animation cycles", () => {
    const totalLength = 31.8;
    const count = 16;
    const usable = totalLength - 1.8;
    const spacing = usable / count;
    const cycleSeconds = spacing / 0.36;
    for (let cycle = 0; cycle <= 12; cycle += 1) {
      for (let frame = 0; frame <= 30; frame += 1) {
        const elapsed = cycle * cycleSeconds + (frame / 30) * cycleSeconds;
        const distances = Array.from({ length: count }, (_, index) => routeArrowDistanceAt(totalLength, count, index, elapsed, 0.36));
        expect(distances.every((distance) => distance !== null && distance >= 0.9 && distance <= totalLength - 0.9)).toBe(true);
        expect(new Set(distances).size).toBe(count);
      }
    }
  });

  it("preserves phase while paused and resumes without a loop-boundary jump", () => {
    const totalLength = 18;
    const count = 8;
    const beforePause = routeArrowDistanceAt(totalLength, count, 3, 7.25, 0.3);
    const paused = routeArrowDistanceAt(totalLength, count, 3, 7.25, 0.3);
    const afterResume = routeArrowDistanceAt(totalLength, count, 3, 7.26, 0.3);
    expect(paused).toBe(beforePause);
    expect(afterResume).not.toBeNull();
    expect(Math.abs(afterResume! - beforePause!)).toBeLessThan(0.01);
  });

  it("does not create arrows outside the valid route margins", () => {
    expect(routeArrowDistanceAt(3, 1, 0, 0, 0.3)).toBeCloseTo(0.9);
    expect(routeArrowDistanceAt(1.7, 1, 0, 0, 0.3)).toBeNull();
    expect(routeArrowDistanceAt(20, 2, 2, 0, 0.3)).toBeNull();
  });

  it("smoothly eases only the visual marker to a safe stop before doorway endpoints", () => {
    const route = [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }];
    const length = routePolylineWorldLength(route, 0.025);
    expect(length).toBeCloseTo(1);
    const start = routeVisualProgressWithEndpointClearance(0.52, length, 0.08);
    const nearEnd = routeVisualProgressWithEndpointClearance(0.99, length, 0.08);
    const arrival = routeVisualProgressWithEndpointClearance(1, length, 0.08);
    expect(start).toBeCloseTo(0.52);
    expect(nearEnd).toBeGreaterThan(start);
    expect(arrival).toBeCloseTo(0.92);
    expect(arrival).toBeLessThan(1);
    expect(routeVisualProgressWithEndpointClearance(1, 0.2, 0.08)).toBeCloseTo(0.88);
    expect(routeVisualProgressWithEndpointClearance(1, 0, 0.24)).toBe(1);
  });
});
