import { describe, expect, it } from "vitest";
import { physicalFloorCounts, physicalFloorMismatch, physicalFloorSignature, replaceFloorInCampus, repairInvalidFloorMapElementIds } from "../physicalFloorIntegrity";
import type { Campus, FloorPlan } from "../../components/map-builder/types";

const floor = (id: string): FloorPlan => ({
  id, buildingId: "building", number: 1, label: "Ground Floor", canvasW: 500, canvasH: 400,
  rooms: [{ id: "room", name: "Room", type: "office", x: 10, y: 10, w: 100, h: 80 }],
  paths: [{ id: "path", points: [{ x: 10, y: 20 }, { x: 90, y: 20 }], type: "walkway", color: "#0a0", width: 4 }],
  walls: [{ id: "wall", x1: 10, y1: 10, x2: 110, y2: 10, thickness: 4, color: "#333", material: "brick" }],
  doors: [], windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [],
});

describe("physical Floor save signatures", () => {
  it("repairs legacy physical IDs once and remaps their authored references", () => {
    const source = floor("10000000-0000-4000-8000-000000000001");
    source.rooms[0] = {
      ...source.rooms[0],
      id: "room-copy-1",
      accessDoorId: "door-copy-1",
      accessDoorIds: ["door-copy-1", "door-copy-2"],
    } as never;
    source.walls[0] = {
      ...source.walls[0],
      id: "wall-copy-1",
      startAnchor: { targetType: "room", roomId: "room-copy-1", edge: "top", offset: 10 },
    } as never;
    source.doors = [{
      id: "door-copy-1", x: 40, y: 10, width: 20, direction: "right", color: "#b45309", wallId: "wall-copy-1",
    }] as never;
    const campus = {
      buildings: [{ id: "10000000-0000-4000-8000-000000000002", name: "Building", floors: [source] }],
      navNodes: [{
        id: "10000000-0000-4000-8000-000000000003", doorId: "door-copy-1", roomId: "room-copy-1",
        generatedFromPathVertices: [{ pathId: "path", vertexId: "vertex-a" }],
      }],
      navEdges: [{ id: "10000000-0000-4000-8000-000000000004", generatedFromPathIds: ["path"] }],
    } as unknown as Campus;

    const { campus: repaired, repairs } = repairInvalidFloorMapElementIds(campus);
    const updatedFloor = repaired.buildings[0].floors[0];
    const roomRepair = repairs.find((repair) => repair.collection === "rooms")!;
    const wallRepair = repairs.find((repair) => repair.collection === "walls")!;
    const doorRepair = repairs.find((repair) => repair.collection === "doors")!;

    const pathRepair = repairs.find((repair) => repair.collection === "paths")!;
    expect(repairs.map((repair) => repair.oldId).sort()).toEqual(["door-copy-1", "path", "room-copy-1", "wall-copy-1"]);
    expect(updatedFloor.rooms[0].id).toBe(roomRepair.newId);
    expect(updatedFloor.rooms[0].accessDoorId).toBe(doorRepair.newId);
    expect(updatedFloor.rooms[0].accessDoorIds).toEqual([doorRepair.newId, "door-copy-2"]);
    expect(updatedFloor.walls[0].id).toBe(wallRepair.newId);
    expect(updatedFloor.walls[0].startAnchor?.roomId).toBe(roomRepair.newId);
    expect(updatedFloor.doors[0].id).toBe(doorRepair.newId);
    expect(updatedFloor.doors[0].wallId).toBe(wallRepair.newId);
    expect(updatedFloor.paths[0].id).toBe(pathRepair.newId);
    expect(repaired.navNodes?.[0]).toMatchObject({
      id: "10000000-0000-4000-8000-000000000003",
      doorId: doorRepair.newId,
      roomId: roomRepair.newId,
      generatedFromPathVertices: [{ pathId: pathRepair.newId, vertexId: "vertex-a" }],
    });
    expect(repaired.navEdges?.[0].generatedFromPathIds).toEqual([pathRepair.newId]);
    expect(campus.buildings[0].floors[0].rooms[0].id).toBe("room-copy-1");

    const secondPass = repairInvalidFloorMapElementIds(repaired);
    expect(secondPass.repairs).toEqual([]);
    expect(secondPass.campus).toBe(repaired);
    expect(secondPass.campus.buildings[0].floors[0]).toEqual(updatedFloor);
  });

  it("repairs a legacy Event Organizer ID once while preserving event data and location references", () => {
    const legacy = {
      id: "eo-1790650205083-pe84vm",
      title: "TEST: College Week 2026",
      description: "Student organization event",
      organizer: "Student Council",
      markers: [{ x: 45, y: 70, color: "#f59e0b", label: "Main booth" }],
      restrictedAreas: [{ points: [{ x: 1, y: 2 }, { x: 3, y: 4 }] }],
      isActive: true,
      status: "approved",
      locationRef: { type: "room", buildingId: "building", floorId: "floor", roomId: "room", label: "Room 101" },
      locations: [{ id: "location-room", locationRef: { type: "room", buildingId: "building", floorId: "floor", roomId: "room", label: "Room 101" }, eventFurniture: [], eventLabels: [] }],
    };
    const campus = {
      buildings: [{ id: "building", name: "Science Building", floors: [floor("floor")] }],
      eventOverlays: [legacy],
    } as unknown as Campus;
    const { campus: repaired, repairs } = repairInvalidFloorMapElementIds(campus);
    const event = repaired.eventOverlays![0];

    expect(event.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(event.id).not.toBe(legacy.id);
    expect(event).toMatchObject({
      ...legacy,
      id: event.id,
      locationRef: { ...legacy.locationRef, roomId: repaired.buildings[0].floors[0].rooms[0].id },
      locations: [{
        ...legacy.locations[0],
        locationRef: { ...legacy.locations[0].locationRef, roomId: repaired.buildings[0].floors[0].rooms[0].id },
      }],
    });
    expect(repairs).toContainEqual(expect.objectContaining({
      collection: "eventOverlays",
      scope: "Campus",
      oldId: legacy.id,
      newId: event.id,
      name: legacy.title,
    }));
    expect(campus.eventOverlays![0].id).toBe(legacy.id);

    const secondPass = repairInvalidFloorMapElementIds(repaired);
    expect(secondPass.repairs).toEqual([]);
    expect(secondPass.campus.eventOverlays![0].id).toBe(event.id);
    expect(secondPass.campus.eventOverlays![0].locationRef?.roomId).toBe(repaired.buildings[0].floors[0].rooms[0].id);
  });

  it("leaves an already-valid event overlay ID unchanged", () => {
    const validId = "10000000-0000-4000-8000-000000000099";
    const campus = {
      buildings: [],
      eventOverlays: [{ id: validId, title: "Existing event", organizer: "Org" }],
    } as unknown as Campus;
    const result = repairInvalidFloorMapElementIds(campus);
    expect(result.repairs).toEqual([]);
    expect(result.campus).toBe(campus);
    expect(result.campus.eventOverlays![0].id).toBe(validId);
  });

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
