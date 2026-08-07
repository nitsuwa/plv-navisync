import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabase } from "../../lib/supabase";
import { listAllReports, toIssueReport, updateReportStatus } from "../reportService";

vi.mock("../../lib/supabase", () => ({ getSupabase: vi.fn() }));

const row = {
  id: "r1",
  campus_id: "c1",
  building_id: "b1",
  floor_id: null,
  reporter_id: "student-1",
  category: "maintenance",
  priority: "medium",
  title: "Broken light",
  description: "Lights out in the hallway",
  status: "pending",
  internal_notes: null,
  resolution_notes: null,
  created_at: "2026-08-07T00:00:00Z",
  updated_at: "2026-08-07T00:00:00Z",
};

describe("report service (admin workflow)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("maps database rows to the domain including admin notes", () => {
    const report = toIssueReport(row as never);
    expect(report).toMatchObject({
      id: "r1",
      buildingId: "b1",
      status: "pending",
      internalNotes: null,
      resolutionNotes: null,
    });
    expect(report.createdAt).toBe("2026-08-07T00:00:00Z");
  });

  it("lists all reports with status + category filters and case-insensitive search", async () => {
    const query: Record<string, unknown> = {};
    query.order = vi.fn(() => query);
    query.eq = vi.fn(() => query);
    query.then = (resolve: (value: unknown) => unknown) =>
      Promise.resolve({ data: [row], error: null }).then(resolve);

    vi.mocked(getSupabase).mockReturnValue({ from: vi.fn(() => ({ select: vi.fn(() => query) })) } as never);

    const reports = await listAllReports({ status: "pending", category: "maintenance", search: "BROKEN" });

    expect(reports).toHaveLength(1);
    expect(query.eq).toHaveBeenCalledWith("status", "pending");
    expect(query.eq).toHaveBeenCalledWith("category", "maintenance");
  });

  it("resolves a report with notes and writes an audit entry", async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn(() => ({ eq }));
    const insert = vi.fn().mockResolvedValue({ error: null });
    const auth = { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "admin-1" } } }) };
    const from = vi.fn((table: string) => {
      if (table === "activity_logs") return { insert };
      return { update };
    });

    vi.mocked(getSupabase).mockReturnValue({ from, auth } as never);

    await updateReportStatus("r1", "resolved", "Fixed the hallway light.");

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "resolved", resolution_notes: "Fixed the hallway light." })
    );
    expect(update.mock.calls[0][0]).toHaveProperty("resolved_at");
    expect(eq).toHaveBeenCalledWith("id", "r1");
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ action: "report.resolved", entity_id: "r1" })
    );
  });
});
