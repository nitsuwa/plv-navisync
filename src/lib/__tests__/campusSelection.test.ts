import { describe, expect, it } from "vitest";
import {
  buildingSelectionBounds,
  decorSelectionBounds,
  markerSelectionBounds,
  outdoorSelectionIdsInRect,
  pathSelectionBounds,
  rectsIntersect,
  selectionRectFromPoints,
} from "../campusSelection";
import { DECOR_ASSET_MAP } from "../../components/map-builder/constants";
import type { CampusBuilding, CampusDecorAsset, CampusMarker, CampusPath } from "../../components/map-builder/types";

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

function path(overrides: Partial<CampusPath> = {}): CampusPath {
  return {
    id: "p1",
    name: "Walkway",
    points: [{ x: 120, y: 120 }, { x: 260, y: 140 }],
    type: "walkway",
    color: "#94a3b8",
    width: 12,
    ...overrides,
  };
}

function gate(overrides: Partial<CampusMarker> = {}): CampusMarker {
  return { id: "g1", name: "Main Gate", type: "gate", purpose: "general", x: 320, y: 120, color: "#2563eb", ...overrides };
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

  it("bounds pathways by their authored points plus stroke width", () => {
    const bounds = pathSelectionBounds(path({ width: 20 }));

    expect(bounds).toMatchObject({ id: "p1", kind: "path", x: 110, y: 110, width: 160, height: 40 });
    expect(pathSelectionBounds(path({ visible: false }))).toBeNull();
    expect(pathSelectionBounds(path({ visible: false }), { includeHidden: true })?.id).toBe("p1");
  });

  it("rubber-band selection captures pathways without breaking the legacy options signature", () => {
    const ids = outdoorSelectionIdsInRect(
      { x: 90, y: 90, width: 240, height: 80 },
      [building()],
      [decor({ x: 700 })],
      DECOR_ASSET_MAP,
      [path()]
    );

    expect(ids).toEqual(["b1", "p1"]);
  });

  it("captures a physical Campus Gate while keeping its derived anchor out of selection", () => {
    expect(markerSelectionBounds(gate())).toMatchObject({ id: "g1", kind: "marker", x: 298, y: 103 });
    const ids = outdoorSelectionIdsInRect(
      { x: 290, y: 95, width: 70, height: 60 },
      [], [], DECOR_ASSET_MAP, [], {}, [gate()],
    );
    expect(ids).toEqual(["g1"]);
  });

  it("excludes locked objects from rubber-band and group transform bounds", () => {
    const ids = outdoorSelectionIdsInRect(
      { x: 80, y: 80, width: 500, height: 180 },
      [building(), building({ id: "locked-building", x: 260, locked: true })],
      [decor({ id: "locked-tree", x: 320, locked: true }), decor({ id: "da2", x: 460 })],
      DECOR_ASSET_MAP,
    );
    expect(ids).toEqual(["b1", "da2"]);
  });
});
