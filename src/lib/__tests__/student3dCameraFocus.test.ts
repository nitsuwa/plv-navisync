import { describe, expect, it } from "vitest";
import { student3dFocusDistance, student3dSafeFocusCenter } from "../student3dCameraFocus";

describe("student 3D selection camera framing", () => {
  it("moves the focus center away from a desktop info rail and mobile bottom sheet", () => {
    expect(student3dSafeFocusCenter(
      { left: 0, top: 0, width: 1200, height: 800 },
      [{ left: 820, top: 0, width: 380, height: 800 }],
    )).toEqual({ x: 410, y: 400 });

    expect(student3dSafeFocusCenter(
      { left: 0, top: 0, width: 390, height: 844 },
      [{ left: 12, top: 500, width: 366, height: 300 }],
    )).toEqual({ x: 195, y: 250 });
  });

  it("frames larger architectural targets farther away than small targets", () => {
    const fov = 44;
    const aspect = 1.5;
    const small = student3dFocusDistance(0.8, 0.8, 1.2, fov, aspect);
    const building = student3dFocusDistance(5, 3, 1.3, fov, aspect);
    expect(building).toBeGreaterThan(small);
    expect(student3dFocusDistance(0.2, 0.2, 0.2, fov, aspect)).toBe(5.5);
  });
});
