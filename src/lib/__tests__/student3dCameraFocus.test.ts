import { describe, expect, it } from "vitest";
import { student3dBoundsFromPoints, student3dFocusDistance, student3dFocusDistanceForViewport, student3dIndoorArrivalCameraDirection, student3dIndoorFollowCameraOffset, student3dSafeFocusCenter, student3dSafeFocusOffset, student3dSafeFocusRect, student3dShowcaseCameraDirection, studentMapOverlayIsBottomSheet } from "../student3dCameraFocus";

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

  it("returns the exposed mobile map rectangle above a bottom sheet", () => {
    expect(student3dSafeFocusRect(
      { left: 0, top: 0, width: 390, height: 844 },
      [{ left: 12, top: 500, width: 366, height: 300 }],
    )).toEqual({ left: 12, top: 12, width: 366, height: 476 });

    // The SOS arrival sheet can begin above the canvas midpoint on a short
    // mobile screen. It is still a bottom sheet, not a left-side panel.
    expect(student3dSafeFocusRect(
      { left: 0, top: 0, width: 390, height: 779 },
      [{ left: 8, top: 267, width: 374, height: 511 }],
    )).toEqual({ left: 12, top: 12, width: 366, height: 243 });

    // Route sheets sit above the mobile navigation bar, so their bottom can
    // be farther than 48px from the canvas edge while still being anchored.
    expect(student3dSafeFocusRect(
      { left: 0, top: 0, width: 390, height: 844 },
      [{ left: 8, top: 278, width: 374, height: 490 }],
    )).toEqual({ left: 12, top: 12, width: 366, height: 254 });
  });

  it("recognizes an expanded sheet that starts above the midpoint on a short phone", () => {
    expect(studentMapOverlayIsBottomSheet(
      { left: 0, top: 0, width: 320, height: 568 },
      { left: 8, top: 162, width: 304, height: 330 },
    )).toBe(true);
    expect(studentMapOverlayIsBottomSheet(
      { left: 0, top: 0, width: 320, height: 568 },
      { left: 8, top: 150, width: 304, height: 120 },
    )).toBe(false);
  });

  it("keeps a narrow mobile utility rail out of the exposed focus area", () => {
    expect(student3dSafeFocusRect(
      { left: 0, top: 0, width: 390, height: 844 },
      [{ left: 340, top: 590, width: 44, height: 230 }],
    )).toEqual({ left: 12, top: 12, width: 316, height: 820 });
  });

  it("reserves mobile header, floor-picker, utility-rail and bottom-action space without treating top controls as a side panel", () => {
    expect(student3dSafeFocusRect(
      { left: 0, top: 0, width: 390, height: 779 },
      [
        { left: 8, top: 8, width: 318, height: 54 },
        { left: 255, top: 71, width: 127, height: 44 },
        { left: 334, top: 573, width: 44, height: 194 },
        { left: 12, top: 723, width: 229, height: 44 },
      ],
    )).toEqual({ left: 12, top: 127, width: 310, height: 584 });
  });

  it("keeps a portrait-tablet floor fit out of its top picker and bottom action row", () => {
    expect(student3dSafeFocusRect(
      { left: 0, top: 0, width: 768, height: 1024 },
      [
        { left: 16, top: 8, width: 520, height: 54 },
        { left: 630, top: 71, width: 120, height: 44 },
        { left: 710, top: 700, width: 44, height: 280 },
        { left: 12, top: 950, width: 230, height: 44 },
      ],
    )).toEqual({ left: 12, top: 127, width: 686, height: 811 });
  });

  it("preserves landscape desktop framing around a compact upper control", () => {
    expect(student3dSafeFocusRect(
      { left: 0, top: 0, width: 1440, height: 900 },
      [{ left: 1200, top: 71, width: 220, height: 44 }],
    )).toEqual({ left: 12, top: 12, width: 1416, height: 876 });
  });

  it("frames larger architectural targets farther away than small targets", () => {
    const fov = 44;
    const aspect = 1.5;
    const small = student3dFocusDistance(0.8, 0.8, 1.2, fov, aspect);
    const building = student3dFocusDistance(5, 3, 1.3, fov, aspect);
    expect(building).toBeGreaterThan(small);
    expect(student3dFocusDistance(0.2, 0.2, 0.2, fov, aspect)).toBe(5.5);
  });

  it("frames authored indoor content without including empty canvas margins", () => {
    expect(student3dBoundsFromPoints(
      [{ x: 180, y: 120 }, { x: 720, y: 580 }, { x: Number.NaN, y: 4 }],
      { x: 0, y: 0, width: 1200, height: 900 },
    )).toEqual({ x: 180, y: 120, width: 540, height: 460 });
    expect(student3dBoundsFromPoints([], { x: -24, y: 0, width: 980, height: 760 }))
      .toEqual({ x: -24, y: 0, width: 980, height: 760 });
  });

  it("derives a lower three-quarter showcase direction from the authored front entrance", () => {
    const southEntrance = student3dShowcaseCameraDirection({ x: 50, y: 50 }, { x: 50, y: 100 });
    const eastEntrance = student3dShowcaseCameraDirection({ x: 50, y: 50 }, { x: 100, y: 50 });

    expect(southEntrance).not.toBeNull();
    expect(eastEntrance).not.toBeNull();
    expect(southEntrance!.y).toBeLessThan(0.6);
    expect(southEntrance!.z).toBeGreaterThan(0);
    expect(eastEntrance!.x).toBeGreaterThan(0);
    expect(Math.hypot(southEntrance!.x, southEntrance!.y, southEntrance!.z)).toBeCloseTo(1);
    expect(student3dShowcaseCameraDirection({ x: 50, y: 50 }, { x: 50, y: 50 })).toBeNull();
  });

  it("frames an indoor Follow camera behind the actual route direction", () => {
    const eastbound = student3dIndoorFollowCameraOffset({ x: 10, y: 20 }, { x: 30, y: 20 }, 12);
    const northbound = student3dIndoorFollowCameraOffset({ x: 10, y: 20 }, { x: 10, y: 40 }, 12);

    expect(eastbound).not.toBeNull();
    expect(northbound).not.toBeNull();
    expect(eastbound!.x).toBeLessThan(0);
    expect(northbound!.z).toBeLessThan(0);
    expect(Math.hypot(eastbound!.x, eastbound!.y, eastbound!.z)).toBeCloseTo(12);
    expect(student3dIndoorFollowCameraOffset({ x: 10, y: 20 }, { x: 10, y: 20 }, 12)).toBeNull();
  });

  it("frames indoor arrival from the final nonzero route approach", () => {
    const eastbound = student3dIndoorArrivalCameraDirection([
      { x: 10, y: 20 }, { x: 25, y: 20 }, { x: 25, y: 20 },
    ]);
    const northbound = student3dIndoorArrivalCameraDirection([
      { x: 10, y: 20 }, { x: 10, y: 34 },
    ]);

    expect(eastbound).not.toBeNull();
    expect(northbound).not.toBeNull();
    expect(eastbound!.x).toBeLessThan(0);
    expect(northbound!.z).toBeLessThan(0);
    expect(Math.hypot(eastbound!.x, eastbound!.y, eastbound!.z)).toBeCloseTo(1);
    expect(student3dIndoorArrivalCameraDirection([{ x: 10, y: 20 }, { x: 10, y: 20 }])).toBeNull();
  });

  it("backs the mobile focus camera away when a sheet reduces the exposed map height", () => {
    const fullMap = student3dFocusDistanceForViewport(4, 3, 3.1, 42, 844, 390, 820);
    const aboveSheet = student3dFocusDistanceForViewport(4, 3, 3.1, 42, 844, 366, 476);
    expect(aboveSheet).toBeGreaterThan(fullMap);
  });

  it("fits an indoor route to the expanded sheet's visible map area on a short phone", () => {
    const map = { left: 0, top: 0, width: 320, height: 503 };
    const compact = student3dSafeFocusRect(map, [{ left: 8, top: 363, width: 304, height: 140 }]);
    const expanded = student3dSafeFocusRect(map, [{ left: 8, top: 162, width: 304, height: 330 }]);
    const compactFit = student3dFocusDistanceForViewport(3.6, 2.4, 2.9, 42, map.height, compact.width, compact.height);
    const expandedFit = student3dFocusDistanceForViewport(3.6, 2.4, 2.9, 42, map.height, expanded.width, expanded.height);

    expect(expanded.height).toBeLessThan(compact.height);
    expect(expandedFit).toBeGreaterThan(compactFit);
  });

  it("offsets the Follow camera target into the visible map area above a mobile route sheet", () => {
    const offset = student3dSafeFocusOffset(
      { left: 0, top: 0, width: 390, height: 844 },
      [{ left: 12, top: 500, width: 366, height: 300 }],
      12,
      44,
    );
    expect(offset.right).toBeCloseTo(0);
    expect(offset.up).toBeLessThan(0);
    expect(Math.abs(offset.up)).toBeGreaterThan(1.5);
  });
});
