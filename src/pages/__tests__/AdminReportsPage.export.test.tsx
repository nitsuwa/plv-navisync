import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminReportsPage } from "../AdminReportsPage";
import { downloadCsv } from "../../lib/exporters";
import type { IssueReport } from "../../services/reportService";

const reportServiceMocks = vi.hoisted(() => ({ listAllReports: vi.fn(), updateReportStatus: vi.fn() }));
const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

beforeAll(() => {
  HTMLElement.prototype.scrollIntoView = vi.fn();
});

vi.mock("../../services/reportService", () => ({
  reportService: {
    listAllReports: reportServiceMocks.listAllReports,
    updateReportStatus: reportServiceMocks.updateReportStatus,
  },
  REPORT_CATEGORIES: ["broken_equipment", "water_leak"],
}));

vi.mock("../../lib/exporters", () => ({ downloadCsv: vi.fn() }));
vi.mock("../../hooks/useToast", () => ({ useToast: () => toastMocks }));
vi.mock("../../hooks/useEscToClose", () => ({ useEscToClose: vi.fn() }));

const pendingReport: IssueReport = {
  id: "report-pending-001",
  campusId: "campus-qa",
  buildingId: null,
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
  buildingName: "West Annex",
  reporterId: "student-qa-b",
  reporterName: "QA Reporter B",
  category: "water_leak",
  title: "Water leak at West Annex",
  status: "resolved",
};

const underReviewReport: IssueReport = {
  ...pendingReport,
  status: "under_review",
  updatedAt: "2026-09-30T14:40:27.075Z",
};

const brokenEquipmentUnderReviewReport: IssueReport = {
  ...underReviewReport,
  id: "report-under-review-broken-002",
  title: "Broken equipment awaiting review",
};

const waterLeakUnderReviewReport: IssueReport = {
  ...brokenEquipmentUnderReviewReport,
  id: "report-under-review-water-003",
  category: "water_leak",
  title: "Water leak awaiting review",
};

const secondWaterLeakUnderReviewReport: IssueReport = {
  ...waterLeakUnderReviewReport,
  id: "report-under-review-water-004",
  title: "Second water leak awaiting review",
};

describe("AdminReportsPage CSV export scope", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    reportServiceMocks.listAllReports.mockResolvedValue([pendingReport, resolvedReport]);
    reportServiceMocks.updateReportStatus.mockResolvedValue(undefined);
  });

  it("aligns report status, date, and details action together on wide layouts", async () => {
    render(<AdminReportsPage />);

    const action = await screen.findByRole("button", { name: "View report: Test report A" });
    const summary = action.parentElement;

    expect(summary).toHaveClass("lg:flex-row");
    expect(summary).toHaveClass("lg:items-center");
    expect(summary).toHaveClass("flex-wrap");
  });

  it("filters the loaded reports locally while keeping summary counts global", async () => {
    render(<AdminReportsPage />);

    await screen.findByRole("button", { name: "View report: Test report A" });
    await screen.findByRole("button", { name: "View report: Water leak at West Annex" });
    expect(reportServiceMocks.listAllReports).toHaveBeenCalledTimes(1);
    expect(reportServiceMocks.listAllReports).toHaveBeenCalledWith();

    fireEvent.click(screen.getByRole("button", { name: /^Pending\s*1$/ }));

    expect(screen.getByRole("button", { name: "View report: Test report A" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "View report: Water leak at West Annex" })).not.toBeInTheDocument();
    expect(screen.getByText("Total Reports").previousElementSibling).toHaveTextContent("2");
    expect(screen.getByRole("button", { name: /^Pending\s*1$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Resolved\s*1$/ })).toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "Search" }), { target: { value: "QA Reporter B" } });
    expect(await screen.findByText("No matching reports")).toBeInTheDocument();
    expect(reportServiceMocks.listAllReports).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    fireEvent.click(screen.getByRole("button", { name: /^All\s*2$/ }));
    fireEvent.change(screen.getByRole("textbox", { name: "Search" }), { target: { value: "QA Reporter B" } });

    expect(await screen.findByRole("button", { name: "View report: Water leak at West Annex" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "View report: Test report A" })).not.toBeInTheDocument();
    expect(reportServiceMocks.listAllReports).toHaveBeenCalledTimes(1);
  });

  it("uses the themed category selector to filter the loaded reports locally", async () => {
    render(<AdminReportsPage />);

    await screen.findByRole("button", { name: "View report: Test report A" });
    const categoryTrigger = screen.getByRole("combobox", { name: "Filter reports by category" });
    fireEvent.keyDown(categoryTrigger, { key: "ArrowDown" });
    fireEvent.click(await screen.findByRole("option", { name: "Water Leak" }));

    expect(await screen.findByRole("button", { name: "View report: Water leak at West Annex" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "View report: Test report A" })).not.toBeInTheDocument();
    expect(reportServiceMocks.listAllReports).toHaveBeenCalledTimes(1);
  });

  it("updates status tab counts to match the selected category and search", async () => {
    reportServiceMocks.listAllReports.mockResolvedValueOnce([
      pendingReport,
      brokenEquipmentUnderReviewReport,
      waterLeakUnderReviewReport,
      secondWaterLeakUnderReviewReport,
      resolvedReport,
    ]);
    render(<AdminReportsPage />);

    expect(await screen.findByRole("button", { name: /^Under Review\s*3$/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Under Review\s*3$/ }));
    expect(screen.getAllByRole("button", { name: /^View report:/ })).toHaveLength(3);

    const categoryTrigger = screen.getByRole("combobox", { name: "Filter reports by category" });
    fireEvent.keyDown(categoryTrigger, { key: "ArrowDown" });
    fireEvent.click(await screen.findByRole("option", { name: "Broken Equipment" }));

    expect(await screen.findByRole("button", { name: "View report: Broken equipment awaiting review" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^View report:/ })).toHaveLength(1);
    expect(screen.getByRole("button", { name: /^All\s*2$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Pending\s*1$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Under Review\s*1$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Resolved\s*0$/ })).toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "Search" }), { target: { value: "Broken equipment awaiting review" } });

    expect(screen.getByRole("button", { name: /^All\s*1$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Pending\s*0$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Under Review\s*1$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Resolved\s*0$/ })).toBeInTheDocument();
    expect(reportServiceMocks.listAllReports).toHaveBeenCalledTimes(1);
  });

  it("keeps the last loaded rows visible when a background refresh fails and can retry", async () => {
    let rejectRefresh: ((reason: Error) => void) | undefined;
    reportServiceMocks.listAllReports
      .mockResolvedValueOnce([pendingReport, resolvedReport])
      .mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectRefresh = reject; }))
      .mockResolvedValueOnce([underReviewReport, resolvedReport]);
    render(<AdminReportsPage />);

    await screen.findByRole("button", { name: "View report: Test report A" });
    fireEvent.click(screen.getByRole("button", { name: "View report: Test report A" }));
    fireEvent.click(await screen.findByRole("button", { name: "Start review" }));
    fireEvent.click(screen.getByRole("button", { name: "Start review" }));
    await waitFor(() => expect(reportServiceMocks.listAllReports).toHaveBeenCalledTimes(2));

    const rowVisibleWhileRefreshing = Boolean(screen.queryByRole("button", { name: "View report: Test report A" }));
    const updatingCueVisible = Boolean(screen.queryByText("Updating reports…"));
    rejectRefresh?.(new Error("Refresh unavailable"));

    expect(await screen.findByText("Couldn't refresh reports. Showing the last loaded results.")).toBeInTheDocument();
    const rowVisibleAfterFailure = Boolean(screen.queryByRole("button", { name: "View report: Test report A" }));
    fireEvent.click(screen.getByRole("button", { name: "Close modal" }));
    fireEvent.click(screen.getByRole("button", { name: "Retry refresh" }));
    await waitFor(() => expect(reportServiceMocks.listAllReports).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());

    expect(rowVisibleWhileRefreshing).toBe(true);
    expect(updatingCueVisible).toBe(true);
    expect(rowVisibleAfterFailure).toBe(true);
    expect(screen.getByRole("button", { name: "View report: Test report A" })).toBeInTheDocument();
  });

  it("exports the active status-filtered result set with a descriptive filename", async () => {
    render(<AdminReportsPage />);
    expect(await screen.findByRole("button", { name: "View report: Test report A" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Pending/ }));
    await screen.findByRole("button", { name: "View report: Test report A" });
    expect(screen.queryByRole("button", { name: "View report: Water leak at West Annex" })).not.toBeInTheDocument();
    expect(reportServiceMocks.listAllReports).toHaveBeenCalledTimes(1);

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
    await screen.findByRole("button", { name: "View report: Test report A" });

    fireEvent.click(screen.getByRole("button", { name: "Export currently loaded filtered reports as CSV" }));

    expect(toastMocks.error).toHaveBeenCalledWith(
      "Export failed",
      "The reports CSV could not be generated. Please try again.",
    );
  });
});
