import { describe, expect, it } from "vitest";
import { getStudentFloorInspectionSlack, getStudentOutdoorInspectionSlack, getStudentOverviewCamera, getStudentRoomFocusCamera, getStudentRoomFocusProgress } from "../studentMapCamera";
import { getViewportFitZoom, getViewportPanBounds, STUDENT_FLOOR_MAP_MAX_ZOOM, STUDENT_MAP_MAX_ZOOM } from "../mapViewport";

describe("student overview camera", () => {
  it("keeps the Campus overview cap while allowing the higher bounded Floor inspection zoom", () => {
    const cameraInput = {
      mapWidth: 900,
      mapHeight: 600,
      viewportWidth: 1_800,
      viewportHeight: 1_200,
      content: { x: 100, y: 80, width: 100, height: 60 },
      fillRatio: 1.35,
    };
    const campusCamera = getStudentOverviewCamera(cameraInput);
    const floorCamera = getStudentOverviewCamera({ ...cameraInput, maxZoom: STUDENT_FLOOR_MAP_MAX_ZOOM });

    expect(campusCamera.zoom).toBe(STUDENT_MAP_MAX_ZOOM);
    expect(floorCamera.zoom).toBe(STUDENT_FLOOR_MAP_MAX_ZOOM);
  });

  it("fits mapped campus content into the safe mobile viewport instead of the whole empty canvas", () => {
    const viewportWidth = 390;
    const viewportHeight = 800;
    const mapWidth = 1_200;
    const mapHeight = 800;
    const content = { x: 250, y: 180, width: 700, height: 420 };
    const insets = { top: 150, right: 44, bottom: 144, left: 8 };
    const camera = getStudentOverviewCamera({
      mapWidth,
      mapHeight,
      viewportWidth,
      viewportHeight,
      content,
      insets,
      fillRatio: 0.78,
    });

    expect(camera.zoom).toBeGreaterThan(1);
    expect(camera.pan.x).not.toBe(0);
    expect(camera.pan.y).not.toBe(0);
    const baseScale = Math.min(viewportWidth / mapWidth, viewportHeight / mapHeight);
    const campusWidthRatio = content.width * baseScale * camera.zoom / (viewportWidth - insets.left - insets.right);
    expect(campusWidthRatio).toBeCloseTo(0.78);
  });

  it("centers structural floor bounds while accounting for the rendered floor offset", () => {
    const viewportWidth = 390;
    const viewportHeight = 760;
    const mapWidth = 700;
    const mapHeight = 500;
    const content = { x: 0, y: 0, width: 440, height: 290 };
    const insets = { top: 124, right: 8, bottom: 140, left: 8 };
    const camera = getStudentOverviewCamera({
      mapWidth,
      mapHeight,
      viewportWidth,
      viewportHeight,
      content,
      contentOffset: { x: 130, y: 105 },
      insets,
      fillRatio: 1,
    });

    expect(camera.zoom).toBeGreaterThan(1);
    expect(Number.isFinite(camera.pan.x)).toBe(true);
    expect(Number.isFinite(camera.pan.y)).toBe(true);
    const baseScale = Math.min(viewportWidth / mapWidth, viewportHeight / mapHeight);
    const floorWidthRatio = content.width * baseScale * camera.zoom / (viewportWidth - insets.left - insets.right);
    expect(floorWidthRatio).toBeCloseTo(1);
  });

  it("preserves the higher bounded inspection zoom when focusing an indoor room", () => {
    const camera = getStudentRoomFocusCamera({
      mapWidth: 700,
      mapHeight: 500,
      roomBounds: { x: 300, y: 220, width: 80, height: 50 },
      currentPan: { x: 0, y: 0 },
      zoom: 4.8,
      maxZoom: 5,
      visibleThreshold: 0,
    });

    expect(camera.zoom).toBe(4.8);
    expect(camera.shouldMove).toBe(false);
  });

  it("gives indoor panning a finite, proportional inspection range", () => {
    expect(getStudentFloorInspectionSlack(390, 760, true)).toEqual({ x: 156, y: 304 });
    expect(getStudentFloorInspectionSlack(1_280, 800, false)).toEqual({ x: 320, y: 200 });
  });

  it("gives outdoor panning a wider proportional inspection range", () => {
    const mobileSlack = getStudentOutdoorInspectionSlack(390, 760, true);
    expect(mobileSlack.x).toBeCloseTo(163.8);
    expect(mobileSlack.y).toBeCloseTo(319.2);
    expect(getStudentOutdoorInspectionSlack(1_280, 800, false)).toEqual({ x: 384, y: 240 });

    const fitScale = getViewportFitZoom({ mapWidth: 1_800, mapHeight: 1_200, viewportWidth: 390, viewportHeight: 760 });
    const bounds = getViewportPanBounds({
      mapWidth: 1_800,
      mapHeight: 1_200,
      viewportWidth: 390,
      viewportHeight: 760,
      zoom: 1,
      zoomOrigin: "center",
      inspectionSlack: mobileSlack,
    });
    expect(bounds.minX).toBeLessThan(-mobileSlack.x / fitScale * 0.99);
    expect(bounds.maxX).toBeGreaterThan(mobileSlack.x / fitScale * 0.99);
    expect(bounds.minY).toBeLessThan(0);
    expect(bounds.maxY).toBeGreaterThan(0);
  });

  it("keeps the camera still when a selected room is already comfortably visible", () => {
    const currentPan = { x: -18, y: 12 };
    const camera = getStudentRoomFocusCamera({
      mapWidth: 1_000,
      mapHeight: 700,
      roomBounds: { x: 420, y: 280, width: 160, height: 100 },
      currentPan,
      zoom: 1.1,
      insets: { top: 120, right: 80, bottom: 100, left: 40 },
    });

    expect(camera.shouldMove).toBe(false);
    expect(camera.pan).toBe(currentPan);
    expect(camera.zoom).toBe(1.1);
  });

  it("pans an off-screen room into the safe region while preserving zoom", () => {
    const camera = getStudentRoomFocusCamera({
      mapWidth: 1_000,
      mapHeight: 700,
      roomBounds: { x: 1_120, y: 520, width: 120, height: 90 },
      currentPan: { x: 0, y: 0 },
      zoom: 0.82,
      insets: { top: 130, right: 90, bottom: 150, left: 30 },
    });

    expect(camera.shouldMove).toBe(true);
    expect(camera.zoom).toBe(0.82);
    const tx = 500 * (1 - camera.zoom) + camera.pan.x;
    const ty = 350 * (1 - camera.zoom) + camera.pan.y;
    const centerX = tx + (1_120 + 60) * camera.zoom;
    const centerY = ty + (520 + 45) * camera.zoom;
    expect(centerX).toBeCloseTo((30 + (1_000 - 90)) / 2);
    expect(centerY).toBeCloseTo((130 + (700 - 150)) / 2);
  });

  it("uses measured card and planner insets as the camera focus area", () => {
    const camera = getStudentRoomFocusCamera({
      mapWidth: 900,
      mapHeight: 650,
      roomBounds: { x: 700, y: 500, width: 80, height: 60 },
      currentPan: { x: 0, y: 0 },
      zoom: 1,
      insets: { top: 150, right: 300, bottom: 210, left: 280 },
      contentOffset: { x: 40, y: 30 },
    });

    const focusX = 450 * (1 - camera.zoom) + camera.pan.x + (740 + 40) * camera.zoom;
    const focusY = 325 * (1 - camera.zoom) + camera.pan.y + (530 + 30) * camera.zoom;
    expect(focusX).toBeCloseTo((280 + 600) / 2);
    expect(focusY).toBeCloseTo((150 + 440) / 2);
    expect(camera.zoom).toBe(1);
  });

  it("can reveal an edge room without changing its scale or using a separate camera clamp", () => {
    const camera = getStudentRoomFocusCamera({
      mapWidth: 1_000,
      mapHeight: 700,
      roomBounds: { x: -80, y: -45, width: 90, height: 70 },
      currentPan: { x: 0, y: 0 },
      zoom: 1.25,
    });

    expect(camera.shouldMove).toBe(true);
    expect(camera.zoom).toBe(1.25);
    expect(camera.pan.x).toBeGreaterThan(0);
    expect(camera.pan.y).toBeGreaterThan(0);
  });

  it("uses a bounded ease-out for the 330ms room focus pan", () => {
    expect(getStudentRoomFocusProgress(0)).toBe(0);
    expect(getStudentRoomFocusProgress(400)).toBe(0.5);
    expect(getStudentRoomFocusProgress(800)).toBe(1);
    expect(getStudentRoomFocusProgress(1600)).toBe(1);
  });
});
