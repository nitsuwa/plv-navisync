import { describe, expect, it } from "vitest";
import type { Campus, FloorPlan } from "../../components/map-builder/types";
import { assertFloorPhysicalReferences, createDefaultFloor, normalizeFloor } from "../floorPlanNormalization";
import { instantiateFloorTemplate } from "../floorTemplates";
import { sanitizeFloorForTemplate, templatePayloadContainsNavigation } from "../templateSanitizer";
import { hydrateCampusStructure, serializeCampusStructure } from "../../services/campusStructureService";
import { createFloorPerimeterWalls } from "../floorShape";
import { physicalFloorCounts, physicalFloorSignature } from "../physicalFloorIntegrity";

const campusId = "10000000-0000-4000-8000-000000000001";
const buildingId = "10000000-0000-4000-8000-000000000002";
const sourceFloorId = "10000000-0000-4000-8000-000000000003";
const newFloorId = "10000000-0000-4000-8000-000000000004";

function authoredFloor(): FloorPlan {
  const floor = createDefaultFloor({ id: sourceFloorId, buildingId, number: 1, label: "Ground Floor", canvasW: 640, canvasH: 460 });
  const extensions = [{ id: "source-extension", side: "bottom" as const, offset: 230, width: 180, depth: 90 }];
  const perimeter = createFloorPerimeterWalls(floor.id, floor.canvasW!, floor.canvasH!, extensions, {
    perimeterThickness: 8, perimeterColor: "#334155", perimeterMaterial: "brick",
  }, floor.walls);
  return {
    ...floor,
    extensions,
    backgroundColor: "#f5f1e9",
    appearance: { material: "wood", texture: "subtle", color: "#f5f1e9" },
    showGrid: false,
    gridSize: 40,
    showWallJunctions: true,
    rooms: [
      {
        id: "source-room-a", name: "Main Library", type: "library", x: 40.25, y: 36.75, w: 260.5, h: 180.25,
        floorId: sourceFloorId, buildingId, color: "#dbeafe", rotation: 0, zOrder: 5, visible: true, locked: false,
        accessibility: true, accessNodeId: "source-nav-room", accessDoorId: "source-door-a", accessDoorIds: ["source-door-a"],
      },
      {
        id: "source-room-b", name: "Collaboration Room", type: "office", x: 110.25, y: 88.5, w: 92.75, h: 60.5,
        floorId: sourceFloorId, buildingId, color: "#dcfce7", rotation: 0, zOrder: 9, visible: true, locked: true,
        shapePoints: [{ x: 110.25, y: 88.5 }, { x: 203, y: 88.5 }, { x: 190, y: 149 }, { x: 110.25, y: 149 }],
      },
    ],
    walls: [
      ...perimeter,
      {
        id: "source-wall-a", x1: 40.25, y1: 36.75, x2: 300.75, y2: 36.75, thickness: 5.25,
        color: "#825c3a", material: "wood", layer: "structure", zOrder: 2, visible: true, locked: false,
        startAnchor: { targetType: "room", roomId: "source-room-a", edge: "top", offset: 0 },
        endAnchor: { targetType: "room", roomId: "source-room-a", edge: "top", offset: 1 },
      },
      {
        id: "source-wall-b", x1: 390.25, y1: 58.5, x2: 552.75, y2: 162.25, thickness: 3.75,
        color: "#64748b", material: "glass", layer: "partition", zOrder: 14, visible: true, locked: true,
        junctionBlocks: "show",
        startAnchor: { targetType: "room", roomId: "source-room-a", edge: "right", offset: 0.25 },
        endAnchor: { targetType: "room", roomId: "source-room-b", edge: "left", offset: 0.75 },
      },
    ],
    doors: [
      { id: "source-door-a", x: 120.75, y: 36.75, width: 23.5, direction: "right", color: "#8b5e34", wallId: "source-wall-a", offset: 0.31, doorType: "double", hinge: "right", swingSide: "b", zOrder: 7, openingType: "open_passage", buildingEntranceId: "canonical-entrance", visible: true, locked: false },
    ],
    windows: [
      { id: "source-window-a", x: 452.35, y: 98.3, width: 37.5, height: 6.25, color: "#38bdf8", wallId: "source-wall-b", offset: 0.37, zOrder: 8, visible: true, locked: true },
    ],
    furniture: [
      { id: "source-furniture-a", type: "desk", name: "Librarian Desk", category: "tables", x: 80.25, y: 110.5, width: 55.5, height: 28.25, rotation: 13.5, color: "#c08457", groupId: "source-group", zOrder: 12, visible: true, locked: false, layer: "objects", flipX: true },
      { id: "source-furniture-b", type: "chair", name: "Desk Chair", category: "seating", x: 146.75, y: 110.25, width: 18.5, height: 19.25, rotation: 2.5, color: "#64748b", groupId: "source-group", zOrder: 13, visible: true, locked: true, layer: "objects", exteriorZoneId: "source-zone" },
    ],
    stairs: [
      { id: "source-stairs", x: 488.25, y: 240.5, width: 48.5, height: 90.25, rotation: 3.5, flip: true, direction: "up", label: "Stair A", sharedId: "source-shaft", floors: [1, 2], zOrder: 20, visible: true, locked: true },
      { id: "source-exterior-stair", x: 550.25, y: 230.5, width: 42.5, height: 84.25, rotation: 0, flip: false, direction: "down", label: "Exterior Stair", sharedId: "source-exterior-shaft", floors: [1, 2], exteriorEmergencyStairId: "canonical-exterior-stair", zOrder: 20, visible: true, locked: false },
    ],
    ramps: [{ id: "source-ramp", x: 370.5, y: 260.25, width: 84.5, height: 20.5, rotation: 1.25, label: "Ramp A", direction: "down", sharedId: "source-ramp-shaft", handrails: true, slope: "gentle", zOrder: 21, visible: true, locked: true }],
    elevators: [{ id: "source-elevator", x: 285.25, y: 275.5, width: 42.5, height: 42.5, rotation: 2.5, doorWidth: 12.5, label: "Lift A", sharedId: "source-lift", floors: [1, 2], zOrder: 22, visible: true, locked: true }],
    labels: [{ id: "source-label", x: 346.5, y: 220.25, text: "READING AREA", fontSize: 15.5, color: "#1e293b", rotation: 1.5, align: "center", zOrder: 23, visible: true, locked: true }],
    paths: [{ id: "source-floor-path", points: [{ x: 44.25, y: 230.5 }, { x: 180.75, y: 240.25 }, { x: 330.5, y: 280.75 }], type: "walkway", color: "#16a34a", width: 4.5 }],
    exteriorZones: [{ id: "source-zone", type: "veranda", side: "top", offset: 0.45, width: 200.5, depth: 64.25, x: 180.5, y: -64.25, label: "North Veranda", labelOffsetX: 4.5, labelOffsetY: 2.5, walkable: true, linkedEntranceId: "canonical-entrance", linkedEntranceIds: ["canonical-entrance"], zOrder: 24, visible: true, locked: false }],
    entranceSteps: [{ id: "source-steps", x: 215.5, y: -28.25, width: 65.5, height: 25.25, rotation: 1.5, label: "Entrance Steps", parentZoneId: "source-zone", linkedEntranceId: "canonical-entrance", attachmentEdge: "outer", attachmentOffset: 0.5, zOrder: 25, visible: true, locked: false }],
    entranceRamps: [{ id: "source-entrance-ramp", x: 300.25, y: -32.5, width: 85.5, height: 33.25, rotation: 0.5, label: "Entrance Ramp", parentZoneId: "source-zone", linkedEntranceId: "canonical-entrance", attachmentEdge: "outer", attachmentOffset: 0.7, handrails: true, layout: "l_turn_left", zOrder: 26, visible: true, locked: false }],
  };
}

function denselyPopulatedFloor(): FloorPlan {
  const source = authoredFloor();
  const rooms = Array.from({ length: 12 }, (_, index) => {
    const column = index % 4;
    const row = Math.floor(index / 4);
    return {
      id: `dense-room-${index + 1}`, name: `Library Room ${index + 1}`, type: "office",
      x: 20 + column * 150, y: 20 + row * 130, w: 110, h: 100,
      floorId: source.id, buildingId,
    };
  });
  const walls = rooms.flatMap((room, index) => [
    {
      id: `dense-wall-${index * 2 + 1}`, x1: room.x, y1: room.y, x2: room.x + room.w, y2: room.y,
      thickness: 4, material: "brick", color: "#754c24",
      startAnchor: { targetType: "room" as const, roomId: room.id, edge: "top" as const, offset: 0 },
      endAnchor: { targetType: "room" as const, roomId: room.id, edge: "top" as const, offset: 1 },
    },
    {
      id: `dense-wall-${index * 2 + 2}`, x1: room.x, y1: room.y, x2: room.x, y2: room.y + room.h,
      thickness: 4, material: "brick", color: "#754c24",
      startAnchor: { targetType: "room" as const, roomId: room.id, edge: "left" as const, offset: 0 },
      endAnchor: { targetType: "room" as const, roomId: room.id, edge: "left" as const, offset: 1 },
    },
  ]);
  const doors = Array.from({ length: 14 }, (_, index) => {
    const wall = walls[index];
    return { id: `dense-door-${index + 1}`, x: wall.x1 + (wall.x2 - wall.x1) * 0.5, y: wall.y1 + (wall.y2 - wall.y1) * 0.5,
      width: 20, direction: "right", color: "#8b5e34", wallId: wall.id, offset: 0.5 };
  });
  const windows = Array.from({ length: 11 }, (_, index) => {
    const wall = walls[(index + 14) % walls.length];
    return { id: `dense-window-${index + 1}`, x: wall.x1 + (wall.x2 - wall.x1) * 0.5, y: wall.y1 + (wall.y2 - wall.y1) * 0.5,
      width: 18, height: 6, color: "#38bdf8", wallId: wall.id, offset: 0.5 };
  });
  const furniture = rooms.flatMap((room, roomIndex) => Array.from({ length: 4 }, (_, itemIndex) => ({
    id: `dense-furniture-${roomIndex * 4 + itemIndex + 1}`, type: "desk", name: `Desk ${roomIndex * 4 + itemIndex + 1}`,
    category: "tables", x: room.x + 12 + (itemIndex % 2) * 48, y: room.y + 16 + Math.floor(itemIndex / 2) * 42,
    width: 24, height: 16, rotation: itemIndex * 3, color: "#c08457",
  })));
  return { ...source, rooms, walls: [...source.walls.filter((wall) => wall.managedKind === "perimeter"), ...walls], doors, windows, furniture };
}

function visualSnapshot(floor: FloorPlan) {
  const roomIndex = new Map(floor.rooms.map((room, index) => [room.id, index]));
  const wallRef = (id: string | undefined) => {
    const wall = floor.walls.find((candidate) => candidate.id === id);
    return wall?.managedKind === "perimeter" ? `perimeter-${wall.perimeterSide}` : floor.walls.filter((candidate) => candidate.managedKind !== "perimeter").findIndex((candidate) => candidate.id === id);
  };
  return {
    canvas: [floor.canvasW, floor.canvasH, floor.backgroundColor, floor.appearance, floor.showGrid, floor.gridSize, floor.showWallJunctions],
    extensions: (floor.extensions ?? []).map(({ id: _id, ...extension }) => extension),
    perimeter: floor.walls.filter((wall) => wall.managedKind === "perimeter").map(({ id: _id, ...wall }) => wall),
    rooms: floor.rooms.map(({ id: _id, floorId: _floorId, buildingId: _buildingId, accessNodeId: _node, accessDoorId: _door, accessDoorIds: _doors, ...room }) => room),
    walls: floor.walls.filter((wall) => wall.managedKind !== "perimeter").map((wall) => ({
      x1: wall.x1, y1: wall.y1, x2: wall.x2, y2: wall.y2, thickness: wall.thickness, height: wall.height,
      color: wall.color, material: wall.material, layer: wall.layer, zOrder: wall.zOrder, visible: wall.visible,
      locked: wall.locked, junctionBlocks: wall.junctionBlocks,
      startAnchor: wall.startAnchor && { roomIndex: roomIndex.get(wall.startAnchor.roomId), edge: wall.startAnchor.edge, offset: wall.startAnchor.offset },
      endAnchor: wall.endAnchor && { roomIndex: roomIndex.get(wall.endAnchor.roomId), edge: wall.endAnchor.edge, offset: wall.endAnchor.offset },
    })),
    doors: floor.doors.map((door) => ({ x: door.x, y: door.y, width: door.width, direction: door.direction, color: door.color,
      doorType: door.doorType, hinge: door.hinge, swingSide: door.swingSide, openingType: door.openingType, accessDirection: door.accessDirection,
      offset: door.offset, zOrder: door.zOrder, visible: door.visible, locked: door.locked, label: door.label, wallRef: wallRef(door.wallId) })),
    windows: floor.windows.map((window) => ({ x: window.x, y: window.y, width: window.width, height: window.height, color: window.color,
      offset: window.offset, zOrder: window.zOrder, visible: window.visible, locked: window.locked, wallRef: wallRef(window.wallId),
      rotation: (window as typeof window & { rotation?: number }).rotation })),
    furniture: floor.furniture.map((item) => ({ x: item.x, y: item.y, width: item.width, height: item.height, type: item.type, name: item.name,
      category: item.category, color: item.color, rotation: item.rotation, flipX: item.flipX, flipY: item.flipY, zOrder: item.zOrder,
      layer: item.layer, visible: item.visible, locked: item.locked, groupIndex: item.groupId ? floor.furniture.findIndex((candidate) => candidate.groupId === item.groupId) : null,
      zoneIndex: item.exteriorZoneId ? (floor.exteriorZones ?? []).findIndex((zone) => zone.id === item.exteriorZoneId) : null })),
    stairs: floor.stairs.map(({ id: _id, sharedId: _sharedId, floors: _floors, exteriorEmergencyStairId: _external, emergencySafe: _emergency, ...item }) => item),
    ramps: floor.ramps.map(({ id: _id, sharedId: _sharedId, ...item }) => item),
    elevators: floor.elevators.map(({ id: _id, sharedId: _sharedId, floors: _floors, ...item }) => item),
    labels: floor.labels.map(({ id: _id, ...item }) => item),
    paths: floor.paths.map(({ id: _id, ...path }) => path),
    exteriorZones: (floor.exteriorZones ?? []).map(({ id: _id, linkedEntranceId: _entrance, linkedEntranceIds: _entrances, ...zone }) => zone),
    entranceSteps: (floor.entranceSteps ?? []).map(({ id: _id, parentZoneId, linkedEntranceId: _entrance, ...item }) => ({ ...item, parentZoneIndex: parentZoneId ? (floor.exteriorZones ?? []).findIndex((zone) => zone.id === parentZoneId) : null })),
    entranceRamps: (floor.entranceRamps ?? []).map(({ id: _id, parentZoneId, linkedEntranceId: _entrance, ...item }) => ({ ...item, parentZoneIndex: parentZoneId ? (floor.exteriorZones ?? []).findIndex((zone) => zone.id === parentZoneId) : null })),
  };
}

describe("Floor Template physical round-trip", () => {
  it("rejects dangling physical references instead of silently dropping them", () => {
    const source = authoredFloor();
    const wallAnchorBroken = {
      ...source,
      walls: source.walls.map((wall) => wall.id === "source-wall-b"
        ? { ...wall, startAnchor: { targetType: "room" as const, roomId: "missing-room", edge: "top" as const, offset: 0.2 } }
        : wall),
    };
    expect(() => sanitizeFloorForTemplate(wallAnchorBroken, { name: "Broken Anchor", source: "campus" }, campusId))
      .toThrow(/Wall anchor refers to missing Room/);

    const openingBroken = {
      ...source,
      doors: source.doors.map((door) => ({ ...door, wallId: "missing-wall" })),
    };
    expect(() => sanitizeFloorForTemplate(openingBroken, { name: "Broken Opening", source: "campus" }, campusId))
      .toThrow(/Door refers to missing Wall/);
  });

  it("keeps the source read-only and preserves exact physical geometry through save/reload", () => {
    const source = authoredFloor();
    const sourceBefore = structuredClone(source);
    const definition = sanitizeFloorForTemplate(source, { name: "Exact Floor", source: "campus" }, campusId);
    expect(source).toEqual(sourceBefore);
    expect(templatePayloadContainsNavigation(definition)).toBe(false);
    expect(definition.objects.some((object) => object.kind === "room")).toBe(true);
    expect(definition.objects.some((object) => object.kind === "room-template")).toBe(false);
    expect(JSON.stringify(definition)).not.toMatch(/source-room|source-wall|source-door|source-window|source-shaft|source-lift|source-nav/);

    const blank = createDefaultFloor({ id: newFloorId, buildingId, number: 2, label: "Floor 2", canvasW: 600, canvasH: 450 });
    const instantiated = instantiateFloorTemplate(definition, { baseFloor: blank, buildingId }).floor;
    expect(instantiated.canvasW).toBe(source.canvasW);
    expect(instantiated.canvasH).toBe(source.canvasH);
    expect(instantiated.walls.filter((wall) => wall.managedKind === "perimeter")).toHaveLength(source.walls.filter((wall) => wall.managedKind === "perimeter").length);
    expect(instantiated.walls.filter((wall) => wall.managedKind !== "perimeter")).toHaveLength(2);
    expect(instantiated.doors).toHaveLength(1);
    expect(instantiated.paths).toHaveLength(source.paths.length);
    expect(instantiated.exteriorZones).toHaveLength(source.exteriorZones!.length);
    expect(instantiated.entranceSteps).toHaveLength(source.entranceSteps!.length);
    expect(instantiated.entranceRamps).toHaveLength(source.entranceRamps!.length);
    expect(instantiated.stairs).toHaveLength(source.stairs.length);
    expect(instantiated.stairs.find((stair) => stair.label === "Exterior Stair")?.exteriorEmergencyStairId).toBeUndefined();
    expect(instantiated.doors[0].buildingEntranceId).toBeUndefined();
    const instantiatedRoomWithDoor = instantiated.rooms.find((room) => room.name === "Main Library")!;
    const instantiatedRoomWithoutDoor = instantiated.rooms.find((room) => room.name === "Collaboration Room")!;
    expect(instantiatedRoomWithDoor.accessNodeId).toBeUndefined();
    expect(instantiatedRoomWithDoor.accessDoorId).toBe(instantiated.doors[0].id);
    expect(instantiatedRoomWithDoor.accessDoorIds).toEqual([instantiated.doors[0].id]);
    expect(instantiatedRoomWithoutDoor.accessDoorId).toBeUndefined();
    expect(instantiatedRoomWithoutDoor.accessDoorIds).toBeUndefined();
    expect(instantiated.rooms.map((room) => room.id)).not.toContain("source-room-a");
    expect(instantiated.walls.find((wall) => wall.id === instantiated.doors[0].wallId)).toBeDefined();
    expect(instantiated.windows.every((window) => instantiated.walls.some((wall) => wall.id === window.wallId))).toBe(true);
    expect(instantiated.walls.filter((wall) => wall.managedKind !== "perimeter").flatMap((wall) => [wall.startAnchor, wall.endAnchor])
      .filter((anchor): anchor is NonNullable<typeof anchor> => !!anchor).every((anchor) => instantiated.rooms.some((room) => room.id === anchor.roomId))).toBe(true);
    const instantiatedRoomA = instantiated.rooms.find((room) => room.name === "Main Library")!;
    const instantiatedRoomB = instantiated.rooms.find((room) => room.name === "Collaboration Room")!;
    const instantiatedWallA = instantiated.walls.find((wall) => wall.id === instantiated.doors[0].wallId)!;
    const instantiatedWallB = instantiated.walls.find((wall) => wall.id !== instantiatedWallA.id && wall.managedKind !== "perimeter")!;
    expect(instantiatedWallA.startAnchor?.roomId).toBe(instantiatedRoomA.id);
    expect(instantiatedWallA.endAnchor?.roomId).toBe(instantiatedRoomA.id);
    expect(instantiatedWallB.startAnchor?.roomId).toBe(instantiatedRoomA.id);
    expect(instantiatedWallB.endAnchor?.roomId).toBe(instantiatedRoomB.id);
    expect([instantiatedWallA.startAnchor?.roomId, instantiatedWallA.endAnchor?.roomId, instantiatedWallB.startAnchor?.roomId, instantiatedWallB.endAnchor?.roomId])
      .not.toContain("source-room-a");
    expect(new Set(instantiated.furniture.map((item) => item.groupId)).size).toBe(1);
    expect(instantiated.furniture[0].groupId).not.toBe("source-group");
    expect(instantiated.furniture[1].exteriorZoneId).toBe(instantiated.exteriorZones?.[0].id);
    expect(instantiated.entranceSteps[0].parentZoneId).toBe(instantiated.exteriorZones?.[0].id);
    expect(instantiated.entranceRamps[0].parentZoneId).toBe(instantiated.exteriorZones?.[0].id);
    expect(instantiated.exteriorZones?.[0].linkedEntranceId).toBeUndefined();
    expect(instantiated.entranceSteps[0].linkedEntranceId).toBeUndefined();
    expect(instantiated.paths[0]).not.toHaveProperty("kind");
    expect(visualSnapshot(instantiated)).toEqual(visualSnapshot(normalizeFloor(source, { buildingId })));

    const readyToSave = normalizeFloor(instantiated, { buildingId });
    expect(() => assertFloorPhysicalReferences(instantiated)).not.toThrow();
    expect(() => assertFloorPhysicalReferences(readyToSave)).not.toThrow();
    const campus: Campus = {
      id: campusId, name: "PLV", code: "PLV", description: "", address: "", city: "", province: "", postalCode: "",
      status: "active", publishStatus: "draft", visibleToStudents: false, canvasW: 640, canvasH: 460,
      buildings: [{ id: buildingId, name: "Main", code: "MAIN", category: "Academic", description: "", x: 0, y: 0, width: 640, height: 460, color: "#123456", floors: [readyToSave] }],
      markers: [], paths: [], navNodes: [], navEdges: [], features: {}, settings: {}, createdAt: "2026-01-01", updatedAt: "2026-01-01",
    };
    const payload = serializeCampusStructure(campus);
    const reloaded = hydrateCampusStructure(campus, {
      buildings: payload.buildings.map((row) => ({ ...row, campus_id: campusId }) as never),
      floors: payload.floors.map((row) => row as never),
      mapElements: payload.map_elements.map((row) => row as never),
      navigationNodes: payload.navigation_nodes.map((row) => row as never),
      navigationEdges: payload.navigation_edges.map((row) => row as never),
    });
    const persistedFloor = normalizeFloor(reloaded.buildings[0].floors[0], { buildingId });
    expect(() => assertFloorPhysicalReferences(persistedFloor)).not.toThrow();
    expect(visualSnapshot(persistedFloor)).toEqual(visualSnapshot(instantiated));
    expect(persistedFloor.walls.filter((wall) => wall.managedKind === "perimeter")).toHaveLength(source.walls.filter((wall) => wall.managedKind === "perimeter").length);
    expect(persistedFloor.navNodes).toBeUndefined();
    expect(persistedFloor.navEdges).toBeUndefined();

    const secondPayload = serializeCampusStructure(reloaded);
    const secondReload = hydrateCampusStructure(reloaded, {
      buildings: secondPayload.buildings.map((row) => ({ ...row, campus_id: campusId }) as never),
      floors: secondPayload.floors.map((row) => row as never),
      mapElements: secondPayload.map_elements.map((row) => row as never),
      navigationNodes: secondPayload.navigation_nodes.map((row) => row as never),
      navigationEdges: secondPayload.navigation_edges.map((row) => row as never),
    });
    expect(visualSnapshot(secondReload.buildings[0].floors[0])).toEqual(visualSnapshot(instantiated));
  });

  it("allocates template physical identities outside campus-reserved IDs", () => {
    const source = authoredFloor();
    const definition = sanitizeFloorForTemplate(source, { name: "Reserved IDs", source: "campus" }, campusId);
    const reservedId = "20000000-0000-4000-8000-000000000099";
    const blank = createDefaultFloor({ id: newFloorId, buildingId, number: 2, label: "Floor 2", canvasW: 600, canvasH: 450 });
    const instantiated = instantiateFloorTemplate(definition, {
      baseFloor: blank, buildingId, idFactory: () => reservedId, reservedIds: [reservedId],
    }).floor;
    const ids = [
      ...instantiated.rooms, ...instantiated.paths, ...instantiated.walls, ...instantiated.doors,
      ...instantiated.windows, ...instantiated.furniture, ...instantiated.stairs, ...instantiated.ramps,
      ...instantiated.elevators, ...instantiated.labels, ...(instantiated.extensions ?? []),
      ...(instantiated.exteriorZones ?? []), ...(instantiated.entranceSteps ?? []), ...(instantiated.entranceRamps ?? []),
    ].map((item) => item.id);
    expect(ids).not.toContain(reservedId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("retains realistic large-floor object counts and layout through instantiate → save payload → reload → resave", () => {
    const source = denselyPopulatedFloor();
    const sourceBefore = structuredClone(source);
    const definition = sanitizeFloorForTemplate(source, { name: "Dense Round Trip", source: "campus" }, campusId);
    expect(source).toEqual(sourceBefore);

    const blank = createDefaultFloor({ id: newFloorId, buildingId, number: 2, label: "Floor 2", canvasW: 600, canvasH: 450 });
    const instantiated = normalizeFloor(instantiateFloorTemplate(definition, { baseFloor: blank, buildingId }).floor, { buildingId });
    const counts = physicalFloorCounts(instantiated);
    expect(counts).toMatchObject({ rooms: 12, walls: 32, doors: 14, windows: 11, furniture: 48 });
    expect(instantiated.walls.flatMap((wall) => [wall.startAnchor, wall.endAnchor]).filter(Boolean)
      .every((anchor) => instantiated.rooms.some((room) => room.id === anchor!.roomId))).toBe(true);

    const campus: Campus = {
      id: campusId, name: "PLV", code: "PLV", description: "", address: "", city: "", province: "", postalCode: "",
      status: "active", publishStatus: "draft", visibleToStudents: false, canvasW: 640, canvasH: 460,
      buildings: [{ id: buildingId, name: "Main", code: "MAIN", category: "Academic", description: "", x: 0, y: 0, width: 640, height: 460, color: "#123456", floors: [instantiated] }],
      markers: [], paths: [], navNodes: [], navEdges: [], features: {}, settings: {}, createdAt: "2026-01-01", updatedAt: "2026-01-01",
    };
    const payload = serializeCampusStructure(campus);
    const expectedPayloadIds = [
      ...instantiated.rooms, ...instantiated.paths, ...instantiated.walls, ...instantiated.doors, ...instantiated.windows,
      ...instantiated.furniture, ...instantiated.stairs, ...instantiated.ramps, ...instantiated.elevators, ...instantiated.labels,
    ].map((item) => item.id).sort();
    const actualPayloadRows = payload.map_elements.filter((row) => row.floor_id === instantiated.id);
    expect(actualPayloadRows).toHaveLength(123);
    expect(actualPayloadRows.map((row) => String(row.id)).sort()).toEqual(expectedPayloadIds);

    const reload = (base: Campus, serialized = serializeCampusStructure(base)) => hydrateCampusStructure(base, {
      buildings: serialized.buildings.map((row) => ({ ...row, campus_id: campusId }) as never),
      floors: serialized.floors.map((row) => row as never),
      mapElements: serialized.map_elements.map((row) => row as never),
      navigationNodes: serialized.navigation_nodes.map((row) => row as never),
      navigationEdges: serialized.navigation_edges.map((row) => row as never),
    });
    const afterSaveReload = reload(campus).buildings[0].floors[0];
    expect(physicalFloorCounts(afterSaveReload)).toEqual(counts);
    expect(physicalFloorSignature(afterSaveReload)).toBe(physicalFloorSignature(instantiated));
    expect(visualSnapshot(afterSaveReload)).toEqual(visualSnapshot(instantiated));
    const afterSecondReload = reload(reload(campus)).buildings[0].floors[0];
    expect(physicalFloorCounts(afterSecondReload)).toEqual(counts);
    expect(physicalFloorSignature(afterSecondReload)).toBe(physicalFloorSignature(instantiated));
    expect(visualSnapshot(afterSecondReload)).toEqual(visualSnapshot(instantiated));
  });

  it("remaps legacy source Room IDs stored in template-local wall references", () => {
    const source = authoredFloor();
    const definition = sanitizeFloorForTemplate(source, { name: "Legacy References", source: "campus" }, campusId);
    const legacy = structuredClone(definition);
    const roomObjects = legacy.objects.filter((object) => object.kind === "room");
    const legacyIds = ["legacy-source-room-a", "legacy-source-room-b"];
    roomObjects.forEach((object, index) => {
      Object.assign(object, { id: legacyIds[index] });
      delete (object as { roomKey?: string }).roomKey;
    });
    legacy.objects.filter((object) => object.kind === "wall").forEach((object, index) => {
      if (object.kind !== "wall") return;
      if (index === 0) {
        object.startAnchor = { roomRef: legacyIds[0], edge: "top", offset: 0 };
        object.endAnchor = { roomRef: legacyIds[0], edge: "top", offset: 1 };
      } else {
        object.startAnchor = { roomRef: legacyIds[0], edge: "right", offset: 0.25 };
        object.endAnchor = { roomRef: legacyIds[1], edge: "left", offset: 0.75 };
      }
    });
    const blank = createDefaultFloor({ id: newFloorId, buildingId, number: 2, label: "Floor 2", canvasW: 600, canvasH: 450 });
    const result = instantiateFloorTemplate(legacy, { baseFloor: blank, buildingId }).floor;
    expect(result.walls.flatMap((wall) => [wall.startAnchor?.roomId, wall.endAnchor?.roomId])).not.toContain(legacyIds[0]);
    expect(result.walls.flatMap((wall) => [wall.startAnchor?.roomId, wall.endAnchor?.roomId])).not.toContain(legacyIds[1]);
    expect(() => assertFloorPhysicalReferences(result)).not.toThrow();
  });
});
