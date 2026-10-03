import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CampusEventOverlay } from "../../components/map-builder/types";
import { eventPreviewFixture } from "../../test/eventFullPackFixtures";
import { eventOverlayService } from "../../services/eventOverlayService";
import { AdminEventLayoutsPage } from "../AdminEventLayoutsPage";

const mocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("../../services/eventOverlayService", () => ({ eventOverlayService: {
  listEventOverlays: vi.fn(), reviewEventOverlay: vi.fn(), manageEventPublication: vi.fn(),
} }));
vi.mock("../../hooks/useToast", () => ({ useToast: () => ({ success: mocks.success, error: mocks.error }) }));

const pending = { ...eventPreviewFixture(), id: "pending-event", updatedAt: "2026-10-02T00:00:00.000Z", status: "pending", submittedAt: "2026-10-01T00:00:00Z", restrictedAreas: [] } as unknown as CampusEventOverlay;
const approved = { ...eventPreviewFixture(), id: "approved-event", updatedAt: "2026-10-02T00:00:00.000Z", restrictedAreas: [] } as unknown as CampusEventOverlay;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(eventOverlayService.listEventOverlays).mockResolvedValue([pending, approved]);
  vi.mocked(eventOverlayService.manageEventPublication).mockResolvedValue(approved);
  vi.mocked(eventOverlayService.reviewEventOverlay).mockResolvedValue(pending);
});

describe("AdminEventLayoutsPage publication controls", () => {
  it("uses review only for pending proposals and removes Quick Approve", async () => {
    render(<AdminEventLayoutsPage />);
    expect(await screen.findByRole("button", { name: /Review submission/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Quick Approve/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Manage publication/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Review submission/i }));
    expect(await screen.findByRole("heading", { name: /Review Event Layout/i })).toBeInTheDocument();
  });

  it("opens a separate approved-event publication dialog and preserves cancellation", async () => {
    render(<AdminEventLayoutsPage />);
    fireEvent.click(await screen.findByRole("button", { name: /Manage publication/i }));
    expect(await screen.findByRole("heading", { name: /Manage event publication/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Unpublish$/i }));
    fireEvent.click(screen.getByRole("button", { name: /Keep published/i }));
    expect(eventOverlayService.manageEventPublication).not.toHaveBeenCalled();
  });

  it("sends the event revision with a publication command and reloads after the server confirms", async () => {
    render(<AdminEventLayoutsPage />);
    fireEvent.click(await screen.findByRole("button", { name: /Manage publication/i }));
    fireEvent.click(screen.getByRole("button", { name: /Publish now/i }));
    await waitFor(() => expect(eventOverlayService.manageEventPublication).toHaveBeenCalledWith(
      "approved-event", "2026-10-02T00:00:00.000Z", { action: "publish_now" },
    ));
    expect(eventOverlayService.listEventOverlays).toHaveBeenCalledTimes(2);
  });
});
