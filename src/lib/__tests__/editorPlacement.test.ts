import { describe, it, expect } from "vitest";
import {
  screenToWorld,
  computeBuildingPlacement,
  shouldDrawNavConnector,
  resetTransientToolState,
  MIN_BUILDING_W,
  MIN_BUILDING_H,
} from "../editorPlacement";

const RECT = { left: 100, top: 50, width: 900, height: 680 };

describe("screenToWorld (canvas coordinate conversion)", () => {
  it("returns the identity mapping at zoom 1 with no pan", () => {
    const p = screenToWorld(100 + 450, 50 + 340, RECT, 900, 680, { x: 0, y: 0 }, 1);
    expect(p.x).toBeCloseTo(450, 6);
    expect(p.y).toBeCloseTo(340, 6);
  });

  it("accounts for pan offset", () => {
    const p = screenToWorld(100 + 450, 50 + 340, RECT, 900, 680, { x: 200, y: -50 }, 1);
    expect(p.x).toBeCloseTo(250, 6);
    expect(p.y).toBeCloseTo(390, 6);
  });

  it("scales correctly when zoomed (world point under cursor stays fixed)", () => {
    // At zoom 2 the same screen pixel maps to half the world offset from origin
    const p = screenToWorld(100 + 450, 50 + 340, RECT, 900, 680, { x: 0, y: 0 }, 2);
    expect(p.x).toBeCloseTo(225, 6);
    expect(p.y).toBeCloseTo(170, 6);
  });

  it("is invertible with the render transform (world → screen → world)", () => {
    const zoom = 1.6;
    const pan = { x: 120, y: -80 };
    // world → screen
    const sx = RECT.left + ((450 * zoom + pan.x) / 900) * RECT.width;
    const sy = RECT.top + ((340 * zoom + pan.y) / 680) * RECT.height;
    // screen → world (the function under test)
    const back = screenToWorld(sx, sy, RECT, 900, 680, pan, zoom);
    expect(back.x).toBeCloseTo(450, 6);
    expect(back.y).toBeCloseTo(340, 6);
  });
});

describe("computeBuildingPlacement (drag-to-create geometry)", () => {
  it("builds the drag box with shared preview/final geometry", () => {
    const r = computeBuildingPlacement(100, 200, 300, 350, 900, 680);
    expect(r).toEqual({ x: 100, y: 200, width: 200, height: 150 });
  });

  it("a plain click (no drag) yields the minimum footprint at the click point — never at (0,0)", () => {
    const r = computeBuildingPlacement(320, 240, 320, 240, 900, 680);
    expect(r).toEqual({ x: 320, y: 240, width: MIN_BUILDING_W, height: MIN_BUILDING_H });
    expect(r.x).not.toBe(0);
    expect(r.y).not.toBe(0);
  });

  it("flips the box when the drag goes up/left (cx < sx)", () => {
    const r = computeBuildingPlacement(300, 250, 100, 150, 900, 680);
    expect(r).toEqual({ x: 100, y: 150, width: 200, height: 100 });
  });

  it("clamps the final building inside the canvas", () => {
    const r = computeBuildingPlacement(850, 600, 950, 700, 900, 680);
    expect(r.x + r.width).toBeLessThanOrEqual(900);
    expect(r.y + r.height).toBeLessThanOrEqual(680);
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.y).toBeGreaterThanOrEqual(0);
  });

  it("enforces minimum width/height even for a tiny drag", () => {
    const r = computeBuildingPlacement(400, 300, 405, 305, 900, 680);
    expect(r.width).toBe(MIN_BUILDING_W);
    expect(r.height).toBe(MIN_BUILDING_H);
  });

  it("is stable when called twice with the same drag (preview == final)", () => {
    const a = computeBuildingPlacement(50, 60, 220, 180, 900, 680);
    const b = computeBuildingPlacement(50, 60, 220, 180, 900, 680);
    expect(a).toEqual(b);
  });
});

describe("shouldDrawNavConnector (green dotted line)", () => {
  it("draws nothing when the building has no nav data at all", () => {
    expect(shouldDrawNavConnector("b1", [])).toBe(false);
    expect(shouldDrawNavConnector("b1", [{ id: "n1", buildingId: "b2" }])).toBe(false);
    expect(shouldDrawNavConnector("new-bldg", [], undefined)).toBe(false);
  });

  it("draws only when a nav node references the building (user created nav data)", () => {
    expect(shouldDrawNavConnector("b1", [{ id: "n1", buildingId: "b1" }])).toBe(true);
  });

  it("draws when the building is linked to the network via entranceNodeId", () => {
    // entranceNodeId is set from the Properties panel and is the authoritative
    // link used by TestNavigationPanel
    expect(shouldDrawNavConnector("b1", [], "n1")).toBe(true);
    expect(shouldDrawNavConnector("b1", [{ id: "n2", buildingId: "b1" }], "n1")).toBe(true);
  });
});

describe("resetTransientToolState (tool/layer switch cleanup)", () => {
  it("returns a fully cleared transient state", () => {
    const reset = resetTransientToolState();
    expect(reset.drawingPath).toEqual([]);
    expect(reset.buildingDrag).toBeNull();
    expect(reset.rubberBand).toBeNull();
    expect(reset.selectedBuildingType).toBeNull();
    expect(reset.guides).toEqual([]);
  });

  it("returns a fresh object every call (no shared references)", () => {
    const a = resetTransientToolState();
    a.drawingPath.push({ x: 1, y: 1 });
    const b = resetTransientToolState();
    expect(b.drawingPath).toEqual([]);
  });
});
