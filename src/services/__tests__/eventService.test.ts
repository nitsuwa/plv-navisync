import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabase } from "../../lib/supabase";
import { createEvent, listEvents } from "../eventService";

vi.mock("../../lib/supabase", () => ({ getSupabase: vi.fn() }));

const eventRow = {
  id: "ev1",
  campus_id: "c1",
  title: "Tech Summit",
  description: "Annual summit",
  category: "Academic",
  organizer: "CITE",
  starts_at: "2026-09-01T01:00:00Z",
  ends_at: "2026-09-01T05:00:00Z",
  status: "draft",
  cover_image_path: null,
  created_by: "u1",
  created_at: "2026-08-07T00:00:00Z",
  updated_at: "2026-08-07T00:00:00Z",
  archived_at: null,
};

describe("event service (admin workflow)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists events and attaches the venue label from event_locations", async () => {
    const order = vi.fn(() => eventsQuery);
    const eq = vi.fn(() => eventsQuery);
    const eventsQuery: Record<string, unknown> = {
      order,
      eq,
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve({ data: [eventRow], error: null }).then(resolve),
    };
    const inFn = vi.fn(() => locationsQuery);
    const locationsQuery = {
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve({ data: [{ event_id: "ev1", label: "LRC 3F Audio-Visual Room" }], error: null }).then(resolve),
    };
    const from = vi.fn((table: string) =>
      table === "event_locations"
        ? { select: vi.fn(() => ({ in: inFn })) }
        : { select: vi.fn(() => eventsQuery) }
    );

    vi.mocked(getSupabase).mockReturnValue({ from } as never);

    const events = await listEvents({ status: "draft" });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ id: "ev1", status: "draft", venue: "LRC 3F Audio-Visual Room" });
    expect(eq).toHaveBeenCalledWith("status", "draft");
  });

  it("creates an event with a venue location and audit entry", async () => {
    const single = vi.fn().mockResolvedValue({ data: eventRow, error: null });
    const insertEvent = vi.fn(() => ({ select: vi.fn(() => ({ single })) }));
    const insertLocation = vi.fn().mockResolvedValue({ error: null });
    const insertLog = vi.fn().mockResolvedValue({ error: null });
    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: "c1" }, error: null });
    const auth = { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }) };

    const from = vi.fn((table: string) => {
      if (table === "campuses")
        return { select: vi.fn(() => ({ eq: vi.fn(() => ({ is: vi.fn(() => ({ maybeSingle })) })) })) };
      if (table === "events") return { insert: insertEvent };
      if (table === "event_locations") return { insert: insertLocation };
      return { insert: insertLog };
    });

    vi.mocked(getSupabase).mockReturnValue({ from, auth } as never);

    const created = await createEvent({
      title: "Tech Summit",
      category: "Academic",
      venue: "LRC 3F",
      startsAt: "2026-09-01T01:00:00Z",
      endsAt: "2026-09-01T05:00:00Z",
      status: "draft",
    });

    expect(created).toMatchObject({ id: "ev1", venue: "LRC 3F" });
    expect(insertEvent).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Tech Summit", campus_id: "c1", status: "draft", created_by: "u1" })
    );
    expect(insertLocation).toHaveBeenCalledWith({ event_id: "ev1", label: "LRC 3F" });
    expect(insertLog).toHaveBeenCalledWith(expect.objectContaining({ action: "event.create", entity_id: "ev1" }));
  });
});
