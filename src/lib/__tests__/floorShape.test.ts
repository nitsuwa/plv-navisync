import { describe, expect, it } from "vitest";
import { createDefaultFloor, duplicateFloorForBuilding, normalizeFloor } from "../floorPlanNormalization";
import { floorShapeBoundaryPath, floorShapeContainsPoint, floorShapeContainsPolygon, floorShapeContainsRect, floorShapeContainsSegment, getFloorShapeBoundarySegments, getFloorShapeRegions, createFloorPerimeterWalls, getFloorShapeOutlineLoops, snapPointToFloorShapeBoundary } from "../floorShape";
import { collectFloorShapeFitIssues, constrainFloorItemsDelta, floorItemFitsFloorShape, reprojectManagedPerimeterOpenings, resizeCirculationWithinFloor, resizeFurnitureWithinFloor, validateFloorGeometry } from "../floorGeometry";

describe("rectangular Floor extensions", () => {
  it("treats the base and attached extension as one usable Floor area", () => {
    const regions = getFloorShapeRegions({
      canvasW: 600,
      canvasH: 450,
      extensions: [{ id: "ext-bottom", side: "bottom", offset: 180, width: 240, depth: 120 }],
    });
    expect(floorShapeContainsPoint(regions, 300, 500)).toBe(true);
    expect(floorShapeContainsPoint(regions, 120, 500)).toBe(false);
    expect(floorShapeContainsRect(regions, { x: 220, y: 470, width: 120, height: 50 })).toBe(true);
    expect(floorShapeContainsRect(regions, { x: 170, y: 470, width: 60, height: 50 })).toBe(false);
  });

  it("accepts footprints crossing the base/extension seam and rejects the gray notch", () => {
    const floor = { canvasW: 600, canvasH: 450, extensions: [{ id: "right", side: "right" as const, offset: 100, width: 200, depth: 120 }] };
    const regions = getFloorShapeRegions(floor);
    expect(floorShapeContainsPolygon(regions, [
      { x: 580, y: 140 }, { x: 640, y: 140 }, { x: 640, y: 180 }, { x: 580, y: 180 },
    ])).toBe(true);
    expect(floorShapeContainsPolygon(regions, [
      { x: 580, y: 20 }, { x: 640, y: 20 }, { x: 640, y: 60 }, { x: 580, y: 60 },
    ])).toBe(false);
    expect(floorShapeContainsSegment(regions, { x: 560, y: 200 }, { x: 680, y: 200 })).toBe(true);
  });

  it("lets circulation items move completely into an Extension without stopping at the base edge", () => {
    const regions = getFloorShapeRegions({
      canvasW: 600,
      canvasH: 450,
      extensions: [{ id: "right", side: "right", offset: 100, width: 200, depth: 120 }],
    });
    const elevator = { id: "elevator", x: 550, y: 140, width: 40, height: 40, rotation: 0 };
    const delta = constrainFloorItemsDelta([{ type: "elevator", item: elevator }], 80, 0, regions);
    expect(delta).toEqual({ dx: 80, dy: 0 });
    expect(floorItemFitsFloorShape("elevator", { ...elevator, x: elevator.x + delta.dx }, regions)).toBe(true);
  });

  it("keeps a rotated footprint valid by its actual polygon rather than rejecting its AABB", () => {
    const regions = getFloorShapeRegions({
      canvasW: 600,
      canvasH: 450,
      extensions: [{ id: "right", side: "right", offset: 100, width: 200, depth: 120 }],
    });
    const rotatedStair = { id: "stair", x: 585, y: 150, width: 55, height: 28, rotation: 45 };
    expect(floorItemFitsFloorShape("stairs", rotatedStair, regions)).toBe(true);
  });

  it("allows Rooms and Furniture to cross the base/extension seam but rejects the outside notch", () => {
    const regions = getFloorShapeRegions({
      canvasW: 600,
      canvasH: 450,
      extensions: [{ id: "right", side: "right", offset: 100, width: 200, depth: 120 }],
    });
    const spanningRoom = { id: "room", x: 570, y: 140, w: 80, h: 50 };
    const roomInNotch = { ...spanningRoom, x: 570, y: 20 };
    const furniture = { id: "desk", type: "desk", name: "Desk", x: 580, y: 150, width: 50, height: 35, rotation: 0 };
    expect(floorItemFitsFloorShape("room", spanningRoom, regions)).toBe(true);
    expect(floorItemFitsFloorShape("room", roomInNotch, regions)).toBe(false);
    expect(floorItemFitsFloorShape("furniture", furniture, regions)).toBe(true);
  });

  it("resizes Furniture and circulation objects across the old base edge when the combined footprint fits", () => {
    const regions = getFloorShapeRegions({
      canvasW: 600,
      canvasH: 450,
      extensions: [{ id: "right", side: "right", offset: 100, width: 200, depth: 120 }],
    });
    const desk = { id: "desk", type: "desk", name: "Desk", x: 550, y: 150, width: 40, height: 30, rotation: 0 };
    const elevator = { id: "elevator", x: 550, y: 140, width: 40, height: 40, rotation: 0 };
    const resizedDesk = resizeFurnitureWithinFloor(desk, "e", 45, 0, 600, 450, false, regions);
    const resizedElevator = resizeCirculationWithinFloor(elevator, "e", 45, 0, 600, 450, false, regions, "elevator");
    expect(resizedDesk.width).toBe(85);
    expect(floorItemFitsFloorShape("furniture", resizedDesk, regions)).toBe(true);
    expect(resizedElevator.width).toBe(85);
    expect(floorItemFitsFloorShape("elevator", resizedElevator, regions)).toBe(true);
  });

  it("cancels the shared edge and emits only the external perimeter", () => {
    const regions = getFloorShapeRegions({
      canvasW: 600,
      canvasH: 450,
      extensions: [{ id: "ext-bottom", side: "bottom", offset: 180, width: 240, depth: 120 }],
    });
    const boundary = getFloorShapeBoundarySegments(regions);
    expect(boundary.some((segment) => Math.abs(segment.y1 - 450) < 0.001 && Math.abs(segment.y2 - 450) < 0.001
      && Math.min(segment.x1, segment.x2) < 420 && Math.max(segment.x1, segment.x2) > 180)).toBe(false);
    expect(boundary.some((segment) => segment.y1 === 570 && segment.y2 === 570)).toBe(true);
  });

  it("snaps Wall authoring to the union's outside edge, never the internal seam", () => {
    const regions = getFloorShapeRegions({
      canvasW: 600,
      canvasH: 450,
      extensions: [{ id: "ext-bottom", side: "bottom", offset: 180, width: 240, depth: 120 }],
    });
    expect(snapPointToFloorShapeBoundary(regions, { x: 320, y: 451 }, 8)).toBeNull();
    expect(snapPointToFloorShapeBoundary(regions, { x: 320, y: 568 }, 8)).toEqual({ x: 320, y: 570 });
  });

  it("keeps the attached edge internal for every supported side", () => {
    const cases = [
      { extension: { id: "top", side: "top" as const, offset: 180, width: 240, depth: 100 }, shared: { x1: 180, x2: 420, y: 0 } },
      { extension: { id: "right", side: "right" as const, offset: 100, width: 240, depth: 100 }, shared: { y1: 100, y2: 340, x: 600 } },
      { extension: { id: "left", side: "left" as const, offset: 100, width: 240, depth: 100 }, shared: { y1: 100, y2: 340, x: 0 } },
    ];
    for (const { extension, shared } of cases) {
      const regions = getFloorShapeRegions({ canvasW: 600, canvasH: 450, extensions: [extension] });
      const boundary = getFloorShapeBoundarySegments(regions);
      const hasShared = boundary.some((segment) => {
        const horizontal = "y" in shared;
        if (horizontal) return Math.abs(segment.y1 - shared.y) < 0.001 && Math.abs(segment.y2 - shared.y) < 0.001
          && Math.min(segment.x1, segment.x2) < shared.x2 && Math.max(segment.x1, segment.x2) > shared.x1;
        return Math.abs(segment.x1 - shared.x) < 0.001 && Math.abs(segment.x2 - shared.x) < 0.001
          && Math.min(segment.y1, segment.y2) < shared.y2 && Math.max(segment.y1, segment.y2) > shared.y1;
      });
      expect(hasShared).toBe(false);
    }
  });

  it("keeps overlapping additions as one union outline", () => {
    const regions = getFloorShapeRegions({
      canvasW: 600,
      canvasH: 450,
      extensions: [
        { id: "ext-a", side: "bottom", offset: 100, width: 220, depth: 100 },
        { id: "ext-b", side: "bottom", offset: 280, width: 220, depth: 160 },
      ],
    });
    expect(floorShapeContainsPoint(regions, 300, 580)).toBe(true);
    const boundary = getFloorShapeBoundarySegments(regions);
    expect(boundary.some((segment) => Math.abs(segment.y1 - 450) < 0.001 && Math.abs(segment.y2 - 450) < 0.001
      && Math.min(segment.x1, segment.x2) < 500 && Math.max(segment.x1, segment.x2) > 100)).toBe(false);
  });

  it("renders the union as one closed outline with shared corner vertices", () => {
    const regions = getFloorShapeRegions({
      canvasW: 600,
      canvasH: 450,
      extensions: [
        { id: "ext-bottom-left", side: "bottom", offset: 100, width: 150, depth: 120 },
        { id: "ext-right", side: "right", offset: 120, width: 160, depth: 90 },
        { id: "ext-top", side: "top", offset: 330, width: 180, depth: 80 },
      ],
    });
    const loops = getFloorShapeOutlineLoops(getFloorShapeBoundarySegments(regions));
    const path = floorShapeBoundaryPath(getFloorShapeBoundarySegments(regions));

    expect(loops).toHaveLength(1);
    expect(loops[0].length).toBeGreaterThanOrEqual(8);
    expect(path.match(/M /g)).toHaveLength(1);
    expect(path.endsWith(" Z")).toBe(true);
  });

  it("validates object bounds against the combined shape and persists extensions across Floor copies", () => {
    const floor = createDefaultFloor({ id: "source-floor", buildingId: "source-building", canvasW: 600, canvasH: 450 });
    const withExtension = normalizeFloor({
      ...floor,
      extensions: [{ id: "source-extension", side: "bottom", offset: 200, width: 180, depth: 140 }],
      furniture: [{ id: "desk-in-extension", type: "desk", name: "Desk", category: "tables", x: 250, y: 490, width: 60, height: 40, color: "#987654" }],
    });
    expect(validateFloorGeometry(withExtension)).toEqual([]);
    expect(validateFloorGeometry({ ...withExtension, extensions: [] }).some((issue) => issue.selection?.id === "desk-in-extension")).toBe(true);
    const duplicate = duplicateFloorForBuilding(withExtension, { id: "copied-floor", buildingId: "copied-building" });
    expect(duplicate.extensions).toEqual([{ ...withExtension.extensions![0], id: expect.not.stringMatching(/^source-extension$/) }]);
    expect(duplicate).not.toBe(withExtension);
    expect(duplicate.extensions).not.toBe(withExtension.extensions);
    expect(duplicate.extensions![0]).not.toBe(withExtension.extensions![0]);
    duplicate.extensions![0].depth = 210;
    duplicate.furniture[0].x = 275;
    expect(withExtension.extensions![0].depth).toBe(140);
    expect(withExtension.furniture[0].x).toBe(250);
    expect(normalizeFloor(duplicate).extensions).toEqual(duplicate.extensions);

    const perimeter = createFloorPerimeterWalls("floor", 600, 450, withExtension.extensions, {
      perimeterThickness: 6,
      perimeterMaterial: "concrete",
      perimeterColor: "#64748b",
    }, floor.walls);
    expect(perimeter.some((wall) => Math.abs(wall.y1 - 450) < 0.001 && Math.abs(wall.y2 - 450) < 0.001
      && Math.min(wall.x1, wall.x2) < 380 && Math.max(wall.x1, wall.x2) > 200)).toBe(false);
  });

  it("keeps perimeter Doors attached by identity as an Extension edge moves", () => {
    const oldExtensions = [{ id: "right-lobby", side: "right" as const, offset: 100, width: 200, depth: 120 }];
    const nextExtensions = [{ ...oldExtensions[0], depth: 160 }];
    const settings = { perimeterThickness: 6, perimeterMaterial: "concrete", perimeterColor: "#64748b" };
    const oldWalls = createFloorPerimeterWalls("floor", 600, 450, oldExtensions, settings);
    const nextWalls = createFloorPerimeterWalls("floor", 600, 450, nextExtensions, settings, oldWalls);
    const oldHost = oldWalls.find((wall) => wall.perimeterSide === "right" && wall.x1 === 720 && wall.x2 === 720)!;
    const door = {
      id: "main-door", x: 720, y: 200, width: 32, wallId: oldHost.id, offset: 0.5,
      direction: "left" as const, color: "#111111", label: "Main Entrance", buildingEntranceId: "entrance-main",
    };
    const projected = reprojectManagedPerimeterOpenings([door], oldWalls, nextWalls, oldExtensions, nextExtensions, 600, 450);

    expect(projected.unresolved).toEqual([]);
    expect(projected.openings[0]).toMatchObject({
      id: door.id,
      wallId: expect.stringMatching(/^managed-perimeter-floor-/),
      x: 760,
      y: 200,
      width: 32,
      buildingEntranceId: "entrance-main",
      label: "Main Entrance",
    });
  });

  it("preserves the relative Door position on a shortened extension edge and reports a removed host", () => {
    const oldExtensions = [{ id: "bottom-lobby", side: "bottom" as const, offset: 100, width: 300, depth: 100 }];
    const settings = { perimeterThickness: 6, perimeterMaterial: "concrete", perimeterColor: "#64748b" };
    const oldWalls = createFloorPerimeterWalls("floor", 600, 450, oldExtensions, settings);
    const oldHost = oldWalls.find((wall) => wall.perimeterSide === "bottom" && wall.y1 === 550 && wall.y2 === 550)!;
    const door = { id: "lobby-door", x: 250, y: 550, width: 28, wallId: oldHost.id, offset: 0.5, direction: "right" as const, color: "#111111" };
    const shortened = [{ ...oldExtensions[0], width: 160 }];
    const shortenedWalls = createFloorPerimeterWalls("floor", 600, 450, shortened, settings, oldWalls);
    const projected = reprojectManagedPerimeterOpenings([door], oldWalls, shortenedWalls, oldExtensions, shortened, 600, 450);
    expect(projected.unresolved).toEqual([]);
    expect(projected.openings[0]).toMatchObject({ id: door.id, x: 180, y: 550, width: 28 });

    const removedWalls = createFloorPerimeterWalls("floor", 600, 450, [], settings, oldWalls);
    const removed = reprojectManagedPerimeterOpenings([door], oldWalls, removedWalls, oldExtensions, [], 600, 450);
    expect(removed.openings[0].id).toBe(door.id);
    expect(removed.unresolved).toEqual([expect.objectContaining({ id: door.id, reason: expect.stringContaining("needs to be reattached") })]);
  });

  it("does not count perimeter graphics, exterior stair occurrences, or linked nav anchors as outside content", () => {
    const extensions = [{ id: "right-lobby", side: "right" as const, offset: 100, width: 200, depth: 120 }];
    const walls = createFloorPerimeterWalls("floor", 600, 450, extensions, {
      perimeterThickness: 6, perimeterMaterial: "concrete", perimeterColor: "#64748b",
    });
    const rightWall = walls.find((wall) => wall.perimeterSide === "right" && wall.x1 === 720 && wall.x2 === 720)!;
    const floor = {
      ...createDefaultFloor({ id: "floor", buildingId: "building", canvasW: 600, canvasH: 450 }),
      extensions,
      walls,
      doors: [{ id: "door", label: "Main Entrance", x: 720, y: 200, width: 32, wallId: rightWall.id, offset: 0.5, direction: "left" as const, color: "#111111" }],
      stairs: [{ id: "outside-stair", x: 710, y: 210, width: 48, height: 40, direction: "up" as const, label: "Exterior Emergency Stair" }],
    };
    const issues = collectFloorShapeFitIssues(floor, getFloorShapeRegions(floor), {
      exteriorEmergencyStairIds: new Set(["outside-stair"]),
      navNodes: [{ id: "door-node", name: "Main Entrance", type: "entrance", x: 720, y: 200, buildingId: "building", floorId: "floor", doorId: "door", accessible: true, color: "#111111" }],
    });
    expect(issues).toEqual([]);
  });

  it("still flags a real indoor object in the gray notch with a useful diagnostic", () => {
    const floor = {
      ...createDefaultFloor({ id: "floor", buildingId: "building", canvasW: 600, canvasH: 450 }),
      extensions: [{ id: "right", side: "right" as const, offset: 100, width: 200, depth: 120 }],
      elevators: [{ id: "elevator-notch", x: 620, y: 20, width: 40, height: 40, doorWidth: 28, label: "Lift A" }],
    };
    expect(collectFloorShapeFitIssues(floor, getFloorShapeRegions(floor))).toEqual([
      expect.objectContaining({
        id: "elevator-notch", type: "elevator", label: "Elevator", name: "Lift A",
        reason: "Elevator footprint is not contained by the draft Floor union.",
      }),
    ]);
  });
});
