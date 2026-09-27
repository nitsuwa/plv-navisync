import { describe, expect, it } from "vitest";
import { physicalFloorCounts, physicalFloorMismatch, physicalFloorSignature, replaceFloorInCampus } from "../physicalFloorIntegrity";
import type { Campus, FloorPlan } from "../../components/map-builder/types";

const floor = (id: string): FloorPlan => ({
  id, buildingId: "building", number: 1, label: "Ground Floor", canvasW: 500, canvasH: 400,
  rooms: [{ id: "room", name: "Room", type: "office", x: 10, y: 10, w: 100, h: 80 }],
  paths: [{ id: "path", points: [{ x: 10, y: 20 }, { x: 90, y: 20 }], type: "walkway", color: "#0a0", width: 4 }],
  walls: [{ id: "wall", x1: 10, y1: 10, x2: 110, y2: 10, thickness: 4, color: "#333", material: "brick" }],
  doors: [], windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [],
});

describe("physical Floor save signatures", () => {
  it("counts every physical collection and compares geometry independent of object key order", () => {
    const current = floor("floor-a");
    const reloaded = structuredClone(current);
    reloaded.rooms = [{ name: "Room", id: "room", type: "office", x: 10, y: 10, w: 100, h: 80 }];
    expect(physicalFloorCounts(current)).toMatchObject({ rooms: 1, paths: 1, walls: 1, doors: 0, furniture: 0 });
    expect(physicalFloorSignature(current)).toBe(physicalFloorSignature(reloaded));
    expect(physicalFloorMismatch(current, reloaded, "T6")).toBeNull();
    reloaded.walls = [];
    expect(physicalFloorMismatch(current, reloaded, "T6")).toContain("collections.walls[id=wall]");
  });

  it("canonicalizes collection order, absent optionals, and sub-micro-unit rounding", () => {
    const expected = floor("floor-a");
    expected.extensions = [{ id: "ext-a", side: "right", offset: 0, width: 100, depth: 80 }];
    expected.furniture = [
      { id: "furn-b", type: "desk", name: "B", category: "tables", x: 20, y: 30, width: 40, height: 20 },
      { id: "furn-a", type: "chair", name: "A", category: "seating", x: 90, y: 40, width: 10, height: 10 },
    ];

    const hydrated = structuredClone(expected);
    hydrated.furniture.reverse();
    hydrated.furniture[0].x += 0.0000002;
    hydrated.furniture[1].color = null as never;
    expect(physicalFloorMismatch(expected, hydrated, "T6")).toBeNull();
  });

  it("ignores only the invalid stray wall x/y fields that hydration removes", () => {
    const expected = floor("floor-a");
    expected.walls[0] = { ...expected.walls[0], x: Number.NaN as never, y: Number.POSITIVE_INFINITY as never };
    const hydrated = structuredClone(expected);
    delete (hydrated.walls[0] as unknown as Record<string, unknown>).x;
    delete (hydrated.walls[0] as unknown as Record<string, unknown>).y;

    expect(physicalFloorMismatch(expected, hydrated, "T6")).toBeNull();
  });

  it("reports the exact first material geometry or Floor setting difference", () => {
    const expected = floor("floor-a");
    expected.extensions = [{ id: "ext-a", side: "right", offset: 0, width: 100, depth: 80 }];
    const hydrated = structuredClone(expected);
    hydrated.extensions![0].depth = 81;
    const extensionMismatch = physicalFloorMismatch(expected, hydrated, "T6 hydrated Floor");
    expect(extensionMismatch).toContain("collections.extensions[id=ext-a].depth");
    expect(extensionMismatch).toContain("expected 80, hydrated 81");

    hydrated.extensions![0].depth = 80;
    hydrated.walls[0].x1 = 11;
    const wallMismatch = physicalFloorMismatch(expected, hydrated, "T6 hydrated Floor");
    expect(wallMismatch).toContain("collections.walls[id=wall].x1");
    expect(wallMismatch).toContain("expected 10, hydrated 11");
  });

  it("continues to reject material dimension changes", () => {
    const expected = floor("floor-a");
    const hydrated = structuredClone(expected);
    hydrated.canvasW = 900;
    expect(physicalFloorMismatch(expected, hydrated, "T6")).toContain("settings.canvasW: expected 500, hydrated 900");
  });

  it("replaces the active Floor in a Campus without mutating other Floors", () => {
    const active = floor("floor-a");
    const other = floor("floor-b");
    const campus = { buildings: [{ id: "building", floors: [active, other] }] } as unknown as Campus;
    const before = structuredClone(campus);
    const changed = { ...active, rooms: [] };
    const candidate = replaceFloorInCampus(campus, changed);
    expect(candidate.buildings[0].floors[0].rooms).toEqual([]);
    expect(candidate.buildings[0].floors[1]).toEqual(other);
    expect(campus).toEqual(before);
    expect(candidate.buildings[0].floors[0]).not.toBe(changed);
  });
});
