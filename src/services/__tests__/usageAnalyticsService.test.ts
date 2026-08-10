import { beforeEach, describe, expect, it, vi } from "vitest";
import { trackUsage, getUsageAnalytics } from "../usageAnalyticsService";

describe("usageAnalyticsService", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useRealTimers();
  });

  it("tracks and aggregates page views and routes", () => {
    const now = new Date("2026-08-10T10:00:00");
    vi.useFakeTimers();
    vi.setSystemTime(now);

    trackUsage("page_view", "map");
    trackUsage("page_view", "directory");
    trackUsage("route", "CABA → COED");
    trackUsage("search", "gym");

    const a = getUsageAnalytics(7);
    expect(a.totalViews).toBe(2);
    expect(a.totalRoutes).toBe(1);
    expect(a.totalSearches).toBe(1);
    expect(a.topRoutes[0]).toEqual({ term: "CABA → COED", count: 1 });
    expect(a.topSearches[0]).toEqual({ term: "gym", count: 1 });
  });

  it("coalesces rapid duplicate events", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-10T10:00:00"));
    trackUsage("route", "A → B");
    trackUsage("route", "A → B"); // same detail within 30s
    expect(getUsageAnalytics(7).totalRoutes).toBe(1);
  });

  it("does not count events older than the window", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-10T10:00:00"));
    trackUsage("page_view", "map");
    vi.setSystemTime(new Date("2026-08-25T10:00:00")); // 15 days later
    const a = getUsageAnalytics(7);
    expect(a.totalViews).toBe(0);
  });

  it("fills the full day axis so the chart has no gaps", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-10T10:00:00"));
    trackUsage("page_view", "map");
    const a = getUsageAnalytics(7);
    expect(a.byDay).toHaveLength(7);
  });

  it("never throws when localStorage is unavailable", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => {
      trackUsage("page_view", "map");
      getUsageAnalytics(7);
    }).not.toThrow();
    spy.mockRestore();
  });
});
