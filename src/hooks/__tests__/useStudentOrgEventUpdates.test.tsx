import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useStudentOrgEventUpdates } from "../useStudentOrgEventUpdates";
import { eventOverlayService } from "../../services/eventOverlayService";
import type { CampusEventOverlay } from "../../components/map-builder/types";
import { eventReviewFingerprint, eventReviewSeenPrefix } from "../../lib/studentEventUpdates";
import { eventNotificationService, EventNotificationSyncUnavailable } from '../../services/eventNotificationService';
vi.mock('../../services/eventNotificationService',async(importOriginal)=>({...await importOriginal<typeof import('../../services/eventNotificationService')>(),eventNotificationService:{getStates:vi.fn(),acknowledge:vi.fn()}}));
vi.mock("../../services/eventOverlayService", () => ({ eventOverlayService: { listEventOverlays: vi.fn() } }));
const event = { id: "one", createdByUserId: "org-hook", title: "Fair", status: "approved", submittedAt: "2026-10-06T00:00:00Z" } as CampusEventOverlay;
beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); vi.mocked(eventOverlayService.listEventOverlays).mockResolvedValue([event]); vi.mocked(eventNotificationService.getStates).mockRejectedValue(new EventNotificationSyncUnavailable('Browser only')); vi.mocked(eventNotificationService.acknowledge).mockRejectedValue(new EventNotificationSyncUnavailable('Browser only')); });
afterEach(() => vi.restoreAllMocks());
describe("shared Student Org review updates", () => {
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
    vi.mocked(eventOverlayService.listEventOverlays).mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve; })).mockResolvedValueOnce([{ ...event, id: "new-owner", createdByUserId: "org-new" }]);
    const view = renderHook(({ owner }) => useStudentOrgEventUpdates(owner, true), { initialProps: { owner: "org-old" } });
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
      await act(async () => { await view.result.current.markRead(view.result.current.events[0]); });
      const before = vi.mocked(eventOverlayService.listEventOverlays).mock.calls.length;
      await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
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
    act(() => window.dispatchEvent(new Event("focus")));
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
