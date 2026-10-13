import { describe, it, expect } from "vitest";
import { getEventFurnitureTemplate, eventFurnitureFromTemplate } from "../../components/events/eventAssets";
import { eventAsset3DTransform } from "../event3dLayout";
import { beginEvent3DGesture } from "../event3dEditing";
import { constrainEventAsset, resetEventAssetSize, resizeEventAsset } from "../eventAssetSizing";
import { assessEventPlacement } from "../eventPlacementCandidate";

describe("consistent event reference sizing", () => {
  it("preserves small legacy footprints during boundary and rotation edits", () => {
    const chair = { ...eventFurnitureFromTemplate(getEventFurnitureTemplate("chair"), 100, 100, "legacy"), width: 6, height: 6, rotation: 90 };
    expect(constrainEventAsset(chair, 500, 500)).toMatchObject({ width: 6, height: 6, rotation: 90 });
    expect(chair.assetVariant).toBeUndefined();
  });
  it("never shrinks an oversized rotated footprint to satisfy a position-only edit", () => {
    const table = { ...eventFurnitureFromTemplate(getEventFurnitureTemplate("table"), 0, 0, "large"), width: 450, height: 300, rotation: 45 };
    expect(constrainEventAsset(table, 500, 420)).toEqual(table);
  });
  it("keeps corrected rotated bounds inside the map without rounding outward", () => {
    const chair = { ...eventFurnitureFromTemplate(getEventFurnitureTemplate("chair"), 0, 100, "boundary"), rotation: 45 };
    const placed = constrainEventAsset(chair, 500, 420);
    expect(placed.width).toBe(16);
    expect(assessEventPlacement({ proposed: [placed], existing: [], canvasWidth: 500, canvasHeight: 420, blockedRegions: [], blockOverlaps: false }).canPlace).toBe(true);
  });
  it("explicitly resets a stretched chair around its center without mutating the saved item", () => {
    const chair = { ...eventFurnitureFromTemplate(getEventFurnitureTemplate("chair"), 100, 100, "legacy"), width: 32, height: 12 };
    const reset = resetEventAssetSize(chair, getEventFurnitureTemplate("chair"), "outdoor", { width: 500, height: 500 });
    expect(reset.width).toBeCloseTo(6.4); expect(reset.x + reset.width / 2).toBeCloseTo(116);
    expect(reset.y + reset.height / 2).toBeCloseTo(106); expect(chair.width).toBe(32);
  });
  it("locks table proportions in shared resize math and refuses fixed or locked assets", () => {
    const table = eventFurnitureFromTemplate(getEventFurnitureTemplate("table", "outdoor"), 100, 100, "table");
    const result = resizeEventAsset(table, "se", 20, 1, { width: 500, height: 500 }, true);
    expect(result.width / result.height).toBeCloseTo(table.width / table.height, 1);
    expect(resizeEventAsset({ ...table, locked: true }, "se", 20, 20, { width: 500, height: 500 })).toMatchObject(table);
  });
  it("uses smaller outdoor references without altering the indoor template", () => {
    const outdoor = getEventFurnitureTemplate("chair", "outdoor");
    expect(outdoor.width).toBeCloseTo(6.4); expect(outdoor.height).toBeCloseTo(6.4);
    expect(getEventFurnitureTemplate("chair").width).toBe(16);
    const item = eventFurnitureFromTemplate(outdoor, 100, 100, "chair");
    expect(item.assetVariant).toBe("event-outdoor-reference-v1:standard");
  });
  it("keeps outdoor model height at the reference scale after footprint changes", () => {
    const chair = { ...eventFurnitureFromTemplate(getEventFurnitureTemplate("chair"), 100, 100, "chair"), assetVariant: "event-outdoor-reference-v1:standard", width: 32, height: 12 };
    expect(eventAsset3DTransform(chair, { scale: 0.01, originX: 0, originY: 0 })!.height).toBeCloseTo(0.136);
    expect(chair.width).toBe(32); // Reading a legacy/custom size never silently resets it.
  });
  it("rejects stretching a chair in 3D while retaining its move/rotate controls", () => {
    const chair = eventFurnitureFromTemplate(getEventFurnitureTemplate("chair"), 100, 100, "chair");
    const layout = { furniture: [chair], labels: [] }, point = { x: 116, y: 116 }, bounds = { width: 500, height: 500 };
    expect(beginEvent3DGesture(layout, chair.id, "resize", point, bounds)).toBeNull();
    expect(beginEvent3DGesture(layout, chair.id, "move", point, bounds)).not.toBeNull();
    expect(beginEvent3DGesture(layout, chair.id, "rotate", point, bounds)).not.toBeNull();
  });
});
