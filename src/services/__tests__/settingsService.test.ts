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

  it("saves a settings batch through the atomic audited RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 1, error: null });
    vi.mocked(getSupabase).mockReturnValue({ rpc } as never);

    await upsertSettings([{ key: "site_name", value: "PLV NaviSync 2", isPublic: true }]);

    expect(rpc).toHaveBeenCalledWith("upsert_system_settings", { p_entries: [
      { key: "site_name", value: "PLV NaviSync 2", is_public: true },
    ] });
  });

  it("surfaces an RPC error without partial client-side writes", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "administrator access required" } });
    vi.mocked(getSupabase).mockReturnValue({ rpc } as never);

    await expect(upsertSettings([{ key: "default_zoom", value: "17" }])).rejects.toMatchObject({ message: "administrator access required" });

    expect(rpc).toHaveBeenCalledOnce();
  });
});
