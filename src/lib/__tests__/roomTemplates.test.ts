import { describe, expect, it } from "vitest";
import {
  ROOM_TEMPLATES,
  getRoomTemplates,
  instantiateRoomTemplate,
  validateRoomTemplatePlacement,
} from "../roomTemplates";
import { FLOOR_TEMPLATES, getFloorTemplates, instantiateFloorTemplate } from "../floorTemplates";
import { createDefaultFloor } from "../floorPlanNormalization";

describe("PLV room templates", () => {
  it("ships the curated room catalogue with room-only definitions", () => {
    expect(ROOM_TEMPLATES.map((template) => template.name)).toEqual(expect.arrayContaining([
      "Classroom — 40 Seats",
      "Classroom — 60 Seats",
      "Computer Laboratory",
      "Engineering Laboratory",
      "Faculty / Administrative Office",
      "Conference Room",
      "Study Room",
      "Standard Restroom",
    ]));
    expect(ROOM_TEMPLATES.every((template) => template.scope === "room" && template.source === "builtin")).toBe(true);
    expect(JSON.stringify(ROOM_TEMPLATES)).not.toMatch(/navNodes|navEdges|navigationVertexIds|generatedFromPath/);
  });

  it("filters by category and searches tags/metadata", () => {
    expect(getRoomTemplates("computer").map((template) => template.name)).toEqual(["Computer Laboratory"]);
    expect(getRoomTemplates("", "Laboratory").map((template) => template.name)).toEqual(["Computer Laboratory", "Engineering Laboratory"]);
  });

  it("validates the structural footprint without a furniture collision engine", () => {
    const template = ROOM_TEMPLATES.find((candidate) => candidate.id === "study-room")!;
    expect(validateRoomTemplatePlacement(template, { x: 10, y: 10 }, 500, 500).valid).toBe(true);
    expect(validateRoomTemplatePlacement(template, { x: 400, y: 10 }, 500, 500).valid).toBe(false);
    expect(validateRoomTemplatePlacement(template, { x: 10, y: 10 }, 500, 500, [{ x: 20, y: 20, w: 40, h: 40 }]).reason).toContain("overlaps");
  });

  it("creates fresh editable physical objects for every placement", () => {
    const template = ROOM_TEMPLATES.find((candidate) => candidate.id === "classroom-40")!;
    let sequence = 0;
    const idFactory = (prefix: string) => `${prefix}-${++sequence}`;
    const first = instantiateRoomTemplate(template, { x: 12, y: 18 }, { floorId: "f1", buildingId: "b1", idFactory });
    const firstIds = [first.room.id, ...first.walls.map((wall) => wall.id), ...first.furniture.map((item) => item.id)];
    const second = instantiateRoomTemplate(template, { x: 100, y: 120 }, { floorId: "f1", buildingId: "b1", idFactory });
    const secondIds = [second.room.id, ...second.walls.map((wall) => wall.id), ...second.furniture.map((item) => item.id)];
    expect(first.furniture.filter((item) => item.type === "student-desk-chair")).toHaveLength(40);
    expect(first.walls).toHaveLength(4);
    expect(new Set([...firstIds, ...secondIds]).size).toBe(firstIds.length + secondIds.length);
    expect(first.room).not.toHaveProperty("accessDoorId");
    expect(first.room).toMatchObject({ floorId: "f1", buildingId: "b1", x: 12, y: 18 });
  });

  it("ships curated visual-only Floor starter definitions without navigation infrastructure", () => {
    expect(FLOOR_TEMPLATES.map((template) => template.name)).toEqual(expect.arrayContaining([
      "Academic Classroom Floor",
      "Computer Laboratory Floor",
      "Engineering Laboratory Floor",
      "Office / Administration Floor",
      "Library / Study Floor",
      "Student Services Floor",
    ]));
    const serialized = JSON.stringify(FLOOR_TEMPLATES);
    expect(serialized).not.toMatch(/door|stair|elevator|ramp|navNode|navEdge|pathway/i);
    expect(FLOOR_TEMPLATES.every((template) => template.scope === "floor" && template.source === "builtin")).toBe(true);
    for (const template of FLOOR_TEMPLATES) {
      for (const object of template.objects) {
        if (object.kind !== "room-template") continue;
        const nested = ROOM_TEMPLATES.find((candidate) => candidate.id === object.templateId);
        expect(nested).toBeDefined();
        expect(object.x + nested!.width).toBeLessThanOrEqual(template.canvasWidth);
        expect(object.y + nested!.height).toBeLessThanOrEqual(template.canvasHeight);
      }
    }
  });

  it("filters Floor starters and instantiates a fresh template Floor with appearance", () => {
    expect(getFloorTemplates("computer").map((template) => template.id)).toEqual(["computer-laboratory-floor"]);
    expect(getFloorTemplates("", "Laboratory").map((template) => template.id)).toEqual([
      "computer-laboratory-floor", "engineering-laboratory-floor",
    ]);
    const template = FLOOR_TEMPLATES.find((candidate) => candidate.id === "student-services-floor")!;
    let sequence = 0;
    const idFactory = (prefix: string) => `${prefix}-${++sequence}`;
    const base = createDefaultFloor({ id: "floor-new", buildingId: "b1", number: 4, canvasW: 600, canvasH: 450 });
    const result = instantiateFloorTemplate(template, { baseFloor: base, buildingId: "b1", idFactory });
    expect(result.floor).toMatchObject({ id: "floor-new", buildingId: "b1", number: 4, canvasW: 1180, canvasH: 820 });
    expect(result.floor.appearance).toEqual(template.appearance);
    expect(result.floor.showGrid).toBe(false);
    expect(result.floor.rooms.length).toBeGreaterThan(0);
    expect(result.floor.walls.some((wall) => wall.managedKind === "perimeter" && wall.x2 === 1180)).toBe(true);
    expect(result.floor.doors).toEqual([]);
    expect(result.floor.stairs).toEqual([]);
    expect(result.floor.paths).toEqual([]);
    expect(result.floor).not.toHaveProperty("navNodes");
    expect(result.floor).not.toHaveProperty("navEdges");
  });
});
