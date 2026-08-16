import { describe, expect, it } from "vitest";
import {
  defaultEntrance,
  entranceDisplayName,
  entranceLocalPoint,
  entranceTypeLabel,
  entranceWorldPosition,
  normalizeBuildingEntrances,
  normalizeEntranceOffset,
  normalizeEntranceType,
  pointerToEntranceAttachment,
  promotePrimaryEntrance,
  updateBuildingEntrance,
} from "../buildingEntrances";
import type { CampusBuilding } from "../../components/map-builder/types";

function building(overrides: Partial<CampusBuilding> = {}): CampusBuilding {
  return {
    id: "b1",
    name: "Main Building",
    code: "MB",
    category: "Academic",
    description: "",
    x: 100,
    y: 200,
    width: 120,
    height: 80,
    color: "#1e40af",
    floors: [],
    rotation: 0,
    ...overrides,
  };
}

describe("building entrance geometry", () => {
  it("derives local positions for all four edges", () => {
    const b = building();
    expect(entranceLocalPoint(b, "top", 0.25)).toEqual({ x: 130, y: 200 });
    expect(entranceLocalPoint(b, "right", 0.5)).toEqual({ x: 220, y: 240 });
    expect(entranceLocalPoint(b, "bottom", 0.75)).toEqual({ x: 190, y: 280 });
    expect(entranceLocalPoint(b, "left", 1)).toEqual({ x: 100, y: 280 });
  });

  it("clamps normalized offsets", () => {
    expect(normalizeEntranceOffset(-0.4)).toBe(0);
    expect(normalizeEntranceOffset(1.4)).toBe(1);
    expect(normalizeEntranceOffset(Number.NaN)).toBe(0.5);
  });

  it("rotates entrance world position with the building", () => {
    const pos = entranceWorldPosition(building({ rotation: 90 }), { edge: "right", offset: 0.5 });
    expect(Math.round(pos.x)).toBe(160);
    expect(Math.round(pos.y)).toBe(300);
    expect(pos.angle).toBe(90);
  });

  it("keeps the same edge percentage after resize", () => {
    const small = entranceWorldPosition(building({ width: 100, height: 100 }), { edge: "right", offset: 0.6 });
    const wide = entranceWorldPosition(building({ width: 200, height: 100 }), { edge: "right", offset: 0.6 });
    expect(small.y).toBe(260);
    expect(wide.y).toBe(260);
    expect(wide.x).toBe(300);
  });

  it("converts a pointer near the perimeter to nearest edge and offset", () => {
    expect(pointerToEntranceAttachment(building(), { x: 222, y: 250 })).toEqual({ edge: "right", offset: 0.625 });
    expect(pointerToEntranceAttachment(building(), { x: 130, y: 195 })).toEqual({ edge: "top", offset: 0.25 });
  });

  it("handles pointer conversion for rotated buildings", () => {
    const b = building({ rotation: 90 });
    const rightMid = entranceWorldPosition(b, { edge: "right", offset: 0.5 });
    expect(pointerToEntranceAttachment(b, rightMid)).toEqual({ edge: "right", offset: 0.5 });
  });

  it("creates a building-owned default entrance", () => {
    const b = building({ accessibility: { wheelchairAccessible: true, hasElevator: false, hasRamp: true, accessibleEntrance: true } });
    expect(defaultEntrance(b, "ent1")).toMatchObject({
      id: "ent1",
      buildingId: "b1",
      edge: "bottom",
      offset: 0.5,
      type: "general",
      isPrimary: true,
      accessible: false,
    });
    expect(defaultEntrance({ ...b, entrances: [defaultEntrance(b, "ent1")] }, "ent2")).toMatchObject({
      type: "general",
      isPrimary: false,
    });
  });

  it("uses friendly entrance labels and type labels", () => {
    expect(entranceTypeLabel("service")).toBe("Service Entrance");
    expect(entranceDisplayName({ name: "  North Gate  ", type: "general" })).toBe("North Gate");
    expect(entranceDisplayName({ type: "general" }, 1)).toBe("Entrance 2");
    expect(entranceDisplayName({ type: "emergency_exit" }, 1)).toBe("Emergency Exit");
    expect(entranceDisplayName({}, 2)).toBe("Entrance 3");
  });

  it("normalizes legacy entrance semantics without leaking old labels", () => {
    expect(normalizeEntranceType("main")).toBe("general");
    expect(normalizeEntranceType("secondary")).toBe("general");
    expect(normalizeEntranceType("emergency")).toBe("emergency_exit");
    const normalized = normalizeBuildingEntrances(building({
      entrances: [
        { id: "ent1", buildingId: "old", edge: "bottom", offset: 1.2, type: "main" },
        { id: "ent2", buildingId: "old", edge: "top", offset: 0.5, type: "secondary", isPrimary: true },
        { id: "ent3", buildingId: "old", edge: "left", offset: 0.5, type: "emergency" },
      ],
    }));
    expect(normalized.map((e) => e.type)).toEqual(["general", "general", "emergency_exit"]);
    expect(normalized.map((e) => e.isPrimary)).toEqual([true, true, false]);
  });

  it("updates entrance configuration and reports no-op changes", () => {
    const b = building({
      entrances: [{ id: "ent1", buildingId: "b1", edge: "bottom", offset: 0.5, type: "general", accessible: false }],
    });
    const result = updateBuildingEntrance(b, "ent1", { name: "North Gate", type: "service", accessible: true, offset: 2 });
    expect(result.changed).toBe(true);
    expect(result.building.entrances![0]).toMatchObject({
      name: "North Gate",
      type: "service",
      accessible: true,
      offset: 1,
    });
    expect(updateBuildingEntrance(result.building, "ent1", { type: "service" }).changed).toBe(false);
  });

  it("switches primary entrance within one building only", () => {
    const b = building({
      entrances: [
        { id: "ent1", buildingId: "b1", edge: "bottom", offset: 0.5, type: "general", isPrimary: true },
        { id: "ent2", buildingId: "b1", edge: "top", offset: 0.5, type: "general" },
      ],
    });
    const result = updateBuildingEntrance(b, "ent2", { isPrimary: true });
    expect(result.changed).toBe(true);
    expect(result.building.entrances?.find((e) => e.id === "ent1")?.isPrimary).toBe(false);
    expect(result.building.entrances?.find((e) => e.id === "ent2")?.isPrimary).toBe(true);
  });

  it("does not allow service or emergency exits to be primary", () => {
    const b = building({
      entrances: [
        { id: "ent1", buildingId: "b1", edge: "bottom", offset: 0.5, type: "general", isPrimary: true },
        { id: "ent2", buildingId: "b1", edge: "top", offset: 0.5, type: "service" },
      ],
    });
    const result = updateBuildingEntrance(b, "ent2", { type: "service", isPrimary: true });
    expect(result.building.entrances?.find((e) => e.id === "ent1")?.isPrimary).toBe(true);
    expect(result.building.entrances?.find((e) => e.id === "ent2")?.isPrimary).toBe(false);
  });

  it("promotes the first remaining general entrance only", () => {
    const promoted = promotePrimaryEntrance([
      { id: "ent2", buildingId: "b1", edge: "top", offset: 0.5, type: "service" },
      { id: "ent3", buildingId: "b1", edge: "left", offset: 0.5, type: "general" },
    ]);
    expect(promoted.find((e) => e.id === "ent3")?.isPrimary).toBe(true);

    const noGeneral = promotePrimaryEntrance([
      { id: "ent2", buildingId: "b1", edge: "top", offset: 0.5, type: "service" },
      { id: "ent3", buildingId: "b1", edge: "left", offset: 0.5, type: "emergency_exit" },
    ]);
    expect(noGeneral.some((e) => e.isPrimary)).toBe(false);
  });
});
