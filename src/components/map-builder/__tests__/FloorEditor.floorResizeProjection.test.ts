import { describe, expect, it } from "vitest";
import { floorResizeIssues } from "../../../lib/floorGeometry";
import { projectFloorResizeScene } from "../FloorEditor";
import type { ExteriorEmergencyStair, FloorPlan } from "../types";

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
});
