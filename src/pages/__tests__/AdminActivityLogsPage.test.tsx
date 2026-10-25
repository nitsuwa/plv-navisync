import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminActivityLogsPage } from "../AdminActivityLogsPage";
import { clearAdminActivityHistory, listVisibleActivityHistory, resolveActivityPresentationContexts } from "../../services/activityLogService";
import { downloadCsv } from "../../lib/exporters";

const activityToastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("../../lib/exporters", () => ({ downloadCsv: vi.fn() }));
vi.mock("../../hooks/useToast", () => ({ useToast: () => activityToastMocks }));

vi.mock("../../services/activityLogService", () => ({
  activityLogErrorMessage: (error: unknown) => {
    const value = error && typeof error === "object" ? error as { code?: unknown; message?: unknown } : {};
    return typeof value.message === "string" ? `${value.message}${typeof value.code === "string" ? ` (${value.code})` : ""}` : "Could not load activity logs.";
  },
  clearAdminActivityHistory: vi.fn().mockResolvedValue("2026-09-29T14:40:27.075Z"),
  listVisibleActivityHistory: vi.fn().mockResolvedValue({ rows: [], clearedBefore: null }),
  resolveActivityPresentationContexts: vi.fn().mockResolvedValue(new Map()),
}));

describe("AdminActivityLogsPage clear history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(clearAdminActivityHistory).mockResolvedValue("2026-09-29T14:40:27.075Z");
    vi.mocked(listVisibleActivityHistory).mockResolvedValue({ rows: [], clearedBefore: null });
    vi.mocked(resolveActivityPresentationContexts).mockResolvedValue(new Map());
  });

  it("requires confirmation and explains that clearing does not delete audit records", async () => {
    render(<AdminActivityLogsPage />);
    await screen.findByText("No activity yet");

    fireEvent.click(screen.getByRole("button", { name: "Clear History" }));
    expect(await screen.findByText("Clear activity history?")).toBeInTheDocument();
    expect(screen.getByText(/regardless of the selected filter.*Audit records remain safely stored/i)).toBeInTheDocument();
    expect(clearAdminActivityHistory).not.toHaveBeenCalled();

    const confirmButtons = screen.getAllByRole("button", { name: "Clear History" });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => expect(clearAdminActivityHistory).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(listVisibleActivityHistory).toHaveBeenCalledTimes(2));
  });

  it("renders a readable activity title, target, actor, and local timestamp", async () => {
    const activity = {
      id: "log-1",
      action: "event_overlay.approved",
      actor_id: "admin-1",
      campus_id: "campus-1",
      entity_type: "event_overlay",
      entity_id: "overlay-1",
      metadata: {},
      created_at: "2026-09-29T14:40:27.075Z",
    };
    vi.mocked(listVisibleActivityHistory).mockResolvedValue({ rows: [activity], clearedBefore: null } as never);
    vi.mocked(resolveActivityPresentationContexts).mockResolvedValue(new Map([[
      "log-1",
      { actorName: "Demo Administrator", campusName: "Main Campus", targetName: "College Week 2026" },
    ]]));

    const { container } = render(<AdminActivityLogsPage />);

    expect(await screen.findByText("Event overlay approved")).toBeInTheDocument();
    expect(screen.getByText("“College Week 2026” was approved for Main Campus by Demo Administrator.")).toBeInTheDocument();
    expect(container.querySelector("time")?.textContent).not.toContain("T14:");
    expect(container.querySelector("details")?.open).toBe(false);
  });

  it("shows a retryable error and reloads successfully after a query failure", async () => {
    vi.mocked(listVisibleActivityHistory)
      .mockRejectedValueOnce({ code: "XX000", message: "Activity query failed" })
      .mockResolvedValueOnce({ rows: [{
        id: "old-campus-log",
        action: "campus version.published",
        actor_id: null,
        campus_id: null,
        entity_type: null,
        entity_id: null,
        metadata: null,
        created_at: "2026-09-29T14:40:27Z",
      }], clearedBefore: null } as never);

    render(<AdminActivityLogsPage />);
    expect(await screen.findByText("Activity query failed (XX000)")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try Again" }));
    expect(await screen.findByText("Campus version published")).toBeInTheDocument();
    expect(listVisibleActivityHistory).toHaveBeenCalledTimes(2);
  });

  it("exports only the currently displayed visible rows for the selected category", async () => {
    const visibleLog = {
      id: "visible-audit-1",
      action: "report.under_review",
      actor_id: "admin-1",
      campus_id: "campus-1",
      entity_type: "report",
      entity_id: "report-1",
      metadata: { private_token: "never-export-this" },
      created_at: "2026-09-29T14:40:27.075Z",
    };
    vi.mocked(listVisibleActivityHistory).mockResolvedValue({
      rows: [visibleLog],
      clearedBefore: "2026-09-29T14:00:00.000Z",
    } as never);
    vi.mocked(resolveActivityPresentationContexts).mockResolvedValue(new Map([[
      visibleLog.id,
      { actorName: "QA Administrator", campusName: "QA Campus", targetName: "Synthetic report" },
    ]]));

    render(<AdminActivityLogsPage />);
    await screen.findByText("Report under review");
    fireEvent.click(screen.getByRole("button", { name: "Reports" }));
    await waitFor(() => expect(listVisibleActivityHistory).toHaveBeenLastCalledWith({
      entityTypes: ["report"],
      limit: 50,
    }));
    await screen.findByText("Report under review");

    fireEvent.click(screen.getByRole("button", { name: "Export displayed activity entries as CSV" }));

    expect(downloadCsv).toHaveBeenCalledTimes(1);
    const [rows, filename] = vi.mocked(downloadCsv).mock.calls[0];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      "Date & Time (UTC)": visibleLog.created_at,
      "Performed By": "QA Administrator",
      Campus: "QA Campus",
      "Action Code": visibleLog.action,
      "Record ID": visibleLog.id,
    });
    expect(JSON.stringify(rows)).not.toContain("never-export-this");
    expect(filename).toMatch(/^PLV_NaviSync_Activity_Logs_\d{4}-\d{2}-\d{2}\.csv$/);
    expect(listVisibleActivityHistory).toHaveBeenLastCalledWith({ entityTypes: ["report"], limit: 50 });
  });

  it("disables the export action when no entries are displayed", async () => {
    render(<AdminActivityLogsPage />);
    await screen.findByText("No activity yet");
    expect(screen.getByRole("button", { name: "Export displayed activity entries as CSV" })).toBeDisabled();
    expect(downloadCsv).not.toHaveBeenCalled();
  });

  it("shows a retryable error when the activity CSV cannot be generated", async () => {
    vi.mocked(listVisibleActivityHistory).mockResolvedValue({ rows: [{
      id: "audit-export-error",
      action: "campus.version.published",
      actor_id: null,
      campus_id: null,
      entity_type: "campus",
      entity_id: null,
      metadata: null,
      created_at: "2026-09-29T14:40:27.075Z",
    }], clearedBefore: null } as never);
    vi.mocked(downloadCsv).mockImplementation(() => {
      throw new Error("Download blocked");
    });
    render(<AdminActivityLogsPage />);
    await screen.findByText("Campus version published");

    fireEvent.click(screen.getByRole("button", { name: "Export displayed activity entries as CSV" }));

    expect(activityToastMocks.error).toHaveBeenCalledWith(
      "Export failed",
      "The displayed activity entries could not be exported. Please try again.",
    );
  });
});
