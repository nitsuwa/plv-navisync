import { describe, expect, it } from "vitest";
import type { FloorFurniture, FloorPlan } from "../../components/map-builder/types";
import {
  fitEventViewport,
  getFloorPlanContentBounds,
  getContentPanBounds,
  getSmoothZoomTarget,
  normalizeWheelDelta,
} from "../eventViewport";

const floorPlan: FloorPlan = {
  id: "floor-1",
  buildingId: "building-1",
  number: 1,
  label: "Ground Floor",
  canvasW: 1000,
  canvasH: 700,
  rooms: [{
    id: "room-1",
    name: "Hall",
    type: "room",
    x: 100,
    y: 80,
    w: 300,
    h: 180,
    floorId: "floor-1",
    buildingId: "building-1",
  }],
  paths: [],
  walls: [],
  doors: [],
  windows: [],
  furniture: [],
  stairs: [],
  ramps: [],
  elevators: [],
  labels: [],
};

const overlayFurniture: FloorFurniture[] = [{
  id: "event-table",
  type: "table",
  name: "Table",
  category: "events",
  x: 470,
  y: 120,
  width: 120,
  height: 80,
  rotation: 0,
  color: "#0ea5e9",
}];

describe("event viewport helpers", () => {
  it("normalizes wheel input into predictable screen-space pan deltas", () => {
    expect(normalizeWheelDelta({ deltaX: 12, deltaY: 24, deltaMode: 0 })).toEqual({ x: -12, y: -24 });
    expect(normalizeWheelDelta({ deltaX: 0, deltaY: 3, deltaMode: 1 })).toEqual({ x: 0, y: -48 });
    expect(normalizeWheelDelta({ deltaX: 0, deltaY: 3, deltaMode: 1, shiftKey: true })).toEqual({ x: -48, y: 0 });
  });

  it("uses a gradual exponential zoom step instead of a large linear jump", () => {
    const zoomOut = getSmoothZoomTarget(1, 100, 0.25, 4);
    const zoomIn = getSmoothZoomTarget(1, -100, 0.25, 4);

    expect(zoomOut).toBeGreaterThan(0.8);
    expect(zoomOut).toBeLessThan(1);
    expect(zoomIn).toBeGreaterThan(1);
    expect(zoomIn).toBeLessThan(1.2);
  });

  it("fits authored floor content plus event additions and falls back to the full canvas", () => {
    expect(getFloorPlanContentBounds(floorPlan, overlayFurniture, [])).toEqual({
      x: 100,
      y: 80,
      width: 490,
      height: 180,
    });

    expect(getFloorPlanContentBounds({ ...floorPlan, rooms: [] }, [], [])).toEqual({
      x: 0,
      y: 0,
      width: 1000,
      height: 700,
    });
  });

  it("centers the fitted content in the available viewport", () => {
    const fitted = fitEventViewport({
      canvasWidth: 1000,
      canvasHeight: 700,
      contentBounds: { x: 100, y: 80, width: 490, height: 180 },
      viewportWidth: 1000,
      viewportHeight: 600,
      padding: 48,
      minZoom: 0.25,
      maxZoom: 4,
    });

    expect(fitted.zoom).toBeCloseTo(1.844897959, 8);
    expect(fitted.pan.x).toBeCloseTo(-136.4897959, 6);
    expect(fitted.pan.y).toBeCloseTo(-13.6326531, 6);
  });

  it("keeps focused content reachable while allowing a small workspace gutter", () => {
    expect(getContentPanBounds({
      contentBounds: { x: 0, y: 0, width: 550, height: 400 },
      viewportWidth: 1588,
      viewportHeight: 700,
      zoom: 1.2,
      padding: 64,
    })).toEqual({
      minX: -596,
      maxX: 1524,
      minY: -416,
      maxY: 636,
    });
  });
});
