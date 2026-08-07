import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabase } from "../../lib/supabase";
import { createAnnouncement, getPublishedAnnouncements, listAnnouncements } from "../announcementService";

vi.mock("../../lib/supabase", () => ({ getSupabase: vi.fn() }));

const row = {
  id: "a1",
  campus_id: "c1",
  title: "Enrollment Open",
  content: "Enrollment for the second semester is now open.",
  category: "academic",
  priority: "high",
  status: "published",
  starts_at: null,
  expires_at: null,
  created_by: "u1",
  created_at: "2026-08-07T00:00:00Z",
  updated_at: "2026-08-07T00:00:00Z",
  archived_at: null,
};

function chainedQuery(data: unknown, error: unknown = null) {
  const query: Record<string, unknown> = {};
  query.order = vi.fn(() => query);
  query.eq = vi.fn(() => query);
  query.is = vi.fn(() => query);
  query.or = vi.fn(() => query);
  query.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data, error }).then(resolve);
  return query;
}

describe("announcement service", () => {
  beforeEach(() => vi.clearAllMocks());

  it("maps published rows for the public reader", async () => {
    const query = chainedQuery([row]);
    vi.mocked(getSupabase).mockReturnValue({ from: vi.fn(() => ({ select: vi.fn(() => query) })) } as never);

    const items = await getPublishedAnnouncements();

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: "a1", title: "Enrollment Open", category: "academic", status: "published" });
  });

  it("falls back to curated mocks when the database returns an error", async () => {
    const query = chainedQuery(null, { message: "connection failed" });
    vi.mocked(getSupabase).mockReturnValue({ from: vi.fn(() => ({ select: vi.fn(() => query) })) } as never);

    const items = await getPublishedAnnouncements();

    expect(items.length).toBeGreaterThan(0);
    expect(items[0].status).toBe("published");
  });

  it("lists announcements for admin with case-insensitive search", async () => {
    const query = chainedQuery([row]);
    vi.mocked(getSupabase).mockReturnValue({ from: vi.fn(() => ({ select: vi.fn(() => query) })) } as never);

    const items = await listAnnouncements({ search: "ENROLLMENT" });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: "a1", status: "published", createdBy: "u1" });
  });

  it("creates an announcement under the default campus with an audit entry", async () => {
    const single = vi.fn().mockResolvedValue({ data: row, error: null });
    const insert = vi.fn(() => ({ select: vi.fn(() => ({ single })) }));
    const insertLog = vi.fn().mockResolvedValue({ error: null });
    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: "c1" }, error: null });
    const auth = { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }) };

    const from = vi.fn((table: string) => {
      if (table === "campuses")
        return { select: vi.fn(() => ({ eq: vi.fn(() => ({ is: vi.fn(() => ({ maybeSingle })) })) })) };
      if (table === "activity_logs") return { insert: insertLog };
      return { insert };
    });

    vi.mocked(getSupabase).mockReturnValue({ from, auth } as never);

    const created = await createAnnouncement({
      title: "Enrollment Open",
      content: "Enrollment for the second semester is now open.",
      category: "academic",
      priority: "high",
      status: "published",
    });

    expect(created).toMatchObject({ id: "a1" });
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Enrollment Open", campus_id: "c1", created_by: "u1", status: "published" })
    );
    expect(insertLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "announcement.publish", entity_id: "a1" })
    );
  });
});
