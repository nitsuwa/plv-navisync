import { describe, expect, it } from "vitest";
import { sanitizeFloorForTemplate, sanitizeRoomForTemplate, templatePayloadContainsNavigation } from "../templateSanitizer";
import { fitFloorTemplateToSize } from "../floorTemplates";
import type { FloorPlan } from "../../components/map-builder/types";

function fixture(): FloorPlan {
  return {
    id: "floor-1", buildingId: "building-1", number: 2, label: "Second Floor", canvasW: 600, canvasH: 450,
    rooms: [{ id: "room-1", name: "Lab", type: "laboratory", x: 40, y: 30, w: 240, h: 180, floorId: "floor-1", buildingId: "building-1", accessNodeId: "node-room", accessDoorId: "door-1" }],
    walls: [
      { id: "wall-room", x1: 40, y1: 30, x2: 280, y2: 30, thickness: 4, color: "#64748b", startAnchor: { targetType: "room", roomId: "room-1", edge: "top", offset: 0 }, endAnchor: { targetType: "room", roomId: "room-1", edge: "top", offset: 1 } },
      { id: "wall-free", x1: 320, y1: 30, x2: 500, y2: 30, thickness: 4, color: "#64748b" },
      { id: "wall-perimeter", x1: 0, y1: 0, x2: 600, y2: 0, thickness: 6, color: "#334155", managedKind: "perimeter", perimeterSide: "top" },
    ],
    doors: [
      { id: "door-1", x: 40, y: 100, width: 12, wallId: "wall-room", offset: 0.3, direction: "left", color: "#111827", buildingEntranceId: "entrance-1" },
      { id: "door-2", x: 320, y: 100, width: 18, direction: "right", color: "#b45309" },
    ],
    windows: [{ id: "window-1", x: 80, y: 30, width: 30, height: 5, wallId: "wall-room", offset: 0.2, color: "#38bdf8" }],
    furniture: [
      { id: "furniture-1", type: "computer-lab-table-4", name: "Computer Lab Table 4", category: "electronics", x: 60, y: 70, width: 80, height: 30, rotation: 0, color: "#475569" },
      { id: "veranda-chair", type: "chair", name: "Veranda Chair", category: "seating", x: 240, y: 430, width: 12, height: 12, rotation: 0, color: "#475569", exteriorZoneId: "veranda-1" },
    ],
    stairs: [{ id: "stairs-1", x: 450, y: 300, width: 60, height: 60, direction: "up", label: "Stair", sharedId: "shaft-1" }],
    ramps: [{ id: "ramp-1", x: 350, y: 300, width: 80, height: 20, label: "Ramp" }],
    elevators: [{ id: "elevator-1", x: 300, y: 300, width: 40, height: 40, doorWidth: 10, label: "Elevator", sharedId: "lift-1" }],
    paths: [], labels: [],
    exteriorZones: [{ id: "veranda-1", type: "veranda", side: "bottom", offset: 0.5, width: 120, depth: 36, label: "Veranda", linkedEntranceId: "entrance-1" }],
  };
}

describe("custom template sanitizers", () => {
  it("saves only the Room and fully-contained Furniture with local coordinates", () => {
    const floor = fixture();
    const result = sanitizeRoomForTemplate(floor.rooms[0], floor, { name: "Lab Template", category: "Laboratory", source: "campus" }, "campus-1");
    expect(result.source).toBe("campus");
    expect(result.objects.map((object) => object.kind)).toEqual(["room", "furniture"]);
    expect(result.objects[0]).toMatchObject({ kind: "room", x: 0, y: 0, width: 240, height: 180, type: "laboratory" });
    expect(result.objects[1]).toMatchObject({ kind: "furniture", x: 20, y: 40, type: "computer-lab-table-4" });
    expect(result).not.toHaveProperty("boundary");
    expect(JSON.stringify(result)).not.toMatch(/accessNodeId|accessDoorId|door-1|window-1|wall-room|navNode|navEdge/i);
  });

  it("preserves a custom Room polygon and excludes Furniture partly outside its slanted edge", () => {
    const floor = fixture();
    const room = { ...floor.rooms[0], shapePoints: [{ x: 40, y: 30 }, { x: 280, y: 30 }, { x: 250, y: 210 }, { x: 40, y: 210 }] };
    const localWalls = [
      { id: "top", x1: 40, y1: 30, x2: 280, y2: 30, thickness: 6, color: "#334155", managedKind: "perimeter" as const },
      { id: "left", x1: 40, y1: 30, x2: 40, y2: 210, thickness: 6, color: "#334155", managedKind: "perimeter" as const },
      { id: "right", x1: 280, y1: 30, x2: 250, y2: 210, thickness: 4, color: "#64748b" },
      { id: "bottom", x1: 250, y1: 210, x2: 40, y2: 210, thickness: 5, color: "#475569" },
    ];
    const result = sanitizeRoomForTemplate(room, {
      walls: localWalls,
      furniture: [
        floor.furniture[0],
        { id: "partial", type: "desk", name: "Partial Desk", category: "tables", x: 250, y: 100, width: 30, height: 10, rotation: 0, color: "#7a5c3a" },
        { id: "outside", type: "chair", name: "Nearby Chair", category: "seating", x: 290, y: 100, width: 12, height: 12, rotation: 0, color: "#475569" },
      ],
      doors: [{ id: "door-live", x: 265, y: 120, width: 18, direction: "right", color: "#92400e", wallId: "right", offset: 0.5 }],
      windows: [{ id: "window-live", x: 40, y: 120, width: 30, height: 5, color: "#38bdf8", wallId: "left", offset: 0.5 }],
    }, { name: "Perimeter Lab", category: "Laboratory", source: "campus" }, "campus-1");

    expect(result).not.toHaveProperty("boundary");
    expect(result.objects.map((object) => object.kind)).toEqual(["room", "furniture"]);
    expect(result.objects[0]).toMatchObject({ kind: "room", shapePoints: [{ x: 0, y: 0 }, { x: 240, y: 0 }, { x: 210, y: 180 }, { x: 0, y: 180 }] });
    expect(result.objects.filter((object) => object.kind === "furniture")).toHaveLength(1);
    expect(JSON.stringify(result)).not.toMatch(/wall-live|door-live|window-live|accessNodeId|accessDoorId/i);
  });

  it("uses a positive allow-list for a Floor and strips all navigation-sensitive collections", () => {
    const result = sanitizeFloorForTemplate(fixture(), { name: "Physical Lab Floor", category: "Laboratory", source: "shared" }, "campus-1");
    expect(result.source).toBe("shared");
    expect(result.objects.some((object) => object.kind === "room")).toBe(true);
    expect(result.objects.some((object) => object.kind === "window")).toBe(true);
    expect(result.objects.some((object) => object.kind === "door")).toBe(true);
    expect(result.objects.filter((object) => object.kind === "door" || object.kind === "window").every((object) => object.wallRef === null || (typeof object.wallRef === "string" && object.wallRef.length > 0))).toBe(true);
    expect(result.objects.some((object) => object.kind === "path")).toBe(false);
    expect(result.objects.some((object) => object.kind === "exterior-zone" && object.zoneKey === "zone-1")).toBe(true);
    expect(result.objects.some((object) => object.kind === "furniture" && object.name === "Veranda Chair" && object.zoneRef === "zone-1")).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/veranda-chair|veranda-1|entrance-1/);
    expect(result.objects.some((object) => object.kind === "stairs")).toBe(true);
    expect(result.objects.some((object) => object.kind === "ramp")).toBe(true);
    expect(result.objects.some((object) => object.kind === "elevator")).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/buildingEntranceId|wallId|accessNodeId|accessDoorId|sharedId|floorId|navNode|navEdge|entrance|transition|groundDischarge|exteriorEmergencyStair/i);
    expect(templatePayloadContainsNavigation(result)).toBe(false);
  });

  it("fits uniformly, centers the template, and rejects unsafe physical dimensions", () => {
    const template = sanitizeFloorForTemplate(fixture(), { name: "Physical Lab Floor", category: "Laboratory", source: "shared" }, "campus-1");
    const sameSize = fitFloorTemplateToSize(template, 600, 450);
    expect(sameSize.safe).toBe(true);
    expect(sameSize.scale).toBe(1);

    const fitted = fitFloorTemplateToSize(template, 1200, 900);
    expect(fitted.safe).toBe(true);
    expect(fitted.scale).toBe(2);
    expect(fitted.template.objects.find((object) => object.kind === "room")).toMatchObject({ x: 80, y: 60, w: 480, h: 360 });

    const unsafe = fitFloorTemplateToSize(template, 100, 75);
    expect(unsafe.safe).toBe(false);
    expect(unsafe.reason).toMatch(/too large to safely scale/i);
  });
});
