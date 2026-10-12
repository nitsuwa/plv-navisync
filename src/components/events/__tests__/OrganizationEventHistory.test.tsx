import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OrganizationEventHistory } from "../OrganizationEventHistory";
import { eventOverlayService } from "../../../services/eventOverlayService";

vi.mock("../../../services/eventOverlayService", () => ({
  eventOverlayService: { listOrganizationEvents: vi.fn(), reuseOrganizationEvent: vi.fn() },
}));

const org = { organizationId: "org-it", organizationName: "Information Technology Organization", grantId: "grant-current", academicYear: "2026–2027", expiresAt: "2027-06-30T15:59:59.000Z" };
const event = (id: string, overrides: Record<string, unknown> = {}) => ({
  id, title: `Event ${id}`, organizer: org.organizationName, organizationId: org.organizationId,
  createdByUserId: "former-rep", createdAt: "2025-03-11T04:00:00.000Z", academicYear: "2024–2025",
  dateStart: "2025-03-15T01:00:00.000Z", dateEnd: "2025-03-15T09:00:00.000Z", status: "approved",
  locations: [], ...overrides,
});

describe("OrganizationEventHistory", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows org-owned historical event context including creator, academic year, and event date", async () => {
    vi.mocked(eventOverlayService.listOrganizationEvents).mockResolvedValue({ events: [event("historic") as never], total: 1 });
    render(<MemoryRouter><OrganizationEventHistory organization={org} /></MemoryRouter>);

    expect(await screen.findByText("Event historic")).toBeInTheDocument();
    expect(screen.getByText((_content, element) => element?.tagName === "P" && element.textContent?.includes("2024–2025") === true)).toBeInTheDocument();
    expect(screen.getByText((_content, element) => element?.tagName === "P" && /Original creator:\s*former-rep/.test(element.textContent ?? ""))).toBeInTheDocument();
    expect(screen.getByText((_content, element) => element?.tagName === "P" && /Created:\s*Mar 11, 2025/.test(element.textContent ?? ""))).toBeInTheDocument();
    expect(eventOverlayService.listOrganizationEvents).toHaveBeenCalledWith("org-it", expect.objectContaining({ includeArchived: true, limit: 20, offset: 0 }));
  });

  it("offers reuse from historical layouts with a confirmed source version", async () => {
    vi.mocked(eventOverlayService.listOrganizationEvents).mockResolvedValue({ events: [event("historic", { campusId: "campus-1", updatedAt: "2025-03-12T00:00:00Z" }) as never], total: 1 });
    render(<MemoryRouter><OrganizationEventHistory organization={org} /></MemoryRouter>);
    await screen.findByText("Event historic");
    expect(screen.getByRole("button", { name: "Reuse as new draft" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reuse as new draft" }));
    expect(await screen.findByRole("dialog", { name: "Reuse event layout" })).toBeInTheDocument();
    expect(screen.getByText(/fresh admin approval/i)).toBeInTheDocument();
  });

  it("does not offer historical reuse for unfinished layouts", async () => {
    vi.mocked(eventOverlayService.listOrganizationEvents).mockResolvedValue({ events: [event("draft", { campusId: "campus-1", updatedAt: "2025-03-12T00:00:00Z", status: "draft" }) as never], total: 1 });
    render(<MemoryRouter><OrganizationEventHistory organization={org} /></MemoryRouter>);
    await screen.findByText("Event draft");
    expect(screen.queryByRole("button", { name: "Reuse as new draft" })).not.toBeInTheDocument();
  });

  it("filters history by academic year and title, then allows loading the next page", async () => {
    const firstPage = Array.from({ length: 20 }, (_, index) => event(`first-${index}`) as never);
    vi.mocked(eventOverlayService.listOrganizationEvents).mockResolvedValue({ events: firstPage, total: 21 });
    render(<MemoryRouter><OrganizationEventHistory organization={org} /></MemoryRouter>);

    await screen.findByText("Event first-0");
    fireEvent.change(screen.getByRole("combobox", { name: "Academic year" }), { target: { value: "2024–2025" } });
    fireEvent.change(screen.getByRole("searchbox", { name: "Search event history" }), { target: { value: "fair" } });
    await waitFor(() => expect(eventOverlayService.listOrganizationEvents).toHaveBeenLastCalledWith("org-it", expect.objectContaining({ academicYear: "2024–2025", search: "fair", offset: 0 })));
    fireEvent.click(screen.getByRole("button", { name: "Load more history" }));
    await waitFor(() => expect(eventOverlayService.listOrganizationEvents).toHaveBeenLastCalledWith("org-it", expect.objectContaining({ offset: 20 })));
  });

  it("keeps history errors visible and retryable", async () => {
    vi.mocked(eventOverlayService.listOrganizationEvents).mockRejectedValueOnce(new Error("Connection lost"));
    render(<MemoryRouter><OrganizationEventHistory organization={org} /></MemoryRouter>);

    expect(await screen.findByRole("alert")).toHaveTextContent("Connection lost");
    vi.mocked(eventOverlayService.listOrganizationEvents).mockResolvedValueOnce({ events: [], total: 0 });
    fireEvent.click(screen.getByRole("button", { name: "Retry history" }));
    await waitFor(() => expect(screen.getByText(/No past event layouts yet/i)).toBeInTheDocument());
  });

  it("does not let a late history response from a prior organization replace the new selection", async () => {
    let finishOld!: (value: { events: never[]; total: number }) => void;
    vi.mocked(eventOverlayService.listOrganizationEvents)
      .mockImplementationOnce(() => new Promise((resolve) => { finishOld = resolve as typeof finishOld; }))
      .mockResolvedValueOnce({ events: [event("new-org", { organizationId: "org-new" }) as never], total: 1 });
    const { rerender } = render(<MemoryRouter><OrganizationEventHistory organization={org} /></MemoryRouter>);
    rerender(<MemoryRouter><OrganizationEventHistory organization={{ ...org, organizationId: "org-new", organizationName: "New Organization", grantId: "grant-new" }} /></MemoryRouter>);

    expect(await screen.findByText("Event new-org")).toBeInTheDocument();
    finishOld({ events: [event("old-org") as never], total: 1 } as never);
    await waitFor(() => expect(screen.queryByText("Event old-org")).not.toBeInTheDocument());
  });
});
