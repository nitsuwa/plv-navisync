import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { eventOrganizationService } from "../../services/eventOrganizationService";
import { useEventOrganizationAccess } from "../useEventOrganizationAccess";

vi.mock("../../services/eventOrganizationService", () => ({
  eventOrganizationService: { listMyEventOrganizations: vi.fn() },
}));

const org = (id: string) => ({
  organizationId: id,
  organizationName: `Organization ${id}`,
  grantId: `grant-${id}`,
  academicYear: "2026–2027",
  expiresAt: "2027-06-30T15:59:59.000Z",
});

describe("useEventOrganizationAccess", () => {
  beforeEach(() => vi.clearAllMocks());

  it("selects the sole active organization and exposes an explicit refresh", async () => {
    vi.mocked(eventOrganizationService.listMyEventOrganizations).mockResolvedValue([org("a")]);
    const { result } = renderHook(() => useEventOrganizationAccess("rep-a", true));

    await waitFor(() => expect(result.current.organization?.organizationId).toBe("a"));
    expect(result.current.error).toBeNull();
    await act(async () => result.current.refresh());
    expect(eventOrganizationService.listMyEventOrganizations).toHaveBeenCalledTimes(2);
  });

  it("requires explicit selection when an account represents multiple organizations", async () => {
    vi.mocked(eventOrganizationService.listMyEventOrganizations).mockResolvedValue([org("a"), org("b")]);
    const { result } = renderHook(() => useEventOrganizationAccess("rep-a", true));

    await waitFor(() => expect(result.current.organizations).toHaveLength(2));
    expect(result.current.organization).toBeNull();
    act(() => result.current.selectOrganization("b"));
    expect(result.current.organization?.organizationId).toBe("b");
  });

  it("clears the selected organization when a refresh confirms access was revoked", async () => {
    vi.mocked(eventOrganizationService.listMyEventOrganizations)
      .mockResolvedValueOnce([org("a")])
      .mockResolvedValueOnce([]);
    const { result } = renderHook(() => useEventOrganizationAccess("rep-a", true));
    await waitFor(() => expect(result.current.organization).not.toBeNull());

    await act(async () => result.current.refresh());
    expect(result.current.organizations).toEqual([]);
    expect(result.current.organization).toBeNull();
  });

  it("does not expose the previous actor's organization while the next actor loads", async () => {
    let finishOld!: (value: Awaited<ReturnType<typeof eventOrganizationService.listMyEventOrganizations>>) => void;
    vi.mocked(eventOrganizationService.listMyEventOrganizations)
      .mockImplementationOnce(() => new Promise((resolve) => { finishOld = resolve; }))
      .mockResolvedValueOnce([org("b")]);
    const { result, rerender } = renderHook(({ actor }) => useEventOrganizationAccess(actor, true), { initialProps: { actor: "rep-a" } });
    rerender({ actor: "rep-b" });

    await waitFor(() => expect(result.current.organization?.organizationId).toBe("b"));
    await act(async () => { finishOld([org("a")]); });
    expect(result.current.organizations.map((entry) => entry.organizationId)).toEqual(["b"]);
  });

  it("revalidates on focus and reconnect", async () => {
    vi.mocked(eventOrganizationService.listMyEventOrganizations).mockResolvedValue([org("a")]);
    renderHook(() => useEventOrganizationAccess("rep-a", true));
    await waitFor(() => expect(eventOrganizationService.listMyEventOrganizations).toHaveBeenCalledTimes(1));

    act(() => window.dispatchEvent(new Event("focus")));
    await waitFor(() => expect(eventOrganizationService.listMyEventOrganizations).toHaveBeenCalledTimes(2));
    act(() => window.dispatchEvent(new Event("online")));
    await waitFor(() => expect(eventOrganizationService.listMyEventOrganizations).toHaveBeenCalledTimes(3));
  });
});
