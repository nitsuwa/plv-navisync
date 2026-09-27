import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabase } from "../../lib/supabase";
import { archiveReport, countPendingReports, getReportHistory, getStudentReports, listAllReports, submitReport, updateReportInternalNotes, updateReportStatus, validateReportImage } from "../reportService";

vi.mock("../../lib/supabase", () => ({ getSupabase: vi.fn() }));
const row = { id: "r1", campus_id: "c1", building_id: "b1", floor_id: "f1", map_element_id: "room1", reporter_id: "student-a", category: "electrical_issue", priority: "normal", title: "Broken light", description: "Needs repair", status: "pending", internal_notes: "Legacy secret", resolution_notes: null, created_at: "2026-09-26T00:00:00Z", updated_at: "2026-09-26T00:00:00Z" };
const input = { campusId: "c1", buildingId: "b1", floorId: "f1", roomId: "room1", category: "electrical_issue", title: "Broken light", description: "Needs repair" };
function query(data: unknown[] = [], error: unknown = null) {
  const q: any = { then: (resolve: any) => Promise.resolve({ data, error, count: data.length }).then(resolve), single: vi.fn(async () => ({ data: data[0] ?? null, error })) };
  for (const method of ["select", "insert", "update", "upsert", "eq", "in", "is", "order"]) q[method] = vi.fn(() => q);
  return q;
}
function client(rows: unknown[] = [row], imageRows: unknown[] = [{ report_id: "r1", storage_path: "r1/photo.png" }]) {
  const queries: Record<string, ReturnType<typeof query>> = {
    reports: query(rows), buildings: query([{ id: "b1", name: "Student Center" }]), floors: query([{ id: "f1", name: "Second Floor" }]),
    map_elements: query([{ id: "room1", name: "Copy Shop" }]), report_admin_notes: query([{ report_id: "r1", notes: "Private staff note" }]),
    report_images: query(imageRows), report_history: query([{ id: "h1", report_id: "r1", action: "report.resolved", new_status: "resolved", note: "Fixed", created_at: row.created_at }]), activity_logs: query([]),
  };
  const mock = {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: "student-a" } }, error: null })) },
    from: vi.fn((table: string) => queries[table]),
    storage: { from: vi.fn(() => ({ upload: vi.fn(async () => ({ error: null })), createSignedUrl: vi.fn(async () => ({ data: { signedUrl: "https://signed/photo" }, error: null })), remove: vi.fn(async () => ({ error: null })) })) },
  };
  vi.mocked(getSupabase).mockReturnValue(mock as never);
  return { mock, queries };
}
describe("report reliability and privacy", () => {
  beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); });
  it("rejects DB failures without claiming success or caching a report", async () => {
    const { queries } = client();
    queries.reports.single.mockResolvedValue({ data: null, error: { message: "Permission denied" } });
    await expect(submitReport(input)).rejects.toThrow("Permission denied");
    expect(localStorage.length).toBe(0);
  });
  it("requires authentication before inserting", async () => {
    const { mock } = client();
    mock.auth.getUser.mockResolvedValue({ data: { user: null }, error: null } as never);
    await expect(submitReport(input)).rejects.toThrow("Sign in");
    expect(mock.from).not.toHaveBeenCalled();
  });
  it("persists exact room and floor with normal priority and canonical category", async () => {
    const { queries } = client();
    await submitReport({ ...input, category: "hazard", priority: "urgent" });
    expect(queries.reports.insert).toHaveBeenCalledWith(expect.objectContaining({ floor_id: "f1", map_element_id: "room1", priority: "normal", category: "safety_concern" }));
  });
  it("does not leak legacy caches or private notes to students", async () => {
    localStorage.setItem("plv_student_submitted_reports_v1", JSON.stringify([{ id: "other", reporterId: "student-b" }]));
    const { queries, mock } = client();
    const reports = await getStudentReports();
    expect(reports.map(r => r.id)).toEqual(["r1"]);
    expect(reports[0]).not.toHaveProperty("internalNotes");
    expect(queries.reports.eq).toHaveBeenCalledWith("reporter_id", "student-a");
    expect(queries.reports.select.mock.calls[0][0]).not.toContain("internal_notes");
    expect(mock.from).not.toHaveBeenCalledWith("report_admin_notes");
  });
  it("hydrates admin room, floor, building, image, and private notes before searching", async () => {
    const { queries } = client();
    const reports = await listAllReports({ search: "Copy Shop" });
    expect(reports[0]).toMatchObject({ buildingName: "Student Center", floorLabel: "Second Floor", roomName: "Copy Shop", imageUrl: "https://signed/photo", internalNotes: "Private staff note" });
    expect(queries.reports.is).toHaveBeenCalledWith("archived_at", null);
  });
  it("keeps reports visible when the optional admin-notes table is not deployed", async () => {
    const { queries } = client();
    queries.report_admin_notes.then = (resolve: any) => Promise.resolve({
      data: null,
      error: { code: "PGRST205", message: "Could not find the table 'public.report_admin_notes' in the schema cache" },
    }).then(resolve);

    const reports = await listAllReports();

    expect(reports).toHaveLength(1);
    expect(reports[0].id).toBe("r1");
    expect(reports[0].internalNotes).toBeNull();
  });
  it("does not hide non-missing-table admin-notes errors", async () => {
    const { queries } = client();
    queries.report_admin_notes.then = (resolve: any) => Promise.resolve({
      data: null,
      error: { code: "42501", message: "permission denied for table report_admin_notes" },
    }).then(resolve);

    await expect(listAllReports()).rejects.toThrow("Admin notes could not be loaded");
  });
  it("does not request signed URLs for legacy fixture image placeholders", async () => {
    const { mock } = client([row], [{ report_id: "r1", storage_path: "r1/fixture.png" }]);

    const reports = await listAllReports();

    expect(mock.storage.from).not.toHaveBeenCalled();
    expect(reports[0].imageUrl).toBeNull();
  });
  it("excludes archived reports from student history and pending badge", async () => {
    const { queries } = client();
    await getStudentReports(); await countPendingReports();
    expect(queries.reports.is).toHaveBeenCalledTimes(2);
    expect(queries.reports.is).toHaveBeenCalledWith("archived_at", null);
  });
  it("reads admin history from the same lifecycle table as student history", async () => {
    const { mock } = client();
    await getReportHistory("r1");
    expect(mock.from).toHaveBeenCalledWith("report_history");
    expect(mock.from).not.toHaveBeenCalledWith("activity_logs");
  });
  it("rejects zero-row status updates and archives", async () => {
    const { queries } = client([]);
    await expect(updateReportStatus("missing", "under_review")).rejects.toThrow("not found");
    await expect(archiveReport("missing")).rejects.toThrow("not found");
    expect(queries.activity_logs.insert).not.toHaveBeenCalled();
  });
  it("requires resolution notes and clears resolved timestamp when reopening", async () => {
    const { queries } = client();
    await expect(updateReportStatus("r1", "resolved", "  ")).rejects.toThrow("required");
    await updateReportStatus("r1", "in_progress");
    expect(queries.reports.update).toHaveBeenCalledWith(expect.objectContaining({ resolved_at: null }));
  });
  it("stores private notes only in the protected table", async () => {
    const { queries } = client();
    await updateReportInternalNotes("r1", " New note ");
    expect(queries.report_admin_notes.upsert).toHaveBeenCalledWith(expect.objectContaining({ report_id: "r1", notes: "New note" }), { onConflict: "report_id" });
    expect(queries.reports.update).not.toHaveBeenCalled();
  });
  it("explains that private admin notes need the reporting migration", async () => {
    const { queries } = client();
    queries.report_admin_notes.single.mockResolvedValue({
      data: null,
      error: { code: "PGRST205", message: "Could not find the table 'public.report_admin_notes' in the schema cache" },
    });

    await expect(updateReportInternalNotes("r1", "Staff-only note"))
      .rejects.toThrow("unavailable until the reporting migration is applied");
  });
  it("warns about failed photo attachment without treating the saved report as failed", async () => {
    const { queries } = client();
    queries.report_images.insert.mockRejectedValue(new Error("Network disconnected"));
    const report = await submitReport({ ...input, imageFile: new Blob(["photo"], { type: "image/png" }) });
    expect(report.id).toBe("r1");
    expect(report.submissionWarning).toContain("report was saved");
  });
  it("validates image format and size", () => {
    expect(() => validateReportImage(new Blob(["x"], { type: "image/svg+xml" }))).toThrow("JPG");
    expect(() => validateReportImage(new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], { type: "image/png" }))).toThrow("5 MB");
  });
  it("propagates report read errors instead of returning a misleading empty history", async () => {
    const { queries } = client();
    queries.reports.then = (resolve: any) => Promise.resolve({ data: null, error: new Error("Network unavailable") }).then(resolve);
    await expect(getStudentReports()).rejects.toThrow("Network unavailable");
  });
});
