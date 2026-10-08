import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eventOverlayService } from "../../services/eventOverlayService";
import { eventPreviewFixture } from "../../test/eventFullPackFixtures";
import { useEventMapPreviews } from "../useEventMapPreviews";
import { visibleEventCards } from "../../lib/eventMapView";

vi.mock("../../services/eventOverlayService", () => ({ eventOverlayService: { listPublishedEventPreviews: vi.fn() } }));

describe("useEventMapPreviews", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-08T02:00:00Z")); });
  afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

  it("reveals a scheduled event in Upcoming at the server publication boundary despite a different browser clock", async () => {
    vi.mocked(eventOverlayService.listPublishedEventPreviews)
      .mockResolvedValueOnce({ serverNow: "2026-10-05T00:59:59.999Z", events: [] })
      .mockResolvedValueOnce({ serverNow: "2026-10-05T01:00:00.000Z", events: [eventPreviewFixture()] });
    const { result } = renderHook(() => useEventMapPreviews({ campusId: "campus-a", enabled: true, open: true, identityKey: "student" }));
    await act(async () => { await Promise.resolve(); });
    expect(visibleEventCards(result.current.events, result.current.nowMs, "upcoming")).toHaveLength(0);
    await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
    expect(visibleEventCards(result.current.events, result.current.nowMs, "upcoming").map(event => event.id)).toEqual(["event-a"]);
    expect(visibleEventCards(result.current.events, result.current.nowMs, "ongoing")).toHaveLength(0);
  });

  it("fetches only while open, polls empty feeds, and refreshes on focus/visibility", async () => {
    vi.mocked(eventOverlayService.listPublishedEventPreviews).mockResolvedValue({ serverNow: "2026-10-08T02:00:00.000Z", events: [] });
    const { result, rerender, unmount } = renderHook((props) => useEventMapPreviews(props), { initialProps: { campusId: "campus-a", enabled: true, open: false, identityKey: "guest" } });
    expect(eventOverlayService.listPublishedEventPreviews).not.toHaveBeenCalled();
    rerender({ campusId: "campus-a", enabled: true, open: true, identityKey: "guest" });
    await act(async () => { await Promise.resolve(); });
    expect(eventOverlayService.listPublishedEventPreviews).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(eventOverlayService.listPublishedEventPreviews).toHaveBeenCalledTimes(2);
    await act(async () => { window.dispatchEvent(new Event("focus")); document.dispatchEvent(new Event("visibilitychange")); await Promise.resolve(); });
    expect(eventOverlayService.listPublishedEventPreviews).toHaveBeenCalledTimes(4);
    unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(eventOverlayService.listPublishedEventPreviews).toHaveBeenCalledTimes(4);
  });

  it("uses server time offset and rejects an older campus response", async () => {
    let resolveA: ((value: { serverNow: string; events: ReturnType<typeof eventPreviewFixture>[] }) => void) | undefined;
    vi.mocked(eventOverlayService.listPublishedEventPreviews).mockImplementation((campusId) => campusId === "campus-a"
      ? new Promise((resolve) => { resolveA = resolve; })
      : Promise.resolve({ serverNow: "2026-10-08T04:00:00.000Z", events: [eventPreviewFixture()] }));
    const { result, rerender } = renderHook((props) => useEventMapPreviews(props), { initialProps: { campusId: "campus-a", enabled: true, open: true, identityKey: "org-a" } });
    await act(async () => { await Promise.resolve(); });
    rerender({ campusId: "campus-b", enabled: true, open: true, identityKey: "org-a" });
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
    const { result } = renderHook(() => useEventMapPreviews({ campusId: "campus-a", enabled: true, open: true, identityKey: "student" }));
    await act(async () => { await Promise.resolve(); });
    expect(result.current.events).toHaveLength(1);
    await act(async () => { await result.current.refresh(); });
    expect(result.current.events).toHaveLength(1);
    expect(result.current.error).toBe("Feed unavailable");
  });

  it("moves Upcoming to Ongoing then hides an ended event without reload", async () => {
    const event = eventPreviewFixture({ dateStart: '2026-10-08T02:00:01.000Z', dateEnd: '2026-10-08T02:00:02.000Z' });
    vi.mocked(eventOverlayService.listPublishedEventPreviews).mockResolvedValue({serverNow:'2026-10-08T02:00:00.000Z',events:[event]});
    const view=renderHook(()=>useEventMapPreviews({campusId:'campus-clock',enabled:true,open:true,identityKey:'student'}));
    await act(async()=>{});
    expect(visibleEventCards(view.result.current.events,view.result.current.nowMs,'upcoming')).toHaveLength(1);
    await act(async()=>{await vi.advanceTimersByTimeAsync(1000);});
    expect(visibleEventCards(view.result.current.events,view.result.current.nowMs,'ongoing')).toHaveLength(1);
    await act(async()=>{await vi.advanceTimersByTimeAsync(1000);});
    expect(visibleEventCards(view.result.current.events,view.result.current.nowMs,'all')).toHaveLength(0);
  });
});
