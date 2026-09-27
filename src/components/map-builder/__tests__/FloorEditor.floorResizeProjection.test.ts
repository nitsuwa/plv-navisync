import { describe, expect, it } from "vitest";
import { floorResizeIssues } from "../../../lib/floorGeometry";
import { createFloorPerimeterWalls, getFloorShapeRegions, resizeFloorExtensions } from "../../../lib/floorShape";
import { entranceDoorWallOffset, entrancePerimeterWall } from "../../../lib/entranceTransitions";
import { buildFloorResizeCandidate, floorResizeCommitMatchesPreview, floorResizeExtensionFitIssues, projectFloorResizeScene, resizeFloorCanvasFromHandle, roomWallCenterTarget } from "../FloorEditor";
import type { ExteriorEmergencyStair, FloorPlan, FloorRoom, FloorWall, NavigationNode } from "../types";

function resizeFixture(): FloorPlan {
  return {
    id: "floor-1",
    buildingId: "building-1",
    number: 1,
    label: "Ground Floor",
    canvasW: 600,
    canvasH: 450,
    backgroundColor: "#e8e1d7",
    rooms: [],
    paths: [],
    // Deliberately omit perimeterSide to cover legacy managed-wall records.
    walls: [
      { id: "wall-top", x1: 0, y1: 0, x2: 600, y2: 0, thickness: 6, color: "#64748b", managedKind: "perimeter", locked: true },
      { id: "wall-right", x1: 600, y1: 0, x2: 600, y2: 450, thickness: 6, color: "#64748b", managedKind: "perimeter", locked: true },
      { id: "wall-bottom", x1: 600, y1: 450, x2: 0, y2: 450, thickness: 6, color: "#64748b", managedKind: "perimeter", locked: true },
      { id: "wall-left", x1: 0, y1: 450, x2: 0, y2: 0, thickness: 6, color: "#64748b", managedKind: "perimeter", locked: true },
    ],
    doors: [{ id: "door-right", x: 600, y: 225, width: 28, wallId: "wall-right", offset: 0.5, direction: "double", color: "#b45309" }],
    windows: [],
    furniture: [],
    stairs: [],
    ramps: [],
    elevators: [],
    labels: [],
    exteriorZones: [],
    entranceSteps: [],
    entranceRamps: [],
  };
}

function stairOwner(): ExteriorEmergencyStair {
  return {
    id: "exterior-stair-1",
    buildingId: "building-1",
    label: "Emergency Stair",
    state: "open",
    width: 28,
    height: 42,
    attachment: { edge: "right", offset: 0.5 },
    servedFloorIds: ["floor-1"],
    sharedId: "stair-shared-1",
  };
}

describe("FloorEditor resize projection", () => {
  it("moves each resize handle directly in its own axis without grid quantization", () => {
    const cases = [
      ["n", { width: 600, height: 420 }],
      ["s", { width: 600, height: 480 }],
      ["e", { width: 640, height: 450 }],
      ["w", { width: 560, height: 450 }],
      ["ne", { width: 640, height: 420 }],
      ["nw", { width: 560, height: 420 }],
      ["se", { width: 640, height: 480 }],
      ["sw", { width: 560, height: 480 }],
    ] as const;
    for (const [handle, expected] of cases) {
      expect(resizeFloorCanvasFromHandle({ width: 600, height: 450 }, handle, { x: 40, y: 30 })).toEqual(expected);
    }
  });

  it("keeps extension dimensions fixed and attached for projections from all eight resize handles", () => {
    const floor = {
      ...resizeFixture(),
      extensions: [{ id: "right-extension", side: "right" as const, offset: 80, width: 240, depth: 120 }],
    };
    const drags = [
      ["n", { x: 0, y: -24 }], ["s", { x: 0, y: 24 }],
      ["e", { x: 24, y: 0 }], ["w", { x: -24, y: 0 }],
      ["ne", { x: 24, y: -24 }], ["nw", { x: -24, y: -24 }],
      ["se", { x: 24, y: 24 }], ["sw", { x: -24, y: 24 }],
    ] as const;

    for (const [handle, delta] of drags) {
      const size = resizeFloorCanvasFromHandle({ width: floor.canvasW!, height: floor.canvasH! }, handle, delta);
      const { candidate } = buildFloorResizeCandidate(floor, size.width, size.height);
      const extension = candidate.extensions![0];
      const region = getFloorShapeRegions(candidate).find((item) => item.x === candidate.canvasW);
      expect(extension).toEqual({ id: "right-extension", side: "right", offset: 80, width: 240, depth: 120 });
      expect(region).toMatchObject({ x: candidate.canvasW, y: extension.offset, height: extension.width, width: extension.depth });
    }
  });

  it("keeps a linked Door on the perimeter segment nearest its global Entrance offset", () => {
    const floor = resizeFixture();
    floor.extensions = [{ id: "bottom-lobby", side: "bottom", offset: 200, width: 120, depth: 80 }];
    floor.walls = createFloorPerimeterWalls(floor.id, floor.canvasW!, floor.canvasH!, floor.extensions, {
      perimeterThickness: 6,
      perimeterMaterial: "concrete",
      perimeterColor: "#64748b",
    }, floor.walls);
    const entrance = { id: "left-bottom", buildingId: floor.buildingId, edge: "bottom" as const, offset: 0.1 };
    const wall = entrancePerimeterWall(floor, entrance);
    expect(wall).toBeDefined();
    expect(Math.min(wall!.x1, wall!.x2)).toBeLessThanOrEqual(60);
    expect(Math.max(wall!.x1, wall!.x2)).toBeGreaterThanOrEqual(60);
    expect(entranceDoorWallOffset(floor, wall!, entrance)).toBeCloseTo(0.7, 2);
  });

  it("preserves extension dimensions and absolute offset while the base changes size", () => {
    const extensions = [
      { id: "top", side: "top" as const, offset: 100, width: 200, depth: 50 },
      { id: "bottom", side: "bottom" as const, offset: 100, width: 200, depth: 50 },
      { id: "left", side: "left" as const, offset: 100, width: 200, depth: 50 },
      { id: "right", side: "right" as const, offset: 100, width: 200, depth: 50 },
    ];

    expect(resizeFloorExtensions(extensions, 600, 450, 900, 360)).toEqual([
      { id: "top", side: "top", offset: 100, width: 200, depth: 50 },
      { id: "bottom", side: "bottom", offset: 100, width: 200, depth: 50 },
      { id: "left", side: "left", offset: 100, width: 200, depth: 50 },
      { id: "right", side: "right", offset: 100, width: 200, depth: 50 },
    ]);
    expect(resizeFloorExtensions(extensions, 600, 450, 100, 360)[0]).toMatchObject({ width: 200, depth: 50, offset: 0 });
  });

  it("projects attached Extensions and validates content against the resized union shape", () => {
    const floor: FloorPlan = {
      ...resizeFixture(),
      extensions: [{ id: "right-lobby", side: "right", offset: 80, width: 240, depth: 300 }],
      furniture: [{ id: "lobby-desk", type: "desk", name: "Lobby desk", category: "tables", x: 660, y: 100, width: 40, height: 40, color: "#987654" }],
    };
    const projected = projectFloorResizeScene(floor, 540, 450);
    const resizedFloor = { ...floor, ...projected };

    expect(projected.extensions).toEqual([{ id: "right-lobby", side: "right", offset: 80, width: 240, depth: 300 }]);
    expect(getFloorShapeRegions(resizedFloor)).toContainEqual({ x: 540, y: 80, width: 300, height: 240 });
    expect(floorResizeIssues(resizedFloor, 540, 450)).toEqual([]);
    expect(projected.walls.filter((wall) => wall.managedKind === "perimeter")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ x1: 540, x2: 840, y1: 80, y2: 80 }),
      ]),
    );
    expect(projected.walls.some((wall) => wall.managedKind === "perimeter"
      && wall.x1 === 540 && wall.x2 === 540
      && Math.min(wall.y1, wall.y2) < 320 && Math.max(wall.y1, wall.y2) > 80)).toBe(false);

    const tooSmall = projectFloorResizeScene(floor, 390, 450);
    expect(floorResizeIssues({ ...floor, ...tooSmall }, 390, 450).some((issue) => issue.selection?.id === "lobby-desk")).toBe(true);
  });

  it("keeps an Extension-hosted perimeter Door attached without moving it relative to the Extension", () => {
    const extensions = [{ id: "right-lobby", side: "right" as const, offset: 40, width: 80, depth: 40 }];
    const floor: FloorPlan = { ...resizeFixture(), canvasW: 220, canvasH: 160, extensions };
    floor.walls = createFloorPerimeterWalls(floor.id, floor.canvasW!, floor.canvasH!, extensions, {
      perimeterThickness: 6,
      perimeterMaterial: "concrete",
      perimeterColor: "#64748b",
    }, floor.walls);
    const host = floor.walls.find((wall) => wall.x1 === 260 && wall.x2 === 260 && Math.min(wall.y1, wall.y2) === 40)!;
    floor.doors = [{ id: "extension-door", x: 260, y: 80, width: 24, wallId: host.id, offset: 0.5, direction: "left", color: "#b45309" }];

    const projected = projectFloorResizeScene(floor, 260, 200);
    const resized = { ...floor, ...projected };
    const projectedHost = resized.walls.find((wall) => wall.id === host.id)!;

    expect(projected.extensions).toEqual(extensions);
    expect(projectedHost).toMatchObject({ x1: 300, x2: 300, y1: 40, y2: 120 });
    expect(projected.doors[0]).toMatchObject({ id: "extension-door", wallId: host.id, x: 300, y: 80, offset: 0.5 });
    expect(floorResizeIssues(resized, 260, 200)).toEqual([]);
  });

  it("builds one complete custom-Floor candidate from the resize projection", () => {
    const floor: FloorPlan = {
      ...resizeFixture(),
      extensions: [{ id: "right-extension", side: "right", offset: 80, width: 240, depth: 300 }],
    };
    const { candidate, projection } = buildFloorResizeCandidate(floor, 400, 700);

    expect(candidate).toMatchObject({
      canvasW: 400,
      canvasH: 700,
      extensions: [{ id: "right-extension", side: "right", offset: 80, width: 240, depth: 300 }],
      walls: projection.walls,
      doors: projection.doors,
      windows: projection.windows,
      furniture: projection.furniture,
      stairs: projection.stairs,
      exteriorZones: projection.exteriorZones,
      entranceSteps: projection.entranceSteps,
      entranceRamps: projection.entranceRamps,
    });
    expect(floorResizeIssues(candidate, candidate.canvasW!, candidate.canvasH!)).toEqual([]);
  });

  it("preserves an oversized extension and reports a blocking fit issue instead of shrinking it", () => {
    const floor: FloorPlan = {
      ...resizeFixture(),
      extensions: [{ id: "right-extension", side: "right", offset: 80, width: 240, depth: 120 }],
    };
    const { candidate } = buildFloorResizeCandidate(floor, 600, 200);

    expect(candidate.extensions).toEqual([{ id: "right-extension", side: "right", offset: 0, width: 240, depth: 120 }]);
    expect(floorResizeExtensionFitIssues(candidate)).toEqual([expect.objectContaining({
      id: "floor-extension-too-large:right-extension",
      message: "Floor is too small for the existing Extension. Adjust the Extension in Edit Floor Shape first.",
    })]);
  });

  it("verifies normalized resize geometry without depending on array order or unrelated metadata", () => {
    const floor = {
      ...resizeFixture(),
      extensions: [{ id: "right-extension", side: "right" as const, offset: 80, width: 240, depth: 300 }],
    };
    const candidate = { ...floor, ...projectFloorResizeScene(floor, 500, 420) };
    const committed = {
      ...candidate,
      walls: [...candidate.walls].reverse().map((wall, index) => ({
        ...wall,
        x1: wall.x1 + (index === 0 ? 0.00001 : 0),
        material: "normalized-default",
      })),
    };

    expect(floorResizeCommitMatchesPreview(candidate, committed)).toBe(true);
    expect(floorResizeCommitMatchesPreview(candidate, { ...committed, canvasW: 499 })).toBe(false);
    expect(floorResizeCommitMatchesPreview(candidate, {
      ...committed,
      extensions: [{ ...committed.extensions![0], depth: committed.extensions![0].depth + 1 }],
    })).toBe(false);
  });

  it("extends every legacy managed perimeter wall to a 600x520 proposal", () => {
    const projected = projectFloorResizeScene(resizeFixture(), 600, 520);
    const byId = new Map(projected.walls.map((wall) => [wall.id, wall]));

    expect(byId.get("wall-top")).toMatchObject({ x1: 0, y1: 0, x2: 600, y2: 0 });
    expect(byId.get("wall-right")).toMatchObject({ x1: 600, y1: 0, x2: 600, y2: 520 });
    expect(byId.get("wall-bottom")).toMatchObject({ x1: 600, y1: 520, x2: 0, y2: 520 });
    expect(byId.get("wall-left")).toMatchObject({ x1: 0, y1: 520, x2: 0, y2: 0 });
    expect(projected.doors[0]).toMatchObject({ id: "door-right", wallId: "wall-right", offset: 0.5, y: 260 });
    expect(floorResizeIssues({ ...resizeFixture(), ...projected }, 600, 520)).toEqual([]);
  });

  it("projects an edge-attached exterior stair to the proposed edge", () => {
    const floor = { ...resizeFixture(), stairs: [{
      id: "stair-occurrence-1",
      x: 586,
      y: 204,
      width: 28,
      height: 42,
      direction: "both" as const,
      label: "Emergency Stair",
      exteriorEmergencyStairId: "exterior-stair-1",
      attachment: { edge: "right" as const, offset: 0.5 },
      locked: true,
    }] };
    const projected = projectFloorResizeScene(floor, 680, 520, [stairOwner()]);
    // FloorStairs x/y are top-left coordinates; the right edge therefore
    // lands exactly on x=680 (680 - 28 = 652).
    expect(projected.stairs[0]).toMatchObject({ x: 652, y: 239, width: 28, height: 42, exteriorEmergencyStairId: "exterior-stair-1" });
  });

  it("recovers a legacy generated entrance Door attachment before validation", () => {
    const floor = {
      ...resizeFixture(),
      doors: [{ id: "entrance-door", x: 600, y: 225, width: 32, wallId: "wall-top", offset: 0.5, direction: "double" as const, color: "#b45309", buildingEntranceId: "entrance-right" }],
    };
    const projected = projectFloorResizeScene(floor, 580, 450, [], [{
      id: "entrance-right",
      buildingId: "building-1",
      edge: "right",
      offset: 0.5,
      type: "emergency_exit",
    }]);
    expect(projected.doors[0]).toMatchObject({ id: "entrance-door", wallId: "wall-right", x: 580, y: 225, offset: 0.5 });
    expect(floorResizeIssues({ ...floor, ...projected }, 580, 450)).toEqual([]);
  });

  it("uses the Building Entrance offset as the resize source of truth", () => {
    const floor = {
      ...resizeFixture(),
      doors: [{ id: "entrance-door", x: 600, y: 225, width: 32, wallId: "wall-top", offset: 0.5, direction: "double" as const, color: "#b45309", buildingEntranceId: "entrance-right" }],
    };
    const projected = projectFloorResizeScene(floor, 680, 450, [], [{
      id: "entrance-right",
      buildingId: "building-1",
      edge: "right",
      offset: 0.2,
      type: "general",
    }]);
    expect(projected.doors[0]).toMatchObject({ wallId: "wall-right", x: 680, y: 90, offset: 0.2 });
  });

  it("reprojects a legacy stair from its copied edge attachment", () => {
    const floor = {
      ...resizeFixture(),
      stairs: [{
        id: "legacy-stair-occurrence",
        x: 200,
        y: 100,
        width: 28,
        height: 42,
        direction: "both" as const,
        label: "Emergency Stair",
        attachment: { edge: "bottom" as const, offset: 0.25 },
        locked: true,
      }],
    };
    const projected = projectFloorResizeScene(floor, 680, 520);
    expect(projected.stairs[0]).toMatchObject({
      x: 156,
      y: 478,
      width: 28,
      height: 42,
      attachment: { edge: "bottom", offset: 0.25 },
    });
  });

  it("reprojects Veranda-hosted Walking Points with their physical zone", () => {
    const zone = {
      id: "veranda-1",
      type: "veranda" as const,
      side: "bottom" as const,
      offset: 0.5,
      width: 200,
      depth: 40,
      walkable: true,
    };
    const hosted: NavigationNode = {
      id: "waypoint-veranda",
      name: "Veranda point",
      type: "hallway",
      x: 300,
      y: 470,
      buildingId: "building-1",
      floorId: "floor-1",
      exteriorZoneId: zone.id,
      accessible: true,
      color: "#16a34a",
    };
    const projected = projectFloorResizeScene(
      { ...resizeFixture(), exteriorZones: [zone] },
      600,
      520,
      [],
      [],
      [hosted],
    );
    expect(projected.navNodes).toEqual([{ ...hosted, y: 540 }]);
    expect(projected.navNodes?.[0].id).toBe(hosted.id);
    expect(projected.navNodes?.[0].exteriorZoneId).toBe(zone.id);
  });
});

describe("perimeter opening Room-center targets", () => {
  const room = (id: string, x: number, y: number, w: number, h: number): FloorRoom => ({
    id,
    name: id,
    type: "classroom",
    x,
    y,
    w,
    h,
    floorId: "floor-1",
    buildingId: "building-1",
  });
  const wall = (id: string, x1: number, y1: number, x2: number, y2: number, perimeterSide: "top" | "right" | "bottom" | "left"): FloorWall => ({
    id,
    x1,
    y1,
    x2,
    y2,
    thickness: 6,
    color: "#64748b",
    managedKind: "perimeter",
    perimeterSide,
  });

  it.each([
    ["top", wall("top", 0, 0, 500, 0, "top"), room("room-1", 100, 0, 200, 200), { x: 150, y: 0 }, 200, 0.4],
    ["bottom", wall("bottom", 500, 500, 0, 500, "bottom"), room("room-1", 100, 300, 200, 200), { x: 150, y: 500 }, 200, 0.6],
    ["left", wall("left", 0, 500, 0, 0, "left"), room("room-1", 0, 100, 200, 200), { x: 0, y: 150 }, 200, 0.6],
    ["right", wall("right", 500, 0, 500, 500, "right"), room("room-1", 300, 100, 200, 200), { x: 500, y: 150 }, 200, 0.4],
  ])("finds the %s perimeter Room center", (_side, perimeter, roomFixture, point, expectedCenter, expectedOffset) => {
    const rooms = [roomFixture];
    const target = roomWallCenterTarget(perimeter, rooms, 8, { point, width: 32 });
    expect(target?.guide.pos).toBe(expectedCenter);
    expect(target?.offset).toBe(expectedOffset);
  });

  it("uses the Window's current span to choose between adjacent perimeter Rooms", () => {
    const perimeter = wall("top", 0, 0, 500, 0, "top");
    const rooms = [room("room-1", 100, 0, 200, 200), room("room-2", 300, 0, 160, 200)];
    const roomOneTarget = roomWallCenterTarget(perimeter, rooms, 8, { point: { x: 150, y: 0 }, width: 32 });
    const roomTwoTarget = roomWallCenterTarget(perimeter, rooms, 8, { point: { x: 420, y: 0 }, width: 32 });
    expect(roomOneTarget?.guide.pos).toBe(200);
    expect(roomTwoTarget?.guide.pos).toBe(380);
  });
});
