import { describe, expect, it } from "vitest";
import { guidedRouteProgressDuration, navigationWalkDuration, outdoorWalkingDistance, walkingAnimationDuration } from "../walkingAnimation";

describe("shared indoor and outdoor walking pace", () => {
  it("paces guided movement by meaningful route steps rather than map distance", () => {
    expect(guidedRouteProgressDuration(1)).toBe(6650);
    expect(guidedRouteProgressDuration(5)).toBeGreaterThan(guidedRouteProgressDuration(1));
    expect(guidedRouteProgressDuration(100)).toBe(16000);
  });

  it("allocates one shared journey pace proportionally to canonical leg distance", () => {
    expect(navigationWalkDuration(20, 200)).toBe(1600);
    expect(navigationWalkDuration(100, 200)).toBe(8000);
    expect(navigationWalkDuration(20, 200)).toBeLessThan(navigationWalkDuration(100, 200));
    expect(navigationWalkDuration(20, 20)).toBe(1600);
  });

  it("makes 2x speed double movement progress without changing transition policy", () => {
    expect(navigationWalkDuration(80, 320, 2)).toBe(navigationWalkDuration(80, 320) / 2);
    expect(navigationWalkDuration(0, 320, 2)).toBe(1);
  });

  it("uses equal milliseconds per meter for indoor and outdoor legs", () => {
    const total = 400;
    expect(walkingAnimationDuration(80, total) / 80)
      .toBe(walkingAnimationDuration(320, total) / 320);
    expect(walkingAnimationDuration(80, total)).toBe(2400);
  });

  it("slows the existing outdoor-only animation by twenty percent", () => {
    expect(walkingAnimationDuration(231)).toBe(7200);
    expect(walkingAnimationDuration(50)).toBe(4800);
    expect(walkingAnimationDuration(1000)).toBe(14400);
  });

  it("does not charge indoor walking distance to the outdoor leg", () => {
    expect(outdoorWalkingDistance({ dist: 400, indoorSegments: [{ distanceM: 50 }, { distanceM: 30 }] })).toBe(320);
  });

  it("handles zero and invalid distances without stalling the animation", () => {
    expect(walkingAnimationDuration(0)).toBe(1);
    expect(walkingAnimationDuration(NaN)).toBe(1);
    expect(walkingAnimationDuration(50, NaN)).toBe(4800);
  });
});
