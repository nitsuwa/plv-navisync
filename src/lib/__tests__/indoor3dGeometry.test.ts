import { describe, expect, it } from "vitest";
import type { FloorDoor, FloorStairs, FloorWall, FloorWindow } from "../../components/map-builder/types";
import { clampIndoorPriorityRoomLabel, exteriorEmergencyStairOpenings, indoorDoorVisualWidth, indoorFloorCameraFarPlane, indoorFloorCameraHalfDepth, indoorRoomLabelPriority, indoorWallOccludesFocus, isIndoorOpenBelowRoom, layoutIndoorRoomLabels, normalizeIndoorWallSegments, radialFurnitureSeatAngles, shouldRenderDescendingIndoorStair, shouldRenderIndoorLandmarkFurniture, shouldShowIndoorExitCue } from "../indoor3dGeometry";

const wall = (id: string, x1: number, y1: number, x2: number, y2: number): FloorWall => ({
  id, x1, y1, x2, y2, thickness: 4, color: "#ccc", visible: true,
});

describe("indoorWallOccludesFocus", () => {
  const segment = { startX: -2, startZ: 0, endX: 2, endZ: 0, thickness: 0.12, baseY: 0, height: 2.9 };

  it("fades only a wall that lies between the camera and the current focus at wall height", () => {
    expect(indoorWallOccludesFocus({ x: 0, y: 4, z: 5 }, { x: 0, y: 0.16, z: -5 }, segment)).toBe(true);
    expect(indoorWallOccludesFocus({ x: 5, y: 4, z: 5 }, { x: 5, y: 0.16, z: -5 }, segment)).toBe(false);
    expect(indoorWallOccludesFocus({ x: 0, y: 7, z: 5 }, { x: 0, y: 0.16, z: -5 }, segment)).toBe(false);
  });
});

describe("normalizeIndoorWallSegments", () => {
  it("merges overlapping collinear authored walls into one clean run", () => {
    const result = normalizeIndoorWallSegments([
      wall("first", 0, 20, 80, 20),
      wall("overlap", 78, 20.3, 150, 20.3),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].x1).toBeCloseTo(0);
    expect(result[0].x2).toBeCloseTo(150);
    expect(result[0].y1).toBeCloseTo(20, 1);
  });

  it("cuts a door opening while retaining the wall lintel above it", () => {
    const source = wall("hall-wall", 0, 0, 100, 0);
    const opening: FloorDoor = {
      id: "entry", x: 50, y: 0, width: 20, wallId: "hall-wall", direction: "double", color: "#888", openingType: "open_passage",
    };
    const result = normalizeIndoorWallSegments([source], [opening]);
    expect(result).toHaveLength(3);
    expect(result[0].x2).toBeCloseTo(21.6);
    expect(result[1]).toMatchObject({ x1: 21.6, x2: 78.4, baseHeight: 2.08 });
    expect(result[1].height).toBeCloseTo(0.82);
    expect(result[2].x1).toBeCloseTo(78.4);
    expect(source.x2).toBe(100);
  });

  it("renders double doors with a wider human-scale opening than single doors", () => {
    const single = indoorDoorVisualWidth({ width: 20, direction: "left" });
    const double = indoorDoorVisualWidth({ width: 20, direction: "double" });
    const emergencyDouble = indoorDoorVisualWidth({ width: 20, direction: "double", isEmergencyExit: true });
    expect(single * 0.025).toBeCloseTo(0.82);
    expect(double * 0.025).toBeCloseTo(1.42);
    expect(emergencyDouble * 0.025).toBeCloseTo(1.85);
  });

  it("shows exit cues only for canonical eligible context and suppresses the active duplicate", () => {
    const eligible = new Set(["normal", "emergency", "active"]);
    const routeRelevant = new Set<string>();
    const context = { eligible, routeRelevant, activeDoorId: "active" };
    expect(shouldShowIndoorExitCue({ id: "normal" }, context)).toBe(true);
    expect(shouldShowIndoorExitCue({ id: "active" }, context)).toBe(false);
    expect(shouldShowIndoorExitCue({ id: "outside-only" }, context)).toBe(false);
    expect(shouldShowIndoorExitCue({ id: "emergency", isEmergencyExit: true }, context)).toBe(false);
    expect(shouldShowIndoorExitCue({ id: "emergency", isEmergencyExit: true }, { ...context, routeRelevant: new Set(["emergency"]) })).toBe(true);
  });

  it("leaves a sill and header around a window opening", () => {
    const window: FloorWindow = { id: "window", x: 50, y: 0, width: 20, height: 24, wallId: "hall-wall", color: "#8bd2e5" };
    const result = normalizeIndoorWallSegments([wall("hall-wall", 0, 0, 100, 0)], [], [window]);
    expect(result).toHaveLength(4);
    const sill = result.find((segment) => segment.x1 === 40 && segment.x2 === 60 && segment.baseHeight === 0);
    const header = result.find((segment) => segment.x1 === 40 && segment.x2 === 60 && segment.baseHeight === 2.04);
    expect(sill?.height).toBeCloseTo(0.88);
    expect(header?.height).toBeCloseTo(0.86);
  });

  it("keeps perpendicular walls as separate legs while sharing their corner", () => {
    const result = normalizeIndoorWallSegments([wall("east-west", 0, 0, 60, 0), wall("north-south", 60, 0, 60, 50)]);
    expect(result).toHaveLength(2);
    expect(result.some((segment) => Math.abs(segment.x2 - 60) < 0.01 && Math.abs(segment.y2) < 0.01)).toBe(true);
  });

  it("butts a T-junction into the through-wall instead of overlapping wall boxes", () => {
    const result = normalizeIndoorWallSegments([wall("through", 0, 20, 100, 20), wall("branch", 50, 20, 50, 80)]);
    const branch = result.find((segment) => segment.sourceIds.includes("branch"));
    expect(branch?.y1).toBeCloseTo(22);
    expect(branch?.y2).toBeCloseTo(80);
  });

  it("splits crossing walls around a single clean junction", () => {
    const result = normalizeIndoorWallSegments([wall("horizontal", 0, 50, 100, 50), wall("vertical", 50, 0, 50, 100)]);
    const verticalSegments = result.filter((segment) => segment.sourceIds.includes("vertical"));
    expect(verticalSegments).toHaveLength(2);
    expect(verticalSegments.map((segment) => Math.abs(segment.y2 - segment.y1)).sort((a, b) => a - b)).toEqual([48, 48]);
  });
});

describe("navigation-focused indoor furniture", () => {
  const item = (type: string, overrides: Record<string, unknown> = {}) => ({
    id: type, type, name: type, category: "furniture", x: 0, y: 0, width: 48, height: 24, rotation: 0, color: "#aaa", ...overrides,
  });

  it("keeps major authored landmarks and omits repeated small seating and desks", () => {
    expect(shouldRenderIndoorLandmarkFurniture(item("reception-counter"))).toBe(true);
    expect(shouldRenderIndoorLandmarkFurniture(item("lab-workbench"))).toBe(true);
    expect(shouldRenderIndoorLandmarkFurniture(item("sofa"))).toBe(true);
    expect(shouldRenderIndoorLandmarkFurniture(item("student-desk-chair"))).toBe(false);
    expect(shouldRenderIndoorLandmarkFurniture(item("writing-arm-chair"))).toBe(false);
    expect(shouldRenderIndoorLandmarkFurniture(item("study-table-4-seats"))).toBe(false);
    expect(shouldRenderIndoorLandmarkFurniture(item("large-table", { width: 120, height: 90 }))).toBe(true);
    expect(shouldRenderIndoorLandmarkFurniture(item("reception-counter", { visible: false }))).toBe(false);
  });

  it("returns evenly spaced seat angles without relying on Array.from callback extras", () => {
    expect(radialFurnitureSeatAngles(4)).toEqual([0, Math.PI / 2, Math.PI, Math.PI * 1.5]);
    expect(radialFurnitureSeatAngles(0)).toEqual([]);
    expect(radialFurnitureSeatAngles(Number.NaN)).toEqual([]);
  });
});

describe("indoor room label layout", () => {
  it("keeps destination, selected, route, and ambient labels in a stable priority order", () => {
    expect(indoorRoomLabelPriority({})).toBe(1);
    expect(indoorRoomLabelPriority({ routeRelevant: true })).toBe(4);
    expect(indoorRoomLabelPriority({ selected: true })).toBe(5);
    expect(indoorRoomLabelPriority({ destination: true })).toBe(6);
    expect(indoorRoomLabelPriority({ selected: true, destination: true })).toBe(7);
  });

  it("keeps selected and route labels ahead of ambient labels and offsets neighbors", () => {
    const placements = layoutIndoorRoomLabels([
      { id: "ambient", x: 100, y: 100, width: 70, height: 20, priority: 1 },
      { id: "route", x: 100, y: 100, width: 64, height: 20, priority: 4 },
      { id: "selected", x: 100, y: 100, width: 76, height: 20, priority: 5 },
      { id: "nearby", x: 112, y: 100, width: 64, height: 20, priority: 1 },
    ], 240, 200);
    expect(placements.find((item) => item.id === "selected")?.visible).toBe(true);
    expect(placements.find((item) => item.id === "route")?.visible).toBe(true);
    expect(placements.find((item) => item.id === "route")?.offsetY).not.toBe(0);
    expect(placements.find((item) => item.id === "ambient")?.visible).toBe(true);
    const ambient = placements.find((item) => item.id === "ambient");
    expect(ambient?.offsetX !== 0 || ambient?.offsetY !== 0).toBe(true);
  });

  it("keeps selected room labels at the viewport edge while retaining their world-anchor correction", () => {
    const selected = clampIndoorPriorityRoomLabel({ x: -80, y: 260, width: 100, height: 24, priority: 5 }, 240, 200);
    expect(selected.x).toBe(52);
    expect(selected.y).toBe(186);
    expect(-80 + selected.anchorOffsetX).toBe(selected.x);
    expect(260 + selected.anchorOffsetY).toBe(selected.y);

    const ambient = clampIndoorPriorityRoomLabel({ x: -80, y: 260, width: 100, height: 24, priority: 1 }, 240, 200);
    expect(ambient).toEqual({ x: -80, y: 260, anchorOffsetX: 0, anchorOffsetY: 0 });
    expect(clampIndoorPriorityRoomLabel({ x: -80, y: 260, width: 100, height: 24, priority: 4 }, 240, 200).x).toBe(52);
  });
});

describe("indoor stair direction projection", () => {
  it("does not invent a down flight below the first published Floor", () => {
    expect(shouldRenderDescendingIndoorStair(-1, "down")).toBe(false);
    expect(shouldRenderDescendingIndoorStair(0, "down")).toBe(false);
    expect(shouldRenderDescendingIndoorStair(1, "down")).toBe(false);
    expect(shouldRenderDescendingIndoorStair(1, "reverse")).toBe(false);
    expect(shouldRenderDescendingIndoorStair(2, "down")).toBe(true);
    expect(shouldRenderDescendingIndoorStair(2, "reverse")).toBe(true);
    expect(shouldRenderDescendingIndoorStair(2, "up")).toBe(false);
  });
});

describe("indoor 3D camera fit", () => {
  it("backs the camera out on a narrow mobile viewport to frame the same authored floor", () => {
    const desktop = indoorFloorCameraHalfDepth(600, 450, 1.6);
    const mobile = indoorFloorCameraHalfDepth(600, 450, 390 / 844);
    expect(mobile).toBeGreaterThan(desktop * 2);
  });

  it("keeps the far plane beyond the maximum zoom-out range for large floors", () => {
    for (const halfDepth of [8, 32, 120]) {
      expect(indoorFloorCameraFarPlane(halfDepth)).toBeGreaterThan(halfDepth * 2.7);
    }
  });
});

describe("exteriorEmergencyStairOpenings", () => {
  it("derives a visual opening at the authored emergency stair connection", () => {
    const perimeter = wall("perimeter", 0, 0, 100, 0);
    const stair = {
      id: "landing-2f", x: 40, y: -20, width: 20, height: 40,
      direction: "down" as const, label: "Emergency stairs", exteriorEmergencyStairId: "exterior-1",
      attachment: { edge: "top" as const, offset: 0.5 },
    } as FloorStairs;
    const openings = exteriorEmergencyStairOpenings([perimeter], [], [stair]);
    expect(openings).toHaveLength(1);
    expect(openings[0]).toMatchObject({ x: 50, y: 0, wallId: "perimeter", openingType: "open_passage" });
    expect(normalizeIndoorWallSegments([perimeter], openings)).toHaveLength(3);
    expect(perimeter.x2).toBe(100);
  });

  it("keeps an already-authored emergency door and does not make a duplicate opening", () => {
    const perimeter = wall("perimeter", 0, 0, 100, 0);
    const stair = {
      id: "landing-2f", x: 40, y: -20, width: 20, height: 40,
      direction: "down" as const, label: "Emergency stairs", exteriorEmergencyStairId: "exterior-1",
    } as FloorStairs;
    const emergencyDoor: FloorDoor = {
      id: "authored-exit", x: 50, y: 0, width: 24, wallId: "perimeter", direction: "left", color: "#888", isEmergencyExit: true,
    };
    expect(exteriorEmergencyStairOpenings([perimeter], [emergencyDoor], [stair])).toHaveLength(0);
  });
});

describe("isIndoorOpenBelowRoom", () => {
  const polygon = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 80 }, { x: 0, y: 80 }];
  const stair = { x: 30, y: 20, width: 40, height: 30 } as FloorStairs;
  it("honors a clear authored open-below name", () => {
    expect(isIndoorOpenBelowRoom({ name: "Open Below", type: "other" }, polygon, [])).toBe(true);
  });
  it("uses a stair-room compatibility rule only when an authored stair lies inside", () => {
    expect(isIndoorOpenBelowRoom({ name: "Stairs", type: "stairs" }, polygon, [stair])).toBe(true);
    expect(isIndoorOpenBelowRoom({ name: "Stairs", type: "stairs" }, polygon, [{ ...stair, x: 140 }])).toBe(false);
    expect(isIndoorOpenBelowRoom({ name: "Blue office", type: "office" }, polygon, [stair])).toBe(false);
  });
});
