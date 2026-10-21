import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { eventOverlayService } from "../../services/eventOverlayService";
import { useOrganizationEventWorkspace } from "../useOrganizationEventWorkspace";

vi.mock("../../services/eventOverlayService", () => ({
  eventOverlayService: { listOrganizationEvents: vi.fn() },
}));
const org = (organizationId = "org-a", grantId = "grant-a") => ({ organizationId, organizationName: organizationId, grantId, academicYear: "2026–2027", expiresAt: "2027-06-30T15:59:59.000Z" });

describe("useOrganizationEventWorkspace", () => {
  beforeEach(() => vi.clearAllMocks());

  it("loads unarchived work using the selected organization and current grant scope", async () => {
    vi.mocked(eventOverlayService.listOrganizationEvents).mockResolvedValue({ events: [{ id: "old-draft" }] as never, total: 1 });
    const { result } = renderHook(() => useOrganizationEventWorkspace("rep-a", org(), true));
    await waitFor(() => expect(result.current.events).toHaveLength(1));
    expect(eventOverlayService.listOrganizationEvents).toHaveBeenCalledWith("org-a", { limit: 100, offset: 0, includeArchived: false });
  });

  it("does not expose a previous grant's records while the new grant loads", async () => {
    let finishOld!: (value: { events: never[]; total: number }) => void;
    vi.mocked(eventOverlayService.listOrganizationEvents)
      .mockImplementationOnce(() => new Promise((resolve) => { finishOld = resolve as typeof finishOld; }))
      .mockResolvedValueOnce({ events: [{ id: "new-record" }] as never, total: 1 });
    const { result, rerender } = renderHook(({ grantId }) => useOrganizationEventWorkspace("rep-a", org("org-a", grantId), true), { initialProps: { grantId: "grant-old" } });
    rerender({ grantId: "grant-new" });
    await waitFor(() => expect(result.current.events[0]?.id).toBe("new-record"));
    await act(async () => { finishOld({ events: [{ id: "old-record" }] as never, total: 1 }); });
    expect(result.current.events.map((event) => event.id)).toEqual(["new-record"]);
  });

  it("coalesces focus and visibility revalidation, and exposes retry after a failed refresh", async () => {
    vi.mocked(eventOverlayService.listOrganizationEvents).mockResolvedValue({ events: [], total: 0 });
    const { result } = renderHook(() => useOrganizationEventWorkspace("rep-a", org(), true));
    await waitFor(() => expect(eventOverlayService.listOrganizationEvents).toHaveBeenCalledTimes(1));

    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("focus"));
      await Promise.resolve();
    });
    expect(eventOverlayService.listOrganizationEvents).toHaveBeenCalledTimes(2);

    await act(async () => { window.dispatchEvent(new Event("online")); await Promise.resolve(); });
    await waitFor(() => expect(eventOverlayService.listOrganizationEvents).toHaveBeenCalledTimes(3));

    vi.mocked(eventOverlayService.listOrganizationEvents).mockRejectedValueOnce(new Error("Offline"));
    await act(async () => result.current.refresh());
    expect(result.current.error).toBe("Offline");
  });

  it("loads the next bounded page without replacing the first page", async () => {
    vi.mocked(eventOverlayService.listOrganizationEvents)
      .mockResolvedValueOnce({ events: Array.from({ length: 100 }, (_, i) => ({ id: `event-${i}` })) as never, total: 101 })
      .mockResolvedValueOnce({ events: [{ id: "event-100" }] as never, total: 101 });
    const { result } = renderHook(() => useOrganizationEventWorkspace("rep-a", org(), true));
    await waitFor(() => expect(result.current.events).toHaveLength(100));
    await act(async () => result.current.loadMore());
    expect(result.current.events).toHaveLength(101);
    expect(eventOverlayService.listOrganizationEvents).toHaveBeenLastCalledWith("org-a", { limit: 100, offset: 100, includeArchived: false });
  });
});
