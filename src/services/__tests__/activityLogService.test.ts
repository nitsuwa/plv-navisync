import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabase } from "../../lib/supabase";
import {
  clearAdminActivityHistory,
  listActivityLogs,
  listVisibleActivityHistory,
  logActivity,
  resolveActivityPresentationContexts,
  type ActivityLogRow,
} from "../activityLogService";

vi.mock("../../lib/supabase", () => ({ getSupabase: vi.fn() }));

describe("activity log service", () => {
  beforeEach(() => vi.clearAllMocks());

  it("writes an audit entry using the current user as actor", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const auth = { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "admin-1" } } }) };
    vi.mocked(getSupabase).mockReturnValue({ from: vi.fn(() => ({ insert })), auth } as never);

    await logActivity({ action: "report.resolved", entityType: "report", entityId: "r1" });

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "report.resolved",
        actor_id: "admin-1",
        entity_type: "report",
        entity_id: "r1",
      })
    );
  });

  it("lists entries newest first with entity and date filters", async () => {
    const query: Record<string, unknown> = {};
    query.order = vi.fn(() => query);
    query.eq = vi.fn(() => query);
    query.gte = vi.fn(() => query);
    query.lte = vi.fn(() => query);
    query.limit = vi.fn(() => query);
    query.then = (resolve: (value: unknown) => unknown) =>
      Promise.resolve({ data: [{ id: "log1" }], error: null }).then(resolve);

    vi.mocked(getSupabase).mockReturnValue({ from: vi.fn(() => ({ select: vi.fn(() => query) })) } as never);

    const rows = await listActivityLogs({ entityType: "report", entityId: "r1", from: "2026-01-01", limit: 10 });

    expect(rows).toEqual([{ id: "log1" }]);
    expect(query.eq).toHaveBeenCalledWith("entity_type", "report");
    expect(query.eq).toHaveBeenCalledWith("entity_id", "r1");
    expect(query.gte).toHaveBeenCalledWith("created_at", "2026-01-01");
    expect(query.limit).toHaveBeenCalledWith(10);
  });

  it("applies the authenticated admin's saved clear cutoff to the visible history", async () => {
    const cutoff = "2026-09-29T14:40:27.075Z";
    const preferenceQuery = { maybeSingle: vi.fn().mockResolvedValue({ data: { activity_cleared_before: cutoff }, error: null }) };
    const preferenceEq = vi.fn(() => preferenceQuery);
    const logQuery: Record<string, unknown> = {};
    for (const method of ["order", "eq", "in", "gte", "gt", "lte", "limit"]) logQuery[method] = vi.fn(() => logQuery);
    logQuery.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [{ id: "new-log" }], error: null }).then(resolve);
    const from = vi.fn((table: string) => table === "admin_activity_preferences"
      ? { select: vi.fn(() => ({ eq: preferenceEq })) }
      : { select: vi.fn(() => logQuery) });
    vi.mocked(getSupabase).mockReturnValue({
      from,
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "admin-1" } }, error: null }) },
    } as never);

    const result = await listVisibleActivityHistory({ entityTypes: ["event", "event_overlay"], limit: 50 });

    expect(result).toMatchObject({ rows: [{ id: "new-log" }], clearedBefore: cutoff });
    expect(preferenceEq).toHaveBeenCalledWith("admin_id", "admin-1");
    expect(logQuery.gt).toHaveBeenCalledWith("created_at", cutoff);
    expect(logQuery.in).toHaveBeenCalledWith("entity_type", ["event", "event_overlay"]);
  });

  it("shows historical audit rows when the optional clear-history migration is not installed", async () => {
    const preferenceQuery = { maybeSingle: vi.fn().mockResolvedValue({
      data: null,
      error: { code: "PGRST205", message: "Could not find the table 'public.admin_activity_preferences' in the schema cache" },
    }) };
    const logQuery: Record<string, unknown> = {};
    for (const method of ["order", "eq", "in", "gte", "gt", "lte", "limit"]) logQuery[method] = vi.fn(() => logQuery);
    const historical = { id: "old-log", action: "campus_version.published" };
    logQuery.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [historical], error: null }).then(resolve);
    const from = vi.fn((table: string) => table === "admin_activity_preferences"
      ? { select: vi.fn(() => ({ eq: vi.fn(() => preferenceQuery) })) }
      : { select: vi.fn(() => logQuery) });
    vi.mocked(getSupabase).mockReturnValue({
      from,
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "admin-1" } }, error: null }) },
    } as never);

    const result = await listVisibleActivityHistory({ limit: 50 });

    expect(result).toEqual({ rows: [historical], clearedBefore: null });
    expect(logQuery.gt).not.toHaveBeenCalled();
  });

  it("treats a missing clear-history row as no cutoff and leaves existing activity visible", async () => {
    const preferenceQuery = { maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) };
    const logQuery: Record<string, unknown> = {};
    for (const method of ["order", "eq", "in", "gte", "gt", "lte", "limit"]) logQuery[method] = vi.fn(() => logQuery);
    const historical = { id: "old-log", action: "event_overlay.approved" };
    logQuery.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [historical], error: null }).then(resolve);
    const from = vi.fn((table: string) => table === "admin_activity_preferences"
      ? { select: vi.fn(() => ({ eq: vi.fn(() => preferenceQuery) })) }
      : { select: vi.fn(() => logQuery) });
    vi.mocked(getSupabase).mockReturnValue({
      from,
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "admin-1" } }, error: null }) },
    } as never);

    const result = await listVisibleActivityHistory({ limit: 50 });

    expect(result).toEqual({ rows: [historical], clearedBefore: null });
    expect(logQuery.gt).not.toHaveBeenCalled();
  });

  it("uses batched context lookup rows for human-readable activity details", async () => {
    const resultRows: Record<string, unknown[]> = {
      profiles: [{ id: "admin-1", first_name: "Demo", last_name: "Administrator" }],
      campuses: [{ id: "campus-1", name: "Main Campus" }],
      map_elements: [{ id: "overlay-1", name: "College Week", metadata: {} }],
      reports: [],
      events: [],
      announcements: [],
    };
    const from = vi.fn((table: string) => {
      const data = resultRows[table] ?? [];
      const query: Record<string, unknown> = {
        in: vi.fn(() => query),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve),
      };
      return { select: vi.fn(() => query) };
    });
    vi.mocked(getSupabase).mockReturnValue({ from } as never);
    const row = {
      id: "log-1",
      action: "event_overlay.approved",
      actor_id: "admin-1",
      campus_id: "campus-1",
      entity_type: "event_overlay",
      entity_id: "overlay-1",
      metadata: null,
      created_at: "2026-09-29T14:40:27Z",
    } as ActivityLogRow;

    const contexts = await resolveActivityPresentationContexts([row]);

    expect(contexts.get("log-1")).toEqual({
      actorName: "Demo Administrator",
      campusName: "Main Campus",
      targetName: "College Week",
    });
  });

  it("clears only the per-admin view preference and never calls the audit table", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "2026-09-29T14:40:27.075Z", error: null });
    const from = vi.fn();
    vi.mocked(getSupabase).mockReturnValue({ rpc, from } as never);

    await clearAdminActivityHistory();

    expect(rpc).toHaveBeenCalledWith("clear_admin_activity_history");
    expect(from).not.toHaveBeenCalled();
  });
});
