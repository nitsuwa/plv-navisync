import { describe, expect, it } from "vitest";
import {
  STUDENT_MAP_MAX_ZOOM,
  STUDENT_MAP_MIN_ZOOM,
  clampStudentMapZoom,
  clampViewportPan,
  dampCameraZoomLogarithm,
  getCameraSmoothingFactor,
  getBuildingFocusPan,
  getPanToKeepWorldPoint,
  getSoftBoundedPan,
  getViewportFitZoom,
  getViewportPanBounds,
  normalizeStudentMapWheelDelta,
} from "../mapViewport";

describe("student map viewport", () => {
  it("keeps zoom-out above the readable map limit", () => {
    expect(clampStudentMapZoom(0.1)).toBe(STUDENT_MAP_MIN_ZOOM);
    expect(clampStudentMapZoom(STUDENT_MAP_MIN_ZOOM - 0.01)).toBe(STUDENT_MAP_MIN_ZOOM);
  });

  it("keeps zoom-in bounded and normalizes invalid values", () => {
    expect(clampStudentMapZoom(9)).toBe(STUDENT_MAP_MAX_ZOOM);
    expect(clampStudentMapZoom(Number.NaN)).toBe(1);
  });

  it("preserves continuous floating-point zoom values", () => {
    expect(clampStudentMapZoom(1.236)).toBe(1.236);
    expect(clampStudentMapZoom(1.823)).toBe(1.823);
  });

  it("uses refresh-rate-independent time-based camera damping", () => {
    const one60HzFrame = getCameraSmoothingFactor(1000 / 60);
    const two120HzFrames = 1 - (1 - getCameraSmoothingFactor(1000 / 120)) ** 2;
    expect(one60HzFrame).toBeCloseTo(two120HzFrames, 10);
    expect(getCameraSmoothingFactor(0)).toBe(0);
  });

  it("damps zoom in log space with refresh-rate-independent ratios", () => {
    const one60HzFrame = dampCameraZoomLogarithm(0.6, 2.4, 1000 / 60, 34);
    let two120HzFrames = 0.6;
    two120HzFrames = dampCameraZoomLogarithm(two120HzFrames, 2.4, 1000 / 120, 34);
    two120HzFrames = dampCameraZoomLogarithm(two120HzFrames, 2.4, 1000 / 120, 34);
    expect(Math.log(one60HzFrame / 0.6)).toBeCloseTo(Math.log(two120HzFrames / 0.6), 10);

    const lowerScale = dampCameraZoomLogarithm(0.5, 1, 17, 34) / 0.5;
    const higherScale = dampCameraZoomLogarithm(1, 2, 17, 34) / 1;
    expect(lowerScale).toBeCloseTo(higherScale, 10);
  });

  it("normalizes mouse wheel, trackpad, line, and page deltas into smooth zoom increments", () => {
    expect(normalizeStudentMapWheelDelta(100, 0)).toBeCloseTo(0.11);
    expect(normalizeStudentMapWheelDelta(3, 0)).toBeCloseTo(0.0033);
    expect(normalizeStudentMapWheelDelta(3, 1)).toBeCloseTo(0.0528);
    expect(normalizeStudentMapWheelDelta(1, 2, 600)).toBeCloseTo(0.2);
    expect(normalizeStudentMapWheelDelta(-10_000, 0)).toBe(-0.2);
  });
});
describe("getBuildingFocusPan", () => {
  it("uses the published campus canvas center instead of the legacy 900x680 center", () => {
    const pan = getBuildingFocusPan({
      buildingCenter: { x: 1_500, y: 500 },
      canvasW: 1_800,
      canvasH: 1_200,
      zoom: 1,
      mapWidth: 900,
      mapHeight: 600,
      isMobile: false,
    });

    expect(pan.x).toBeCloseTo(-680); // published center (-600) + desktop panel allowance (-80)
    expect(pan.y).toBeCloseTo(100);
  });

  it("places mobile focus in the visible map area above the detail sheet", () => {
    const pan = getBuildingFocusPan({
      buildingCenter: { x: 900, y: 900 },
      canvasW: 1_800,
      canvasH: 1_200,
      zoom: 1.4,
      mapWidth: 390,
      mapHeight: 622,
      isMobile: true,
    });

    expect(pan.x).toBeCloseTo(0);
    expect(pan.y).toBeLessThan(-500);
  });
});

describe("bounded map viewport", () => {
  const campus = {
    mapWidth: 1_800,
    mapHeight: 1_200,
    viewportWidth: 390,
    viewportHeight: 600,
  };

  it("calculates the fit zoom used as the viewer's minimum overview", () => {
    expect(getViewportFitZoom(campus)).toBeCloseTo(0.2167, 3);
  });

  it("keeps a viewer map fully bounded at the fit zoom", () => {
    const bounds = getViewportPanBounds({ ...campus, zoom: 1, padding: 0 });

    expect(bounds.minX).toBeCloseTo(0);
    expect(bounds.maxX).toBeCloseTo(0);
    expect(bounds.minY).toBeCloseTo(0);
    expect(bounds.maxY).toBeCloseTo(0);
  });

  it("clamps an over-dragged viewer map and recenters an undersized map", () => {
    const bounds = getViewportPanBounds({ ...campus, zoom: 2, padding: 0 });

    expect(clampViewportPan({ x: 400, y: 200 }, bounds)).toEqual({ x: 0, y: -600 });
    expect(clampViewportPan({ x: -500, y: 200 }, bounds)).toEqual({ x: -500, y: -600 });
  });

  it("allows a controlled editing margin without changing the map's authored bounds", () => {
    const viewer = getViewportPanBounds({ ...campus, zoom: 2, padding: 0 });
    const editor = getViewportPanBounds({ ...campus, zoom: 2, padding: 160 });

    expect(editor.minX).toBeLessThan(viewer.minX);
    expect(editor.maxX).toBeGreaterThan(viewer.maxX);
  });

  it("adds a finite proportional inspection range for indoor viewers", () => {
    const normal = getViewportPanBounds({ ...campus, zoom: 2, zoomOrigin: "center" });
    const inspection = getViewportPanBounds({
      ...campus,
      zoom: 2,
      zoomOrigin: "center",
      inspectionSlack: { x: 156, y: 240 },
    });

    expect(inspection.minX).toBeLessThan(normal.minX);
    expect(inspection.maxX).toBeGreaterThan(normal.maxX);
    expect(inspection.minY).toBeLessThan(normal.minY);
    expect(inspection.maxY).toBeGreaterThan(normal.maxY);
  });

  it("resists over-panning softly and keeps extreme movement bounded", () => {
    const bounds = { minX: -100, maxX: 100, minY: -50, maxY: 50 };
    expect(getSoftBoundedPan({ x: 90, y: -20 }, bounds)).toEqual({ x: 90, y: -20 });
    const slightOverdrag = getSoftBoundedPan({ x: 110, y: -60 }, bounds, 1, 28);
    const extremeOverdrag = getSoftBoundedPan({ x: 10_000, y: -10_000 }, bounds, 1, 28);

    expect(slightOverdrag.x).toBeGreaterThan(100);
    expect(slightOverdrag.x).toBeLessThan(110);
    expect(extremeOverdrag.x).toBeLessThanOrEqual(128);
    expect(extremeOverdrag.y).toBeGreaterThanOrEqual(-78);
  });

  it("supports center-origin zoom transforms used by the student map", () => {
    const bounds = getViewportPanBounds({ ...campus, zoom: 2, padding: 0, zoomOrigin: "center" });

    expect(bounds.minX).toBeCloseTo(-900);
    expect(bounds.maxX).toBeCloseTo(900);
    expect(bounds.minY).toBeCloseTo(0);
    expect(bounds.maxY).toBeCloseTo(0);
  });

  it("reserves a safe area around fixed mobile map controls", () => {
    const unrestricted = getViewportPanBounds({
      ...campus,
      zoom: 4,
      zoomOrigin: "center",
    });
    const safeArea = getViewportPanBounds({
      ...campus,
      zoom: 4,
      zoomOrigin: "center",
      insets: { top: 220, right: 8, bottom: 104, left: 8 },
    });

    expect(safeArea.minX).toBeLessThan(unrestricted.minX);
    expect(safeArea.maxX).toBeGreaterThan(unrestricted.maxX);
    expect(safeArea.minY).toBeLessThan(unrestricted.minY);
    expect(safeArea.maxY).toBeGreaterThan(unrestricted.maxY);
  });

  it("expands the editor pan range when a right inspector reserves canvas space", () => {
    const normal = getViewportPanBounds({ ...campus, zoom: 2, padding: 160 });
    const inspectorOpen = getViewportPanBounds({
      ...campus,
      zoom: 2,
      padding: 160,
      insets: { right: 256 },
    });

    expect(inspectorOpen.minX).toBeLessThan(normal.minX);
    expect(inspectorOpen.maxX).toBe(normal.maxX);
  });

  it("bases pan limits on the complete Floor bounds, including negative extension origins", () => {
    const base = getViewportPanBounds({
      mapWidth: 600,
      mapHeight: 450,
      viewportWidth: 1_200,
      viewportHeight: 800,
      zoom: 2,
      padding: 0,
    });
    const withRightExtension = getViewportPanBounds({
      mapWidth: 800,
      mapHeight: 450,
      viewportWidth: 1_200,
      viewportHeight: 800,
      zoom: 2,
      padding: 0,
    });
    const withLeftExtension = getViewportPanBounds({
      mapWidth: 700,
      mapHeight: 450,
      viewportWidth: 1_200,
      viewportHeight: 800,
      zoom: 2,
      padding: 0,
      worldOrigin: { x: -100, y: 0 },
    });

    expect(withRightExtension.minX).toBeLessThan(base.minX);
    expect(withLeftExtension.minX).toBeCloseTo(-600);
    expect(withLeftExtension.maxX).toBeCloseTo(100);
  });

  it("keeps the cursor world point fixed when zooming from either transform origin", () => {
    expect(getPanToKeepWorldPoint({
      mapWidth: 1000,
      mapHeight: 600,
      worldPoint: { x: 250, y: 150 },
      pan: { x: -100, y: 50 },
      zoom: 1.5,
      nextZoom: 2,
      zoomOrigin: "center",
    })).toEqual({ x: 25, y: 125 });

    expect(getPanToKeepWorldPoint({
      mapWidth: 1000,
      mapHeight: 600,
      worldPoint: { x: 250, y: 150 },
      pan: { x: -100, y: 50 },
      zoom: 1.5,
      nextZoom: 2,
      zoomOrigin: "top-left",
    })).toEqual({ x: -225, y: -25 });
  });

  it("supports natural-pixel event canvases in both editor and viewer modes", () => {
    const bounds = getViewportPanBounds({
      mapWidth: 800,
      mapHeight: 600,
      viewportWidth: 390,
      viewportHeight: 500,
      zoom: 0.5,
      baseScale: 1,
      padding: 0,
    });

    expect(bounds.minX).toBeCloseTo(-10);
    expect(bounds.maxX).toBeCloseTo(0);
    expect(bounds.minY).toBeCloseTo(100);
    expect(bounds.maxY).toBeCloseTo(100);
  });
});
