import { describe, expect, it } from "vitest";
import {
  DECOR_ASSET_MAP,
  DECOR_CATEGORIES,
  DECOR_PALETTE_TYPES,
  groundTypeForDecorType,
  isDecorAreaType,
} from "../../components/map-builder/constants";
import type { CampusMarker } from "../../components/map-builder/types";
import { collectOutdoorClipboardSelection, isFreeOutdoorWaypoint } from "../outdoorClipboard";

describe("outdoor asset palette", () => {
  it("offers the focused campus palette and omits retired entries", () => {
    expect(DECOR_PALETTE_TYPES).toEqual(expect.arrayContaining([
      "lawn-area", "garden-area", "plaza-area", "parking-lot",
      "tree", "tree-large", "bush", "plant", "bench", "bench-long",
      "sign", "directory-board", "trash-bin", "recycle-bin", "lamp-post",
      "bike-rack", "guard-booth", "philippine-flag", "monument", "gate-scanner",
    ]));
    expect(DECOR_PALETTE_TYPES).not.toEqual(expect.arrayContaining([
      "palm", "gazebo", "academic", "laboratory", "library", "gym", "admin", "other",
    ]));
    expect(DECOR_CATEGORIES.find((category) => category.id === "areas")?.types).toEqual([
      "lawn-area", "garden-area", "plaza-area", "parking-lot",
    ]);
  });

  it("keeps area assets as normal resizable objects with sensible defaults", () => {
    for (const type of ["lawn-area", "garden-area", "plaza-area", "parking-lot"] as const) {
      const descriptor = DECOR_ASSET_MAP[type];
      expect(isDecorAreaType(type)).toBe(true);
      expect(descriptor.defaultWidth).toBeGreaterThan(40);
      expect(descriptor.defaultHeight).toBeGreaterThan(30);
      expect(groundTypeForDecorType(type)).toBeDefined();
    }
    expect(DECOR_ASSET_MAP["directory-board"].defaultWidth).toBeLessThan(40);
    expect(DECOR_ASSET_MAP["philippine-flag"].defaultWidth).toBeLessThan(40);
  });

  it("exposes Gate Scanner / Turnstile as a normal security decor asset", () => {
    const scanner = DECOR_ASSET_MAP["gate-scanner"];
    expect(scanner).toMatchObject({
      type: "gate-scanner",
      label: "Gate Scanner / Turnstile",
      category: "Security / Access",
    });
    expect(scanner.defaultWidth).toBeGreaterThan(50);
    expect(scanner.defaultHeight).toBeGreaterThan(0);
    // The palette entry is one normal decor record whose artwork contains a
    // compact three-unit bank (not three child objects or graph nodes).
    expect((scanner.svgPath.match(/M\d+ 3/g) ?? [])).toHaveLength(3);
    expect(scanner.defaultWidth / scanner.defaultHeight).toBeGreaterThan(2);
    expect(scanner.parts?.length).toBeGreaterThan(1);
    expect(isDecorAreaType("gate-scanner")).toBe(false);
    expect(DECOR_CATEGORIES.find((category) => category.id === "security")?.types).toContain("gate-scanner");
  });

  it("keeps legacy ground-area records renderable without offering them in the palette", () => {
    expect(DECOR_ASSET_MAP["ground-area"]).toBeDefined();
    expect(DECOR_PALETTE_TYPES).not.toContain("ground-area");
    expect(isDecorAreaType("ground-area")).toBe(true);
  });
});

describe("safe outdoor clipboard selection", () => {
  const gate: CampusMarker = {
    id: "gate-1", name: "Main Gate", type: "gate", purpose: "general", navNodeId: "gate-node",
    x: 20, y: 20, color: "#2563eb",
  };
  const marker: CampusMarker = { id: "marker-1", name: "Notice", type: "poi", x: 30, y: 30, color: "#2563eb" };

  it("allows ordinary decor/markers while excluding Gate infrastructure", () => {
    const result = collectOutdoorClipboardSelection(
      [gate.id, marker.id, "decor-1", "path-1"],
      null,
      [],
      [gate, marker],
      [{ id: "decor-1", type: "tree", x: 10, y: 10 }],
    );
    expect(result.entries).toEqual([
      { type: "marker", id: "marker-1" },
      { type: "decorAsset", id: "decor-1" },
    ]);
    expect(result.excluded).toHaveLength(2);
    expect(result.excluded.join(" ")).toContain("Campus Gate");
  });

  it("recognizes only free outdoor waypoints as navigation-copyable", () => {
    expect(isFreeOutdoorWaypoint({})).toBe(true);
    expect(isFreeOutdoorWaypoint({ gateId: "gate-node" })).toBe(false);
    expect(isFreeOutdoorWaypoint({ generatedFromPathVertices: [{ pathId: "p" }] })).toBe(false);
    expect(isFreeOutdoorWaypoint({ buildingEntranceId: "entrance-1" })).toBe(false);
  });
});
