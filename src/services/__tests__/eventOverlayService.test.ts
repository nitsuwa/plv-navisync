import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabase } from "../../lib/supabase";
import { resolveActiveCampusId } from "../campusService";
import { eventOverlayService } from "../eventOverlayService";

vi.mock("../../lib/supabase", () => ({ getSupabase: vi.fn() }));
vi.mock("../campusService", () => ({ resolveActiveCampusId: vi.fn() }));
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
  const mapElements = {
    insert: vi.fn(() => ({
      select: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: inserted, error: null }) })),
    })),
    select: vi.fn(() => ({
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: rows, error: null }),
      single: vi.fn().mockResolvedValue({ data: rows[0] ?? null, error: null }),
    })),
  };
  const activityLogs = { insert: vi.fn().mockResolvedValue({ data: null, error: null }) };
  return {
    mapElements,
    client: {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "org-1" } } }) },
      from: vi.fn((table: string) => table === "map_elements" ? mapElements : activityLogs),
    },
  };
}

describe("event overlay service", () => {
  beforeEach(() => {
    vi.mocked(resolveActiveCampusId).mockResolvedValue("campus-1");
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
      "org-1"
    );

    const payload = mapElements.insert.mock.calls[0][0] as { metadata: Record<string, unknown> };
    expect(payload.metadata.locations).toEqual([
      expect.objectContaining({ locationRef: campusLocation }),
      expect.objectContaining({ locationRef: floorLocation }),
    ]);
    expect(payload.metadata).not.toHaveProperty("dateStart");
    expect(payload.metadata).not.toHaveProperty("dateEnd");
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
