import { describe, expect, it } from "vitest";
import { formatManilaDateStamp, formatReportExportTimestamp, toAdminActivityExportRows, toAdminReportExportRows } from "../adminCsvExports";
import type { ActivityLogRow } from "../../services/activityLogService";
import type { IssueReport } from "../../services/reportService";

describe("admin CSV row mapping", () => {
  it("uses stable report columns, Manila timestamps, and omits private notes and email", () => {
    const report: IssueReport = {
      id: "report-000123",
      campusId: "campus-1",
      reporterId: "student-1",
      reporterName: "José Cruz",
      reporterEmail: "jose@example.test",
      category: "accessibility_concern",
      priority: "high",
      title: "Ramp needs repair",
      description: "The ramp surface is uneven,\nand needs attention.",
      status: "under_review",
      internalNotes: "Private admin note",
      resolutionNotes: "Internal resolution note",
      createdAt: "2026-09-29T14:40:27.075Z",
      updatedAt: "2026-09-29T14:41:00.000Z",
    };

    const [row] = toAdminReportExportRows([report]);
    expect(Object.keys(row)).toEqual([
      "Report ID", "Report Title", "Category", "Priority", "Status", "Description",
      "Location", "Floor", "Room", "Submitted At (PHT)", "Submitted At (UTC)", "Reporter",
    ]);
    expect(row["Report ID"]).toBe("report-000123");
    expect(row.Category).toBe("Accessibility Concern");
    expect(row.Status).toBe("Under Review");
    expect(row["Submitted At (PHT)"]).toBe("2026-09-29 22:40:27.075 PHT (UTC+08:00)");
    expect(row["Submitted At (UTC)"]).toBe(report.createdAt);
    expect(row.Reporter).toBe("José Cruz");
    expect(JSON.stringify(row)).not.toContain("jose@example.test");
    expect(JSON.stringify(row)).not.toContain("Private admin note");
    expect(JSON.stringify(row)).not.toContain("Internal resolution note");
  });

  it("preserves an invalid report timestamp instead of silently dropping it", () => {
    expect(formatReportExportTimestamp("not-a-date")).toBe("not-a-date");
  });

  it("uses the Manila calendar date in filenames around UTC midnight", () => {
    expect(formatManilaDateStamp(new Date("2026-09-29T16:30:00.000Z"))).toBe("2026-09-30");
  });

  it("exports only explicit activity fields with the original UTC timestamp", () => {
    const log = {
      id: "audit-000123",
      action: "report.under_review",
      actor_id: "admin-1",
      campus_id: "campus-1",
      entity_type: "report",
      entity_id: "report-1",
      metadata: { private_token: "do-not-export", actor_name: "QA Admin", target_name: "Student Name Protected" },
      created_at: "2026-09-29T14:40:27.075Z",
    } as ActivityLogRow;

    const [row] = toAdminActivityExportRows([log], new Map([
      [log.id, { actorName: "QA Admin", campusName: "QA Campus", targetName: "Student Name Protected" }],
    ]));
    expect(Object.keys(row)).toEqual([
      "Date & Time (UTC)", "Activity", "Category", "Description", "Performed By", "Campus", "Action Code", "Record ID",
    ]);
    expect(row["Date & Time (UTC)"]).toBe(log.created_at);
    expect(row["Performed By"]).toBe("QA Admin");
    expect(row.Campus).toBe("QA Campus");
    expect(row["Action Code"]).toBe(log.action);
    expect(row["Record ID"]).toBe(log.id);
    expect(JSON.stringify(row)).not.toContain("do-not-export");
    expect(JSON.stringify(row)).not.toContain("Student Name Protected");
    expect(row.Description).toContain("A report is being reviewed");
  });

  it("returns an empty row set for empty visible datasets", () => {
    expect(toAdminReportExportRows([])).toEqual([]);
    expect(toAdminActivityExportRows([], new Map())).toEqual([]);
  });
});
