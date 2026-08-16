import { describe, expect, it } from "vitest";
import {
  createFittedFloorPlanBackground,
  createFloorScaleCalibration,
  fitFloorPlanBackgroundToFloor,
  measureDistanceMeters,
  normalizeFloorPlanBackground,
  resetFloorPlanBackgroundPosition,
  validateFloorPlanImage,
} from "../floorPlanBackground";

function file(name: string, type: string, size = 1024) {
  return { name, type, size } as File;
}

describe("floorPlanBackground", () => {
  it("validates the approved floor-plan image formats", () => {
    expect(() => validateFloorPlanImage(file("plan.png", "image/png"))).not.toThrow();
    expect(() => validateFloorPlanImage(file("plan.jpg", "image/jpeg"))).not.toThrow();
    expect(() => validateFloorPlanImage(file("plan.jpeg", "image/jpeg"))).not.toThrow();
    expect(() => validateFloorPlanImage(file("plan.webp", "image/webp"))).not.toThrow();
    expect(() => validateFloorPlanImage(file("plan.gif", "image/gif"))).toThrow(/PNG, JPG, JPEG, or WebP/);
    expect(() => validateFloorPlanImage(file("plan.png", "image/png", 16 * 1024 * 1024))).toThrow(/15 MB/);
  });

  it("normalizes reference background state without distorting transforms", () => {
    const background = normalizeFloorPlanBackground({
      storagePath: "c/b/f/plan.png",
      fileName: "plan.png",
      mimeType: "image/png",
      size: 123,
      visible: false,
      opacity: 2,
      locked: false,
      x: 12,
      y: 18,
      width: 300,
      height: 200,
      rotation: 15,
    }, 580, 380);

    expect(background).toMatchObject({
      storagePath: "c/b/f/plan.png",
      visible: false,
      opacity: 1,
      locked: false,
      x: 12,
      y: 18,
      width: 300,
      height: 200,
      rotation: 15,
    });
    expect(fitFloorPlanBackgroundToFloor(background, 580, 380)).toMatchObject({ x: 0, y: 0, width: 580, height: 380, rotation: 0 });
    expect(resetFloorPlanBackgroundPosition(background)).toMatchObject({ x: 0, y: 0, width: 300, height: 200, rotation: 0 });
  });

  it("creates imported backgrounds locked and fit to the current floor by default", () => {
    const background = createFittedFloorPlanBackground({
      storagePath: "c/b/f/plan.webp",
      fileName: "plan.webp",
      mimeType: "image/webp",
      size: 99,
      canvasW: 220,
      canvasH: 160,
      naturalWidth: 2000,
      naturalHeight: 1000,
    });

    expect(background).toMatchObject({
      visible: true,
      opacity: 0.55,
      locked: true,
      x: 0,
      y: 0,
      width: 220,
      height: 160,
      naturalWidth: 2000,
      naturalHeight: 1000,
    });
  });

  it("computes calibration and measured distance only from a valid real scale", () => {
    const calibration = createFloorScaleCalibration({ x: 0, y: 0 }, { x: 200, y: 0 }, 10);
    expect(calibration.metersPerUnit).toBeCloseTo(0.05);
    expect(calibration.editorDistance).toBe(200);
    expect(measureDistanceMeters({ x: 0, y: 0 }, { x: 0, y: 40 }, calibration)).toBeCloseTo(2);
    expect(measureDistanceMeters({ x: 0, y: 0 }, { x: 0, y: 40 }, undefined)).toBeNull();
    expect(() => createFloorScaleCalibration({ x: 1, y: 1 }, { x: 1, y: 1 }, 10)).toThrow(/two different/);
    expect(() => createFloorScaleCalibration({ x: 0, y: 0 }, { x: 10, y: 0 }, 0)).toThrow(/greater than zero/);
  });
});
