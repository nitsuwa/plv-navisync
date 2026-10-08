import { describe, expect, it } from "vitest";
import { resolveEqualLengthEndpointSnap } from "../wallEqualLengthSnap";

describe("resolveEqualLengthEndpointSnap", () => {
  const candidates = [
    { length: 100, wallIds: ["wall-1"] },
    { length: 160, wallIds: ["wall-moving", "wall-2"] },
  ];

  it("snaps within the threshold and preserves the current pointer angle", () => {
    const result = resolveEqualLengthEndpointSnap(
      { x: 0, y: 0 }, { x: 0, y: 101 }, candidates, "wall-moving", 1.5,
    );
    expect(result?.wallId).toBe("wall-1");
    expect(result?.point.x).toBeCloseTo(0);
    expect(result?.point.y).toBeCloseTo(100);
  });

  it("releases immediately once the raw pointer leaves the threshold", () => {
    expect(resolveEqualLengthEndpointSnap(
      { x: 0, y: 0 }, { x: 0, y: 103 }, candidates, "wall-moving", 1.5,
    )).toBeNull();
  });

  it("never selects the moving wall as its own equal-length target", () => {
    const result = resolveEqualLengthEndpointSnap(
      { x: 0, y: 0 }, { x: 160, y: 0 }, candidates, "wall-moving", 1.5,
    );
    expect(result?.wallId).toBe("wall-2");
  });
});
