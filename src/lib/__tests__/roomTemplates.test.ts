import { describe, expect, it } from "vitest";
import {
  ROOM_TEMPLATES,
  getRoomTemplates,
  instantiateRoomTemplate,
  validateRoomTemplatePlacement,
} from "../roomTemplates";
import { FLOOR_TEMPLATES, getFloorTemplates } from "../floorTemplates";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
    expect(firstIds.every((id) => UUID_RE.test(id))).toBe(true);
    expect(secondIds.every((id) => UUID_RE.test(id))).toBe(true);
    expect(first.room).not.toHaveProperty("accessDoorId");
    expect(first.room).toMatchObject({ floorId: "f1", buildingId: "b1", x: 12, y: 18 });
  });

  it("keeps the active Floor catalogue user-created only", () => {
    expect(FLOOR_TEMPLATES).toEqual([]);
    expect(getFloorTemplates("computer")).toEqual([]);
    expect(getFloorTemplates("", "Laboratory")).toEqual([]);
  });

});
