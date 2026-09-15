import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabase } from "../../lib/supabase";
import { saveFloorTemplate, saveRoomTemplate } from "../templateService";
import type { FloorPlan } from "../../components/map-builder/types";

vi.mock("../../lib/supabase", () => ({ getSupabase: vi.fn() }));

function fixture(): FloorPlan {
  return {
    id: "floor-1", buildingId: "building-1", number: 1, label: "Ground Floor", canvasW: 400, canvasH: 300,
    rooms: [{ id: "room-1", name: "Office", type: "office", x: 20, y: 20, w: 160, h: 120, floorId: "floor-1", buildingId: "building-1", accessNodeId: "nav-room", accessDoorId: "door-1" }],
    walls: [{ id: "wall-1", x1: 20, y1: 20, x2: 180, y2: 20, thickness: 4, color: "#64748b" }],
    furniture: [{ id: "furniture-1", type: "faculty-desk", name: "Faculty Desk", category: "tables", x: 40, y: 50, width: 50, height: 24, rotation: 0, color: "#7a5c3a" }],
    doors: [{ id: "door-1", x: 20, y: 80, width: 12, direction: "left", color: "#111827" }],
    windows: [], stairs: [], ramps: [], elevators: [], paths: [], labels: [],
  };
}

describe("templateService", () => {
  beforeEach(() => vi.clearAllMocks());

  it("persists an allow-listed Room payload with campus visibility", async () => {
    const inserted = {
      id: "template-1",
      name: "Campus Office",
      description: "Reusable office",
      scope: "room",
      category: "Office",
      source_scope: "campus",
      campus_id: "campus-1",
      created_by: "admin-1",
      template_data: {
        id: "custom-room-template", scope: "room", name: "Campus Office", category: "Office", description: "Reusable office", width: 160, height: 120, tags: ["office"],
        objects: [{ kind: "room", x: 0, y: 0, width: 160, height: 120, type: "office", name: "Office" }],
      },
      preview_metadata: null,
      is_archived: false,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    const insert = vi.fn(() => ({ select: vi.fn(() => ({ single: vi.fn(async () => ({ data: inserted, error: null })) })) }));
    vi.mocked(getSupabase).mockReturnValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: "admin-1" } } })) },
      from: vi.fn(() => ({ insert })),
    } as any);

    const record = await saveRoomTemplate({
      campusId: "campus-1",
      room: fixture().rooms[0],
      floor: fixture(),
      metadata: { name: "Campus Office", description: "Reusable office", category: "Office", source: "campus" },
    });

    expect(record.id).toBe("template-1");
    expect(record.source).toBe("campus");
    const payload = insert.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.campus_id).toBe("campus-1");
    expect(JSON.stringify(payload.template_data)).not.toMatch(/door|navNode|navEdge/i);
  });

  it("persists a Floor template as physical-only campus content", async () => {
    const inserted = {
      id: "template-floor-1",
      name: "Campus Physical Floor",
      description: "Reusable physical floor",
      scope: "floor",
      category: "Other",
      source_scope: "campus",
      campus_id: "campus-1",
      created_by: "admin-1",
      template_data: {
        id: "custom-floor-definition", scope: "floor", name: "Campus Physical Floor", category: "Other", description: "Reusable physical floor",
        width: 400, height: 300, canvasWidth: 400, canvasHeight: 300, appearance: { material: "neutral", texture: "none", color: "#e8e1d7" }, tags: ["custom"], objects: [],
      },
      preview_metadata: null,
      is_archived: false,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    const insert = vi.fn(() => ({ select: vi.fn(() => ({ single: vi.fn(async () => ({ data: inserted, error: null })) })) }));
    vi.mocked(getSupabase).mockReturnValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: "admin-1" } } })) },
      from: vi.fn(() => ({ insert })),
    } as any);

    const record = await saveFloorTemplate({
      campusId: "campus-1",
      floor: fixture(),
      metadata: { name: "Campus Physical Floor", source: "campus" },
    });

    expect(record.scope).toBe("floor");
    const payload = insert.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.scope).toBe("floor");
    expect(payload.campus_id).toBe("campus-1");
    expect(payload.category).toBe("Other");
    expect(JSON.stringify(payload.template_data)).not.toMatch(/navNode|navEdge|walkingPoint|pathway|buildingEntranceId/i);
  });
});
