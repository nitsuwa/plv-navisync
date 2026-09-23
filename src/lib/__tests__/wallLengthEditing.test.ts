import { describe, expect, it } from "vitest";
import { nearestEqualWallLength, resizeWallToLength, wallLength } from "../floorGeometry";
import type { FloorWall } from "../../components/map-builder/types";

const wall = (x1: number, y1: number, x2: number, y2: number): FloorWall => ({
  id: "wall",
  x1,
  y1,
  x2,
  y2,
  thickness: 4,
  color: "#000000",
});

describe("exact Wall length editing", () => {
  it("keeps the start fixed for an exact horizontal length", () => {
    const result = resizeWallToLength(wall(100, 100, 200, 100), 95, "start");
    expect(result).toMatchObject({ x1: 100, y1: 100, x2: 195, y2: 100 });
    expect(wallLength(result)).toBeCloseTo(95, 10);
  });

  it("keeps a vertical Wall vertical", () => {
    const result = resizeWallToLength(wall(200, 100, 200, 200), 130, "start");
    expect(result.x1).toBe(200);
    expect(result.x2).toBe(200);
    expect(result.y2 - result.y1).toBe(130);
    expect(wallLength(result)).toBeCloseTo(130, 10);
  });

  it("preserves diagonal angle while changing length", () => {
    const source = wall(100, 100, 130, 140);
    const result = resizeWallToLength(source, 25, "start");
    expect((result.y2 - result.y1) / (result.x2 - result.x1)).toBeCloseTo(40 / 30, 10);
    expect(wallLength(result)).toBeCloseTo(25, 10);
  });

  it("supports fixed end and fixed center anchoring", () => {
    const source = wall(100, 100, 200, 100);
    const fixedEnd = resizeWallToLength(source, 60, "end");
    expect(fixedEnd).toMatchObject({ x2: 200, y2: 100, x1: 140, y1: 100 });

    const fixedCenter = resizeWallToLength(source, 60, "center");
    expect(fixedCenter).toMatchObject({ x1: 120, y1: 100, x2: 180, y2: 100 });
    expect((fixedCenter.x1 + fixedCenter.x2) / 2).toBe(150);
  });

  it("does not quantize the requested decimal length", () => {
    const result = resizeWallToLength(wall(10, 20, 60, 20), 87.5, "start");
    expect(wallLength(result)).toBeCloseTo(87.5, 10);
  });

  it("matches a distant authored Wall by length only", () => {
    const distant = { ...wall(900, 40, 900, 135), id: "distant" };
    const selected = { ...wall(100, 300, 240, 300), id: "selected" };
    const match = nearestEqualWallLength([distant, selected], 94.5, selected.id);
    expect(match).toMatchObject({ wallId: "distant", length: 95 });
  });
});
