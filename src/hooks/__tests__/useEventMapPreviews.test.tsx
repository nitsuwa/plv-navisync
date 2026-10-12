import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eventOverlayService } from "../../services/eventOverlayService";
import { eventPreviewFixture } from "../../test/eventFullPackFixtures";
import { useEventMapPreviews } from "../useEventMapPreviews";
import { usePublishedEventPreviews } from "../usePublishedEventPreviews";
import { visibleEventCards } from "../../lib/eventMapView";

vi.mock("../../services/eventOverlayService", () => ({ eventOverlayService: { listPublishedEventPreviews: vi.fn() } }));
const initialVisibilityState = document.visibilityState;

describe("useEventMapPreviews", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-08T02:00:00Z"));
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  });
  afterEach(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: initialVisibilityState });
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("reveals a scheduled event in Upcoming at the server publication boundary despite a different browser clock", async () => {
    vi.mocked(eventOverlayService.listPublishedEventPreviews)
      .mockResolvedValueOnce({ serverNow: "2026-10-05T00:59:59.999Z", events: [] })
      .mockResolvedValue({ serverNow: "2026-10-05T01:00:00.000Z", events: [eventPreviewFixture()] });
    const { result } = renderHook(() => useEventMapPreviews({ campusId: "campus-scheduled-clock", enabled: true, open: true, identityKey: "student" }));
    await act(async () => { await Promise.resolve(); });
    expect(visibleEventCards(result.current.events, result.current.nowMs, "upcoming")).toHaveLength(0);
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(visibleEventCards(result.current.events, result.current.nowMs, "upcoming").map(event => event.id)).toEqual(["event-a"]);
    expect(visibleEventCards(result.current.events, result.current.nowMs, "ongoing")).toHaveLength(0);
  });

  it("fetches only while open, polls empty feeds, and refreshes on focus/visibility", async () => {
    vi.mocked(eventOverlayService.listPublishedEventPreviews).mockResolvedValue({ serverNow: "2026-10-08T02:00:00.000Z", events: [] });
    const { result, rerender, unmount } = renderHook((props) => useEventMapPreviews(props), { initialProps: { campusId: "campus-polling", enabled: true, open: false, identityKey: "guest" } });
    expect(eventOverlayService.listPublishedEventPreviews).not.toHaveBeenCalled();
    rerender({ campusId: "campus-polling", enabled: true, open: true, identityKey: "guest" });
    await act(async () => { await Promise.resolve(); });
    expect(eventOverlayService.listPublishedEventPreviews).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(eventOverlayService.listPublishedEventPreviews).toHaveBeenCalledTimes(1);
    await act(async () => { window.dispatchEvent(new Event("focus")); document.dispatchEvent(new Event("visibilitychange")); await Promise.resolve(); });
    expect(eventOverlayService.listPublishedEventPreviews).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(eventOverlayService.listPublishedEventPreviews).toHaveBeenCalledTimes(2);
    await act(async () => { window.dispatchEvent(new Event("focus")); document.dispatchEvent(new Event("visibilitychange")); await Promise.resolve(); });
    expect(eventOverlayService.listPublishedEventPreviews).toHaveBeenCalledTimes(2);
    unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(eventOverlayService.listPublishedEventPreviews).toHaveBeenCalledTimes(2);
  });

  it("shares one polling stream across Event Map and notification consumers for three intervals", async () => {
    vi.mocked(eventOverlayService.listPublishedEventPreviews).mockResolvedValue({ serverNow: "2026-10-08T02:00:00.000Z", events: [] });
    const mapFeed = renderHook(() => useEventMapPreviews({ campusId: "campus-shared", enabled: true, open: true }));
    const notificationFeed = renderHook(() => usePublishedEventPreviews({ campusId: "campus-shared", enabled: true }));
    await act(async () => { await Promise.resolve(); });
    expect(eventOverlayService.listPublishedEventPreviews).toHaveBeenCalledTimes(1);

    mapFeed.unmount();
    notificationFeed.unmount();
    const reopenedEventMap = renderHook(() => useEventMapPreviews({ campusId: "campus-shared", enabled: true, open: true }));
    const reopenedBell = renderHook(() => usePublishedEventPreviews({ campusId: "campus-shared", enabled: true }));
    await act(async () => { await Promise.resolve(); });
    expect(eventOverlayService.listPublishedEventPreviews).toHaveBeenCalledTimes(1);

    await act(async () => { await vi.advanceTimersByTimeAsync(180_000); });
    expect(eventOverlayService.listPublishedEventPreviews).toHaveBeenCalledTimes(4);
    reopenedEventMap.unmount();
    reopenedBell.unmount();
  });

  it("retains the last successful feed and backs off one shared failure across focus consumers", async () => {
    vi.mocked(eventOverlayService.listPublishedEventPreviews)
      .mockResolvedValueOnce({ serverNow: "2026-10-08T02:00:00.000Z", events: [eventPreviewFixture()] })
      .mockRejectedValueOnce(new Error("Feed unavailable"))
      .mockResolvedValue({ serverNow: "2026-10-08T02:00:30.000Z", events: [] });
    const first = renderHook(() => usePublishedEventPreviews({ campusId: "campus-backoff", enabled: true }));
    const second = renderHook(() => usePublishedEventPreviews({ campusId: "campus-backoff", enabled: true }));
    await act(async () => { await Promise.resolve(); });
    expect(first.result.current.events).toHaveLength(1);
    expect(eventOverlayService.listPublishedEventPreviews).toHaveBeenCalledTimes(1);

    await act(async () => { await first.result.current.refresh(); });
    expect(first.result.current.events).toHaveLength(1);
    expect(first.result.current.error).toBe("Feed unavailable");
    expect(eventOverlayService.listPublishedEventPreviews).toHaveBeenCalledTimes(2);
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
      await Promise.resolve();
    });
    await act(async () => { await first.result.current.refresh(); });
    expect(eventOverlayService.listPublishedEventPreviews).toHaveBeenCalledTimes(2);

    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(eventOverlayService.listPublishedEventPreviews).toHaveBeenCalledTimes(3);
    first.unmount();
    second.unmount();
  });

  it("uses server time offset and rejects an older campus response", async () => {
    let resolveA: ((value: { serverNow: string; events: ReturnType<typeof eventPreviewFixture>[] }) => void) | undefined;
    vi.mocked(eventOverlayService.listPublishedEventPreviews).mockImplementation((campusId) => campusId === "campus-switch-a"
      ? new Promise((resolve) => { resolveA = resolve; })
      : Promise.resolve({ serverNow: "2026-10-08T04:00:00.000Z", events: [eventPreviewFixture()] }));
    const { result, rerender } = renderHook((props) => useEventMapPreviews(props), { initialProps: { campusId: "campus-switch-a", enabled: true, open: true, identityKey: "org-a" } });
    await act(async () => { await Promise.resolve(); });
    rerender({ campusId: "campus-switch-b", enabled: true, open: true, identityKey: "org-a" });
    await act(async () => { await Promise.resolve(); });
    expect(eventOverlayService.listPublishedEventPreviews).toHaveBeenCalledTimes(2);
    expect(result.current.events).toHaveLength(1);
    expect(result.current.nowMs).toBeGreaterThanOrEqual(Date.parse("2026-10-08T04:00:00.000Z"));
    await act(async () => { resolveA?.({ serverNow: "2026-10-08T02:00:00.000Z", events: [] }); });
    expect(result.current.events).toHaveLength(1);
  });

  it("retains cached cards with an explicit error when background refresh fails", async () => {
    vi.mocked(eventOverlayService.listPublishedEventPreviews)
      .mockResolvedValueOnce({ serverNow: "2026-10-08T02:00:00.000Z", events: [eventPreviewFixture()] })
      .mockRejectedValueOnce(new Error("Feed unavailable"));
    const { result } = renderHook(() => useEventMapPreviews({ campusId: "campus-background-failure", enabled: true, open: true, identityKey: "student" }));
    await act(async () => { await Promise.resolve(); });
    expect(result.current.events).toHaveLength(1);
    await act(async () => { await result.current.refresh(); });
    expect(result.current.events).toHaveLength(1);
    expect(result.current.error).toBe("Feed unavailable");
  });

  it("moves Upcoming to Ongoing then hides an ended event without reload", async () => {
    const event = eventPreviewFixture({ dateStart: '2026-10-08T02:00:01.000Z', dateEnd: '2026-10-08T02:00:02.000Z' });
    vi.mocked(eventOverlayService.listPublishedEventPreviews).mockResolvedValue({serverNow:'2026-10-08T02:00:00.000Z',events:[event]});
    const view=renderHook(()=>useEventMapPreviews({campusId:'campus-event-clock',enabled:true,open:true,identityKey:'student'}));
    await act(async()=>{});
    expect(visibleEventCards(view.result.current.events,view.result.current.nowMs,'upcoming')).toHaveLength(1);
    await act(async()=>{await vi.advanceTimersByTimeAsync(1000);});
    expect(visibleEventCards(view.result.current.events,view.result.current.nowMs,'ongoing')).toHaveLength(1);
    await act(async()=>{await vi.advanceTimersByTimeAsync(1000);});
    expect(visibleEventCards(view.result.current.events,view.result.current.nowMs,'all')).toHaveLength(0);
  });
});
