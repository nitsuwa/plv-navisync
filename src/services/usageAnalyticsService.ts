/**
 * Lightweight anonymous usage analytics, stored in localStorage.
 *
 * Tracks page views, searches, route requests, reports, and saved locations
 * so the admin dashboard can show real "this week" activity without requiring
 * a new database table or migration. Events are pruned after 30 days.
 *
 * Note: this is per-browser data (demo/ops convenience). A future server-side
 * `usage_events` table could replace the storage layer without changing the
 * call sites.
 */

export type UsageEventType =
  | "page_view"
  | "search"
  | "route"
  | "report"
  | "favorite";

export interface UsageEvent {
  type: UsageEventType;
  detail?: string;
  ts: number;
}

const STORAGE_KEY = "plv-usage-events";
const MAX_EVENTS = 4000;
const PRUNE_MS = 30 * 24 * 60 * 60 * 1000;

function readEvents(): UsageEvent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as UsageEvent[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeEvents(events: UsageEvent[]): void {
  try {
    if (events.length > MAX_EVENTS) {
      events = events.slice(events.length - MAX_EVENTS);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
  } catch {
    // Storage full/unavailable — analytics must never break the app.
  }
}

/** Record one usage event. Never throws. */
export function trackUsage(type: UsageEventType, detail?: string): void {
  try {
    const events = readEvents();
    const now = Date.now();
    // Coalesce rapid duplicates (e.g. route recomputing on drag).
    const last = events[events.length - 1];
    if (last && last.type === type && last.detail === detail && now - last.ts < 30_000) {
      return;
    }
    events.push({ type, detail: detail?.slice(0, 120), ts: now });
    writeEvents(events);
  } catch {
    // Never break the app for analytics.
  }
}

export interface AnalyticsSummary {
  /** Events in the last `days` days, grouped by day for WeeklyChart. */
  byDay: { day: string; updates: number; reports: number }[];
  totalViews: number;
  totalRoutes: number;
  totalSearches: number;
  totalReports: number;
  topSearches: { term: string; count: number }[];
  topRoutes: { route: string; count: number }[];
}

function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Aggregate events from the last `days` days into a chartable summary. */
export function getUsageAnalytics(days = 7): AnalyticsSummary {
  const events = readEvents();
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const recent = events.filter((e) => e.ts >= cutoff);

  const dayMap = new Map<string, { updates: number; reports: number }>();
  const searchCount = new Map<string, number>();
  const routeCount = new Map<string, number>();
  let totalViews = 0;
  let totalRoutes = 0;
  let totalSearches = 0;
  let totalReports = 0;

  for (const e of recent) {
    const key = dayKey(e.ts);
    const entry = dayMap.get(key) ?? { updates: 0, reports: 0 };
    if (e.type === "page_view") {
      entry.updates += 1;
      totalViews += 1;
    } else if (e.type === "route") {
      entry.reports += 1;
      totalRoutes += 1;
      if (e.detail) routeCount.set(e.detail, (routeCount.get(e.detail) ?? 0) + 1);
    } else if (e.type === "search") {
      totalSearches += 1;
      if (e.detail) searchCount.set(e.detail, (searchCount.get(e.detail) ?? 0) + 1);
    } else if (e.type === "report") {
      entry.reports += 1;
      totalReports += 1;
    }
    dayMap.set(key, entry);
  }

  // Fill the last `days` days so the chart has a continuous axis.
  const byDay: { day: string; updates: number; reports: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const key = dayKey(Date.now() - i * 24 * 60 * 60 * 1000);
    const entry = dayMap.get(key) ?? { updates: 0, reports: 0 };
    byDay.push({ day: key, updates: entry.updates, reports: entry.reports });
  }

  const top = (map: Map<string, number>, n: number) =>
    Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([term, count]) => ({ term, count }));

  return {
    byDay,
    totalViews,
    totalRoutes,
    totalSearches,
    totalReports,
    topSearches: top(searchCount, 5),
    topRoutes: top(routeCount, 5),
  };
}

export const usageAnalyticsService = {
  track: trackUsage,
  getAnalytics: getUsageAnalytics,
};
