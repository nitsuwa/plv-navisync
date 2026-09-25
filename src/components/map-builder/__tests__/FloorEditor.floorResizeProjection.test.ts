import { describe, expect, it } from "vitest";
import { floorResizeIssues } from "../../../lib/floorGeometry";
import { projectFloorResizeScene, roomWallCenterTarget } from "../FloorEditor";
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
