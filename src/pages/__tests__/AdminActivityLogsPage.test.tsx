import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminActivityLogsPage } from "../AdminActivityLogsPage";
import { clearAdminActivityHistory, listVisibleActivityHistory, resolveActivityPresentationContexts } from "../../services/activityLogService";

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
  beforeEach(() => vi.clearAllMocks());

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
});
