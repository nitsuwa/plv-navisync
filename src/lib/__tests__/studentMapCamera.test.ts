import { describe, expect, it } from "vitest";
import { getStudentFloorInspectionSlack, getStudentOverviewCamera, getStudentRoomFocusCamera, getStudentRoomFocusProgress } from "../studentMapCamera";

describe("student overview camera", () => {
  it("fits mapped campus content into the safe mobile viewport instead of the whole empty canvas", () => {
    const camera = getStudentOverviewCamera({
      mapWidth: 1_200,
      mapHeight: 800,
      viewportWidth: 390,
      viewportHeight: 800,
      content: { x: 250, y: 180, width: 700, height: 420 },
      insets: { top: 176, right: 64, bottom: 132, left: 8 },
      fillRatio: 0.82,
    });

    expect(camera.zoom).toBeGreaterThan(1);
    expect(camera.pan.x).not.toBe(0);
    expect(camera.pan.y).not.toBe(0);
  });

  it("centers structural floor bounds while accounting for the rendered floor offset", () => {
    const camera = getStudentOverviewCamera({
      mapWidth: 700,
      mapHeight: 500,
      viewportWidth: 390,
      viewportHeight: 760,
      content: { x: 0, y: 0, width: 440, height: 290 },
      contentOffset: { x: 130, y: 105 },
      insets: { top: 88, right: 8, bottom: 112, left: 8 },
      fillRatio: 1.35,
    });

    expect(camera.zoom).toBeGreaterThan(1);
    expect(Number.isFinite(camera.pan.x)).toBe(true);
    expect(Number.isFinite(camera.pan.y)).toBe(true);
  });

  it("gives indoor panning a finite, proportional inspection range", () => {
    expect(getStudentFloorInspectionSlack(390, 760, true)).toEqual({ x: 156, y: 304 });
    expect(getStudentFloorInspectionSlack(1_280, 800, false)).toEqual({ x: 320, y: 200 });
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
    expect(getStudentRoomFocusProgress(165)).toBeGreaterThan(0.8);
    expect(getStudentRoomFocusProgress(330)).toBe(1);
    expect(getStudentRoomFocusProgress(800)).toBe(1);
  });
});
