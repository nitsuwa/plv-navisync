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

  it("resolves a report atomically through the audited workflow RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(getSupabase).mockReturnValue({ rpc } as never);

    await updateReportStatus("r1", "resolved", "Fixed the hallway light.");

    expect(rpc).toHaveBeenCalledWith("update_report_workflow", {
      p_report_id: "r1", p_status: "resolved", p_resolution_notes: "Fixed the hallway light.", p_internal_notes: null,
    });
  });
});
