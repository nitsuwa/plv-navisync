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
  const filters: Array<{ column: string; value: unknown }> = [];
  const query = {
    eq: vi.fn((column: string, value: unknown) => {
      filters.push({ column, value });
      return query;
    }),
    or: vi.fn(() => query),
    order: vi.fn().mockResolvedValue({ data: rows, error: null }),
    single: vi.fn().mockResolvedValue({ data: rows[0] ?? null, error: null }),
  };
  const mapElements = {
    insert: vi.fn((payload: unknown) => ({
      select: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: { id: (payload as { id?: string }).id ?? "10000000-0000-4000-8000-000000000099" }, error: null }) })),
    })),
    select: vi.fn(() => query),
    update: vi.fn((_payload: unknown) => query),
  };
  const activityLogs = { insert: vi.fn().mockResolvedValue({ data: null, error: null }) };
  return {
    mapElements,
    client: {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "org-1" } } }) },
      rpc: vi.fn().mockResolvedValue({ data: { id: "event-1", campusId: "campus-1", updatedAt: "2026-10-02T00:00:00.000Z", metadata: { title: "Student Fair", organizer: "Council", status: "approved", isActive: true, markers: [], restrictedAreas: [], locations: [] } }, error: null }),
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

    const created = await eventOverlayService.createEventOverlay(
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
    const metadata = payload.metadata;
    expect((mapElements.insert.mock.calls[0][0] as { id: string }).id)
      .toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(metadata.id).toBe((mapElements.insert.mock.calls[0][0] as { id: string }).id);
    expect(created.id).toBe(metadata.id);
    expect(payload.metadata.locations).toEqual([
      expect.objectContaining({ locationRef: campusLocation }),
      expect.objectContaining({ locationRef: floorLocation }),
    ]);
    expect(payload.metadata).not.toHaveProperty("dateStart");
    expect(payload.metadata).not.toHaveProperty("dateEnd");
    expect(payload.metadata.status).toBe("draft");
    expect(payload.metadata).not.toHaveProperty("submittedAt");
  });

  it("marks a proposal pending only on submit and records the submission time", async () => {
    const existing = { id: "event-1", metadata: { title: "Student Fair", status: "draft", locations: [] } };
    const { client, mapElements } = makeClient([existing]);
    vi.mocked(getSupabase).mockReturnValue(client as never);
    await eventOverlayService.submitEventOverlayLayout("event-1", []);
    const updated = mapElements.update.mock.calls[0][0] as { metadata: Record<string, unknown> };
    expect(updated.metadata.status).toBe("pending");
    expect(new Date(updated.metadata.submittedAt as string).getTime()).toBeGreaterThan(0);
  });

  it("takes an edited disapproved layout back to draft until it is submitted again", async () => {
    const existing = { id: "event-1", metadata: { title: "Student Fair", status: "disapproved", submittedAt: "2026-09-01T00:00:00.000Z", locations: [] } };
    const { client, mapElements } = makeClient([existing]);
    vi.mocked(getSupabase).mockReturnValue(client as never);
    await eventOverlayService.updateEventOverlayLayout("event-1", []);
    const updated = mapElements.update.mock.calls[0][0] as { metadata: Record<string, unknown> };
    expect(updated.metadata.status).toBe("draft");
    expect(updated.metadata.submittedAt).toBeNull();
  });

  it("refuses to edit a pending layout while the administrator is reviewing it", async () => {
    const existing = { id: "event-1", metadata: { title: "Student Fair", status: "pending", submittedAt: "2026-09-01T00:00:00.000Z", locations: [] } };
    const { client, mapElements } = makeClient([existing]);
    vi.mocked(getSupabase).mockReturnValue(client as never);
    await expect(eventOverlayService.updateEventOverlayLayout("event-1", [])).rejects.toThrow(/locked/i);
    expect(mapElements.update).not.toHaveBeenCalled();
  });

  it("refuses to approve a draft before GSO submission", async () => {
    const existing = { id: "event-1", metadata: { title: "Student Fair", status: "draft", locations: [] } };
    const { client, mapElements } = makeClient([existing]);
    vi.mocked(getSupabase).mockReturnValue(client as never);
    await expect(eventOverlayService.reviewEventOverlay("event-1", "approved")).rejects.toThrow(/refresh this event/i);
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("rejects an invalid runtime review decision before calling the RPC", async () => {
    const { client } = makeClient([{ id: "event-1", metadata: { title: "Student Fair", status: "pending" } }]);
    vi.mocked(getSupabase).mockReturnValue(client as never);
    await expect(eventOverlayService.reviewEventOverlay("event-1", null as never, undefined, { expectedUpdatedAt: "2026-10-02T00:00:00.000Z" })).rejects.toThrow(/invalid review decision/i);
    expect(client.rpc).not.toHaveBeenCalled();
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

  it("returns published upcoming overlays for the requested floor", async () => {
    const { client } = makeClient();
    vi.mocked(client.rpc).mockResolvedValue({ data: { serverNow: "2026-10-08T02:00:00.000Z", events: [{
      id: "event-1", campusId: "campus-1", title: "Approved Fair", description: "", organizer: "Council",
      dateStart: "2026-10-08T01:00:00.000Z", dateEnd: "2026-10-08T09:00:00.000Z", publicationAt: "2026-10-05T01:00:00.000Z",
      status: "approved", isActive: true, locations: [
        { id: "campus", locationRef: campusLocation, eventFurniture: [], eventLabels: [] },
        { id: "science", locationRef: floorLocation, eventFurniture: [], eventLabels: [] },
      ],
    }] }, error: null });
    vi.mocked(getSupabase).mockReturnValue(client as never);

    const overlays = await eventOverlayService.getApprovedOverlaysForFloor("science-f2", "campus-1");
    expect(overlays).toHaveLength(1);
    expect(overlays[0].locationRef).toEqual(floorLocation);
  });
  it("preserves occurrence dates when a layout is saved", async () => {
    const {client, mapElements} = makeClient([{id:"event-1",metadata:{status:"draft",dateStart:"2026-10-01T01:00:00Z",dateEnd:"2026-10-01T03:00:00Z"}}]);
    vi.mocked(getSupabase).mockReturnValue(client as never);
    await eventOverlayService.updateEventOverlayLayout("event-1", []);
    expect((mapElements.update.mock.calls[0][0] as any).metadata.dateEnd).toBe("2026-10-01T03:00:00Z");
  });
  it("sends an approval decision and revision atomically to the database", async () => {
    const {client} = makeClient();
    vi.mocked(getSupabase).mockReturnValue(client as never);
    await eventOverlayService.reviewEventOverlay("event-1", "approved", "Ready", {expectedUpdatedAt:"2026-10-02T00:00:00.000Z",dateStart:"2026-10-08T01:00:00Z",dateEnd:"2026-10-09T01:00:00Z",publicationMode:"schedule",publicationAt:"2026-10-05T01:00:00Z",locationFeedback:{campus:"Keep gate clear"}});
    expect(client.rpc).toHaveBeenCalledWith("review_event_layout", expect.objectContaining({p_overlay_id:"event-1",p_expected_updated_at:"2026-10-02T00:00:00.000Z",p_decision:"approved",p_publication_mode:"schedule",p_publication_at:"2026-10-05T01:00:00Z",p_location_feedback:{campus:"Keep gate clear"}}));
  });
  it("excludes scheduled and expired previews even for their creator", async () => {
    const metadata={status:"approved",isActive:true,locations:[{id:"campus",locationRef:campusLocation,eventFurniture:[],eventLabels:[]}]};
    const {client}=makeClient();
    vi.mocked(client.rpc).mockResolvedValue({ data:{serverNow:"2026-10-08T02:00:00Z",events:[
      {id:"scheduled",campusId:"campus-1",title:"Scheduled",organizer:"OSA",dateStart:"2026-10-09T00:00:00Z",dateEnd:"2026-10-10T00:00:00Z",publicationAt:"2026-10-09T01:00:00Z",locations:[{id:"campus",locationRef:campusLocation,eventFurniture:[],eventLabels:[]}]},
      {id:"expired",campusId:"campus-1",title:"Expired",organizer:"OSA",dateStart:"2020-01-01T00:00:00Z",dateEnd:"2020-01-02T00:00:00Z",publicationAt:"2019-12-30T00:00:00Z",locations:[{id:"campus",locationRef:campusLocation,eventFurniture:[],eventLabels:[]}]},
    ]},error:null });
    vi.mocked(getSupabase).mockReturnValue(client as never);
    expect(await eventOverlayService.listPublishedEventPreviews("campus-1")).toEqual({serverNow:"2026-10-08T02:00:00Z",events:[]});
  });

  it("projects only public event and rendered asset fields from the preview response", async () => {
    const { client } = makeClient();
    vi.mocked(client.rpc).mockResolvedValue({ data: { serverNow: "2026-10-08T02:00:00.000Z", events: [{
      id: "event-public", campusId: "campus-1", title: "Public Fair", description: "Open to students", organizer: "OSA",
      status: "approved", isActive: true, dateStart: "2026-10-08T03:00:00.000Z", dateEnd: "2026-10-08T09:00:00.000Z", publicationAt: "2026-10-05T01:00:00.000Z",
      createdByUserId: "private-user", adminComment: "private review", locationFeedback: { secret: "private" }, privateField: "strip",
      locations: [{ id: "grounds", locationRef: { ...campusLocation, createdByUserId: "private-user" }, adminComment: "private location", privateField: true,
        eventFurniture: [{ id: "chair", type: "chair", name: "Chair", category: "seating", x: 1, y: 2, width: 3, height: 4, rotation: 0, color: "#fff", assetConfig: { style: "wood", owner: "private-owner", privateObject: { value: "strip" } }, createdByUserId: "private-user" }],
        eventLabels: [{ id: "label", x: 1, y: 2, text: "Entrance", fontSize: 12, color: "#000", rotation: 0, adminComment: "strip" }] }],
    }] }, error: null });
    vi.mocked(getSupabase).mockReturnValue(client as never);

    const feed = await eventOverlayService.listPublishedEventPreviews("campus-1");
    expect(feed.events).toHaveLength(1);
    expect(feed.events[0]).not.toHaveProperty("createdByUserId");
    expect(feed.events[0]).not.toHaveProperty("adminComment");
    expect(feed.events[0]).not.toHaveProperty("locationFeedback");
    expect(feed.events[0].locations[0]).not.toHaveProperty("adminComment");
    expect(feed.events[0].locations[0].locationRef).not.toHaveProperty("createdByUserId");
    expect(feed.events[0].locations[0].eventFurniture[0]).not.toHaveProperty("createdByUserId");
    expect(feed.events[0].locations[0].eventFurniture[0].assetConfig).toEqual({ style: "wood" });
    expect(feed.events[0].locations[0].eventLabels[0]).not.toHaveProperty("adminComment");
  });

  it("rejects publication at or after the event end", async () => {
    const {client, mapElements} = makeClient([{id:"event-1",metadata:{status:"pending",dateStart:"2026-10-01T01:00:00Z",dateEnd:"2026-10-01T03:00:00Z"}}]);
    vi.mocked(getSupabase).mockReturnValue(client as never);
    await expect(eventOverlayService.reviewEventOverlay("event-1", "approved", undefined, {expectedUpdatedAt:"2026-10-02T00:00:00.000Z",dateStart:"2026-10-08T01:00:00Z",dateEnd:"2026-10-09T01:00:00Z",publicationMode:"schedule",publicationAt:"2026-10-09T01:00:00Z"})).rejects.toThrow(/before the event ends/i);
    expect(mapElements.update).not.toHaveBeenCalled();
  });

  it("stores the administrator-selected occurrence dates when approving a date-free proposal", async () => {
    const { client } = makeClient([{ id: "event-1", metadata: { status: "pending" } }]);
    vi.mocked(getSupabase).mockReturnValue(client as never);
    await eventOverlayService.reviewEventOverlay("event-1", "approved", undefined, {
      expectedUpdatedAt: "2026-10-02T00:00:00.000Z",
      dateStart: "2026-10-08T01:00:00.000Z",
      dateEnd: "2026-10-08T09:00:00.000Z",
      publicationMode: "schedule",
      publicationAt: "2026-10-05T00:00:00.000Z",
    });
    expect(client.rpc).toHaveBeenCalledWith("review_event_layout", expect.objectContaining({
      p_decision: "approved", p_date_start: "2026-10-08T01:00:00.000Z", p_date_end: "2026-10-08T09:00:00.000Z",
    }));
  });

  it("requires the administrator to explicitly set dates even when a legacy proposal has them", async () => {
    const { client, mapElements } = makeClient([{ id: "event-1", metadata: { status: "pending", dateStart: "2026-10-01T01:00:00Z", dateEnd: "2026-10-01T03:00:00Z" } }]);
    vi.mocked(getSupabase).mockReturnValue(client as never);

    await expect(eventOverlayService.reviewEventOverlay("event-1", "approved", undefined, { expectedUpdatedAt:"2026-10-02T00:00:00.000Z" })).rejects.toThrow(/set the event start and end/i);
    expect(mapElements.update).not.toHaveBeenCalled();
  });

});
