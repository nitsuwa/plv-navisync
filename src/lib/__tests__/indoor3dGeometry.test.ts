import { describe, expect, it } from "vitest";
import type { FloorDoor, FloorFurniture, FloorPlan, FloorRoom, FloorStairs, FloorWall, FloorWindow } from "../../components/map-builder/types";
import { clampIndoorPriorityRoomLabel, descendingIndoorStairOpeningPolygon, deriveStudentAuditoriumChairLayouts, deriveStudentAuditoriumChairLayoutsForFloor, discoverIndoorCameraDirection, exteriorEmergencyStairOpenings, indoorDoorVisualWidth, indoorFloorCameraBounds, indoorFloorCameraDirectionForViewport, indoorFloorCameraFarPlane, indoorFloorCameraFitPadding, indoorFloorCameraHalfDepth, indoorRoomLabelPriority, indoorWallOccludesFocus, isIndoorOpenBelowRoom, layoutIndoorRoomLabels, normalizeIndoorWallSegments, radialFurnitureSeatAngles, shouldRenderDescendingIndoorStair, shouldRenderIndoorDownStairModule, shouldRenderIndoorLandmarkFurniture, shouldRenderStudentCanteenDiningFurniture, shouldShowIndoorExitCue, INDOOR_FLOOR_CAMERA_DIRECTION } from "../indoor3dGeometry";

const wall = (id: string, x1: number, y1: number, x2: number, y2: number): FloorWall => ({
  id, x1, y1, x2, y2, thickness: 4, color: "#ccc", visible: true,
});

function cameraFitFloor(overrides: Partial<FloorPlan> = {}): FloorPlan {
  return {
    id: "camera-fit-floor",
    buildingId: "camera-fit-building",
    number: 1,
    label: "Ground Floor",
    rooms: [], paths: [], walls: [], doors: [], windows: [], furniture: [],
    stairs: [], ramps: [], elevators: [], labels: [],
    ...overrides,
  };
}

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

  it("allows authored dining tables and chairs as a Student 3D canteen-only presentation exception", () => {
    expect(shouldRenderStudentCanteenDiningFurniture(item("dining-table-6-seats"))).toBe(true);
    expect(shouldRenderStudentCanteenDiningFurniture(item("chair", { name: "Dining chair" }))).toBe(true);
    expect(shouldRenderStudentCanteenDiningFurniture(item("table-tennis"))).toBe(false);
    expect(shouldRenderStudentCanteenDiningFurniture(item("dining-table-4-seats", { visible: false }))).toBe(false);
    expect(shouldRenderStudentCanteenDiningFurniture(item("service-counter"))).toBe(false);
  });

  it("returns evenly spaced seat angles without relying on Array.from callback extras", () => {
    expect(radialFurnitureSeatAngles(4)).toEqual([0, Math.PI / 2, Math.PI, Math.PI * 1.5]);
    expect(radialFurnitureSeatAngles(0)).toEqual([]);
    expect(radialFurnitureSeatAngles(Number.NaN)).toEqual([]);
  });
});

describe("Student auditorium chair layouts", () => {
  const furniture = (type: string, overrides: Partial<FloorFurniture> = {}): FloorFurniture => ({
    id: type,
    type,
    name: type,
    category: "Seating",
    x: 100,
    y: 200,
    width: 40,
    height: 32,
    rotation: 0,
    color: "#4b5563",
    ...overrides,
  });

  it("uses the authored center, rotation, dimensions, and color for one audience chair", () => {
    expect(deriveStudentAuditoriumChairLayouts([furniture("audience-chair", { rotation: 90 })])).toEqual([{
      id: "audience-chair",
      x: 120,
      y: 216,
      width: 24.8,
      height: 19.84,
      rotation: 90,
      color: "#4b5563",
      flipX: false,
      flipY: false,
    }]);
  });

  it("expands an authored 4x4 seating block into 16 rotated instances with aisle spacing", () => {
    const layouts = deriveStudentAuditoriumChairLayouts([furniture("audience-seating-4x4", {
      x: 100, y: 200, width: 40, height: 80, rotation: 90,
    })]);
    expect(layouts).toHaveLength(16);
    expect(layouts[0]).toMatchObject({ id: "audience-seating-4x4:seat-0-0", rotation: 90, width: 6, height: 10 });
    expect(layouts[0].x).toBeCloseTo(150);
    expect(layouts[0].y).toBeCloseTo(225);
    expect(layouts[1].x - layouts[0].x).toBeCloseTo(0);
    expect(layouts[1].y - layouts[0].y).toBeCloseTo(10);
    expect(layouts[4].x - layouts[0].x).toBeCloseTo(-20);
    expect(layouts[4].y - layouts[0].y).toBeCloseTo(0);
    expect(layouts.at(-1)?.id).toBe("audience-seating-4x4:seat-3-3");
  });

  it("only includes generic armchairs in the auditorium context and respects visibility", () => {
    const items = [
      furniture("arm-chair", { id: "auditorium-seat", name: "Arm Chair" }),
      furniture("arm-chair", { id: "hidden-seat", visible: false }),
      furniture("student-desk-chair", { id: "desk-chair" }),
      furniture("audience-chair", { id: "explicit-seat" }),
    ];
    expect(deriveStudentAuditoriumChairLayouts(items).map((chair) => chair.id)).toEqual(["explicit-seat"]);
    const auditoriumPolygon = [{ x: 80, y: 180 }, { x: 160, y: 180 }, { x: 160, y: 250 }, { x: 80, y: 250 }];
    expect(deriveStudentAuditoriumChairLayouts(items, [auditoriumPolygon]).map((chair) => chair.id)).toEqual(["auditorium-seat", "explicit-seat"]);
  });

  it("applies the authored grouped-seat mirror transform to instance centers", () => {
    const layout = deriveStudentAuditoriumChairLayouts([furniture("audience-seating-4x4", {
      x: 0, y: 0, width: 40, height: 40, flipX: true,
    })]);
    expect(layout[0].x).toBeCloseTo(35);
    expect(layout[0].y).toBeCloseTo(5);
    expect(layout[0].flipX).toBe(true);
  });

  it("keeps every authored auditorium armchair in the instance layout", () => {
    const items = Array.from({ length: 328 }, (_, index) => {
      const centerX = 121 + (index % 24) * 33.5;
      const centerY = 9 + Math.floor(index / 24) * 25;
      return furniture("arm-chair", {
        id: `seat-${index}`,
        name: `Arm Chair${index ? " Copy" : ""}`,
        category: "Seating",
        x: centerX - 8,
        y: centerY - 8,
        width: 16,
        height: 16,
        rotation: 270,
      });
    });
    const auditorium = {
      id: "plv-auditorium",
      name: "PLV AUDITORIUM",
      type: "auditorium",
      x: 115,
      y: 0,
      w: 828,
      h: 362,
      visible: true,
      rotation: 0,
    } as FloorRoom;
    const outsideArmchair = furniture("arm-chair", { id: "lounge-seat", x: 960, y: 100, width: 16, height: 16 });
    const layouts = deriveStudentAuditoriumChairLayoutsForFloor({
      // The published Floor 5 record uses internal ordinal 6. Rendering must
      // be driven by the authored auditorium room, not this inconsistent index.
      rooms: [auditorium],
      furniture: [...items, outsideArmchair],
    });
    expect(layouts).toHaveLength(328);
    expect(layouts.map((chair) => chair.id)).toEqual(items.map((item) => item.id));
    expect(layouts[0]).toMatchObject({ x: 121, y: 9, rotation: 270, width: 13.12, height: 12.48 });
  });

  it("does not promote generic armchairs outside an authored auditorium room", () => {
    const room: FloorRoom = {
      id: "lounge",
      name: "Student Lounge",
      type: "common",
      x: 0, y: 0, w: 200, h: 200,
      visible: true,
    } as FloorRoom;
    expect(deriveStudentAuditoriumChairLayoutsForFloor({ rooms: [room], furniture: [furniture("arm-chair")] })).toEqual([]);
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

  it("ends a down-only stair at the lowest served Floor without reversing its presentation", () => {
    expect(shouldRenderIndoorDownStairModule("down", false)).toBe(false);
    expect(shouldRenderIndoorDownStairModule("down", true)).toBe(true);
    expect(shouldRenderIndoorDownStairModule("up", false)).toBe(true);
  });

  it("sizes the renderer-only stairwell opening to the rotated 3D stair footprint", () => {
    const polygon = descendingIndoorStairOpeningPolygon(
      { x: 10, y: 20, width: 40, height: 60, rotation: 90 },
      2,
      3,
      0.05,
    );
    const xs = polygon.map((point) => point.x);
    const ys = polygon.map((point) => point.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(61.6);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(41.6);
    expect(polygon).toHaveLength(4);
  });
});

describe("indoor 3D camera fit", () => {
  it("backs the camera out on a narrow mobile viewport to frame the same authored floor", () => {
    const desktop = indoorFloorCameraHalfDepth(600, 450, 1.6);
    const mobile = indoorFloorCameraHalfDepth(600, 450, 390 / 844);
    expect(mobile).toBeGreaterThan(desktop * 2);
  });

  it("fits the Discover view against its calmer authored camera direction", () => {
    const portraitDirection = discoverIndoorCameraDirection(390 / 844);
    const landscapeDirection = discoverIndoorCameraDirection(1440 / 900);
    expect(portraitDirection).toEqual([1.2, 2, 0.22]);
    expect(landscapeDirection).toEqual([0.4, 1.25, 0.95]);
    const discover = indoorFloorCameraHalfDepth(600, 450, 390 / 844, 0.025, 42, portraitDirection);
    const defaultFloor = indoorFloorCameraHalfDepth(600, 450, 390 / 844);
    expect(discover).toBeGreaterThan(4.5);
    expect(discover).toBeLessThan(defaultFloor * 1.5);
  });

  it("keeps the far plane beyond the maximum zoom-out range for large floors", () => {
    for (const halfDepth of [8, 32, 120]) {
      expect(indoorFloorCameraFarPlane(halfDepth)).toBeGreaterThan(halfDepth * 2.7);
    }
  });

  it("fits compact and large floors from their own structural bounds", () => {
    const compact = indoorFloorCameraBounds(cameraFitFloor({
      rooms: [{ id: "small", name: "Small", type: "office", x: 100, y: 90, w: 120, h: 80, floorId: "f", buildingId: "b" }],
    }), { x: 0, y: 0, width: 600, height: 450 });
    const large = indoorFloorCameraBounds(cameraFitFloor({
      rooms: [{ id: "large", name: "Large", type: "hall", x: 0, y: 0, w: 1400, h: 900, floorId: "f", buildingId: "b" }],
    }), { x: 0, y: 0, width: 1600, height: 1000 });

    expect(compact.width).toBeCloseTo(144);
    expect(compact.height).toBeCloseTo(104);
    expect(indoorFloorCameraHalfDepth(large.width, large.height, 1.5))
      .toBeGreaterThan(indoorFloorCameraHalfDepth(compact.width, compact.height, 1.5) * 5);
  });

  it("fits long rectangular floors against the constrained mobile viewport dimension", () => {
    const desktop = indoorFloorCameraHalfDepth(1400, 240, 1440 / 900);
    const portrait = indoorFloorCameraHalfDepth(1400, 240, 390 / 844);
    expect(portrait).toBeGreaterThan(desktop * 1.6);
    expect(indoorFloorCameraHalfDepth(240, 1400, 390 / 844)).toBeGreaterThan(4.5);
  });

  it("keeps desktop framing and adapts portrait framing to the authored floor's long axis", () => {
    const desktop = indoorFloorCameraDirectionForViewport(1400, 240, 1440 / 900);
    const widePortrait = indoorFloorCameraDirectionForViewport(1400, 240, 390 / 844);
    const tallPortrait = indoorFloorCameraDirectionForViewport(240, 1400, 390 / 844);
    const squarePortrait = indoorFloorCameraDirectionForViewport(500, 500, 390 / 844);

    expect(desktop).toEqual(INDOOR_FLOOR_CAMERA_DIRECTION);
    expect(widePortrait[0]).toBeGreaterThan(INDOOR_FLOOR_CAMERA_DIRECTION[0]);
    expect(widePortrait[2] / widePortrait[0]).toBeCloseTo(0.18);
    expect(tallPortrait[2]).toBeGreaterThan(INDOOR_FLOOR_CAMERA_DIRECTION[2]);
    expect(squarePortrait[2] / squarePortrait[0]).toBeLessThan(
      INDOOR_FLOOR_CAMERA_DIRECTION[2] / INDOOR_FLOOR_CAMERA_DIRECTION[0],
    );
    expect(squarePortrait[2] / squarePortrait[0]).toBeGreaterThan(0.18);
    for (const direction of [widePortrait, tallPortrait, squarePortrait]) {
      expect(direction[1] / Math.hypot(...direction)).toBeCloseTo(
        INDOOR_FLOOR_CAMERA_DIRECTION[1] / Math.hypot(...INDOOR_FLOOR_CAMERA_DIRECTION),
      );
    }
    const defaultSquareDepth = indoorFloorCameraHalfDepth(420, 380, 390 / 844);
    const portraitSquareDepth = indoorFloorCameraHalfDepth(420, 380, 390 / 844, 0.025, 42, squarePortrait, 1.04);
    expect(portraitSquareDepth).toBeLessThan(defaultSquareDepth);
  });

  it("uses the portrait perspective corners instead of combining unrelated worst-case extents", () => {
    const aspect = 390 / 844;
    const direction = indoorFloorCameraDirectionForViewport(560, 470, aspect);
    const halfDepth = indoorFloorCameraHalfDepth(560, 470, aspect, 0.025, 42, direction, 1.04);
    const distance = halfDepth * Math.hypot(...direction);
    const normalized = direction.map((value) => value / Math.hypot(...direction));
    const right = [-normalized[2], 0, normalized[0]];
    const rightLength = Math.hypot(right[0], right[2]);
    right[0] /= rightLength;
    right[2] /= rightLength;
    const up = [
      -normalized[0] * normalized[1],
      1 - normalized[1] * normalized[1],
      -normalized[2] * normalized[1],
    ];
    const upLength = Math.hypot(...up);
    const screenUp = up.map((value) => value / upLength);
    const halfWidth = 560 * 0.025 / 2;
    const halfHeight = 470 * 0.025 / 2;
    const tanVertical = Math.tan((42 * Math.PI / 180) / 2);
    const tanHorizontal = tanVertical * aspect;
    let maxHorizontal = 0;
    let maxVertical = 0;

    for (const xSign of [-1, 1]) {
      for (const zSign of [-1, 1]) {
        const x = xSign * halfWidth;
        const z = zSign * halfHeight;
        const depth = distance - (x * normalized[0] + z * normalized[2]);
        maxHorizontal = Math.max(maxHorizontal, Math.abs(x * right[0] + z * right[2]) / (depth * tanHorizontal));
        maxVertical = Math.max(maxVertical, Math.abs(x * screenUp[0] + z * screenUp[2]) / (depth * tanVertical));
      }
    }

    const legacyHorizontalHalfExtent = (Math.abs(right[0]) * 560 * 0.025 + Math.abs(right[2]) * 470 * 0.025) / 2;
    const legacyVerticalHalfExtent = (Math.abs(screenUp[0]) * 560 * 0.025 + Math.abs(screenUp[2]) * 470 * 0.025) / 2;
    const depthHalfExtent = (Math.abs(normalized[0]) * 560 * 0.025 + Math.abs(normalized[2]) * 470 * 0.025) / 2;
    const legacyDistance = (Math.max(legacyHorizontalHalfExtent / tanHorizontal, legacyVerticalHalfExtent / tanVertical) + depthHalfExtent) * 1.04;

    expect(maxHorizontal).toBeLessThanOrEqual(1 / 1.04 + 1e-6);
    expect(maxVertical).toBeLessThanOrEqual(1 / 1.04 + 1e-6);
    expect(distance).toBeLessThan(legacyDistance * 0.95);
  });

  it("keeps landscape camera distance unchanged and lets compact floors use their own scale", () => {
    const aspect = 1440 / 900;
    const direction = INDOOR_FLOOR_CAMERA_DIRECTION;
    const desktopDepth = indoorFloorCameraHalfDepth(900, 560, aspect, 0.025, 42, direction, 1.08);
    const compactDepth = indoorFloorCameraHalfDepth(110, 95, aspect, 0.025, 42, direction, 1.08);
    expect(desktopDepth).toBeGreaterThan(4.5);
    expect(compactDepth).toBeLessThan(4.5);
    expect(compactDepth).toBeGreaterThanOrEqual(2.4);
  });

  it("tightens only portrait indoor fit across phone and portrait-tablet sizes", () => {
    const viewports = [[320, 568], [360, 640], [390, 844], [430, 932], [768, 1024], [1440, 900]] as const;
    for (const [width, height] of viewports) {
      const aspect = width / height;
      const fixedDepth = indoorFloorCameraHalfDepth(900, 400, aspect);
      const fitDirection = indoorFloorCameraDirectionForViewport(900, 400, aspect);
      const responsiveDepth = indoorFloorCameraHalfDepth(
        900,
        400,
        aspect,
        0.025,
        42,
        fitDirection,
        indoorFloorCameraFitPadding(aspect),
      );
      if (aspect < 0.82) {
        expect(responsiveDepth).toBeLessThan(fixedDepth);
        expect(indoorFloorCameraFitPadding(aspect)).toBe(1.04);
      } else {
        expect(responsiveDepth).toBeCloseTo(fixedDepth);
        expect(indoorFloorCameraFitPadding(aspect)).toBe(1.08);
      }
    }
  });

  it("brings elongated portrait floors closer while preserving camera elevation", () => {
    const aspect = 390 / 844;
    const direction = indoorFloorCameraDirectionForViewport(1098, 572, aspect);
    const portraitDepth = indoorFloorCameraHalfDepth(1098, 572, aspect, 0.025, 42, direction, 1.04);
    const originalAngleDepth = indoorFloorCameraHalfDepth(1098, 572, aspect, 0.025, 42, INDOOR_FLOOR_CAMERA_DIRECTION, 1.04);

    expect(portraitDepth).toBeLessThan(originalAngleDepth * 0.9);
    expect(direction[1] / Math.hypot(...direction)).toBeCloseTo(
      INDOOR_FLOOR_CAMERA_DIRECTION[1] / Math.hypot(...INDOOR_FLOOR_CAMERA_DIRECTION),
    );
  });

  it("uses the extents of an irregular authored room outline", () => {
    const bounds = indoorFloorCameraBounds(cameraFitFloor({
      rooms: [{
        id: "irregular", name: "Atrium", type: "hall", x: 0, y: 0, w: 360, h: 200,
        shapePoints: [{ x: 0, y: 0 }, { x: 360, y: 0 }, { x: 300, y: 160 }, { x: 100, y: 200 }, { x: 0, y: 120 }],
        floorId: "f", buildingId: "b",
      }],
    }), { x: 0, y: 0, width: 600, height: 450 });

    expect(bounds.width).toBeCloseTo(385.2);
    expect(bounds.height).toBeCloseTo(224);
  });

  it("ignores oversized decorative furniture, labels and broad exterior zones while retaining exits", () => {
    const bounds = indoorFloorCameraBounds(cameraFitFloor({
      rooms: [{ id: "shell", name: "Room", type: "office", x: 100, y: 100, w: 300, h: 180, floorId: "f", buildingId: "b" }],
      stairs: [{ id: "exit-stair", x: 400, y: 140, width: 50, height: 80, rotation: 0, direction: "down", label: "Exit", visible: true }],
      furniture: [{ id: "oversize", type: "fixture", name: "fixture", category: "fixture", x: -5000, y: -5000, width: 12000, height: 12000, rotation: 0, color: "#000" }],
      labels: [{ id: "oversize-label", x: 10000, y: 10000, text: "decorative", fontSize: 500, color: "#000", rotation: 0 }],
      exteriorZones: [{ id: "wide-zone", type: "covered_walkway", side: "left", offset: 0.5, width: 1800, depth: 600, visible: true }],
    }), { x: 0, y: 0, width: 600, height: 450 });

    expect(bounds.x).toBeCloseTo(87.75);
    expect(bounds.width).toBeCloseTo(374.5);
    expect(bounds.y).toBeCloseTo(88);
    expect(bounds.height).toBeCloseTo(204);
  });

  it("fits an entrance feature at its authored zone attachment without fitting the whole zone", () => {
    const bounds = indoorFloorCameraBounds(cameraFitFloor({
      rooms: [{ id: "shell", name: "Room", type: "office", x: 100, y: 100, w: 300, h: 180, floorId: "f", buildingId: "b" }],
      exteriorZones: [{ id: "landing", type: "entrance_landing", side: "top", offset: 0.5, width: 160, depth: 40, visible: true }],
      entranceSteps: [{
        id: "steps", x: 9000, y: 9000, width: 40, height: 30, label: "Entrance",
        parentZoneId: "landing", attachmentEdge: "outer", attachmentOffset: 0.5,
      }],
    }), { x: 0, y: 0, width: 600, height: 450 });

    expect(bounds.y).toBeLessThan(-70);
    expect(bounds.width).toBeLessThan(400);
    expect(bounds.height).toBeLessThan(400);
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
