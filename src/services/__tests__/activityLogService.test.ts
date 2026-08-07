import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabase } from "../../lib/supabase";
import { listActivityLogs, logActivity } from "../activityLogService";

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
});
