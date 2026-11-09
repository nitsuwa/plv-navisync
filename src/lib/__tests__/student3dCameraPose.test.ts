import { describe, expect, it } from "vitest";
import {
  clampStudent3dCameraOffset,
  student3dCameraOffsetFromPose,
  student3dCameraPoseAtTarget,
  student3dCameraPoseRestoreCompletionMatches,
  student3dCameraPoseRestoreForContext,
  student3dFollowCameraOffsetForRecovery,
  student3dFollowViewportOffsetScale,
  student3dFollowCameraOffsetChanged,
  synchronizeStudent3dFollowCameraOffsetDistance,
  student3dFollowCameraOrientationChanged,
  shouldPreserveStudent3dFollowCameraOffset,
  type Student3dCameraPoseRestoreRequest,
} from "../student3dCameraPose";

describe("Student 3D camera pose ownership and recovery", () => {
  it("keeps a saved outdoor pose from being replayed by a newly entered Floor renderer", () => {
    const request: Student3dCameraPoseRestoreRequest = {
      nonce: 12,
      contextKey: "campus",
      pose: { position: [0, 2, 0], target: [900, 0, 700] },
    };

    expect(student3dCameraPoseRestoreForContext(request, "campus")).toEqual(request);
    expect(student3dCameraPoseRestoreForContext(request, "science-hall:1")).toBeNull();
    expect(student3dCameraPoseRestoreForContext(request, "campus", false)).toBeNull();
    expect(student3dCameraPoseRestoreCompletionMatches(request, 12, "campus")).toBe(true);
    expect(student3dCameraPoseRestoreCompletionMatches(request, 12, "science-hall:1")).toBe(false);
    expect(student3dCameraPoseRestoreCompletionMatches(request, 11, "campus")).toBe(false);
  });

  it("restores an indoor pose only to its exact Building and Floor context", () => {
    const request: Student3dCameraPoseRestoreRequest = {
      nonce: 13,
      contextKey: "science-hall:2",
      pose: { position: [6, 12, 8], target: [0, 0, 0] },
    };

    expect(student3dCameraPoseRestoreForContext(request, "science-hall:2")).toEqual(request);
    expect(student3dCameraPoseRestoreForContext(request, "science-hall:1")).toBeNull();
    expect(student3dCameraPoseRestoreForContext(request, "campus")).toBeNull();
  });

  it("keeps distance and orbit orientation when rebasing a pose onto the canonical marker", () => {
    const offset = student3dCameraOffsetFromPose({
      position: [17, 28, 43],
      target: [10, 20, 30],
    });
    const restored = student3dCameraPoseAtTarget(offset, [100, 2, 50]);

    expect(offset).toEqual([7, 8, 13]);
    expect(restored.target).toEqual([100, 2, 50]);
    expect(student3dCameraOffsetFromPose(restored)).toEqual(offset);
    expect(Math.hypot(...student3dCameraOffsetFromPose(restored))).toBeCloseTo(Math.hypot(7, 8, 13));
  });

  it("prefers the canonical Follow bookmark over an inspected floor's wide fit", () => {
    const restored = student3dFollowCameraOffsetForRecovery(
      [4, 8, 9],
      [50, 60, 70],
      [0, 8, 8],
      4,
      60,
      false,
    );
    expect(restored).toEqual([4, 8, 9]);
  });

  it("preserves the current same-floor zoom and orbit without accumulating drift", () => {
    const initial = [3, 8, 6] as [number, number, number];
    let recovered = initial;
    for (let i = 0; i < 12; i += 1) {
      recovered = student3dFollowCameraOffsetForRecovery(null, recovered, [0, 9, 9], 4, 60, true);
    }
    expect(recovered).toEqual(initial);
  });

  it("keeps a user-adjusted Follow orbit and zoom when the route renderer changes Floors", () => {
    const chosenOffset: [number, number, number] = [-9, 13, 7];
    const routeDefault: [number, number, number] = [2, 10, 8];
    const recovered = student3dFollowCameraOffsetForRecovery(
      null,
      chosenOffset,
      routeDefault,
      4,
      80,
      true,
    );
    const distance = (offset: [number, number, number]) => Math.hypot(...offset);
    const azimuth = (offset: [number, number, number]) => Math.atan2(offset[0], offset[2]);
    const elevation = (offset: [number, number, number]) => Math.atan2(offset[1], Math.hypot(offset[0], offset[2]));

    expect(recovered).toEqual(chosenOffset);
    expect(distance(recovered)).toBeCloseTo(distance(chosenOffset));
    expect(azimuth(recovered)).toBeCloseTo(azimuth(chosenOffset));
    expect(elevation(recovered)).toBeCloseTo(elevation(chosenOffset));
  });

  it("retains the live Follow offset across authored route contexts with changed floor geometry", () => {
    expect(shouldPreserveStudent3dFollowCameraOffset({
      attachedFollow: true,
      sameRoute: true,
      sameViewportSize: true,
    })).toBe(true);
  });

  it("changes Follow heading at corridor bends while ignoring small route noise", () => {
    expect(student3dFollowCameraOrientationChanged({ x: 0, y: 7, z: -7 }, { x: 7, y: 7, z: 0 })).toBe(true);
    expect(student3dFollowCameraOrientationChanged({ x: 1, y: 7, z: -7 }, { x: 0.9, y: 7, z: -7 })).toBe(false);
    expect(student3dFollowCameraOrientationChanged(null, { x: 0, y: 7, z: -7 })).toBe(true);
  });

  it("recognizes a Follow zoom change even when the route heading is unchanged", () => {
    expect(student3dFollowCameraOffsetChanged({ x: 0, y: 7, z: -7 }, { x: 0, y: 10, z: -10 })).toBe(true);
    expect(student3dFollowCameraOffsetChanged({ x: 0, y: 7, z: -7 }, { x: 0, y: 7.01, z: -7.01 })).toBe(false);
  });

  it("scales the Follow safe-viewport offset with the current camera dolly distance", () => {
    expect(student3dFollowViewportOffsetScale(12, 6)).toBe(0.5);
    expect(student3dFollowViewportOffsetScale(12, 18)).toBe(1.5);
    expect(student3dFollowViewportOffsetScale(0, 18)).toBe(1);
  });

  it("preserves a manual Follow zoom through camera updates and a route turn", () => {
    const followedOffset = { x: 0, y: 7, z: -7 };
    expect(synchronizeStudent3dFollowCameraOffsetDistance(followedOffset, 12)).toBe(true);
    expect(Math.hypot(followedOffset.x, followedOffset.y, followedOffset.z)).toBeCloseTo(12);

    const turnedOffset = { x: 8.485281374, y: 8.485281374, z: 0 };
    expect(student3dFollowCameraOffsetChanged(followedOffset, turnedOffset)).toBe(true);
    expect(synchronizeStudent3dFollowCameraOffsetDistance(turnedOffset, 12)).toBe(false);
    expect(Math.hypot(turnedOffset.x, turnedOffset.y, turnedOffset.z)).toBeCloseTo(12);
  });

  it("does not carry a Follow offset into a replaced route or resized canvas", () => {
    expect(shouldPreserveStudent3dFollowCameraOffset({
      attachedFollow: true,
      sameRoute: false,
      sameViewportSize: true,
    })).toBe(false);
    expect(shouldPreserveStudent3dFollowCameraOffset({
      attachedFollow: true,
      sameRoute: true,
      sameViewportSize: false,
    })).toBe(false);
    expect(shouldPreserveStudent3dFollowCameraOffset({
      attachedFollow: false,
      sameRoute: true,
      sameViewportSize: true,
    })).toBe(false);
  });

  it("uses the local scene Follow default when no bookmark exists and the current camera is a floor fit", () => {
    const sceneDefault = [2, 10, 8] as [number, number, number];
    const recovered = student3dFollowCameraOffsetForRecovery(
      null,
      [45, 55, 65],
      sceneDefault,
      4,
      80,
      false,
    );
    expect(recovered).toEqual(sceneDefault);
    expect(Math.hypot(...recovered)).toBeLessThan(14);
  });

  it("clamps distance to renderer limits while preserving yaw and pitch", () => {
    const clamped = clampStudent3dCameraOffset([30, 40, 0], 4, 20);
    expect(Math.hypot(...clamped)).toBeCloseTo(20);
    expect(clamped[0] / clamped[1]).toBeCloseTo(30 / 40);
    expect(clampStudent3dCameraOffset([30, 40, 0], 4, 8)).toEqual([4.8, 6.4, 0]);
  });
});
