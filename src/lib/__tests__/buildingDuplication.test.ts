import { describe, expect, it } from "vitest";
import type { Campus, CampusBuilding, FloorPlan } from "../../components/map-builder/types";
import { duplicateBuildingForCampus, buildingPhysicalSnapshot } from "../buildingDuplication";
import { syncExteriorEmergencyStairOccurrences } from "../exteriorEmergencyStairs";
import { createDefaultFloor, normalizeFloor } from "../floorPlanNormalization";
import { hydrateCampusStructure, serializeCampusStructure } from "../../services/campusStructureService";

const campusId = "10000000-0000-4000-8000-000000000001";
const sourceBuildingId = "10000000-0000-4000-8000-000000000002";
const floorGroundId = "10000000-0000-4000-8000-000000000003";
const floorTwoId = "10000000-0000-4000-8000-000000000004";

function populatedBuilding(): CampusBuilding {
  const ground = createDefaultFloor({ id: floorGroundId, buildingId: sourceBuildingId, number: 1, label: "Ground Floor", canvasW: 820, canvasH: 540 });
  const second = createDefaultFloor({ id: floorTwoId, buildingId: sourceBuildingId, number: 2, label: "Floor 2", canvasW: 820, canvasH: 540 });
  const entrance = { id: "source-entrance", buildingId: sourceBuildingId, name: "North Entrance", edge: "top" as const, offset: 0.45, type: "general" as const, direction: "both" as const, accessible: true, isPrimary: true };
  const exteriorStairId = "source-exterior-stair";
  const roomA = "source-room-a";
  const roomB = "source-room-b";
  const groundDoor = "source-door-ground";
  const secondDoor = "source-door-second";
  const wallA = "source-wall-a";
  const wallB = "source-wall-b";
  const zone = "source-veranda";
  const makeFloor = (base: FloorPlan, floorIndex: 0 | 1): FloorPlan => {
    const isGround = floorIndex === 0;
    const primaryRoom = isGround ? roomA : "source-room-second";
    const doorId = isGround ? groundDoor : secondDoor;
    const mainWall = isGround ? wallA : wallB;
    return normalizeFloor({
      ...base,
      extensions: [{ id: `source-extension-${floorIndex}`, side: "bottom", offset: 140, width: 180, depth: 72 }],
      backgroundColor: isGround ? "#eee8dc" : "#e3ecf2",
      appearance: { material: "wood", texture: "subtle", color: isGround ? "#eee8dc" : "#e3ecf2" },
      showGrid: false,
      gridSize: 40,
      rooms: [
        { id: primaryRoom, name: isGround ? "CABA LIBRARY" : "LIBRARY LEVEL 2", type: "library", x: 70.25, y: 52.5, w: 500.75, h: 350.25, floorId: base.id, buildingId: sourceBuildingId, shapePoints: [{ x: 70.25, y: 52.5 }, { x: 571, y: 52.5 }, { x: 540, y: 402.75 }, { x: 70.25, y: 402.75 }], color: "#dbeafe", rotation: 2.5, accessDoorId: doorId, accessDoorIds: [doorId], accessNodeId: `source-nav-${primaryRoom}`, navConnection: { x: 90, y: 90 }, accessibility: true },
        ...(isGround ? [{ id: roomB, name: "COLLAB ROOM 3A", type: "office", x: 210, y: 180, w: 100, h: 80, floorId: base.id, buildingId: sourceBuildingId, shapePoints: [{ x: 210, y: 180 }, { x: 310, y: 180 }, { x: 300, y: 260 }, { x: 210, y: 260 }], color: "#dcfce7", rotation: 0 }] : []),
      ],
      walls: [...base.walls, {
        id: mainWall, x1: 70.25, y1: 52.5, x2: 571, y2: 52.5, thickness: 5.5, material: "brick", color: "#7c5c46", layer: "structure", zOrder: 5,
        startAnchor: { targetType: "room" as const, roomId: primaryRoom, edge: "top" as const, offset: 0 },
        endAnchor: { targetType: "room" as const, roomId: primaryRoom, edge: "top" as const, offset: 1 },
      }, ...(isGround ? [{ id: "source-wall-cross", x1: 210, y1: 180, x2: 310, y2: 260, thickness: 3, material: "glass", color: "#64748b", layer: "partition", zOrder: 8, startAnchor: { targetType: "room" as const, roomId: roomA, edge: "right" as const, offset: 0.3 }, endAnchor: { targetType: "room" as const, roomId: roomB, edge: "left" as const, offset: 0.7 } }] : [])],
      doors: [{ id: doorId, x: 270.75, y: 52.5, width: 28, direction: "right", color: "#8b5e34", wallId: mainWall, offset: 0.4, doorType: "double", hinge: "left", swingSide: "b", openingType: "open_passage", ...(isGround ? { buildingEntranceId: entrance.id, isEmergencyExit: false } : {}) }],
      windows: [{ id: `source-window-${floorIndex}`, x: 420, y: 52.5, width: 60, height: 8, color: "#38bdf8", wallId: mainWall, offset: 0.72 }],
      furniture: [
        { id: `source-furniture-${floorIndex}`, type: "desk", name: `Desk ${floorIndex}`, category: "tables", x: 150 + floorIndex * 20, y: 240, width: 54, height: 28, rotation: 15, color: "#c08457", groupId: "shared-furniture-group", ...(isGround ? { exteriorZoneId: zone } : {}) },
      ],
      paths: [{ id: `source-visual-path-${floorIndex}`, points: [{ x: 90, y: 410 }, { x: 250, y: 410 }, { x: 400, y: 390 }], type: "walkway", color: "#16a34a", width: 4 }],
      stairs: [
        { id: `source-left-stair-${floorIndex}`, x: 600, y: 130, width: 48, height: 90, direction: "both", label: "Left Stair", sharedId: "source-shaft-left", floors: [1, 2] },
        { id: `source-ext-stair-occurrence-${floorIndex}`, x: 690, y: 130, width: 42, height: 84, direction: "down", label: "Exterior Stair", sharedId: "source-exterior-shaft", exteriorEmergencyStairId: exteriorStairId },
      ],
      ramps: [{ id: `source-ramp-${floorIndex}`, x: 590, y: 270, width: 84, height: 24, label: "Ramp", direction: "both", sharedId: "source-ramp-shaft", slope: "gentle", handrails: true }],
      elevators: [{ id: `source-elevator-${floorIndex}`, x: 680, y: 270, width: 48, height: 48, doorWidth: 18, label: "Elevator", sharedId: "source-elevator-shaft", floors: [1, 2], systemNumber: 1 }],
      labels: [{ id: `source-label-${floorIndex}`, x: 100, y: 440, text: `FLOOR LABEL ${floorIndex}`, fontSize: 15, color: "#1e293b", rotation: 2, align: "center" }],
      exteriorZones: isGround ? [{ id: zone, type: "veranda", side: "top", offset: 0.45, width: 200, depth: 64, x: 210, y: 0, label: "North Veranda", walkable: true, linkedEntranceId: entrance.id, linkedEntranceIds: [entrance.id] }] : [],
      entranceSteps: isGround ? [{ id: "source-steps", x: 240, y: 0, width: 70, height: 32, label: "Entrance Steps", parentZoneId: zone, linkedEntranceId: entrance.id, attachmentEdge: "outer", attachmentOffset: 0.5 }] : [],
      entranceRamps: isGround ? [{ id: "source-entrance-ramp", x: 320, y: 0, width: 84, height: 34, label: "Entrance Ramp", parentZoneId: zone, linkedEntranceId: entrance.id, attachmentEdge: "outer", attachmentOffset: 0.7, handrails: true }] : [],
    }, { buildingId: sourceBuildingId });
  };
  const floors = [makeFloor(ground, 0), makeFloor(second, 1)];
  return syncExteriorEmergencyStairOccurrences({
    id: sourceBuildingId, name: "CABA Library", code: "CABA", category: "Academic", description: "Library building",
    x: 240, y: 180, width: 400, height: 300, rotation: 0, color: "#2563eb", floors,
    entrances: [entrance], entranceNodeId: "source-building-entrance-node",
    circulationGroups: [
      { id: "source-shaft-left", buildingId: sourceBuildingId, kind: "stair", name: "Left Stair" },
      { id: "source-elevator-shaft", buildingId: sourceBuildingId, kind: "elevator", name: "Elevator" },
    ],
    exteriorEmergencyStairs: [{
      id: exteriorStairId, buildingId: sourceBuildingId, label: "Exterior Emergency Stair", state: "open", width: 42, height: 84,
      attachment: { edge: "right", offset: 0.5 }, servedFloorIds: [floorGroundId, floorTwoId], sharedId: "source-exterior-shaft",
      occurrenceIds: { [floorGroundId]: "source-ext-stair-occurrence-0", [floorTwoId]: "source-ext-stair-occurrence-1" },
      occurrenceNodeIds: { [floorGroundId]: "source-node-ground", [floorTwoId]: "source-node-second" }, outdoorNodeId: "source-outdoor-node",
      floorConnectionSnapshots: { [floorGroundId]: [{ id: "source-edge", startNodeId: "source-node-ground", endNodeId: "source-local-node", bidirectional: true, type: "walking" } as never] },
      emergencySafe: true, visualSize: "large",
    }],
  });
}

function withThirdPopulatedFloor(building: CampusBuilding): CampusBuilding {
  const floor = createDefaultFloor({ id: "10000000-0000-4000-8000-000000000017", buildingId: building.id, number: 3, label: "Floor 3", canvasW: 820, canvasH: 540 });
  const roomId = "source-room-third";
  const wallId = "source-wall-third";
  const doorId = "source-door-third";
  const third = normalizeFloor({
    ...floor,
    rooms: [{ id: roomId, name: "Third Floor Reading Room", type: "library", x: 100, y: 90, w: 240, h: 170, floorId: floor.id, buildingId: building.id, accessDoorId: doorId, accessDoorIds: [doorId] }],
    walls: [...floor.walls, { id: wallId, x1: 100, y1: 90, x2: 340, y2: 90, thickness: 5, material: "brick", startAnchor: { targetType: "room", roomId, edge: "top", offset: 0 }, endAnchor: { targetType: "room", roomId, edge: "top", offset: 1 } }],
    doors: [{ id: doorId, x: 200, y: 90, width: 28, direction: "right", color: "#8b5e34", wallId, offset: 0.4 }],
    windows: [{ id: "source-window-third", x: 250, y: 90, width: 40, height: 8, color: "#38bdf8", wallId, offset: 0.7 }],
    furniture: [{ id: "source-furniture-third", type: "desk", name: "Reading Desk", category: "tables", x: 150, y: 160, width: 48, height: 24, rotation: 0, color: "#c08457", groupId: "shared-furniture-group" }],
    stairs: [{ id: "source-left-stair-third", x: 600, y: 130, width: 48, height: 90, direction: "down", label: "Left Stair", sharedId: "source-shaft-left", floors: [1, 2, 3] }],
    elevators: [{ id: "source-elevator-third", x: 680, y: 270, width: 48, height: 48, doorWidth: 18, label: "Elevator", sharedId: "source-elevator-shaft", floors: [1, 2, 3] }],
  }, { buildingId: building.id });
  return { ...building, floors: [...building.floors, third] };
}

function campusWith(buildings: CampusBuilding[]): Campus {
  return {
    id: campusId, name: "PLV", code: "PLV", description: "", address: "", city: "", province: "", postalCode: "",
    status: "active", publishStatus: "draft", visibleToStudents: false, canvasW: 1000, canvasH: 800,
    buildings, markers: [], paths: [], navNodes: [], navEdges: [],
    features: { indoorNavigation: false, accessibilityNavigation: false, emergencyRoutes: false, issueReporting: false },
    settings: { accessibility: false, emergency: false, eventLayer: false, gps: false },
    createdAt: "2026-01-01", updatedAt: "2026-01-01",
  };
}

function buildingLocalIdentities(building: CampusBuilding): Set<string> {
  return new Set([
    building.id,
    ...(building.entrances ?? []).map((item) => item.id),
    ...(building.circulationGroups ?? []).map((item) => item.id),
    ...(building.exteriorEmergencyStairs ?? []).map((item) => item.id),
    ...(building.exteriorEmergencyStairs ?? []).map((item) => item.sharedId).filter((id): id is string => !!id),
    ...building.floors.flatMap((floor) => [
      floor.id,
      ...floor.rooms.map((item) => item.id), ...floor.paths.map((item) => item.id),
      ...floor.walls.map((item) => item.id), ...floor.doors.map((item) => item.id),
      ...floor.windows.map((item) => item.id), ...floor.furniture.map((item) => item.id),
      ...floor.stairs.map((item) => item.id), ...floor.ramps.map((item) => item.id),
      ...floor.elevators.map((item) => item.id), ...floor.labels.map((item) => item.id),
      ...(floor.exteriorZones ?? []).map((item) => item.id),
      ...(floor.entranceSteps ?? []).map((item) => item.id), ...(floor.entranceRamps ?? []).map((item) => item.id),
      ...(floor.extensions ?? []).map((item) => item.id),
      ...floor.stairs.map((item) => item.sharedId).filter((id): id is string => !!id),
      ...floor.ramps.map((item) => item.sharedId).filter((id): id is string => !!id),
      ...floor.elevators.map((item) => item.sharedId).filter((id): id is string => !!id),
      ...floor.furniture.map((item) => item.groupId).filter((id): id is string => !!id),
    ]),
  ]);
}

describe("whole-Building duplication", () => {
  it("copies every Floor's physical layout and remaps all Building/Floor relationships", () => {
    const source = withThirdPopulatedFloor(populatedBuilding());
    const before = structuredClone(source);
    const copy = duplicateBuildingForCampus(source, { id: "new-building", name: "CABA Library (Copy)", code: "CABA-CP", x: source.x + 25, y: source.y + 25 });
    expect(source).toEqual(before);
    expect(buildingPhysicalSnapshot(copy)).toEqual(buildingPhysicalSnapshot(source));
    const sourceIdentities = buildingLocalIdentities(source);
    expect([...buildingLocalIdentities(copy)].filter((id) => sourceIdentities.has(id))).toEqual([]);
    expect(copy.floors.map((floor) => [floor.rooms.length, floor.walls.length, floor.doors.length, floor.windows.length, floor.furniture.length, floor.stairs.length, floor.ramps.length, floor.elevators.length]))
      .toEqual(source.floors.map((floor) => [floor.rooms.length, floor.walls.length, floor.doors.length, floor.windows.length, floor.furniture.length, floor.stairs.length, floor.ramps.length, floor.elevators.length]));

    const [copyGround, copySecond] = copy.floors;
    expect(copy.floors.map((floor) => floor.id)).not.toEqual(source.floors.map((floor) => floor.id));
    expect(copy.floors.map((floor) => floor.extensions?.[0]?.id)).not.toEqual(source.floors.map((floor) => floor.extensions?.[0]?.id));
    expect(copyGround.rooms.map((room) => room.id)).not.toContain("source-room-a");
    expect(copyGround.rooms.find((room) => room.name === "CABA LIBRARY")?.accessDoorId).toBe(copyGround.doors[0].id);
    expect(copyGround.rooms.every((room) => !room.accessNodeId && !room.navConnection)).toBe(true);
    expect(copyGround.walls.find((wall) => wall.id !== source.floors[0].walls[0].id)?.startAnchor?.roomId).not.toBe("source-room-a");
    for (const floor of copy.floors) {
      const roomIds = new Set(floor.rooms.map((room) => room.id));
      const wallIds = new Set(floor.walls.map((wall) => wall.id));
      for (const wall of floor.walls) for (const anchor of [wall.startAnchor, wall.endAnchor]) if (anchor) expect(roomIds.has(anchor.roomId)).toBe(true);
      for (const door of floor.doors) if (door.wallId) expect(wallIds.has(door.wallId)).toBe(true);
      for (const window of floor.windows) if (window.wallId) expect(wallIds.has(window.wallId)).toBe(true);
    }
    expect(copy.entrances?.[0].id).not.toBe(source.entrances![0].id);
    expect(copy.entrances?.[0].buildingId).toBe(copy.id);
    expect(copyGround.doors.find((door) => door.buildingEntranceId)?.buildingEntranceId).toBe(copy.entrances?.[0].id);
    expect(copyGround.exteriorZones?.[0].linkedEntranceId).toBe(copy.entrances?.[0].id);
    expect(copyGround.entranceSteps?.[0].parentZoneId).toBe(copyGround.exteriorZones?.[0].id);
    expect(copy.floors[0].stairs[0].sharedId).toBe(copy.floors[1].stairs[0].sharedId);
    expect(copy.floors[0].stairs[0].sharedId).not.toBe("source-shaft-left");
    expect(copy.floors[0].elevators[0].sharedId).toBe(copy.floors[1].elevators[0].sharedId);
    expect(copy.floors[0].elevators[0].sharedId).not.toBe("source-elevator-shaft");
    expect(copy.exteriorEmergencyStairs?.[0].sharedId).toBe(copy.floors[0].stairs[1].sharedId);
    expect(copy.exteriorEmergencyStairs?.[0].sharedId).not.toBe("source-exterior-shaft");
    expect(copy.exteriorEmergencyStairs?.[0].occurrenceIds).toEqual({
      [copy.floors[0].id]: copy.floors[0].stairs[1].id,
      [copy.floors[1].id]: copy.floors[1].stairs[1].id,
    });
    expect(copy.exteriorEmergencyStairs?.[0].occurrenceNodeIds).toBeUndefined();
    expect(copy.entranceNodeId).toBeUndefined();
    expect(copy.floors.every((floor) => floor.rooms.every((room) => !room.accessNodeId && !room.navConnection && !room.accessType))).toBe(true);
    expect(copy.circulationGroups?.every((group) => group.buildingId === copy.id && group.id !== "source-shaft-left")).toBe(true);
    expect(copy.floors[0].furniture[0].groupId).toBe(copy.floors[1].furniture[0].groupId);
    expect(copy.floors[0].furniture[0].groupId).not.toBe("shared-furniture-group");
  });

  it("preserves a legacy Door link safely and drops an orphaned generated Exterior Stair occurrence", () => {
    const source = populatedBuilding();
    source.entrances = [];
    source.exteriorEmergencyStairs = [];
    source.floors[0].doors[0] = { ...source.floors[0].doors[0], buildingEntranceId: "deleted-source-entrance" };
    source.floors[0].stairs[1] = { ...source.floors[0].stairs[1], exteriorEmergencyStairId: "deleted-source-exterior-stair" };

    const copy = duplicateBuildingForCampus(source, { id: "new-building", name: "Copy", code: "COPY", x: source.x, y: source.y });

    expect(copy.floors[0].doors).toHaveLength(source.floors[0].doors.length);
    expect(copy.floors[0].doors[0]).toMatchObject({ x: source.floors[0].doors[0].x, y: source.floors[0].doors[0].y, width: source.floors[0].doors[0].width });
    expect(copy.floors[0].doors[0].buildingEntranceId).toBeUndefined();
    expect(copy.floors[0].stairs).toHaveLength(source.floors[0].stairs.length - 1);
    expect(copy.floors[0].stairs.map((stair) => stair.exteriorEmergencyStairId)).not.toContain("deleted-source-exterior-stair");
  });

  it("does not share mutable Room, Wall, or path geometry with its source", () => {
    const source = withThirdPopulatedFloor(populatedBuilding());
    const before = structuredClone(source);
    const copy = duplicateBuildingForCampus(source, { id: "new-building", name: "CABA Library (Copy)", code: "CABA-CP", x: source.x, y: source.y });
    copy.floors[0].rooms[0].shapePoints![0].x += 17;
    const copiedAnchoredWall = copy.floors[0].walls.find((wall) => wall.startAnchor)!;
    copiedAnchoredWall.startAnchor = { targetType: "room", roomId: "copy-room", edge: "left", offset: 0.5 };
    copy.floors[0].paths[0].points[0].x += 29;
    expect(source).toEqual(before);
  });

  it("avoids campus-reserved IDs even when an injected allocator repeats one", () => {
    const source = populatedBuilding();
    const reservedId = "20000000-0000-4000-8000-000000000099";
    const copy = duplicateBuildingForCampus(source, {
      id: "new-building", name: "Copy", code: "COPY", x: source.x, y: source.y,
      idFactory: () => reservedId,
      reservedIds: [reservedId],
    });
    expect(buildingLocalIdentities(copy)).not.toContain(reservedId);
    expect(buildingLocalIdentities(copy).size).toBe(buildingLocalIdentities(source).size);
  });

  it("survives the actual structure serialization and reload round trip", () => {
    const source = withThirdPopulatedFloor(populatedBuilding());
    const sourceBefore = structuredClone(source);
    const copy = duplicateBuildingForCampus(source, { id: "new-building", name: "CABA Library (Copy)", code: "CABA-CP", x: source.x, y: source.y });
    const campus = campusWith([source, copy]);
    const payload = serializeCampusStructure(campus);
    const reloaded = hydrateCampusStructure(campus, {
      buildings: payload.buildings.map((row) => ({ ...row, campus_id: campusId }) as never),
      floors: payload.floors.map((row) => row as never),
      mapElements: payload.map_elements.map((row) => row as never),
      navigationNodes: payload.navigation_nodes.map((row) => row as never),
      navigationEdges: payload.navigation_edges.map((row) => row as never),
    });
    const reloadedCopy = reloaded.buildings.find((building) => building.id === copy.id)!;
    expect(source).toEqual(sourceBefore);
    expect(buildingPhysicalSnapshot(reloaded.buildings.find((building) => building.id === source.id)!)).toEqual(buildingPhysicalSnapshot(source));
    expect(buildingPhysicalSnapshot(reloadedCopy)).toEqual(buildingPhysicalSnapshot(copy));
    expect(reloadedCopy.floors).toHaveLength(source.floors.length);
    expect(reloadedCopy.floors).toHaveLength(3);
    expect(reloadedCopy.floors.map((floor) => floor.rooms.length)).toEqual(source.floors.map((floor) => floor.rooms.length));
    expect(reloadedCopy.floors.map((floor) => floor.walls.length)).toEqual(source.floors.map((floor) => floor.walls.length));

    const secondPayload = serializeCampusStructure(reloaded);
    const secondReload = hydrateCampusStructure(reloaded, {
      buildings: secondPayload.buildings.map((row) => ({ ...row, campus_id: campusId }) as never),
      floors: secondPayload.floors.map((row) => row as never),
      mapElements: secondPayload.map_elements.map((row) => row as never),
      navigationNodes: secondPayload.navigation_nodes.map((row) => row as never),
      navigationEdges: secondPayload.navigation_edges.map((row) => row as never),
    });
    expect(buildingPhysicalSnapshot(secondReload.buildings.find((building) => building.id === copy.id)!))
      .toEqual(buildingPhysicalSnapshot(copy));
  });

  it("aborts before commit when a source Floor has a dangling wall anchor", () => {
    const source = populatedBuilding();
    const before = structuredClone(source);
    source.floors[0].walls = source.floors[0].walls.map((wall) => wall.id === "source-wall-a"
      ? { ...wall, startAnchor: { targetType: "room" as const, roomId: "missing-room", edge: "top" as const, offset: 0.2 } }
      : wall);
    const brokenBefore = structuredClone(source);
    expect(() => duplicateBuildingForCampus(source, { id: "new-building", name: "Copy", code: "COPY", x: 0, y: 0 })).toThrow(/Wall anchor refers to missing Room/);
    expect(source).toEqual(brokenBefore);
    expect(source).not.toEqual(before);
  });
});
