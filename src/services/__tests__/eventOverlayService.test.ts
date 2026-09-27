import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabase } from "../../lib/supabase";
import { campusService, resolveActiveCampusId } from "../campusService";
import { eventOverlayService } from "../eventOverlayService";

vi.mock("../../lib/supabase", () => ({ getSupabase: vi.fn() }));
vi.mock("../campusService", () => ({
  resolveActiveCampusId: vi.fn(),
  campusService: { listPublishedSnapshots: vi.fn() },
}));
vi.mock("../activityLogService", () => ({ logActivity: vi.fn().mockResolvedValue(undefined) }));

const campusLocation = { type: "campus" as const, label: "Campus Grounds" };
const floorLocation = {
  type: "building" as const,
  buildingId: "science",
  floorId: "science-f2",
  label: "Science Building — Floor 2",
};

function makeClient(rows: unknown[] = []) {
  const inserted = { id: "persisted-event-1" };
  const filters: Array<{ column: string; value: unknown }> = [];
  const query = {
    eq: vi.fn((column: string, value: unknown) => {
      filters.push({ column, value });
      return query;
    }),
    order: vi.fn().mockResolvedValue({ data: rows, error: null }),
    single: vi.fn().mockResolvedValue({ data: rows[0] ?? null, error: null }),
  };
  const mapElements = {
    insert: vi.fn(() => ({
      select: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: inserted, error: null }) })),
    })),
    select: vi.fn(() => query),
  };
  const activityLogs = { insert: vi.fn().mockResolvedValue({ data: null, error: null }) };
  return {
    mapElements,
    client: {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "org-1" } } }) },
      from: vi.fn((table: string) => table === "map_elements" ? mapElements : activityLogs),
    },
    filters,
  };
}

function publishedCampus(id: string) {
  return {
    id,
    name: `Campus ${id}`,
    buildings: [{
      id: "science",
      name: "Science Building",
      visible: true,
      floors: [{ id: "science-floor-2", buildingId: "science", number: 2, label: "Floor 2", rooms: [] }],
    }],
  } as never;
}

describe("event overlay service", () => {
  beforeEach(() => {
    vi.mocked(resolveActiveCampusId).mockResolvedValue("campus-1");
    vi.mocked(campusService.listPublishedSnapshots).mockResolvedValue([publishedCampus("campus-1")]);
  });

  it("creates a date-free overlay containing every requested location", async () => {
    const { client, mapElements } = makeClient();
    vi.mocked(getSupabase).mockReturnValue(client as never);

    await eventOverlayService.createEventOverlay(
      {
        title: "Student Fair",
        description: "Two-part event",
        organizer: "Council",
        locations: [
          { locationRef: campusLocation, eventFurniture: [], eventLabels: [] },
          { locationRef: floorLocation, eventFurniture: [], eventLabels: [] },
        ],
      },
      "org-1",
      "campus-1"
    );

    const payload = mapElements.insert.mock.calls[0][0] as { metadata: Record<string, unknown> };
    expect(payload.metadata.locations).toEqual([
      expect.objectContaining({ locationRef: campusLocation }),
      expect.objectContaining({ locationRef: floorLocation }),
    ]);
    expect(payload.metadata).not.toHaveProperty("dateStart");
    expect(payload.metadata).not.toHaveProperty("dateEnd");
  });

  it("creates and lists proposals against the exact published campus chosen by the student", async () => {
    const { client, mapElements, filters } = makeClient([{
      id: "persisted-event-1",
      campus_id: "campus-ui-choice",
      metadata: { title: "Student Fair", organizer: "Council", locations: [] },
    }]);
    vi.mocked(getSupabase).mockReturnValue(client as never);
    vi.mocked(campusService.listPublishedSnapshots).mockResolvedValue([publishedCampus("campus-ui-choice")]);

    const created = await eventOverlayService.createEventOverlay({
      title: "Student Fair",
      description: "",
      organizer: "Council",
      locations: [{ locationRef: floorLocation, eventFurniture: [], eventLabels: [] }],
    }, "org-1", "campus-ui-choice");
    await eventOverlayService.listEventOverlays({ campusId: "campus-ui-choice", createdByUserId: "org-1" });

    const insertPayload = mapElements.insert.mock.calls[0][0] as { campus_id: string };
    expect(insertPayload.campus_id).toBe("campus-ui-choice");
    expect(created.campusId).toBe("campus-ui-choice");
    expect(filters).toContainEqual({ column: "campus_id", value: "campus-ui-choice" });
    expect(resolveActiveCampusId).not.toHaveBeenCalled();
  });

  it("rejects proposal creation if the selected campus is no longer published", async () => {
    const { client } = makeClient();
    vi.mocked(getSupabase).mockReturnValue(client as never);
    vi.mocked(campusService.listPublishedSnapshots).mockResolvedValue([publishedCampus("other-campus")]);

    await expect(eventOverlayService.createEventOverlay({
      title: "Student Fair",
      organizer: "Council",
      locations: [{ locationRef: floorLocation, eventFurniture: [], eventLabels: [] }],
    }, "org-1", "campus-ui-choice")).rejects.toThrow(/published campus/i);
    expect(client.from("map_elements").insert).not.toHaveBeenCalled();
  });

  it("returns approved overlays for a requested floor without date filtering", async () => {
    const { client } = makeClient([
      {
        id: "event-1",
        metadata: {
          kind: "event_overlay",
          title: "Approved Fair",
          status: "approved",
          isActive: true,
          locations: [
            { id: "campus", locationRef: campusLocation, eventFurniture: [], eventLabels: [] },
            { id: "science", locationRef: floorLocation, eventFurniture: [], eventLabels: [] },
          ],
        },
      },
    ]);
    vi.mocked(getSupabase).mockReturnValue(client as never);

    const overlays = await eventOverlayService.getApprovedOverlaysForFloor("science-f2");
    expect(overlays).toHaveLength(1);
    expect(overlays[0].locationRef).toEqual(floorLocation);
  });
});
