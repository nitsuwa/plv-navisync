import { describe, expect, it } from "vitest";
import { DECOR_ASSET_MAP } from "../../components/map-builder/constants";
import type { CampusBuilding, CampusDecorAsset } from "../../components/map-builder/types";
import { arrangeSelectedOutdoorObjects, selectedOutdoorCount } from "../campusArrangement";

function building(overrides: Partial<CampusBuilding> = {}): CampusBuilding {
  return {
    id: "b1",
    name: "Building",
    code: "B1",
    category: "Academic",
    description: "",
    x: 100,
    y: 100,
    width: 100,
    height: 60,
    color: "#1e40af",
    expanded: false,
    floors: [],
    rotation: 0,
    ...overrides,
  };
}

function decor(overrides: Partial<CampusDecorAsset> = {}): CampusDecorAsset {
  return {
    id: "da1",
    type: "bench",
    x: 320,
    y: 120,
    rotation: 0,
    scale: 1,
    ...overrides,
  };
}

describe("campusArrangement", () => {
  it("counts selected buildings and decor, including hidden editor objects, while ignoring stale and marker ids", () => {
    const count = selectedOutdoorCount(
      [building(), building({ id: "b2", visible: false })],
      [decor({ visible: false })],
      ["b1", "b2", "da1", "m1", "missing"],
      DECOR_ASSET_MAP
    );

    expect(count).toBe(3);
  });

  it("aligns mixed building/decor by actual world bounds", () => {
    const buildings = [building({ id: "b1", x: 100, y: 100, width: 100, height: 60 })];
    const decorAssets = [decor({ id: "da1", type: "bench", x: 360, y: 150, scale: 1 })];

    const left = arrangeSelectedOutdoorObjects(buildings, decorAssets, ["b1", "da1"], "align-left", DECOR_ASSET_MAP);
    expect(left.changed).toBe(true);
    expect(left.decorAssets[0].x).toBe(136);
    expect(left.decorAssets[0].rotation).toBe(0);
    expect(left.decorAssets[0].scale).toBe(1);

    const right = arrangeSelectedOutdoorObjects(buildings, decorAssets, ["b1", "da1"], "align-right", DECOR_ASSET_MAP);
    expect(right.changed).toBe(true);
    expect(right.buildings[0].x).toBeGreaterThan(buildings[0].x);

    const top = arrangeSelectedOutdoorObjects(buildings, decorAssets, ["b1", "da1"], "align-top", DECOR_ASSET_MAP);
    expect(top.changed).toBe(true);
    expect(top.buildings[0].y).toBeLessThanOrEqual(buildings[0].y);

    const bottom = arrangeSelectedOutdoorObjects(buildings, decorAssets, ["b1", "da1"], "align-bottom", DECOR_ASSET_MAP);
    expect(bottom.changed).toBe(true);
    expect(bottom.buildings[0].y).toBeGreaterThan(buildings[0].y);
  });

  it("aligns horizontal and vertical centers for mixed selections", () => {
    const buildings = [building({ id: "b1", x: 100, y: 100, width: 100, height: 60 })];
    const decorAssets = [decor({ id: "da1", type: "sign", x: 380, y: 220, scale: 1 })];

    const centerH = arrangeSelectedOutdoorObjects(buildings, decorAssets, ["b1", "da1"], "align-center-h", DECOR_ASSET_MAP);
    const centerV = arrangeSelectedOutdoorObjects(buildings, decorAssets, ["b1", "da1"], "align-center-v", DECOR_ASSET_MAP);

    expect(centerH.changed).toBe(true);
    expect(centerH.decorAssets[0].x).toBeLessThan(decorAssets[0].x);
    expect(centerV.changed).toBe(true);
    expect(centerV.decorAssets[0].y).toBeLessThan(decorAssets[0].y);
  });

  it("distributes mixed objects while preserving first and last outer anchors", () => {
    const buildings = [
      building({ id: "b1", x: 100, width: 80 }),
      building({ id: "b2", x: 520, width: 80 }),
    ];
    const decorAssets = [decor({ id: "da1", type: "bench", x: 420 })];

    const horizontal = arrangeSelectedOutdoorObjects(buildings, decorAssets, ["b1", "b2", "da1"], "distribute-h", DECOR_ASSET_MAP);
    expect(horizontal.changed).toBe(true);
    expect(horizontal.buildings.find((b) => b.id === "b1")!.x).toBe(100);
    expect(horizontal.buildings.find((b) => b.id === "b2")!.x).toBe(520);
    expect(horizontal.decorAssets[0].x).toBeLessThan(420);

    const vertical = arrangeSelectedOutdoorObjects(
      [building({ id: "b1", y: 100, height: 60 }), building({ id: "b2", y: 420, height: 60 })],
      [decor({ id: "da1", type: "sign", y: 360 })],
      ["b1", "b2", "da1"],
      "distribute-v",
      DECOR_ASSET_MAP
    );
    expect(vertical.changed).toBe(true);
    expect(vertical.buildings.find((b) => b.id === "b1")!.y).toBe(100);
    expect(vertical.buildings.find((b) => b.id === "b2")!.y).toBe(420);
    expect(vertical.decorAssets[0].y).toBeLessThan(360);
  });

  it("does not create changes for no-op alignment", () => {
    const buildings = [
      building({ id: "b1", x: 100, y: 100, width: 100 }),
      building({ id: "b2", x: 100, y: 260, width: 100 }),
    ];

    const result = arrangeSelectedOutdoorObjects(buildings, [], ["b1", "b2"], "align-left", DECOR_ASSET_MAP);
    expect(result.changed).toBe(false);
    expect(result.buildings).toBe(buildings);
  });
});
