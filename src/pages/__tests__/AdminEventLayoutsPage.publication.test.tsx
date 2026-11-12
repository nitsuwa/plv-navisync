import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CampusEventOverlay } from "../../components/map-builder/types";
import { eventPreviewFixture } from "../../test/eventFullPackFixtures";
import { eventOverlayService } from "../../services/eventOverlayService";
import { AdminEventLayoutsPage } from "../AdminEventLayoutsPage";

const mocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), markRead: vi.fn(), refresh: vi.fn() }));
vi.mock("../../services/eventOverlayService", () => ({ eventOverlayService: {
  listEventOverlays: vi.fn(), listEventSubmitterNames: vi.fn(), reviewEventOverlay: vi.fn(), manageEventPublication: vi.fn(), getEventOverlay: vi.fn(),
} }));
vi.mock("../../services/eventOrganizationService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../services/eventOrganizationService")>();
  return { ...actual, eventOrganizationService: { ...actual.eventOrganizationService, listOrganizations: vi.fn().mockResolvedValue([
    { id: "org-a", name: "Alpha Organization" }, { id: "org-b", name: "Beta Organization" },
  ]) } };
});
vi.mock("../../hooks/useToast", () => ({ useToast: () => ({ success: mocks.success, error: mocks.error }) }));
vi.mock("../../hooks/useAdminAuth", () => ({ useAdminAuth: () => ({ profile: { id: "admin-reviewer" }, isAdmin: true, loading: false }) }));
vi.mock('../../hooks/useAdminEventSubmissions', () => ({ useAdminEventSubmissions: () => ({ events: [pending], unreadIds: new Set(['pending-event']), pendingCount: 1, unreadCount: 1, markRead: mocks.markRead, refresh: mocks.refresh }) }));

const pending = { ...eventPreviewFixture(), id: "pending-event", title: "Alpha submitted layout", organizationId: "org-a", academicYear: "2026–2027", createdAt: "2026-09-20T00:00:00Z", createdByUserId: "org-demo", updatedAt: "2026-10-02T00:00:00.000Z", status: "pending", submittedAt: "2026-10-01T00:00:00Z", restrictedAreas: [] } as unknown as CampusEventOverlay;
const approved = { ...eventPreviewFixture(), id: "approved-event", title: "Beta past layout", organizationId: "org-b", academicYear: "2025–2026", createdAt: "2025-09-20T00:00:00Z", status: "approved", updatedAt: "2026-10-02T00:00:00.000Z", restrictedAreas: [] } as unknown as CampusEventOverlay;
const disapproved = { ...eventPreviewFixture(), id: "disapproved-event", title: "Disapproved past layout", organizationId: "org-b", academicYear: "2024–2025", createdAt: "2024-09-20T00:00:00Z", status: "disapproved", adminComment: "Please move the booth.", updatedAt: "2026-10-02T00:00:00.000Z", restrictedAreas: [] } as unknown as CampusEventOverlay;

const eventFilterFixtures: CampusEventOverlay[] = [
  pending,
  { ...pending, id: "pending-event-two", title: "Gamma pending layout", organizer: "Gamma Club", organizationId: "org-a", academicYear: "2025–2026" },
  approved,
  { ...approved, id: "approved-event-two", title: "Delta approved layout", organizer: "Delta Society", organizationId: "org-a", academicYear: "2026–2027" },
  disapproved,
];

function useEventFilterFixtures() {
  vi.mocked(eventOverlayService.listEventOverlays).mockImplementation(async (filters) => {
    const status = filters?.status ?? "all";
    const query = filters?.search?.trim().toLocaleLowerCase() ?? "";
    return eventFilterFixtures.filter((event) => {
      const matchesStatus = status === "all" || event.status === status;
      const searchableText = [event.title, event.description, event.organizer].join(" ").toLocaleLowerCase();
      return matchesStatus && (!query || searchableText.includes(query));
    });
  });
  vi.mocked(eventOverlayService.listEventSubmitterNames).mockResolvedValue({});
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  localStorage.clear();
  vi.clearAllMocks();
  vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-10-03T02:00:00Z"));
  vi.mocked(eventOverlayService.listEventOverlays).mockResolvedValue([pending, approved]);
  vi.mocked(eventOverlayService.listEventSubmitterNames).mockResolvedValue({ [pending.createdByUserId!]: "Demo Organization" });
  vi.mocked(eventOverlayService.manageEventPublication).mockResolvedValue(approved);
  vi.mocked(eventOverlayService.reviewEventOverlay).mockResolvedValue(pending);
  vi.mocked(eventOverlayService.getEventOverlay).mockResolvedValue(pending);
  mocks.markRead.mockResolvedValue('saved');
});
afterEach(() => vi.restoreAllMocks());

async function openPendingReview() {
  const trigger = await screen.findByRole("button", { name: /Review submission/i });
  await act(async () => { fireEvent.click(trigger); });
}

async function chooseFilterOption(label: string, optionName: string) {
  const trigger = screen.getByRole("combobox", { name: label });
  fireEvent.keyDown(trigger, { key: "ArrowDown" });
  fireEvent.click(await screen.findByRole("option", { name: optionName }));
}

describe("AdminEventLayoutsPage publication controls", () => {
  it("filters layout history by verified organization and academic year", async () => {
    render(<MemoryRouter><AdminEventLayoutsPage /></MemoryRouter>);
    await screen.findByText("Beta past layout");
    await chooseFilterOption("Filter by organization", "Alpha Organization");
    expect(await screen.findByText("Alpha submitted layout")).toBeInTheDocument();
    expect(screen.queryByText("Beta past layout")).not.toBeInTheDocument();
    await chooseFilterOption("Filter by academic year", "2026–2027");
    const alphaCard = screen.getByTestId("event-layout-card-pending-event");
    expect(within(alphaCard).getByText("2026–2027")).toBeInTheDocument();
    expect(within(alphaCard).queryByText("2025–2026")).not.toBeInTheDocument();
  });

  it.each([
    ["review", { ...pending, id: "pending-long", status: "pending" }, "Pending", "Review submission"],
    ["publication", { ...approved, id: "approved-long", status: "approved" }, "Approved", "Manage publication"],
    ["history", { ...approved, id: "history-long", status: "disapproved", adminComment: "Needs a safer route." }, "Disapproved", "Open map preview"],
  ] as const)("wraps an unbroken title and keeps the %s card action beside its status", async (view, fixture, status, action) => {
    const longTitle = "CampusLayoutReview".repeat(9);
    vi.mocked(eventOverlayService.listEventOverlays).mockResolvedValue([{ ...fixture, title: longTitle } as CampusEventOverlay]);
    render(<MemoryRouter><AdminEventLayoutsPage workspaceView={view} /></MemoryRouter>);

    const card = await screen.findByTestId(`event-layout-card-${fixture.id}`);
    const title = within(card).getByRole("heading", { name: longTitle, exact: true });
    const badge = within(card).getByText(status, { exact: true });

    expect(title).toHaveClass("min-w-0", "flex-1", "break-words");
    expect(title).toHaveClass("[overflow-wrap:anywhere]");
    expect(badge.className).toContain("shrink-0");
    expect(within(card).getByRole("button", { name: action })).toBeInTheDocument();
  });

  it('retains a loaded queue with visible retry when a foreground refresh fails',async()=>{
    render(<MemoryRouter><AdminEventLayoutsPage/></MemoryRouter>);
    await screen.findByRole('button',{name:/Review submission/i});
    vi.mocked(eventOverlayService.listEventOverlays).mockRejectedValueOnce(new Error('Queue offline'));
    await act(async()=>{window.dispatchEvent(new Event('focus'));});
    expect(await screen.findByRole('alert')).toHaveTextContent(/last loaded.*Queue offline/i);
    expect(screen.getByRole('button',{name:/Retry event layouts/i})).toBeInTheDocument();
    expect(screen.getByRole('button',{name:/Review submission/i})).toBeInTheDocument();
  });
  it('shows only the active review action and retains feedback after failure',async()=>{
    let fail!:(error:Error)=>void;
    vi.mocked(eventOverlayService.reviewEventOverlay).mockReturnValue(new Promise((_,reject)=>{fail=reject;}));
    render(<MemoryRouter><AdminEventLayoutsPage/></MemoryRouter>);
    await openPendingReview();
    fireEvent.change(screen.getByLabelText(/Admin Comment/),{target:{value:'Move the booth'}});
    fireEvent.click(screen.getByRole('button',{name:/^Disapprove$/}));
    expect(screen.getByRole('button',{name:/Requesting changes/i})).toBeDisabled();
    expect(screen.getByRole('button',{name:/^Approve$/})).toBeDisabled();
    await act(async()=>{fail(new Error('Connection lost'));});
    expect(screen.getByLabelText(/Admin Comment/)).toHaveValue('Move the booth');
    expect(screen.getByRole('button',{name:/^Disapprove$/})).toBeEnabled();
  });
  it('does not claim a submission was reviewed when its notification target cannot be fetched', async () => {
    vi.mocked(eventOverlayService.getEventOverlay).mockResolvedValue(null);
    render(<MemoryRouter initialEntries={['/admin-dashboard/event-layouts?review=pending-event']}><AdminEventLayoutsPage /></MemoryRouter>);
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith('Could not open submission', expect.stringMatching(/retry/i)));
    expect(mocks.markRead).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: 'Review Event Layout' })).not.toBeInTheDocument();
  });
  it('waits until the review is displayed before acknowledging a notification during a slow queue load', async () => {
    let finishQueue!: (rows: CampusEventOverlay[]) => void;
    vi.mocked(eventOverlayService.listEventOverlays).mockReturnValueOnce(new Promise(resolve => { finishQueue = resolve; }));
    render(<MemoryRouter initialEntries={['/admin-dashboard/event-layouts?review=pending-event']}><AdminEventLayoutsPage /></MemoryRouter>);
    await waitFor(() => expect(eventOverlayService.getEventOverlay).toHaveBeenCalledWith('pending-event'));
    await act(async () => {});
    expect(screen.queryByRole('dialog', { name: 'Review Event Layout' })).not.toBeInTheDocument();
    expect(mocks.markRead).not.toHaveBeenCalled();
    await act(async () => { finishQueue([pending, approved]); });
    await screen.findByRole('dialog', { name: 'Review Event Layout' });
    await waitFor(() => expect(mocks.markRead).toHaveBeenCalledWith(pending));
  });
  it('opens only the event identified by notification links and acknowledges that displayed submission', async () => {
    render(<MemoryRouter initialEntries={['/admin-dashboard/event-layouts?review=pending-event']}><AdminEventLayoutsPage /></MemoryRouter>);
    const dialog = await screen.findByRole('dialog', { name: 'Review Event Layout' });
    expect(within(dialog).getByText(pending.title, { exact: true })).toBeInTheDocument();
    await waitFor(() => expect(mocks.markRead).toHaveBeenCalledWith(pending));
  });
  it("recovers publication choices even when no feedback comment has been entered", async () => {
    const first = render(<MemoryRouter><AdminEventLayoutsPage /></MemoryRouter>); await openPendingReview();
    fireEvent.click(screen.getByRole("button", { name: "Schedule publication", exact: true }));
    await screen.findByText(/Review draft saved on this browser/i);
    await act(async () => first.unmount()); render(<MemoryRouter><AdminEventLayoutsPage /></MemoryRouter>); await openPendingReview();
    expect(screen.getByRole("button", { name: "Schedule publication", exact: true })).toHaveAttribute("aria-pressed", "true");
  });
  it("keeps the draft after a failed review command and clears it after a confirmed review", async () => {
    vi.mocked(eventOverlayService.reviewEventOverlay).mockRejectedValueOnce(new Error("Review request failed"));
    const first = render(<MemoryRouter><AdminEventLayoutsPage /></MemoryRouter>);
    await openPendingReview();
    fireEvent.change(screen.getByLabelText(/Admin Comment/), { target: { value: "Keep pins and feedback on retry" } });
    await screen.findByText(/Review draft saved on this browser/i);
    fireEvent.click(screen.getByRole("button", { name: "Disapprove", exact: true }));
    await screen.findByText("Review request failed");
    await act(async () => first.unmount());
    const retry = render(<MemoryRouter><AdminEventLayoutsPage /></MemoryRouter>);
    await openPendingReview();
    expect(screen.getByLabelText(/Admin Comment/)).toHaveValue("Keep pins and feedback on retry");
    fireEvent.click(screen.getByRole("button", { name: "Disapprove", exact: true }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Review Event Layout" })).not.toBeInTheDocument());
    await act(async () => retry.unmount()); render(<MemoryRouter><AdminEventLayoutsPage /></MemoryRouter>);
    await openPendingReview();
    expect(screen.getByLabelText(/Admin Comment/)).toHaveValue("");
    expect(eventOverlayService.reviewEventOverlay).toHaveBeenCalledTimes(2);
  });

  it("shows a clear warning instead of promising reload recovery when storage fails", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    render(<MemoryRouter><AdminEventLayoutsPage /></MemoryRouter>);
    await openPendingReview();
    fireEvent.change(screen.getByLabelText(/Admin Comment/), { target: { value: "Unsaved local review" } });
    expect(await screen.findByRole("alert")).toHaveTextContent("could not be saved on this browser");
    expect(eventOverlayService.reviewEventOverlay).not.toHaveBeenCalled();
  });
  it("does not resurrect feedback that was added and then removed before reload", async () => {
    const first = render(<MemoryRouter><AdminEventLayoutsPage /></MemoryRouter>);
    await openPendingReview();
    fireEvent.change(screen.getByLabelText(/Admin Comment/), { target: { value: "Remove this later" } });
    await screen.findByText(/Review draft saved on this browser/i);
    fireEvent.change(screen.getByLabelText(/Admin Comment/), { target: { value: "" } });
    await act(async () => first.unmount()); render(<MemoryRouter><AdminEventLayoutsPage /></MemoryRouter>);
    await openPendingReview();
    expect(screen.getByLabelText(/Admin Comment/)).toHaveValue("");
  });
  it("recovers a review comment and location feedback after the page remounts without submitting it", async () => {
    const first = render(<MemoryRouter><AdminEventLayoutsPage /></MemoryRouter>);
    await openPendingReview();
    fireEvent.change(screen.getByLabelText(/Admin Comment/), { target: { value: "Keep this review after reload" } });
    const feedback = screen.getByPlaceholderText("Specific feedback for this map");
    fireEvent.change(feedback, { target: { value: "Move the booth near the entrance" } });
    await screen.findByText(/Review draft saved on this browser/i);
    await act(async () => first.unmount());
    render(<MemoryRouter><AdminEventLayoutsPage /></MemoryRouter>);
    await openPendingReview();
    expect(screen.getByLabelText(/Admin Comment/)).toHaveValue("Keep this review after reload");
    expect(screen.getByPlaceholderText("Specific feedback for this map")).toHaveValue("Move the booth near the entrance");
    expect(eventOverlayService.reviewEventOverlay).not.toHaveBeenCalled();
  });

  it("explicitly discards the local review draft so it does not return on reopening", async () => {
    render(<MemoryRouter><AdminEventLayoutsPage /></MemoryRouter>);
    await openPendingReview();
    fireEvent.change(screen.getByLabelText(/Admin Comment/), { target: { value: "Discard me" } });
    await screen.findByText(/Review draft saved on this browser/i);
    fireEvent.click(screen.getByRole("button", { name: "Cancel", exact: true }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Discard review", exact: true })); });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Review Event Layout" })).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Review submission/i }));
    expect(screen.getByLabelText(/Admin Comment/)).toHaveValue("");
    expect(eventOverlayService.reviewEventOverlay).not.toHaveBeenCalled();
  });
  it("shows the authenticated submitter name separately from the organizer", async () => {
    render(<MemoryRouter><AdminEventLayoutsPage /></MemoryRouter>);
    expect(await screen.findAllByText("Demo Organization")).not.toHaveLength(0);
    expect(screen.getAllByText(/Submitted by/).length).toBeGreaterThan(0);
  });

  it("refreshes a withdrawn submission on tab focus without retaining it in the queue", async () => {
    render(<MemoryRouter><AdminEventLayoutsPage /></MemoryRouter>);
    expect(await screen.findByRole("button", { name: /Review submission/i })).toBeInTheDocument();
    vi.mocked(eventOverlayService.listEventOverlays).mockResolvedValue([{ ...pending, status: "draft" }, approved]);
    fireEvent(window, new Event("focus"));
    await waitFor(() => expect(screen.queryByRole("button", { name: /Review submission/i })).not.toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /Manage publication/i })).not.toBeInTheDocument();
  });

  it("removes a deleted submission from the queue on tab focus", async () => {
    render(<MemoryRouter><AdminEventLayoutsPage /></MemoryRouter>);
    expect(await screen.findByRole("button", { name: /Review submission/i })).toBeInTheDocument();
    vi.mocked(eventOverlayService.listEventOverlays).mockResolvedValue([approved]);
    fireEvent(window, new Event("focus"));
    await waitFor(() => expect(screen.queryByRole("button", { name: /Review submission/i })).not.toBeInTheDocument());
  });
  it('preserves staged review comments when cancellation is declined', async () => {
    render(<MemoryRouter><AdminEventLayoutsPage /></MemoryRouter>);
    const trigger = await screen.findByRole('button', { name: /Review submission/i });
    await act(async () => { fireEvent.click(trigger); });
    fireEvent.change(screen.getByLabelText(/Admin Comment/), { target: { value: 'Keep this feedback' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('alertdialog', { name: 'Discard review changes?' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Keep reviewing' }));
    expect(screen.getByLabelText(/Admin Comment/)).toHaveValue('Keep this feedback');
    expect(eventOverlayService.reviewEventOverlay).not.toHaveBeenCalled();
  });
  it("opens a responsive accessible review without immediate red validation alerts", async () => {
    render(<MemoryRouter><AdminEventLayoutsPage /></MemoryRouter>);
    const trigger = await screen.findByRole("button", { name: /Review submission/i });
    await act(async () => { fireEvent.click(trigger); });
    expect(screen.getByRole("dialog", { name: "Review Event Layout" })).toHaveClass("max-w-3xl");
    expect(screen.getByRole("button", { name: "Preview requested maps" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText(/Choose the start and end dates/)).toHaveClass("text-muted-foreground");
  });
  it("bounds the review dialog to both landscape safe-area insets", async () => {
    render(<MemoryRouter><AdminEventLayoutsPage /></MemoryRouter>);
    await openPendingReview();
    const dialog = screen.getByRole("dialog", { name: "Review Event Layout" });

    expect(dialog.style.left).toContain("safe-area-inset-left");
    expect(dialog.style.right).toContain("safe-area-inset-right");
    expect(dialog.style.width).toContain("safe-area-inset-left");
    expect(dialog.style.width).toContain("safe-area-inset-right");
    expect(dialog.style.maxHeight).toContain("safe-area-inset-top");
    expect(dialog.style.maxHeight).toContain("safe-area-inset-bottom");
  });
  it("returns focus to the queue action when the review dialog closes", async () => {
    render(<MemoryRouter><AdminEventLayoutsPage /></MemoryRouter>);
    const trigger = await screen.findByRole("button", { name: /Review submission/i });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(trigger).toHaveFocus());
  });
  it("uses review only for pending proposals and removes Quick Approve", async () => {
    render(<MemoryRouter><AdminEventLayoutsPage /></MemoryRouter>);
    expect(await screen.findByRole("button", { name: /Review submission/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Quick Approve/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Manage publication/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Review submission/i }));
    expect(await screen.findByRole("heading", { name: /Review Event Layout/i })).toBeInTheDocument();
  });

  it("opens a separate approved-event publication dialog and preserves cancellation", async () => {
    render(<MemoryRouter><AdminEventLayoutsPage workspaceView="publication" /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: /Manage publication/i }));
    expect(await screen.findByRole("heading", { name: /Manage event publication/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Unpublish$/i }));
    fireEvent.click(screen.getByRole("button", { name: /Keep published/i }));
    expect(eventOverlayService.manageEventPublication).not.toHaveBeenCalled();
  });

  it("sends the event revision with a publication command and reloads after the server confirms", async () => {
    render(<MemoryRouter><AdminEventLayoutsPage workspaceView="publication" /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: /Manage publication/i }));
    fireEvent.click(screen.getByRole("button", { name: /Publish now/i }));
    await waitFor(() => expect(eventOverlayService.manageEventPublication).toHaveBeenCalledWith(
      "approved-event", "2026-10-02T00:00:00.000Z", { action: "publish_now" },
    ));
    expect(eventOverlayService.listEventOverlays).toHaveBeenCalledTimes(2);
  });

  it("filters the loaded records while keeping the search input mounted and focused", async () => {
    useEventFilterFixtures();
    render(<MemoryRouter><AdminEventLayoutsPage workspaceView="all" /></MemoryRouter>);

    const input = await screen.findByPlaceholderText("Search event layouts...");
    input.focus();
    expect(screen.getByTestId("event-layout-card-pending-event-two")).toBeInTheDocument();
    expect(eventOverlayService.listEventOverlays).toHaveBeenCalledTimes(1);

    await act(async () => {
      fireEvent.change(input, { target: { value: "Gamma pending" } });
    });

    expect(screen.getByPlaceholderText("Search event layouts...")).toBe(input);
    expect(input).toHaveFocus();
    expect(screen.getByTestId("event-layout-card-pending-event-two")).toBeInTheDocument();
    expect(screen.queryByTestId("event-layout-card-approved-event")).not.toBeInTheDocument();
    expect(eventOverlayService.listEventOverlays).toHaveBeenCalledTimes(1);
  });

  it("keeps history decision counts stable when a decision filter is selected", async () => {
    useEventFilterFixtures();
    render(<MemoryRouter><AdminEventLayoutsPage workspaceView="history" /></MemoryRouter>);

    const allDecisions = await screen.findByRole("button", { name: /All decisions/ });
    const approvedFilter = screen.getByRole("button", { name: /Approved/ });
    const disapprovedFilter = screen.getByRole("button", { name: /Disapproved/ });
    expect(allDecisions.textContent).toBe("All decisions3");
    expect(approvedFilter.textContent).toBe("Approved2");
    expect(disapprovedFilter.textContent).toBe("Disapproved1");

    fireEvent.click(approvedFilter);
    await waitFor(() => expect(screen.getByRole("button", { name: /Approved/ })).toHaveAttribute("aria-pressed", "true"));

    expect(allDecisions.textContent).toBe("All decisions3");
    expect(approvedFilter.textContent).toBe("Approved2");
    expect(disapprovedFilter.textContent).toBe("Disapproved1");
    fireEvent.click(disapprovedFilter);
    expect(screen.getByTestId("event-layout-card-disapproved-event")).toBeInTheDocument();
    expect(screen.queryByTestId("event-layout-card-approved-event")).not.toBeInTheDocument();
    await chooseFilterOption("Filter by organization", "Beta Organization");
    expect(allDecisions.textContent).toBe("All decisions2");
    expect(approvedFilter.textContent).toBe("Approved1");
    expect(disapprovedFilter.textContent).toBe("Disapproved1");
    await chooseFilterOption("Filter by academic year", "2025–2026");
    expect(allDecisions.textContent).toBe("All decisions1");
    expect(approvedFilter.textContent).toBe("Approved1");
    expect(disapprovedFilter.textContent).toBe("Disapproved0");
    expect(eventOverlayService.listEventOverlays).toHaveBeenCalledTimes(1);
  });

  it("limits review, publication, and history controls to their workspace statuses", async () => {
    useEventFilterFixtures();
    const review = render(<MemoryRouter><AdminEventLayoutsPage workspaceView="review" /></MemoryRouter>);
    expect(await screen.findByTestId("event-layout-card-pending-event")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Approved/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Disapproved/ })).not.toBeInTheDocument();
    expect(screen.queryByTestId("event-layout-card-approved-event")).not.toBeInTheDocument();
    review.unmount();

    const publication = render(<MemoryRouter><AdminEventLayoutsPage workspaceView="publication" /></MemoryRouter>);
    expect(await screen.findByTestId("event-layout-card-approved-event")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Pending/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Disapproved/ })).not.toBeInTheDocument();
    expect(screen.queryByTestId("event-layout-card-pending-event")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Manage publication/ }).length).toBeGreaterThan(0);
    publication.unmount();

    render(<MemoryRouter><AdminEventLayoutsPage workspaceView="history" /></MemoryRouter>);
    expect(await screen.findByTestId("event-layout-card-disapproved-event")).toBeInTheDocument();
    expect(screen.queryByTestId("event-layout-card-pending-event")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Manage publication/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Open map preview/ }).length).toBeGreaterThan(0);
  });

  it("uses themed filter dropdowns and labels unresolved organization data honestly", async () => {
    useEventFilterFixtures();
    const unresolvedOrganizationEvent = {
      ...approved,
      id: "unresolved-organization-event",
      title: "Unresolved organization event",
      organizationId: "org-missing",
      academicYear: "",
    } as CampusEventOverlay;
    vi.mocked(eventOverlayService.listEventOverlays).mockResolvedValueOnce([...eventFilterFixtures, unresolvedOrganizationEvent]);
    const { container } = render(<MemoryRouter><AdminEventLayoutsPage workspaceView="all" /></MemoryRouter>);

    expect(await screen.findByText("Unknown year")).toBeInTheDocument();
    expect(screen.getByText("Organization unavailable")).toBeInTheDocument();
    expect(container.querySelectorAll("select")).toHaveLength(0);

    const organization = screen.getByRole("combobox", { name: "Filter by organization" });
    fireEvent.keyDown(organization, { key: "ArrowDown" });
    const alphaOrganization = await screen.findByRole("option", { name: "Alpha Organization" });
    fireEvent.click(alphaOrganization);
    expect(organization).toHaveTextContent("Alpha Organization");

    const academicYear = screen.getByRole("combobox", { name: "Filter by academic year" });
    fireEvent.keyDown(academicYear, { key: "ArrowDown" });
    const yearOption = await screen.findByRole("option", { name: "All academic years" });
    fireEvent.click(yearOption);
    expect(academicYear).toHaveTextContent("All academic years");
  });
});
