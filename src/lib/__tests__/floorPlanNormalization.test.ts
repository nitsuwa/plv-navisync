import { describe, expect, it } from "vitest";
import {
  createDefaultFloor,
  defaultFloorLabel,
  duplicateFloorForBuilding,
  floorUndoEntryFromFloor,
  normalizeFloor,
  normalizeFloors,
} from "../floorPlanNormalization";
import type { FloorPlan } from "../../components/map-builder/types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("floorPlanNormalization", () => {
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

  it("produces undo entries with every editable floor collection initialized", () => {
    const entry = floorUndoEntryFromFloor({ id: "f1", buildingId: "b1", number: 1, label: "Ground Floor" });

    expect(entry).toEqual({
      rooms: [],
      canvasW: 600,
      canvasH: 450,
      backgroundColor: "#e8e1d7",
      showGrid: true,
      gridSize: 20,
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
});
