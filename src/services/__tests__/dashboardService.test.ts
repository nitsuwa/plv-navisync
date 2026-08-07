import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabase } from "../../lib/supabase";
import { getDashboardStats, getRecentActivity } from "../dashboardService";

vi.mock("../../lib/supabase", () => ({ getSupabase: vi.fn() }));

/** Chainable, thenable query mock for exact-count queries (select + is/in/eq). */
function countQuery(count: number) {
  const q: Record<string, unknown> = {};
  q.in = vi.fn(() => q);
  q.is = vi.fn(() => q);
  q.eq = vi.fn(() => q);
  q.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve({ count, error: null }).then(resolve);
  return q;
}

/** Chainable, thenable query mock for list queries (order + filters + limit). */
function listQuery(rows: unknown[]) {
  const q: Record<string, unknown> = {};
  q.order = vi.fn(() => q);
  q.eq = vi.fn(() => q);
  q.gte = vi.fn(() => q);
  q.lte = vi.fn(() => q);
  q.limit = vi.fn(() => q);
  q.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve({ data: rows, error: null }).then(resolve);
  return q;
}

/** Query mock that resolves a select with .in (used for actor lookups). */
function inQuery(rows: unknown[]) {
  const q: Record<string, unknown> = {};
  q.in = vi.fn(() => q);
  q.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve({ data: rows, error: null }).then(resolve);
  return q;
}

function dayOffset(days: number): string {
  const d = new Date(Date.now() - days * 86400000);
  return d.toISOString().slice(0, 10);
}

describe("dashboard service", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns honest zeros on an empty database", async () => {
    const from = vi.fn((table: string) =>
      table === "activity_logs"
        ? { select: vi.fn(() => listQuery([])) }
        : { select: vi.fn(() => countQuery(0)) }
    );
    vi.mocked(getSupabase).mockReturnValue({ from } as never);

    const stats = await getDashboardStats();

    expect(stats.buildings).toBe(0);
    expect(stats.rooms).toBe(0);
    expect(stats.activeEdges).toBe(0);
    expect(stats.accessibleEdges).toBe(0);
    expect(stats.pendingReports).toBe(0);
    expect(stats.publishedEvents).toBe(0);
    expect(stats.activeStudents).toBe(0);
    expect(stats.weeklyActivity).toHaveLength(7);
    expect(stats.weeklyActivity.every((d) => d.count === 0)).toBe(true);
  });

  it("reads live counts and aggregates the last 7 days of activity", async () => {
    const counts: Record<string, number> = {
      buildings: 4,
      map_elements: 9,
      navigation_edges: 12,
      reports: 2,
      events: 1,
      profiles: 3,
    };
    const from = vi.fn((table: string) => {
      if (table === "activity_logs") {
        return {
          select: vi.fn(() =>
            listQuery([
              { id: "l1", created_at: `${dayOffset(0)}T10:00:00Z` },
              { id: "l2", created_at: `${dayOffset(0)}T11:00:00Z` },
              { id: "l3", created_at: `${dayOffset(1)}T09:00:00Z` },
              // Outside the 7-day window — must be ignored.
              { id: "l4", created_at: `${dayOffset(10)}T09:00:00Z` },
            ])
          ),
        };
      }
      return { select: vi.fn(() => countQuery(counts[table] ?? 0)) };
    });
    vi.mocked(getSupabase).mockReturnValue({ from } as never);

    const stats = await getDashboardStats();

    expect(stats.buildings).toBe(4);
    expect(stats.rooms).toBe(9);
    expect(stats.activeEdges).toBe(12);
    expect(stats.pendingReports).toBe(2);
    expect(stats.publishedEvents).toBe(1);
    expect(stats.activeStudents).toBe(3);
    const today = stats.weeklyActivity.find((d) => d.day === dayOffset(0));
    const yesterday = stats.weeklyActivity.find((d) => d.day === dayOffset(1));
    expect(today?.count).toBe(2);
    expect(yesterday?.count).toBe(1);
    expect(stats.weeklyActivity.reduce((sum, d) => sum + d.count, 0)).toBe(3);
  });

  it("resolves actor display names for recent activity", async () => {
    const from = vi.fn((table: string) => {
      if (table === "activity_logs") {
        return {
          select: vi.fn(() =>
            listQuery([
              {
                id: "l1",
                action: "report.resolved",
                entity_type: "report",
                actor_id: "u1",
                created_at: `${dayOffset(0)}T10:00:00Z`,
                entity_id: null,
                campus_id: null,
                metadata: null,
              },
            ])
          ),
        };
      }
      return {
        select: vi.fn(() =>
          inQuery([{ id: "u1", first_name: "Maria", last_name: "Santos" }])
        ),
      };
    });
    vi.mocked(getSupabase).mockReturnValue({ from } as never);

    const items = await getRecentActivity(1);

    expect(items).toHaveLength(1);
    expect(items[0].actorName).toBe("Maria Santos");
    expect(items[0].action).toBe("report.resolved");
  });
});
