import { describe, expect, it } from "vitest";
import {
  createDefaultFloor,
  assertFloorPhysicalReferences,
  defaultFloorLabel,
  duplicateFloorForBuilding,
  floorUndoEntryFromFloor,
  normalizeFloor,
  normalizeFloors,
  normalizeRoomAccessDoors,
} from "../floorPlanNormalization";
import type { FloorPlan } from "../../components/map-builder/types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("floorPlanNormalization", () => {
  it("drops stale Room Door IDs and canonicalizes the surviving same-Floor link", () => {
    const sourceRoom = {
      id: "r-lab", name: "Fluid Mechanics Laboratory", type: "laboratory", x: 0, y: 0, w: 100, h: 80,
      buildingId: "b1", floorId: "f1", accessDoorId: "missing-door", accessDoorIds: ["missing-door", "door-b", "door-b"],
      accessNodeId: "room-node",
    };
    const wall = { id: "wall-top", x1: 0, y1: 0, x2: 100, y2: 0, thickness: 4, color: "#64748b" };
    const survivingDoor = { id: "door-b", x: 60, y: 0, width: 16, direction: "left" as const, color: "#8b5e34", wallId: "wall-top" };
    const floor = normalizeFloor({ id: "f1", buildingId: "b1", rooms: [sourceRoom], walls: [wall], doors: [survivingDoor] });

    expect(floor.rooms[0]).toMatchObject({ accessDoorId: "door-b", accessDoorIds: ["door-b"], accessNodeId: "room-node" });
    expect(() => assertFloorPhysicalReferences(floor)).not.toThrow();
  });

  it("promotes the remaining Room Door after deletion and clears only Door metadata when none remain", () => {
    const room = {
      id: "r1", name: "Room A", type: "classroom", x: 0, y: 0, w: 100, h: 80,
      buildingId: "b1", floorId: "f1", accessDoorId: "door-a", accessDoorIds: ["door-a", "door-b"], accessType: "door" as const,
      accessNodeId: "room-node",
    };
    const walls = [
      { id: "wall-a", x1: 0, y1: 0, x2: 50, y2: 0, thickness: 4, color: "#64748b" },
      { id: "wall-b", x1: 50, y1: 0, x2: 100, y2: 0, thickness: 4, color: "#64748b" },
    ];
    const doorB = { id: "door-b", x: 75, y: 0, width: 16, direction: "left" as const, color: "#8b5e34", wallId: "wall-b" };

    const afterDeletingA = normalizeRoomAccessDoors([room], [doorB], walls)[0];
    expect(afterDeletingA).toMatchObject({ accessDoorId: "door-b", accessDoorIds: ["door-b"], accessNodeId: "room-node" });

    const afterDeletingBoth = normalizeRoomAccessDoors([room], [], walls)[0];
    expect(afterDeletingBoth).toMatchObject({ x: 0, y: 0, w: 100, h: 80, accessNodeId: "room-node" });
    expect(afterDeletingBoth.accessDoorId).toBeUndefined();
    expect(afterDeletingBoth.accessDoorIds).toBeUndefined();
    expect(afterDeletingBoth.accessType).toBeUndefined();
  });

  it("remaps Room Door links through an explicit copied Door identity map", () => {
    const room = {
      id: "r1", name: "Room A", type: "classroom", x: 0, y: 0, w: 100, h: 80,
      buildingId: "b1", floorId: "f1", accessDoorId: "old-door", accessDoorIds: ["old-door"],
    };
    const wall = { id: "new-wall", x1: 0, y1: 0, x2: 100, y2: 0, thickness: 4, color: "#64748b" };
    const copiedDoor = { id: "new-door", x: 50, y: 0, width: 16, direction: "left" as const, color: "#8b5e34", wallId: "new-wall" };
    const copiedRoom = normalizeRoomAccessDoors([room], [copiedDoor], [wall], new Map([["old-door", "new-door"]]))[0];

    expect(copiedRoom).toMatchObject({ accessDoorId: "new-door", accessDoorIds: ["new-door"] });
  });

  it("normalizes older or incomplete floor data into the full floor shape", () => {
    const source = {
      id: "f-old",
      number: "2",
      rooms: [{ id: "r1", name: "Lab", type: "lab", x: 10, y: 20, w: 60, h: 40 }],
      walls: [{ id: "w1", x1: 0, y1: 0, x2: 80, y2: 0, thickness: 4, color: "#64748b" }],
    } as unknown as Partial<FloorPlan>;

    const floor = normalizeFloor(source, { buildingId: "b1" });

    expect(floor.id).toBe("f-old");
    expect(floor.buildingId).toBe("b1");
    expect(floor.number).toBe(2);
    expect(floor.label).toBe("Floor 2");
    expect(floor.canvasW).toBe(600);
    expect(floor.canvasH).toBe(450);
    expect(floor.rooms[0].buildingId).toBe("b1");
    expect(floor.rooms[0].floorId).toBe("f-old");
    expect(floor.paths).toEqual([]);
    expect(floor.doors).toEqual([]);
    expect(floor.windows).toEqual([]);
    expect(floor.furniture).toEqual([]);
    expect(floor.stairs).toEqual([]);
    expect(floor.ramps).toEqual([]);
    expect(floor.elevators).toEqual([]);
    expect(floor.labels).toEqual([]);
    expect(floor.backgroundImage).toBeUndefined();
    expect(floor.calibration).toBeUndefined();
    expect(floor.gridSize).toBe(20);
  });

  it("creates default floors with stable labels and initialized collections", () => {
    const first = createDefaultFloor({ id: "f1", buildingId: "b1", number: 1 });
    const third = createDefaultFloor({ id: "f3", buildingId: "b1", number: 3 });

    expect(defaultFloorLabel(1)).toBe("Ground Floor");
    expect(first.label).toBe("Ground Floor");
    expect(third.label).toBe("Floor 3");
    expect(first.canvasW).toBe(600);
    expect(first.canvasH).toBe(450);
    expect(first.gridSize).toBe(20);
    expect(first.rooms).toEqual([]);
    // B7 QA: new floors include managed structural perimeter walls by default.
    expect(third.walls.length).toBe(4);
    expect(third.walls.every((w) => w.managedKind === "perimeter")).toBe(true);
  });

  it("normalizes floor grid presets to the supported 10/20/40 values", () => {
    expect(normalizeFloor({ id: "f1", buildingId: "b1", number: 1, gridSize: 10 }).gridSize).toBe(10);
    expect(normalizeFloor({ id: "f1", buildingId: "b1", number: 1, gridSize: 40 }).gridSize).toBe(40);
    expect(normalizeFloor({ id: "f1", buildingId: "b1", number: 1, gridSize: 25 as 20 }).gridSize).toBe(20);
  });

  it("normalizes floor lists with per-building room ownership defaults", () => {
    const floors = normalizeFloors([
      { id: "f1", rooms: [{ id: "r1", name: "Room", type: "classroom", x: 0, y: 0, w: 20, h: 20 }] } as Partial<FloorPlan>,
      { id: "f2", number: 7, label: "Penthouse" },
    ], "b1");

    expect(floors[0].number).toBe(1);
    expect(floors[0].rooms[0].buildingId).toBe("b1");
    expect(floors[0].rooms[0].floorId).toBe("f1");
    expect(floors[1].number).toBe(7);
    expect(floors[1].label).toBe("Penthouse");
  });

  it("preserves reusable floor-plan furniture keys through normalization and duplication", () => {
    const furniture = [
      "lecture-row-6", "study-table-6", "lab-workbench-stools", "computer-workstation-row-4",
      "bookshelf", "library-bookshelf", "toilet", "toilet-stall", "pwd-toilet-stall", "sink", "fire-extinguisher",
      "whiteboard", "lectern", "printer-copier", "server-rack", "laboratory-sink", "locker",
    ].map((type, index) => ({
      id: `f-${index}`, type, name: type, category: "furniture", x: index * 12, y: 20,
      width: 24, height: 16, rotation: index * 15, color: "#64748b",
    }));
    const floor = normalizeFloor({ id: "f1", buildingId: "b1", number: 1, furniture });
    expect(floor.furniture.map((item) => item.type)).toEqual(furniture.map((item) => item.type));
    expect(floor.furniture.map((item) => item.rotation)).toEqual(furniture.map((item) => item.rotation));

    const copy = duplicateFloorForBuilding(floor, { id: "f2", buildingId: "b2", number: 2 });
    expect(copy.furniture.map((item) => item.type)).toEqual(furniture.map((item) => item.type));
    expect(copy.furniture.every((item, index) => item.id !== furniture[index].id)).toBe(true);
  });

  it("duplicates floors for a new building while remapping nested element ids", () => {
    const source = normalizeFloor({
      id: "f1",
      buildingId: "b1",
      number: 1,
      label: "Ground Floor",
      rooms: [{ id: "r1", name: "Room", type: "classroom", x: 0, y: 0, w: 20, h: 20, buildingId: "b1", floorId: "f1" }],
      paths: [{ id: "p1", points: [{ x: 0, y: 0 }], type: "main", color: "#000", width: 4 }],
      walls: [{ id: "w1", x1: 0, y1: 0, x2: 20, y2: 0, thickness: 4, color: "#64748b" }],
      doors: [{ id: "d1", x: 5, y: 0, width: 8, direction: "left", color: "#111" }],
      windows: [{ id: "win1", x: 6, y: 0, width: 10, height: 4, color: "#222" }],
      furniture: [{ id: "fur1", type: "desk", name: "Desk", category: "work", x: 1, y: 1, width: 10, height: 6, rotation: 0, color: "#333" }],
      stairs: [{ id: "s1", x: 1, y: 1, width: 10, height: 10, direction: "up", label: "Stairs" }],
      ramps: [{ id: "ra1", x: 2, y: 2, width: 10, height: 6, label: "Ramp" }],
      elevators: [{ id: "e1", x: 3, y: 3, width: 10, height: 10, doorWidth: 5, label: "Lift" }],
      labels: [{ id: "l1", x: 4, y: 4, text: "Label", fontSize: 12, color: "#444", rotation: 0 }],
    });

    const copy = duplicateFloorForBuilding(source, { id: "f2", buildingId: "b2", number: 2, label: "Copy" });

    expect(copy.id).toBe("f2");
    expect(copy.buildingId).toBe("b2");
    expect(copy.number).toBe(2);
    expect(copy.label).toBe("Copy");
    expect(copy.rooms[0].id).not.toBe("r1");
    expect(copy.rooms[0].buildingId).toBe("b2");
    expect(copy.rooms[0].floorId).toBe("f2");
    expect(copy.paths[0].id).not.toBe("p1");
    expect(copy.walls[0].id).not.toBe("w1");
    expect(copy.doors[0].id).not.toBe("d1");
    expect(copy.windows[0].id).not.toBe("win1");
    expect(copy.furniture[0].id).not.toBe("fur1");
    expect(copy.stairs[0].id).not.toBe("s1");
    expect(copy.ramps[0].id).not.toBe("ra1");
    expect(copy.elevators[0].id).not.toBe("e1");
    expect(copy.labels[0].id).not.toBe("l1");
  });

  it("does not copy Building-owned Exterior Emergency Stair occurrences when duplicating one Floor", () => {
    const source = normalizeFloor({
      id: "f-source", buildingId: "b1", number: 1,
      stairs: [
        { id: "normal-left", x: 10, y: 20, width: 20, height: 30, direction: "up", label: "Left Stair", sharedId: "left-shaft" },
        { id: "normal-right", x: 50, y: 20, width: 20, height: 30, direction: "down", label: "Right Stair", sharedId: "right-shaft" },
        { id: "generated-exterior", x: 90, y: 20, width: 20, height: 30, direction: "both", label: "Emergency", sharedId: "exterior-shaft", exteriorEmergencyStairId: "building-exterior" },
      ],
    });

    const copy = duplicateFloorForBuilding(source, { id: "f-copy", buildingId: "b1", number: 2 });

    expect(copy.stairs.map((stair) => stair.label)).toEqual(["Left Stair", "Right Stair"]);
    expect(copy.stairs.map((stair) => stair.id)).not.toContain("normal-left");
    expect(copy.stairs.map((stair) => stair.id)).not.toContain("normal-right");
    expect(copy.stairs.some((stair) => stair.exteriorEmergencyStairId)).toBe(false);
  });

  it("preserves a Room authored in a Floor Extension through repeated normalization", () => {
    const source = normalizeFloor({
      id: "f-extension",
      buildingId: "b-extension",
      canvasW: 220,
      canvasH: 160,
      extensions: [{ id: "right", side: "right", offset: 30, width: 100, depth: 100 }],
      rooms: [{ id: "r-extension", name: "Extension Room", type: "classroom", x: 245, y: 50, w: 50, h: 40 }],
    });

    const afterReload = normalizeFloor(structuredClone(source));
    expect(afterReload.rooms[0]).toMatchObject({ x: 245, y: 50, w: 50, h: 40 });
    expect(afterReload.extensions).toEqual(source.extensions);
  });

  it("remaps copied Room access links to the copied Door", () => {
    const source = normalizeFloor({
      id: "f1", buildingId: "b1", number: 1,
      rooms: [{ id: "r1", name: "Lab", type: "laboratory", x: 0, y: 0, w: 100, h: 80, buildingId: "b1", floorId: "f1", accessDoorId: "d1", accessDoorIds: ["d1"] }],
      walls: [{ id: "w1", x1: 0, y1: 0, x2: 100, y2: 0, thickness: 4, color: "#64748b" }],
      doors: [{ id: "d1", x: 50, y: 0, width: 16, direction: "left", color: "#8b5e34", wallId: "w1" }],
    });
    const copy = duplicateFloorForBuilding(source, { id: "f2", buildingId: "b2", number: 1 });

    expect(copy.rooms[0].accessDoorId).toBe(copy.doors[0].id);
    expect(copy.rooms[0].accessDoorIds).toEqual([copy.doors[0].id]);
    expect(copy.rooms[0].accessDoorId).not.toBe(source.doors[0].id);
  });

  it("produces undo entries with every editable floor collection initialized", () => {
    const entry = floorUndoEntryFromFloor({ id: "f1", buildingId: "b1", number: 1, label: "Ground Floor" });

    expect(entry).toEqual({
      rooms: [],
      canvasW: 600,
      canvasH: 450,
      backgroundColor: "#e8e1d7",
      appearance: { material: "neutral", texture: "subtle", color: "#e8e1d7" },
      showGrid: true,
      gridSize: 20,
      extensions: [],
      backgroundImage: undefined,
      calibration: undefined,
      label: "Ground Floor",
      paths: [],
      walls: [],
      doors: [],
      windows: [],
      furniture: [],
      stairs: [],
      ramps: [],
      elevators: [],
      labels: [],
      exteriorZones: [],
      entranceSteps: [],
      entranceRamps: [],
    });
  });

  it("migrates legacy synthetic managed perimeter wall ids to UUIDs and remaps openings", () => {
    const floor = normalizeFloor({
      id: "51f6bdeb-3188-49c7-b286-7901c81e73d5",
      buildingId: "b1",
      number: 1,
      walls: [
        { id: "managed-perimeter-51f6bdeb-3188-49c7-b286-7901c81e73d5-top", x1: 0, y1: 0, x2: 220, y2: 0, thickness: 6, color: "#64748b", managedKind: "perimeter", perimeterSide: "top" },
      ],
      doors: [{ id: "d1", x: 110, y: 0, width: 24, direction: "left", color: "#b45309", wallId: "managed-perimeter-51f6bdeb-3188-49c7-b286-7901c81e73d5-top", offset: 0.5 }],
      windows: [{ id: "w1", x: 120, y: 0, width: 32, height: 6, color: "#0284c7", wallId: "managed-perimeter-51f6bdeb-3188-49c7-b286-7901c81e73d5-top", offset: 0.55 }],
    });

    expect(floor.walls[0]).toMatchObject({ managedKind: "perimeter", perimeterSide: "top" });
    expect(floor.walls[0].id).toMatch(UUID_RE);
    expect(floor.walls[0].id).not.toContain("managed-perimeter");
    expect(floor.doors[0].wallId).toBe(floor.walls[0].id);
    expect(floor.windows[0].wallId).toBe(floor.walls[0].id);
  });

  it("preserves explicitly persisted custom floor dimensions", () => {
    const floor = normalizeFloor({ id: "f1", buildingId: "b1", number: 1, canvasW: 1200, canvasH: 800 });
    expect(floor.canvasW).toBe(1200);
    expect(floor.canvasH).toBe(800);
  });

  it("normalizes dormant background/calibration metadata safely", () => {
    const floor = normalizeFloor({
      id: "f1",
      buildingId: "b1",
      number: 1,
      backgroundImage: {
        storagePath: "campus/building/floor/plan.png",
        fileName: "plan.png",
        mimeType: "image/png",
        size: 100,
        visible: true,
        opacity: 0.5,
        locked: true,
        x: 1,
        y: 2,
        width: 300,
        height: 200,
        rotation: 0,
      },
      calibration: {
        metersPerUnit: 0.05,
        editorDistance: 200,
        realDistanceM: 10,
        points: [{ x: 0, y: 0 }, { x: 200, y: 0 }],
      },
    });

    expect(floor.backgroundImage).toMatchObject({ storagePath: "campus/building/floor/plan.png", opacity: 0.5 });
    expect(floor.calibration?.metersPerUnit).toBe(0.05);
  });

  it("preserves explicit exterior-zone parent relationships", () => {
    const floor = normalizeFloor({
      id: "f1", buildingId: "b1", number: 1,
      exteriorZones: [{ id: "zone-1", type: "veranda", side: "bottom", offset: 0.5, width: 180, depth: 72 }],
      entranceSteps: [{ id: "steps-1", x: 0, y: 0, width: 80, height: 32, label: "Steps", parentZoneId: "zone-1", attachmentOffset: 0.7 }],
    });
    expect(floor.entranceSteps?.[0]).toMatchObject({ parentZoneId: "zone-1", attachmentEdge: "outer", attachmentOffset: 0.7, accessible: false });
  });

  it("preserves optional exposed-edge attachment metadata", () => {
    const floor = normalizeFloor({
      id: "f2", buildingId: "b1", number: 1,
      exteriorZones: [{ id: "zone-2", type: "veranda", side: "bottom", offset: 0.5, width: 180, depth: 72 }],
      entranceRamps: [{ id: "ramp-1", x: 0, y: 0, width: 56, height: 28, label: "Ramp", parentZoneId: "zone-2", attachmentEdge: "start", attachmentOffset: 0.5 }],
    });
    expect(floor.entranceRamps?.[0]).toMatchObject({ parentZoneId: "zone-2", attachmentEdge: "start", attachmentOffset: 0.5, accessible: true });
  });
});
