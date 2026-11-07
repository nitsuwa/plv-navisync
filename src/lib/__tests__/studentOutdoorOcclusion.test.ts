import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { cameraSegmentIntersectsOutdoorBuilding, OUTDOOR_AVATAR_OCCLUSION_SAMPLE_HEIGHTS, outdoorBuildingBlocksAvatarSample, outdoorBuildingFadeMaterialState, outdoorBuildingFadeOpacity, shouldFadeOutdoorBuildingForSamples } from "../studentOutdoorOcclusion";

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
  it("does not treat a building behind the avatar as an obstruction", () => {
    expect(cameraSegmentIntersectsOutdoorBuilding([0, 1.2, 5], [0, 0.4, -5], { ...box, center: [0, 1, -6] as const })).toBe(false);
  });
  it("rejects a camera ray above the actual building height", () => {
    expect(cameraSegmentIntersectsOutdoorBuilding([0, 5, 5], [0, 0.46, -5], box)).toBe(false);
  });
  it("rejects a camera beside the building when the sight segment clears it", () => {
    expect(cameraSegmentIntersectsOutdoorBuilding([2.2, 1.4, 5], [2.2, 0.4, -5], box)).toBe(false);
  });
  it("keeps the probe points on NaviBuddy rather than above its head", () => {
    const feet = 0.12;
    expect(OUTDOOR_AVATAR_OCCLUSION_SAMPLE_HEIGHTS.map((offset) => feet + offset)).toEqual([0.27, 0.37, 0.46]);
    expect(feet + 0.68).toBeGreaterThan(0.46 + 0.2);
  });
  it("requires two useful avatar samples to be blocked", () => {
    expect(shouldFadeOutdoorBuildingForSamples([true, false, false])).toBe(false);
    expect(shouldFadeOutdoorBuildingForSamples([false, true, true])).toBe(true);
    expect(shouldFadeOutdoorBuildingForSamples([false, false, false])).toBe(false);
  });
  it("requires an actual building geometry hit in addition to candidate bounds", () => {
    expect(outdoorBuildingBlocksAvatarSample(true, false)).toBe(false);
    expect(outdoorBuildingBlocksAvatarSample(true, true)).toBe(true);
  });
  it("uses a bounded raycast to confirm an actual facade intersection", () => {
    const facade = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial());
    facade.position.y = 1;
    facade.updateMatrixWorld(true);
    const ray = new THREE.Raycaster(new THREE.Vector3(0, 1, 5), new THREE.Vector3(0, 0, -1), 0.015, 9.955);
    const hit = ray.intersectObject(facade, false).length > 0;
    expect(hit).toBe(true);
    expect(outdoorBuildingBlocksAvatarSample(true, hit)).toBe(true);
    expect(outdoorBuildingBlocksAvatarSample(true, false)).toBe(false);
    facade.geometry.dispose();
    (facade.material as THREE.Material).dispose();
  });
  it("restores immediately after a clear-view sample sequence and fades again when blocked", () => {
    const blocked = [true, true, false];
    const clear = [false, false, false];
    const fades = [shouldFadeOutdoorBuildingForSamples(blocked), shouldFadeOutdoorBuildingForSamples(clear), shouldFadeOutdoorBuildingForSamples(blocked)];
    expect(fades).toEqual([true, false, true]);
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
