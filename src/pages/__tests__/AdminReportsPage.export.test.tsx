import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminReportsPage } from "../AdminReportsPage";
import { downloadCsv } from "../../lib/exporters";
import type { IssueReport } from "../../services/reportService";

const reportServiceMocks = vi.hoisted(() => ({ listAllReports: vi.fn() }));
const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("../../services/reportService", () => ({
  reportService: { listAllReports: reportServiceMocks.listAllReports },
  REPORT_CATEGORIES: ["broken_equipment"],
}));

vi.mock("../../lib/exporters", () => ({ downloadCsv: vi.fn() }));
vi.mock("../../hooks/useToast", () => ({ useToast: () => toastMocks }));
vi.mock("../../hooks/useEscToClose", () => ({ useEscToClose: vi.fn() }));

const pendingReport: IssueReport = {
  id: "report-pending-001",
  campusId: "campus-qa",
  buildingId: "building-qa",
  buildingName: "QA Hall",
  floorLabel: "Floor 1",
  roomName: "Room 101",
  reporterId: "student-qa",
  reporterName: "QA Student",
  reporterEmail: "student@example.test",
  category: "broken_equipment",
  priority: "high",
  title: "Test report A",
  description: "First test description",
  status: "pending",
  createdAt: "2026-09-29T14:40:27.075Z",
  updatedAt: "2026-09-29T14:40:27.075Z",
};

const resolvedReport: IssueReport = {
  ...pendingReport,
  id: "report-resolved-002",
  title: "Test report B",
  status: "resolved",
};

describe("AdminReportsPage CSV export scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reportServiceMocks.listAllReports.mockImplementation(async ({ status }: { status?: string } = {}) => {
      if (status === "pending") return [pendingReport];
      if (status === "resolved") return [resolvedReport];
      return [pendingReport, resolvedReport];
    });
  });

  it("exports the active status-filtered result set with a descriptive filename", async () => {
    render(<AdminReportsPage />);
    expect(await screen.findByText("Test report A")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Pending/ }));
    await waitFor(() => {
      expect(reportServiceMocks.listAllReports).toHaveBeenLastCalledWith({
        status: "pending",
        category: undefined,
        search: "",
      });
    });
    await screen.findByText("Test report A");

    fireEvent.click(screen.getByRole("button", { name: "Export currently loaded filtered reports as CSV" }));

    await waitFor(() => expect(downloadCsv).toHaveBeenCalledTimes(1));
    const [rows, filename] = vi.mocked(downloadCsv).mock.calls[0];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ "Report ID": pendingReport.id, "Report Title": "Test report A" });
    expect(rows[0]["Report Title"]).not.toBe("Test report B");
    expect(rows[0].Reporter).toBe("QA Student");
    expect(rows[0]).not.toHaveProperty("Reporter Email");
    expect(filename).toMatch(/^PLV_NaviSync_Reports_\d{4}-\d{2}-\d{2}\.csv$/);
  });

  it("does not invoke a download for an empty filtered result", async () => {
    reportServiceMocks.listAllReports.mockResolvedValueOnce([]);
    render(<AdminReportsPage />);
    await screen.findByText("No reports yet");
    expect(screen.getByRole("button", { name: "Export currently loaded filtered reports as CSV" })).toBeDisabled();
    expect(downloadCsv).not.toHaveBeenCalled();
  });

  it("shows an error instead of reporting success when CSV generation throws", async () => {
    vi.mocked(downloadCsv).mockImplementation(() => {
      throw new Error("Download blocked");
    });
    render(<AdminReportsPage />);
    await screen.findByText("Test report A");

    fireEvent.click(screen.getByRole("button", { name: "Export currently loaded filtered reports as CSV" }));

    expect(toastMocks.error).toHaveBeenCalledWith(
      "Export failed",
      "The reports CSV could not be generated. Please try again.",
    );
  });
});
