import { describe, expect, it } from "vitest";
import {
  constrainDeltaForBounds,
  DEFAULT_FLOOR_CANVAS,
  applyRoomAnchorsToWalls,
  clearWallRoomAnchors,
  itemBounds,
  lockedWallsAffectedByRoomAnchors,
  normalizeFloorCanvasSize,
  normalizeWallRoomAnchors,
  floorResizeIssues,
  resolveRoomAnchorPoint,
  resolveWallOpeningGeometry,
  resizeFurnitureWithinFloor,
  resizeRoomWithinFloor,
  roomAnchorAtPoint,
  selectionIdsInRect,
  summarizeFloorResizeIssues,
  snapPointToFloorBounds,
  syncOpeningsToWalls,
  translateFloorItem,
  validateFloorGeometry,
  wallLengthLabelPosition,
} from "../floorGeometry";
import { duplicateFloorForBuilding, normalizeFloor } from "../floorPlanNormalization";
import type { FloorFurniture, FloorRoom, FloorWall } from "../../components/map-builder/types";

describe("floorGeometry", () => {
  it("normalizes floor canvas size through the canonical defaults", () => {
    expect(normalizeFloorCanvasSize(undefined, undefined)).toEqual(DEFAULT_FLOOR_CANVAS);
    expect(normalizeFloorCanvasSize(900.4, 700.6)).toEqual({ w: 900, h: 701 });
    expect(normalizeFloorCanvasSize(20, 30)).toEqual(DEFAULT_FLOOR_CANVAS);
  });

  it("constrains group movement so the whole selection remains inside the floor", () => {
    const delta = constrainDeltaForBounds([
      { x: 10, y: 10, w: 50, h: 30 },
      { x: 120, y: 80, w: 40, h: 20 },
    ], -30, 100, 180, 120);

    expect(delta).toEqual({ dx: -10, dy: 20 });
  });

  it("translates walls by endpoints without letting either endpoint escape", () => {
    const wall: FloorWall = { id: "w1", x1: 10, y1: 10, x2: 50, y2: 10, thickness: 4, color: "#64748b" };
    const moved = translateFloorItem("wall", wall, -50, 0, 100, 100);

    expect(moved.x1).toBe(0);
    expect(moved.x2).toBe(40);
    expect(moved.x).toBeUndefined();
  });

  it("resizes rooms within the floor canvas at each edge", () => {
    const room: FloorRoom = { id: "r1", name: "Room", type: "classroom", x: 20, y: 20, w: 50, h: 40, floorId: "f1", buildingId: "b1" };

    expect(resizeRoomWithinFloor(room, "nw", -50, -50, 100, 100)).toMatchObject({ x: 0, y: 0, w: 70, h: 60 });
    expect(resizeRoomWithinFloor(room, "se", 80, 80, 100, 100)).toMatchObject({ x: 20, y: 20, w: 80, h: 80 });
  });

  it("marquee-selects supported indoor objects by intersection", () => {
    const floor = normalizeFloor({
      id: "f1",
      buildingId: "b1",
      number: 1,
      label: "Ground Floor",
      rooms: [{ id: "r1", name: "Room", type: "classroom", x: 20, y: 20, w: 50, h: 40, floorId: "f1", buildingId: "b1" }],
      furniture: [{ id: "fur1", type: "desk", name: "Desk", category: "tables", x: 100, y: 100, width: 20, height: 10, rotation: 0, color: "#333" }],
    });

    expect(selectionIdsInRect(floor, { x: 0, y: 0, w: 80, h: 80 })).toEqual(["r1"]);
    expect(selectionIdsInRect(floor, { x: 0, y: 0, w: 140, h: 140 })).toEqual(["r1", "fur1"]);
  });

  it("reports blocking issues when existing objects fall outside a smaller canvas", () => {
    const floor = normalizeFloor({
      id: "f1",
      buildingId: "b1",
      number: 1,
      label: "Ground Floor",
      canvasW: 120,
      canvasH: 100,
      rooms: [{ id: "r1", name: "Room", type: "classroom", x: 100, y: 20, w: 40, h: 30, floorId: "f1", buildingId: "b1" }],
    });

    expect(validateFloorGeometry(floor)).toHaveLength(1);
  });

  it("marquee selection includes walls, doors, windows and circulation but never floor paths", () => {
    const floor = normalizeFloor({
      id: "f1",
      buildingId: "b1",
      number: 1,
      label: "Ground Floor",
      walls: [{ id: "w1", x1: 80, y1: 70, x2: 130, y2: 70, thickness: 4, color: "#64748b" }],
      doors: [{ id: "d1", x: 60, y: 90, width: 8, direction: "left", color: "#d97706" }],
      windows: [{ id: "wn1", x: 30, y: 120, width: 12, height: 4, color: "#7dd3fc" }],
      stairs: [{ id: "st1", x: 140, y: 90, width: 20, height: 16, direction: "both", label: "Stairs" }],
      ramps: [{ id: "rm1", x: 150, y: 120, width: 20, height: 12, label: "Ramp" }],
      elevators: [{ id: "el1", x: 180, y: 60, width: 14, height: 14, doorWidth: 6, label: "Elevator" }],
      labels: [{ id: "lb1", x: 40, y: 150, text: "Lobby", fontSize: 12, color: "#374151", rotation: 0 }],
      paths: [{ id: "p1", points: [{ x: 100, y: 150 }, { x: 150, y: 150 }], type: "footpath", color: "#94a3b8", width: 3 }],
    });

    const ids = selectionIdsInRect(floor, { x: 0, y: 0, w: 220, h: 160 });
    expect(ids.sort()).toEqual(["d1", "el1", "lb1", "rm1", "st1", "w1", "wn1"].sort());
    expect(ids).not.toContain("p1");
  });

  it("snaps points to the canonical floor boundary within tolerance", () => {
    expect(snapPointToFloorBounds({ x: 3, y: 50 }, 580, 380)).toEqual({ x: 0, y: 50 });
    expect(snapPointToFloorBounds({ x: 577, y: 3 }, 580, 380)).toEqual({ x: 580, y: 0 });
    expect(snapPointToFloorBounds({ x: 40, y: 378 }, 580, 380)).toEqual({ x: 40, y: 380 });
    expect(snapPointToFloorBounds({ x: 40, y: 50 }, 580, 380)).toEqual({ x: 40, y: 50 });
    expect(snapPointToFloorBounds({ x: -20, y: 40 }, 580, 380)).toEqual({ x: 0, y: 40 });
  });

  it("computes item bounds for every supported floor object type", () => {
    expect(itemBounds("room", { x: 10, y: 10, w: 20, h: 30 })).toEqual({ x: 10, y: 10, w: 20, h: 30 });
    expect(itemBounds("wall", { x1: 20, y1: 40, x2: 60, y2: 20 })).toEqual({ x: 20, y: 20, w: 40, h: 20 });
    expect(itemBounds("door", { x: 50, y: 50, width: 8 })).toEqual({ x: 46, y: 46, w: 8, h: 8 });
    expect(itemBounds("furniture", { x: 5, y: 6, width: 12, height: 10 })).toEqual({ x: 5, y: 6, w: 12, h: 10 });
    const labelBounds = itemBounds("label", { x: 10, y: 40, text: "AB", fontSize: 12 })!;
    expect(labelBounds.x).toBe(10);
    expect(labelBounds.y).toBe(28);
    expect(labelBounds.w).toBeCloseTo(14.4);
    expect(labelBounds.h).toBe(16);
    expect(itemBounds("path", { id: "p1" })).toBeNull();
  });

  it("clamps furniture resize to per-type ceilings and floor bounds with no negative dimensions", () => {
    const chair: FloorFurniture = { id: "c1", type: "chair", name: "Chair", category: "seating", x: 10, y: 10, width: 12, height: 12, rotation: 0, color: "#4b5563" };
    const sofa: FloorFurniture = { id: "s1", type: "sofa", name: "Sofa", category: "seating", x: 10, y: 10, width: 20, height: 10, rotation: 0, color: "#3f3f46" };
    const desk: FloorFurniture = { id: "d1", type: "desk", name: "Desk", category: "tables", x: 10, y: 10, width: 20, height: 12, rotation: 0, color: "#7a5c3a" };

    // Chairs are capped small so a drag can never fill the whole floor
    expect(resizeFurnitureWithinFloor(chair, "se", 500, 500, 100, 100)).toMatchObject({ x: 10, y: 10, width: 32, height: 32 });
    expect(resizeFurnitureWithinFloor(sofa, "se", 500, 500, 100, 100)).toMatchObject({ width: 86, height: 44 });
    expect(resizeFurnitureWithinFloor(desk, "se", 500, 500, 100, 100)).toMatchObject({ width: 74, height: 48 });

    // Minimum size of 8 — never negative, never vanishing
    expect(resizeFurnitureWithinFloor(chair, "se", -100, -100, 100, 100)).toMatchObject({ width: 8, height: 8 });

    // Shrinking from the west/north keeps the object inside the floor
    const edge = resizeFurnitureWithinFloor({ ...desk, x: 90, y: 90 }, "nw", -200, -200, 100, 100);
    expect(edge.x).toBeGreaterThanOrEqual(0);
    expect(edge.y).toBeGreaterThanOrEqual(0);
    expect(edge.width).toBeGreaterThanOrEqual(8);
    expect(edge.height).toBeGreaterThanOrEqual(8);
    expect(edge.x + edge.width).toBeLessThanOrEqual(100);
    expect(edge.y + edge.height).toBeLessThanOrEqual(100);
  });

  it("anchors wall endpoints to room edges and propagates room-only transforms", () => {
    const room: FloorRoom = { id: "room-a", name: "Room", type: "classroom", x: 20, y: 20, w: 80, h: 40, floorId: "f1", buildingId: "b1" };
    const anchor = roomAnchorAtPoint(room, { x: 60, y: 20 }, 8)?.anchor;
    expect(anchor).toEqual({ targetType: "room", roomId: "room-a", edge: "top", offset: 0.5 });
    expect(resolveRoomAnchorPoint(room, anchor)).toEqual({ x: 60, y: 20 });

    const wall: FloorWall = {
      id: "wall-a",
      x1: 60,
      y1: 20,
      x2: 60,
      y2: 90,
      thickness: 4,
      color: "#64748b",
      startAnchor: anchor,
    };
    const movedRoom = { ...room, x: 40, y: 50 };
    const [movedWall] = applyRoomAnchorsToWalls([movedRoom], [wall], new Set(["room-a"]));

    expect(movedWall.x1).toBe(80);
    expect(movedWall.y1).toBe(50);
    expect(movedWall.x2).toBe(60);
    expect(movedWall.y2).toBe(90);
  });

  it("clears deleted room anchors without deleting walls", () => {
    const wall: FloorWall = {
      id: "wall-a",
      x1: 20,
      y1: 20,
      x2: 80,
      y2: 20,
      thickness: 4,
      color: "#64748b",
      startAnchor: { targetType: "room", roomId: "room-a", edge: "top", offset: 0 },
      endAnchor: { targetType: "room", roomId: "room-b", edge: "top", offset: 1 },
    };

    const next = clearWallRoomAnchors(wall, new Set(["room-a"]));
    expect(next.id).toBe("wall-a");
    expect(next.startAnchor).toBeUndefined();
    expect(next.endAnchor).toEqual(wall.endAnchor);
  });

  it("detects locked attached walls before a room transform changes them", () => {
    const room: FloorRoom = { id: "room-a", name: "Room", type: "classroom", x: 20, y: 20, w: 80, h: 40, floorId: "f1", buildingId: "b1" };
    const wall: FloorWall = {
      id: "wall-a",
      x1: 20,
      y1: 20,
      x2: 100,
      y2: 20,
      thickness: 4,
      color: "#64748b",
      locked: true,
      startAnchor: { targetType: "room", roomId: "room-a", edge: "top", offset: 0 },
      endAnchor: { targetType: "room", roomId: "room-a", edge: "top", offset: 1 },
    };

    expect(lockedWallsAffectedByRoomAnchors([{ ...room, x: 30 }], [wall], new Set(["room-a"]))).toBe(true);
    expect(lockedWallsAffectedByRoomAnchors([{ ...room, x: 30 }], [wall], new Set(["room-a"]), new Set(["wall-a"]))).toBe(false);
  });

  it("normalizes both wall endpoints onto the same room edge after a one-end room snap", () => {
    const room: FloorRoom = { id: "room-a", name: "Room", type: "classroom", x: 20, y: 20, w: 80, h: 40, floorId: "f1", buildingId: "b1" };
    const wall = normalizeWallRoomAnchors({
      id: "wall-a",
      x1: 20,
      y1: 20,
      x2: 100,
      y2: 20,
      thickness: 4,
      color: "#64748b",
      startAnchor: { targetType: "room", roomId: "room-a", edge: "top", offset: 0 },
    }, [room]);

    expect(wall.startAnchor).toEqual({ targetType: "room", roomId: "room-a", edge: "top", offset: 0 });
    expect(wall.endAnchor).toEqual({ targetType: "room", roomId: "room-a", edge: "top", offset: 1 });
  });

  it("syncs wall-attached doors and windows by normalized wall offset", () => {
    const wall: FloorWall = { id: "wall-a", x1: 20, y1: 40, x2: 120, y2: 40, thickness: 4, color: "#64748b" };
    const { doors, windows } = syncOpeningsToWalls(
      [{ id: "door-a", x: 0, y: 0, width: 20, wallId: "wall-a", offset: 0.25, direction: "left", color: "#d97706" }],
      [{ id: "window-a", x: 0, y: 0, width: 200, height: 4, wallId: "wall-a", offset: 0.5, color: "#7dd3fc" }],
      [wall]
    );

    expect(doors[0]).toMatchObject({ x: 45, y: 40, offset: 0.25, width: 20 });
    expect(windows[0].x).toBe(70);
    expect(windows[0].width).toBe(68);
    expect(resolveWallOpeningGeometry(doors[0], wall)?.angle).toBe(0);
  });

  it("does not treat a managed perimeter Door swing as outside the floor canvas", () => {
    const floor = normalizeFloor({
      id: "f1",
      buildingId: "b1",
      number: 1,
      label: "Ground Floor",
      canvasW: 220,
      canvasH: 160,
      walls: [{ id: "perim-top", x1: 0, y1: 0, x2: 220, y2: 0, thickness: 6, color: "#334155", locked: true, managedKind: "perimeter", perimeterSide: "top" }],
      doors: [{ id: "door-a", x: 110, y: 0, width: 36, doorType: "double", wallId: "perim-top", offset: 0.5, direction: "double", swingSide: "a", color: "#d97706" }],
    });

    expect(validateFloorGeometry(floor)).toEqual([]);
  });

  it("keeps unattached out-of-bounds Doors invalid", () => {
    const floor = normalizeFloor({
      id: "f1",
      buildingId: "b1",
      number: 1,
      label: "Ground Floor",
      canvasW: 220,
      canvasH: 160,
      doors: [{ id: "door-a", x: -30, y: 20, width: 18, doorType: "single", direction: "left", color: "#d97706" }],
    });

    expect(validateFloorGeometry(floor)).toEqual([
      expect.objectContaining({ id: "door-door-a-bounds", message: "Door is outside the floor canvas." }),
    ]);
  });

  it("summarizes floor shrink blockers by authored object category", () => {
    const floor = normalizeFloor({
      id: "f1",
      buildingId: "b1",
      number: 1,
      label: "Ground Floor",
      canvasW: 160,
      canvasH: 100,
      walls: [{ id: "wall-a", x1: 0, y1: 20, x2: 140, y2: 20, thickness: 4, color: "#64748b" }],
      doors: [{ id: "door-a", x: 140, y: 20, width: 8, wallId: "wall-a", offset: 1, direction: "left", color: "#d97706" }],
      rooms: [{ id: "room-a", name: "Room", type: "classroom", x: 118, y: 50, w: 35, h: 30, floorId: "f1", buildingId: "b1" }],
    });
    const issues = floorResizeIssues(floor, 140, 100);

    expect(issues).toHaveLength(1);
    expect(summarizeFloorResizeIssues(issues)).toContain("1 rooms");
  });

  it("remaps attached opening wall ids when duplicating a whole floor", () => {
    const floor = normalizeFloor({
      id: "f1",
      buildingId: "b1",
      number: 1,
      label: "Ground Floor",
      walls: [{ id: "wall-a", x1: 20, y1: 40, x2: 120, y2: 40, thickness: 4, color: "#64748b" }],
      doors: [{ id: "door-a", x: 70, y: 40, width: 8, wallId: "wall-a", offset: 0.5, direction: "left", color: "#d97706" }],
      windows: [{ id: "window-a", x: 90, y: 40, width: 12, height: 4, wallId: "wall-a", offset: 0.7, color: "#7dd3fc" }],
    });
    const copy = duplicateFloorForBuilding(floor, { buildingId: "b2", number: 2 });

    expect(copy.walls[0].id).not.toBe("wall-a");
    expect(copy.doors[0].wallId).toBe(copy.walls[0].id);
    expect(copy.windows[0].wallId).toBe(copy.walls[0].id);
  });

  it("positions wall length labels along the wall normal and keeps the text upright", () => {
    const vertical = wallLengthLabelPosition({ id: "w1", x1: 50, y1: 20, x2: 50, y2: 80, thickness: 4, color: "#64748b" });
    expect(vertical.x).toBeLessThan(50);
    expect(vertical.y).toBe(50);
    expect(vertical.angle).toBe(90);

    const reversed = wallLengthLabelPosition({ id: "w2", x1: 100, y1: 40, x2: 20, y2: 40, thickness: 4, color: "#64748b" });
    expect(reversed.angle).toBe(0);
  });
});
