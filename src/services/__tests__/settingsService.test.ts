import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabase } from "../../lib/supabase";
import { getSettings, upsertSettings, DEFAULT_SETTINGS } from "../settingsService";

vi.mock("../../lib/supabase", () => ({ getSupabase: vi.fn() }));

describe("settings service (system_settings persistence)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("merges database values over built-in defaults", async () => {
    const query: Record<string, unknown> = {};
    query.is = vi.fn(() => query);
    query.order = vi.fn(() => query);
    query.then = (resolve: (value: unknown) => unknown) =>
      Promise.resolve({
        data: [{ key: "site_name", value: "PLV NaviSync Test" }],
        error: null,
      }).then(resolve);

    vi.mocked(getSupabase).mockReturnValue({
      from: vi.fn(() => ({ select: vi.fn(() => query) })),
    } as never);

    const settings = await getSettings();

    expect(settings.site_name).toBe("PLV NaviSync Test");
    // Untouched keys fall back to defaults.
    expect(settings.contact_email).toBe(DEFAULT_SETTINGS.contact_email);
  });

  it("creates new rows for missing keys and writes an audit entry", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const update = vi.fn().mockResolvedValue({ error: null });
    const insert = vi.fn().mockResolvedValue({ error: null });
    const insertLog = vi.fn().mockResolvedValue({ error: null });
    const auth = { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "admin-1" } } }) };

    const from = vi.fn((table: string) => {
      if (table === "system_settings") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({ is: vi.fn(() => ({ maybeSingle })) })),
          })),
          update,
          insert,
        };
      }
      return { insert: insertLog };
    });

    vi.mocked(getSupabase).mockReturnValue({ from, auth } as never);

    await upsertSettings([{ key: "site_name", value: "PLV NaviSync 2", isPublic: true }]);

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "site_name",
        value: "PLV NaviSync 2",
        campus_id: null,
        is_public: true,
        updated_by: "admin-1",
      })
    );
    expect(update).not.toHaveBeenCalled();
    expect(insertLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "settings.update", entity_type: "settings" })
    );
  });

  it("updates an existing row instead of inserting a duplicate", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: "s1" }, error: null });
    // update() is chained with .eq(id) in the service, so it must return a thenable query.
    const updateEq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn(() => ({ eq: updateEq }));
    const insert = vi.fn().mockResolvedValue({ error: null });
    const insertLog = vi.fn().mockResolvedValue({ error: null });
    const auth = { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "admin-1" } } }) };

    const from = vi.fn((table: string) => {
      if (table === "system_settings") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({ is: vi.fn(() => ({ maybeSingle })) })),
          })),
          update,
          insert,
        };
      }
      return { insert: insertLog };
    });

    vi.mocked(getSupabase).mockReturnValue({ from, auth } as never);

    await upsertSettings([{ key: "default_zoom", value: "17" }]);

    expect(update).toHaveBeenCalledWith(expect.objectContaining({ key: "default_zoom", value: "17" }));
    expect(updateEq).toHaveBeenCalledWith("id", "s1");
    expect(insert).not.toHaveBeenCalled();
  });
});
