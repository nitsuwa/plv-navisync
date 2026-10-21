import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useStudentOrgEventUpdates } from "../useStudentOrgEventUpdates";
import { eventOverlayService } from "../../services/eventOverlayService";
import type { CampusEventOverlay } from "../../components/map-builder/types";
import { eventReviewFingerprint, eventReviewSeenPrefix } from "../../lib/studentEventUpdates";
import { eventNotificationService, EventNotificationSyncUnavailable } from '../../services/eventNotificationService';
import { eventOrganizationService } from '../../services/eventOrganizationService';
vi.mock('../../services/eventNotificationService',async(importOriginal)=>({...await importOriginal<typeof import('../../services/eventNotificationService')>(),eventNotificationService:{getStates:vi.fn(),acknowledge:vi.fn()}}));
vi.mock('../../services/eventOrganizationService',async(importOriginal)=>({...await importOriginal<typeof import('../../services/eventOrganizationService')>(),eventOrganizationService:{listMyEventOrganizations:vi.fn(),getHandoverSummary:vi.fn(),acknowledgeHandover:vi.fn()}}));
vi.mock("../../services/eventOverlayService", async(importOriginal) => ({ ...await importOriginal<typeof import('../../services/eventOverlayService')>(), eventOverlayService: { listEventOverlays: vi.fn(), listOrganizationEvents: vi.fn() } }));
const event = { id: "one", createdByUserId: "org-hook", title: "Fair", status: "approved", submittedAt: "2026-10-06T00:00:00Z" } as CampusEventOverlay;
beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); vi.mocked(eventOverlayService.listEventOverlays).mockResolvedValue([event]); vi.mocked(eventNotificationService.getStates).mockRejectedValue(new EventNotificationSyncUnavailable('Browser only')); vi.mocked(eventNotificationService.acknowledge).mockRejectedValue(new EventNotificationSyncUnavailable('Browser only')); vi.mocked(eventOrganizationService.listMyEventOrganizations).mockResolvedValue([]); vi.mocked(eventOrganizationService.getHandoverSummary).mockRejectedValue(new EventNotificationSyncUnavailable('Browser only')); vi.mocked(eventOrganizationService.acknowledgeHandover).mockRejectedValue(new EventNotificationSyncUnavailable('Browser only')); });
afterEach(() => vi.restoreAllMocks());
describe("shared Student Org review updates", () => {
  it.each([0, 1])("keeps the handover badge consistent when %i pending tasks remain", async (pendingCount: number) => {
    const context = { organizationId: "org-badge", organizationName: "IT Organization", grantId: "grant-badge", academicYear: "2026–2027", expiresAt: "2027-06-30T00:00:00Z" };
    vi.mocked(eventOrganizationService.listMyEventOrganizations).mockResolvedValue([context]);
    vi.mocked(eventOverlayService.listOrganizationEvents).mockResolvedValue({ events: [], total: 0 });
    vi.mocked(eventOrganizationService.getHandoverSummary).mockResolvedValue({ ...context, pendingCount, unfinishedCount: 0, openFeedbackCount: 0, isRead: false, startsAt: "2026-10-09T00:00:00Z" });
    const view = renderHook(() => useStudentOrgEventUpdates(`badge-${pendingCount}`, true));
    await waitFor(() => expect(view.result.current.handoverUpdates).toHaveLength(1));
    expect(view.result.current.unreadCount).toBe(pendingCount > 0 ? 1 : 0);
    view.unmount();
  });
  it('loads successor review updates and a per-grant handover summary for organization-owned events', async () => {
    const context = { organizationId: 'org-it', organizationName: 'IT Organization', grantId: 'grant-new', academicYear: '2026–2027', expiresAt: '2027-06-30T00:00:00Z' };
    const inherited = { ...event, id: 'inherited', organizationId: 'org-it', createdByUserId: 'former-rep' } as CampusEventOverlay;
    vi.mocked(eventOrganizationService.listMyEventOrganizations).mockResolvedValue([context]);
    vi.mocked(eventOverlayService.listOrganizationEvents).mockResolvedValue({ events: [inherited], total: 1 });
    vi.mocked(eventNotificationService.getStates).mockResolvedValue(new Map([['inherited', { isCurrent: true, isRead: false }]]));
    vi.mocked(eventOrganizationService.getHandoverSummary).mockResolvedValue({ ...context, pendingCount: 1, unfinishedCount: 1, openFeedbackCount: 0, isRead: false, startsAt: '2026-10-09T00:00:00Z' });
    const view = renderHook(() => useStudentOrgEventUpdates('successor', true));
    await waitFor(() => expect(view.result.current.events.map(item => item.id)).toEqual(['inherited']));
    expect(view.result.current.unreadIds.has('inherited')).toBe(true);
    expect(view.result.current.handoverUpdates).toEqual([expect.objectContaining({ grantId: 'grant-new', isRead: false })]);
    expect(eventNotificationService.getStates).toHaveBeenCalledWith('successor', 'org_review', [inherited], false);
    view.unmount();
  });
  it('retains actor-scoped session-only read marks across a map route round trip',async()=>{
    const item={...event,createdByUserId:'org-session-route'};
    vi.mocked(eventOverlayService.listEventOverlays).mockResolvedValue([item]);
    const first=renderHook(()=>useStudentOrgEventUpdates('org-session-route',true));
    await waitFor(()=>expect(first.result.current.unreadCount).toBe(1));
    vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('Storage blocked');});
    await act(async()=>{expect(await first.result.current.markRead(item)).toBe('memory');});
    first.unmount();
    const returned=renderHook(()=>useStudentOrgEventUpdates('org-session-route',true));
    await waitFor(()=>expect(returned.result.current.events).toHaveLength(1));
    expect(returned.result.current.unreadCount).toBe(0);returned.unmount();
  });
  it('uses the server read receipt even when this device has no local receipt',async()=>{
    const item={...event,createdByUserId:'org-server'};
    vi.mocked(eventOverlayService.listEventOverlays).mockResolvedValue([item]);
    vi.mocked(eventNotificationService.getStates).mockResolvedValue(new Map([['one',{isCurrent:true,isRead:true}]]));
    const view=renderHook(()=>useStudentOrgEventUpdates('org-server',true));
    await waitFor(()=>expect(view.result.current.events).toHaveLength(1));
    expect(view.result.current.unreadCount).toBe(0);view.unmount();
  });
  it("synchronizes an acknowledged event from another tab's storage receipt", async () => {
    const storageEvent = { ...event, createdByUserId: "org-storage" };
    vi.mocked(eventOverlayService.listEventOverlays).mockResolvedValue([storageEvent]);
    const view = renderHook(() => useStudentOrgEventUpdates("org-storage", true));
    await waitFor(() => expect(view.result.current.unreadCount).toBe(1));
    const key = eventReviewSeenPrefix("org-storage") + storageEvent.id;
    localStorage.setItem(key, JSON.stringify({ version: 1, fingerprint: eventReviewFingerprint(storageEvent) }));
    act(() => window.dispatchEvent(new StorageEvent("storage", { key })));
    expect(view.result.current.unreadCount).toBe(0); view.unmount();
  });
  it("keeps a session-only acknowledgment when storage fails and notifies for a later update", async () => {
    const memoryEvent = { ...event, createdByUserId: "org-memory" };
    vi.mocked(eventOverlayService.listEventOverlays).mockResolvedValue([memoryEvent]);
    const view = renderHook(() => useStudentOrgEventUpdates("org-memory", true));
    await waitFor(() => expect(view.result.current.unreadCount).toBe(1));
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    await act(async () => { expect(await view.result.current.markRead(memoryEvent)).toBe("memory"); });
    expect(view.result.current.unreadCount).toBe(0);
    vi.mocked(eventOverlayService.listEventOverlays).mockResolvedValue([{ ...memoryEvent, adminComment: "Later note" }]);
    await act(async () => { await view.result.current.refresh(); });
    expect(view.result.current.unreadCount).toBe(1); view.unmount();
  });
  it("ignores the previous account's late response after switching owners", async () => {
    let resolveOld!: (events: CampusEventOverlay[]) => void;
    vi.mocked(eventOverlayService.listEventOverlays).mockImplementation(({ createdByUserId } = {}) => createdByUserId === 'org-old'
      ? new Promise(resolve => { resolveOld = resolve; })
      : Promise.resolve([{ ...event, id: "new-owner", createdByUserId: "org-new" }]) as never);
    const view = renderHook(({ owner }) => useStudentOrgEventUpdates(owner, true), { initialProps: { owner: "org-old" } });
    await waitFor(() => expect(resolveOld).toBeTypeOf('function'));
    view.rerender({ owner: "org-new" });
    await waitFor(() => expect(view.result.current.events[0]?.id).toBe("new-owner"));
    await act(async () => resolveOld([{ ...event, createdByUserId: "org-old" }]));
    expect(view.result.current.events[0].id).toBe("new-owner"); view.unmount();
  });
  it("polls visible sessions without resetting an acknowledged update", async () => {
    vi.useFakeTimers();
    try {
      const view = renderHook(() => useStudentOrgEventUpdates("org-poll", true));
      vi.mocked(eventOverlayService.listEventOverlays).mockResolvedValue([{ ...event, createdByUserId: "org-poll" }]);
      await act(async () => { await view.result.current.refresh(); });
      expect(view.result.current.events).toHaveLength(1);
      await act(async () => { await view.result.current.markRead(view.result.current.events[0]); });
      const before = vi.mocked(eventOverlayService.listEventOverlays).mock.calls.length;
      await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
      expect(eventOverlayService.listEventOverlays).toHaveBeenCalledTimes(before + 1);
      expect(view.result.current.unreadCount).toBe(0); view.unmount();
    } finally { vi.useRealTimers(); }
  });
  it("shares one fetch and updates both subscribers after marking only one event read", async () => {
    const one = renderHook(() => useStudentOrgEventUpdates("org-hook", true));
    const two = renderHook(() => useStudentOrgEventUpdates("org-hook", true));
    await waitFor(() => expect(one.result.current.unreadCount).toBe(1));
    expect(eventOverlayService.listEventOverlays).toHaveBeenCalledTimes(1);
    await act(async () => { await one.result.current.markRead(event); });
    expect(one.result.current.unreadCount).toBe(0); expect(two.result.current.unreadCount).toBe(0);
    one.unmount(); two.unmount();
  });
  it("refreshes changed feedback on focus and does not acknowledge a newer version with an old card", async () => {
    const view = renderHook(() => useStudentOrgEventUpdates("org-hook", true));
    await waitFor(() => expect(view.result.current.unreadCount).toBe(1));
    await act(async () => { await view.result.current.markRead(event); });
    vi.mocked(eventOverlayService.listEventOverlays).mockResolvedValue([{ ...event, adminComment: "New feedback" }]);
    // Focus refresh is throttled for five seconds after the last automatic check.
    // Advance only the clock so this test remains deterministic and does not sleep.
    const currentTime = Date.now();
    const advancedClock = vi.spyOn(Date, "now").mockReturnValue(currentTime + 6000);
    act(() => window.dispatchEvent(new Event("focus")));
    advancedClock.mockRestore();
    await waitFor(() => expect(view.result.current.unreadCount).toBe(1));
    await act(async () => { expect(await view.result.current.markRead(event)).toBe("changed"); });
    expect(view.result.current.unreadCount).toBe(1); view.unmount();
  });
  it("filters foreign owners and disables fetches for non-org users", async () => {
    const disabled = renderHook(() => useStudentOrgEventUpdates("regular", false));
    expect(eventOverlayService.listEventOverlays).not.toHaveBeenCalled(); disabled.unmount();
    vi.mocked(eventOverlayService.listEventOverlays).mockResolvedValue([event, { ...event, id: "foreign", createdByUserId: "other" }]);
    const view = renderHook(() => useStudentOrgEventUpdates("org-hook", true));
    await waitFor(() => expect(view.result.current.events).toHaveLength(1));
    expect(view.result.current.events[0].id).toBe("one"); view.unmount();
  });
});
