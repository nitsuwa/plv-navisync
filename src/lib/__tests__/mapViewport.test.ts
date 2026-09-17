import { describe, expect, it } from "vitest";
import {
  STUDENT_MAP_MAX_ZOOM,
  STUDENT_MAP_MIN_ZOOM,
  clampStudentMapZoom,
  clampViewportPan,
  getBuildingFocusPan,
  getPanToKeepWorldPoint,
  getViewportFitZoom,
  getViewportPanBounds,
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

  it("rounds valid zoom levels consistently", () => {
    expect(clampStudentMapZoom(1.236)).toBe(1.24);
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
