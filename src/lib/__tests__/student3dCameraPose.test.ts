import { describe, expect, it } from "vitest";
import {
  clampStudent3dCameraOffset,
  student3dCameraOffsetFromPose,
  student3dCameraPoseAtTarget,
  student3dFollowCameraOffsetForRecovery,
} from "../student3dCameraPose";

describe("3D Follow camera pose recovery", () => {
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
