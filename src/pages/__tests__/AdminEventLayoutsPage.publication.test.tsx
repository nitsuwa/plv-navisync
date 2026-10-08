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
vi.mock("../../hooks/useToast", () => ({ useToast: () => ({ success: mocks.success, error: mocks.error }) }));
vi.mock("../../hooks/useAdminAuth", () => ({ useAdminAuth: () => ({ profile: { id: "admin-reviewer" }, isAdmin: true, loading: false }) }));
vi.mock('../../hooks/useAdminEventSubmissions', () => ({ useAdminEventSubmissions: () => ({ events: [pending], unreadIds: new Set(['pending-event']), pendingCount: 1, unreadCount: 1, markRead: mocks.markRead, refresh: mocks.refresh }) }));

const pending = { ...eventPreviewFixture(), id: "pending-event", createdByUserId: "org-demo", updatedAt: "2026-10-02T00:00:00.000Z", status: "pending", submittedAt: "2026-10-01T00:00:00Z", restrictedAreas: [] } as unknown as CampusEventOverlay;
const approved = { ...eventPreviewFixture(), id: "approved-event", updatedAt: "2026-10-02T00:00:00.000Z", restrictedAreas: [] } as unknown as CampusEventOverlay;

beforeEach(() => {
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

describe("AdminEventLayoutsPage publication controls", () => {
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
    expect(screen.getByRole("button", { name: /Manage publication/i })).toBeInTheDocument();
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
    expect(screen.getByRole("button", { name: /Manage publication/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Review submission/i }));
    expect(await screen.findByRole("heading", { name: /Review Event Layout/i })).toBeInTheDocument();
  });

  it("opens a separate approved-event publication dialog and preserves cancellation", async () => {
    render(<MemoryRouter><AdminEventLayoutsPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: /Manage publication/i }));
    expect(await screen.findByRole("heading", { name: /Manage event publication/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Unpublish$/i }));
    fireEvent.click(screen.getByRole("button", { name: /Keep published/i }));
    expect(eventOverlayService.manageEventPublication).not.toHaveBeenCalled();
  });

  it("sends the event revision with a publication command and reloads after the server confirms", async () => {
    render(<MemoryRouter><AdminEventLayoutsPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: /Manage publication/i }));
    fireEvent.click(screen.getByRole("button", { name: /Publish now/i }));
    await waitFor(() => expect(eventOverlayService.manageEventPublication).toHaveBeenCalledWith(
      "approved-event", "2026-10-02T00:00:00.000Z", { action: "publish_now" },
    ));
    expect(eventOverlayService.listEventOverlays).toHaveBeenCalledTimes(2);
  });
});
