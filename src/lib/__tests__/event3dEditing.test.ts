import { describe, expect, it } from "vitest";
import type { FloorFurniture, FloorLabel } from "../../components/map-builder/types";
import { beginEvent3DGesture, event3DPointToLayout, event3DSelectionIds, mergeEvent3DChanges, previewEvent3DGesture } from "../event3dEditing";

const chair: FloorFurniture = { id: "a", type: "chair", category: "event", name: "Chair", x: 20, y: 30, width: 20, height: 10, rotation: 0, color: "#123456" };
const label: FloorLabel = { id: "label", x: 20, y: 30, text: "Welcome", fontSize: 14, color: "#111111", rotation: 0 };
const bounds = { width: 400, height: 300 };
describe("direct event 3D geometry", () => {
  it("inverts indoor floor coordinates without applying asset-center offsets", () => {
    expect(event3DPointToLayout({ x: -8.25, z: -4.5 }, { scale: 0.025, originX: 450, originY: 340 })).toEqual({ x: 120, y: 160 });
  });
  it("inverts outdoor authored coordinates", () => {
    expect(event3DPointToLayout({ x: 7.5, z: 5 }, { scale: 0.01, originX: 0, originY: 0 })).toEqual({ x: 750, y: 500 });
  });
  it("rejects an invalid ray sample or zero scale", () => {
    expect(event3DPointToLayout({ x: NaN, z: 1 }, { scale: 0.01, originX: 0, originY: 0 })).toBeNull();
    expect(event3DPointToLayout({ x: 1, z: 1 }, { scale: 0, originX: 0, originY: 0 })).toBeNull();
  });
  it("moves from the captured origin without mutating the input", () => {
    const start = { furniture: [chair], labels: [] };
    const gesture = beginEvent3DGesture(start, "a", "move", { x: 25, y: 35 }, bounds)!;
    expect(previewEvent3DGesture(gesture, { x: 75, y: 95 }).furniture[0]).toMatchObject({ x: 70, y: 90, width: 20, height: 10 });
    expect(start.furniture[0]).toMatchObject({ x: 20, y: 30 });
    expect(previewEvent3DGesture(gesture, { x: 35, y: 45 }).furniture[0]).toMatchObject({ x: 30, y: 40 });
  });
  it("snaps a moved item in map units", () => {
    const gesture = beginEvent3DGesture({ furniture: [chair], labels: [] }, "a", "move", { x: 25, y: 35 }, bounds, 10)!;
    expect(previewEvent3DGesture(gesture, { x: 38, y: 43 }).furniture[0]).toMatchObject({ x: 30, y: 40 });
  });
  it("moves a group together and clamps its outer member", () => {
    const start = { furniture: [{ ...chair, groupId: "g" }, { ...chair, id: "b", x: 60, groupId: "g" }], labels: [] };
    expect(event3DSelectionIds(start, "a")).toEqual(["a", "b"]);
    const gesture = beginEvent3DGesture(start, "a", "move", { x: 25, y: 35 }, { width: 100, height: 100 })!;
    expect(previewEvent3DGesture(gesture, { x: 95, y: 35 }).furniture.map(item => item.x)).toEqual([40, 80]);
  });
  it("does not partially move a group with a locked member", () => {
    const start = { furniture: [{ ...chair, groupId: "g" }, { ...chair, id: "b", x: 60, groupId: "g", locked: true }], labels: [] };
    expect(beginEvent3DGesture(start, "a", "move", { x: 25, y: 35 }, bounds)).toBeNull();
    expect(beginEvent3DGesture(start, "a", "resize", { x: 25, y: 35 }, bounds)).toBeNull();
  });
  it("normalizes a rotation across 360 degrees", () => {
    const start = { furniture: [{ ...chair, x: 100, y: 100, width: 20, height: 20, rotation: 350 }], labels: [] };
    const gesture = beginEvent3DGesture(start, "a", "rotate", { x: 120, y: 110 }, bounds)!;
    expect(previewEvent3DGesture(gesture, { x: 110, y: 120 }).furniture[0].rotation).toBe(80);
  });
  it("resizes a rotated southeast handle with its opposite corner fixed", () => {
    const start = { furniture: [{ ...chair, x: 100, y: 100, width: 40, height: 20, rotation: 90 }], labels: [] };
    const gesture = beginEvent3DGesture(start, "a", "resize", { x: 110, y: 130 }, bounds)!;
    // Both rectangles retain the rotated northwest corner at (130, 90).
    expect(previewEvent3DGesture(gesture, { x: 100, y: 150 }).furniture[0]).toMatchObject({ x: 85, y: 105, width: 60, height: 30, rotation: 90 });
  });
  it("moves labels using their anchor and retains their text", () => {
    const gesture = beginEvent3DGesture({ furniture: [], labels: [label] }, "label", "move", { x: 20, y: 30 }, bounds)!;
    expect(previewEvent3DGesture(gesture, { x: 35, y: 55 }).labels[0]).toMatchObject({ x: 35, y: 55, text: "Welcome" });
  });
  it("refuses stale or newly locked transactions", () => {
    const start = { furniture: [chair], labels: [] }, next = { furniture: [{ ...chair, x: 70 }], labels: [] };
    expect(mergeEvent3DChanges({ furniture: [{ ...chair, x: 50 }], labels: [] }, start, next)).toBeNull();
    expect(mergeEvent3DChanges({ furniture: [{ ...chair, locked: true }], labels: [] }, start, next)).toBeNull();
    expect(mergeEvent3DChanges({ furniture: [], labels: [] }, start, next)).toBeNull();
  });
  it("merges a completed move without replacing unrelated current changes", () => {
    const start = { furniture: [chair], labels: [label] }, next = { furniture: [{ ...chair, x: 70 }], labels: [label] };
    const current = { furniture: [chair, { ...chair, id: "new", x: 200 }], labels: [{ ...label, text: "Latest welcome" }] };
    expect(mergeEvent3DChanges(current, start, next)).toEqual({ furniture: [{ ...chair, x: 70 }, current.furniture[1]], labels: current.labels });
  });
  it("rejects invalid geometry and copies only editable geometry fields", () => {
    const start = { furniture: [chair], labels: [] };
    expect(mergeEvent3DChanges(start, start, { furniture: [{ ...chair, x: NaN }], labels: [] })).toBeNull();
    const result = mergeEvent3DChanges(start, start, { furniture: [{ ...chair, x: 70, name: "Injected rename", color: "#ffffff" }], labels: [] });
    expect(result?.furniture[0]).toMatchObject({ x: 70, name: "Chair", color: "#123456" });
  });
});
