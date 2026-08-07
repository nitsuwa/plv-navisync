import { describe, expect, it } from "vitest";
import {
  buildingSelectionBounds,
  decorSelectionBounds,
  outdoorSelectionIdsInRect,
  rectsIntersect,
  selectionRectFromPoints,
} from "../campusSelection";
import { DECOR_ASSET_MAP } from "../../components/map-builder/constants";
import type { CampusBuilding, CampusDecorAsset } from "../../components/map-builder/types";

function building(overrides: Partial<CampusBuilding> = {}): CampusBuilding {
  return {
    id: "b1",
    name: "Building",
    code: "B1",
    category: "Academic",
    description: "",
    x: 100,
    y: 100,
    width: 120,
    height: 80,
    color: "#1e40af",
    expanded: false,
    floors: [],
    ...overrides,
  };
}

function decor(overrides: Partial<CampusDecorAsset> = {}): CampusDecorAsset {
  return {
    id: "da1",
    type: "tree",
    x: 450,
    y: 120,
    rotation: 0,
    scale: 1,
    ...overrides,
  };
}

describe("campusSelection helpers", () => {
  it("normalizes rubber-band rectangles in all drag directions", () => {
    expect(selectionRectFromPoints(10, 20, 110, 220)).toEqual({ x: 10, y: 20, width: 100, height: 200 });
    expect(selectionRectFromPoints(110, 220, 10, 20)).toEqual({ x: 10, y: 20, width: 100, height: 200 });
    expect(selectionRectFromPoints(110, 20, 10, 220)).toEqual({ x: 10, y: 20, width: 100, height: 200 });
    expect(selectionRectFromPoints(10, 220, 110, 20)).toEqual({ x: 10, y: 20, width: 100, height: 200 });
  });

  it("uses intersection semantics for selectable bounds", () => {
    expect(rectsIntersect({ x: 90, y: 90, width: 20, height: 20 }, { x: 100, y: 100, width: 120, height: 80 })).toBe(true);
    expect(rectsIntersect({ x: 0, y: 0, width: 20, height: 20 }, { x: 100, y: 100, width: 120, height: 80 })).toBe(false);
  });

  it("computes building and decor bounds from the same visible geometry used by the editor", () => {
    expect(buildingSelectionBounds(building())?.id).toBe("b1");
    expect(buildingSelectionBounds(building({ visible: false }))).toBeNull();

    const tree = decor({ scale: 2, rotation: 45 });
    const bounds = decorSelectionBounds(tree, DECOR_ASSET_MAP.tree);
    expect(bounds?.id).toBe("da1");
    expect(bounds!.width).toBeGreaterThan(DECOR_ASSET_MAP.tree.defaultWidth);
    expect(bounds!.height).toBeGreaterThan(DECOR_ASSET_MAP.tree.defaultHeight);
    expect(decorSelectionBounds(decor({ visible: false }), DECOR_ASSET_MAP.tree)).toBeNull();
  });

  it("captures mixed visible buildings/decor and excludes hidden decor", () => {
    const ids = outdoorSelectionIdsInRect(
      { x: 90, y: 80, width: 430, height: 100 },
      [building(), building({ id: "b2", x: 700 })],
      [decor(), decor({ id: "da2", type: "bench", x: 180, y: 140, visible: false })],
      DECOR_ASSET_MAP
    );

    expect(ids).toEqual(["b1", "da1"]);
  });

  it("can include hidden editor ghosts when the admin canvas opts in", () => {
    const ids = outdoorSelectionIdsInRect(
      { x: 90, y: 80, width: 430, height: 100 },
      [building({ visible: false })],
      [decor({ visible: false })],
      DECOR_ASSET_MAP,
      { includeHidden: true }
    );

    expect(ids).toEqual(["b1", "da1"]);
  });
});
