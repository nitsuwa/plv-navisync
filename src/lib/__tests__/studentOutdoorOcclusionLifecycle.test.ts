import { describe, expect, it } from "vitest";
import {
  outdoorOcclusionLifecycleTransition,
  shouldRunOutdoorOcclusion,
} from "../studentOutdoorOcclusionLifecycle";

describe("outdoor building occlusion playback lifecycle", () => {
  it("requires live playback even when a route and NaviBuddy position remain available", () => {
    expect(shouldRunOutdoorOcclusion(true, 2)).toBe(true);
    expect(shouldRunOutdoorOcclusion(false, 2)).toBe(false);
    expect(shouldRunOutdoorOcclusion(true, 1)).toBe(false);
  });

  it("restores when playback pauses and requests an immediate fresh probe on resume", () => {
    expect(outdoorOcclusionLifecycleTransition(true, false)).toEqual({
      active: false,
      changed: true,
      restore: true,
      evaluateImmediately: false,
    });
    expect(outdoorOcclusionLifecycleTransition(false, true)).toEqual({
      active: true,
      changed: true,
      restore: false,
      evaluateImmediately: true,
    });
  });

  it("keeps pause/resume stable over repeated cycles", () => {
    let wasActive = true;
    for (let cycle = 0; cycle < 5; cycle++) {
      const paused = outdoorOcclusionLifecycleTransition(wasActive, false);
      expect(paused.restore).toBe(true);
      wasActive = paused.active;

      const resumed = outdoorOcclusionLifecycleTransition(wasActive, true);
      expect(resumed.evaluateImmediately).toBe(true);
      wasActive = resumed.active;
    }
    expect(wasActive).toBe(true);
  });

  it("restores when Follow playback stops for Explore, route cancellation, or 2D renderer teardown", () => {
    for (const reason of ["Explore camera", "route cancellation", "2D switch"] as const) {
      const wasActive = shouldRunOutdoorOcclusion(true, 2);
      const isActive = shouldRunOutdoorOcclusion(false, 2);
      expect(outdoorOcclusionLifecycleTransition(wasActive, isActive).restore, reason).toBe(true);
    }
  });

  it("does not restart probe work for an unchanged playback state", () => {
    expect(outdoorOcclusionLifecycleTransition(true, true)).toEqual({
      active: true,
      changed: false,
      restore: false,
      evaluateImmediately: false,
    });
    expect(outdoorOcclusionLifecycleTransition(false, false).restore).toBe(false);
  });
});
