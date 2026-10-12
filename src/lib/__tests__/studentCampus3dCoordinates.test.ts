import { describe, expect, it } from "vitest";
import { campusMapPointToWorld, campusMapSizeToWorld, STUDENT_CAMPUS_3D_SCALE } from "../studentCampus3dCoordinates";

describe("Student Campus 3D coordinate projection", () => {
  it("maps authored 2D x/y to world x/z without changing source coordinates", () => {
    const authored = { x: 640, y: 280 };
    const projected = campusMapPointToWorld(authored, 0.5);
    expect(projected.x).toBe(6.4);
    expect(projected.y).toBe(0.5);
    expect(projected.z).toBeCloseTo(2.8);
    expect(authored).toEqual({ x: 640, y: 280 });
  });

  it("preserves authored tree/bench order, side, and spacing when projecting asset anchors", () => {
    const authored = [
      { id: "tree-left", kind: "tree", x: 240, y: 210 },
      { id: "bench-left", kind: "bench", x: 240, y: 258 },
      { id: "tree-right", kind: "tree", x: 420, y: 210 },
      { id: "bench-right", kind: "bench", x: 420, y: 258 },
    ] as const;
    const projected = authored.map((asset) => campusMapPointToWorld({ x: asset.x, y: asset.y }));

    expect(projected).toHaveLength(authored.length);
    expect(projected.map((point) => [point.x, point.z])).toEqual([
      [2.4, 2.1], [2.4, 2.58], [4.2, 2.1], [4.2, 2.58],
    ]);
    expect(authored.map((asset) => asset.id)).toEqual(["tree-left", "bench-left", "tree-right", "bench-right"]);
  });

  it("uses one shared scale for points and dimensions", () => {
    expect(campusMapSizeToWorld(120)).toBe(120 * STUDENT_CAMPUS_3D_SCALE);
  });
});
