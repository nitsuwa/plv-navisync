import { describe, expect, it } from "vitest";
import { cameraSegmentIntersectsOutdoorBuilding, outdoorBuildingFadeMaterialState, outdoorBuildingFadeOpacity } from "../studentOutdoorOcclusion";

const box = { center: [0, 1, 0] as const, halfSize: [1, 1, 1] as const, yaw: 0 };

describe("cameraSegmentIntersectsOutdoorBuilding", () => {
  it("detects a building between camera and figure", () => {
    expect(cameraSegmentIntersectsOutdoorBuilding([0, 2, 5], [0, 0.2, -5], box)).toBe(true);
  });
  it("keeps nearby buildings opaque when the line of sight misses", () => {
    expect(cameraSegmentIntersectsOutdoorBuilding([3, 2, 5], [3, 0.2, -5], box)).toBe(false);
  });
  it("uses the current camera and figure endpoints", () => {
    expect(cameraSegmentIntersectsOutdoorBuilding([0, 2, 5], [0, 0.2, 5], box)).toBe(false);
    expect(cameraSegmentIntersectsOutdoorBuilding([4, 2, 5], [-4, 0.2, -5], box)).toBe(true);
  });
  it("supports rotated building footprints", () => {
    expect(cameraSegmentIntersectsOutdoorBuilding([5, 2, 0], [-5, 0.2, 0], { ...box, yaw: Math.PI / 2 })).toBe(true);
  });
});

describe("outdoorBuildingFadeOpacity", () => {
  it("applies the same progress factor without replacing authored material opacity", () => {
    expect(outdoorBuildingFadeOpacity(1, 0.42)).toBeCloseTo(0.42);
    expect(outdoorBuildingFadeOpacity(0.5, 0.42)).toBeCloseTo(0.21);
  });

  it("restores original opacity at full progress and clamps invalid progress", () => {
    expect(outdoorBuildingFadeOpacity(0.36, 1)).toBeCloseTo(0.36);
    expect(outdoorBuildingFadeOpacity(0.5, -1)).toBe(0);
    expect(outdoorBuildingFadeOpacity(0.5, Number.NaN)).toBe(0.5);
  });
});

describe("outdoorBuildingFadeMaterialState", () => {
  it("fades authored glass proportionally and restores its exact render flags", () => {
    const original = { opacity: 0.5, transparent: true, depthWrite: false };
    expect(outdoorBuildingFadeMaterialState(original, 0.42)).toEqual({ opacity: 0.21, transparent: true, depthWrite: false });
    expect(outdoorBuildingFadeMaterialState(original, 1)).toEqual(original);
  });

  it("enables transparency only during a fade and restores opaque materials", () => {
    const original = { opacity: 1, transparent: false, depthWrite: true };
    expect(outdoorBuildingFadeMaterialState(original, 0.42)).toEqual({ opacity: 0.42, transparent: true, depthWrite: false });
    expect(outdoorBuildingFadeMaterialState(original, 1)).toEqual(original);
  });
});
